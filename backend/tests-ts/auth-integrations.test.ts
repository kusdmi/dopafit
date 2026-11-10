import { describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import sharp from "sharp";
import { EMAIL_BRAND_IMAGES } from "../src/platform/email/brand.js";
import { loadConfig } from "../src/config.js";
import { YandexSmartCaptcha } from "../src/platform/captcha.js";
import { SmtpNotificationSender, smtpOptions } from "../src/platform/notifications.js";

const captchaConfig = {
  siteKey: "public-test-key",
  secretKey: "server-test-key",
  allowedHosts: ["app.example.test"],
};
const smtpConfig = {
  host: "smtp.example.test",
  port: 587 as const,
  user: "auth@example.test",
  password: "test-only-password",
};

describe("Yandex CAPTCHA adapter", () => {
  it("requires a token and verifies its status, host and caller IP server-side", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: "ok", host: "app.example.test" }));
    const captcha = new YandexSmartCaptcha(captchaConfig, fetcher);
    expect(await captcha.verify(null, null)).toBe(false);
    expect(await captcha.verify(" ", null)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await captcha.verify("one-time-token", "203.0.113.1")).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://smartcaptcha.cloud.yandex.ru/validate");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      secret: captchaConfig.secretKey,
      token: "one-time-token",
      ip: "203.0.113.1",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    { status: "failed", host: "app.example.test" },
    { status: "ok", host: "other.example.test" },
    { status: "ok", host: "" },
    { status: "ok" },
    null,
  ])("rejects invalid provider results: %j", async (result) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(result));
    expect(await new YandexSmartCaptcha(captchaConfig, fetcher).verify("token", null)).toBe(false);
  });

  it("fails closed on outages, malformed JSON and timeout without leaking secrets", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("connection failed"))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("not json"));
    const captcha = new YandexSmartCaptcha(captchaConfig, fetcher);
    for (let i = 0; i < 3; i++) expect(await captcha.verify("token", null)).toBe(false);
  });
});

describe("SMTP delivery", () => {
  it("packages valid retina PNG logos for both themes", async () => {
    for (const image of EMAIL_BRAND_IMAGES)
      expect(await sharp(image.content).metadata()).toMatchObject({
        format: "png",
        width: 570,
        height: 124,
      });
  });

  it("embeds the official logo as PNG MIME parts without filesystem or URL access", async () => {
    const transport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix",
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    let mime = "";
    const sendMail = vi.fn(async (message) => {
      const result = await transport.sendMail(message);
      mime = result.message.toString();
      return { accepted: ["person@example.test"], rejected: [] };
    });
    await new SmtpNotificationSender(smtpConfig, 600, { sendMail }).sendVerificationCode(
      "person@example.test",
      "123456",
      "login",
    );
    expect(mime).toContain("Content-Type: multipart/alternative");
    expect(mime).toContain("Content-Type: multipart/related");
    expect(mime).toContain("Content-Type: text/plain");
    expect(mime).toContain("Content-Type: text/html");
    for (const theme of ["light", "dark"]) {
      expect(mime).toContain(`Content-ID: <logo-${theme}@dopafit.ru>`);
      expect(mime).toContain(`Content-Disposition: inline; filename=dopafit-logo-${theme}.png`);
    }
    expect(mime.match(/Content-Type: image\/png/g)).toHaveLength(2);
  });

  it("requires encrypted SMTP on both supported ports", () => {
    expect(smtpOptions(smtpConfig)).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    });
    expect(smtpOptions({ ...smtpConfig, port: 465 })).toMatchObject({ port: 465, secure: true });
  });

  it("sends codes with purpose and lifetime from the configured mailbox", async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: ["person@example.test"], rejected: [] });
    const sender = new SmtpNotificationSender(smtpConfig, 600, { sendMail });
    await sender.sendVerificationCode("person@example.test", "123456", "password_reset");
    expect(sendMail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: { name: "DopaFit", address: smtpConfig.user },
        to: [{ address: "person@example.test", name: "" }],
        subject: "Восстановление пароля — DopaFit",
        text: expect.stringContaining("Код подтверждения: 123456"),
        html: expect.stringContaining("Восстановление пароля"),
      }),
    );
    expect(sendMail.mock.calls[0]![0].text).toContain("10 мин.");
  });

  it.each(["login", "register", "account_delete"] as const)(
    "sends %s codes through the same email transport",
    async (purpose) => {
      const sendMail = vi
        .fn()
        .mockResolvedValue({ accepted: ["person@example.test"], rejected: [] });
      await new SmtpNotificationSender(smtpConfig, 600, { sendMail }).sendVerificationCode(
        "person@example.test",
        "123456",
        purpose,
      );
      expect(sendMail).toHaveBeenCalledOnce();
      expect(sendMail.mock.calls[0]![0].text).toContain("123456");
      expect(sendMail.mock.calls[0]![0].text).toContain("10 мин.");
      expect(sendMail.mock.calls[0]![0].html).toContain("123456");
      expect(sendMail.mock.calls[0]![0].html).toContain("10 мин.");
    },
  );

  it("surfaces delivery rejection safely and never sends an SMS address to SMTP", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("sensitive provider diagnostics"));
    const sender = new SmtpNotificationSender(smtpConfig, 600, { sendMail });
    await expect(
      sender.sendVerificationCode("person@example.test", "123456", "login"),
    ).rejects.toMatchObject({
      code: "validation_error",
      details: { reason: "email_delivery_failed" },
    });
    sendMail.mockResolvedValueOnce({ accepted: [], rejected: ["person@example.test"] });
    await expect(
      sender.sendVerificationCode("person@example.test", "123456", "login"),
    ).rejects.toMatchObject({
      details: { reason: "email_delivery_failed" },
    });
    const before = sendMail.mock.calls.length;
    await expect(
      sender.sendVerificationCode("+79992223344", "123456", "verify_phone"),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(sendMail).toHaveBeenCalledTimes(before);
  });
});

describe("auth integration configuration", () => {
  const smtpEnv = {
    DOPAFIT_NOTIFICATION_PROVIDER: "smtp",
    DOPAFIT_SMTP_HOST: smtpConfig.host,
    DOPAFIT_SMTP_PASSWORD: smtpConfig.password,
    DOPAFIT_DEV_VERIFICATION_CODE: "",
  };
  it("keeps local delivery and CAPTCHA disabled unless configured", () => {
    expect(loadConfig({})).toMatchObject({ smtp: undefined, captcha: undefined });
    expect(loadConfig(smtpEnv).smtp).toMatchObject({ user: "auth@dopafit.ru", port: 587 });
    expect(loadConfig({ ...smtpEnv, DOPAFIT_SMTP_PORT: "465" }).smtp?.port).toBe(465);
  });
  it.each([
    { DOPAFIT_SMTP_HOST: "" },
    { DOPAFIT_SMTP_HOST: "smtp://host" },
    { DOPAFIT_SMTP_PASSWORD: "" },
    { DOPAFIT_SMTP_USER: "not-email" },
    { DOPAFIT_SMTP_PORT: "25" },
    { DOPAFIT_DEV_VERIFICATION_CODE: "000000", DOPAFIT_ALLOW_FIXED_VERIFICATION_CODE: "true" },
  ])("rejects incomplete or insecure SMTP configuration: %j", (override) => {
    expect(() => loadConfig({ ...smtpEnv, ...override })).toThrow(/DOPAFIT_/);
  });
  it("requires the server key and accepts only configured CAPTCHA hosts", () => {
    expect(() => loadConfig({ DOPAFIT_SMARTCAPTCHA_SITE_KEY: "public" })).toThrow(/SECRET_KEY/);
    expect(() =>
      loadConfig({
        DOPAFIT_SMARTCAPTCHA_SECRET_KEY: "server",
        DOPAFIT_SMARTCAPTCHA_ALLOWED_HOSTS: "https://localhost",
      }),
    ).toThrow(/ALLOWED_HOSTS/);
    expect(loadConfig({ DOPAFIT_SMARTCAPTCHA_SECRET_KEY: "server" }).captcha).toMatchObject({
      secretKey: "server",
      allowedHosts: ["localhost"],
    });
  });
});
