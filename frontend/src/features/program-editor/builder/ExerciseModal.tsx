import { useState } from 'react';

import { ExerciseList } from '@/entities/exercise/ui/ExerciseList';
import { useRecentExercises } from '@/entities/exercise/api/use-recent-exercises';
import { useDebouncedValue } from '@/shared/lib/debounce/useDebouncedValue';
import { useExercises } from '@/entities/exercise/api/use-exercises';
import { CreateExerciseModal } from '@/features/program-editor/exercise-form/CreateExerciseModal';
import { recentExercises } from '@/shared/lib/recent/recent-exercises';
import { containsProfanity } from '@/shared/lib/validation/profanity';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import {
  exerciseParamsSchema,
  fieldError,
  trainingNameSchema,
  setsSchema,
  repsSchema,
} from '@/shared/lib/validation/training';
import { Modal } from '@/shared/ui/Modal';

interface SubmitInput {
  exercise_id: string | null;
  custom_name: string | null;
  name: string;
  sets: number;
  reps: number;
}

interface Props {
  mode: 'main' | 'alternative';
  onSubmit: (input: SubmitInput) => void;
  onClose: () => void;
}

export function ExerciseModal({ mode, onSubmit, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  const search = useDebouncedValue(query);
  const catalog = useExercises({}, { enabled: focused && !query && !picked });
  const recent = useRecentExercises(focused && !query && !picked);
  const recentIds = new Set(recent.map((item) => item.id));
  const items = [
    ...recent,
    ...(catalog.data?.items ?? []).filter((item) => !recentIds.has(item.id)),
  ].slice(0, 10);
  const pick = (item: { id: string; name: string }) => {
    recentExercises.push(item.id);
    setPicked({ id: item.id, name: item.name });
  };

  const name = picked?.name ?? query;
  const valid =
    trainingNameSchema(255).safeParse(name).success &&
    exerciseParamsSchema.safeParse({ sets, reps }).success;

  const submit = () => {
    if (!valid) return;
    if (!picked && containsProfanity(name)) {
      setError('Недопустимое название');
      return;
    }
    onSubmit({
      exercise_id: picked?.id ?? null,
      custom_name: picked ? null : name.trim(),
      name: name.trim(),
      sets: Number(sets),
      reps: Number(reps),
    });
  };

  // Figma 912:2209 — та же пара кнопок, что в модалке дня: нейтральная
  // «Отмена» и акцентное действие, обе через общую Button.
  const footer = (
    <div className="flex gap-[15px]">
      <Button variant="primary" className="bg-card-light text-content" onClick={onClose}>
        Отмена
      </Button>
      <Button variant="primary" disabled={!valid} onClick={submit}>
        Добавить
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={mode === 'main' ? 'Добавить упражнение' : 'Альтернативное упражнение'}
      footer={footer}
    >
      <div className="relative">
        <Input
          label="Название упражнения"
          error={touched.name ? fieldError(trainingNameSchema(255), name) : undefined}
          autoFocus
          value={picked ? picked.name : query}
          onChange={(e) => {
            setTouched((old) => ({ ...old, name: true }));
            setPicked(null);
            setQuery(e.target.value);
            setError(null);
          }}
          onFocus={() => setFocused(true)}
          // Delay so a click on a dropdown option registers before it unmounts.
          onBlur={() => {
            setTouched((old) => ({ ...old, name: true }));
            window.setTimeout(() => setFocused(false), 150);
          }}
          placeholder="Название упражнения"
          // Роль H3 (16px). Ниже 16px iOS зумит страницу при фокусе, а это
          // поле стоит с `autoFocus` — зум срабатывал сразу при открытии
          // модалки, до единого касания.
          className="text-h3"
        />
        {focused &&
          !picked &&
          (query || items.length > 0) &&
          (query ? (
            <div
              role="region"
              aria-label="Результаты поиска упражнений"
              data-scroll-container
              className="absolute inset-x-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-[14px] border border-line bg-card shadow-overlay"
            >
              {query !== search ? (
                <p className="p-3 text-body-s text-muted">Поиск…</p>
              ) : (
                <ExerciseList
                  key={search}
                  filter={{ search }}
                  rowHeight={64}
                  emptyText="Упражнение не найдено. Введите своё название."
                  renderItem={(item) => (
                    <button
                      type="button"
                      onClick={() => pick(item)}
                      className="h-full w-full px-3 py-2 text-left text-body-m text-content hover:bg-card-light"
                    >
                      <span className="line-clamp-2">{item.name}</span>
                    </button>
                  )}
                />
              )}
            </div>
          ) : (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-[14px] border border-line bg-card shadow-overlay">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item)}
                    className="w-full px-3 py-2 text-left text-body-m text-content hover:bg-card-light"
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
      <button
        type="button"
        className="mt-2 text-body-s text-brand-text"
        onClick={() => setCreating(true)}
      >
        + Создать своё упражнение
      </button>
      <CreateExerciseModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          void catalog.refetch();
        }}
      />
      {error && <p className="mt-1 text-body-s text-danger">{error}</p>}
      {/* Роль H3 (16px) у обоих полей — порог, ниже которого iOS зумит страницу
          при фокусе. Это самый плотный случай на экране, поэтому посчитан:
          колонка на 390px экране — (390 − 48 отступов страницы − 15 gap) / 2 ≈
          163px, боковой padding поля съедает 44px, остаётся ~119px. Самый
          длинный плейсхолдер «Повторения» при 16px SemiBold — ~85px, то есть
          укладывается; сами значения здесь двух-трёхзначные. */}
      <div className="mt-3 grid grid-cols-2 gap-[15px]">
        <Input
          label="Подходы"
          error={touched.sets ? fieldError(setsSchema, sets) : undefined}
          type="number"
          min={1}
          step={1}
          max={99}
          value={sets}
          onChange={(e) => {
            setSets(e.target.value);
            setTouched((old) => ({ ...old, sets: true }));
          }}
          onBlur={() => setTouched((old) => ({ ...old, sets: true }))}
          placeholder="Подходы"
          className="text-h3"
        />
        <Input
          label="Повторения"
          error={touched.reps ? fieldError(repsSchema, reps) : undefined}
          type="number"
          min={1}
          step={1}
          max={999}
          value={reps}
          onChange={(e) => {
            setReps(e.target.value);
            setTouched((old) => ({ ...old, reps: true }));
          }}
          onBlur={() => setTouched((old) => ({ ...old, reps: true }))}
          placeholder="Повторения"
          className="text-h3"
        />
      </div>
    </Modal>
  );
}
