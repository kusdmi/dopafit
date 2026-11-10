import { useEffect, useState, type ReactNode } from 'react';
import { useExercises, type ExercisesFilter } from '../api/use-exercises';
import { useVirtualRange } from '@/shared/lib/virtual/useVirtualRange';
import type { components } from '@/shared/api/schema';

export function ExerciseList({
  filter,
  renderItem,
  rowHeight = 100,
  onTotal,
  emptyText = 'Ничего не найдено',
}: {
  filter: ExercisesFilter;
  renderItem: (item: components['schemas']['ExerciseListItem'], index: number) => ReactNode;
  rowHeight?: number;
  onTotal?: (total: number) => void;
  emptyText?: string;
}) {
  const [total, setTotal] = useState(40);
  const { ref, start, end, indices } = useVirtualRange(total, rowHeight);
  const exercises = useExercises(filter, { start, end });
  const knownTotal = exercises.data?.total;
  if (knownTotal !== undefined && knownTotal !== total) setTotal(knownTotal);
  useEffect(() => {
    if (knownTotal !== undefined) onTotal?.(knownTotal);
  }, [knownTotal, onTotal]);
  return (
    <>
      {exercises.isError || exercises.isPaused ? (
        <div role="status" className="py-3 text-body-s text-muted">
          {exercises.isPaused
            ? 'Эта часть списка недоступна офлайн'
            : 'Не удалось загрузить упражнения'}
          {!exercises.isPaused && (
            <button
              type="button"
              className="ml-2 text-brand-text"
              onClick={() => void exercises.refetch()}
            >
              Повторить
            </button>
          )}
        </div>
      ) : total === 0 ? (
        <p className="py-8 text-center text-body-m text-muted">{emptyText}</p>
      ) : null}
      <ul
        ref={ref}
        aria-label="Упражнения"
        className="relative"
        style={{ height: total * rowHeight }}
      >
        {indices.map((index) => {
          const item = exercises.itemAt(index);
          return (
            <li
              key={index}
              aria-posinset={index + 1}
              aria-setsize={total}
              className="absolute inset-x-0"
              style={{ top: index * rowHeight, height: rowHeight }}
            >
              {item ? (
                renderItem(item, index)
              ) : (
                <span className="block p-3 text-body-s text-muted">
                  {exercises.isPaused
                    ? 'Недоступно офлайн'
                    : exercises.isError
                      ? 'Не загружено'
                      : 'Загрузка…'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
