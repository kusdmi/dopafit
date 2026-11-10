import { useAvailableParameters } from '@/entities/analytics/api/use-available-parameters';
import { useCustomFields } from '@/entities/measurement/api/use-custom-fields';

import { PARAM_META } from '../config/meta';
import type { BodyParameter } from '../config/types';
import { DateRangeField } from './DateRangeField';
import type { AnalyticsView } from './useAnalyticsView';

interface Props {
  view: AnalyticsView;
  patch: (next: Partial<AnalyticsView>) => void;
}

/**
 * The «Антропометрия» controls (Figma 793:4331 / 852:1812): the period, then
 * the measurements to plot.
 *
 * The mock draws the measurement choice as one field reading "Вес, Талия,
 * Грудь" — a multi-select. Selectable chips are used instead: a native
 * `<select multiple>` is close to unusable on a phone, and the chips carry each
 * series' own colour, which is what ties a choice here to a line on the chart
 * below. The row of chips shows the same summary the mock's field does, just
 * without a second tap to reach it.
 */
export function AnthropometryControls({ view, patch }: Props) {
  // 'pending' — клиент ещё не выбран, поэтому поля запрашиваются свои, а не
  // чужие: подставить чей-то id раньше времени значило бы показать не те поля.
  const available = useAvailableParameters(view.clientId === 'pending' ? null : view.clientId);
  const customFields = useCustomFields(view.clientId === 'pending' ? null : view.clientId);

  const toggleParameter = (id: BodyParameter) => {
    const active = view.parameters.includes(id);
    const next = active ? view.parameters.filter((p) => p !== id) : [...view.parameters, id];
    // Пустой выбор оставил бы пустой график без объяснения, поэтому последний
    // снятый параметр не снимается.
    if (next.length === 0 && view.customSlots.length === 0) return;
    patch({ parameters: next });
  };

  const toggleSlot = (slot: number) => {
    const active = view.customSlots.includes(slot);
    const next = active ? view.customSlots.filter((s) => s !== slot) : [...view.customSlots, slot];
    if (next.length === 0 && view.parameters.length === 0) return;
    patch({ customSlots: next });
  };

  return (
    <>
      <DateRangeField
        label="Период анализа"
        dateFrom={view.dateFrom}
        dateTo={view.dateTo}
        onChange={patch}
      />

      <div className="flex flex-col">
        <span className="py-2.5 text-body-s text-content">
          Выберите замеры для вывода на график
        </span>
        <div className="flex flex-wrap gap-2">
          {PARAM_META.filter((p) => available.data?.parameters.includes(p.id)).map((p) => {
            const active = view.parameters.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleParameter(p.id)}
                // Заливка — цвет самой серии, а текст на ней — парный `onColor`:
                // палитра идёт от #FFD23F до #FF7003, и один фиксированный цвет
                // текста читаем не на всех её концах.
                className="text-body-m min-h-[42px] rounded-[14px] px-5 py-2.5"
                style={
                  active
                    ? { backgroundColor: p.color, color: p.onColor }
                    : { backgroundColor: 'var(--color-card)', color: 'var(--color-content)' }
                }
              >
                {p.label}
              </button>
            );
          })}
          {(customFields.data ?? [])
            .filter((f) => available.data?.custom_slots.includes(f.slot))
            .map((f) => {
              const active = view.customSlots.includes(f.slot);
              return (
                <button
                  key={`custom-${f.slot}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleSlot(f.slot)}
                  className={`text-body-m min-h-[42px] rounded-[14px] px-5 py-2.5 ${
                    active ? 'bg-brand-600 text-neutral-50' : 'bg-card text-content'
                  }`}
                >
                  {f.name}
                  {f.unit ? `, ${f.unit}` : ''}
                </button>
              );
            })}
        </div>
      </div>
    </>
  );
}
