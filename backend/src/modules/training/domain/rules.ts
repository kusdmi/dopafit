import { AppError, type ErrorCode } from "../../../domain/error.js";
import type {
  AccessPeriod,
  Actor,
  ClientCard,
  ProgramDraft,
  SessionDraft,
} from "./models/index.js";

export const fail = (
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> | null = null,
): never => {
  throw new AppError(code, message, details);
};
export function requireTrainer(actor: Actor): void {
  if (actor.role !== "trainer") fail("forbidden", "Trainer role required");
}
export function requireCard(actor: Actor, card: ClientCard | null, active = false): ClientCard {
  if (!card || card.trainer_id !== actor.id || (active && card.status !== "active"))
    return fail("not_found", "Client not found");
  return card;
}
export function timestampInPeriods(value: string, periods: AccessPeriod[]): boolean {
  const instant = Date.parse(value);
  return periods.some(
    (p) =>
      Date.parse(p.start_date) <= instant &&
      (p.end_date === null || Date.parse(p.end_date) > instant),
  );
}
export function dateInPeriods(value: string, periods: AccessPeriod[]): boolean {
  return periods.some(
    (p) =>
      new Date(p.start_date).toISOString().slice(0, 10) <= value &&
      (p.end_date === null || new Date(p.end_date).toISOString().slice(0, 10) >= value),
  );
}
export function validateProgram(program: ProgramDraft): void {
  if (!program.days.some((day) => day.slots.length > 0))
    fail("validation_error", "Program must contain at least one exercise");
  const ids = new Set<string>();
  for (const day of program.days) {
    for (const node of [day, ...day.slots, ...day.slots.flatMap((s) => s.exercises)]) {
      if (node.id) {
        if (ids.has(node.id)) fail("validation_error", "Program node ids must be unique");
        ids.add(node.id);
      }
    }
    for (const slot of day.slots) {
      const orders = slot.exercises.map((e) => e.variant_order);
      if (orders.filter((o) => o === 0).length !== 1 || new Set(orders).size !== orders.length)
        fail("validation_error", "A slot must have exactly one primary and unique variants");
      for (const e of slot.exercises)
        if ((e.exercise_id === null) === (e.custom_name === null))
          fail("validation_error", "Exactly one of exercise_id or custom_name must be set");
    }
  }
}
export function validateLocalDate(input: SessionDraft): void {
  if (
    input.local_date &&
    Math.abs(
      Date.parse(input.local_date) -
        Date.parse(new Date(input.started_at).toISOString().slice(0, 10)),
    ) >
      2 * 86400000
  )
    fail("validation_error", "local_date is too far from started_at (max 2 days)");
}
export const round = (value: number, digits = 1): number => Number(value.toFixed(digits));
export const average = (values: number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;
export function changePercent(values: number[]): number | null {
  return values.length < 2 || values[0] === 0
    ? null
    : round(((values.at(-1)! - values[0]!) / Math.abs(values[0]!)) * 100);
}
export function parameterStats(points: { value: number }[]) {
  const v = points.map((p) => p.value);
  return {
    min: v.length ? round(Math.min(...v)) : 0,
    avg: v.length ? round(average(v)) : 0,
    max: v.length ? round(Math.max(...v)) : 0,
    change_percent: changePercent(v) ?? 0,
  };
}
