import { useToast } from '@/shared/ui/primitives';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { useAddExerciseToProgram } from '@/entities/program/api/use-add-exercise';
import { useProgram } from '@/entities/program/api/use-program';
import { usePrograms } from '@/entities/program/api/use-programs';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Skeleton } from '@/shared/ui/Skeleton';

// Вариант выбора (Figma 974:1958/974:1996): выбранный — заливка акцентом,
// невыбранный — прозрачный с обводкой нейтральным 500. Радиус/высота те же,
// что у полей и кнопок системы (14px), поэтому список читается как один ряд
// контролов.
function ChoiceOption({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-[14px] border-2 p-[10px] text-center text-body-m ${
        selected
          ? 'border-brand-400 bg-brand-400 text-neutral-50'
          : 'border-neutral-500 text-content'
      }`}
    >
      {children}
    </button>
  );
}

interface Props {
  exerciseId: string;
  exerciseName: string;
  onClose: () => void;
}

export function AddToProgramModal({ exerciseId, exerciseName, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [programId, setProgramId] = useState<string | null>(null);
  const [dayId, setDayId] = useState<string | null>(null);
  const programs = usePrograms();
  const program = useProgram(programId);
  const add = useAddExerciseToProgram();
  const { isOffline } = useNetworkStatus();
  const [presentToast] = useToast();

  const confirm = () => {
    if (!programId || !dayId) return;
    const vars = { programId, body: { day_id: dayId, exercise_id: exerciseId, sets: 3, reps: 10 } };
    if (isOffline) {
      // The add is queued in the outbox and its onSuccess won't fire until replay,
      // so we can't show the online success step. Close with a toast instead of
      // leaving the confirm button spinning on a paused mutation. Don't attach an
      // onSuccess here: this observer would replay on reconnect and advance the
      // (already-closed) modal's step, so close imperatively instead.
      add.mutate(vars);
      void presentToast({
        message: 'Упражнение добавится при подключении к сети',
        duration: 2500,
      });
      onClose();
      return;
    }
    add.mutate(vars, { onSuccess: () => setStep(3) });
  };

  // Only the user's editable programs are valid add targets. Trainer share-copies
  // "for a client" (for_client_id set) are managed through the client-card/share
  // flow, so they are excluded here; for clients this predicate is a no-op.
  const own = (programs.data ?? []).filter((p) => !p.is_standard && !p.for_client_id);
  const programName = own.find((p) => p.id === programId)?.name ?? '';
  const dayName = program.data?.days.find((d) => d.id === dayId)?.name ?? '';

  const title =
    step === 1
      ? 'Добавить в программу'
      : step === 2
        ? 'Выбрать день'
        : 'Готово';

  const footer =
    step === 1 ? (
      <div className="flex gap-[10px]">
        <Button variant="outline" onClick={onClose}>
          Назад
        </Button>
        <Button disabled={!programId} onClick={() => setStep(2)}>
          Выбрать программу
        </Button>
      </div>
    ) : step === 2 ? (
      <div className="flex gap-[10px]">
        <Button variant="outline" onClick={() => setStep(1)}>
          Назад
        </Button>
        <Button disabled={!dayId || add.isPending} onClick={confirm}>
          Выбрать день
        </Button>
      </div>
    ) : (
      <Button onClick={onClose}>Готово</Button>
    );

  return (
    <Modal isOpen onClose={onClose} title={title} footer={footer}>
      {step === 1 && (
        <>
          <p className="mb-[15px] text-center text-body-m text-content">
            Выберите программу тренировок для упражнения:{' '}
            <span className="text-h3 text-brand-text">{exerciseName}</span>
          </p>
          {own.length === 0 ? (
            <p className="py-4 text-center text-body-s text-muted">
              У вас нет своих программ. Создайте программу на экране «Программы».
            </p>
          ) : (
            <ul className="flex flex-col gap-[10px]">
              {own.map((p) => (
                <li key={p.id}>
                  <ChoiceOption
                    selected={programId === p.id}
                    onSelect={() => setProgramId(p.id)}
                  >
                    {p.name}
                  </ChoiceOption>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <p className="mb-[15px] text-center text-body-m text-content">
            {exerciseName} → <span className="text-h3 text-brand-text">{programName}</span>
          </p>
          {program.isLoading ? (
            <Skeleton variant="list" count={3} />
          ) : program.isError ? (
            <p className="py-4 text-center text-body-m text-danger">
              Не удалось загрузить программу
            </p>
          ) : (program.data?.days ?? []).length === 0 ? (
            <p className="py-4 text-center text-body-s text-muted">
              В программе нет дней. Добавьте день в конструкторе.
            </p>
          ) : (
            <ul className="flex flex-col gap-[10px]">
              {(program.data?.days ?? []).map((d) => (
                <li key={d.id}>
                  <ChoiceOption selected={dayId === d.id} onSelect={() => setDayId(d.id)}>
                    {d.name}
                  </ChoiceOption>
                </li>
              ))}
            </ul>
          )}
          {add.isError && (
            <p className="mt-1 text-body-s text-danger">
              Ошибка при добавлении. Попробуйте ещё раз.
            </p>
          )}
        </>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center gap-[10px] text-center">
          <p className="text-display text-success" aria-hidden="true">✓</p>
          <p className="text-h2 text-content">Добавлено!</p>
          <p className="text-body-s text-muted">
            {exerciseName} · {programName} · {dayName}
          </p>
        </div>
      )}
    </Modal>
  );
}
