import { PASSWORD_REQUIREMENTS } from '@/shared/lib/validation/password';
import type { UseFormReturn } from 'react-hook-form';

import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

import { ErrorMessage } from './ErrorMessage';
import type { PasswordValues } from './schemas';

interface Props {
  form: UseFormReturn<PasswordValues>;
  email: string;
  error: string;
  isOnline: boolean;
  pending: boolean;
  onSubmit: (values: PasswordValues) => void;
}

export function NewPasswordStep({ form, email, error, isOnline, pending, onSubmit }: Props) {
  return (
    <form className="flex flex-col gap-[30px]" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      {/* Figma 392:4914: Display heading + Body M helper copy, centered. */}
      <div className="flex flex-col items-center gap-[10px] text-center">
        <h2 className="text-display text-content">Новый пароль</h2>
        <p className="text-body-m text-content">{PASSWORD_REQUIREMENTS}</p>
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
      {/* Figma 392:4914: 25px between the two fields (the outer form uses
          30px for heading→fields, a different rhythm). */}
      <div className="flex flex-col gap-[25px]">
        <Input
          label="Пароль"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        <Input
          label="Повторите пароль"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.password_repeat?.message}
          {...form.register('password_repeat')}
        />
      </div>
      <ErrorMessage message={error} />
      <Button type="submit" disabled={!isOnline || pending} loading={pending}>
        {offlineLabel(isOnline, 'Сохранить')}
      </Button>
    </form>
  );
}
