import { useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/ui/Button';
import { retryAfterSeconds, toApiError } from '@/shared/api/client';

import './OtpInput.css';

interface OtpInputProps {
  /** Called exactly once when all cells are filled (auto-submit). */
  onComplete: (code: string) => void;
  /** External error: shows the message, shakes the cells and clears the value. */
  error?: string;
  disabled?: boolean;
  /** Resend handler; the button renders only when provided. */
  onResend?: () => unknown;
  /** Cooldown before resend is allowed, seconds. The parent bumps it from a
   *  429 Retry-After (retryAfterSeconds); every change restarts the countdown. */
  resendCooldownSeconds?: number;
  length?: number;
}

const DEFAULT_COOLDOWN_SECONDS = 60;

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * OTP field: 6 visual cells drawn OVER a single real input. One real input is
 * a hard requirement for iOS autocomplete="one-time-code", the Android/Web OTP
 * API and clipboard paste — they all target one focusable text field. The
 * input is transparent (NOT display:none, or autofill breaks) and stretched
 * over the cells, so taps land on it.
 */
export function OtpInput({
  onComplete,
  error,
  disabled = false,
  onResend,
  resendCooldownSeconds = DEFAULT_COOLDOWN_SECONDS,
  length = 6,
}: OtpInputProps) {
  const [value, setValue] = useState('');
  // Monotonic shake token: used as the cell-row `key`, so React remounts the row
  // on every error and the CSS animation replays even for an identical message
  // (a boolean class wouldn't re-trigger, and onAnimationEnd never fires under
  // prefers-reduced-motion). The value is opaque; only its changes matter.
  const [shakeNonce, setShakeNonce] = useState(0);
  const [focused, setFocused] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(resendCooldownSeconds);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Shake + clear on every transition into an error. The parent clears `error`
  // when it starts a new verify (TanStack mutate resets error before the next
  // request), so consecutive failures arrive as undefined → message → undefined
  // → message: each rising edge shakes, even when the message text repeats.
  const previousErrorRef = useRef<string | undefined>(undefined);

  // Фокус только при первичном маунте (deps []): input — сиблинг ряда ячеек и
  // переживает его ремаунт по key={shakeNonce}, поэтому этот эффект не воюет с
  // shake и не крадёт фокус при ре-рендерах/ошибках.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error && !previousErrorRef.current) {
      setValue('');
      setShakeNonce((nonce) => nonce + 1);
    }
    previousErrorRef.current = error;
  }, [error]);

  // The parent bumps the cooldown from a 429 Retry-After: restart the countdown.
  useEffect(() => {
    setSecondsLeft(resendCooldownSeconds);
  }, [resendCooldownSeconds]);

  // No resend UI → no reason to spin an interval and re-render every second.
  const ticking = Boolean(onResend) && secondsLeft > 0;
  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, length);
    const wasComplete = value.length === length;
    setValue(digits);
    if (digits.length === length && !wasComplete) {
      onComplete(digits);
    }
  };

  const cells = Array.from({ length }, (_, index) => value[index] ?? '');
  // The next empty cell is "active"; once the code is full, nothing is highlighted.
  const activeIndex = value.length < length ? value.length : -1;

  // The real <input> is invisible and overlaid on the cells, so tapping a middle
  // cell would place the caret mid-string and edits would land in the middle,
  // visually desyncing the cells (activeIndex assumes append-only). Force the
  // caret to the end on every focus/select so typing always appends.
  const caretToEnd = () => {
    const el = inputRef.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        {/* Remounted on every error (keyed by shakeNonce) so the shake replays;
            the input lives outside this layer to keep focus across the remount. */}
        <div
          key={shakeNonce}
          className={`flex justify-between gap-3 ${shakeNonce > 0 ? 'otp-shake' : ''}`}
        >
          {cells.map((char, index) => (
            <div
              key={index}
              aria-hidden="true"
              className={`text-h1 flex h-14 flex-1 items-center justify-center rounded-[14px] border-2 bg-transparent text-content ${
                focused && index === activeIndex ? 'border-brand-400' : 'border-neutral-600'
              }`}
            >
              {char}
            </div>
          ))}
        </div>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length}
          aria-label="Код подтверждения"
          // `text-h3` (16px) при полной прозрачности поля — не опечатка.
          // Зумом при фокусе iOS управляет РЕАЛЬНОЕ поле, а не нарисованные
          // ячейки: без своей роли поле наследовало 14px от body и экран
          // въезжал при первом же касании — на первом экране входа.
          className="text-h3 absolute inset-0 h-full w-full caret-transparent opacity-0"
          value={value}
          disabled={disabled || resending}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => {
            setFocused(true);
            caretToEnd();
          }}
          onSelect={caretToEnd}
          onBlur={() => setFocused(false)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-body-s text-danger text-center">
          {error}
        </p>
      ) : null}
      {onResend ? (
        <>
          {resendError && (
            <p role="alert" className="text-body-s text-danger text-center">
              {resendError}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || ticking || resending}
            onClick={() => {
              setResendError('');
              setResending(true);
              const complete = () => {
                setSecondsLeft(resendCooldownSeconds);
                setResending(false);
              };
              try {
                const result = onResend();
                if (result && typeof result === 'object' && 'then' in result) {
                  void Promise.resolve(result).then(complete, (error: unknown) => {
                    setResending(false);
                    setResendError(toApiError(error).message);
                    const retry = retryAfterSeconds(error);
                    if (retry !== null) setSecondsLeft(retry);
                  });
                } else complete();
              } catch (error) {
                setResending(false);
                setResendError(toApiError(error).message);
              }
            }}
          >
            {ticking ? `Отправить ещё раз (${formatCountdown(secondsLeft)})` : 'Отправить ещё раз'}
          </Button>
        </>
      ) : null}
    </div>
  );
}
