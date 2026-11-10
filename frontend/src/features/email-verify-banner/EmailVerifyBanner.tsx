import { App } from '@capacitor/app';
import { Dialog, useToast } from '@/shared/ui/primitives';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';

import { useSessionStore } from '@/entities/session/model/store';
import { useContactVerifyConfirm, useContactVerifyRequest } from '@/entities/user/api/use-contacts';
import { useMe } from '@/entities/user/api/use-me';
import { retryAfterSeconds } from '@/shared/api/client';
import { paths } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { kvPrefs } from '@/shared/lib/platform/storage/kv-prefs';
import { localDateKey } from '@/shared/lib/time/localDateKey';
import { Button } from '@/shared/ui/Button';
import { OtpInput } from '@/shared/ui/OtpInput';

/** kv-prefs key: local calendar date (YYYY-MM-DD) of the last banner show. */
export const LAST_SHOWN_KEY = 'dopafit.emailBanner.lastShownOn';
const WARNING_THRESHOLD_DAYS = 7;

// Math.ceil intentionally rounds partial days UP so the user is never shown
// fewer days than reality; Math.max(0, …) clamps a past deadline to 0.
function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/**
 * Daily "confirm your email" bottom-sheet. Lives OUTSIDE the router outlet
 * (sibling of IonRouterOutlet, like ActiveWorkoutWidget) but inside
 * IonReactRouter, so useNavigation/useLocation work. Shown at most once per
 * calendar day while the email stays unconfirmed; the shown date is stored
 * via kvPrefs (Preferences on native, idb on web). The daily check runs on
 * mount AND on every return to the app (appStateChange/visibilitychange):
 * on native the WebView can sleep in the background for days.
 *
 * Route gate: only inside the authorized tab zone (/app/*), never on
 * /welcome, /login or /register. The register skip branch (set-password)
 * signs the user in MID-onboarding on /register with email_verified=false,
 * and the banner must not open on top of the onboarding steps.
 */
export function EmailVerifyBanner() {
  const { pathname } = useLocation();
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const inTabZone = pathname === paths.app || pathname.startsWith(`${paths.app}/`);
  if (!isAuthenticated || !inTabZone) {
    return null;
  }
  return <AuthedEmailVerifyBanner />;
}

function AuthedEmailVerifyBanner() {
  const history = useNavigation();
  const [present] = useToast();
  const { isOnline } = useNetworkStatus();
  const { data: me } = useMe();
  const verifyRequest = useContactVerifyRequest();
  const verifyConfirm = useContactVerifyConfirm();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'notice' | 'otp'>('notice');
  const [cooldown, setCooldown] = useState(60);

  const user = me?.user;
  const shouldOffer = user != null && !user.email_verified;

  useEffect(() => {
    if (!shouldOffer) {
      return;
    }
    let cancelled = false;
    const recheck = () => {
      void kvPrefs.getItem(LAST_SHOWN_KEY).then((lastShown) => {
        if (cancelled || lastShown === localDateKey()) {
          return;
        }
        // Mark the calendar day at show time: at most one banner per day.
        void kvPrefs.setItem(LAST_SHOWN_KEY, localDateKey());
        setOpen(true);
      });
    };
    recheck();
    // Mount alone is not enough: on native the app can live in the
    // background for days, so a new calendar day must re-run the check on
    // return. appStateChange covers the native resume, visibilitychange
    // covers web tabs; recheck() is idempotent (kv gate), double firing on
    // web is harmless.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recheck();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const appListener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        recheck();
      }
    });
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void appListener.then((listener) => listener.remove());
    };
  }, [shouldOffer]);

  if (!user) {
    return null;
  }

  const days = user.verification_deadline_at ? daysUntil(user.verification_deadline_at) : null;
  const urgent = days !== null && days < WARNING_THRESHOLD_DAYS;
  const hasEmail = user.email != null;

  const requestAndShowOtp = () => {
    verifyConfirm.reset();
    verifyRequest.mutate(
      { type: 'email' },
      {
        onSuccess: () => setMode('otp'),
        onError: (error) => {
          const retry = retryAfterSeconds(error);
          if (retry !== null) {
            setCooldown(retry);
            setMode('otp');
            return;
          }
          // Surface non-429 failures: otherwise only the spinner stops and the
          // user is left staring at an unchanged banner.
          void present({ message: 'Не удалось отправить код. Попробуйте позже.', duration: 2500 });
        },
      },
    );
  };

  const dismiss = () => {
    setOpen(false);
    setMode('notice');
    setCooldown(60); // undo any 429-lowered cooldown so it never leaks into a later same-session reopen
  };

  return (
    <Dialog
      isOpen={open}
      style={{ height: 'auto', maxHeight: '85dvh' }}
      onClose={dismiss}
      // Floating card, so it takes the safe-area inset itself: the backdrop no
      // longer applies one (that would shrink the box the full-screen Modal
      // sizes against and stop it reaching the screen edges).
      className="dialog--floating"
      aria-labelledby="email-verify-banner-title"
    >
      {/* Symmetric `p-6`: the home-indicator inset is applied once, by
          `.dialog--floating` above. Adding it to the bottom padding here
          counted it twice. */}
      <div className="flex flex-col gap-4 p-6">
        {mode === 'otp' && hasEmail ? (
          <>
            <h2 id="email-verify-banner-title" className="text-h2 text-content">
              Подтвердите email
            </h2>
            <p className="text-body-m text-muted">Код отправлен на {user.email}</p>
            <OtpInput
              onComplete={(code) =>
                verifyConfirm.mutate(
                  { type: 'email', code },
                  {
                    onSuccess: () => {
                      void present({ message: 'Email подтверждён', duration: 2000 });
                      dismiss();
                    },
                  },
                )
              }
              error={verifyConfirm.isError ? 'Неверный или просроченный код' : undefined}
              disabled={!isOnline || verifyConfirm.isPending}
              onResend={() => verifyRequest.mutateAsync({ type: 'email' })}
              resendCooldownSeconds={cooldown}
            />
          </>
        ) : (
          <>
            <h2
              id="email-verify-banner-title"
              className={`text-h2 ${urgent ? 'text-danger' : 'text-content'}`}
            >
              {hasEmail ? 'Подтвердите email' : 'Добавьте email'}
            </h2>
            <p className="text-body-m text-muted" aria-live="polite">
              {hasEmail
                ? 'Подтвердите ваш email, чтобы сохранить доступ к аккаунту.'
                : 'Укажите email в настройках контактов, чтобы сохранить доступ к аккаунту.'}
              {days !== null ? ` Аккаунт будет удалён через ${days} дн.` : ''}
            </p>
            {hasEmail ? (
              <Button
                onClick={requestAndShowOtp}
                disabled={!isOnline || verifyRequest.isPending}
                loading={verifyRequest.isPending}
              >
                {isOnline ? 'Подтвердить сейчас' : 'Недоступно офлайн'}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  dismiss();
                  history.push(paths.settingsContacts);
                }}
              >
                Указать email
              </Button>
            )}
            <Button variant="ghost" onClick={dismiss}>
              Позже
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
