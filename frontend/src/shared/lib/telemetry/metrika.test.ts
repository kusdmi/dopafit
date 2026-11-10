import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { paths, program, programEdit, connectionMeasurements } from '@/shared/config/paths';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('@/shared/config/env', () => ({
  env: {
    get isNative() {
      return native.value;
    },
  },
}));

beforeEach(() => {
  vi.resetModules();
  native.value = false;
  vi.stubEnv('PROD', true);
  vi.stubGlobal('location', new URL('https://app.dopafit.ru'));
  delete window.ym;
  delete window.dataLayer;
});

afterEach(() => {
  for (const script of Array.from(document.scripts)) {
    if (script.src.includes('mc.yandex.ru')) script.remove();
  }
  delete window.ym;
  delete window.dataLayer;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('initializes once and counts SPA navigation, Back and separate detail visits without identifiers', async () => {
  const { trackMetrikaPage } = await import('./metrika');
  trackMetrikaPage(paths.home);
  trackMetrikaPage(paths.home);
  trackMetrikaPage(paths.programs);
  trackMetrikaPage(program('private-one'));
  trackMetrikaPage(program('private-two'));
  trackMetrikaPage(paths.home);
  expect(document.scripts).toHaveLength(1);
  expect(document.scripts[0].src).toBe('https://mc.yandex.ru/metrika/tag.js?id=114077673');
  expect(document.scripts[0].async).toBe(true);
  expect(document.scripts[0].referrerPolicy).toBe('origin');
  const calls = window.ym!.a!;
  expect(calls.filter((call) => call[1] === 'init')).toHaveLength(1);
  expect(calls[0]).toEqual([
    114077673,
    'init',
    expect.objectContaining({
      ssr: true,
      defer: true,
      webvisor: true,
      clickmap: true,
      ecommerce: 'dataLayer',
      accurateTrackBounce: true,
      trackLinks: true,
    }),
  ]);
  expect(calls.filter((call) => call[1] === 'hit').map((call) => call[2])).toEqual([
    `https://app.dopafit.ru${paths.home}`,
    `https://app.dopafit.ru${paths.programs}`,
    `https://app.dopafit.ru${program(':id')}`,
    `https://app.dopafit.ru${program(':id')}`,
    `https://app.dopafit.ru${paths.home}`,
  ]);
  expect(JSON.stringify(calls)).not.toContain('private');
  expect(window.dataLayer).toEqual([]);
});

it('normalizes detail routes and skips redirects, unknown paths and unsafe query strings', async () => {
  const { metrikaPageUrl, trackMetrikaPage } = await import('./metrika');
  expect(metrikaPageUrl(programEdit('private'))).toBe(
    `https://app.dopafit.ru${programEdit(':id')}`,
  );
  expect(metrikaPageUrl(connectionMeasurements('private'))).toBe(
    `https://app.dopafit.ru${connectionMeasurements(':id')}`,
  );
  for (const path of [
    paths.root,
    paths.invite.replace(':code', 'secret'),
    '/unrecognized/private',
  ]) {
    trackMetrikaPage(path);
  }
  expect(window.ym).toBeUndefined();
  vi.spyOn(document, 'referrer', 'get').mockReturnValue(
    'https://external.test/private?email=private',
  );
  trackMetrikaPage(paths.login);
  expect(window.ym!.a![0][2]).toMatchObject({ referrer: 'https://external.test' });
  expect(JSON.stringify(window.ym!.a)).not.toContain('private');
});

it.each(['dev', 'local-preview', 'native'] as const)('sends nothing in %s', async (mode) => {
  if (mode === 'dev') vi.stubEnv('PROD', false);
  if (mode === 'local-preview') vi.stubGlobal('location', new URL('http://localhost:4173'));
  if (mode === 'native') native.value = true;
  const { trackMetrikaPage } = await import('./metrika');
  trackMetrikaPage(paths.home);
  expect(window.ym).toBeUndefined();
  expect(document.scripts).toHaveLength(0);
});

it('bounds the SDK queue and retries loading after an offline or blocked request', async () => {
  const { trackMetrikaPage } = await import('./metrika');
  trackMetrikaPage(paths.home);
  document.scripts[0].dispatchEvent(new Event('error'));
  expect(document.scripts).toHaveLength(0);
  for (let index = 0; index < 200; index++) trackMetrikaPage(program(String(index)));
  expect(document.scripts).toHaveLength(1);
  expect(window.ym!.a).toHaveLength(50);
  expect(window.ym!.a![0][1]).toBe('init');
  window.ym = () => {
    throw new Error('SDK unavailable');
  };
  expect(() => trackMetrikaPage(paths.settings)).not.toThrow();
});

it('sends only allowed goal fields and anonymous context, without user IDs', async () => {
  const { trackMetrikaContext, trackMetrikaGoal } = await import('./metrika');
  trackMetrikaContext('client');
  trackMetrikaContext('client');
  const params = { method: 'code' as const, email: 'private', id: 'private', weight: 77 };
  trackMetrikaGoal('login_succeeded', params);
  trackMetrikaGoal('premium_activated');
  trackMetrikaContext('guest');
  const calls = window.ym!.a!;
  expect(calls.filter((call) => call[1] === 'params')).toHaveLength(2);
  expect(calls.find((call) => call[2] === 'login_succeeded')).toEqual([
    114077673,
    'reachGoal',
    'login_succeeded',
    {
      app_version: expect.any(String),
      app_mode: 'browser',
      role: 'client',
      method: 'code',
    },
  ]);
  expect(calls.some((call) => call[1] === 'setUserID')).toBe(false);
  expect(JSON.stringify(calls)).not.toMatch(/private|weight/);
});
