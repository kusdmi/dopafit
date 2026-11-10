import { CodeLoginNotice } from './CodeLoginNotice';
import { Button } from '@/shared/ui/Button';
import { OtpInput } from '@/shared/ui/OtpInput';

import { CODE_ERROR } from './schemas';

interface Props {
  email: string;
  invalidCode: boolean;
  disabled: boolean;
  resendCooldownSeconds: number;
  onComplete: (code: string) => void;
  onResend: () => unknown;
  onChangeEmail: () => void;
  onSwitchToPassword: () => void;
}

/** Шаг ввода одноразового кода — основной способ входа (passwordless). */
export function OtpStep({
  email,
  invalidCode,
  disabled,
  resendCooldownSeconds,
  onComplete,
  onResend,
  onChangeEmail,
  onSwitchToPassword,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 text-content">Введите код</h2>
        <p role="status" aria-label="Отправка кода" className="text-body-s text-muted">
          Если для аккаунта доступен вход по коду, письмо отправлено на {email}
        </p>
      </div>
      <CodeLoginNotice />
      <Button type="button" variant="ghost" onClick={onSwitchToPassword}>
        Войти по паролю
      </Button>
      <OtpInput
        onComplete={onComplete}
        error={invalidCode ? CODE_ERROR : undefined}
        disabled={disabled}
        onResend={onResend}
        resendCooldownSeconds={resendCooldownSeconds}
      />
      <Button type="button" variant="ghost" onClick={onChangeEmail}>
        Изменить email
      </Button>
    </div>
  );
}
