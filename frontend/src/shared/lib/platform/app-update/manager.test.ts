import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateManager, type UpdateState } from './manager';
import { fetchRelease, recordReloadAttempt } from './release';

function setup(automatic = true) {
  const latest = vi.fn(async () => ({ buildId: 'release-next' }));
  const prepare = vi.fn(async () => {});
  const persist = vi.fn(async () => {});
  const reload = vi.fn();
  const blocked = vi.fn(async (): Promise<string | null> => null);
  const changed = vi.fn<(state: UpdateState) => void>();
  const options = {
    currentBuild: 'release-current',
    latest,
    prepare,
    persist,
    reload,
    blocked,
    changed,
    automatic: vi.fn(() => automatic),
  };
  return { ...options, manager: createUpdateManager(options) };
}

beforeEach(() => sessionStorage.clear());

describe('release updates', () => {
  it('persists data and prepares the matching worker before a single automatic reload', async () => {
    const test = setup();
    await test.manager.check();
    expect(test.prepare).toHaveBeenCalledWith('release-next');
    expect(test.persist).toHaveBeenCalledOnce();
    expect(test.reload).toHaveBeenCalledOnce();
    expect(test.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      test.persist.mock.invocationCallOrder[0],
    );
    expect(test.persist.mock.invocationCallOrder[0]).toBeLessThan(
      test.reload.mock.invocationCallOrder[0],
    );
    // A stale HTTP/SW response on the next page load must never cause a loop.
    const stale = setup();
    await stale.manager.check();
    expect(stale.reload).not.toHaveBeenCalled();
  });

  it('leaves an already current release untouched', async () => {
    const test = setup();
    test.latest.mockResolvedValue({ buildId: 'release-current' });
    await test.manager.check();
    expect(test.prepare).not.toHaveBeenCalled();
    expect(test.reload).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation once a user has interacted with the app', async () => {
    const test = setup(false);
    await test.manager.check();
    expect(test.changed).toHaveBeenLastCalledWith({
      release: 'release-next',
      applying: false,
      error: null,
    });
    expect(test.reload).not.toHaveBeenCalled();
    await test.manager.apply(true);
    expect(test.reload).toHaveBeenCalledOnce();
  });

  it('retains the current app offline and retries on a later successful check', async () => {
    const test = setup();
    test.latest.mockRejectedValueOnce(new Error('offline'));
    await test.manager.check();
    expect(test.reload).not.toHaveBeenCalled();
    await test.manager.check();
    expect(test.reload).toHaveBeenCalledOnce();
  });

  it.each(['Активная тренировка', 'Очередь синхронизации', 'Ошибка хранилища'])(
    'blocks even a confirmed update: %s',
    async (reason) => {
      const test = setup(false);
      test.blocked.mockResolvedValue(reason);
      await test.manager.check();
      await test.manager.apply(true);
      expect(test.prepare).not.toHaveBeenCalled();
      expect(test.reload).not.toHaveBeenCalled();
      expect(test.changed).toHaveBeenLastCalledWith(
        expect.objectContaining({ error: reason, applying: false }),
      );
    },
  );

  it('rechecks safety after downloads and does not interrupt new user input', async () => {
    const test = setup();
    test.prepare.mockImplementation(async () => {
      test.automatic.mockReturnValue(false);
    });
    await test.manager.check();
    expect(test.persist).toHaveBeenCalledOnce();
    expect(test.reload).not.toHaveBeenCalled();
  });

  it('rechecks active writes after persistence', async () => {
    const test = setup(false);
    test.blocked.mockResolvedValueOnce(null).mockResolvedValue('Изменения сохраняются');
    await test.manager.check();
    await test.manager.apply(true);
    expect(test.reload).not.toHaveBeenCalled();
  });

  it.each(['prepare', 'persist'] as const)(
    'fails closed when %s rejects and allows explicit retry',
    async (step) => {
      const test = setup(false);
      test[step].mockRejectedValueOnce(new Error('failed'));
      await test.manager.check();
      await test.manager.apply(true);
      expect(test.reload).not.toHaveBeenCalled();
      expect(test.changed).toHaveBeenLastCalledWith(
        expect.objectContaining({ applying: false, error: expect.stringContaining('повторите') }),
      );
      await test.manager.apply(true);
      expect(test.reload).toHaveBeenCalledOnce();
    },
  );

  it('cancels work when unmounted during a check', async () => {
    const test = setup();
    test.latest.mockImplementation(async () => {
      test.manager.dispose();
      return { buildId: 'release-next' };
    });
    await test.manager.check();
    expect(test.reload).not.toHaveBeenCalled();
    expect(test.prepare).not.toHaveBeenCalled();
  });

  it('does not automatically repeat an attempted release but supports explicit retry', async () => {
    recordReloadAttempt('release-next');
    const test = setup();
    await test.manager.check();
    expect(test.reload).not.toHaveBeenCalled();
    await test.manager.apply(true);
    expect(test.reload).toHaveBeenCalledOnce();
  });
});

describe('release manifest', () => {
  it('uses the same uncached same-origin manifest for browser and installed modes', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ buildId: 'release-next' }));
    await expect(fetchRelease()).resolves.toEqual({ buildId: 'release-next' });
    expect(fetcher).toHaveBeenCalledWith(
      '/version.json',
      expect.objectContaining({ cache: 'no-store' }),
    );
    fetcher.mockRestore();
  });

  it.each([
    Response.json({ buildId: '' }),
    Response.json({ version: '1' }),
    new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('', { status: 503 }),
  ])('rejects incomplete rollouts and HTML fallbacks', async (response) => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    await expect(fetchRelease()).rejects.toThrow();
    fetcher.mockRestore();
  });
});
