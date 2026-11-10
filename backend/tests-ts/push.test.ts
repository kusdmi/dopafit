import { beforeEach, describe, expect, it, vi } from "vitest";

// web-push is mocked at the module boundary: these tests are about the adapter's own
// decisions — what it sends, and which failures mean "this subscription is dead" — not about
// the library's HTTP or its payload encryption.
const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  },
}));

const { WebPushProvider } = await import("../src/platform/push.js");
const { loadConfig } = await import("../src/config.js");

const keys = {
  publicKey: "public-key",
  privateKey: "private-key",
  subject: "mailto:ops@example.test",
};
const subscription = {
  token: "https://push.example.test/sub-1",
  platform: "web",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
  title: "DopaFit",
  body: "Тестовое уведомление",
};

/** A push service failure carries its HTTP status on the error, which is what the adapter reads. */
function pushError(statusCode: number) {
  return Object.assign(new Error(`push failed: ${statusCode}`), { statusCode });
}

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
});

describe("web push delivery", () => {
  it("sends the payload the service worker expects and keeps the subscription", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const provider = new WebPushProvider(keys);

    expect(setVapidDetails).toHaveBeenCalledWith(keys.subject, keys.publicKey, keys.privateKey);
    expect(await provider.send({ ...subscription, data: { url: "/app/home" } })).toBe(true);

    const [target, payload] = sendNotification.mock.calls[0]!;
    expect(target).toEqual({ endpoint: subscription.token, keys: subscription.keys });
    // The shape frontend/src/sw.ts reads in its `push` handler: title, body and the
    // `payload` it hands to showNotification as the notification's data.
    expect(JSON.parse(payload as string)).toEqual({
      title: "DopaFit",
      body: "Тестовое уведомление",
      payload: { url: "/app/home" },
    });
  });

  it("reports a gone subscription as invalid so the caller evicts it", async () => {
    const provider = new WebPushProvider(keys);
    for (const status of [404, 410]) {
      sendNotification.mockRejectedValueOnce(pushError(status));
      expect(await provider.send(subscription)).toBe(false);
    }
  });

  it("re-throws a transient failure instead of discarding a live subscription", async () => {
    const provider = new WebPushProvider(keys);
    // 429 is rate limiting and 500 is the push service being unwell — both say something
    // about this attempt, not about the registration. Treating them as "gone" would log the
    // user out of notifications over a momentary outage.
    for (const status of [429, 500, 503]) {
      sendNotification.mockRejectedValueOnce(pushError(status));
      await expect(provider.send(subscription)).rejects.toThrow(String(status));
    }
    // A bare network error has no status at all.
    sendNotification.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(provider.send(subscription)).rejects.toThrow("socket hang up");
  });

  it("leaves tokens it cannot speak to alone rather than evicting them", async () => {
    const provider = new WebPushProvider(keys);
    // APNs/FCM are a different protocol, and a web row without keys cannot be encrypted for.
    // Returning true keeps the registration: the gap is this adapter's coverage, not the
    // user's subscription.
    expect(await provider.send({ ...subscription, platform: "ios", keys: null })).toBe(true);
    expect(await provider.send({ ...subscription, keys: null })).toBe(true);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("VAPID configuration", () => {
  it("leaves push unconfigured when no keys are given", () => {
    expect(loadConfig({}).vapid).toBeUndefined();
  });

  it("accepts a complete pair", () => {
    expect(
      loadConfig({
        DOPAFIT_VAPID_PUBLIC_KEY: "pub",
        DOPAFIT_VAPID_PRIVATE_KEY: "priv",
        DOPAFIT_VAPID_SUBJECT: "mailto:ops@example.test",
      }).vapid,
    ).toEqual({ publicKey: "pub", privateKey: "priv", subject: "mailto:ops@example.test" });
  });

  it("refuses half a pair, which would register subscriptions it can never send to", () => {
    expect(() => loadConfig({ DOPAFIT_VAPID_PUBLIC_KEY: "pub" })).toThrow(/VAPID/);
    expect(() => loadConfig({ DOPAFIT_VAPID_PRIVATE_KEY: "priv" })).toThrow(/VAPID/);
  });

  it("requires a contact the push service can actually use", () => {
    const withSubject = (subject: string) =>
      loadConfig({
        DOPAFIT_VAPID_PUBLIC_KEY: "pub",
        DOPAFIT_VAPID_PRIVATE_KEY: "priv",
        DOPAFIT_VAPID_SUBJECT: subject,
      });
    expect(() => withSubject("")).toThrow(/VAPID_SUBJECT/);
    expect(() => withSubject("ops@example.test")).toThrow(/VAPID_SUBJECT/);
    expect(withSubject("https://example.test/contact").vapid?.subject).toBe(
      "https://example.test/contact",
    );
  });
});
