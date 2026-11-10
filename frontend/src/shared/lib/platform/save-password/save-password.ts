import { Capacitor } from '@capacitor/core';

/**
 * Offer to save the just-used credentials after a successful password action
 * (password login, registration password step, password reset/change).
 *
 * - iOS native: keychain prompt via @capgo/capacitor-autofill-save-password.
 *   Requires the Associated Domains capability (webcredentials) — configured
 *   in the dedicated native task; until then the prompt silently no-ops.
 * - Web and Android: no plugin needed — the browser password manager and the
 *   Android Autofill Framework react to the form's autocomplete attributes
 *   (username / current-password / new-password) on their own.
 *
 * Best-effort by design: never throws, never blocks the auth flow.
 */
export async function saveCredential(username: string, password: string): Promise<void> {
  // Gate directly on 'ios' rather than the sibling adapters' `env.isNative`:
  // this plugin is iOS-only, so Android must fall through to the no-op branch.
  if (Capacitor.getPlatform() !== 'ios') {
    return;
  }
  try {
    const { SavePassword } = await import('@capgo/capacitor-autofill-save-password');
    // No `url`: the plugin infers the credential domain from the app's
    // Associated Domains (webcredentials) entry, so passing one is unnecessary.
    await SavePassword.promptDialog({ username, password });
  } catch {
    // The prompt is a nice-to-have; failures (no associated domains, user
    // dismissed, simulator) must never surface to the auth flow.
  }
}
