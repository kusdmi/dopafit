/**
 * Плитка «подпись + значение» из макета 758:2726.
 *
 * ```
 * обводка   1px --neutral-600 · радиус 14px · padding 10px 22px
 * подпись   11px/400 нейтральная
 * значение  16px/600 акцентом
 * ```
 *
 * Это НЕ поле ввода, хотя внешне похоже на него: запись замера в этой модалке
 * только показывается, редактирование идёт через «Загрузить для
 * редактирования». Поэтому здесь обычный <div> с текстом, а не
 * `<input disabled>` — скринридер прочитает «Рост 175 см», а не «поле ввода,
 * недоступно».
 */
export function ValueTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[57px] flex-col justify-center rounded-[14px] border border-line px-[22px] py-[10px]">
      <span className="text-caption text-content">{label}</span>
      <span className="text-h3 text-brand-text">{value}</span>
    </div>
  );
}
