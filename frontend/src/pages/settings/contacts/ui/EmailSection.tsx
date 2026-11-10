import { useState } from 'react';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

import { ContactBadge, ErrorText } from './ContactBadge';

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Props {
  email: string | null | undefined;
  verified: boolean;
  isOnline: boolean;
  /** Идёт сохранение неподтверждённого адреса или запрос кода на новый. */
  savePending: boolean;
  verifyPending: boolean;
  saveError: unknown;
  changeError: unknown;
  /** Режим правки живёт у родителя: его закрывает ещё и успешное
   *  подтверждение кода, которое приходит из диалога, а не отсюда. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Подтверждённый адрес меняется только кодом на НОВЫЙ адрес. */
  onRequestChange: (newEmail: string) => void;
  /** Неподтверждённый адрес правится напрямую. */
  onSaveDirectly: (newEmail: string) => void;
  onStartVerify: () => void;
}

export function EmailSection({
  email,
  verified,
  isOnline,
  savePending,
  verifyPending,
  saveError,
  changeError,
  editing,
  onEditingChange,
  onRequestChange,
  onSaveDirectly,
  onStartVerify,
}: Props) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');

  const submitDraft = () => {
    if (!emailPattern.test(draft)) {
      setDraftError('Введите корректный email');
      return;
    }
    setDraftError('');
    if (verified) {
      onRequestChange(draft);
    } else {
      onSaveDirectly(draft);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-s text-muted">Email</p>
          <p className="text-h3 break-all text-content">{email ?? 'Email не указан'}</p>
        </div>
        <span className="shrink-0">
          <ContactBadge verified={verified} />
        </span>
      </div>
      {editing ? (
        <div className="flex flex-col gap-3">
          <Input
            label="Новый email"
            type="email"
            inputMode="email"
            autoComplete="email"
            error={draftError}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {verified ? (
            <p className="text-body-s text-muted">Код подтверждения придёт на новый адрес.</p>
          ) : null}
          <ErrorText error={saveError} />
          <ErrorText error={changeError} />
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => onEditingChange(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!isOnline || savePending}
              loading={savePending}
              onClick={submitDraft}
            >
              Сохранить
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!isOnline}
            onClick={() => {
              setDraft(email ?? '');
              onEditingChange(true);
            }}
          >
            Изменить
          </Button>
          {!verified && email ? (
            <Button
              type="button"
              disabled={!isOnline || verifyPending}
              loading={verifyPending}
              onClick={onStartVerify}
            >
              Подтвердить
            </Button>
          ) : null}
        </div>
      )}
      <p className="text-body-s text-muted">
        Email обязателен — это ваш способ входа и восстановления доступа.
      </p>
    </section>
  );
}
