import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type SessionSyncRequest = components['schemas']['SessionSyncRequest'];
type SessionSummaryOut = components['schemas']['SessionSummaryOut'];

const base = `${env.apiUrl}/api/v1/workouts`;
const sessions = new Map<string, SessionSummaryOut>();
let seq = 0;

function buildSummary(body: SessionSyncRequest): SessionSummaryOut {
  seq += 1;
  const byVariant = new Map<string, number[]>();
  for (const s of body.sets) {
    const list = byVariant.get(s.variant_id) ?? [];
    list.push(s.weight);
    byVariant.set(s.variant_id, list);
  }
  const exercises = [...byVariant.values()].map((weights, i) => ({
    name: `Упражнение ${i + 1}`,
    max: { value: Math.max(...weights), delta: null },
    avg: { value: weights.reduce((a, b) => a + b, 0) / weights.length, delta: null },
    min: { value: Math.min(...weights), delta: null },
  }));
  return {
    session_id: body.id,
    seq_number: seq,
    finished_at: body.finished_at,
    duration_seconds: Math.round(
      (new Date(body.finished_at).getTime() - new Date(body.started_at).getTime()) / 1000,
    ),
    avg_rest_seconds: null,
    exercises,
  };
}

export const workoutHandlers = [
  http.post(`${base}/sessions/sync`, async ({ request }) => {
    const body = (await request.json()) as SessionSyncRequest;
    if (sessions.has(body.id)) {
      return HttpResponse.json(sessions.get(body.id), { status: 200 });
    }
    const summary = buildSummary(body);
    sessions.set(body.id, summary);
    return HttpResponse.json(summary, { status: 201 });
  }),

  http.get(`${base}/sessions/:sessionId/summary`, ({ params }) => {
    const summary = sessions.get(String(params.sessionId));
    return summary
      ? HttpResponse.json(summary)
      : HttpResponse.json({ code: 'not_found', message: 'Session not found' }, { status: 404 });
  }),

  http.get(`${base}/history/by-variant/:variantId`, () =>
    HttpResponse.json({ exercise_id: null, name: 'Упражнение', days: [] }),
  ),
];

// Clears the in-memory mock state between tests.
export function resetWorkoutStore(): void {
  sessions.clear();
  seq = 0;
}
