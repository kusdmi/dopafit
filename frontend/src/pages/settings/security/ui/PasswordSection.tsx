import { newPasswordSchema, PASSWORD_REQUIREMENTS } from '@/shared/lib/validation/password';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { components } from '@/shared/api/schema';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

import { ErrorText, StatusText } from '../../ui/SettingsShell';

type UserOut = components['schemas']['UserOut'];

const passwordSchema = z
  .object({
    current_password: z.string(),
    new_password: newPasswordSchema,
    new_password_repeat: z.string(),
  })
  .refine((value) => value.new_password === value.new_password_repeat, {
    message: 'Пароли не совпадают',
    path: ['new_password_repeat'],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

interface Props {
  user: UserOut;
  isOnline: boolean;
  pending: boolean;
  error: unknown;
  savedMessage: string;
  /** Отправляет пароль; сброс формы делает вызывающий после успеха. */
  onSubmit: (values: PasswordValues, resetForm: () => void) => void;
}

export function PasswordSection({ user, isOnline, pending, error, savedMessage, onSubmit }: Props) {
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '', new_password_repeat: '' },
  });

  return (
    <section className="flex flex-col gap-[15px]">
      <h2 className="text-caption px-[10px] text-muted">
        {user.has_password ? 'Смена пароля' : 'Добавить пароль'}
      </h2>
      <form
        className="flex flex-col gap-[15px]"
        noValidate
        onSubmit={form.handleSubmit((values) => onSubmit(values, () => form.reset()))}
      >
        {/* Visually hidden username lets password managers pair the login. */}
        <input
          className="sr-only"
          type="email"
          name="email"
          autoComplete="username"
          value={user.email ?? ''}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
        />
        <p className="text-body-s text-muted">{PASSWORD_REQUIREMENTS}</p>
        {user.has_password ? (
          <Input
            label="Текущий пароль"
            type="password"
            autoComplete="current-password"
            error={form.formState.errors.current_password?.message}
            {...form.register('current_password')}
          />
        ) : null}
        <Input
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.new_password?.message}
          {...form.register('new_password')}
        />
        <Input
          label="Повторите пароль"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.new_password_repeat?.message}
          {...form.register('new_password_repeat')}
        />
        <ErrorText error={error} />
        <StatusText message={savedMessage} />
        {/* Сохранённый пароль сам по себе не включает вход по паролю —
            нужно ещё сменить login_method. Подсказываем, чтобы пользователь
            не думал, что пароль уже работает. */}
        {user.has_password && user.login_method === 'code' ? (
          <p className="text-body-s text-muted">
            Вход по паролю пока не включён. Чтобы входить с паролем, выберите выше способ входа
            «Пароль» или «Код + пароль» — смена подтверждается кодом на email.
          </p>
        ) : null}
        <Button type="submit" disabled={!isOnline || pending} loading={pending}>
          {isOnline ? 'Сохранить пароль' : 'Недоступно офлайн'}
        </Button>
      </form>
    </section>
  );
}
