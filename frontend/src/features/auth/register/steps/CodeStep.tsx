import { useState } from 'react';

import { useRegisterVerify } from '@/entities/session/api/use-register-verify';
import { useResendCode } from '@/entities/session/api/use-resend-code';
import { retryAfterSeconds } from '@/shared/api/client';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { OtpInput } from '@/shared/ui/OtpInput';

const CODE_ERROR = 'Неверный или просроченный код';

interface CodeStepProps {
  email: string;
  cooldown: number;
  onVerified: () => void;
  /** Resend was rate-limited; raise the cooldown from the 429 Retry-After. */
  onCooldownBumped: (seconds: number) => void;
  onSkip: () => void;
  onChangeEmail: () => void;
}

/** Screen 3: confirm the emailed code. Verifying signs the user in and moves
 *  to onboarding; skipping makes a password mandatory instead. */
export function CodeStep({
  email,
  cooldown,
  onVerified,
  onCooldownBumped,
  onSkip,
  onChangeEmail,
}: CodeStepProps) {
  const { isOnline } = useNetworkStatus();
  const registerVerify = useRegisterVerify();
  const resendCode = useResendCode();
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-[10px] text-center">
        <h2 className="text-display text-content">Подтвердите email</h2>
        <p className="text-body-m text-content">Код отправлен на</p>
        <p className="text-body-m rounded-card bg-card-light px-[10px] py-[10px] text-brand-text">
          {email}
        </p>
      </div>
      <OtpInput
        onComplete={(code) => registerVerify.mutate({ email, code }, { onSuccess: onVerified })}
        error={registerVerify.isError ? CODE_ERROR : undefined}
        disabled={!isOnline || registerVerify.isPending}
        onResend={() =>
          resendCode.mutateAsync(
            { contact: email, purpose: 'register' },
            {
              onError: (error) => {
                const retry = retryAfterSeconds(error);
                if (retry !== null) {
                  onCooldownBumped(retry);
                }
              },
            },
          )
        }
        resendCooldownSeconds={cooldown}
      />
      <Button type="button" variant="ghost" onClick={() => setSkipDialogOpen(true)}>
        Пропустить
      </Button>
      <Button type="button" variant="ghost" onClick={onChangeEmail}>
        Изменить email
      </Button>
      <ConfirmDialog
        isOpen={skipDialogOpen}
        title="Пропустить подтверждение email?"
        message="Подтвердить email нужно в течение 90 дней, иначе аккаунт будет удалён вместе с данными."
        confirmLabel="Всё равно пропустить"
        cancelLabel="Вернуться к подтверждению"
        destructive
        onConfirm={() => {
          setSkipDialogOpen(false);
          onSkip();
        }}
        onCancel={() => setSkipDialogOpen(false)}
      />
    </div>
  );
}
