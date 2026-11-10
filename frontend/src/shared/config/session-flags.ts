/**
 * One-shot handoff flags stored in `sessionStorage`, used to carry intent
 * across a HARD navigation (`window.location.assign`) — a full document reload
 * wipes in-memory React/store state, so a plain prop/route-state cannot survive.
 * `sessionStorage` does, and is scoped to the tab, so the flag is naturally
 * cleared when the tab closes.
 */

/**
 * Set right before the delete-account teardown hard-navigates to /welcome
 * (see DeleteAccountPage). WelcomePage reads it once on mount to show the
 * "account deleted" toast, then removes it so a later manual visit to /welcome
 * does not re-trigger the toast.
 */
export const ACCOUNT_DELETED_TOAST_FLAG = 'dopafit.session.accountDeleted';
