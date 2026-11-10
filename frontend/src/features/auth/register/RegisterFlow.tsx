import { useReducer } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';

import { useSessionStore } from '@/entities/session/model/store';
import { useCompleteOnboarding } from '@/entities/user/api/use-complete-onboarding';
import { toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { paths } from '@/shared/config/paths';

import { toOnboardingRequest } from './lib/schemas';
import { initialWizardState, wizardReducer } from './model/wizard';
import { AccountStep } from './steps/AccountStep';
import { CodeStep } from './steps/CodeStep';
import { PasswordStep } from './steps/PasswordStep';
import { PhysicalStep } from './steps/PhysicalStep';
import { TrainerStep } from './steps/TrainerStep';

type OnboardingRequest = components['schemas']['OnboardingRequest'];

/**
 * Registration wizard host. A discriminated-union reducer (`model/wizard`)
 * holds the current step and the flow data accumulated so far; every step is a
 * self-contained component owning its own form and mutation, and transitions
 * happen only through the events dispatched here. Onboarding is the single
 * exception kept at this level: both onboarding steps share one mutation so its
 * error surface persists across physical → trainer, and it drives the redirect.
 */
export function RegisterFlow() {
  const history = useNavigation();
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const completeOnboarding = useCompleteOnboarding();
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  // Код приглашения из ссылки `/invite/:code` (её раскладывает InviteRedirect
  // в router.tsx). Подставляем его в поле «Код приглашения» на первом шаге,
  // иначе человеку пришлось бы вводить руками код, по ссылке с которым он и
  // пришёл. Значения, уже введённые в форме, важнее: на возврате со шага кода
  // `state.account` несёт то, что человек напечатал сам.
  const inviteCode = useInviteCode();

  const onboardingError = completeOnboarding.isError
    ? toApiError(completeOnboarding.error).message
    : '';

  function finishOnboarding(values: OnboardingRequest) {
    completeOnboarding.mutate(values, {
      onSuccess: () => history.replace(paths.home),
    });
  }

  // Онбординг ПЕРЕСЕКАЕТ границу авторизации: на шаге пароля/кода setSession
  // делает isAuthenticated true, но флоу продолжается (physical/trainer) на
  // /register. Поэтому редиректим на главную ТОЛЬКО на шаге 'account' (юзер уже
  // авторизован и зашёл на /register заново) — не обрываем незавершённый онбординг.
  if (isAuthenticated && state.step === 'account') {
    return <Navigate replace to={paths.home} />;
  }

  switch (state.step) {
    case 'code':
      return (
        <CodeStep
          email={state.email}
          cooldown={state.cooldown}
          onVerified={() => dispatch({ type: 'continueToPhysical' })}
          onCooldownBumped={(seconds) => dispatch({ type: 'cooldownBumped', seconds })}
          onSkip={() => dispatch({ type: 'skipToPassword' })}
          onChangeEmail={() => dispatch({ type: 'backToAccount' })}
        />
      );
    case 'password':
      return (
        <PasswordStep
          email={state.email}
          registrationToken={state.registrationToken}
          onCompleted={() => dispatch({ type: 'continueToPhysical' })}
        />
      );
    case 'physical':
      return (
        <PhysicalStep
          isTrainer={state.account.role === 'trainer'}
          isPending={completeOnboarding.isPending}
          error={onboardingError}
          onContinueTrainer={(physicalData) =>
            dispatch({ type: 'continueToTrainer', physicalData })
          }
          onFinish={(values) => finishOnboarding(toOnboardingRequest(values))}
        />
      );
    case 'trainer':
      return (
        <TrainerStep
          isPending={completeOnboarding.isPending}
          error={onboardingError}
          onFinish={(values) =>
            finishOnboarding(
              toOnboardingRequest(state.physicalData, values.clients_per_month),
            )
          }
        />
      );
    default:
      return (
        <AccountStep
          initialValues={
            state.account ??
            (inviteCode
              ? { full_name: '', email: '', invite_code: inviteCode, role: 'client' }
              : undefined)
          }
          onRegistered={(payload) => dispatch({ type: 'registered', ...payload })}
        />
      );
  }
}

/** Код приглашения, положенный в state истории маршрутом `/invite/:code`. */
function useInviteCode(): string {
  const { state } = useLocation();
  const code = (state as { inviteCode?: unknown } | null)?.inviteCode;
  return typeof code === 'string' ? code : '';
}
