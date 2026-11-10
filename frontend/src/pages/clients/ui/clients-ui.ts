// Локальные классы-константы тренерских экранов клиентов.
//
// Макеты Figma 1094:2933 (список клиентов), 1100:3247 (редактирование),
// 1101:3678/1101:3927 (добавление клиента), 1084:3883 (мой тренер) собраны из
// одного набора форм: карточка с обводкой 14px, ряд статистики, цветные
// «роль-кнопки». Держим значения в одном месте, чтобы экраны не разъезжались,
// но НЕ выносим в shared/ui — паттерны подтверждены пока только здесь
// (тот же принцип, что pages/programs/ui/program-ui.ts).
//
// Только семантические токены тем: без #hex, bg-white/black, text-white/black.

/** Карточка с обводкой — база всех блоков на экранах клиентов: радиус 14px,
 *  padding 10px, нейтральная обводка (в макете нейтральный 600 = `--line`
 *  в тёмной теме; берём тематический `border-line`, чтобы в светлой теме
 *  рамка инвертировалась вместе со шкалой). */
export const clientCard = 'w-full rounded-[14px] border border-line p-[10px]';

/** Та же карточка, но подсвеченная ролью — шапка клиента на экране
 *  редактирования (1100:3225, акцент) и блоки выбора способа добавления
 *  (1101:3491/3492/3507 — фиолетовый / акцент / синий). */
export function accentCard(role: 'brand' | 'chart-2' | 'chart-4'): string {
  const border = {
    brand: 'border-brand-400',
    'chart-2': 'border-chart-2',
    'chart-4': 'border-chart-4-text',
  }[role];
  return `w-full rounded-[14px] border ${border} p-[10px]`;
}

/** Плитка статистики над списком клиентов (1095:3017/3018/3025): обводка ролью,
 *  подпись Body M и значение H2 по центру. Три плитки в ряд, gap 15px.
 *
 *  `basis-0` обязателен: один `flex-1` делит между плитками только СВОБОДНОЕ
 *  место, поэтому плитка с подписью «Всего тренировок» выходила шире плитки
 *  «Активных». С нулевой основой три плитки получают ровно по трети.
 *  Значение прижато к низу (`mt-auto` в StatCard), иначе подпись в две строки
 *  опускала цифру ниже соседних. */
export function statTile(role: 'brand' | 'success' | 'chart-4'): string {
  const border = {
    brand: 'border-brand-400',
    success: 'border-success',
    'chart-4': 'border-chart-4-text',
  }[role];
  return `flex flex-1 basis-0 flex-col items-center gap-[5px] rounded-[14px] border ${border} p-[10px] text-center`;
}

/** Строка-счётчик тренировок внутри карточки клиента (1095:3047):
 *  во всю ширину, обводка и текст — фиолетовый токен серии графиков 4
 *  («Ан - Фиол.» #C96EFF из макета), в тематическом варианте `chart-4-text`:
 *  это текст и контур на карточке, а фиксированный chart-4 в светлой теме
 *  даёт 2.58:1. */
export const workoutCountRow =
  'flex w-full items-center justify-center rounded-[14px] border border-chart-4-text p-[10px] text-body-m text-chart-4-text';

/** Пилюля статуса клиента в списке (1095:3053 активный / 1095:3113 неактивный):
 *  обводка + текст одной роли, радиус 14px. */
export function statusPill(active: boolean): string {
  return [
    'shrink-0 rounded-[14px] border p-[10px] text-body-m',
    active ? 'border-success text-success' : 'border-line text-muted',
  ].join(' ');
}

/** Подпись поля над инпутом (1100:3193 / 1098:3134): Body M, обычный контент. */
export const fieldLabel = 'text-body-m text-content';

/** Маленькая дата-плашка под подписью (1100:3199/3220): высота 40px,
 *  радиус 14px, Caption по центру. */
export const dateBox =
  'flex h-[40px] w-full items-center justify-center rounded-[14px] border border-line p-[10px] text-caption';
