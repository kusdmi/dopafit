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
}

export function ResetCodeStep({
  email,
  invalidCode,
  disabled,
  resendCooldownSeconds,
  onComplete,
  onResend,
  onChangeEmail,
}: Props) {
  return (
    <div className="flex flex-col gap-[30px]">
      {/* Figma 392:4895: Display heading, body caption, contact echoed in a
          brand-colored pill — reusing the accent/card tokens instead of the
          node's hardcoded hex values. */}
      <div className="flex flex-col items-center gap-[10px] text-center">
        <h2 className="text-display text-content">Введите код</h2>
        <div
          role="status"
          aria-label="Отправка кода"
          className="flex flex-col items-center gap-[10px]"
        >
          <p className="text-body-m text-content">Код отправлен на</p>
          <span className="text-body-m rounded-card bg-card-light px-[10px] py-[10px] text-brand-text">
            {email}
          </span>
        </div>
      </div>
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
