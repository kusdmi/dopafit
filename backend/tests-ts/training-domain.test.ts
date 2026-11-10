import { describe, expect, it } from "vitest";
import {
  dateInPeriods,
  timestampInPeriods,
  validateLocalDate,
  validateProgram,
} from "../src/modules/training/domain/rules.js";
import { sessionSummary } from "../src/modules/training/application/workouts.js";
import { toMedia } from "../src/modules/training/infrastructure/catalog.js";
import type {
  PerformedSet,
  ProgramDraft,
  Session,
  SessionDraft,
} from "../src/modules/training/domain/models/index.js";

describe("training domain boundaries", () => {
  it("keeps unlink-day measurements and morning workouts, excludes the exact break instant and the relink gap", () => {
    const periods = [
      { start_date: "2026-09-01T12:00:00Z", end_date: "2026-09-09T12:00:00Z" },
      { start_date: "2026-09-09T15:00:00Z", end_date: null },
    ];
    expect(timestampInPeriods("2026-09-09T09:00:00Z", periods)).toBe(true);
    expect(timestampInPeriods("2026-09-09T12:00:00Z", periods)).toBe(false);
    expect(timestampInPeriods("2026-09-09T14:59:59Z", periods)).toBe(false);
    expect(timestampInPeriods("2026-09-09T15:00:00Z", periods)).toBe(true);
    expect(dateInPeriods("2026-09-09", periods)).toBe(true);
    expect(dateInPeriods("2026-08-31", periods)).toBe(false);
  });
  it("rejects ambiguous exercise identity and duplicate primary variants", () => {
    const program: ProgramDraft = {
      name: "Test",
      kind: "custom",
      days: [
        {
          name: "Day",
          position: 0,
          slots: [
            {
              position: 0,
              exercises: [
                { custom_name: "Pushup", exercise_id: null, sets: 3, reps: 10, variant_order: 0 },
              ],
            },
          ],
        },
      ],
    };
    expect(() => validateProgram(program)).not.toThrow();
    program.days[0].slots[0].exercises.push({ ...program.days[0].slots[0].exercises[0] });
    expect(() => validateProgram(program)).toThrow("unique variants");
    program.days[0].slots[0].exercises.pop();
    program.days[0].slots[0].exercises[0].exercise_id = "catalog-id";
    expect(() => validateProgram(program)).toThrow("Exactly one");
  });
  it("normalizes local-date drift against UTC even with a non-Z offset", () => {
    const input = {
      started_at: "2026-09-09T00:30:00+05:00",
      local_date: "2026-09-09",
    } as SessionDraft;
    expect(() => validateLocalDate(input)).not.toThrow();
    expect(() => validateLocalDate({ ...input, local_date: "2026-09-11" })).toThrow("too far");
  });
  it("compares session metrics against the average of historical session metrics, not pooled sets", () => {
    const session = {
      id: "current",
      seq_number: 3,
      started_at: "2026-09-09T10:00:00Z",
      finished_at: "2026-09-09T10:10:00Z",
    } as Session;
    const set = (weight: number, session_id: string, time: string): PerformedSet => ({
      id: crypto.randomUUID(),
      session_id,
      slot_id: "slot",
      variant_id: "variant",
      weight,
      reps: 10,
      performed_at: time,
      local_date: "2026-09-09",
      exercise_id: "exercise",
      name: "Press",
    });
    const result = sessionSummary(
      session,
      [set(30, "current", "2026-09-09T10:01:00Z"), set(50, "current", "2026-09-09T10:03:00Z")],
      [
        set(10, "one", "2026-09-08T10:00:00Z"),
        set(20, "one", "2026-09-08T10:01:00Z"),
        set(40, "two", "2026-09-08T12:00:00Z"),
      ],
    );
    expect(result).toMatchObject({
      duration_seconds: 600,
      avg_rest_seconds: 120,
      exercises: [
        {
          name: "Press",
          max: { value: 50, delta: 20 },
          avg: { value: 40, delta: 12.5 },
          min: { value: 30, delta: 5 },
        },
      ],
    });
  });
  it("accepts only media rows carrying exactly one of object_key and url", () => {
    const row = { id: "m1", exercise_id: "e1", kind: "image" as const, position: 0 };
    expect(toMedia({ ...row, object_key: null, url: "https://example.test/a.png" })).toEqual({
      ...row,
      url: "https://example.test/a.png",
    });
    expect(toMedia({ ...row, object_key: "exercises/e1/a.png", url: null })).toEqual({
      ...row,
      object_key: "exercises/e1/a.png",
    });
    // The database check constraint makes both of these unreachable; the boundary still
    // refuses them rather than asserting an invariant it has not verified.
    expect(() => toMedia({ ...row, object_key: null, url: null })).toThrow(
      "violates the object_key/url invariant",
    );
    expect(() =>
      toMedia({ ...row, object_key: "exercises/e1/a.png", url: "https://example.test/a.png" }),
    ).toThrow("violates the object_key/url invariant");
  });
});
