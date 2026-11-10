import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "./database.js";
import { users, verification_codes, user_profiles } from "../src/platform/db/schema.js";
import { createAuthModule } from "../src/modules/auth/index.js";
import { authEndpoints } from "../src/modules/auth/http/endpoints.js";
import type { EndpointInput } from "../src/endpoint.js";

const { db: database, dispose } = await createTestDatabase();
const sent: { contact: string; code: string; purpose: string }[] = [];
const auth = createAuthModule(database, {
  jwtSecret: "auth-tests-secret-at-least-thirty-two-characters",
  sender: {
    async sendVerificationCode(contact, code, purpose) {
      sent.push({ contact, code, purpose });
    },
  },
  codeSendMinIntervalSeconds: 0,
  codeSendMaxPerContactHour: 100,
  codeSendMaxPerContactDay: 200,
  codeSendMaxPerIpHour: 500,
});
const endpoints = new Map(
  authEndpoints(auth.application).map((endpoint) => [endpoint.route.operationId!, endpoint]),
);
const prefix = `auth-${Date.now()}`;
const ids: string[] = [];
const invoke = async (
  name: string,
  body: unknown = {},
  principal: EndpointInput["principal"] = null,
) =>
  endpoints.get(name)!.handler({
    body,
    principal,
    query: {},
    params: {},
    ip: "127.0.0.1",
    headers: new Headers(),
  });
const latest = (contact: string, purpose: string) =>
  sent.filter((value) => value.contact === contact && value.purpose === purpose).at(-1)!.code;
async function register(suffix: string) {
  const email = `${prefix}-${suffix}@example.com`;
  const registration = (await invoke("auth_register", {
    email,
    full_name: "Test Person",
    role: "client",
    personal_data_consent: true,
  })) as { registration_token: string };
  const row = (await database.select().from(users).where(eq(users.email, email)))[0]!;
  ids.push(row.id);
  return { email, row, registration };
}
describe("auth PostgreSQL flows", () => {
  beforeAll(async () => {
    await database.select().from(users).limit(1);
  });
  afterAll(async () => {
    for (const id of ids) await database.delete(users).where(eq(users.id, id));
    await dispose();
  });
  it("normalizes registration, consumes codes once, rotates and revokes refresh sessions", async () => {
    const { email, row } = await register("code");
    const result = (await invoke("auth_register_verify", {
      email: email.toUpperCase(),
      code: latest(email, "register"),
    })) as {
      tokens: { access_token: string; refresh_token: string };
      user: { email_verified: boolean; has_password: boolean };
    };
    expect(result.user.email_verified).toBe(true);
    expect(result.user.has_password).toBe(false);
    expect(await auth.authenticate(result.tokens.access_token)).toEqual({
      id: row.id,
      role: "client",
    });
    await expect(
      invoke("auth_register_verify", {
        email,
        code: latest(email, "register"),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    const pair = (await invoke("auth_refresh", {
      refresh_token: result.tokens.refresh_token,
    })) as { refresh_token: string };
    await expect(
      invoke("auth_refresh", { refresh_token: result.tokens.refresh_token }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await invoke("auth_logout", { refresh_token: pair.refresh_token });
    await expect(
      invoke("auth_refresh", { refresh_token: pair.refresh_token }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
  it("rotates only e2e fixed codes per contact and purpose and rejects the old code", async () => {
    const email = `${prefix}-rotating@example.com`;
    const rotatingSent: { contact: string; code: string; purpose: string }[] = [];
    let now = new Date();
    const rotatingConfig = {
      jwtSecret: "auth-tests-secret-at-least-thirty-two-characters",
      devVerificationCode: "000000",
      rotateDevVerificationCode: true,
      now: () => now,
      sender: {
        async sendVerificationCode(contact: string, code: string, purpose: string) {
          rotatingSent.push({ contact, code, purpose });
        },
      },
      codeSendMinIntervalSeconds: 0,
    } as const;
    const firstProcess = createAuthModule(database, rotatingConfig).application;
    await firstProcess.register(
      { email, full_name: "Rotating Code", role: "client", personal_data_consent: true },
      null,
    );
    expect(rotatingSent.at(-1)?.code).toBe("000000");

    // A new application instance reads the sequence from the shared repository,
    // not from process memory. This is what makes a backend restart safe.
    now = new Date(now.getTime() + 1_000);
    const secondProcess = createAuthModule(database, rotatingConfig).application;
    await secondProcess.resendCode({ contact: email, purpose: "register" }, null);
    expect(rotatingSent.at(-1)?.code).toBe("000001");
    await expect(secondProcess.registerVerify({ email, code: "000000" })).rejects.toMatchObject({
      code: "validation_error",
    });
    const verified = await secondProcess.registerVerify({ email, code: "000001" });
    ids.push(verified.user.id);
    await secondProcess.loginRequestCode({ contact: email }, null);
    expect(rotatingSent.at(-1)).toMatchObject({ contact: email, purpose: "login", code: "000000" });
  });
  it("persists wrong-code attempts and locks out further guesses", async () => {
    const { email } = await register("attempts");
    const valid = latest(email, "register");
    const wrong = valid === "000000" ? "111111" : "000000";
    for (let n = 0; n < 5; n++)
      await expect(invoke("auth_register_verify", { email, code: wrong })).rejects.toMatchObject({
        code: "validation_error",
      });
    const code = (
      await database.select().from(verification_codes).where(eq(verification_codes.contact, email))
    )[0]!;
    expect(code.attempts).toBe(5);
    await expect(invoke("auth_register_verify", { email, code: valid })).rejects.toThrow(
      "Too many attempts",
    );
  });
  it("requires the correct password and both factors and prevents stale code login after method change", async () => {
    const { email, row, registration } = await register("password");
    const first = (await invoke("auth_set_password", {
      registration_token: registration.registration_token,
      password: "StrongPass1",
    })) as { tokens: { refresh_token: string } };
    await expect(invoke("auth_login", { contact: email, password: "wrong" })).rejects.toMatchObject(
      { code: "unauthorized" },
    );
    await invoke("auth_login", {
      contact: email.toUpperCase(),
      password: "StrongPass1",
    });
    const principal = { id: row.id, role: "client" as const };
    await invoke("users_contact_verify_request", { type: "email" }, principal);
    await invoke(
      "users_contact_verify_confirm",
      { type: "email", code: latest(email, "verify_email") },
      principal,
    );
    await invoke("users_login_method_request_code", {}, principal);
    await invoke(
      "users_set_login_method",
      { method: "two_factor", code: latest(email, "change_login_method") },
      principal,
    );
    await expect(
      invoke("auth_login", { contact: email, password: "StrongPass1" }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await invoke("auth_login_request_code", { contact: email });
    const challenge = (await invoke("auth_login_verify_code", {
      contact: email,
      code: latest(email, "login"),
    })) as { two_factor_required: boolean; challenge_token: string };
    expect(challenge.two_factor_required).toBe(true);
    await invoke("auth_login", {
      contact: email,
      password: "StrongPass1",
      challenge_token: challenge.challenge_token,
    });
    await invoke(
      "users_change_password",
      { current_password: "StrongPass1", new_password: "ChangedPass1" },
      principal,
    );
    await expect(
      invoke("auth_refresh", { refresh_token: first.tokens.refresh_token }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
  it("resets password through single-use proof and keeps unknown contact responses uniform", async () => {
    const { email, registration } = await register("reset");
    await invoke("auth_set_password", {
      registration_token: registration.registration_token,
      password: "StrongPass1",
    });
    expect(await invoke("auth_request_password_reset", { contact: email })).toEqual(
      await invoke("auth_request_password_reset", {
        contact: `${prefix}-ghost@example.com`,
      }),
    );
    const proof = (await invoke("auth_verify_code", {
      contact: email,
      purpose: "password_reset",
      code: latest(email, "password_reset"),
    })) as { verification_token: string };
    await invoke("auth_confirm_password_reset", {
      verification_token: proof.verification_token,
      new_password: "NewPassword1",
    });
    await expect(
      invoke("auth_confirm_password_reset", {
        verification_token: proof.verification_token,
        new_password: "OtherPassword1",
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await invoke("auth_login", { contact: email, password: "NewPassword1" });
  });
  it("anonymizes credentials and profile on account deletion", async () => {
    const { email, row, registration } = await register("delete");
    const session = (await invoke("auth_set_password", {
      registration_token: registration.registration_token,
      password: "StrongPass1",
    })) as { tokens: { access_token: string } };
    const principal = { id: row.id, role: "client" as const };
    expect(await invoke("users_delete_request", {}, principal)).toEqual({
      confirmation: "password",
      expires_in_seconds: null,
    });
    await expect(
      invoke("users_delete_confirm", { password: "wrong" }, principal),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await invoke("users_delete_confirm", { password: "StrongPass1" }, principal);
    const deleted = (await database.select().from(users).where(eq(users.id, row.id)))[0]!;
    expect(deleted).toMatchObject({
      email: null,
      phone: null,
      password_hash: null,
      is_active: false,
      deactivation_reason: "user_request",
    });
    expect(
      (await database.select().from(user_profiles).where(eq(user_profiles.user_id, row.id)))[0],
    ).toMatchObject({
      full_name: "Удалённый пользователь",
      first_name: "",
      last_name: null,
      middle_name: null,
    });
    expect(
      await database.select().from(verification_codes).where(eq(verification_codes.contact, email)),
    ).toHaveLength(0);
    await expect(auth.authenticate(session.tokens.access_token)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});
