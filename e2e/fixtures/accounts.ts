import type { BrowserContext, Page } from '@playwright/test';

import { Api, type AuthResponse } from './api.ts';
import { nextAccountLabel, runEmail } from './run-id.ts';
import { paths } from '../support/paths.ts';

/** Published development credentials, created by `seedDemoUsers` in the reset script. */
export const DEMO_PASSWORD = 'Dopafit1Demo';
export const DEMO_CLIENT_EMAIL = 'client@dopafit.dev';
export const DEMO_TRAINER_EMAIL = 'trainer@dopafit.dev';

/**
 * The fixed code the stand issues instead of mailing one.
 *
 * `DOPAFIT_DEV_VERIFICATION_CODE` is "000000" both as the backend default
 * (backend/src/config.ts) and as an explicit value on `backend-e2e`, and the
 * stand has no mail channel at all — so this is the only code a registration can
 * confirm with.
 */
export const DEV_VERIFICATION_CODE = '000000';
/** Second code issued to the same contact and purpose by the isolated e2e stand. */
export const RESEND_VERIFICATION_CODE = '000001';
/** Third code for AUTH-05 after a second successful resend. */
export const SECOND_RESEND_VERIFICATION_CODE = '000002';

/** idb-keyval's default store, which every web storage adapter of the app uses. */
const IDB_DATABASE = 'keyval-store';
const IDB_STORE = 'keyval';
const ACCESS_KEY = 'dopafit.access_token';
const REFRESH_KEY = 'dopafit.refresh_token';
/** zustand-persist key of the session store (entities/session/model/store.ts). */
const SESSION_KEY = 'dopafit.session';
/**
 * Install marker, in localStorage under Capacitor Preferences' web prefix.
 *
 * `ensureFreshInstall` (shared/lib/platform/storage/install-marker.ts) runs on
 * every boot and, finding no marker, wipes the tokens: on iOS the Keychain
 * survives a reinstall, so a first launch has to drop inherited credentials. A
 * seeded browser profile looks exactly like that first launch, so without the
 * marker the app deletes the session we just wrote and shows the guest screen.
 */
const INSTALL_MARKER_KEY = 'CapacitorStorage.dopafit.install_marker';

/** Exactly the shape the app persists: the token pair plus the session user. */
export type Session = AuthResponse;

type Entry = [key: string, value: string];

/**
 * Records the app reads on boot to consider itself signed in: the two token keys
 * behind `secure-tokens.ts`, plus the persisted session store that
 * `isAuthenticated` is rehydrated from. Seeding only the tokens leaves the app
 * signed out, because `isAuthenticated` is derived from the persisted user.
 */
function records(session: Session): Entry[] {
  return [
    [ACCESS_KEY, session.tokens.access_token],
    [REFRESH_KEY, session.tokens.refresh_token],
    [SESSION_KEY, JSON.stringify({ state: { user: session.user }, version: 0 })],
  ];
}

/**
 * Writes the records into IndexedDB from inside the page, awaited.
 *
 * Runs as page code rather than through `storageState`, whose IndexedDB support is
 * version-dependent and opaque, and the store it has to land in is a concrete
 * contract of the app (`keyval-store` / `keyval`, idb-keyval's default).
 *
 * The database is created at version 1 with the same store name idb-keyval uses,
 * so the library's own `open` later finds it and does not upgrade it.
 */
function writeRecords(page: Page, session: Session): Promise<void> {
  return page.evaluate(
    ({ database, store, entries }: { database: string; store: string; entries: Entry[] }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(database, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(store);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(store, 'readwrite');
          for (const [key, value] of entries) tx.objectStore(store).put(value, key);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { database: IDB_DATABASE, store: IDB_STORE, entries: records(session) },
  );
}

/**
 * Hands a browser context an existing session and leaves it on the signed-in home
 * screen.
 *
 * IndexedDB is per-origin, so the page has to be ON the origin before the write.
 * It lands on a static asset rather than a route: on a route the app boots and
 * races the write. `robots.txt` is same-origin and starts no application code, so
 * the records are already in place when the app first reads them. The write is
 * awaited rather than fired from an init script, so a test can never observe a
 * half-written session.
 */
export async function seedSession(context: BrowserContext, session: Session): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('/robots.txt');
  await page.evaluate((key) => localStorage.setItem(key, '1'), INSTALL_MARKER_KEY);
  await writeRecords(page, session);
  await page.goto(paths.home);
  return page;
}

/**
 * Signs a demo account in over the API and returns everything `seedSession` needs.
 * Demo users have `login_method: "password"`, so the code flow does not apply to
 * them — see seedDemoUsers in backend/src/platform/db/seed.ts.
 */
export async function passwordSession(email: string, password = DEMO_PASSWORD): Promise<Session> {
  const api = await Api.create();
  try {
    return await api.login(email, password);
  } finally {
    await api.dispose();
  }
}

/**
 * Onboarding answers for an account a fixture registers.
 *
 * Fixed rather than random: the numbers end up in the weight chart and the
 * analytics a later test reads, and a value that changes per run cannot be
 * asserted against. The birth date is a literal and not "today minus 30 years"
 * because `OnboardingRequest` only bounds the implied age at 10..120 — any date
 * inside that window is equally valid and a computed one would only make the
 * request harder to read.
 */
const ONBOARDING = {
  gender: 'male',
  birth_date: '1990-05-15',
  height: 180,
  weight: 80,
} as const;

/**
 * Registers a new account over the REST API and returns its session.
 *
 * Three calls, the same three the wizard makes (features/auth/register/RegisterFlow.tsx):
 *
 * 1. `POST /api/v1/auth/register` — email, full name, role and the consent the
 *    handler refuses to proceed without; answers 201 with a registration token.
 * 2. `POST /api/v1/auth/register/verify` — the code, which on the stand is always
 *    `DEV_VERIFICATION_CODE`; this is the call that issues the tokens, so the
 *    account is usable from here on.
 * 3. `POST /api/v1/users/me/onboarding` — the wizard's last two steps.
 *
 * The password step is deliberately skipped: the wizard offers it as an
 * alternative to the code, and an account that verified its email keeps
 * `login_method: "code"`, which is exactly what the demo accounts cannot offer
 * (see passwordSession above). Onboarding is NOT skipped even though a session
 * already exists without it — it writes the profile and a weight measurement for
 * today, so an account created without it would differ from every account a real
 * user has.
 *
 * The registration itself goes through the API and not the UI on purpose: the UI
 * wizard is what AUTH-01/02 are for, and driving it here would make an unrelated
 * failure fail every test that needs a fresh account.
 */
async function register(role: 'client' | 'trainer', runId: string): Promise<Session> {
  const email = runEmail(runId, nextAccountLabel(role));
  const api = await Api.create();
  try {
    await api.expectOk(
      `register ${email}`,
      api.anonymous('/api/v1/auth/register', {
        email,
        full_name: role === 'trainer' ? `Тренер ${runId}` : `Клиент ${runId}`,
        role,
        personal_data_consent: true,
      }),
      201,
    );
    const session = await api.expectOk<Session>(
      `verify ${email}`,
      api.anonymous('/api/v1/auth/register/verify', { email, code: DEV_VERIFICATION_CODE }),
      200,
    );
    await api.expectOk(
      `onboarding ${email}`,
      api.post('/api/v1/users/me/onboarding', session.tokens, {
        ...ONBOARDING,
        // The field is the trainer branch of the wizard's last step and the
        // backend stores it verbatim, so a client must not send one.
        ...(role === 'trainer' ? { clients_per_month: 10 } : {}),
      }),
      200,
    );
    return session;
  } finally {
    await api.dispose();
  }
}

/** A client account registered for this run, with onboarding completed. */
export function registerClient(runId: string): Promise<Session> {
  return register('client', runId);
}

/** A trainer account registered for this run, with onboarding completed. */
export function registerTrainer(runId: string): Promise<Session> {
  return register('trainer', runId);
}
