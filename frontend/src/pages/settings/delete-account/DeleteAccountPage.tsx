import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { signOutAndExit } from '@/entities/session/model/teardown';
import {
  useDeleteAccountConfirm,
  useDeleteAccountRequest,
} from '@/entities/user/api/use-delete-account';
import { useMe } from '@/entities/user/api/use-me';
import { retryAfterSeconds, toApiError } from '@/shared/api/client';
import { ACCOUNT_DELETED_TOAST_FLAG } from '@/shared/config/session-flags';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Input } from '@/shared/ui/Input';
import { OtpDialog } from '@/shared/ui/OtpDialog';

import { SettingsShell } from '../ui/SettingsShell';

type Step = 'warning' | 'password' | 'otp';

/**
 * После удаления НЕ показываем отдельный экран прощания с меню — переходы уже
 * невалидны (аккаунта нет). Вместо этого сразу выполняем полный teardown сессии
 * и жёстко уходим на /welcome (signOutAndExit чистит in-memory + persisted кэш,
 * токены, SQLite-персист и т.д.), а WelcomePage показывает toast «Аккаунт
 * удалён» по флагу в sessionStorage — он переживает hard-navigation.
 */
export function DeleteAccountPage() {
  const queryClient = useQueryClient();

  return (
    <DeleteAccountFlow
      onDeleted={() => {
        // Остановить запросы «на лету»: сразу после этого уходим с экрана, а
        // токены уже отозваны — не даём refetch'у уйти в 401 до teardown.
        void queryClient.cancelQueries();
        // Полный teardown + hard-navigate на /welcome. Таб-бар/шапка не мелькают:
        // signOutAndExit сначала чистит сессию, затем window.location.assign
        // перезагружает документ прямо на гостевой экран. Флаг тоста ставим НЕ
        // здесь, а внутри signOutAndExit — непосредственно перед навигацией:
        // иначе SPA-редирект на /welcome сконсюмит флаг ДО перезагрузки и тост
        // потеряется.
        void signOutAndExit(queryClient, {
          toastFlag: ACCOUNT_DELETED_TOAST_FLAG,
          preservePending: false,
        });
      }}
    />
  );
}

function DeleteAccountFlow({ onDeleted }: { onDeleted: () => void }) {
  const { data: me } = useMe();
  const { isOnline } = useNetworkStatus();
  const deleteRequest = useDeleteAccountRequest();
  const deleteConfirm = useDeleteAccountConfirm();
  const [step, setStep] = useState<Step>('warning');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [cooldown, setCooldown] = useState(60);

  const start = () => {
    setDialogOpen(false);
    deleteConfirm.reset();
    deleteRequest.mutate(
      {},
      {
        onSuccess: (response) => {
          setStep(response.confirmation === 'password' ? 'password' : 'otp');
        },
        onError: (error) => {
          // 429 on the code branch: the code is already out — show the OTP
          // step with the Retry-After timer.
          const retry = retryAfterSeconds(error);
          if (retry !== null) {
            setCooldown(retry);
            setStep('otp');
          }
        },
      },
    );
  };

  if (step === 'password') {
    const passwordError = deleteConfirm.isError
      ? toApiError(deleteConfirm.error).code === 'unauthorized'
        ? 'Неверный пароль'
        : toApiError(deleteConfirm.error).message
      : '';
    return (
      <SettingsShell title="Удаление аккаунта">
        <form
          className="flex flex-col gap-[15px]"
          onSubmit={(event) => {
            event.preventDefault();
            // Guard the destructive submit at the handler, not just the button:
            // disabled-button behavior alone is too fragile for an irreversible
            // action.
            if (deleteConfirm.isPending) return;
            deleteConfirm.mutate({ password }, { onSuccess: onDeleted });
          }}
        >
          <p className="text-body-s text-muted">Подтвердите удаление паролем от аккаунта.</p>
          <Input
            label="Пароль"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {passwordError ? (
            <p role="alert" className="text-body-s text-danger">
              {passwordError}
            </p>
          ) : null}
          <Button
            type="submit"
            color="danger"
            disabled={!isOnline || deleteConfirm.isPending}
            loading={deleteConfirm.isPending}
          >
            {isOnline ? 'Подтвердить удаление' : 'Недоступно офлайн'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStep('warning')}>
            Отмена
          </Button>
        </form>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell title="Удаление аккаунта">
      <p className="-mt-2 text-body-s text-muted">
        Полное удаление ваших данных, без возможности восстановления
      </p>
      <div className="flex flex-col gap-[10px] rounded-[14px] border border-danger p-[10px]">
        <p className="text-h3 text-danger">
          Ваш аккаунт с вашими данными будет удалён. Восстановление невозможно.
        </p>
      </div>
      <Button
        color="danger"
        disabled={!isOnline || deleteRequest.isPending}
        loading={deleteRequest.isPending}
        onClick={() => setDialogOpen(true)}
      >
        {isOnline ? 'Удалить аккаунт' : 'Недоступно офлайн'}
      </Button>
      {/* A 429 advances to the OTP step, so on the warning step isError means a
          non-429 failure (500 / offline / …). Surface it so the irreversible
          flow never fails silently. */}
      {step === 'warning' && deleteRequest.isError ? (
        <p role="alert" className="text-body-s text-danger">
          Не удалось начать удаление. Попробуйте ещё раз.
        </p>
      ) : null}
      <ConfirmDialog
        isOpen={dialogOpen}
        title="Удалить аккаунт навсегда?"
        message="Ваш аккаунт с вашими данными будет удалён без возможности восстановления."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onConfirm={start}
        onCancel={() => setDialogOpen(false)}
      />
      <OtpDialog
        isOpen={step === 'otp'}
        title="Подтвердите удаление аккаунта"
        contact={me?.user.email ?? null}
        error={deleteConfirm.isError ? 'Неверный или просроченный код' : undefined}
        pending={deleteConfirm.isPending}
        onComplete={(code) => deleteConfirm.mutate({ code }, { onSuccess: onDeleted })}
        onResend={() => deleteRequest.mutateAsync({})}
        resendCooldownSeconds={cooldown}
        onCancel={() => setStep('warning')}
      />
    </SettingsShell>
  );
}
