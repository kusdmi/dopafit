import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import { isClientRestricted, isProgramRestricted } from '@/entities/subscription/model/access';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { useState } from 'react';
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
import { useNavigation } from '@/shared/lib/navigation';

import { useSessionStore } from '@/entities/session/model/store';
import { useProgram } from '@/entities/program/api/use-program';
import { useWorkoutStore } from '@/entities/workout/model/store';
import type { Participant, WorkoutSlot } from '@/entities/workout/model/types';
import { sessionKeyFor } from '@/entities/workout/model/types';
import { ParticipantStep } from '@/features/select-participant/ParticipantStep';
import type { components } from '@/shared/api/schema';
import { program as programDetail, programSession } from '@/shared/config/paths';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ExerciseRow } from '@/pages/programs/ui/ExerciseRow';
import { choicePill, hintBox } from '@/pages/programs/ui/program-ui';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import { trackMetrikaGoal } from '@/shared/lib/telemetry/metrika';

type DayOut = components['schemas']['DayOut'];

/** Maps a program day to the workout slots used by the active-session store. */
function buildSlots(day: DayOut): WorkoutSlot[] {
  return day.slots.flatMap((slot) => {
    const primary = slot.exercises.find((e) => e.variant_order === 0) ?? slot.exercises[0];
    if (!primary) return [];
    const alternatives = slot.exercises
      .filter((e) => e.id !== primary.id)
      .map((e) => ({ variantId: e.id, exerciseId: e.exercise_id, name: e.name }));
    return [
      {
        slotId: slot.id,
        variantId: primary.id,
        primaryVariantId: primary.id,
        exerciseId: primary.exercise_id,
        name: primary.name,
        sets: primary.sets,
        reps: primary.reps,
        alternatives,
      },
    ];
  });
}

export function StartWorkoutPage() {
  const { id = '' } = useParams<{ id: string }>();
  const history = useNavigation();
  const program = useProgram(id);
  const subscription = useSubscriptionStatus();
  const access = subscription.data?.entitlements;
  const programRestricted = !!access && isProgramRestricted(access, id);
  const [dayId, setDayId] = useState<string | null>(null);
  const role = useSessionStore((s) => s.user?.role);
  const isTrainer = role === 'trainer';
  const [participant, setParticipant] = useState<Participant>({ kind: 'self' });
  const restricted =
    programRestricted ||
    (!!access &&
      !subscription.data?.is_active &&
      participant.kind === 'client' &&
      isClientRestricted(access, participant.clientId));
  // Set when the chosen participant already has an active session on a DIFFERENT
  // program: we ask to finish it first instead of silently no-op-creating a
  // second session that would land on an empty screen.
  const [busySession, setBusySession] = useState<{ programId: string } | null>(null);

  const days = program.data?.days ?? [];
  const selectedDay = days.find((d) => d.id === dayId);

  const handleStart = () => {
    if (!selectedDay || restricted) return;
    const effectiveParticipant: Participant = isTrainer ? participant : { kind: 'self' };
    // The store keys sessions by participant ('self' / client:<id>), so a
    // participant can only have ONE active session. If they already have one on a
    // different program, startSession would no-op and history.push would drop the
    // user on that program's empty session screen. Warn and route to the live one.
    const existing = useWorkoutStore.getState().sessions[sessionKeyFor(effectiveParticipant)];
    if (existing && existing.programId !== id) {
      setBusySession({ programId: existing.programId });
      return;
    }
    useWorkoutStore.getState().startSession({
      participant: effectiveParticipant,
      programId: id,
      dayId: selectedDay.id,
      slots: buildSlots(selectedDay),
    });
    if (!existing) trackMetrikaGoal('workout_started', { participant: effectiveParticipant.kind });
    history.push(programSession(id));
  };

  const goToBusySession = () => {
    if (!busySession) return;
    const target = busySession.programId;
    setBusySession(null);
    history.push(programSession(target));
  };

  return (
    // Figma 1006:2005 / 1006:1942: градиентный фон, прозрачная шапка с
    // центрированным заголовком и шевроном «назад».
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={programDetail(id)} text="" />
          </ToolbarActions>
          <PageTitle className="text-content">
            {isTrainer ? 'Выбор тренирующегося' : 'Выбор дня'}
          </PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        {program.isLoading ? (
          <Skeleton variant="card" />
        ) : program.isError ? (
          <p className="text-danger">Не удалось загрузить программу</p>
        ) : !program.data ? (
          <p className="text-muted">Программа не найдена</p>
        ) : (
          <div className="flex min-h-full flex-col gap-[25px]">
            {/* Плашка-подсказка над выбором. У тренера
                на экране оба шага сразу, поэтому подсказка покрывает оба. */}
            <p className={hintBox}>
              {isTrainer
                ? 'Выберите того, кто будет тренироваться, и день программы'
                : 'Выберите день программы тренировки для старта'}
            </p>

            {isTrainer ? <ParticipantStep value={participant} onChange={setParticipant} /> : null}

            {/* Разделитель между шагами. У тренера оба шага идут подряд, и без
                границы список клиентов и ряд дней читались одним набором
                пилюль — одинаковых по форме, но отвечающих на разные вопросы. */}
            {isTrainer ? <hr className="border-t border-line" /> : null}

            <section className="flex flex-col gap-[15px]">
              {/* Заголовок только у тренера: у клиента день — единственный шаг
                  экрана, и он уже назван заголовком страницы «Выбор дня». */}
              {isTrainer ? <h2 className="text-h3 text-content">День программы</h2> : null}

              {days.length === 0 ? (
                <p className="text-muted">В программе нет дней тренировки</p>
              ) : (
                <div className="flex flex-wrap items-center gap-[15px]">
                  {days.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={dayId === d.id}
                      onClick={() => setDayId(d.id)}
                      className={choicePill(dayId === d.id)}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Превью выбранного дня теми же карточками слотов,
                что на экране программы. */}
            {selectedDay && (
              <div className="flex flex-col gap-5">
                {selectedDay.slots.map((slot) => (
                  <ExerciseRow key={slot.id} exercises={slot.exercises} />
                ))}
              </div>
            )}

            {/* Макет 1006:2005: «Старт» прижат к низу экрана, а не идёт следом
                за превью дня. `mt-auto` прижимает его, когда контента мало, и
                отпускает в поток, когда превью длиннее экрана. Низ — это край
                падинга .page-content, который резервирует место под таб-бар,
                поэтому кнопка встаёт НАД баром, а не под ним. */}
            {restricted && (
              <PremiumNotice
                title="Ограничение доступа"
                description="Программа доступна для просмотра. В разделе Premium можно подтвердить бесплатный выбор программ и клиентов или подключить расширенный доступ."
              />
            )}
            <Button
              variant="primary"
              disabled={!dayId || restricted}
              onClick={handleStart}
              className="mt-auto shadow-raised"
            >
              Старт
            </Button>
          </div>
        )}
      </PageContent>

      <ConfirmDialog
        isOpen={busySession !== null}
        title="Тренировка уже идёт"
        message="Завершите текущую тренировку, чтобы начать новую."
        confirmLabel="К текущей"
        cancelLabel="Отмена"
        onConfirm={goToBusySession}
        onCancel={() => setBusySession(null)}
      />
    </Page>
  );
}
