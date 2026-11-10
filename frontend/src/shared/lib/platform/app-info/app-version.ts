import { env } from '@/shared/config/env';

/**
 * Версия установленного приложения.
 *
 * На нативе берётся из Capacitor `App.getInfo()` — она отражает версию сборки,
 * которую пользователь реально установил, а не версию исходников, вшитую в
 * JS-бандл. Web и любой сбой плагина падают на версию из `package.json`,
 * проброшенную через `define`: экран настроек — единственное место, откуда
 * пользователь берёт версию для поддержки, и он не должен пустовать или падать
 * из-за недоступного нативного API.
 */
export async function getAppVersion(): Promise<string> {
  if (!env.isNative) return __APP_VERSION__;
  try {
    const { App } = await import('@capacitor/app');
    const { version } = await App.getInfo();
    return version || __APP_VERSION__;
  } catch {
    return __APP_VERSION__;
  }
}
