import type { components } from '@/shared/api/schema';

type Status = components['schemas']['ClientStatus'];

// Бейдж статуса клиента на семантических токенах темы:
// managed-стаб → "Мой"; active-аккаунт → "Активный" (success);
// archived/unlinked → "Неактивный" (нейтральный muted).
//
// Figma 1095:3053 / 1095:3113 рисует статус КОНТУРНОЙ пилюлей (обводка + текст
// одной роли), а не мягкой заливкой — форма приведена к макету. Фиолетовой
// шкалы `trainer-*` в переменных макета не существует (единственный фиолетовый
// DS — «Ан - Фиол.» #C96EFF = `--color-chart-4`), поэтому «Мой» переведён с
// выдуманных до макетов `trainer-soft-*` на фиолетовый токен серии 4.
// Здесь цвет — ТЕКСТ и обводка на карточке, поэтому берём тематический алиас
// `chart-4-text`: сам `chart-4` в светлой теме даёт всего 2.58:1.
interface Variant {
  label: string;
  className: string;
}

function resolve(status: Status, managed: boolean): Variant {
  if (status === 'active') {
    return managed
      ? { label: 'Мой', className: 'border-chart-4-text text-chart-4-text' }
      : { label: 'Активный', className: 'border-success text-success' };
  }
  return { label: 'Неактивный', className: 'border-line text-muted' };
}

interface Props {
  status: Status;
  /** True when the client is a stub (no linked account) — renders "Мой". */
  managed?: boolean;
  /** Forwarded as a slot attribute; only positions correctly as a DIRECT child of IonItem. */
  slot?: string;
}

export function StatusBadge({ status, managed = false, slot }: Props) {
  const { label, className } = resolve(status, managed);
  return (
    <span
      slot={slot}
      className={`text-body-m inline-flex shrink-0 items-center rounded-[14px] border p-[10px] ${className}`}
    >
      {label}
    </span>
  );
}
