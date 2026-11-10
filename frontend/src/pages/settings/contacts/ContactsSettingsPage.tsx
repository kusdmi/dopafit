import { useState } from 'react';

import {
  useContactChangeConfirm,
  useContactChangeRequest,
  useContactVerifyConfirm,
  useContactVerifyRequest,
} from '@/entities/user/api/use-contacts';
import { useMe, useUpdateMe } from '@/entities/user/api/use-me';
import { retryAfterSeconds } from '@/shared/api/client';
import { tokenStorage } from '@/shared/api/tokens';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { useCodeCooldown } from '@/shared/lib/otp/use-code-cooldown';
import { OtpDialog } from '@/shared/ui/OtpDialog';
import { Skeleton } from '@/shared/ui/Skeleton';

import { SettingsShell } from '../ui/SettingsShell';
import { EmailSection } from './ui/EmailSection';
import { PhoneSection } from './ui/PhoneSection';

const CODE_ERROR = 'Неверный или просроченный код';

/** OTP dialog target: verify the CURRENT email or confirm a change to a NEW one. */
type ContactType = 'email' | 'phone';
type OtpFlow = ({ kind: 'verify' } | { kind: 'change'; newEmail: string }) & { type: ContactType };

export function ContactsSettingsPage({ embedded = false }: { embedded?: boolean }) {
  const { data: me } = useMe();
  const { isOnline } = useNetworkStatus();
  const updateMe = useUpdateMe();
  const verifyRequest = useContactVerifyRequest();
  const verifyConfirm = useContactVerifyConfirm();
  const changeRequest = useContactChangeRequest();
  const changeConfirm = useContactChangeConfirm();
  const [emailEditing, setEmailEditing] = useState(false);
  const [otpFlow, setOtpFlow] = useState<OtpFlow | null>(null);
  const { cooldown, handlers } = useCodeCooldown();

  const user = me?.user;

  const startVerify = (type: ContactType = 'email') => {
    verifyConfirm.reset();
    verifyRequest.mutate(
      { type },
      handlers(
        () => setOtpFlow({ kind: 'verify', type }),
        () => setOtpFlow({ kind: 'verify', type }),
      ),
    );
  };

  const startChange = (newEmail: string, type: ContactType = 'email') => {
    changeConfirm.reset();
    changeRequest.mutate(
      { type, new_contact: newEmail },
      handlers(
        () => setOtpFlow({ kind: 'change', newEmail, type }),
        () => setOtpFlow({ kind: 'change', newEmail, type }),
      ),
    );
  };

  const completeOtp = async (code: string) => {
    if (otpFlow?.kind === 'verify') {
      verifyConfirm.mutate({ type: otpFlow.type, code }, { onSuccess: () => setOtpFlow(null) });
      return;
    }
    if (otpFlow?.kind === 'change') {
      // Keep THIS session alive: the server revokes every other one.
      const refreshToken = await tokenStorage.getRefresh();
      changeConfirm.mutate(
        { type: otpFlow.type, code, refresh_token: refreshToken },
        {
          onSuccess: () => {
            setOtpFlow(null);
            setEmailEditing(false);
          },
        },
      );
    }
  };

  return (
    <SettingsShell title="Контакты" embedded={embedded}>
      {!user ? (
        <Skeleton variant="form" count={2} />
      ) : (
        <>
          <EmailSection
            email={user.email}
            verified={user.email_verified}
            isOnline={isOnline}
            savePending={updateMe.isPending || changeRequest.isPending}
            verifyPending={verifyRequest.isPending}
            saveError={updateMe.error}
            changeError={
              changeRequest.isError && retryAfterSeconds(changeRequest.error) === null
                ? changeRequest.error
                : null
            }
            editing={emailEditing}
            onEditingChange={setEmailEditing}
            onRequestChange={(value) => startChange(value)}
            onSaveDirectly={(email) =>
              updateMe.mutate({ email }, { onSuccess: () => setEmailEditing(false) })
            }
            onStartVerify={() => startVerify()}
          />

          <PhoneSection
            phone={user.phone}
            verified={user.phone_verified}
            onVerify={() => startVerify('phone')}
            verifyPending={verifyRequest.isPending}
            isOnline={isOnline}
            pending={updateMe.isPending || changeRequest.isPending}
            error={updateMe.error}
            onSave={(phone, onSaved) =>
              user.phone_verified
                ? startChange(phone, 'phone')
                : updateMe.mutate({ phone }, { onSuccess: onSaved })
            }
            onRemove={() => updateMe.mutate({ phone: null })}
          />

          <OtpDialog
            isOpen={otpFlow !== null}
            title={
              otpFlow?.type === 'phone'
                ? 'Подтверждение телефона'
                : otpFlow?.kind === 'change'
                  ? 'Подтвердите новый email'
                  : 'Подтверждение email'
            }
            contact={
              otpFlow?.kind === 'change'
                ? otpFlow.newEmail
                : otpFlow?.type === 'phone'
                  ? user.phone
                  : user.email
            }
            error={
              (otpFlow?.kind === 'verify' && verifyConfirm.isError) ||
              (otpFlow?.kind === 'change' && changeConfirm.isError)
                ? CODE_ERROR
                : undefined
            }
            pending={verifyConfirm.isPending || changeConfirm.isPending}
            onComplete={(code) => void completeOtp(code)}
            onResend={() =>
              otpFlow?.kind === 'change'
                ? changeRequest.mutateAsync({ type: otpFlow.type, new_contact: otpFlow.newEmail })
                : verifyRequest.mutateAsync({ type: otpFlow?.type ?? 'email' })
            }
            resendCooldownSeconds={cooldown}
            onCancel={() => setOtpFlow(null)}
          />
        </>
      )}
    </SettingsShell>
  );
}
