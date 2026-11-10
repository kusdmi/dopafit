import { matchPath } from 'react-router-dom';

import { env } from '@/shared/config/env';
import {
  paths,
  program,
  programEdit,
  programShare,
  programStart,
  programSession,
  exercise,
  workoutSummary,
  supportThread,
  connectionEdit,
  connectionMeasurements,
} from '@/shared/config/paths';

const COUNTER_ID = 114077673;
const SCRIPT_URL = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`;
const QUEUE_LIMIT = 50;
const patterns = [
  ...Object.values(paths),
  program(':id'),
  programEdit(':id'),
  programShare(':id'),
  programStart(':id'),
  programSession(':id'),
  exercise(':id'),
  workoutSummary(':id'),
  supportThread(':id'),
  connectionEdit(':id'),
  connectionMeasurements(':id'),
];
const redirects: readonly string[] = [
  paths.root,
  paths.app,
  paths.invite,
  paths.settingsContacts,
  paths.settingsSecurity,
  paths.subscriptionCheckout,
];

type Metrika = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
declare global {
  interface Window {
    ym?: Metrika;
    dataLayer?: unknown[];
  }
}

let initialized = false;
let previousPath: string | undefined;
let previousUrl: string | undefined;
let role: 'guest' | 'client' | 'trainer' = 'guest';
let previousContext: string | undefined;

export type MetrikaGoal =
  | 'registration_completed'
  | 'login_succeeded'
  | 'program_created'
  | 'measurement_saved'
  | 'workout_started'
  | 'workout_completed'
  | 'premium_activated';

interface GoalParams {
  method?: 'password' | 'code' | 'two_factor';
  participant?: 'self' | 'client';
}

/** Keep identifiers, invite codes, query strings and hashes out of page reports. */
export function metrikaPageUrl(pathname: string): string | undefined {
  const pattern = patterns.find((pattern) => matchPath({ path: pattern, end: true }, pathname));
  if (!pattern || redirects.includes(pattern)) return undefined;
  return `${location.origin}${pattern}`;
}

function referrerUrl(): string {
  if (!document.referrer) return '';
  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === location.origin
      ? (metrikaPageUrl(referrer.pathname) ?? referrer.origin)
      : referrer.origin;
  } catch {
    return '';
  }
}

function loadScript(): void {
  if (Array.from(document.scripts).some((script) => script.src === SCRIPT_URL)) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = SCRIPT_URL;
  script.referrerPolicy = 'origin';
  // A blocked/offline request must neither break navigation nor prevent a later retry.
  script.onerror = () => script.remove();
  document.head.append(script);
}

function ensureCounter(): boolean {
  if (!import.meta.env.PROD || env.isNative || location.hostname !== 'app.dopafit.ru') return false;
  if (!window.ym) {
    const queued: Metrika = (...args) => {
      const queue = queued.a ?? (queued.a = []);
      // Preserve init and only the most recent commands if the SDK stays blocked.
      if (queue.length >= QUEUE_LIMIT) queue.splice(1, 1);
      queue.push(args);
    };
    queued.l = Date.now();
    window.ym = queued;
  }

  try {
    if (!initialized) {
      window.dataLayer ??= [];
      window.ym(COUNTER_ID, 'init', {
        ssr: true,
        defer: true,
        webvisor: true,
        clickmap: true,
        ecommerce: 'dataLayer',
        referrer: referrerUrl(),
        url: metrikaPageUrl(location.pathname) ?? location.origin,
        accurateTrackBounce: true,
        trackLinks: true,
      });
      initialized = true;
    }
    loadScript();
    return true;
  } catch {
    return false;
  }
}

function contextParams() {
  return {
    app_version: __APP_VERSION__,
    app_mode: window.matchMedia?.('(display-mode: standalone)')?.matches ? 'pwa' : 'browser',
    role,
  };
}

export function trackMetrikaContext(nextRole: 'guest' | 'client' | 'trainer'): void {
  role = nextRole === 'client' || nextRole === 'trainer' ? nextRole : 'guest';
  if (!ensureCounter()) return;
  try {
    const params = contextParams();
    const key = JSON.stringify(params);
    if (previousContext === key) return;
    window.ym!(COUNTER_ID, 'params', params);
    previousContext = key;
  } catch {
    // Context must not affect authentication or rendering.
  }
}

export function trackMetrikaGoal(goal: MetrikaGoal, params: GoalParams = {}): void {
  if (!ensureCounter()) return;
  try {
    // Copy only low-cardinality fields; never forward API bodies or responses.
    const safeParams: Record<string, string> = contextParams();
    if (params.method && ['password', 'code', 'two_factor'].includes(params.method)) {
      safeParams.method = params.method;
    }
    if (params.participant === 'self' || params.participant === 'client') {
      safeParams.participant = params.participant;
    }
    window.ym!(COUNTER_ID, 'reachGoal', goal, safeParams);
  } catch {
    // Analytics failures never roll back a successful user action.
  }
}

export function trackMetrikaPage(pathname: string): void {
  const url = metrikaPageUrl(pathname);
  if (!url || !ensureCounter()) return;
  try {
    if (pathname === previousPath) return;
    window.ym!(COUNTER_ID, 'hit', url, {
      referer: previousUrl ?? referrerUrl(),
      title: 'DopaFit',
    });
    previousPath = pathname;
    previousUrl = url;
  } catch {
    // Telemetry is optional; SDK failures must not affect app routes or forms.
  }
}
