import { PASSWORD_REQUIREMENTS } from '@/shared/lib/validation/password';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { useSetPassword } from '@/entities/session/api/use-set-password';
import { toApiError } from '@/shared/api/client';
import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { saveCredential } from '@/shared/lib/platform/save-password/save-password';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

import { passwordSchema, type PasswordValues } from '../lib/schemas';
import { ErrorMessage } from '../ui/ErrorMessage';

interface PasswordStepProps {
  email: string;
  registrationToken: string;
  onCompleted: () => void;
}

/** Screen 4 (skip branch): a password is mandatory when email is unconfirmed,
 *  otherwise the user could never sign back in. */
export function PasswordStep({ email, registrationToken, onCompleted }: PasswordStepProps) {
  const { isOnline } = useNetworkStatus();
  const setPassword = useSetPassword();

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', password_repeat: '' },
    // Validate live, not only on submit, so the requirements hint
    // (and the field's own error) react to typing rather than only appearing
    // after the first failed submit.
    mode: 'onChange',
  });

  const passwordError = setPassword.isError ? toApiError(setPassword.error).message : '';

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        setPassword.mutate(
          { registration_token: registrationToken, password: values.password },
          {
            onSuccess: () => {
              void saveCredential(email, values.password);
              onCompleted();
            },
          },
        );
      })}
    >
      <div className="flex flex-col items-center gap-[10px] text-center">
        <h2 className="text-display text-content">Создайте пароль</h2>
        {/* Figma 392:2008: requirements are a static subtitle under the title,
            always visible (not error-driven) — matches the mode:'onChange'
            fix above so the field's own error also updates live. */}
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
      <Input
        label="Пароль"
        type="password"
        placeholder="Минимум 8 символов"
        autoComplete="new-password"
        error={form.formState.errors.password?.message}
        {...form.register('password')}
      />
      {/* The eye toggle shows on BOTH fields of the pair, not just the
          first — product decision. `hidePasswordToggle` stays in the Input
          API (still used elsewhere, e.g. security settings) but isn't passed
          here. */}
      <Input
        label="Повторите пароль"
        type="password"
        placeholder="Ещё раз, для надёжности"
        autoComplete="new-password"
        error={form.formState.errors.password_repeat?.message}
        {...form.register('password_repeat')}
      />
      <ErrorMessage message={passwordError} />
      <Button
        type="submit"
        disabled={!isOnline || setPassword.isPending}
        loading={setPassword.isPending}
      >
        {offlineLabel(isOnline, 'Продолжить')}
      </Button>
    </form>
  );
}
