import { test as base, expect } from '@playwright/test';

import { Api } from './api.ts';
import {
  DEMO_CLIENT_EMAIL,
  DEMO_TRAINER_EMAIL,
  passwordSession,
  registerClient,
  registerTrainer,
  type Session,
} from './accounts.ts';
import {
  createMeasurement,
  createProgram,
  finishWorkout,
  linkClient,
  type FinishedWorkout,
  type LinkedPair,
  type MeasurementFixture,
  type ProgramFixture,
} from './data.ts';
import { newRunId } from './run-id.ts';

/**
 * The single entry point for every spec: specs import `test` and `expect` from
 * here, never from `@playwright/test` directly, so a new fixture reaches the whole
 * suite from one place.
 */
interface Fixtures {
  /** Prepared data over the REST API; the UI is driven only where it is tested. */
  api: Api;
  /** Demo client session, ready for `seedSession`. */
  clientSession: Session;
  /** Demo trainer session, ready for `seedSession`. */
  trainerSession: Session;
  /** A client registered for this test alone, onboarding completed. */
  freshClient: Session;
  /** A trainer registered for this test alone, onboarding completed. */
  freshTrainer: Session;
  /** Two fresh accounts already linked, plus the client card the link created. */
  linkedPair: { trainer: Session; client: Session; link: LinkedPair };
  /** A one-day program on `freshClient`, with the ids a workout is built from. */
  programFixture: ProgramFixture;
  /** One measurement on `freshClient`, dated yesterday. */
  measurementFixture: MeasurementFixture;
  /** A finished session on `freshClient` against `programFixture`. */
  finishedWorkout: FinishedWorkout;
}

interface WorkerFixtures {
  /** Tags everything the run creates. Worker-scoped: one id per run, not per test. */
  runId: string;
}

/**
 * Everything that creates data is test-scoped, never worker-scoped.
 *
 * A worker-scoped account would be shared by every test in the run: the first test
 * to link, archive or unlink it would decide what the next one sees, and a failure
 * would move with the order the tests happen to run in. The cost is a handful of
 * requests per test, which is nothing beside a browser step.
 */
export const test = base.extend<Fixtures, WorkerFixtures>({
  runId: [
    async ({}, use) => {
      await use(newRunId());
    },
    { scope: 'worker' },
  ],

  api: async ({}, use) => {
    const api = await Api.create();
    await use(api);
    await api.dispose();
  },

  clientSession: async ({}, use) => {
    await use(await passwordSession(DEMO_CLIENT_EMAIL));
  },

  trainerSession: async ({}, use) => {
    await use(await passwordSession(DEMO_TRAINER_EMAIL));
  },

  freshClient: async ({ runId }, use) => {
    await use(await registerClient(runId));
  },

  freshTrainer: async ({ runId }, use) => {
    await use(await registerTrainer(runId));
  },

  // Two accounts of its own rather than `freshClient`/`freshTrainer`: a test that
  // takes the pair AND one of those would otherwise get a client that is already
  // linked, and the tests of section H need an unlinked one to exist.
  linkedPair: async ({ api, runId }, use) => {
    const trainer = await registerTrainer(runId);
    const client = await registerClient(runId);
    await use({ trainer, client, link: await linkClient(api, trainer, client) });
  },

  programFixture: async ({ api, freshClient, runId }, use) => {
    await use(await createProgram(api, freshClient, runId));
  },

  measurementFixture: async ({ api, freshClient }, use) => {
    await use(await createMeasurement(api, freshClient));
  },

  finishedWorkout: async ({ api, freshClient, programFixture }, use) => {
    await use(await finishWorkout(api, freshClient, programFixture));
  },
});

export { expect };
