import { randomUUID } from 'node:crypto';

import type { Api, TokenPair } from './api.ts';
import type { Session } from './accounts.ts';

/**
 * Preconditions built over the REST API: a trainer-client link, a program, a
 * measurement, a finished workout.
 *
 * None of these is ever the thing under test — the screens that create them have
 * their own checks in sections D, F and G of docs/e2e-spec.md. What the tests of
 * sections E, F, G and H need is the data those screens would have produced, which
 * is why it is prepared with requests (docs/TESTING.md §4).
 *
 * Every result carries the ids of what was created, so a test can address a row
 * through `program()`/`exercise()` from support/paths.ts instead of guessing a URL
 * or hardcoding a uuid.
 */

/** The link as both sides can address it afterwards. */
export interface LinkedPair {
  /** `trainer_clients` row id — the `client_id` every trainer-side route takes. */
  cardId: string;
  /** The settled link request, for a test that asserts on the request list. */
  requestId: string;
  trainerUserId: string;
  clientUserId: string;
}

interface LinkRequest {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
}

interface ClientsList {
  items: { id: string; client_user_id: string | null; status: string }[];
}

/**
 * Links a trainer and a client, and returns the card the link produced.
 *
 * The client is the one who asks: `POST /api/v1/link-requests` takes the
 * counterpart's email or phone as `query` and is symmetric — either role may send
 * it, the application only refuses a request between two accounts of the same role
 * (ClientApplication.request). The client side is chosen because that is the
 * direction LINK-01/02 describe, and because the trainer then exercises
 * `.../accept`, which is the call that actually creates the card
 * (`ensureLinkedCard` runs only on accept).
 *
 * The card id is read back from `GET /api/v1/clients` rather than taken from the
 * accept response: `LinkRequestOut` carries the counterpart's user id, not the
 * card's, and the card id is what the trainer-side routes take as `client_id`.
 */
export async function linkClient(api: Api, trainer: Session, client: Session): Promise<LinkedPair> {
  const trainerEmail = trainer.user.email;
  if (!trainerEmail) throw new Error('linkClient needs a trainer account with an email');

  const request = await api.expectOk<LinkRequest>(
    'create link request',
    api.post('/api/v1/link-requests', client.tokens, { query: trainerEmail }),
    201,
  );
  const accepted = await api.expectOk<LinkRequest>(
    'accept link request',
    api.post(`/api/v1/link-requests/${request.id}/accept`, trainer.tokens),
    200,
  );
  if (accepted.status !== 'accepted') {
    throw new Error(`Link request ${request.id} ended as "${accepted.status}", not accepted`);
  }

  const clients = await api.expectOk<ClientsList>(
    'list clients',
    api.get('/api/v1/clients', trainer.tokens),
    200,
  );
  const card = clients.items.find((item) => item.client_user_id === client.user.id);
  if (!card) throw new Error(`Accepted link left no client card for ${client.user.id}`);

  return {
    cardId: card.id,
    requestId: request.id,
    trainerUserId: trainer.user.id,
    clientUserId: client.user.id,
  };
}

interface ExercisePage {
  items: { id: string; name: string }[];
  total: number;
}

/**
 * One exercise from the catalog, picked by what the catalog actually answers.
 *
 * Which exercise it is does not matter to any fixture here — what matters is that
 * the slot references a real catalog row, so the program carries an `exercise_id`
 * and the workout history can group by it. The id is therefore looked up and never
 * written down: docs/TESTING.md §7 forbids a hardcoded uuid, and the seed catalog
 * is free to change what it contains.
 */
async function catalogExercise(api: Api, tokens: TokenPair): Promise<{ id: string; name: string }> {
  const page = await api.expectOk<ExercisePage>(
    'list exercises',
    api.get('/api/v1/exercises?limit=1', tokens),
    200,
  );
  const exercise = page.items[0];
  if (!exercise) throw new Error('The exercise catalog is empty — was the stand reset seeded?');
  return exercise;
}

/** A program as the sync and the program screens address it. */
export interface ProgramFixture {
  programId: string;
  dayId: string;
  slotId: string;
  /** `program_slot_exercises` row — what a set and a history lookup refer to. */
  variantId: string;
  /** Catalog exercise behind the slot, for a test that opens its card. */
  exerciseId: string;
  exerciseName: string;
  name: string;
  sets: number;
  reps: number;
}

interface ProgramOut {
  id: string;
  name: string;
  days: {
    id: string;
    slots: { id: string; exercises: { id: string; exercise_id: string | null }[] }[];
  }[];
}

/**
 * Creates a personal program with one day and one catalog exercise.
 *
 * The shape is the smallest one a workout can be run against: `POST /api/v1/programs`
 * requires at least one day, a day's slot at least one exercise, and
 * `WorkoutApplication.sync` refuses a set whose `slot_id`/`variant_id` pair is not
 * in the day — so the returned ids are the ones a session has to be built from.
 *
 * The name carries the `runId` so a leftover row names the run that made it, and
 * so a list assertion can filter to this run's program rather than to "the only
 * program", which stops being true the moment a second test runs.
 */
export async function createProgram(
  api: Api,
  session: Session,
  runId: string,
  options: { name?: string; sets?: number; reps?: number } = {},
): Promise<ProgramFixture> {
  const exercise = await catalogExercise(api, session.tokens);
  const name = options.name ?? `Программа ${runId}`;
  const sets = options.sets ?? 3;
  const reps = options.reps ?? 10;

  const program = await api.expectOk<ProgramOut>(
    `create program ${name}`,
    api.post('/api/v1/programs', session.tokens, {
      name,
      days: [
        {
          name: 'День 1',
          position: 0,
          slots: [
            {
              position: 0,
              // variant_order 0 is the primary exercise; 1-3 would be the
              // alternatives WORK-02 switches between.
              exercises: [{ exercise_id: exercise.id, sets, reps, variant_order: 0 }],
            },
          ],
        },
      ],
    }),
    201,
  );

  const day = program.days[0];
  const slot = day?.slots[0];
  const variant = slot?.exercises[0];
  if (!day || !slot || !variant) {
    throw new Error(`Program ${program.id} came back without the day it was created with`);
  }

  return {
    programId: program.id,
    dayId: day.id,
    slotId: slot.id,
    variantId: variant.id,
    exerciseId: variant.exercise_id ?? exercise.id,
    exerciseName: exercise.name,
    name: program.name,
    sets,
    reps,
  };
}

/** A measurement as the measurement screens and the weight chart address it. */
export interface MeasurementFixture {
  measurementId: string;
  /** ISO date (YYYY-MM-DD) — the measurement's identity on the chart and in the list. */
  date: string;
  weight: number;
  waist: number;
}

interface MeasurementOut {
  id: string;
  date: string;
}

/**
 * Creates one anthropometry measurement.
 *
 * The date defaults to yesterday, not today: completing onboarding already writes
 * a measurement dated today (AuthProfile.completeOnboarding), and
 * `MeasurementApplication.create` answers `measurement_date_conflict` for a second
 * one on the same date — so a fixture dated today would fail against exactly the
 * accounts `registerClient` produces.
 *
 * The values are fixed so a test can assert the numbers it will read back; a
 * caller that needs a series passes its own date and weight.
 */
export async function createMeasurement(
  api: Api,
  session: Session,
  options: { date?: string; weight?: number; waist?: number } = {},
): Promise<MeasurementFixture> {
  const date = options.date ?? isoDate(-1);
  const weight = options.weight ?? 78.5;
  const waist = options.waist ?? 82;

  const measurement = await api.expectOk<MeasurementOut>(
    `create measurement ${date}`,
    api.post('/api/v1/measurements', session.tokens, { date, weight, waist }),
    201,
  );
  return { measurementId: measurement.id, date: measurement.date, weight, waist };
}

/** A finished session as the summary screen, the history and the analytics address it. */
export interface FinishedWorkout {
  sessionId: string;
  /** Per-user running number the summary screen shows as "#N". */
  seqNumber: number;
  program: ProgramFixture;
  /** Local calendar date the session is grouped under. */
  localDate: string;
  sets: { weight: number; reps: number }[];
}

interface SessionSummaryOut {
  session_id: string;
  seq_number: number;
}

/**
 * Finishes a workout against a program, as the app does after the last set.
 *
 * There is no "start a session" call: a session exists on the server only once it
 * is finished, because the app records it locally and posts the whole thing to
 * `POST /api/v1/workouts/sessions/sync` — the same route an offline session replays
 * through, which is why it is idempotent on the session id the caller generates.
 *
 * `client_id` stays absent on purpose: with it the session belongs to a trainer's
 * card, and what sections E and F need is the client's own workout. The timestamps
 * are real and ordered, since the summary derives duration and average rest from
 * them and a collapsed interval would make those zero.
 */
export async function finishWorkout(
  api: Api,
  session: Session,
  program: ProgramFixture,
  options: {
    sets?: { weight: number; reps: number }[];
    localDate?: string;
    clientId?: string;
  } = {},
): Promise<FinishedWorkout> {
  const sets = options.sets ?? [
    { weight: 50, reps: program.reps },
    { weight: 55, reps: program.reps },
  ];
  const localDate = options.localDate ?? isoDate(0);
  const sessionId = randomUUID();
  const startedAt = Date.now() - 30 * 60_000;

  const summary = await api.expectOk<SessionSummaryOut>(
    `sync session ${sessionId}`,
    api.post('/api/v1/workouts/sessions/sync', session.tokens, {
      id: sessionId,
      ...(options.clientId ? { client_id: options.clientId } : {}),
      program_id: program.programId,
      day_id: program.dayId,
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date(startedAt + 30 * 60_000).toISOString(),
      local_date: localDate,
      exercises: [
        { slot_id: program.slotId, chosen_variant_id: program.variantId, is_completed: true },
      ],
      sets: sets.map((set, index) => ({
        id: randomUUID(),
        slot_id: program.slotId,
        variant_id: program.variantId,
        weight: set.weight,
        reps: set.reps,
        // Spread across the session rather than stamped at one instant: the
        // summary's avg_rest_seconds is the mean gap between sets.
        performed_at: new Date(startedAt + (index + 1) * 5 * 60_000).toISOString(),
      })),
    }),
    201,
  );

  return { sessionId: summary.session_id, seqNumber: summary.seq_number, program, localDate, sets };
}

/**
 * Calendar date `offset` days from today, as the API spells one (YYYY-MM-DD).
 *
 * Built from the local date parts and not from `toISOString`, which would answer
 * the UTC day — a different date from the one the browser renders whenever the
 * runner's clock is not on UTC, which is what `local_date` is there to express.
 */
function isoDate(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
