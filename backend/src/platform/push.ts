import webpush from "web-push";
import type { PushProvider } from "../modules/messaging/index.js";

/**
 * Push delivery, as the process provides it.
 *
 * `PushProvider` is a port messaging declares and calls but must not implement: what
 * actually carries a notification to a device is Apple's, Google's or Mozilla's push
 * service, which is the process's concern — the same reason the S3 adapter and the payment
 * provider next door implement training's `FileStorage` and commerce's `PaymentProvider`.
 */

/** VAPID identifies this application server to every browser push service. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** Contact for the push service, `mailto:` or `https:` — required by the VAPID spec. */
  subject: string;
}

/**
 * A push service answers 404 or 410 when the subscription it was given no longer exists:
 * the browser dropped it, the user cleared site data, the PWA was uninstalled. Those are the
 * only responses that mean "this token is dead" — everything else (429 rate limit, 5xx
 * outage, a network error) is about this attempt, not about the subscription, and must not
 * cost the user their registration.
 */
const GONE = new Set([404, 410]);

/**
 * Real Web Push delivery over VAPID.
 *
 * Only `web` tokens are carried: a web subscription is an endpoint URL plus the two keys the
 * browser generated, and the payload is encrypted for those keys before it leaves this
 * process — the push service forwards ciphertext it cannot read. Native tokens (APNs/FCM)
 * are a different protocol with different credentials; `send` reports them as still valid
 * rather than evicting registrations it simply has no way to deliver to.
 */
export class WebPushProvider implements PushProvider {
  constructor(keys: VapidKeys) {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  }

  async send(input: {
    token: string;
    platform: string;
    keys: { p256dh: string; auth: string } | null;
    title: string;
    body: string;
    data?: Record<string, unknown> | null;
  }): Promise<boolean> {
    // A web token without keys cannot be encrypted for, and no other platform speaks this
    // protocol. Keep the row: the fault is the adapter's coverage, not the registration.
    if (input.platform !== "web" || !input.keys) return true;

    // The shape the service worker's `push` handler reads (frontend/src/sw.ts).
    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      payload: input.data ?? {},
    });

    try {
      await webpush.sendNotification(
        { endpoint: input.token, keys: input.keys },
        payload,
        // Long enough to outlive a phone that is asleep, short enough that a stale
        // reminder is dropped rather than delivered hours late.
        { TTL: 4 * 3600 },
      );
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status !== undefined && GONE.has(status)) return false;
      // Anything else is a transient failure of this attempt. Re-throw so the caller logs
      // it through `onIntegrationError` instead of silently discarding the token.
      throw error;
    }
  }
}
