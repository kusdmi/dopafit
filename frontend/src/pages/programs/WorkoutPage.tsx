import { featureEnabled } from '@/entities/subscription/model/access';
import { SubscriptionStatusNotice } from '@/entities/subscription/ui/SubscriptionStatusNotice';
import { Modal } from '@/shared/ui/Modal';
import { primaryVariantId } from '@/entities/workout/model/variants';
import { sessionKeyFor } from '@/entities/workout/model/types';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { useEffect, useMemo, useState } from 'react';
import {
  HistoryBack,
  ToolbarActions,
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Toolbar,
} from '@/shared/ui/primitives';
import { useParams } from 'react-router-dom';

import { useClient } from '@/entities/client/api/use-client';
import { useProgram } from '@/entities/program/api/use-program';
import { ContraindicationsBlock } from '@/entities/client/ui/ContraindicationsBlock';
import { useExercise } from '@/entities/exercise/api/use-exercise';
import { useExerciseHistory } from '@/entities/workout/api/use-exercise-history';
import { useWorkoutStore } from '@/entities/workout/model/store';
import type { ActiveSession } from '@/entities/workout/model/types';
import { program } from '@/shared/config/paths';
import { formatDuration, useElapsed } from '@/shared/lib/time/useElapsed';
import { Button } from '@/shared/ui/Button';
import { SessionTabs } from '@/features/active-sessions/SessionTabs';
import { EditSetDialog } from '@/features/workout/edit-set-dialog/EditSetDialog';
import { FinishDialog } from '@/features/workout/finish-dialog/FinishDialog';
import { useFinishWorkout } from '@/features/workout/finish-workout/model/use-finish-workout';
import { SetLogger } from '@/features/workout/set-logger/SetLogger';

import { CurrentExerciseCard } from './CurrentExerciseCard';
import { ExerciseDetailsSection } from './workout/ExerciseDetailsSection';
import { useUrlBoundSession } from './workout/useUrlBoundSession';
import { WorkoutHistorySection } from './workout/WorkoutHistorySection';
import { WorkoutStatsRow } from './workout/WorkoutStatsRow';

// Stable empty fallbacks so the `?? []` defaults don't create a new array each
// render and churn the memo deps below when there is no active session.
const EMPTY_SLOTS: ActiveSession['slots'] = [];
const EMPTY_SETS: ActiveSession['sets'] = [];

export function WorkoutPage() {
  const subscription = useSubscriptionStatus();
  const { id: programParamId = '' } = useParams<{ id: string }>();
  const [timerHelpOpen, setTimerHelpOpen] = useState(false);

  const { active, selectSession } = useUrlBoundSession(programParamId);

  const restorePrimaryVariants = useWorkoutStore((s) => s.restorePrimaryVariants);
  const chooseVariant = useWorkoutStore((s) => s.chooseVariant);
  const addSet = useWorkoutStore((s) => s.addSet);
  const editSet = useWorkoutStore((s) => s.editSet);
  const deleteSet = useWorkoutStore((s) => s.deleteSet);
  const toggleComplete = useWorkoutStore((s) => s.toggleComplete);
  const setCurrentIndex = useWorkoutStore((s) => s.setCurrentIndex);

  const sessionId = active?.sessionId ?? null;
  const programId = active?.programId ?? null;
  const dayId = active?.dayId ?? null;
  const startedAt = active?.startedAt ?? null;
  const slots = active?.slots ?? EMPTY_SLOTS;
  const sets = active?.sets ?? EMPTY_SETS;
  const completed = active?.completed ?? {};
  const currentIndex = active?.currentIndex ?? 0;
  const clientId = active?.participant.kind === 'client' ? active.participant.clientId : null;
  const clientDetail = useClient(clientId ?? '');
  const clientInjuries = clientId ? (clientDetail.data?.injuries ?? null) : null;

  const finish = useFinishWorkout();

  // The `active` gate is not needed here: this page unmounts on navigation
  // (plain <Routes>, no Ionic view stack keeping it alive), and useElapsed
  // already pauses its own interval on `visibilitychange`, which covers the one
  // remaining case — the app going to the background. The value is derived from
  // startedAt on every tick, so nothing accumulates while it is paused.
  const elapsed = useElapsed(startedAt);

  // Заголовок экрана в макете (1039:2066) — название программы в кавычках.
  // Программа грузится по тому же id, что и везде; пока ответа нет, держим
  // нейтральное «Тренировка», чтобы шапка не прыгала с пустых кавычек.
  const programQuery = useProgram(programId);
  const programName = programQuery.data?.name ?? 'Тренировка';
  useEffect(() => {
    if (!active) return;
    const ids: Record<string, string> = {};
    for (const slot of active.slots) {
      if (slot.primaryVariantId) continue;
      const template = programQuery.data?.days
        .find((day) => day.id === active.dayId)
        ?.slots.find((item) => item.id === slot.slotId);
      const primary =
        template?.exercises.find((item) => item.variant_order === 0) ?? template?.exercises[0];
      const id = primaryVariantId(slot, active.sets) ?? primary?.id;
      if (id) ids[slot.slotId] = id;
    }
    if (Object.keys(ids).length) restorePrimaryVariants(sessionKeyFor(active.participant), ids);
  }, [active, programQuery.data, restorePrimaryVariants]);

  const [detailsOpen, setDetailsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const slot = slots[currentIndex];
  const currentVariantId = slot?.variantId ?? null;
  const history = useExerciseHistory(historyOpen ? currentVariantId : null);

  // The chosen variant carries its own exercise id. chooseVariant() only swaps
  // slot.variantId (slot.exerciseId stays the primary's), so if the chosen
  // variant is one of the alternatives use that alternative's exerciseId;
  // otherwise the primary is chosen and slot.exerciseId is correct.
  const currentExerciseId = useMemo(() => {
    if (!slot) return null;
    const chosenAlt = slot.alternatives.find((v) => v.variantId === slot.variantId);
    return (chosenAlt ? chosenAlt.exerciseId : slot.exerciseId) ?? null;
  }, [slot]);
  const exercise = useExercise(detailsOpen ? currentExerciseId : null);

  const currentSets = useMemo(
    () => (slot ? sets.filter((s) => s.slotId === slot.slotId) : []),
    [sets, slot],
  );
  // Таймер отдыха — ОДИН на всю тренировку, а не на упражнение: он отсчитывает
  // паузу с последнего подхода вообще, поэтому берётся максимум по всем сетам
  // сессии, а не по `currentSets` текущего слота. Раньше при переключении
  // упражнения таймер обнулялся в «—», хотя отдых шёл, и возвращался к старому
  // значению при переходе назад. Максимум, а не последний элемент массива:
  // порядок в `sets` — это порядок ДОБАВЛЕНИЯ, а подход можно дописать к
  // упражнению, на которое вернулись позже.
  const lastSetAt = useMemo(
    () =>
      sets.reduce<string | null>(
        (latest, s) => (latest === null || s.performedAt > latest ? s.performedAt : latest),
        null,
      ),
    [sets],
  );
  const editingSet = editingId ? sets.find((s) => s.id === editingId) : undefined;

  const backHref = program(programParamId || programId || '');

  if (!sessionId || !programId || !dayId || !startedAt || !slot) {
    return (
      <Page background="gradient">
        <PageHeader transparent>
          <Toolbar>
            <ToolbarActions slot="start">
              <HistoryBack defaultHref={backHref} text="" />
            </ToolbarActions>
            <PageTitle className="text-content">Тренировка</PageTitle>
          </Toolbar>
        </PageHeader>
        <PageContent className="page-padding">
          <p className="text-muted">Нет активной тренировки</p>
        </PageContent>
      </Page>
    );
  }

  const isCompleted = !!completed[slot.slotId];

  const handleSelectHistory = (setId: string) => {
    // Only local sets of this session are editable; past history is read-only.
    if (sets.some((s) => s.id === setId)) {
      setEditingId(setId);
    }
  };

  return (
    // Figma 1039:2066: экран на градиенте, шапка прозрачная. Заголовок —
    // название программы в кавычках, под ним время тренировки; отдельной
    // плашки-тулбара с таймером справа в макете нет.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={backHref} text="" />
          </ToolbarActions>
          {/* Колонка «название + таймер» центрируется по ЭКРАНУ, а не по остатку
              строки: `flex-1` центрировал её в промежутке справа от стрелки и
              уводил вправо на ~22px. Границы 56px — те же, что у одиночного
              заголовка в `.toolbar > .page-title`, поэтому длинное название
              обрезается многоточием, не доезжая до стрелки.

              `top-1/2 -translate-y-1/2` — вертикальная привязка: абсолютная
              колонка выпадает из флекс-потока, и `align-items: center` тулбара
              на неё уже не действует. Без привязки она вставала по своей
              статической позиции, а стрелка «назад» центрировалась по строке —
              две строки колонки уезжали относительно неё. */}
          <span className="absolute inset-x-[56px] top-1/2 flex -translate-y-1/2 flex-col items-center gap-1">
            {/* H2, а не H1: тренировка — ВЛОЖЕННЫЙ экран (её открывают из
                программы), а уровень 1 закреплён за корневыми экранами вкладок.
                После перевода корневых заголовков на H1 22px название программы
                здесь совпало с ними по размеру, и переход «Программы» →
                «Тренировка» перестал читаться шагом вниз по иерархии. */}
            <PageTitle className="max-w-full text-content">«{programName}»</PageTitle>
            <span className="text-body-s tabular-nums text-muted">
              Время тренировки: {formatDuration(elapsed)}
            </span>
          </span>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="flex flex-col gap-5">
          {/* У тренера над карточкой лежит ряд «Клиенты на тренировке» с
              активными параллельными сессиями. */}
          <SessionTabs onSelect={selectSession} />
          {clientId && <ContraindicationsBlock injuries={clientInjuries} />}
          <nav aria-label="Навигация по упражнениям" className="flex items-center gap-3">
            <Button
              width="content"
              variant="outline"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1)}
              className="min-w-0 flex-1 px-2 text-body-s"
            >
              ‹ Предыдущее
            </Button>
            <span className="shrink-0 text-body-s tabular-nums text-muted">
              {currentIndex + 1}/{slots.length}
            </span>
            <Button
              width="content"
              variant="outline"
              disabled={currentIndex >= slots.length - 1}
              onClick={() => setCurrentIndex(currentIndex + 1)}
              className="min-w-0 flex-1 px-2 text-body-s"
            >
              Следующее ›
            </Button>
          </nav>
          <CurrentExerciseCard
            slot={slot}
            completed={isCompleted}
            onChooseVariant={(variantId) => chooseVariant(slot.slotId, variantId)}
            onToggleComplete={() => toggleComplete(slot.slotId)}
          />

          <ExerciseDetailsSection
            open={detailsOpen}
            onToggle={() => setDetailsOpen((v) => !v)}
            exerciseId={currentExerciseId}
            isLoading={exercise.isLoading}
            isError={exercise.isError}
            data={exercise.data}
          />

          <WorkoutStatsRow
            premium={featureEnabled(subscription.data, 'rest_timer')}
            reps={slot.reps}
            plannedSets={slot.sets}
            doneSets={currentSets.length}
            lastSetAt={lastSetAt}
            onExplainTimer={() => setTimerHelpOpen(true)}
          />

          <SubscriptionStatusNotice />
          <section className="rounded-[14px] border border-line p-[15px]">
            <SetLogger
              onAdd={({ weight, reps }) =>
                addSet({ slotId: slot.slotId, variantId: slot.variantId, weight, reps })
              }
            />
          </section>

          <WorkoutHistorySection
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
            currentSets={currentSets}
            historyLoading={history.isLoading}
            historyDays={history.data?.days ?? []}
            onSelectSet={handleSelectHistory}
          />

          <Button
            variant="primary"
            className="bg-chart-4 text-chart-4-fg"
            onClick={finish.openFinish}
          >
            Завершить тренировку
          </Button>

          {finish.finishError && (
            <p className="text-body-s text-danger" role="alert">
              {finish.finishError}
            </p>
          )}
        </div>

        <Modal
          isOpen={timerHelpOpen}
          onClose={() => setTimerHelpOpen(false)}
          title="Как работает таймер отдыха"
          variant="popup"
        >
          <p className="text-body-m text-content">
            Таймер отдыха запускается заново после записи нового подхода и показывает время с
            последнего записанного подхода.
          </p>
          <Button className="mt-4" onClick={() => setTimerHelpOpen(false)}>
            Понятно
          </Button>
        </Modal>
        <FinishDialog
          isOpen={finish.finishOpen}
          pending={finish.pending}
          onCancel={finish.cancelFinish}
          onConfirm={finish.confirmFinish}
        />

        <EditSetDialog
          isOpen={!!editingSet}
          initial={
            editingSet
              ? {
                  weight: editingSet.weight,
                  reps: editingSet.reps,
                  performedAt: editingSet.performedAt,
                }
              : null
          }
          onSave={(patch) => {
            if (!editingSet) return;
            editSet(editingSet.id, patch);
            setEditingId(null);
          }}
          onDelete={() => {
            if (!editingSet) return;
            deleteSet(editingSet.id);
            setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      </PageContent>
    </Page>
  );
}
