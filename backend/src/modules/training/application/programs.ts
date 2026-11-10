import type * as M from "../domain/models/index.js";
import type { Repositories, TrainingUnitOfWork } from "../domain/ports.js";
import { fail, requireCard, requireTrainer, validateProgram } from "../domain/rules.js";

export function programView(p: M.Program) {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    is_standard: p.owner_id === null,
    is_received: !!p.assigned_by && p.assigned_by !== p.owner_id,
    source_author_name: p.source_author_name,
    updated_at: p.updated_at,
    days: p.days
      .filter((d) => !d.deleted_at)
      .map((d) => ({
        id: d.id,
        name: d.name,
        position: d.position,
        slots: d.slots
          .filter((s) => !s.deleted_at)
          .map((s) => ({
            id: s.id,
            position: s.position,
            exercises: s.exercises
              .filter((v) => !v.deleted_at)
              .map((v) => ({
                id: v.id,
                exercise_id: v.exercise_id,
                name: v.name,
                sets: v.sets,
                reps: v.reps,
                variant_order: v.variant_order,
                has_contraindications: v.has_contraindications,
              })),
          })),
      })),
  };
}
function listItem(p: M.Program) {
  const view = programView(p);
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    is_standard: p.owner_id === null,
    is_received: !!p.assigned_by && p.assigned_by !== p.owner_id,
    day_count: view.days.length,
    exercise_count: view.days
      .flatMap((d) => d.slots.flatMap((s) => s.exercises))
      .filter((e) => e.variant_order === 0).length,
    updated_at: p.updated_at,
    for_client_id: p.for_trainer_client_id,
    for_client_name: p.for_client_name,
  };
}
async function owned(r: Repositories, actor: M.Actor, id: string) {
  const p = await r.programs.get(id);
  if (!p || p.deleted_at || p.owner_id !== actor.id) return fail("not_found", "Program not found");
  return p;
}
async function validateReferences(r: Repositories, actor: M.Actor, input: M.ProgramDraft) {
  const ids = [
    ...new Set(
      input.days.flatMap((day) =>
        day.slots.flatMap((slot) =>
          slot.exercises.flatMap((exercise) =>
            exercise.exercise_id ? [exercise.exercise_id] : [],
          ),
        ),
      ),
    ),
  ];
  if ((await r.catalog.accessibleExerciseIds(actor.id, ids)).length !== ids.length)
    fail("not_found", "Exercise not found");
}
export class ProgramApplication {
  constructor(
    private readonly uow: TrainingUnitOfWork,
    private readonly now: () => string,
    private readonly uuid: () => string,
  ) {}
  confirmSelection(
    actor: M.Actor,
    input: {
      cycle: string;
      program_ids: string[];
      client_ids: string[];
      copies: { source_id: string; program: M.ProgramDraft }[];
    },
  ) {
    return this.uow.run([`entitlements:${actor.id}`], async (r) => {
      if (!r.access) fail("forbidden", "Entitlements unavailable");
      const ids = [...input.program_ids];
      for (const copy of input.copies) {
        const source = await owned(r, actor, copy.source_id);
        validateProgram(copy.program);
        await validateReferences(r, actor, copy.program);
        const id = await r.programs.create(
          actor.id,
          { ...copy.program, id: this.uuid() },
          source.id,
          source.for_trainer_client_id ?? undefined,
          source.assigned_by ?? undefined,
          source.assigned_client_id ?? undefined,
        );
        ids.push(id);
      }
      await r.access!.confirm(actor.id, { ...input, program_ids: ids });
      return { ok: true };
    });
  }
  list(actor: M.Actor, standard: boolean | null) {
    return this.uow.run([], async (r) =>
      (await r.programs.list(actor.id, standard)).map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        is_standard: p.owner_id === null,
        is_received: !!p.assigned_by && p.assigned_by !== p.owner_id,
        day_count: p.day_count,
        exercise_count: p.exercise_count,
        updated_at: p.updated_at,
        for_client_id: p.for_trainer_client_id,
        for_client_name: p.for_client_name,
      })),
    );
  }
  get(actor: M.Actor, id: string) {
    return this.uow.run([], async (r) => {
      const p = await r.programs.get(id);
      if (!p || p.deleted_at || (p.owner_id !== null && p.owner_id !== actor.id))
        return fail("not_found", "Program not found");
      return programView(p);
    });
  }
  create(actor: M.Actor, input: M.ProgramDraft) {
    validateProgram(input);
    const id = input.id ?? this.uuid();
    return this.uow.run([`entitlements:${actor.id}`, `program:${id}`], async (r) => {
      const existing = await r.programs.get(id);
      if (existing) {
        if (existing.deleted_at) fail("conflict", "Program id already used");
        if (existing.owner_id !== actor.id) fail("forbidden", "Program belongs to another user");
        return { value: programView(existing), created: false };
      }
      await r.access?.program(actor.id, input, id, false);
      await validateReferences(r, actor, input);
      await r.programs.create(actor.id, { ...input, id });
      return { value: programView((await r.programs.get(id))!), created: true };
    });
  }
  update(actor: M.Actor, id: string, input: M.ProgramDraft, expectedUpdatedAt: string) {
    validateProgram(input);
    return this.uow.run([`entitlements:${actor.id}`, `program:${id}`], async (r) => {
      const current = await owned(r, actor, id);
      if (current.updated_at !== expectedUpdatedAt)
        fail("conflict", "Program was changed since it was loaded");
      if (current.assigned_by && current.assigned_by !== actor.id)
        fail("forbidden", "Create an own copy to edit a received program");
      await r.access?.program(actor.id, input, id, true, current.assigned_client_id);
      await validateReferences(r, actor, input);
      await r.programs.update(id, input, this.now());
      return programView((await r.programs.get(id))!);
    });
  }
  remove(actor: M.Actor, id: string) {
    return this.uow.run([`entitlements:${actor.id}`, `program:${id}`], async (r) => {
      await owned(r, actor, id);
      await r.programs.remove(id, this.now());
    });
  }
  append(
    actor: M.Actor,
    id: string,
    input: {
      day_id: string;
      exercise_id: string;
      sets: number;
      reps: number;
      slot_id: string | null;
      slot_exercise_id: string | null;
    },
  ) {
    return this.uow.run([`entitlements:${actor.id}`, `program:${id}`], async (r) => {
      const p = await owned(r, actor, id);
      const day = p.days.find((d) => d.id === input.day_id && !d.deleted_at);
      if (!day) return fail("not_found", "Day not found in program");
      const slots = day.slots.filter((s) => !s.deleted_at);
      if (input.slot_id && slots.some((s) => s.id === input.slot_id)) return programView(p);
      if (p.assigned_by && p.assigned_by !== actor.id)
        fail("forbidden", "Create an own copy to edit a received program");
      const draft = {
        days: p.days
          .filter((d) => !d.deleted_at)
          .map((d) => ({
            slots: d.slots
              .filter((s) => !s.deleted_at)
              .map((s) => ({ exercises: s.exercises.filter((v) => !v.deleted_at) as unknown[] }))
              .concat(d.id === day.id ? [{ exercises: [input] }] : []),
          })),
      };
      await r.access?.program(actor.id, draft, id, true, p.assigned_client_id);
      const exercise = await r.catalog.get(actor.id, input.exercise_id);
      if (!exercise) fail("not_found", "Exercise not found");
      await r.programs.append(
        day.id,
        slots.length,
        input.slot_id ?? this.uuid(),
        input.slot_exercise_id ?? this.uuid(),
        input.exercise_id,
        input.sets,
        input.reps,
      );
      return programView((await r.programs.get(id))!);
    });
  }
  share(actor: M.Actor, id: string, client: string) {
    requireTrainer(actor);
    return this.uow.run(
      [`entitlements:${actor.id}`, `program:${id}`, `card:${client}`],
      async (r) => {
        const source = await owned(r, actor, id);
        const card = requireCard(actor, await r.clients.get(client), true);
        const days = source.days
          .filter((d) => !d.deleted_at)
          .map((d) => ({
            name: d.name,
            position: d.position,
            slots: d.slots
              .filter((s) => !s.deleted_at)
              .map((s) => ({
                position: s.position,
                exercises: s.exercises
                  .filter((v) => !v.deleted_at)
                  .map((v) => ({
                    exercise_id: v.exercise_id,
                    custom_name: v.custom_name,
                    sets: v.sets,
                    reps: v.reps,
                    variant_order: v.variant_order,
                  })),
              })),
          }));
        await r.access?.client(actor.id, !!card.user_id, card.id);
        await r.access?.program(actor.id, { days }, source.id, true, source.assigned_client_id);
        const copyId = this.uuid();
        await r.access?.program(actor.id, { days }, copyId, false, card.id);
        const copy = await r.programs.create(
          card.user_id ?? actor.id,
          { id: copyId, name: source.name, kind: source.kind, days },
          id,
          card.user_id ? undefined : card.id,
          actor.id,
          card.id,
        );
        if (card.user_id)
          await r.programs.shareExercises(
            [
              ...new Set(
                days
                  .flatMap((d) => d.slots.flatMap((s) => s.exercises.map((v) => v.exercise_id)))
                  .filter((v): v is string => v !== null),
              ),
            ],
            actor.id,
            card.user_id,
          );
        return listItem((await r.programs.get(copy))!);
      },
    );
  }
}
