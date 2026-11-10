import { CodeLoginNotice } from './CodeLoginNotice';
import type { UseFormReturn } from 'react-hook-form';

import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { Button } from '@/shared/ui/Button';

import { EmailField, FormError } from './fields';
import type { CodeModeValues } from './schemas';

interface Props {
  form: UseFormReturn<CodeModeValues>;
  error: string | undefined;
  isOnline: boolean;
  pending: boolean;
  onSubmit: (values: CodeModeValues) => void;
  onSwitchToPassword: () => void;
}

/** Первый шаг основного (passwordless) входа: запрос кода на email. */
export function ContactStep({
  form,
  error,
  isOnline,
  pending,
  onSubmit,
  onSwitchToPassword,
}: Props) {
  return (
    // 25px между полем и блоком действий — шаг «форма → следующая зона» из
    // design-system.md. Внутри блока действий кнопка и текстовая ссылка
    // связаны теснее (12px).
    <form className="flex flex-col gap-[25px]" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <EmailField error={form.formState.errors.email?.message} {...form.register('email')} />
      <FormError message={error} />
      <CodeLoginNotice />
      <div className="flex flex-col gap-3">
        <Button type="submit" disabled={!isOnline || pending} loading={pending}>
          {offlineLabel(isOnline, 'Получить код')}
        </Button>
        <Button type="button" variant="ghost" width="content" onClick={onSwitchToPassword}>
          Войти по паролю
        </Button>
      </div>
    </form>
  );
}
