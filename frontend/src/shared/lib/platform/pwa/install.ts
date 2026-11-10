import { useSyncExternalStore } from 'react';
import { env } from '@/shared/config/env';
import { isIos, isStandalone } from '@/shared/lib/platform/push/permission';
import { platformStorage } from '@/shared/lib/platform/storage/settings';

export const INSTALL_PREFERENCE_KEY = 'dopafit.pwa-install';
export const INSTALL_REMINDER_INTERVAL = 7 * 24 * 60 * 60 * 1000;
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface Preference {
  lastShownAt: number;
  installed: boolean;
}
let deferred: InstallPromptEvent | null = null;
let version = 0;
let displayQuery: MediaQueryList | null = null;
const listeners = new Set<() => void>();
const snapshot = () => version;
const emit = () => {
  version++;
  listeners.forEach((listener) => listener());
};

function preference(): Preference | null {
  try {
    const stored = platformStorage.get(INSTALL_PREFERENCE_KEY);
    if (!stored) return { lastShownAt: 0, installed: false };
    const value = JSON.parse(stored) as Partial<Preference>;
    return {
      lastShownAt:
        typeof value.lastShownAt === 'number' && Number.isFinite(value.lastShownAt)
          ? value.lastShownAt
          : 0,
      installed: value.installed === true,
    };
  } catch {
    return null;
  }
}
function remember(value: Preference): boolean {
  try {
    platformStorage.set(INSTALL_PREFERENCE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function mobileInstallPlatform(): 'ios' | 'android' | null {
  if (isIos()) return 'ios';
  return /Android/i.test(navigator.userAgent) ? 'android' : null;
}
export function installReminderDue(now = Date.now()): boolean {
  const value = preference();
  return (
    !env.isNative &&
    !isStandalone() &&
    mobileInstallPlatform() !== null &&
    value !== null &&
    !value.installed &&
    (value.lastShownAt === 0 || now - value.lastShownAt >= INSTALL_REMINDER_INTERVAL)
  );
}
export function recordInstallReminder(now = Date.now()): boolean {
  return remember({ lastShownAt: now, installed: preference()?.installed ?? false });
}
export function canPresentInstallReminder(): boolean {
  return (
    document.visibilityState !== 'hidden' &&
    !document.documentElement.hasAttribute('data-keyboard-open') &&
    !document.querySelector('[role="dialog"]') &&
    !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')
  );
}

async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  emit();
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return 'unavailable';
  }
}
function beforeInstall(event: Event) {
  if (env.isNative || isStandalone() || !('prompt' in event)) return;
  event.preventDefault();
  deferred = event as InstallPromptEvent;
  emit();
}
function installed() {
  deferred = null;
  remember({ lastShownAt: Date.now(), installed: true });
  emit();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    displayQuery = window.matchMedia?.('(display-mode: standalone)') ?? null;
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    window.addEventListener('storage', emit);
    displayQuery?.addEventListener?.('change', emit);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('storage', emit);
      displayQuery?.removeEventListener?.('change', emit);
      displayQuery = null;
    }
  };
}
export function usePwaInstall() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    platform: mobileInstallPlatform(),
    standalone: isStandalone(),
    native: env.isNative,
    installed: preference()?.installed === true,
    canPrompt: deferred !== null,
    promptInstall,
  };
}
