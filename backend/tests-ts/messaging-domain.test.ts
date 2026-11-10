import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  deliveryEnabled,
  type NotificationType,
} from "../src/modules/messaging/domain/types.js";
import { pushTarget } from "../src/modules/messaging/domain/push-target.js";
describe("push category policies", () => {
  const types: NotificationType[] = [
    "workout_reminder",
    "subscription",
    "referral",
    "support",
    "system",
    "link_request",
    "account",
  ];
  it("applies the master switch to every category", () => {
    for (const type of types)
      expect(deliveryEnabled({ ...defaultSettings(), push_enabled: false }, type)).toBe(false);
  });
  it("uses category switches and always allows transactional categories under the master switch", () => {
    const settings = {
      ...defaultSettings(),
      workout_reminders: false,
      progress_updates: false,
      new_features: false,
    };
    for (const type of ["workout_reminder", "subscription", "referral", "system"] as const)
      expect(deliveryEnabled(settings, type)).toBe(false);
    for (const type of ["support", "link_request", "account"] as const)
      expect(deliveryEnabled(settings, type)).toBe(true);
  });
});

describe("push targets", () => {
  it("sends a link request to the connections screen with the requests tab open", () => {
    // The tab travels as a query parameter and not as history state on purpose: a tap on a
    // push with no window open is served by `clients.openWindow(url)` in the service worker,
    // which can be handed a URL and nothing else.
    expect(pushTarget("link_request")).toBe("/app/settings/connections?tab=requests");
    expect(pushTarget("link_request", { request_id: "request-1" })).toBe(
      "/app/settings/connections?tab=requests&request_id=request-1",
    );
  });

  it("gives no route to the types that have no screen answering them", () => {
    // Deliberate: the tap then opens the app at its root. Sending a URL for these would land
    // the user on a screen that has nothing to do with the notification. Mirrors the `null`
    // that `notificationTarget` returns for the same types on the frontend.
    for (const type of [
      "workout_reminder",
      "subscription",
      "referral",
      "support",
      "system",
      "account",
    ] as const)
      expect(pushTarget(type), type).toBeNull();
  });
});
