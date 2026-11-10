import { afterAll, describe, expect, it } from "vitest";
import type { RouteConfig } from "@hono/zod-openapi";
import { eq, inArray } from "drizzle-orm";
import { createTestDatabase } from "./database.js";
import {
  code_send_attempts,
  users,
  verification_codes,
  measurements,
  managed_clients,
  measurement_photos,
  push_tokens,
} from "../src/platform/db/schema.js";
import { createAuthModule, type AuthConfig } from "../src/modules/auth/index.js";
import { authEndpoints } from "../src/modules/auth/http/endpoints.js";
import { createApi } from "../src/http/app.js";
const { db: database, dispose } = await createTestDatabase();
const prefix = `auth-http-${Date.now()}`;
const sent: { contact: string; code: string; purpose: string }[] = [];
const deleted: string[] = [];
const config: AuthConfig = {
  jwtSecret: "auth-http-secret-with-at-least-thirty-two-characters",
  sender: {
    async sendVerificationCode(contact, code, purpose) {
      sent.push({ contact, code, purpose });
    },
  },
  codeSendMinIntervalSeconds: 0,
  codeSendMaxPerContactHour: 100,
  codeSendMaxPerContactDay: 200,
  codeSendMaxPerIpHour: 500,
  deleteObject: async (key) => {
    deleted.push(key);
  },
};
const module = createAuthModule(database, config);
const endpoints = authEndpoints(module.application);
const api = createApi({
  endpoints,
  authenticate: module.authenticate,
  clientIp: () => null,
});
const touched = new Set<string>();
const contacts: string[] = [];
const ids: string[] = [];
const code = (contact: string, purpose: string) =>
  sent.filter((x) => x.contact === contact && x.purpose === purpose).at(-1)!.code;
async function request(operation: string, body: unknown = {}, token?: string) {
  const route: RouteConfig = endpoints.find((x) => x.route.operationId === operation)!.route;
  touched.add(operation);
  return api.request(route.path, {
    method: route.method.toUpperCase(),
    headers: {
      ...(route.request?.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(route.request?.body ? { body: JSON.stringify(body) } : {}),
  });
}
async function success(operation: string, body: unknown = {}, token?: string) {
  const response = await request(operation, body, token);
  const json = await response.json();
  expect(response.status, JSON.stringify(json)).toBe(operation === "auth_register" ? 201 : 200);
  return json;
}
async function account(suffix: string, password = false) {
  const email = `${prefix}-${suffix}@example.com`;
  contacts.push(email);
  const draft = await success("auth_register", {
    email,
    full_name: "Test Person",
    role: "trainer",
    personal_data_consent: true,
  });
  const auth = password
    ? await success("auth_set_password", {
        registration_token: draft.registration_token,
        password: "StrongPassword1",
      })
    : await success("auth_register_verify", {
        email,
        code: code(email, "register"),
      });
  ids.push(auth.user.id as string);
  return {
    email,
    id: auth.user.id as string,
    token: auth.tokens.access_token as string,
    refresh: auth.tokens.refresh_token as string,
  };
}
afterAll(async () => {
  for (const id of ids) await database.delete(users).where(eq(users.id, id));
  if (contacts.length)
    await database.delete(code_send_attempts).where(inArray(code_send_attempts.contact, contacts));
  await dispose();
});
describe("auth HTTP contract and security", () => {
  it("publishes only the CAPTCHA client key", async () => {
    expect(await success("auth_captcha_config")).toEqual({ site_key: null });
    const configured = createApi({
      endpoints: authEndpoints(module.application, "public-key"),
      authenticate: module.authenticate,
    });
    expect(await (await configured.request("/api/v1/auth/captcha-config")).json()).toEqual({
      site_key: "public-key",
    });
  });
  it("keeps profile saves independent of phone verification and prevents a verified phone PATCH bypass", async () => {
    const a = await account("profile-phone");
    await success(
      "users_update_me",
      { first_name: "Anna", last_name: "Ivanova", middle_name: "Petrovna", phone: "+79992223344" },
      a.token,
    );
    await success("users_contact_verify_request", { type: "phone" }, a.token);
    await success("users_update_me", { city: "Kazan" }, a.token);
    await success(
      "users_contact_verify_confirm",
      { type: "phone", code: code("+79992223344", "verify_phone") },
      a.token,
    );
    const bypass = await request("users_update_me", { phone: "+79992223345" }, a.token);
    expect(bypass.status).toBe(409);
    const me = await success("users_get_me", {}, a.token);
    expect(me.profile).toMatchObject({
      first_name: "Anna",
      last_name: "Ivanova",
      middle_name: "Petrovna",
      full_name: "Ivanova Anna Petrovna",
      city: "Kazan",
    });
    expect(me.user).toMatchObject({ phone: "+79992223344", phone_verified: true });
  });

  it("uses the original error status/code and Retry-After header for unknown and known contacts", async () => {
    const ghost = `${prefix}-ghost@example.com`;
    contacts.push(ghost);
    const invalid = await request("auth_verify_code", {
      contact: ghost,
      purpose: "login",
      code: "000000",
    });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).code).toBe("validation_error");
    const limited = createAuthModule(database, {
      ...config,
      codeSendMinIntervalSeconds: 60,
    });
    const rateApi = createApi({
      endpoints: authEndpoints(limited.application),
      authenticate: limited.authenticate,
    });
    for (let n = 0; n < 2; n++) {
      const response = await rateApi.request("/api/v1/auth/login/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact: ghost }),
      });
      expect(response.status).toBe(n === 0 ? 200 : 429);
      if (n === 1) {
        expect(response.headers.get("retry-after")).toMatch(/^\d+$/);
        expect((await response.json()).code).toBe("rate_limited");
      }
    }
    expect(sent.filter((x) => x.contact === ghost)).toHaveLength(0);
  });
  it("runs every auth/users operation with response DTOs, settings, onboarding and contact changes", async () => {
    const a = await account("profile");
    expect(await success("users_get_me", {}, a.token)).toMatchObject({
      user: { email: a.email, has_password: false },
      profile: { full_name: "Test Person" },
    });
    await success(
      "users_update_me",
      { full_name: "Updated Name", phone: "+79991234567", city: "Kazan" },
      a.token,
    );
    // The birth date is stored exactly as sent. Onboarding used to take an
    // integer `age` and derive `${currentYear - age}-01-01` from it, losing the
    // real day and month; asserting the round-trip keeps that from coming back.
    const onboarded = await success(
      "users_complete_onboarding",
      {
        gender: "male",
        birth_date: "1990-04-17",
        weight: 80,
        height: 180,
        clients_per_month: 10,
      },
      a.token,
    );
    expect(onboarded.profile.birth_date).toBe("1990-04-17");
    const settings = await success("users_get_settings", {}, a.token);
    expect(settings.theme).toBe("system");
    expect(
      await success(
        "users_update_settings",
        {
          theme: "dark",
          analytics_config: {
            version: 1,
            default_period: "90d",
            charts: [{ type: "workouts" }, { type: "future" }],
          },
        },
        a.token,
      ),
    ).toMatchObject({
      theme: "dark",
      analytics_config: { charts: [{ type: "workouts" }] },
    });
    await success("users_contact_verify_request", { type: "phone" }, a.token);
    await success(
      "users_contact_verify_confirm",
      { type: "phone", code: code("+79991234567", "verify_phone") },
      a.token,
    );
    const newEmail = `${prefix}-new@example.com`;
    contacts.push(newEmail);
    await success(
      "users_contact_change_request",
      { type: "email", new_contact: newEmail.toUpperCase() },
      a.token,
    );
    expect(
      await success(
        "users_contact_change_confirm",
        {
          type: "email",
          code: code(newEmail, "change_email"),
          refresh_token: a.refresh,
        },
        a.token,
      ),
    ).toMatchObject({ email: newEmail, email_verified: true });
    const kept = await success("auth_refresh", { refresh_token: a.refresh });
    await success("users_change_password", { new_password: "StrongPassword1" }, a.token);
    await success("users_login_method_request_code", {}, a.token);
    await success(
      "users_set_login_method",
      { method: "two_factor", code: code(newEmail, "change_login_method") },
      a.token,
    );
    await success("auth_login_request_code", {
      contact: newEmail.toUpperCase(),
    });
    const challenge = await success("auth_login_verify_code", {
      contact: newEmail,
      code: code(newEmail, "login"),
    });
    const signed = await success("auth_login", {
      contact: newEmail,
      password: "StrongPassword1",
      challenge_token: challenge.challenge_token,
    });
    await success("auth_logout", {
      refresh_token: signed.tokens.refresh_token,
    });
    await success("auth_request_password_reset", { contact: newEmail });
    const proof = await success("auth_verify_code", {
      contact: newEmail,
      purpose: "password_reset",
      code: code(newEmail, "password_reset"),
    });
    await success("auth_confirm_password_reset", {
      verification_token: proof.verification_token,
      new_password: "OtherPassword2",
    });
    await success("auth_resend_code", {
      contact: newEmail,
      purpose: "password_reset",
    });
    expect((await request("auth_refresh", { refresh_token: kept.refresh_token })).status).toBe(401);
    await success("users_delete_request", {}, a.token);
    await success("users_delete_confirm", { password: "OtherPassword2" }, a.token);
    const p = await account("password", true);
    expect((await request("users_get_me", {}, p.token)).status).toBe(200);
    expect([...touched].sort()).toEqual(endpoints.map((x) => x.route.operationId!).sort());
  });
  it("rejects unauthorized reads and duplicate consent/weak passwords without leaking fields", async () => {
    expect((await request("users_get_me")).status).toBe(401);
    const noConsent = await request("auth_register", {
      email: `${prefix}-noconsent@example.com`,
      full_name: "Test Name",
      role: "client",
      personal_data_consent: false,
    });
    expect(noConsent.status).toBe(422);
    const a = await account("private");
    const output = await success("users_get_me", {}, a.token);
    expect(output.user).not.toHaveProperty("password_hash");
    expect(output.user).not.toHaveProperty("personal_data_consent_at");
    const weak = await request("users_change_password", { new_password: "weakpassword" }, a.token);
    expect(weak.status).toBe(422);
  });
  it("serializes concurrent code redemption and refresh rotation", async () => {
    const email = `${prefix}-race@example.com`;
    contacts.push(email);
    await success("auth_register", {
      email,
      full_name: "Race Person",
      role: "client",
      personal_data_consent: true,
    });
    const results = await Promise.all([
      request("auth_register_verify", { email, code: code(email, "register") }),
      request("auth_register_verify", { email, code: code(email, "register") }),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 404]);
    const auth = await results.find((x) => x.status === 200)!.json();
    ids.push(auth.user.id);
    const rotations = await Promise.all([
      request("auth_refresh", { refresh_token: auth.tokens.refresh_token }),
      request("auth_refresh", { refresh_token: auth.tokens.refresh_token }),
    ]);
    expect(rotations.map((x) => x.status).sort()).toEqual([200, 401]);
  });
  it("rolls back a verified contact change conflict without burning its code and revokes other sessions", async () => {
    const a = await account("contact-a");
    const b = await account("contact-b");
    const pending = `${prefix}-pending@example.com`;
    contacts.push(pending);
    await success("users_contact_change_request", { type: "email", new_contact: pending }, a.token);
    await database.update(users).set({ email: pending }).where(eq(users.id, b.id));
    expect(
      (
        await request(
          "users_contact_change_confirm",
          { type: "email", code: code(pending, "change_email") },
          a.token,
        )
      ).status,
    ).toBe(409);
    const records = await database
      .select()
      .from(verification_codes)
      .where(eq(verification_codes.contact, pending));
    expect(records[0]?.used_at).toBeNull();
    await database.update(users).set({ email: b.email }).where(eq(users.id, b.id));
    await success("auth_login_request_code", { contact: a.email });
    const second = await success("auth_login_verify_code", {
      contact: a.email,
      code: code(a.email, "login"),
    });
    await success(
      "users_contact_change_confirm",
      {
        type: "email",
        code: code(pending, "change_email"),
        refresh_token: a.refresh,
      },
      a.token,
    );
    expect(
      (
        await request("auth_refresh", {
          refresh_token: second.auth.tokens.refresh_token,
        })
      ).status,
    ).toBe(401);
    expect((await request("auth_refresh", { refresh_token: a.refresh })).status).toBe(200);
  });
  it("deletes trainer-owned private stubs, photos, tokens and pending new-contact codes", async () => {
    const a = await account("cleanup");
    const [measurement] = await database
      .insert(measurements)
      .values({ user_id: a.id, date: "2026-09-09" })
      .returning();
    await database.insert(measurement_photos).values({
      measurement_id: measurement!.id,
      kind: "front",
      object_key: `private/${a.id}.jpg`,
    });
    await database
      .insert(managed_clients)
      .values({ owner_id: a.id, display_name: "Private client" });
    await database
      .insert(push_tokens)
      .values({ user_id: a.id, platform: "web", token: `push-${a.id}` });
    const pending = `${prefix}-cleanup-new@example.com`;
    contacts.push(pending);
    await success("users_contact_change_request", { type: "email", new_contact: pending }, a.token);
    await success("users_delete_request", {}, a.token);
    await success("users_delete_confirm", { code: code(a.email, "account_delete") }, a.token);
    expect(
      await database.select().from(managed_clients).where(eq(managed_clients.owner_id, a.id)),
    ).toHaveLength(0);
    expect(
      await database.select().from(push_tokens).where(eq(push_tokens.user_id, a.id)),
    ).toHaveLength(0);
    expect(
      await database.select().from(verification_codes).where(eq(verification_codes.user_id, a.id)),
    ).toHaveLength(0);
    expect(deleted).toContain(`private/${a.id}.jpg`);
  });
});
