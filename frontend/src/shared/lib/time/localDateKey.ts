/**
 * Возвращает локальную календарную дату в виде `YYYY-MM-DD`
 * (getFullYear/getMonth/getDate, с ведущими нулями) — без таймзонных
 * сдвигов от toISOString(). Используется как ключ «раз в день».
 */
export function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
