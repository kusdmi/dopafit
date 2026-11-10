import type * as M from "../domain/models/index.js";
import type { TrainingUnitOfWork } from "../domain/ports.js";
import { fail, requireCard } from "../domain/rules.js";

function view(event: M.Event) {
  return {
    id: event.id,
    program_id: event.program_id,
    program_name: event.program_name,
    date: event.date,
    time: event.time,
    type: event.type,
    owner_name: event.owner_name,
    status: event.status,
    workout_session_id: event.workout_session_id,
    clients: event.clients,
  };
}
export class CalendarApplication {
  constructor(
    private readonly uow: TrainingUnitOfWork,
    private readonly now: () => string,
  ) {}
  /**
   * A booking may not be made, moved, or re-dated into the past.
   *
   * Scheduling is a promise about what will happen; a day that has already
   * ended cannot receive one. Today itself stays open — a session later this
   * evening is still ahead — so the comparison is on the calendar DAY, not the
   * instant. ISO dates compare correctly as strings.
   *
   * Server-side because it is a rule, not a UI affordance: the screen hides the
   * past days it can, but the endpoint is what makes the rule true.
   */
  private rejectPastDate(date: string | null | undefined) {
    if (date && date < this.now().slice(0, 10))
      fail("validation_error", "Нельзя записаться на прошедший день");
  }
  month(actor: M.Actor, year: number, month: number) {
    return this.uow.run([], async (r) => {
      const events = await r.calendar.month(actor.id, year, month);
      const active = events.filter((event) => event.status !== "cancelled");
      return {
        year,
        month,
        events: events.map(view),
        stats: {
          personal: active.filter((e) => e.type === "personal").length,
          with_clients: active.filter((e) => e.type === "with_clients").length,
          planned: active.filter((e) => e.status === "planned").length,
          completed: active.filter((e) => e.status === "completed").length,
          unique_clients: new Set(active.flatMap((e) => e.clients.map((c) => c.client_id))).size,
        },
      };
    });
  }
  create(actor: M.Actor, input: M.EventDraft) {
    return this.uow.run(
      [
        ...input.client_ids.map((c) => `card:${c}`),
        ...(input.program_id ? [`program:${input.program_id}`] : []),
      ],
      async (r) => {
        this.rejectPastDate(input.date);
        if (input.client_ids.length && actor.role !== "trainer")
          fail("forbidden", "Only trainers can schedule client sessions");
        for (const client of new Set(input.client_ids))
          requireCard(actor, await r.clients.get(client), true);
        if (input.program_id) {
          const program = await r.programs.get(input.program_id);
          if (
            !program ||
            program.deleted_at ||
            (program.owner_id !== null && program.owner_id !== actor.id)
          )
            return fail("not_found", "Program not found");
        }
        const id = await r.calendar.create(actor.id, {
          ...input,
          client_ids: [...new Set(input.client_ids)],
        });
        return view((await r.calendar.get(id))!);
      },
    );
  }
  update(actor: M.Actor, id: string, input: M.EventChanges) {
    return this.uow.run(
      [
        `event:${id}`,
        ...(input.client_ids ?? []).map((c) => `card:${c}`),
        ...(input.program_id ? [`program:${input.program_id}`] : []),
      ],
      async (r) => {
        const event = await r.calendar.get(id);
        if (!event || event.owner_user_id !== actor.id) return fail("not_found", "Event not found");
        // Отмена прошедшей записи разрешена: это единственный способ убрать из
        // календаря план, который не выполнили. Запрещён только ПЕРЕНОС — и в
        // прошлое, и самой прошедшей записи.
        if (input.status !== "cancelled") {
          this.rejectPastDate(input.date);
          if (input.date !== undefined || input.time !== undefined) this.rejectPastDate(event.date);
        }
        if (input.client_ids?.length && actor.role !== "trainer")
          fail("forbidden", "Only trainers can schedule client sessions");
        for (const client of new Set(input.client_ids ?? []))
          requireCard(actor, await r.clients.get(client), true);
        if (input.program_id) {
          const program = await r.programs.get(input.program_id);
          if (
            !program ||
            program.deleted_at ||
            (program.owner_id !== null && program.owner_id !== actor.id)
          )
            return fail("not_found", "Program not found");
        }
        await r.calendar.update(id, input);
        return view((await r.calendar.get(id))!);
      },
    );
  }
  async cancel(actor: M.Actor, id: string) {
    await this.update(actor, id, { status: "cancelled" });
  }
}
