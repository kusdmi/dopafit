import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

import { physicalSchema, type PhysicalValues } from '../lib/schemas';
import { ErrorMessage } from '../ui/ErrorMessage';

interface PhysicalStepProps {
  isTrainer: boolean;
  isPending: boolean;
  error?: string;
  /** Trainer: hand the collected physical data up to the clients step. */
  onContinueTrainer: (values: PhysicalValues) => void;
  /** Client: finish onboarding right here. */
  onFinish: (values: PhysicalValues) => void;
}

/** Screen 5: physical data. Trainers continue to the clients step; clients
 *  finish onboarding immediately. */
export function PhysicalStep({
  isTrainer,
  isPending,
  error,
  onContinueTrainer,
  onFinish,
}: PhysicalStepProps) {
  const { isOnline } = useNetworkStatus();

  const form = useForm<PhysicalValues>({
    resolver: zodResolver(physicalSchema),
    // Дату рождения не предзаполняем: у веса и роста есть осмысленное типовое
    // значение, у дня рождения — нет, а подставленная дата легко уедет в ответ как есть.
    defaultValues: { birth_date: '', weight: '70', height: '175' },
  });
  const birthDate = useWatch({ control: form.control, name: 'birth_date' });
  const watchedGender = useWatch({ control: form.control, name: 'gender' });

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (isTrainer) {
          onContinueTrainer(values);
          return;
        }
        onFinish(values);
      })}
    >
      <h2 className="text-display text-center text-content">Расскажите о себе</h2>
      {/* `role="radiogroup"` + `aria-labelledby` вместо `fieldset`/`legend` —
          та же причина, что и в AccountStep: legend исключён из анонимного
          бокса содержимого fieldset, поэтому `items-center`, `gap` и
          `mx-auto` на него не действовали, и подпись вставала слева вплотную
          к badge-ам (0px вместо заявленных 25px). Название группы сохранено
          через `aria-labelledby`. */}
      <div role="radiogroup" aria-labelledby="gender-label" className="flex flex-col gap-[25px]">
        <p id="gender-label" className="text-body-m text-center text-content">
          Ваш пол:
        </p>
        {/* Figma 392:4929/392:4969: gender is a circular badge above the
            label, not the paired-pill shape used for account type. Figma's
            badge glyph is a gender symbol icon; lucide-react (the project's
            only allowed icon source, see icons.ts) has no matching icon in
            the current re-export set and this task may not add to shared/ui,
            so a plain text initial stands in instead of a fabricated SVG.
            Selected = accent-400 fill (badge + label follow the accent
            color); unselected = transparent circle + 2px neutral-600 border.
            Native radios stay for a11y/tests, visually hidden under the
            styled label. */}
        <div className="flex items-center justify-center gap-[40px]">
          {(
            [
              { value: 'male', label: 'Мужской' },
              { value: 'female', label: 'Женский' },
            ] as const
          ).map((option) => {
            const selected = watchedGender === option.value;
            return (
              <label
                key={option.value}
                // The native radio is sr-only (clipped to 1px), so its own
                // focus ring is invisible — draw the ring on the styled label.
                className="flex w-[75px] cursor-pointer flex-col items-center gap-[5px] rounded-[12px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-400"
              >
                <input
                  type="radio"
                  value={option.value}
                  className="sr-only"
                  {...form.register('gender')}
                />
                <span
                  aria-hidden="true"
                  className={`flex h-[65px] w-[65px] items-center justify-center rounded-full text-h1 transition-colors ${
                    selected
                      ? 'bg-brand-400 text-neutral-50'
                      : 'border-2 border-neutral-600 text-content'
                  }`}
                >
                  {option.value === 'male' ? 'М' : 'Ж'}
                </span>
                <span className={`text-h3 ${selected ? 'text-brand-text' : 'text-content'}`}>
                  {option.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      {form.formState.errors.gender ? (
        <p role="alert" className="text-body-s text-danger text-center">
          {form.formState.errors.gender.message}
        </p>
      ) : null}
      {/* Дата рождения идёт через тот же фасад Input, что и соседние поля (и что
          «Дата рождения» в настройках профиля), поэтому геометрия поля — высота
          58px, радиус и рамка из shared/ui/field.ts — совпадает с полями веса и
          роста. Нативный <input type="date"> без фасада сломал бы этот инвариант. */}
      <Input
        label="Дата рождения"
        type="date"
        error={form.formState.errors.birth_date?.message}
        {...form.register('birth_date')}
        value={birthDate}
      />
      <Input
        label="Вес, кг"
        type="number"
        placeholder="Ваш вес сейчас"
        error={form.formState.errors.weight?.message}
        {...form.register('weight')}
      />
      <Input
        label="Рост, см"
        type="number"
        placeholder="Ваш рост"
        error={form.formState.errors.height?.message}
        {...form.register('height')}
      />
      <ErrorMessage message={error} />
      <Button type="submit" disabled={!isOnline || isPending} loading={isPending}>
        {offlineLabel(isOnline, isTrainer ? 'Продолжить' : 'Завершить')}
      </Button>
    </form>
  );
}
