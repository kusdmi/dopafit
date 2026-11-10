import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  cancelCaptcha,
  completeCaptcha,
  getCaptchaChallenge,
  subscribeCaptcha,
} from '@/shared/lib/captcha/challenge';
import { Dialog } from './primitives';
import { Button } from './Button';
import CaptchaWidget from './CaptchaWidget';
import { retryCaptchaScript } from '@/shared/lib/captcha/script';

export function CaptchaHost() {
  const challenge = useSyncExternalStore(subscribeCaptcha, getCaptchaChallenge);
  useEffect(() => () => cancelCaptcha(), []);
  return challenge ? (
    <CaptchaAttempt key={challenge.id} id={challenge.id} siteKey={challenge.siteKey} />
  ) : null;
}

function CaptchaAttempt({ id, siteKey }: { id: number; siteKey: string }) {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const reportError = useCallback(
    () => setError('Не удалось загрузить проверку. Проверьте подключение и попробуйте ещё раз'),
    [],
  );
  const retryCleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => retryCleanup.current?.(), []);

  return (
    <>
      {!error && (
        <CaptchaWidget
          key={attempt}
          siteKey={siteKey}
          onSuccess={(token) => completeCaptcha(id, token)}
          onError={reportError}
          onCancel={() => cancelCaptcha(id)}
        />
      )}
      {error && (
        <Dialog
          isOpen
          onClose={() => cancelCaptcha(id)}
          aria-labelledby="captcha-title"
          className="gap-4 p-5 shadow-overlay"
          style={{
            width: 'calc(100% - 32px)',
            maxWidth: 400,
            height: 'auto',
            borderRadius: 20,
          }}
        >
          <h2 id="captcha-title" className="text-h2 text-content">
            Проверка безопасности
          </h2>
          <p role="alert" className="text-body-s text-danger">
            {error}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              retryCleanup.current?.();
              retryCleanup.current = retryCaptchaScript(reportError);
              setError('');
              setAttempt((value) => value + 1);
            }}
          >
            Повторить проверку
          </Button>
          <Button variant="ghost" onClick={() => cancelCaptcha(id)}>
            Отмена
          </Button>
        </Dialog>
      )}
    </>
  );
}
