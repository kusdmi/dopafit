import type { NotificationType } from "./types.js";

/**
 * The screen a system push opens when the user taps it.
 *
 * ⚠️ DUPLICATED RULE — keep in sync with the frontend.
 * The same "a notification of type X is dealt with on screen Y" rule also lives in
 * `frontend/src/entities/notification/model/target.ts` (`notificationTarget`), which the
 * in-app notification list uses. The two cannot share a module: this one runs in Node while
 * building an encrypted push payload, the other in the browser while rendering a list, and
 * they are shipped as separate artifacts. Route literals likewise cannot be imported from
 * the frontend's `shared/config/paths.ts`, so the path below is written out here.
 *
 * Why the backend computes the route at all, rather than sending only `type` and letting the
 * frontend decide: a tap on a push when no window is open is served by the service worker's
 * `clients.openWindow(url)` (frontend/src/sw.ts), and a service worker holds none of the
 * application's routing — it can only be handed a URL. Sending just the type would leave the
 * cold-start case, which is the common one for a push, with nowhere to go.
 *
 * The tab is carried as a query parameter, not as history state: `openWindow` opens a plain
 * URL and there is no history entry to attach state to. `TrainerClientsView` reads it (see
 * `frontend/src/pages/clients/TrainerClientsView.tsx`); a client has no tabs there and simply
 * ignores it.
 *
 * Every other type has no screen that answers it, so it gets no URL and the tap opens the
 * app at its root — the same deliberate `null` that `notificationTarget` returns for them.
 */
const routes: Record<NotificationType, string | null> = {
  workout_reminder: null,
  subscription: null,
  referral: null,
  support: null,
  system: null,
  link_request: "/app/settings/connections?tab=requests",
  account: null,
};

/** The relative URL a push of this type opens, or `null` when there is nowhere to go. */
export function pushTarget(
  type: NotificationType,
  data?: Record<string, unknown> | null,
): string | null {
  const route = routes[type];
  if (type !== "link_request" || !route || typeof data?.request_id !== "string") return route;
  return `${route}&request_id=${encodeURIComponent(data.request_id)}`;
}
