import { randomUUID } from 'node:crypto';

/**
 * Tags everything a run creates, so a leftover row can always be traced back to
 * the run that made it and never collides with a concurrent one. The `.test`
 * domain is reserved by RFC 2606 and can never resolve to a real mailbox.
 */
export function newRunId(): string {
  return `e2e-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;
}

/** Unique address for an account this run registers. */
export function runEmail(runId: string, role: string): string {
  return `${role}-${runId}@e2e.dopafit.test`;
}

let registered = 0;

/**
 * Role label for the next account the run registers, as `runEmail`'s `role`.
 *
 * `runId` is worker-scoped while the account fixtures are test-scoped, so the run
 * id alone does not make an address unique: the second test asking for a fresh
 * client would reuse the first one's address, and `POST /auth/register` answers
 * 409 `email_taken` for an address that is already verified. The counter is
 * per-worker and the suite runs one worker (playwright.config.ts: `workers: 1`),
 * so the sequence cannot repeat inside a run; across runs the `runId` keeps the
 * addresses apart.
 */
export function nextAccountLabel(role: string): string {
  registered += 1;
  return `${role}${registered}`;
}
