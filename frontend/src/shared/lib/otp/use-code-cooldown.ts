import { useState } from 'react';

import { retryAfterSeconds } from '@/shared/api/client';

/**
 * Общий cooldown для resend-таймера OTP: запрос кода при успехе сбрасывает
 * cooldown на 60с, при 429 берёт секунды из Retry-After. Формы pending-состояния
 * и confirm-логика у Security/Contacts разные и остаются на местах — здесь только
 * cooldown + обёртка исхода запроса.
 */
export function useCodeCooldown(defaultSeconds = 60) {
  const [cooldown, setCooldown] = useState(defaultSeconds);
  /** Оберни onSuccess/onError мутации запроса кода. onOk — что открыть при успехе;
   *  onThrottled — что открыть, если код уже был выслан (429). */
  const handlers = (onOk: () => void, onThrottled: () => void) => ({
    onSuccess: () => {
      // Сбрасываем любой cooldown, заниженный 429-ответом на прошлую попытку.
      setCooldown(defaultSeconds);
      onOk();
    },
    onError: (error: unknown) => {
      const retry = retryAfterSeconds(error);
      if (retry !== null) {
        setCooldown(retry);
        onThrottled();
      }
    },
  });
  return { cooldown, setCooldown, handlers };
}
