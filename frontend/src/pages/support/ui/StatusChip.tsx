const STATUS_LABELS: Record<string, string> = {
  open: 'Открыт',
  answered: 'Отвечено',
  closed: 'Закрыт',
};

export function StatusChip({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  // Статус — это ЗНАЧЕНИЕ, а не отдельный объект: чип несёт тонированную
  // заливку своего же цвета и не несёт обводки — она повторяла бы рамку строки
  // списка, внутри которой чип лежит (design-system.md «Вложенность карточек»).
  const tone =
    status === 'answered'
      ? 'text-success bg-[color-mix(in_srgb,var(--success-text)_15%,transparent)]'
      : status === 'closed'
        ? 'text-muted bg-card-light'
        : 'text-brand-text bg-[color-mix(in_srgb,var(--brand-text)_15%,transparent)]';
  // Padding асимметричный: при text-tag (11px, line-height 1) равномерные 10px
  // дают высоту ~31px и распирают строку рядом с двухстрочным блоком
  // «тема + дата».
  return (
    <span className={`shrink-0 rounded-[14px] px-[10px] py-[5px] text-tag ${tone}`}>
      {label}
    </span>
  );
}
