import type { UseFormReturn } from 'react-hook-form';

import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { Button } from '@/shared/ui/Button';

import { FormError, PasswordField } from './fields';
import type { TwoFactorValues } from './schemas';

interface Props {
  form: UseFormReturn<TwoFactorValues>;
  email: string;
  error: string | undefined;
  isOnline: boolean;
  pending: boolean;
  onSubmit: (values: TwoFactorValues) => void;
  onChangeEmail: () => void;
}

/** Шаг «код + пароль»: код уже подтверждён, аккаунт требует ещё и пароль. */
export function TwoFactorStep({
  form,
  email,
  error,
  isOnline,
  pending,
  onSubmit,
  onChangeEmail,
}: Props) {
  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 text-content">Теперь введите пароль</h2>
        <p className="text-body-s text-muted">Для этого аккаунта включён вход «код + пароль»</p>
      </div>
      {/* Visually hidden username lets password managers pair the login. */}
      <input
        className="sr-only"
        type="email"
        name="email"
        autoComplete="username"
        value={email}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
      />
      <PasswordField
        error={form.formState.errors.password?.message}
        {...form.register('password')}
      />
      <FormError message={error} />
      <div className="flex flex-col gap-[15px]">
        <Button type="submit" disabled={!isOnline || pending} loading={pending}>
          {offlineLabel(isOnline, 'Войти')}
        </Button>
        <Button type="button" variant="ghost" width="content" onClick={onChangeEmail}>
          Изменить email
        </Button>
      </div>
    </form>
  );
}
