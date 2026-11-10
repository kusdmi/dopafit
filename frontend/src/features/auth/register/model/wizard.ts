import type { AccountValues, PhysicalValues } from '../lib/schemas';

/** How long resend stays blocked after a fresh code is sent (seconds). */
export const DEFAULT_COOLDOWN_SECONDS = 60;

/**
 * Explicit registration wizard state. Each variant is a step and carries
 * exactly the data that step needs, so a step can never read flow data that
 * has not been produced yet (e.g. a registration token before /register ran).
 */
export type WizardState =
  /** `account` carries the previously typed values when the user steps back from
   *  the code step, so a mistyped email stays prefilled for correction. */
  | { step: 'account'; account?: AccountValues }
  | {
      step: 'code';
      account: AccountValues;
      email: string;
      registrationToken: string;
      cooldown: number;
    }
  | {
      step: 'password';
      account: AccountValues;
      email: string;
      registrationToken: string;
    }
  | { step: 'physical'; account: AccountValues; email: string }
  | { step: 'trainer'; account: AccountValues; email: string; physicalData: PhysicalValues };

export type WizardEvent =
  /** /register succeeded → move to the code step with the issued token. */
  | { type: 'registered'; account: AccountValues; email: string; registrationToken: string }
  /** "Изменить email": drop the transient token/cooldown, go back to account. */
  | { type: 'backToAccount' }
  /** Resend was rate-limited (429): raise the cooldown from Retry-After. */
  | { type: 'cooldownBumped'; seconds: number }
  /** Skip email confirmation: a password becomes mandatory. */
  | { type: 'skipToPassword' }
  /** Code confirmed or password set → onboarding. */
  | { type: 'continueToPhysical' }
  /** Trainer finished the physical step → clients-per-month. */
  | { type: 'continueToTrainer'; physicalData: PhysicalValues };

export const initialWizardState: WizardState = { step: 'account' };

export function wizardReducer(state: WizardState, event: WizardEvent): WizardState {
  switch (event.type) {
    case 'registered':
      return {
        step: 'code',
        account: event.account,
        email: event.email,
        registrationToken: event.registrationToken,
        cooldown: DEFAULT_COOLDOWN_SECONDS,
      };
    case 'backToAccount':
      // Preserve the typed account so the email stays prefilled for correction.
      return state.step === 'code' ? { step: 'account', account: state.account } : initialWizardState;
    case 'cooldownBumped':
      return state.step === 'code' ? { ...state, cooldown: event.seconds } : state;
    case 'skipToPassword':
      return state.step === 'code'
        ? {
            step: 'password',
            account: state.account,
            email: state.email,
            registrationToken: state.registrationToken,
          }
        : state;
    case 'continueToPhysical':
      return state.step === 'code' || state.step === 'password'
        ? { step: 'physical', account: state.account, email: state.email }
        : state;
    case 'continueToTrainer':
      return state.step === 'physical'
        ? {
            step: 'trainer',
            account: state.account,
            email: state.email,
            physicalData: event.physicalData,
          }
        : state;
    default:
      return state;
  }
}
