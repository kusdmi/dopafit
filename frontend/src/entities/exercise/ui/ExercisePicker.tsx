import { useState } from 'react';
import { ExerciseList } from './ExerciseList';
import { useExercise } from '../api/use-exercise';
import { useDebouncedValue } from '@/shared/lib/debounce/useDebouncedValue';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';

export function ExercisePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search);
  const selected = useExercise(value || null);
  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        aria-label="Выберите упражнение"
        className="rounded-[14px] border border-line px-4 py-3 text-left text-h3 text-content"
        onClick={() => setOpen(true)}
      >
        {selected.data?.name ?? (value ? 'Выбранное упражнение' : 'Все упражнения')}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Выберите упражнение">
        <Input
          label="Поиск упражнения"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button variant="ghost" onClick={() => pick('')}>
          Все упражнения
        </Button>
        <div
          role="region"
          aria-label="Список упражнений"
          data-scroll-container
          className="mt-3 h-80 overflow-y-auto"
        >
          {open && (
            <ExerciseList
              key={query}
              filter={{ search: query }}
              rowHeight={64}
              renderItem={(item) => (
                <button
                  type="button"
                  aria-pressed={item.id === value}
                  className="h-full w-full px-3 py-2 text-left text-body-m text-content hover:bg-card-light"
                  onClick={() => pick(item.id)}
                >
                  <span className="line-clamp-2">{item.name}</span>
                </button>
              )}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
