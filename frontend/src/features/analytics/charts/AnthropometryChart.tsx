import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { limitParameter } from './limit-series';
import { useMemo } from 'react';

import type { components } from '@/shared/api/schema';
import { useAnthropometrySeries } from '@/entities/analytics/api/use-anthropometry-series';
import { DeferredLoading } from '@/shared/ui/DeferredLoading';
import { LineChart } from '@/shared/ui/LineChart';

import { FreeAnalyticsNotice } from './FreeAnalyticsNotice';
import { ChartSkeleton } from './ChartSkeleton';
import { ParameterCard } from './ParameterCard';
import { PARAM_META } from '../config/meta';
import type { AnthropometryParams } from '../config/types';

type ParameterSeries = components['schemas']['ParameterSeries'];

interface Props {
  params: AnthropometryParams;
  dateFrom: string;
  dateTo: string;
  clientId: string | null;
}

// Colors for custom-field series (custom_slot 1..3). The six --color-chart-*
// tokens are spoken for by the six standard parameters (PARAM_META), so custom
// fields take three darker, clearly separate hues; like the series tokens these
// are fixed rather than thematic, so a line keeps its identity across themes.
const CUSTOM_COLORS = ['var(--color-logo)', 'var(--color-brand-600)', 'var(--color-trainer-600)'];

/** Стабильная пустая выдача: см. комментарий на месте использования. */
const EMPTY_SERIES: ParameterSeries[] = [];

/** Stable id/label/color for a series, whether standard or a custom field. */
function seriesMeta(ps: ParameterSeries): { id: string; label: string; color: string } {
  if (ps.custom_slot != null) {
    return {
      id: `custom:${ps.custom_slot}`,
      label: ps.name ?? `Поле ${ps.custom_slot}`,
      color: CUSTOM_COLORS[(ps.custom_slot - 1) % CUSTOM_COLORS.length],
    };
  }
  const meta = PARAM_META.find((m) => m.id === ps.parameter);
  return {
    id: ps.parameter ?? 'unknown',
    label: meta?.label ?? ps.parameter ?? '—',
    color: meta?.color ?? 'var(--color-content)',
  };
}

export function AnthropometryChart({ params, dateFrom, dateTo, clientId }: Props) {
  const subscription = useSubscriptionStatus();
  const cutoff =
    subscription.data && !subscription.data.is_active
      ? new Date(subscription.serverNow - 30 * 86400000).toISOString().slice(0, 10)
      : '0001-01-01';
  const anthro = useAnthropometrySeries(
    {
      dateFrom,
      dateTo,
      parameters: params.parameters,
      customSlots: params.customSlots,
      clientId: clientId ?? undefined,
    },
    true,
  );

  // Фолбэк — модульная константа, а не литерал `[]`: инлайновый литерал давал
  // новую ссылку на каждый рендер и обнулял мемо ниже, пока ответа ещё нет.
  const verified =
    !clientId || (anthro.isFetchedAfterMount && !anthro.isFetching && !anthro.isError);
  const series = verified ? (anthro.data?.parameters ?? EMPTY_SERIES) : EMPTY_SERIES;

  // Мемоизация обязательна: LineChart мемоизирует геометрию по ССЫЛКЕ на
  // `series`, а скраб меняет активный индекс на 60–120 Гц. Инлайновый `.map()`
  // давал новый массив на каждый такой рендер — плюс на каждую серию вызывался
  // seriesMeta() с линейным PARAM_META.find() внутри, — и computeGeometry
  // пересчитывался целиком каждый кадр жеста.
  //
  // `series` — уже производная от `anthro.data`, и react-query держит ссылку на
  // данные стабильной между рендерами, пока ответ не сменился; поэтому зависеть
  // достаточно от неё одной. Карточки параметров ниже переиспользуют тот же
  // мемо, так что seriesMeta() считается один раз на серию, а не дважды.
  const chartSeries = useMemo(
    () =>
      series.map((original) => {
        const ps = limitParameter(original, cutoff);
        const meta = seriesMeta(ps);
        const unit = ps.custom_slot != null && ps.unit ? `, ${ps.unit}` : '';
        return {
          ...meta,
          unit: ps.custom_slot != null && ps.unit ? ps.unit : undefined,
          stats: ps.stats,
          chartLabel: `${meta.label}${unit}`,
          points: ps.points,
        };
      }),
    [series, cutoff],
  );

  // Отдельный мемо под проп графика: карточки выше берут из chartSeries ещё и
  // stats/unit, которые LineChart не касаются, а держать один объект под оба
  // потребителя значило бы отдавать графику лишние поля.
  const lineSeries = useMemo(
    () =>
      chartSeries.map((s) => ({
        id: s.id,
        label: s.chartLabel,
        // Orange chart-1 is 2.65:1 on the light surface; the semantic brand
        // text step keeps the weight line visible in both themes.
        color: s.id === 'weight' ? 'var(--brand-text)' : s.color,
        points: s.points,
      })),
    [chartSeries],
  );

  // До резолва первого запроса не показываем пустые «change_percent%»-карточки и
  // пустой график. Число карточек-заглушек оцениваем по числу выбранных
  // параметров/кастомных полей, чтобы скелетон совпал с итоговой раскладкой.
  const firstLoad = !anthro.isError && (clientId ? !verified : anthro.isLoading && !anthro.data);
  const skeletonStatCount = Math.max(
    1,
    params.parameters.length + (params.customSlots?.length ?? 0),
  );

  return clientId && anthro.isError ? (
    <p className="text-body-m text-center text-danger">Не удалось загрузить данные клиента</p>
  ) : (
    <DeferredLoading loading={firstLoad} fallback={<ChartSkeleton statCount={skeletonStatCount} />}>
      <div className="flex flex-col gap-4">
        <FreeAnalyticsNotice range={anthro.data?.range} />
        {chartSeries.every((s) => !s.points.length) && (
          <p className="text-body-s text-muted">
            За выбранный период нет записей. Выберите другой период.
          </p>
        )}
        {/* Одна колонка, когда серия одна: жёсткий grid-cols-2 оставлял
            карточку единственного параметра в половину ширины с пустотой
            справа. Сетка на две колонки нужна, только когда есть что во
            вторую колонку положить. */}
        <div className={`grid gap-2.5 ${series.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {chartSeries.map((s) => (
            <ParameterCard
              key={s.id}
              label={s.label}
              color={s.color}
              min={s.stats.min}
              avg={s.stats.avg}
              max={s.stats.max}
              changePercent={s.stats.change_percent}
              unit={s.unit}
            />
          ))}
        </div>
        <LineChart series={lineSeries} />
      </div>
    </DeferredLoading>
  );
}
