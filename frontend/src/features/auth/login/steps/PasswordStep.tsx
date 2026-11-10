import type { UseFormReturn } from 'react-hook-form';

import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { Button } from '@/shared/ui/Button';

import { EmailField, FormError, PasswordField } from './fields';
import type { PasswordModeValues } from './schemas';

interface Props {
  form: UseFormReturn<PasswordModeValues>;
  error: string | undefined;
  isOnline: boolean;
  pending: boolean;
  onSubmit: (values: PasswordModeValues) => void;
  onSwitchToCode: () => void;
  onForgotPassword: () => void;
}

/** Альтернативный вход по паролю (основной способ — код). */
export function PasswordStep({
  form,
  error,
  isOnline,
  pending,
  onSubmit,
  onSwitchToCode,
  onForgotPassword,
}: Props) {
  return (
    // Те же шаги, что в ContactStep: 25px между зонами формы, 12px внутри
    // блока действий — оба шага одного экрана должны совпадать.
    <form className="flex flex-col gap-[25px]" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-[25px]">
        {/* `username`, not the field's `email` default: this address is the
            login half of a credential pair with the `current-password` field
            below, and that is the token password managers match a saved
            record on. */}
        <EmailField
          autoComplete="username"
          // Здесь, в отличие от остальных шагов, за email идёт ещё поле пароля,
          // поэтому клавиша подписывается «Далее», а не «Войти».
          enterKeyHint="next"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <PasswordField
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
      </div>
      <FormError message={error} />
      <div className="flex flex-col gap-3">
        <Button type="submit" disabled={!isOnline || pending} loading={pending}>
          {offlineLabel(isOnline, 'Войти')}
        </Button>
        <Button type="button" variant="ghost" width="content" onClick={onSwitchToCode}>
          Войти по коду
        </Button>
        <Button type="button" variant="ghost" width="content" onClick={onForgotPassword}>
          Восстановить пароль
        </Button>
      </div>
    </form>
  );
}
