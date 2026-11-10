import { fetchRelease, recordReloadAttempt, wasReloadAttempted } from './release';
import { prepareWorker } from './worker';

export interface UpdateState {
  release: string | null;
  applying: boolean;
  error: string | null;
}

interface Options {
  currentBuild: string;
  /** Null allows a reload; otherwise a user-facing reason explains the blocker. */
  blocked: () => Promise<string | null>;
  automatic: () => boolean;
  persist: () => Promise<void>;
  changed: (state: UpdateState) => void;
  latest?: typeof fetchRelease;
  prepare?: typeof prepareWorker;
  reload?: () => void;
}

const RETRY_MESSAGE = 'Не удалось загрузить обновление. Проверьте подключение и повторите.';

export function createUpdateManager(options: Options) {
  let state: UpdateState = { release: null, applying: false, error: null };
  let checking = false;
  let disposed = false;
  const latest = options.latest ?? fetchRelease;
  const prepare = options.prepare ?? prepareWorker;
  const publish = (patch: Partial<UpdateState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    options.changed(state);
  };
  const automatic = () =>
    options.automatic() && !!state.release && !wasReloadAttempted(state.release);

  const apply = async (manual = false): Promise<void> => {
    if (disposed || !state.release || state.applying || (!manual && !automatic())) return;
    publish({ applying: true, error: null });
    try {
      const blocked = await options.blocked();
      if (blocked) {
        publish({ applying: false, error: manual ? blocked : null });
        return;
      }
      const release = await latest(AbortSignal.timeout(10_000));
      if (disposed) return;
      if (release.buildId === options.currentBuild) {
        publish({ release: null, applying: false });
        return;
      }
      await prepare(release.buildId);
      if (disposed) return;
      await options.persist();
      // The user may start editing while files are downloading.
      const nowBlocked = await options.blocked();
      if (disposed || nowBlocked || (!manual && !automatic())) {
        publish({ applying: false, error: manual ? nowBlocked : null });
        return;
      }
      recordReloadAttempt(release.buildId);
      (options.reload ?? (() => window.location.reload()))();
    } catch {
      publish({ applying: false, error: RETRY_MESSAGE });
    }
  };

  return {
    async check(): Promise<void> {
      if (disposed || checking || state.applying) return;
      checking = true;
      try {
        const release = await latest(AbortSignal.timeout(10_000));
        if (disposed) return;
        publish({ release: release.buildId === options.currentBuild ? null : release.buildId });
      } catch {
        // Offline and incomplete rollouts keep the current cached app usable.
      } finally {
        checking = false;
      }
      if (automatic()) await apply();
    },
    apply,
    dispose: () => {
      disposed = true;
    },
  };
}
