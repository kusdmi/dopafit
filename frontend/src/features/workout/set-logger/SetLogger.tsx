import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

import { setValuesSchema as schema } from '@/shared/lib/validation/training';
type FormInput = z.input<typeof schema>;
type Values = z.output<typeof schema>;

interface SetLoggerProps {
  onAdd: (input: { weight: number; reps: number }) => void;
}

export function SetLogger({ onAdd }: SetLoggerProps) {
  const { register, handleSubmit, reset, formState } = useForm<FormInput, unknown, Values>({
    resolver: zodResolver(schema),
    mode: 'onChange',
  });

  const submit = handleSubmit((values) => {
    onAdd({ weight: values.weight, reps: values.reps });
    // Пустая строка, а не `undefined`: react-hook-form пропускает ключи со
    // значением `undefined` — DOM-инпут остаётся с прежним текстом, и после
    // «Добавить» в полях висели вес и повторы предыдущего подхода. Пустая
    // строка доходит до инпута и действительно его очищает.
    reset({ weight: '', reps: '' });
  });

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid grid-cols-2 min-[400px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2"
    >
      <div className="min-w-0 flex-1 basis-0 [&_.app-field]:px-3">
        <Input
          label="КГ"
          type="text"
          inputMode="decimal"
          error={
            formState.touchedFields.weight || formState.dirtyFields.weight
              ? formState.errors.weight?.message
              : undefined
          }
          {...register('weight')}
        />
      </div>
      <div className="min-w-0 flex-1 basis-0 [&_.app-field]:px-3">
        <Input
          label="Повторы"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          step={1}
          error={
            formState.touchedFields.reps || formState.dirtyFields.reps
              ? formState.errors.reps?.message
              : undefined
          }
          {...register('reps')}
        />
      </div>
      <Button
        type="submit"
        disabled={!formState.isValid}
        className="col-span-2 m-0 h-auto min-h-[52px] shrink-0 self-start px-3 min-[400px]:col-span-1"
      >
        Добавить
      </Button>
    </form>
  );
}
