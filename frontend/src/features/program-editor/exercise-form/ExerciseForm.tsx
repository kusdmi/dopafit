import { zodResolver } from '@hookform/resolvers/zod';
import { ActionButton } from '@/shared/ui/primitives';
import { useForm } from 'react-hook-form';

import { useCategories } from '@/entities/exercise/api/use-categories';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { Textarea } from '@/shared/ui/Textarea';

import { exerciseFormSchema, type ExerciseFormValues } from './schema';

interface Props {
  initial?: Partial<ExerciseFormValues>;
  saving?: boolean;
  onSave: (values: ExerciseFormValues) => void;
  onPickFile?: (file: File) => void;
  onAddLink?: (url: string) => void;
}

// Presentational form: parent orchestrates create-then-attach media using the
// returned exercise id. Uses the repo's shared facades (Input/Select/Textarea),
// which require a `label` (not `placeholder`) and are react-hook-form register-
// compatible (their onIon* handlers synthesize a native onChange/onBlur target).
export function ExerciseForm({ initial, saving, onSave, onPickFile, onAddLink }: Props) {
  const categories = useCategories();
  const { register, handleSubmit, formState } = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: initial?.name ?? '',
      category_id: initial?.category_id ?? '',
      difficulty: initial?.difficulty ?? 'beginner',
      description: initial?.description ?? '',
    },
  });
  const { errors } = formState;

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-3">
      <Input label="Название" error={errors.name?.message} {...register('name')} />

      <Select label="Категория" {...register('category_id')}>
        <option value="">Категория</option>
        {(categories.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {errors.category_id && (
        <span className="text-caption text-danger">{errors.category_id.message}</span>
      )}

      <Select label="Сложность" {...register('difficulty')}>
        <option value="beginner">Начальный</option>
        <option value="intermediate">Средний</option>
        <option value="advanced">Продвинутый</option>
      </Select>

      <Textarea label="Описание" {...register('description')} />

      {onPickFile && (
        <label className="text-body-s text-content">
          Фото / гиф
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="Загрузить фото или гиф"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
            }}
          />
        </label>
      )}

      {onAddLink && (
        // Plain native input: the shared Input facade's onBlur bridge does not
        // forward a `value` on blur (it re-reads from the RHF ref), so we read
        // the URL directly from a native field here.
        <input
          type="url"
          placeholder="Ссылка на видео (YouTube, Vimeo…)"
          aria-label="Ссылка на видео"
          // `text-h3` (16px) задан явно: без роли поле наследовало 14px от
          // body, а ниже 16px iOS зумит страницу при фокусе.
          className="text-h3 rounded-xl border border-line bg-card px-4 py-3 text-content placeholder:text-muted focus:border-brand-400 focus:outline-none"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) onAddLink(v);
          }}
        />
      )}

      <ActionButton type="submit" expand="block" disabled={saving}>
        Сохранить
      </ActionButton>
    </form>
  );
}
