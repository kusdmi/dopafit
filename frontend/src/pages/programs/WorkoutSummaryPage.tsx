import { featureEnabled } from '@/entities/subscription/model/access';
import { SubscriptionStatusNotice } from '@/entities/subscription/ui/SubscriptionStatusNotice';
import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import type { ReactNode } from 'react';
import { formatDateTime } from '@/shared/lib/time/formatDate';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { useNavigation } from '@/shared/lib/navigation';
import {
  HistoryBack,
  ToolbarActions,
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Toolbar,
  useToast,
} from '@/shared/ui/primitives';
import { useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { useSessionSummary } from '@/entities/workout/api/use-session-summary';
import { ResultCard } from '@/features/share-result/ResultCard';
import { shareResultImage } from '@/features/share-result/shareResultImage';
import type { components } from '@/shared/api/schema';
import { paths } from '@/shared/config/paths';
import { formatDuration } from '@/shared/lib/time/useElapsed';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';

type SessionSummaryOut = components['schemas']['SessionSummaryOut'];
type ExerciseSummaryStat = components['schemas']['ExerciseSummaryStat'];

/** Одна из трёх колонок MAX/AVG/MIN (Figma 1042:2892): подпись сверху, крупное
 *  значение снизу, дельта к прошлой тренировке под ним. */
function StatColumn({
  label,
  stat,
  unit,
}: {
  label: string;
  stat: ExerciseSummaryStat;
  unit: string;
}) {
  const { value, delta } = stat;
  const hasDelta = delta != null && delta !== 0;
  const positive = (delta ?? 0) > 0;
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span className="text-caption text-muted">{label}</span>
      <span className="text-stat-s tabular-nums text-content">
        {value} {unit}
      </span>
      {hasDelta && (
        <span className={`text-caption tabular-nums ${positive ? 'text-success' : 'text-danger'}`}>
          {positive ? '▲' : '▼'} {Math.abs(delta as number)} {unit}
        </span>
      )}
    </div>
  );
}

/** Карточка-плитка «подпись сверху, значение снизу» — время тренировки и
 *  среднее время между подходами (1042:2892). */
function SummaryTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-[14px] border border-line p-[15px]">
      <span className="text-body-s text-muted">{label}</span>
      <span className="text-stat tabular-nums text-content">{value}</span>
    </section>
  );
}

export function WorkoutSummaryView({
  summary,
  premium = true,
  averageRest = premium,
}: {
  summary: SessionSummaryOut;
  premium?: boolean | null;
  averageRest?: boolean | null;
  /** Ignored: sharing works offline (client-side render + native/download fallback). */
  isOnline?: boolean;
}) {
  const router = useNavigation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [present] = useToast();

  const handleShare = async () => {
    setSharing(true);
    setRendering(true); // mount the off-screen card
    try {
      // Wait two animation frames so React commits the card and the browser paints it
      // before html-to-image reads the node.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (!cardRef.current) throw new Error('Card not mounted');
      const result = await shareResultImage(cardRef.current, `Тренировка #${summary.seq_number}`);
      if (result === 'downloaded') {
        void present({ message: 'Карточка сохранена', duration: 2000 });
      }
    } catch {
      void present({ message: 'Не удалось поделиться', duration: 2500 });
    } finally {
      setRendering(false); // unmount the card
      setSharing(false);
    }
  };

  return (
    // Figma 1042:2892: карточки-плитки друг под другом, ниже — разбор по
    // упражнениям, внизу стопка действий.
    <div className="flex flex-col gap-[15px]">
      {/* Заголовок страницы (<h1>) живёт в шапке — здесь <h2>, иначе на
          странице оказалось бы два <h1>. */}
      <section className="flex flex-col items-center gap-2 rounded-[14px] border border-line p-[15px]">
        <h2 className="m-0 text-h1 text-content">Итоги тренировки #{summary.seq_number}</h2>
        <p className="m-0 text-body-s text-muted">{formatDateTime(summary.finished_at)}</p>
      </section>

      <SummaryTile label="Время тренировки" value={formatDuration(summary.duration_seconds)} />
      <SummaryTile
        label="Среднее время между подходами"
        value={
          averageRest === null ? (
            '—'
          ) : !averageRest ? (
            <PremiumNotice
              compact
              title="Среднее время отдыха"
              description="Среднее время между подходами доступно с Premium."
            />
          ) : summary.avg_rest_seconds == null ? (
            '—'
          ) : (
            formatDuration(summary.avg_rest_seconds)
          )
        }
      />

      <div className="flex flex-col gap-[15px] pt-5">
        {summary.exercises.map((exercise, i) => (
          <section key={`${exercise.name}-${i}`} className="rounded-[14px] border border-line">
            {/* Заголовок отделён от колонок линией цвета успеха — так в макете. */}
            <h2 className="m-0 border-b border-success-fill p-[15px] text-center text-body-s text-content">
              {exercise.name}
            </h2>
            <div className="flex items-stretch p-[15px]">
              <StatColumn label="MAX" stat={exercise.max} unit="кг" />
              <StatColumn label="AVG" stat={exercise.avg} unit="кг" />
              <StatColumn label="MIN" stat={exercise.min} unit="кг" />
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-[15px] pt-5">
        {premium === false ? (
          <PremiumNotice
            compact
            title="Поделиться результатом"
            description="Отправка карточки с результатами тренировки доступна с Premium."
          />
        ) : (
          <Button
            variant="outline"
            className="border-chart-4-text text-content"
            disabled={premium !== true}
            loading={sharing}
            onClick={handleShare}
          >
            {sharing
              ? 'Готовим карточку…'
              : premium === null
                ? 'Проверяем доступ…'
                : 'Поделиться результатом'}
          </Button>
        )}
        <Button
          variant="outline"
          className="border-brand-400 text-content"
          onClick={() => router.push(paths.measurements)}
        >
          Сделать замеры
        </Button>
        <Button
          variant="primary"
          className="bg-card-light text-content"
          onClick={() => router.push(paths.home)}
        >
          На главную
        </Button>
      </div>

      {rendering && (
        <div
          aria-hidden="true"
          style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}
        >
          <div ref={cardRef}>
            <ResultCard summary={summary} />
          </div>
        </div>
      )}
    </div>
  );
}

interface SummaryLocationState {
  summary?: SessionSummaryOut;
}

export function WorkoutSummaryPage() {
  const subscription = useSubscriptionStatus();
  const router = useNavigation();
  const location = useLocation();
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const { isOffline } = useNetworkStatus();
  const result = useSessionSummary(sessionId);
  const fromFinish = (location.state as SummaryLocationState | null)?.summary;
  // The just-finished local session has no server record until its queued sync replays.
  // A durable URL always reads the server when online, including after a reload.
  const localSummary = fromFinish?.session_id === sessionId ? fromFinish : undefined;
  const summary = isOffline
    ? (localSummary ?? result.data)
    : result.isFetchedAfterMount && !result.isFetching && !result.isError
      ? result.data
      : undefined;

  return (
    // Figma 1042:2892: итоги идут на основном градиенте с прозрачной шапкой.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={paths.programs} text="" />
          </ToolbarActions>
          <PageTitle className="text-content">Итоги</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        {summary ? (
          <>
            <SubscriptionStatusNotice />
            <WorkoutSummaryView
              summary={summary}
              premium={featureEnabled(subscription.data, 'share_results')}
              averageRest={featureEnabled(subscription.data, 'average_rest')}
            />
          </>
        ) : !isOffline && (result.isLoading || result.isFetching || !result.isFetchedAfterMount) ? (
          <Skeleton variant="card" />
        ) : (
          <div className="flex flex-col gap-[15px]">
            <h2 className="m-0 text-h1 text-content">Итоги недоступны</h2>
            <p className="m-0 text-body-m text-muted">
              {isOffline
                ? 'Без подключения доступны только сохранённые на устройстве итоги.'
                : 'Не удалось получить итоги тренировки.'}
            </p>
            <Button variant="primary" onClick={() => router.replace(paths.home)}>
              На главную
            </Button>
          </div>
        )}
      </PageContent>
    </Page>
  );
}
