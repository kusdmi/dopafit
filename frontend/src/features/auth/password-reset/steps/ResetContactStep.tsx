import type { UseFormReturn } from 'react-hook-form';

import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

import { ErrorMessage } from './ErrorMessage';
import type { ContactValues } from './schemas';

interface Props {
  form: UseFormReturn<ContactValues>;
  error: string;
  isOnline: boolean;
  pending: boolean;
  onSubmit: (values: ContactValues) => void;
}

export function ResetContactStep({ form, error, isOnline, pending, onSubmit }: Props) {
  return (
    <form className="flex flex-col gap-[30px]" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      {/* Figma 392:2034: Display heading carries the screen title — the
          toolbar above has no visible text in this node. */}
      <h2 className="text-display text-content text-center">Введите свой email</h2>
      {/* `autoComplete="email"`, not `username`: there is no password field on
          this step, so `username` describes an incomplete sign-in form and iOS
          offers no saved address for it. */}
      <Input
        label="Email"
        type="email"
        inputMode="email"
        placeholder="mail@example.com"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={form.formState.errors.email?.message}
        {...form.register('email')}
      />
      <ErrorMessage message={error} />
      <Button type="submit" disabled={!isOnline || pending} loading={pending}>
        {offlineLabel(isOnline, 'Далее')}
      </Button>
    </form>
  );
}
