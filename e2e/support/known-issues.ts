import type { TestType } from '@playwright/test';

/**
 * The single source of truth for defects found by this suite.
 *
 * There is no markdown companion to this file on purpose: a document has to be
 * kept in sync by hand and rots the moment a fix lands, while a record here is
 * wired to a test that runs every time. `make e2e-issues` prints the summary,
 * so the status is generated rather than written.
 *
 * Lifecycle: found -> a record here plus `knownIssue(test, id)` in the test that
 * reproduces it (commit `test:`); fixed -> the record and the call are deleted and
 * the test becomes a plain green regression (commit `fix:`).
 *
 * `title` and `cause` are Russian because they describe product behaviour the
 * way the spec and the team do; everything structural stays English.
 */

/** A security finding leaks or exposes someone else's data; everything else is functional. */
type IssueKind = 'security' | 'functional';
type IssuePriority = 'P1' | 'P2' | 'P3';

interface KnownIssue {
  /** Short Russian statement of the wrong behaviour, not of the expected one. */
  readonly title: string;
  readonly kind: IssueKind;
  readonly priority: IssuePriority;
  /** Suspected cause, when the code has already been read. Omitted when unknown. */
  readonly cause?: string;
  /** Check IDs from docs/e2e-spec.md that reproduce it. */
  readonly tests: readonly string[];
}

export const KNOWN_ISSUES: Record<string, KnownIssue> = {};

export type KnownIssueId = keyof typeof KNOWN_ISSUES;

/**
 * Marks the current test as reproducing a known defect.
 *
 * `test.fail()` and not `test.skip()`: a skipped test stops being executed, so it
 * silently stops matching the UI it was written against and is broken by the time
 * someone fixes the defect. A failing-by-expectation test runs every time, and the
 * moment the product is fixed Playwright reports "unexpectedly passed" — the signal
 * to delete the record here and the call there.
 *
 * The test itself is always written against the CORRECT behaviour.
 */
export function knownIssue(
  // The concrete TestType generics are irrelevant here and spelling them out would
  // tie this helper to one fixture shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  test: TestType<any, any>,
  id: KnownIssueId,
): void {
  const issue = KNOWN_ISSUES[id];
  test.info().annotations.push({ type: 'known-issue', description: `${id}: ${issue.title}` });
  test.fail(true, `${id} (${issue.kind}, ${issue.priority}): ${issue.title}`);
}
