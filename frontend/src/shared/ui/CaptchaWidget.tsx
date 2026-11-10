import { InvisibleSmartCaptcha } from '@yandex/smart-captcha';
import { useCallback, useEffect, useRef } from 'react';
import { useThemePreference } from '@/shared/lib/theme/useTheme';

export default function CaptchaWidget({
  siteKey,
  onSuccess,
  onError,
  onCancel,
}: {
  siteKey: string;
  onSuccess: (token: string) => void;
  onError: () => void;
  onCancel: () => void;
}) {
  const theme = useThemePreference();
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancellationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finished = useRef(false);
  const clearLoading = useCallback(() => clearTimeout(loadingTimer.current), []);

  const reportError = useCallback(() => {
    finished.current = true;
    clearTimeout(loadingTimer.current);
    clearTimeout(cancellationTimer.current);
    onError();
  }, [onError]);

  useEffect(() => {
    loadingTimer.current = setTimeout(reportError, 30_000);
    return () => {
      clearTimeout(loadingTimer.current);
      clearTimeout(cancellationTimer.current);
    };
  }, [reportError]);

  return (
    <InvisibleSmartCaptcha
      sitekey={siteKey}
      visible
      language="ru"
      theme={theme === 'system' ? 'auto' : theme}
      onChallengeVisible={clearLoading}
      onChallengeHidden={() => {
        if (finished.current) return;
        clearLoading();
        clearTimeout(cancellationTimer.current);
        cancellationTimer.current = setTimeout(onCancel, 0);
      }}
      onSuccess={(token) => {
        if (finished.current) return;
        finished.current = true;
        clearLoading();
        clearTimeout(cancellationTimer.current);
        if (token) onSuccess(token);
        else reportError();
      }}
      onNetworkError={reportError}
      onJavascriptError={reportError}
      onTokenExpired={reportError}
    />
  );
}
