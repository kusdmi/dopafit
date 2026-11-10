import {
  ActionButton,
  ToolbarActions,
  PageContent,
  PageHeader,
  Icon,
  Page,
  Toolbar,
} from '@/shared/ui/primitives';
import { flame, notificationsOutline, trophy } from '@/shared/ui/icons';
import { useMemo, useState } from 'react';
import { useNavigation } from '@/shared/lib/navigation';

import { useDashboard } from '@/entities/analytics/api/use-dashboard';
import { unitFor } from '@/entities/measurement/model/summary';
import { useStrengthExercises } from '@/entities/analytics/api/use-strength-exercises';
import { useUnreadCount } from '@/entities/notification/api/use-notifications';
import { useAnalyticsConfig } from '@/features/analytics/config/useAnalyticsConfig';
import {
  useSaveHomeParameter,
  useSaveHomeRecordExercise,
  useSaveHomeStrengthExercise,
} from '@/features/analytics/config/useSaveHomeParameter';
import { PickerModal } from '@/features/analytics/PickerModal';
import type { components } from '@/shared/api/schema';
import { paths } from '@/shared/config/paths';
import { Logo } from '@/shared/ui/Logo';
import { LineChart, type ChartPoint } from '@/shared/ui/LineChart';
import { StatCard } from '@/shared/ui/stat-card/StatCard';
import { ChartCard } from '@/pages/home/chart-card/ChartCard';
import { changeAbs, formatAbs, formatPercent, TONE_COLOR } from '@/pages/home/chart-card/delta';
import { WeekStrip } from '@/pages/home/week-strip/WeekStrip';

type BodyParameter = components['schemas']['BodyParameter'];
type DashboardPeriod = components['schemas']['DashboardPeriod'];

// Главная показывает ровно последние 30 дней и не даёт выбирать диапазон:
// переключатель периода с экрана убран (макет 392:2045 его не содержит).
// '1m' на бэкенде — это буквально `сегодня минус 30 дней`
// (application/analytics.ts, `shift(today, -30)`), то есть требуемое поведение
// уже есть в контракте и отдельного значения enum не требует.
const PERIOD: DashboardPeriod = '1m';
const PERIOD_HINT = 'Последний месяц';

const PARAM_OPTIONS: { id: BodyParameter; label: string }[] = [
  { id: 'weight', label: 'Вес' },
  { id: 'waist', label: 'Талия' },
  { id: 'chest', label: 'Грудь' },
  { id: 'hips', label: 'Бёдра' },
  { id: 'biceps', label: 'Бицепс' },
  { id: 'thigh', label: 'Бедро' },
];

/** Стабильная пустая серия: см. комментарий на месте использования. */
const EMPTY_POINTS: ChartPoint[] = [];

/**
 * Direction of a change drives the delta colour (Figma paints a weight drop
 * green and a strength gain accent). A null percent (no data) keeps the neutral
 * tone so nothing reads as good or bad.
 */
function toneOf(percent: number | null): 'up' | 'down' | 'neutral' {
  if (percent == null || percent === 0) return 'neutral';
  return percent < 0 ? 'down' : 'up';
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function HomePage() {
  const history = useNavigation();
  const [paramOpen, setParamOpen] = useState(false);
  const [strengthOpen, setStrengthOpen] = useState(false);
  // Отдельное состояние, а не общее со strengthOpen: карточка рекорда и график
  // силового прогресса — два независимых выбора (см. recordExerciseId ниже).
  const [recordOpen, setRecordOpen] = useState(false);

  // Выбранный показатель баннера — пользовательская настройка, поэтому живёт
  // там же, где остальные настройки аналитики (analytics_config), а не в
  // локальном состоянии: иначе выбор сбрасывался на «Вес» при каждом заходе на
  // экран. Поле свободной формы внутри уже существующего JSON — контракт и
  // бэкенд не меняются (см. config/types.ts).
  const { config } = useAnalyticsConfig();
  const saveConfig = useSaveHomeParameter();
  const saveStrengthExercise = useSaveHomeStrengthExercise();
  const saveRecordExercise = useSaveHomeRecordExercise();
  const param: BodyParameter = config.home_measurement_parameter ?? 'weight';
  const strengthExerciseId = config.home_strength_exercise_id;
  // Упражнение карточки рекорда хранится ОТДЕЛЬНО от упражнения графика.
  // Раньше обе плашки писали в один ключ и открывали один и тот же пикер,
  // поэтому выбор рекорда вверху переставлял график внизу. Бэкенд различал их
  // с самого начала (record_exercise_id / strength_exercise_id) — на клиенте
  // просто не передавался первый.
  const recordExerciseId = config.home_record_exercise_id;

  const unread = useUnreadCount();
  const { data, isLoading } = useDashboard({
    measurementParameter: param,
    recordExerciseId,
    strengthExerciseId,
    period: PERIOD,
  });
  // Список упражнений нужен только когда пикер открыт, но запрос всё равно
  // висит всегда: его ответ подписывает график силового прогресса (имя
  // выбранного упражнения), а справочник кэшируется надолго.
  const strengthExercises = useStrengthExercises();
  const strengthOptions = useMemo(
    () =>
      (strengthExercises.data?.items ?? []).map((e) => ({
        id: e.exercise_id,
        label: e.exercise_name,
      })),
    [strengthExercises.data],
  );
  // Пока пользователь ничего не выбрал, бэкенд строит график по личному рекорду —
  // подпись должна называть то же упражнение.
  const strengthExerciseName =
    strengthOptions.find((o) => o.id === strengthExerciseId)?.label ??
    data?.personal_record?.exercise_name;
  // Пока первый запрос дашборда не резолвнулся (нет ни свежих, ни кэшированных
  // данных), показываем нейтральный плейсхолдер (дефис) вместо «0/—/0%»
  // (транзиент на Главной). Дефис показываем СРАЗУ, без порога: задержка
  // нужна только тяжёлым индикаторам (скелетон/спиннер) ради вспышки на быстром
  // кэше, а нейтральный дефис такой вспышки не создаёт. Если данные уже в кэше,
  // firstLoad === false и значения появляются мгновенно.
  const pending = isLoading && !data;
  const dash = <span className="text-muted">—</span>;
  const measurementLabel = PARAM_OPTIONS.find((o) => o.id === param)?.label ?? 'Замеры';
  const dayMarkers = (data?.week ?? []).map((d) => ({
    date: d.date,
    personal: d.has_personal_workout,
    client: d.has_client_workout,
  }));

  const measurementPercent = data?.measurement_chart.change_percent ?? null;
  const measurementTone = toneOf(measurementPercent);
  // Макет 392:2170 подписывает силовой график той же парой «значение + процент»,
  // что и замеры; change_percent уже приходил в ответе и просто не выводился.
  const strengthPercent = data?.strength_chart.change_percent ?? null;
  const strengthTone = toneOf(strengthPercent);

  // Макеты 392:2101 / 392:2170: крупная строка — изменение В ЕДИНИЦАХ, процент
  // уходит во вторую строку. Абсолютное изменение считается на клиенте из тех
  // же точек, по которым backend посчитал процент, — отдельного поля в ответе
  // нет, а добавлять его в контракт незачем: данные уже пришли.
  //
  // Единица у замеров зависит от параметра (вес в кг, обхваты в см), у силового
  // графика она всегда килограммы — это рабочий вес.
  const measurementAbs = changeAbs(data?.measurement_chart.points ?? []);
  const strengthAbs = changeAbs(data?.strength_chart.points ?? []);

  // Мемоизация обязательна, а не декоративна: LineChart мемоизирует геометрию
  // по ССЫЛКЕ на `series`, а скраб пальцем по графику меняет активный индекс на
  // 60–120 Гц. Инлайновые литералы давали новый массив на каждый такой рендер,
  // поэтому useMemo внутри графика промахивался всегда и computeGeometry
  // (Set по датам, Map-индекс, min/max, тики, выборка подписей) пересчитывался
  // каждый кадр жеста — на обоих графиках Главной сразу.
  //
  // Фолбэк `?? EMPTY_POINTS` — модульная константа, а не литерал `[]`: пока
  // дашборд не резолвнулся, инлайновый литерал так же обнулял бы мемо.
  const measurementPoints = data?.measurement_chart.points;
  const measurementSeries = useMemo(
    () => [
      {
        id: 'measurement',
        label: measurementLabel,
        // Цвет линии = цвет подписи изменения (макет 392:2090): падение веса
        // зелёное и в графике, и в подписи. Фиксированного цвета у карточки
        // нет — его задаёт направление.
        color: TONE_COLOR[measurementTone],
        points: measurementPoints ?? EMPTY_POINTS,
      },
    ],
    [measurementLabel, measurementPoints, measurementTone],
  );

  const strengthPoints = data?.strength_chart.points;
  const strengthSeries = useMemo(
    () => [
      {
        id: 'strength',
        label: 'Сила',
        // См. measurementSeries: тот же тон, что и у подписи (макет 392:2159 —
        // рост силы оранжевый и там, и там).
        color: TONE_COLOR[strengthTone],
        points: strengthPoints ?? EMPTY_POINTS,
      },
    ],
    [strengthPoints, strengthTone],
  );

  return (
    // Figma 392:2045 puts the home screen on the primary gradient, with the
    // brand mark and the bell floating straight on it — hence the transparent
    // header and no opaque card plate.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          {/* Полный логотип — знак плюс начертание, как в макете 392:2045, где
              синяя плашка стоит слева от «Dopafit».

              Высота 28px: `Logo` тянет оба SVG по `h-full` при общем боксе 62,
              так что плашка выходит 0.74 × 28 ≈ 20.7px против 20px в макете
              (замер по узлу: плашка 20×20 при кегле начертания 22). */}
          <Logo className="h-[28px] text-content" />
          <ToolbarActions slot="end">
            <ActionButton
              onClick={() => history.push(paths.homeNotifications)}
              aria-label="Уведомления"
            >
              {/* Wrap the icon so the badge anchors to the glyph's corner, not
                  the padded ActionButton box — otherwise the dot drifts toward the
                  center. */}
              <span slot="icon-only" className="relative inline-flex">
                <Icon icon={notificationsOutline} style={{ fontSize: 24 }} />
                {unread > 0 && (
                  <span
                    aria-label={`Непрочитанные уведомления: ${unread}`}
                    // Sit on the top-right corner, partly over the glyph, with a
                    // ring in the page background so it reads on any theme.
                    className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-danger-fill"
                  />
                )}
              </span>
            </ActionButton>
          </ToolbarActions>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="mx-auto flex max-w-md flex-col gap-[30px] pb-4">
          {/* Figma I392:2056 — обращение, а не заголовок раздела: в макете это
              светлая строка прямо под вордмарком, она подписывает логотип и не
              спорит с «Календарём» ниже.

              Было `<h1 className="text-h2">` — Bold 18px, а «Календарь» ниже
              стоит на `text-h1` 22px. Тег h1 оказывался МЕЛЬЧЕ вложенного h2,
              оба Bold и оба `text-content`: через gap 30px две строки читались
              одним заголовком в две строки. Идентичность экрана несёт вордмарк
              в шапке, поэтому <p> и роль body-m (14/400) с приглушённым цветом:
              вес и тег совпали, единственный заголовок на экране — «Календарь».
              (См. ту же инверсию, разведённую в ProgramDetailPage.) */}
          <p className="text-body-m text-muted">
            {data?.full_name ? `${greeting()}, ${data.full_name}!` : greeting()}
          </p>
          <WeekStrip days={dayMarkers} onOpen={() => history.push(paths.homeCalendar)} />
          {/* Figma 392:2071 / 392:2079 — the "coloured card" pattern: role-coloured
              1px border plus an icon pill tinted at 15% of that same colour. The
              record card's role colour is the chart violet; the mock derives its
              pill from a different violet, and design-system.md resolves that
              conflict in favour of the border colour. */}
          <div className="flex gap-3">
            <StatCard
              title="Серия"
              value={pending ? dash : (data?.month_workout_count ?? 0)}
              hint="Тренировок за месяц"
              icon={flame}
              accentColor="var(--color-brand-400)"
            />
            {/* Чеврон по макету 392:2083: карточка рекорда выбирает упражнение
                из того же списка, что и силовой график. */}
            <StatCard
              title={data?.personal_record?.exercise_name ?? 'Рекорд'}
              value={
                pending ? dash : data?.personal_record ? `${data.personal_record.weight} кг` : '—'
              }
              hint="Личный рекорд"
              icon={trophy}
              accentColor="var(--color-chart-4)"
              onPick={() => setRecordOpen(true)}
              pickLabel="Сменить упражнение рекорда"
            />
          </div>
          <ChartCard
            title={measurementLabel}
            subtitle={PERIOD_HINT}
            delta={
              pending
                ? dash
                : measurementAbs == null
                  ? dash
                  : formatAbs(measurementAbs, unitFor(param))
            }
            deltaHint={
              pending || measurementPercent == null ? null : formatPercent(measurementPercent)
            }
            deltaTone={measurementTone}
            onPick={() => setParamOpen(true)}
            pickLabel="Сменить тип замера"
          >
            <LineChart series={measurementSeries} />
          </ChartCard>
          <ChartCard
            title="Силовой прогресс"
            subtitle={strengthExerciseName}
            subtitleKey={strengthExerciseName}
            delta={pending ? dash : strengthAbs == null ? dash : formatAbs(strengthAbs, 'кг')}
            deltaHint={pending || strengthPercent == null ? null : formatPercent(strengthPercent)}
            deltaTone={strengthTone}
            onPick={() => setStrengthOpen(true)}
            pickLabel="Сменить упражнение"
          >
            <LineChart series={strengthSeries} />
          </ChartCard>
        </div>
        <PickerModal
          isOpen={paramOpen}
          title="Замер"
          options={PARAM_OPTIONS}
          selectedId={param}
          onSelect={(id) => saveConfig(id as BodyParameter)}
          onClose={() => setParamOpen(false)}
        />
        <PickerModal
          isOpen={strengthOpen}
          title="Упражнение"
          options={strengthOptions}
          selectedId={strengthExerciseId ?? data?.personal_record?.exercise_id}
          onSelect={saveStrengthExercise}
          onClose={() => setStrengthOpen(false)}
          emptyLabel="Пока нет упражнений с записанным весом"
        />
        <PickerModal
          isOpen={recordOpen}
          title="Упражнение рекорда"
          options={strengthOptions}
          // Без явного выбора backend отдаёт рекорд по самому тяжёлому
          // упражнению — подсвечиваем именно его, а не пустоту.
          selectedId={recordExerciseId ?? data?.personal_record?.exercise_id}
          onSelect={saveRecordExercise}
          onClose={() => setRecordOpen(false)}
          emptyLabel="Пока нет упражнений с записанным весом"
        />
      </PageContent>
    </Page>
  );
}
