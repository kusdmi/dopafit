/**
 * Русское склонение существительного по числу.
 *
 * Русский выбирает одну из трёх форм по последним цифрам числа:
 *   1, 21, 31…      → единственная («1 подход»)
 *   2–4, 22–24…     → форма родительного единственного («3 подхода»)
 *   0, 5–20, 25–30… → родительный множественного («5 подходов»)
 * Числа 11–14 — исключение: они всегда берут последнюю форму («11 подходов»),
 * несмотря на то, что оканчиваются на 1–4.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count) % 100;
  if (n >= 11 && n <= 14) return many;
  const last = n % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function sets(count: number): string {
  return `${count} ${plural(count, 'подход', 'подхода', 'подходов')}`;
}

export function reps(count: number): string {
  return `${count} ${plural(count, 'повторение', 'повторения', 'повторений')}`;
}

/** Подпись объёма упражнения: «4 подхода × 8 повторений». */
export function volumeLabel(setCount: number, repCount: number): string {
  return `${sets(setCount)} × ${reps(repCount)}`;
}
