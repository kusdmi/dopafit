import { tokenStorage } from '@/shared/api/tokens';

const MARKER_KEY = 'dopafit.install_marker';

/**
 * Keychain (iOS) переживает переустановку приложения. На первом запуске после
 * свежей установки маркера в Preferences нет → чистим Keychain от унаследованных
 * токенов и ставим маркер. На последующих запусках — no-op.
 *
 * Чистим через tokenStorage.clear() (а не низкоуровневый secureTokens.clear()),
 * чтобы поднять generation-счётчик: любой refresh, стартовавший до вайпа, увидит
 * расхождение поколения и не воскресит унаследованные токены.
 */
export async function ensureFreshInstall(): Promise<void> {
  const { Preferences } = await import('@capacitor/preferences');
  const { value } = await Preferences.get({ key: MARKER_KEY });
  if (value) return;
  await tokenStorage.clear();
  await Preferences.set({ key: MARKER_KEY, value: '1' });
}
