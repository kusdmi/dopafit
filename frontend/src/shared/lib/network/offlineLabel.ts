/** Подпись действия с учётом сети: офлайн → «Недоступно офлайн», иначе обычная.
 * Пара к `disabled={!isOnline}` на кнопках гостевых экранов (вход/регистрация),
 * где офлайн-баннер не показывается — недоступность объясняется на самой кнопке. */
export function offlineLabel(isOnline: boolean, fallback: string): string {
  return isOnline ? fallback : 'Недоступно офлайн';
}
