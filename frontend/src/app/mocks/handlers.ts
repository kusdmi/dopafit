import { subscriptionHandlers, resetSubscriptionMocks } from '@/entities/subscription/api/mocks';
import { HttpResponse, http } from 'msw';

import { analyticsHandlers, resetAnalyticsStore } from '@/entities/analytics/api/mocks';
import { calendarHandlers, resetCalendarStore } from '@/entities/calendar/api/mocks';
import { clientHandlers, resetClientStore } from '@/entities/client/api/mocks';
import { exerciseHandlers, resetExerciseStore } from '@/entities/exercise/api/mocks';
import { linkRequestHandlers, resetLinkRequestStore } from '@/entities/link-request/api/mocks';
import { measurementHandlers, resetMeasurementStore } from '@/entities/measurement/api/mocks';
import { notificationHandlers, resetNotificationStore } from '@/entities/notification/api/mocks';
import { programHandlers, resetProgramStore } from '@/entities/program/api/mocks';
import { resetSessionMocks, sessionHandlers } from '@/entities/session/api/mocks';
import { resetUserMocks, userHandlers } from '@/entities/user/api/mocks';
import { resetWorkoutStore, workoutHandlers } from '@/entities/workout/api/mocks';
import { env } from '@/shared/config/env';

/** All MSW handlers. New entity mocks are registered here, stage by stage. */
export const handlers = [
  http.get(`${env.apiUrl}/api/v1/health`, () => HttpResponse.json({ status: 'ok' })),
  ...sessionHandlers,
  ...subscriptionHandlers,
  ...userHandlers,
  ...measurementHandlers,
  ...exerciseHandlers,
  ...programHandlers,
  ...workoutHandlers,
  ...clientHandlers,
  ...linkRequestHandlers,
  ...calendarHandlers,
  ...analyticsHandlers,
  ...notificationHandlers,
];

/**
 * Resets in-memory state held by entity mocks between tests. New entity mocks
 * register their reset here alongside their handlers above, so test setup never
 * has to reach into the entities layer directly.
 */
export function resetMockStores(): void {
  resetSessionMocks();
  resetSubscriptionMocks();
  resetUserMocks();
  resetMeasurementStore();
  resetExerciseStore();
  resetProgramStore();
  resetWorkoutStore();
  resetClientStore();
  resetLinkRequestStore();
  resetCalendarStore();
  resetAnalyticsStore();
  resetNotificationStore();
}
