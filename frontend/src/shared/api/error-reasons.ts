import { toApiError } from './client';
import { apiErrorReason, localizedReasonMessage } from './localized-error';

export function errorReason(error: unknown): string | null {
  return apiErrorReason(toApiError(error).details);
}

/** Context-specific fallback when the server has not provided a recognized reason. */
export function errorText(error: unknown, fallback: string): string {
  return localizedReasonMessage(toApiError(error).details) ?? fallback;
}
