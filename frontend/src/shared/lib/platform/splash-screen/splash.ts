import { env } from '@/shared/config/env';

/** Скрыть нативный splash-экран. Web — no-op. */
export async function hideSplash(): Promise<void> {
  if (!env.isNative) return;
  const { SplashScreen } = await import('@capacitor/splash-screen');
  await SplashScreen.hide();
}
