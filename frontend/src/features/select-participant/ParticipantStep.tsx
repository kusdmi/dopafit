import { Icon, useToast } from '@/shared/ui/primitives';
import { warningOutline } from '@/shared/ui/icons';

import { useClient } from '@/entities/client/api/use-client';
import { useClients } from '@/entities/client/api/use-clients';
import { ContraindicationsBlock } from '@/entities/client/ui/ContraindicationsBlock';
import type { Participant } from '@/entities/workout/model/types';

// Пилюля выбора (Figma 1009:2079 / 1009:2084 / 1009:2138): прозрачная, радиус
// 14px, обводка переключается акцентом. Тот же вид, что у выбора дня на
// StartWorkoutPage, но правило FSD запрещает features→pages, поэтому класс
// объявлен здесь, а не импортирован из pages/programs/ui.
//
// Выбранный клиент залит акцентом (1009:2138: #FAFAF8 на #FF7003), поэтому
// цвет текста ЗАМЕНЯЕТСЯ, а не дописывается к базовому `text-content`: обе
// утилиты лежат в одном слое Tailwind, и порядок решает позиция в исходнике, а
// не порядок склейки строки. Приписанный `text-chart-1-fg` проигрывал
// `text-content`, и в светлой теме на оранжевой заливке получался чёрный текст.
function choicePill(selected: boolean, filled = false): string {
  const base =
    'flex w-full items-center justify-center rounded-[14px] border p-[10px] text-body-m transition-colors';
  if (filled && selected) return `${base} border-brand-400 bg-brand-400 text-chart-1-fg`;
  return `${base} ${selected ? 'border-brand-400' : 'border-line'} text-content`;
}

interface Props {
  value: Participant | null;
  onChange: (p: Participant) => void;
}

const NO_CLIENTS_MESSAGE =
  'Пока нет клиентов — добавьте их на вкладке «Клиенты», чтобы тренировать кого-то кроме себя';

export function ParticipantStep({ value, onChange }: Props) {
  const { data, isLoading } = useClients();
  const [presentToast] = useToast();
  const active = (data?.items ?? []).filter((c) => c.status === 'active');
  // Пока список грузится, «Клиент» не блокируем: иначе кнопка успевала
  // мигнуть недоступной у тренера, у которого клиенты есть.
  const hasClients = isLoading || active.length > 0;
  const mode = value?.kind ?? null;
  const selectedClientId = value?.kind === 'client' ? value.clientId : null;
  const detail = useClient(selectedClientId ?? '');
  const selectedDetail = selectedClientId ? detail.data : undefined;

  return (
    <div className="flex flex-col gap-[15px] text-content">
      {/* Заголовок шага — <h2>: <h1> страницы живёт в шапке (PageTitle). */}
      <h2 className="sr-only">Кто тренируется?</h2>
      {/* 1009:2077 — две пилюли в ряд, gap 15px. role=radiogroup вместо
          сегмент-капсулы: в макете это обычные пилюли выбора. */}
      <div role="radiogroup" aria-label="Кто тренируется?" className="flex items-center gap-[15px]">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'self'}
          onClick={() => onChange({ kind: 'self' })}
          className={choicePill(mode === 'self')}
        >
          Я
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'client'}
          // `aria-disabled`, а НЕ `disabled`: настоящий disabled не отдаёт
          // события, и по клику нечем было бы объяснить, почему кнопка
          // недоступна. Кнопка остаётся фокусируемой и объявляется
          // недоступной, но клик доходит и показывает тост.
          aria-disabled={!hasClients}
          onClick={() => {
            if (!hasClients) {
              void presentToast({ message: NO_CLIENTS_MESSAGE, duration: 3000 });
              return;
            }
            if (active[0]) {
              onChange({
                kind: 'client',
                clientId: active[0].id,
                clientName: active[0].display_name,
              });
            }
          }}
          className={`${choicePill(mode === 'client')} aria-disabled:opacity-50`}
        >
          Клиент
        </button>
      </div>

      {mode === 'client' && active.length > 0 && (
        <section className="flex flex-col gap-[10px]">
          <h3 className="text-h3 text-content">Клиент</h3>
          {/* 1009:2149 — клиенты вертикальным списком таких же пилюль, выбранная
              залита акцентом (1009:2138). Поиска в макете нет: список клиентов
              тренера короткий, а поле над ним читалось как часть выбора дня. */}
          <ul role="radiogroup" aria-label="Выберите клиента" className="flex flex-col gap-[10px]">
            {active.map((c) => {
              const selected = c.id === selectedClientId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      onChange({ kind: 'client', clientId: c.id, clientName: c.display_name })
                    }
                    className={choicePill(selected, true)}
                  >
                    <span className="flex items-center gap-2">
                      {c.display_name}
                      {c.has_injuries && (
                        <Icon
                          icon={warningOutline}
                          aria-label="Есть ограничения по здоровью"
                          className={selected ? '' : 'text-danger'}
                        />
                      )}
                    </span>
                  </button>
                  {selected && selectedDetail && (
                    <div className="mt-2">
                      <ContraindicationsBlock
                        injuries={selectedDetail.injuries}
                        note={selectedDetail.note}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
