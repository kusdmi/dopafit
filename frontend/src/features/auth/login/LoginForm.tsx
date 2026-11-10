import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigation } from '@/shared/lib/navigation';

import { useLogin } from '@/entities/session/api/use-login';
import { useRequestLoginCode } from '@/entities/session/api/use-request-login-code';
import { useVerifyLoginCode } from '@/entities/session/api/use-verify-login-code';
import { retryAfterSeconds, toApiError } from '@/shared/api/client';
import { paths } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { saveCredential } from '@/shared/lib/platform/save-password/save-password';

import { ContactStep } from './steps/ContactStep';
import { OtpStep } from './steps/OtpStep';
import { PasswordStep } from './steps/PasswordStep';
import {
  codeModeSchema,
  passwordModeSchema,
  twoFactorSchema,
  type CodeModeValues,
  type PasswordModeValues,
  type TwoFactorValues,
} from './steps/schemas';
import { TwoFactorStep } from './steps/TwoFactorStep';

type Step = 'contact' | 'otp' | 'two-factor';
type Mode = 'code' | 'password';

/**
 * Машина состояний входа. Сам по себе экран один, но у него четыре вида:
 * запрос кода → ввод кода → (для аккаунтов с «код + пароль») пароль, плюс
 * альтернативная ветка входа по паролю. Разметка каждого вида живёт в
 * ./steps/*, здесь остаются переходы и мутации — их порядок и есть суть флоу.
 */
export function LoginForm() {
  const history = useNavigation();
  const { isOnline } = useNetworkStatus();
  const login = useLogin();
  const requestCode = useRequestLoginCode();
  const verifyCode = useVerifyLoginCode();
  const [step, setStep] = useState<Step>('contact');
  const [mode, setMode] = useState<Mode>('code');
  const [email, setEmail] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [cooldown, setCooldown] = useState(60);

  const codeForm = useForm<CodeModeValues>({
    resolver: zodResolver(codeModeSchema),
    defaultValues: { email: '' },
  });
  const passwordForm = useForm<PasswordModeValues>({
    resolver: zodResolver(passwordModeSchema),
    defaultValues: { email: '', password: '' },
  });
  const twoFactorForm = useForm<TwoFactorValues>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: { password: '' },
  });

  // Navigation after login is DECLARATIVE: setSession flips isAuthenticated
  // and the guard in LoginPage redirects to home (see router.tsx).

  /** Return to the contact step from anywhere, clearing all transient
   *  challenge/mutation state so a stale error/challenge can't leak across. */
  const goToContact = () => {
    login.reset();
    verifyCode.reset();
    setChallengeToken('');
    setStep('contact');
  };

  const requestCodeAndAdvance = (contact: string) => {
    requestCode.mutate(
      { contact },
      {
        onSuccess: () => {
          setEmail(contact);
          // Reset any cooldown seeded by a 429 for a previous email, so resend
          // isn't wrongly blocked after switching accounts.
          setCooldown(60);
          setStep('otp');
        },
        onError: (error) => {
          // 429: the code was requested recently — still show the OTP screen,
          // just start the resend timer from Retry-After.
          const retry = retryAfterSeconds(error);
          if (retry !== null) {
            setEmail(contact);
            setCooldown(retry);
            setStep('otp');
          }
        },
      },
    );
  };

  if (step === 'otp') {
    return (
      <OtpStep
        email={email}
        invalidCode={verifyCode.isError}
        disabled={!isOnline || verifyCode.isPending}
        resendCooldownSeconds={cooldown}
        onComplete={(code) =>
          verifyCode.mutate(
            { contact: email, code },
            {
              onSuccess: (response) => {
                if (response.two_factor_required && response.challenge_token) {
                  setChallengeToken(response.challenge_token);
                  setStep('two-factor');
                }
                // Otherwise the hook already set the session (declarative redirect).
              },
            },
          )
        }
        onResend={() =>
          requestCode.mutateAsync(
            { contact: email },
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
        onSwitchToPassword={() => {
          passwordForm.setValue('email', email);
          goToContact();
          setMode('password');
        }}
        onChangeEmail={goToContact}
      />
    );
  }

  if (step === 'two-factor') {
    return (
      <TwoFactorStep
        form={twoFactorForm}
        email={email}
        error={login.isError ? 'Неверный email или пароль' : undefined}
        isOnline={isOnline}
        pending={login.isPending}
        onSubmit={(values) => {
          login.mutate(
            { contact: email, password: values.password, challenge_token: challengeToken },
            { onSuccess: () => void saveCredential(email, values.password) },
          );
        }}
        onChangeEmail={goToContact}
      />
    );
  }

  if (mode === 'password') {
    const apiError = login.isError ? toApiError(login.error) : null;
    const passwordError = apiError
      ? apiError.code === 'unauthorized'
        ? 'Неверный email или пароль'
        : apiError.message
      : undefined;
    return (
      <PasswordStep
        form={passwordForm}
        error={passwordError}
        isOnline={isOnline}
        pending={login.isPending}
        onSubmit={(values) => {
          login.mutate(
            { contact: values.email, password: values.password },
            { onSuccess: () => void saveCredential(values.email, values.password) },
          );
        }}
        onSwitchToCode={() => {
          login.reset();
          codeForm.setValue('email', passwordForm.getValues('email'));
          setMode('code');
        }}
        onForgotPassword={() => history.push(paths.passwordReset)}
      />
    );
  }

  const requestError =
    requestCode.isError && retryAfterSeconds(requestCode.error) === null
      ? toApiError(requestCode.error).message
      : undefined;

  return (
    <ContactStep
      form={codeForm}
      error={requestError}
      isOnline={isOnline}
      pending={requestCode.isPending}
      onSubmit={(values) => requestCodeAndAdvance(values.email)}
      onSwitchToPassword={() => {
        requestCode.reset();
        passwordForm.setValue('email', codeForm.getValues('email'));
        setMode('password');
      }}
    />
  );
}
