import { useState } from 'react';

import { useChangePassword } from '@/entities/user/api/use-account-actions';
import { useLoginMethodRequestCode, useSetLoginMethod } from '@/entities/user/api/use-login-method';
import { useMe } from '@/entities/user/api/use-me';
import { retryAfterSeconds } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { useCodeCooldown } from '@/shared/lib/otp/use-code-cooldown';
import { saveCredential } from '@/shared/lib/platform/save-password/save-password';
import { OtpDialog } from '@/shared/ui/OtpDialog';
import { Skeleton } from '@/shared/ui/Skeleton';

import { SettingsShell } from '../ui/SettingsShell';
import { LoginMethodSection } from './ui/LoginMethodSection';
import { PasswordSection } from './ui/PasswordSection';

type LoginMethod = components['schemas']['LoginMethod'];

export function SecuritySettingsPage({ embedded = false }: { embedded?: boolean }) {
  const { data: me } = useMe();
  const { isOnline } = useNetworkStatus();
  const requestMethodCode = useLoginMethodRequestCode();
  const setLoginMethod = useSetLoginMethod();
  const changePassword = useChangePassword();
  const [pendingMethod, setPendingMethod] = useState<LoginMethod | null>(null);
  const [methodSaved, setMethodSaved] = useState('');
  const { cooldown, handlers } = useCodeCooldown();
  const [passwordSaved, setPasswordSaved] = useState('');

  const user = me?.user;

  const sendError =
    requestMethodCode.isError && retryAfterSeconds(requestMethodCode.error) === null
      ? requestMethodCode.error
      : null;

  const startMethodChange = (method: LoginMethod) => {
    setMethodSaved('');
    setLoginMethod.reset();
    requestMethodCode.mutate(
      {},
      handlers(
        () => setPendingMethod(method),
        () => setPendingMethod(method),
      ),
    );
  };

  const confirmMethodChange = (code: string) => {
    if (!pendingMethod) {
      return;
    }
    setLoginMethod.mutate(
      { method: pendingMethod, code },
      {
        onSuccess: () => {
          setPendingMethod(null);
          setMethodSaved('Способ входа обновлён');
        },
      },
    );
  };

  return (
    <SettingsShell title="Безопасность" embedded={embedded}>
      {!user ? (
        <Skeleton variant="form" count={2} />
      ) : (
        <>
          {/* Узла безопасности в макетах нет — экран собран по паттерну
              остальных экранов настроек: контурная карточка, радиус 14px,
              padding 10px, прозрачный фон поверх градиента. */}
          <LoginMethodSection
            user={user}
            isOnline={isOnline}
            pending={requestMethodCode.isPending}
            error={sendError}
            savedMessage={methodSaved}
            onSelect={startMethodChange}
          />

          <PasswordSection
            user={user}
            isOnline={isOnline}
            pending={changePassword.isPending}
            error={changePassword.error}
            savedMessage={passwordSaved}
            onSubmit={(values, resetForm) => {
              setPasswordSaved('');
              changePassword.mutate(
                user.has_password
                  ? {
                      current_password: values.current_password,
                      new_password: values.new_password,
                    }
                  : { new_password: values.new_password },
                {
                  onSuccess: () => {
                    setPasswordSaved('Пароль сохранён');
                    if (user.email) {
                      void saveCredential(user.email, values.new_password);
                    }
                    resetForm();
                  },
                },
              );
            }}
          />

          <OtpDialog
            isOpen={pendingMethod !== null}
            title="Подтвердите смену способа входа"
            contact={user.email}
            error={setLoginMethod.isError ? 'Неверный или просроченный код' : undefined}
            pending={setLoginMethod.isPending}
            onComplete={confirmMethodChange}
            onResend={() => {
              if (pendingMethod) {
                return requestMethodCode.mutateAsync({});
              }
            }}
            resendCooldownSeconds={cooldown}
            onCancel={() => setPendingMethod(null)}
          />
        </>
      )}
    </SettingsShell>
  );
}
