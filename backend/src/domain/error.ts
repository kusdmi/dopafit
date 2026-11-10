/**
 * The failures the API can report.
 *
 * A closed set, because the HTTP layer maps each one onto a status: a code with no mapping
 * would quietly answer 400 regardless of what it meant. `errorStatuses` in http/app.ts is
 * typed by this union, so adding a member here fails to compile until it has a status.
 *
 * These read as HTTP semantics inside the domain, which they are — the vocabulary was
 * inherited from the port. Untangling that is a larger change than naming the set.
 */
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "measurement_date_conflict"
  | "validation_error"
  | "rate_limited";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "AppError";
  }
}
