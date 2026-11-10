import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';

import {
  useConfirmPasswordReset,
  useRequestPasswordReset,
} from '@/entities/session/api/use-password-reset';
import { useResendCode } from '@/entities/session/api/use-resend-code';
import { useVerifyCode } from '@/entities/session/api/use-verify-code';
import { useSessionStore } from '@/entities/session/model/store';
import { retryAfterSeconds, toApiError } from '@/shared/api/client';
import { paths } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { saveCredential } from '@/shared/lib/platform/save-password/save-password';

import { NewPasswordStep } from './steps/NewPasswordStep';
import { ResetCodeStep } from './steps/ResetCodeStep';
import { ResetContactStep } from './steps/ResetContactStep';
import {
  contactSchema,
  passwordSchema,
  type ContactValues,
  type PasswordValues,
} from './steps/schemas';

type Step = 'contact' | 'code' | 'password';

/**
 * Восстановление пароля: email → код → новый пароль. Разметка шагов живёт в
 * ./steps/*, здесь — переходы между ними и мутации.
 */
export function PasswordResetFlow() {
  const history = useNavigation();
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const { isOnline } = useNetworkStatus();
  const requestReset = useRequestPasswordReset();
  const verifyCode = useVerifyCode();
  const resendCode = useResendCode();
  const confirmReset = useConfirmPasswordReset();
  const [step, setStep] = useState<Step>('contact');
  const [email, setEmail] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [cooldown, setCooldown] = useState(60);

  const contactForm = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { email: '' },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', password_repeat: '' },
  });

  /** Return to the contact step from the code step, clearing the pending verify
   *  and the verification token so a mistyped email can be corrected and a stale
   *  token can't leak into the new-password step. The email stays prefilled (the
   *  contact form still holds the typed value). */
  const goToContact = () => {
    verifyCode.reset();
    setVerificationToken('');
    setCooldown(60);
    setStep('contact');
  };

  const requestError =
    requestReset.isError && retryAfterSeconds(requestReset.error) === null
      ? toApiError(requestReset.error).message
      : '';
  const confirmError = confirmReset.isError ? toApiError(confirmReset.error).message : '';

  if (isAuthenticated) {
    return <Navigate replace to={paths.home} />;
  }

  if (step === 'code') {
    return (
      <ResetCodeStep
        email={email}
        invalidCode={verifyCode.isError}
        disabled={!isOnline || verifyCode.isPending}
        resendCooldownSeconds={cooldown}
        onComplete={(code) =>
          verifyCode.mutate(
            { contact: email, code, purpose: 'password_reset' },
            {
              onSuccess: (response) => {
                setVerificationToken(response.verification_token);
                setStep('password');
              },
            },
          )
        }
        onResend={() =>
          resendCode.mutateAsync(
            { contact: email, purpose: 'password_reset' },
            {
              onError: (error) => {
                const retry = retryAfterSeconds(error);
                if (retry !== null) {
                  setCooldown(retry);
                }
              },
            },
          )
        }
        onChangeEmail={goToContact}
      />
    );
  }

  if (step === 'password') {
    return (
      <NewPasswordStep
        form={passwordForm}
        email={email}
        error={confirmError}
        isOnline={isOnline}
        pending={confirmReset.isPending}
        onSubmit={(values) =>
          confirmReset.mutate(
            { verification_token: verificationToken, new_password: values.password },
            {
              onSuccess: () => {
                void saveCredential(email, values.password);
                history.replace(paths.login);
              },
            },
          )
        }
      />
    );
  }

  return (
    <ResetContactStep
      form={contactForm}
      error={requestError}
      isOnline={isOnline}
      pending={requestReset.isPending}
      onSubmit={(values) =>
        requestReset.mutate(
          { contact: values.email },
          {
            onSuccess: () => {
              setEmail(values.email);
              // Reset any cooldown lowered by a 429 for a previous attempt, so
              // resend isn't wrongly blocked after a back-and-retry.
              setCooldown(60);
              setStep('code');
            },
            onError: (error) => {
              // 429: recently requested — proceed with the Retry-After timer.
              const retry = retryAfterSeconds(error);
              if (retry !== null) {
                setEmail(values.email);
                setCooldown(retry);
                setStep('code');
              }
            },
          },
        )
      }
    />
  );
}
