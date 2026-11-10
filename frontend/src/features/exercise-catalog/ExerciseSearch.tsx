import { SearchInput } from '@/shared/ui/primitives';
import { fieldClass } from '@/shared/ui/field';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function ExerciseSearch({ value, onChange }: Props) {
  return (
    <SearchInput
      value={value}
      // Debounce so a GET doesn't fire on every keystroke.
      debounce={300}
      onChange={(e) => onChange(e.target.value ?? '')}
      placeholder="Поиск упражнения"
      aria-label="Поиск упражнения"
      // Геометрия из shared/ui/field.ts — то же поле, что на остальных экранах.
      className={`w-full text-h3 ${fieldClass}`}
    />
  );
}
