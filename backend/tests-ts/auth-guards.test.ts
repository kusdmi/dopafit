import { afterAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "./database.js";
import { createApi } from "../src/http/app.js";
import { createAuthModule, type AuthConfig } from "../src/modules/auth/index.js";
import { authEndpoints } from "../src/modules/auth/http/endpoints.js";
import type { RouteConfig } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { referrals, users } from "../src/platform/db/schema.js";

// Guards that the main auth suites deliberately disable so they can exercise the
// happy paths: send-rate limits, captcha, and the negative branches of the
// login-method / contact-change gates. Each block builds its own module so the
// limit under test is the only one that can trigger.
const { db, dispose } = await createTestDatabase();
afterAll(dispose);

const sent: { contact: string; code: string; purpose: string }[] = [];
const base: AuthConfig = {
  jwtSecret: "auth-guards-secret-with-at-least-thirty-two-chars",
  sender: {
    async sendVerificationCode(contact, code, purpose) {
      sent.push({ contact, code, purpose });
    },
  },
  codeSendMinIntervalSeconds: 0,
  codeSendMaxPerContactHour: 1000,
  codeSendMaxPerContactDay: 1000,
  codeSendMaxPerIpHour: 1000,
};

let ipCounter = 0;
// Each block gets its own address so per-IP counters never leak between tests.
function build(
  overrides: Partial<AuthConfig> = {},
  ip: string | null = `203.0.113.${++ipCounter}`,
) {
  const module = createAuthModule(db, { ...base, ...overrides });
  const endpoints = authEndpoints(module.application);
  const api = createApi({
    endpoints,
    authenticate: module.authenticate,
    clientIp: () => ip,
  });
  const call = (operation: string, body: unknown = {}, token?: string) => {
    const route: RouteConfig = endpoints.find((x) => x.route.operationId === operation)!.route;
    return api.request(route.path, {
      method: route.method.toUpperCase(),
      headers: {
        ...(route.request?.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(route.request?.body ? { body: JSON.stringify(body) } : {}),
    });
  };
  return { module, call };
}

let counter = 0;
const freshEmail = () => `guards-${Date.now()}-${counter++}@example.com`;
const latestCode = (contact: string, purpose: string) =>
  sent.filter((x) => x.contact === contact && x.purpose === purpose).at(-1)!.code;
const userRow = async (email: string) =>
  (await db.select().from(users).where(eq(users.email, email)))[0]!;

/**
 * Register an account. With a password the registration is completed through
 * `set-password` (which requires an unverified draft); without one it is completed
 * by verifying the emailed code, leaving the account on code sign-in.
 */
async function account(
  call: ReturnType<typeof build>["call"],
  options: { password?: string; role?: "client" | "trainer" } = {},
) {
  const email = freshEmail();
  const registered = await call("auth_register", {
    email,
    full_name: "Guard Test",
    role: options.role ?? "client",
    personal_data_consent: true,
  });
  expect(registered.status).toBe(201);
  const { registration_token } = await registered.json();
  if (options.password) {
    const set = await call("auth_set_password", { registration_token, password: options.password });
    expect(set.status, await set.clone().text()).toBe(200);
    return { email, registration_token, ...(await set.json()) };
  }
  const verified = await call("auth_register_verify", {
    email,
    code: latestCode(email, "register"),
  });
  expect(verified.status, await verified.clone().text()).toBe(200);
  return { email, registration_token, ...(await verified.json()) };
}

describe("auth send limits and captcha", () => {
  it("requires a fresh CAPTCHA on password login, including invalid credentials", async () => {
    const setup = build();
    const user = await account(setup.call, { password: "Dopafit1Demo" });
    const used = new Set<string>();
    const seen: (string | null)[] = [];
    const { call } = build(
      {
        captcha: {
          async verify(token, ip) {
            expect(ip).toBe("203.0.113.99");
            seen.push(token);
            if (!token?.startsWith("valid-") || used.has(token)) return false;
            used.add(token);
            return true;
          },
        },
      },
      "203.0.113.99",
    );
    const body = { contact: user.email, password: "Dopafit1Demo" };
    expect((await call("auth_login", body)).status).toBe(422);
    expect((await call("auth_login", { ...body, captcha_token: "invalid" })).status).toBe(422);
    expect(
      (await call("auth_login", { ...body, password: "wrong", captcha_token: "valid-1" })).status,
    ).toBe(401);
    expect((await call("auth_login", { ...body, captcha_token: "valid-1" })).status).toBe(422);
    expect((await call("auth_login", { ...body, captcha_token: "valid-2" })).status).toBe(200);
    expect(seen).toEqual([null, "invalid", "valid-1", "valid-1", "valid-2"]);
  });
  it("enforces the per-contact daily window and reports when to retry", async () => {
    const { call } = build({ codeSendMaxPerContactDay: 2 });
    const contact = freshEmail();
    for (let sent = 0; sent < 2; sent += 1)
      expect((await call("auth_login_request_code", { contact })).status).toBe(200);
    const limited = await call("auth_login_request_code", { contact });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "rate_limited" });
    // Retry-After lets the client back off instead of hammering the endpoint.
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("enforces the per-IP window across different contacts", async () => {
    const { call } = build({ codeSendMaxPerIpHour: 2 });
    for (let sent = 0; sent < 2; sent += 1)
      expect((await call("auth_login_request_code", { contact: freshEmail() })).status).toBe(200);
    // A fresh contact from the same IP is still refused: the limit is per address,
    // which is what stops one host from enumerating many contacts.
    expect((await call("auth_login_request_code", { contact: freshEmail() })).status).toBe(429);
  });

  it("scopes the minimum interval to one purpose so unrelated flows are not blocked", async () => {
    const { call } = build({ codeSendMinIntervalSeconds: 3600 });
    const contact = freshEmail();
    expect((await call("auth_login_request_code", { contact })).status).toBe(200);
    expect((await call("auth_login_request_code", { contact })).status).toBe(429);
    // A different purpose has its own interval; password reset must stay reachable.
    expect((await call("auth_request_password_reset", { contact })).status).toBe(200);
  });

  it("records an attempt for unknown contacts too, so timing does not reveal accounts", async () => {
    const { call } = build({ codeSendMaxPerContactDay: 1 });
    const ghost = freshEmail();
    expect((await call("auth_login_request_code", { contact: ghost })).status).toBe(200);
    const limited = await call("auth_login_request_code", { contact: ghost });
    expect(limited.status).toBe(429);
  });

  it("refuses to send when captcha rejects the token", async () => {
    const seen: (string | null)[] = [];
    const { call } = build({
      captcha: {
        async verify(token) {
          seen.push(token);
          return false;
        },
      },
    });
    const denied = await call("auth_login_request_code", {
      contact: freshEmail(),
      captcha_token: "bad-token",
    });
    expect(denied.status).toBe(422);
    expect(await denied.json()).toMatchObject({ code: "validation_error" });
    expect(seen).toEqual(["bad-token"]);
  });
});

describe("auth flow gates", () => {
  it("returns the same stable error reason for unknown accounts and wrong passwords", async () => {
    const { call } = build();
    const user = await account(call, { password: "Dopafit1Demo" });
    const known = await call("auth_login", { contact: user.email, password: "wrong" });
    const unknown = await call("auth_login", { contact: freshEmail(), password: "wrong" });
    expect(known.status).toBe(401);
    expect(unknown.status).toBe(401);
    const body = await known.json();
    expect(body).toMatchObject({
      code: "unauthorized",
      details: { reason: "invalid_credentials" },
    });
    expect(await unknown.json()).toEqual(body);
  });

  it("never issues a login code to a password-only account and rejects a stale one", async () => {
    const { call } = build();
    const user = await account(call, { password: "Dopafit1Demo" });
    const before = sent.length;
    // The response shape is identical to the code branch (non-enumeration), but no
    // code is issued — otherwise email access alone would bypass the password.
    expect((await call("auth_login_request_code", { contact: user.email })).status).toBe(200);
    expect(sent.slice(before)).toEqual([]);
    expect(
      (await call("auth_login_verify_code", { contact: user.email, code: "000000" })).status,
    ).toBe(404);
  });

  it("rejects a password login for an account that chose code sign-in", async () => {
    const { call } = build();
    const user = await account(call);
    expect(
      (await call("auth_login", { contact: user.email, password: "Dopafit1Demo" })).status,
    ).toBe(401);
  });

  it("restores an abandoned registration but conflicts with a completed account", async () => {
    const { call } = build();
    const email = freshEmail();
    const draft = {
      email,
      full_name: "Retry Me",
      role: "client" as const,
      personal_data_consent: true,
    };
    expect((await call("auth_register", draft)).status).toBe(201);
    // An unfinished registration may be retried; a finished one must not be taken over.
    expect((await call("auth_register", draft)).status).toBe(201);
    expect(
      (await call("auth_register_verify", { email, code: latestCode(email, "register") })).status,
    ).toBe(200);
    expect((await call("auth_register", draft)).status).toBe(409);
  });

  it("clears the verification deadline when an unverified draft signs in by code", async () => {
    const { call } = build();
    const email = freshEmail();
    expect(
      (
        await call("auth_register", {
          email,
          full_name: "Draft User",
          role: "client",
          personal_data_consent: true,
        })
      ).status,
    ).toBe(201);
    const draft = await userRow(email);
    expect(draft.email_verified).toBe(false);
    expect(draft.verification_deadline_at).not.toBeNull();

    expect((await call("auth_login_request_code", { contact: email })).status).toBe(200);
    const signedIn = await call("auth_login_verify_code", {
      contact: email,
      code: latestCode(email, "login"),
    });
    expect(signedIn.status, await signedIn.clone().text()).toBe(200);

    // Signing in by code proves control of the address, so the account is verified
    // and the deadline lifted — a live deadline would let the scheduler anonymize
    // an account that is in daily use.
    const recovered = await userRow(email);
    expect(recovered.email_verified).toBe(true);
    expect(recovered.verification_deadline_at).toBeNull();
  });

  it("guards login-method switches and rejects a spent registration token", async () => {
    const { call } = build();
    const codeUser = await account(call);
    // Switching to a password method without ever setting a password would lock
    // the account out of both sign-in routes.
    expect(
      (await call("users_login_method_request_code", {}, codeUser.tokens.access_token)).status,
    ).toBe(200);
    const confirm = await call(
      "users_set_login_method",
      { method: "password", code: latestCode(codeUser.email, "change_login_method") },
      codeUser.tokens.access_token,
    );
    expect(confirm.status).toBe(422);

    const finished = await account(call, { password: "Dopafit1Demo" });
    const stale = await call("auth_set_password", {
      registration_token:
        (finished as { registration_token?: string }).registration_token ?? "spent",
      password: "Another1Pass",
    });
    expect([401, 409]).toContain(stale.status);
  });

  it("keeps resend and verify-code limited to the purposes they are meant for", async () => {
    const { call } = build();
    // Settings-only purposes must not be reachable through the unauthenticated
    // endpoints, which would hand out change-email codes to anyone.
    expect(
      (await call("auth_resend_code", { contact: freshEmail(), purpose: "change_email" })).status,
    ).toBe(422);
    expect(
      (
        await call("auth_verify_code", {
          contact: freshEmail(),
          code: "000000",
          purpose: "register",
        })
      ).status,
    ).toBe(422);
    // An unknown contact is answered normally, so resend reveals nothing either.
    expect(
      (await call("auth_resend_code", { contact: freshEmail(), purpose: "password_reset" })).status,
    ).toBe(200);
  });

  it("frees the contact for a fresh registration after the account is deleted", async () => {
    const { call } = build();
    const user = await account(call, { password: "Dopafit1Demo" });
    const deleted = await call(
      "users_delete_confirm",
      { password: "Dopafit1Demo" },
      user.tokens.access_token,
    );
    expect(deleted.status).toBe(200);
    expect(
      (
        await call("auth_register", {
          email: user.email,
          full_name: "Returning User",
          role: "client",
          personal_data_consent: true,
        })
      ).status,
    ).toBe(201);
  });
});

describe("referral linking", () => {
  it("links an invite to its owner but ignores self-referral and unknown codes", async () => {
    const qualified: string[] = [];
    const { call } = build({
      qualifyReferral: async (userId) => {
        qualified.push(userId);
      },
    });
    const referrer = await account(call, { password: "Dopafit1Demo" });
    const code = (await userRow(referrer.email)).referral_code;

    const invited = freshEmail();
    expect(
      (
        await call("auth_register", {
          email: invited,
          full_name: "Invited",
          role: "client",
          personal_data_consent: true,
          invite_code: code,
        })
      ).status,
    ).toBe(201);
    const invitedId = (await userRow(invited)).id;
    expect(
      await db.select().from(referrals).where(eq(referrals.referred_user_id, invitedId)),
    ).toMatchObject([{ referrer_id: (await userRow(referrer.email)).id }]);

    // Completing the invited registration is what qualifies the referral; without
    // this hand-off the referrer would never be credited.
    expect(
      (
        await call("auth_register_verify", {
          email: invited,
          code: latestCode(invited, "register"),
        })
      ).status,
    ).toBe(200);
    expect(qualified).toContain(invitedId);

    // A made-up code must not create a dangling row...
    const orphan = freshEmail();
    expect(
      (
        await call("auth_register", {
          email: orphan,
          full_name: "Orphan",
          role: "client",
          personal_data_consent: true,
          invite_code: "NOSUCHCODE",
        })
      ).status,
    ).toBe(201);
    expect(
      await db
        .select()
        .from(referrals)
        .where(eq(referrals.referred_user_id, (await userRow(orphan)).id)),
    ).toHaveLength(0);

    // ...and re-registering an abandoned draft with one's own code must not pay out:
    // otherwise every user could mint bonus days by inviting themselves.
    const selfInvited = freshEmail();
    expect(
      (
        await call("auth_register", {
          email: selfInvited,
          full_name: "Self",
          role: "client",
          personal_data_consent: true,
        })
      ).status,
    ).toBe(201);
    const ownCode = (await userRow(selfInvited)).referral_code;
    expect(
      (
        await call("auth_register", {
          email: selfInvited,
          full_name: "Self",
          role: "client",
          personal_data_consent: true,
          invite_code: ownCode,
        })
      ).status,
    ).toBe(201);
    expect(
      await db
        .select()
        .from(referrals)
        .where(eq(referrals.referred_user_id, (await userRow(selfInvited)).id)),
    ).toHaveLength(0);
  });
});
