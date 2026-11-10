import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("runtime configuration", () => {
  it("keeps development mock integrations and normalizes old S3 endpoint syntax", () => {
    const config = loadConfig({
      DOPAFIT_S3_ENDPOINT: "minio:9000",
      DOPAFIT_S3_PUBLIC_ENDPOINT: "localhost:9000",
    });
    expect(config.storage.endpoint).toBe("http://minio:9000");
    expect(config.storage.publicEndpoint).toBe("http://localhost:9000");
    expect(config.devVerificationCode).toBe("000000");
    expect(config.rotateDevVerificationCode).toBe(false);
    expect(config.maxMediaBytes).toBe(50 * 1024 * 1024);
    expect(config.trustProxy).toBe(false);
    expect(config.subscriptionUrl).toBe("https://app.dopafit.ru/subscription");
  });
  it("fills in http for a bare S3 host but keeps an explicitly given scheme", () => {
    // The scheme comes from the value itself; there is no separate flag for it, so a
    // deployment that needs TLS writes `https://` in the variable.
    const bare = loadConfig({ DOPAFIT_S3_ENDPOINT: "minio:9000" });
    expect(bare.storage.endpoint).toBe("http://minio:9000");

    const secure = loadConfig({ DOPAFIT_S3_ENDPOINT: "https://s3.example.test/" });
    expect(secure.storage.endpoint).toBe("https://s3.example.test");

    expect(() => loadConfig({ DOPAFIT_S3_ENDPOINT: "ftp://s3.example.test" })).toThrow(
      /DOPAFIT_S3_ENDPOINT/,
    );
    expect(() => loadConfig({ DOPAFIT_S3_ENDPOINT: "http://user:pass@s3.example.test" })).toThrow(
      /DOPAFIT_S3_ENDPOINT/,
    );
  });
  it("rejects development secrets in production and unsupported providers", () => {
    expect(() => loadConfig({ DOPAFIT_ENVIRONMENT: "production" })).toThrow(/DOPAFIT_JWT_SECRET/);
    expect(() => loadConfig({ DOPAFIT_PAYMENT_PROVIDER: "real" })).toThrow(
      /DOPAFIT_PAYMENT_PROVIDER/,
    );
    expect(() => loadConfig({ DOPAFIT_PORT: "NaN" })).toThrow(/DOPAFIT_PORT/);
  });
  it("refuses a production start while nothing can deliver a verification code", () => {
    // The only NotificationSender is the logging placeholder, so a deployment that has not
    // said it knows that would take sign-ups it can never complete.
    expect(() =>
      loadConfig({
        DOPAFIT_ENVIRONMENT: "production",
        DOPAFIT_JWT_SECRET: "a-production-secret-longer-than-thirty-two-characters",
        DOPAFIT_DATABASE_URL: "postgresql://app:secret@db.example.test/app",
        DOPAFIT_S3_SECRET_KEY: "a-secret-key",
        DOPAFIT_DEV_VERIFICATION_CODE: "",
      }),
    ).toThrow(/DOPAFIT_NOTIFICATION_PROVIDER/);
  });
  it("allows explicit test-stand fixed codes but rejects accidental fixed production codes", () => {
    const production = {
      DOPAFIT_ENVIRONMENT: "production",
      DOPAFIT_JWT_SECRET: "a-production-secret-longer-than-thirty-two-characters",
      DOPAFIT_DATABASE_URL: "postgresql://app:secret@db.example.test/app",
      DOPAFIT_S3_SECRET_KEY: "a-secret-key",
      DOPAFIT_S3_ENDPOINT: "https://s3.example.test",
      DOPAFIT_S3_PUBLIC_ENDPOINT: "https://s3.example.test",
      // Acknowledges that nothing delivers verification codes yet; without it a production
      // configuration is refused outright.
      DOPAFIT_ALLOW_UNDELIVERED_NOTIFICATIONS: "true",
      // Production also insists on Web Push keys; this test is about codes, not push.
      DOPAFIT_VAPID_PUBLIC_KEY: "a-public-key",
      DOPAFIT_VAPID_PRIVATE_KEY: "a-private-key",
      DOPAFIT_VAPID_SUBJECT: "mailto:ops@example.test",
    };
    expect(() => loadConfig(production)).toThrow(/DOPAFIT_DEV_VERIFICATION_CODE/);
    expect(
      loadConfig({ ...production, DOPAFIT_DEV_VERIFICATION_CODE: "" }).devVerificationCode,
    ).toBeUndefined();
    expect(
      loadConfig({ ...production, DOPAFIT_ALLOW_FIXED_VERIFICATION_CODE: "true" })
        .devVerificationCode,
    ).toBe("000000");
    expect(() =>
      loadConfig({
        ...production,
        DOPAFIT_ALLOW_FIXED_VERIFICATION_CODE: "true",
        DOPAFIT_E2E_ROTATING_VERIFICATION_CODE: "true",
      }),
    ).toThrow(/DOPAFIT_E2E_ROTATING_VERIFICATION_CODE/);
    expect(() =>
      loadConfig({
        DOPAFIT_DEV_VERIFICATION_CODE: "123456",
        DOPAFIT_E2E_ROTATING_VERIFICATION_CODE: "true",
      }),
    ).toThrow(/DOPAFIT_E2E_ROTATING_VERIFICATION_CODE/);
    expect(
      loadConfig({ DOPAFIT_E2E_ROTATING_VERIFICATION_CODE: "true" }).rotateDevVerificationCode,
    ).toBe(true);
  });
  it("requires Web Push keys in production but leaves them optional in development", () => {
    const production = {
      DOPAFIT_ENVIRONMENT: "production",
      DOPAFIT_JWT_SECRET: "a-production-secret-longer-than-thirty-two-characters",
      DOPAFIT_DATABASE_URL: "postgresql://app:secret@db.example.test/app",
      DOPAFIT_S3_SECRET_KEY: "a-secret-key",
      DOPAFIT_S3_ENDPOINT: "https://s3.example.test",
      DOPAFIT_S3_PUBLIC_ENDPOINT: "https://s3.example.test",
      DOPAFIT_ALLOW_UNDELIVERED_NOTIFICATIONS: "true",
      DOPAFIT_ALLOW_FIXED_VERIFICATION_CODE: "true",
    };
    // Notifications are part of the product in production, and a deployment without keys
    // would collect subscriptions it can never deliver to - silently, since the frontend
    // simply hides the button. Fail on the spot instead.
    expect(() => loadConfig(production)).toThrow(/DOPAFIT_VAPID_PUBLIC_KEY/);

    const keys = {
      DOPAFIT_VAPID_PUBLIC_KEY: "a-public-key",
      DOPAFIT_VAPID_PRIVATE_KEY: "a-private-key",
      DOPAFIT_VAPID_SUBJECT: "mailto:ops@example.test",
    };
    expect(loadConfig({ ...production, ...keys }).vapid).toEqual({
      publicKey: "a-public-key",
      privateKey: "a-private-key",
      subject: "mailto:ops@example.test",
    });
    // Development keeps running without them; push just stays a no-op.
    expect(loadConfig({}).vapid).toBeUndefined();
  });
});
