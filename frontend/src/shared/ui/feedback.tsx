import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from './primitives';

interface ToastOptions {
  message: string;
  role?: 'status' | 'alert';
  duration?: number;
  color?: string;
  position?: string;
  buttons?: { text: string; role?: string }[];
}
interface AlertOptions {
  header?: string;
  message?: string;
  buttons: (string | { text: string; role?: string; handler?: () => void })[];
}
let toast: ToastOptions | null = null;
let alert: AlertOptions | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const dismissToast = async () => {
  toast = null;
  emit();
};
const dismissAlert = async () => {
  alert = null;
  emit();
};
export function useToast() {
  const present = useCallback(async (options: ToastOptions | string) => {
    toast = typeof options === 'string' ? { message: options } : options;
    emit();
  }, []);
  return [present, dismissToast] as const;
}
export function useAlert() {
  const present = useCallback(async (options: AlertOptions) => {
    alert = options;
    emit();
  }, []);
  return [present, dismissAlert] as const;
}
/** Длительность выхода toast — ровно столько же держится .toast[data-leaving]
 *  в index.css. Значение здесь и в CSS менять вместе. */
const TOAST_LEAVE_MS = 160;

export function FeedbackHost() {
  const currentToast = useSyncExternalStore(subscribe, () => toast);
  const currentAlert = useSyncExternalStore(subscribe, () => alert);
  // Тост, снятый из стора, но ещё доигрывающий выход: без него анимации выхода
  // просто не на чем играть — элемент вылетает из DOM мгновенно.
  const [leavingToast, setLeavingToast] = useState<ToastOptions | null>(null);
  // Id of the leave-animation timer scheduled from the cleanup below. Kept in a
  // ref (not local to the closure) so a later run of the effect — or unmount —
  // can clear a still-pending timer instead of leaking it.
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!currentToast) return;
    const timer = setTimeout(() => {
      if (toast === currentToast) void dismissToast();
    }, currentToast.duration ?? 2500);
    return () => clearTimeout(timer);
  }, [currentToast]);
  useEffect(() => {
    if (!currentToast) return;
    // Уборка этого эффекта = момент, когда ИМЕННО этот тост сняли (или сменили
    // другим). Отсюда и берётся то, что доигрывает выход.
    return () => {
      if (leaveTimerRef.current !== null) clearTimeout(leaveTimerRef.current);
      setLeavingToast(currentToast);
      leaveTimerRef.current = setTimeout(() => {
        leaveTimerRef.current = null;
        // Сверка по объекту: если за эти 160ms успел прийти и уйти другой тост,
        // чужой выход не обрываем.
        setLeavingToast((previous) => (previous === currentToast ? null : previous));
      }, TOAST_LEAVE_MS);
    };
  }, [currentToast]);
  // Unmount-only cleanup: clears a still-pending leave-animation timer so it
  // never fires (or sets state) after the component is gone.
  useEffect(
    () => () => {
      if (leaveTimerRef.current !== null) clearTimeout(leaveTimerRef.current);
    },
    [],
  );
  // Живой тост всегда важнее доигрывающего: при быстрой смене двух тостов
  // подряд новый рисуется сразу, а не ждёт, пока уйдёт старый.
  const visibleToast = currentToast ?? leavingToast;
  return (
    <>
      {visibleToast &&
        createPortal(
          <div
            role={visibleToast.role ?? 'status'}
            className="toast"
            data-leaving={currentToast ? undefined : ''}
            key={visibleToast.message}
          >
            {visibleToast.message}
          </div>,
          document.body,
        )}
      <Dialog
        isOpen={!!currentAlert}
        onClose={dismissAlert}
        className="confirm-dialog dialog--floating"
      >
        <div className="space-y-4 p-5">
          <h2 className="text-h2">{currentAlert?.header}</h2>
          <p>{currentAlert?.message}</p>
          <div className="flex gap-3">
            {currentAlert?.buttons.map((button, i) => {
              const option = typeof button === 'string' ? { text: button } : button;
              return (
                <button
                  type="button"
                  className="action-button"
                  key={i}
                  onClick={() => {
                    void dismissAlert();
                    option.handler?.();
                  }}
                >
                  {option.text}
                </button>
              );
            })}
          </div>
        </div>
      </Dialog>
    </>
  );
}
