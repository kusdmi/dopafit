import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { useState } from 'react';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { BuilderErrors, validateDraft } from './model/validation';

import { DayBlock } from './DayBlock';
import { DayModal } from './DayModal';
import { MAX_DAYS, useBuilderStore } from './model/store';

interface Props {
  onSave: () => void;
  isSaving?: boolean;
  error?: string | null;
  isCopy?: boolean;
  fieldErrors?: Record<string, string>;
}

export function ProgramBuilder({ onSave, isSaving, error, isCopy, fieldErrors = {} }: Props) {
  const subscription = useSubscriptionStatus();
  const maxDays = subscription.data?.entitlements?.limits.days ?? MAX_DAYS;
  const draft = useBuilderStore((s) => s.draft);
  const setName = useBuilderStore((s) => s.setName);
  const addDay = useBuilderStore((s) => s.addDay);
  const canAddDay = useBuilderStore((s) => s.draft.days.length < maxDays);
  const [dayOpen, setDayOpen] = useState(false);

  const [nameTouched, setNameTouched] = useState(false);
  const localErrors = validateDraft(draft);
  const errors = { ...fieldErrors, ...localErrors };
  const hasExercise = draft.days.some((day) => day.slots.length > 0);
  const canSave =
    draft.name.trim() !== '' &&
    draft.days.length > 0 &&
    hasExercise &&
    Object.keys(localErrors).length === 0;

  return (
    <BuilderErrors.Provider value={errors}>
      <div className="flex flex-col gap-[25px]">
        {isCopy && (
          // Без рамки. Обводка — структурный признак «это отдельный объект»
          // (design-system.md «Вложенность карточек»), а здесь одна строка
          // пояснения к форме под ней, а не объект. Приглушённый текст ставит её
          // на шаг ниже полей, которые она комментирует.
          <p className="text-body-s text-muted">Изменения сохранятся как ваша собственная копия.</p>
        )}
        {/* Роль H3 (16px) — та же, что у значения в фасаде Input. Ниже 16px iOS
          зумит страницу при фокусе поля, и сбросить этот зум пользователь
          потом не может (`user-scalable=no` в index.html). */}
        <Input
          label="Название программы"
          error={
            nameTouched || fieldErrors[`${draft.id}:name`] ? errors[`${draft.id}:name`] : undefined
          }
          onBlur={() => setNameTouched(true)}
          value={draft.name}
          onChange={(e) => {
            setNameTouched(true);
            setName(e.target.value);
          }}
          placeholder="Название программы"
          className="text-h3"
        />
        <div className="flex flex-col gap-5">
          {draft.days.map((d) => (
            <DayBlock key={d.id} dayId={d.id} />
          ))}
        </div>
        <Button
          variant="outline"
          className="border-brand-400 text-body-s text-content"
          onClick={() => setDayOpen(true)}
        >
          Добавить день
        </Button>
        {!canAddDay && subscription.data && !subscription.data.is_active && (
          <PremiumNotice
            title="Лимит дней"
            description={`В бесплатном доступе до ${maxDays} дней в программе. Premium расширяет лимиты.`}
          />
        )}
        {error && (
          <p role="alert" className="text-center text-body-s text-danger">
            {error}
          </p>
        )}
        {draft.days.length > 0 && !hasExercise && (
          <p className="text-center text-body-s text-muted">Добавьте хотя бы одно упражнение</p>
        )}
        <Button
          variant="primary"
          disabled={!canSave || isSaving}
          loading={isSaving}
          onClick={onSave}
        >
          {isCopy ? 'Сохранить копию' : 'Сохранить программу'}
        </Button>
        {dayOpen && (
          <DayModal
            mode="add"
            canAdd={canAddDay}
            onClose={() => setDayOpen(false)}
            onSubmit={(name) => {
              addDay(name);
              setDayOpen(false);
            }}
          />
        )}
      </div>
    </BuilderErrors.Provider>
  );
}
