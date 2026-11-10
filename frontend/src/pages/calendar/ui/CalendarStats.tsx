import { peopleOutline } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';
import type { components } from '@/shared/api/schema';

import { Panel, StatCard } from './Panel';

type MonthStats = components['schemas']['MonthStats'];

/** Сводка месяца над сеткой: у тренера — с разбивкой по клиентам. */
export function CalendarStats({ stats, isTrainer }: { stats: MonthStats; isTrainer: boolean }) {
  return (
    // Свой зазор 10px между панелями — тот же шаг, что у списка экрана вокруг.
    // Через фрагмент обе панели ушли бы в поток родителя одним узлом, и сводка
    // месяца слиплась бы с разбивкой в одну двойную рамку.
    <div className="flex flex-col gap-[10px]">
      {/* Своего padding у сводки НЕТ — базовые 15px панели, как у соседей.
          В макете (392:4169, Frame 284) у неё 5px по вертикали, но там контент
          высокий (65px), а в коде он на 23px ниже (text-display 26px +
          text-caption 11px + gap 5px = 42px): с 5px панель села бы до 54px,
          вдвое ниже соседей. Базовые 15px дают 42 + 30 = 72px — высота из
          макета (75px). */}
      <Panel className="flex gap-[15px]">
        <StatCard label="Личных тренировок:" value={stats.personal} />
        <StatCard label={isTrainer ? 'С клиентами' : 'С тренером'} value={stats.with_clients} />
      </Panel>

      {/* Вторая панель — только у тренера (392:4169): разбивка по клиентам
          в фиолетовой «тренерской» рамке, у клиента её в макете нет. */}
      {isTrainer ? (
        <Panel accent="trainer" className="flex flex-col gap-[10px]">
          <div className="flex items-center gap-[10px] text-h3 text-content">
            <Icon icon={peopleOutline} className="text-[24px] text-trainer-400" />
            Детализация по клиентам
          </div>
          <div className="flex gap-[15px]">
            <StatCard label="Запланировано" value={stats.planned} />
            <StatCard label="Проведено" value={stats.completed} />
            <StatCard label="Клиентов" value={stats.unique_clients} />
          </div>
        </Panel>
      ) : (
        // У клиента разбивка месяца остаётся, но без тренерских полей —
        // панель та же, акцент оранжевый (392:2856).
        <Panel className="flex gap-[15px]">
          <StatCard label="Запланировано" value={stats.planned} />
          <StatCard label="Проведено" value={stats.completed} />
        </Panel>
      )}
    </div>
  );
}

/* The swatches mirror the ordinary (non-today) marker colours in MonthGrid:
   fixed brand-400 for personal, thematic trainer-text for client. The personal
   swatch is deliberately the app's accent orange rather than the brand-text
   alias — see the long note in MonthGrid for the numbers and the reasoning
   (1.97:1 on the light --card-light, accepted in favour of the accent being
   recognisable, same line as WeekStrip on the home screen). The today cell
   flips both dots onto the neutral scale so they stay readable on its accent
   fill — that is a per-cell legibility swap, not a second meaning, so the
   legend keeps showing the base colours. Any change to the marker hues has to
   land here too, or the legend starts lying. */
export function CalendarLegend({ isTrainer }: { isTrainer: boolean }) {
  return (
    <Panel className="flex flex-col gap-[3px]">
      <p className="text-body-m text-content">Обозначения:</p>
      <span className="flex items-center gap-[10px] text-body-m text-content">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden="true" />
        Личная
      </span>
      <span className="flex items-center gap-[10px] text-body-m text-content">
        <span className="h-1.5 w-1.5 rounded-full bg-trainer-text" aria-hidden="true" />
        {isTrainer ? 'С клиентами' : 'С тренером'}
      </span>
    </Panel>
  );
}
