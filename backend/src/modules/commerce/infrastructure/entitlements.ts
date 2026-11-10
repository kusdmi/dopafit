import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../../../platform/db/index.js";
import { AppError } from "../../../domain/error.js";

type Executor = Pick<Database, "execute">;
const FREE = {
  own_programs: 1,
  client_programs: 1,
  days: 3,
  exercises: 5,
  alternatives: 2,
  clients: 10,
  registered_clients: 10,
  managed_clients: 10,
};
const PREMIUM = {
  own_programs: 100,
  client_programs: 100,
  days: 7,
  exercises: 10,
  alternatives: 5,
  clients: 100,
  registered_clients: 50,
  managed_clients: 50,
};
type Limits = typeof FREE;
type Draft = { days: { slots: { exercises: unknown[] }[] }[] };
interface Resource {
  id: string;
  name: string;
  client_id: string | null;
  compatible: boolean;
}
interface Client {
  id: string;
  name: string;
  registered: boolean;
}
interface Choice {
  cycle: string;
  confirmed: boolean;
  program_ids: string[];
  client_ids: string[];
}
function denied(reason: string): never {
  throw new AppError("forbidden", "Достигнуто ограничение тарифа", { reason });
}
export function compatible(program: Draft, limits: Limits): boolean {
  return (
    program.days.length <= limits.days &&
    program.days.every(
      (d) =>
        d.slots.length <= limits.exercises &&
        d.slots.every((s) => s.exercises.length <= limits.alternatives + 1),
    )
  );
}
/** Bound to the caller's transaction: checks and resource writes share the same owner lock. */
export class PgEntitlements {
  constructor(
    private db: Executor,
    private now = () => new Date(),
  ) {}
  private async rows<T>(query: SQL): Promise<T[]> {
    return (await this.db.execute(query)).rows as T[];
  }
  async premium(user: string) {
    return (
      (
        await this.rows(
          sql`select id from subscriptions where user_id=${user} and status='active' and starts_at<=${this.now()} and (ends_at is null or ends_at>${this.now()}) limit 1`,
        )
      ).length > 0
    );
  }
  async workout(user: string, program: string, started: string, client: string | null) {
    const state = await this.state(user);
    if (state.is_active || (state.ends_at && Date.parse(started) <= Date.parse(state.ends_at)))
      return;
    const owned = state.programs.find((p) => p.id === program);
    const group = owned ? state.programs.filter((p) => p.client_id === owned.client_id) : [];
    const groupLimit = owned?.client_id ? state.limits.client_programs : state.limits.own_programs;
    const pendingGroup =
      state.selection.required && (group.length > groupLimit || group.some((p) => !p.compatible));
    if (
      owned &&
      (!state.selection.program_ids.includes(program) || !owned.compatible || pendingGroup)
    )
      denied("program_read_only");
    if (
      client &&
      (!state.selection.client_ids.includes(client) ||
        (state.selection.required && state.clients.length > state.limits.clients))
    )
      denied("client_read_only");
  }
  async lock(user: string) {
    await this.db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`entitlements:${user}`},0))`,
    );
  }
  async state(user: string) {
    await this.lock(user);
    const now = this.now();
    const subscriptions = await this.rows<{
      id: string;
      ends_at: Date | null;
      starts_at: Date;
      status: string;
    }>(
      sql`select id,ends_at,starts_at,status from subscriptions where user_id=${user} order by ends_at desc`,
    );
    const active = subscriptions.find(
      (s) =>
        s.status === "active" &&
        new Date(s.starts_at) <= now &&
        (s.ends_at === null || new Date(s.ends_at) > now),
    );
    const latest = subscriptions.find((s) => s.ends_at !== null && new Date(s.ends_at) <= now);
    const limits = active ? PREMIUM : FREE;
    const programs = await this
      .rows<Resource>(sql`select p.id,p.name,p.assigned_client_id client_id,
      (not exists(select 1 from program_days d where d.program_id=p.id and d.deleted_at is null group by d.program_id having count(*)>3)
      and not exists(select 1 from program_slots s join program_days d on d.id=s.day_id where d.program_id=p.id and d.deleted_at is null and s.deleted_at is null group by d.id having count(*)>5)
      and not exists(select 1 from program_slot_exercises v join program_slots s on s.id=v.slot_id join program_days d on d.id=s.day_id where d.program_id=p.id and d.deleted_at is null and s.deleted_at is null and v.deleted_at is null group by s.id having count(*)>3)) compatible
      from programs p where p.deleted_at is null and ((p.owner_id=${user} and p.assigned_by is null and p.for_trainer_client_id is null) or (p.assigned_by=${user} and exists(select 1 from trainer_clients ac where ac.id=p.assigned_client_id and ac.status!='unlinked'))) order by p.created_at,p.id`);
    const clients = await this.rows<Client>(
      sql`select c.id,coalesce(p.full_name,m.display_name,'') name,c.user_id is not null registered from trainer_clients c left join user_profiles p on p.user_id=c.user_id left join managed_clients m on m.id=c.managed_client_id where c.trainer_id=${user} and c.status!='unlinked' order by c.created_at,c.id`,
    );
    const cycle = latest
      ? `${latest.id}:${new Date(latest.ends_at!).toISOString()}`
      : "never-premium";
    let choice = (
      await this.rows<Choice>(sql`select * from free_selections where user_id=${user}`)
    )[0];
    const own = programs.filter((p) => !p.client_id);
    const over =
      own.length > 1 ||
      own.some((p) => !p.compatible) ||
      clients.length > 10 ||
      clients.some((c) => {
        const group = programs.filter((p) => p.client_id === c.id);
        return group.length > 1 || group.some((p) => !p.compatible);
      });
    if (!active && (!choice || choice.cycle !== cycle || (!choice.confirmed && !over))) {
      const client_ids = clients.slice(0, 10).map((c) => c.id);
      const program_ids = [
        own.find((p) => p.compatible),
        ...client_ids.map((id) => programs.find((p) => p.client_id === id && p.compatible)),
      ].flatMap((p) => (p ? [p.id] : []));
      choice = { cycle, confirmed: !latest || !over, client_ids, program_ids };
      await this.db.execute(
        sql`insert into free_selections(user_id,cycle,confirmed,program_ids,client_ids) values(${user},${cycle},${choice.confirmed},${JSON.stringify(program_ids)}::jsonb,${JSON.stringify(client_ids)}::jsonb) on conflict(user_id) do update set cycle=excluded.cycle,confirmed=excluded.confirmed,program_ids=excluded.program_ids,client_ids=excluded.client_ids`,
      );
    }
    return {
      server_time: now.toISOString(),
      is_active: !!active,
      ends_at: active
        ? active.ends_at === null
          ? null
          : new Date(active.ends_at).toISOString()
        : latest
          ? new Date(latest.ends_at!).toISOString()
          : null,
      limits: { ...limits },
      free_limits: { ...FREE },
      features: {
        rest_timer: !!active,
        share_results: !!active,
        average_rest: !!active,
        analytics_days: active ? null : 30,
      },
      usage: {
        own_programs: own.length,
        clients: clients.length,
        registered_clients: clients.filter((c) => c.registered).length,
        managed_clients: clients.filter((c) => !c.registered).length,
      },
      selection: {
        cycle,
        required: !active && !choice?.confirmed,
        confirmed: active ? false : !!choice?.confirmed,
        program_ids: choice?.program_ids ?? [],
        client_ids: choice?.client_ids ?? [],
      },
      programs,
      clients,
    };
  }
  async confirm(
    user: string,
    input: { cycle: string; program_ids: string[]; client_ids: string[] },
  ) {
    const state = await this.state(user);
    if (state.is_active || state.selection.cycle !== input.cycle || state.selection.confirmed)
      throw new AppError("conflict", "Выбор уже подтверждён или срок подписки изменился");
    const programIds = [...new Set(input.program_ids)];
    const clientIds = [...new Set(input.client_ids)];
    if (clientIds.length > 10 || clientIds.some((id) => !state.clients.some((c) => c.id === id)))
      denied("client_limit");
    const selected = programIds.map((id) => state.programs.find((p) => p.id === id));
    if (selected.some((p) => !p || !p.compatible)) denied("program_size");
    const programs = selected as Resource[];
    if (
      programs.filter((p) => !p.client_id).length > 1 ||
      programs.some(
        (p) =>
          p.client_id &&
          (!clientIds.includes(p.client_id) ||
            programs.filter((v) => v.client_id === p.client_id).length > 1),
      )
    )
      denied("program_limit");
    await this.db.execute(
      sql`update free_selections set confirmed=true,program_ids=${JSON.stringify(programIds)}::jsonb,client_ids=${JSON.stringify(clientIds)}::jsonb where user_id=${user}`,
    );
    return this.state(user);
  }
  async program(
    user: string,
    input: Draft,
    id: string,
    existing: boolean,
    client: string | null = null,
  ) {
    const state = await this.state(user);
    if (!compatible(input, state.limits)) denied("program_size");
    const group = state.programs.filter((p) => p.client_id === client);
    const selected = state.is_active
      ? group
      : group.filter((p) => state.selection.program_ids.includes(p.id));
    if (state.selection.required && (group.length > 1 || group.some((p) => !p.compatible)))
      denied("free_selection_required");
    if (existing && !state.is_active && !selected.some((p) => p.id === id))
      denied("program_read_only");
    if (
      client &&
      !state.is_active &&
      (!state.selection.client_ids.includes(client) ||
        (state.selection.required && state.clients.length > state.limits.clients))
    )
      denied("client_read_only");
    if (
      !existing &&
      selected.length >= (client ? state.limits.client_programs : state.limits.own_programs)
    )
      denied("program_limit");
    if (!existing && !state.is_active) {
      const ids = [...state.selection.program_ids, id];
      await this.db.execute(
        sql`update free_selections set program_ids=${JSON.stringify(ids)}::jsonb where user_id=${user}`,
      );
    }
  }
  async client(user: string, registered: boolean, existingId?: string) {
    const state = await this.state(user);
    if (state.selection.required && state.clients.length > state.limits.clients)
      denied("free_selection_required");
    const prior = state.clients.find((c) => c.id === existingId);
    if (prior) {
      if (
        prior.registered !== registered &&
        state.clients.filter((c) => c.registered === registered).length >=
          (registered ? state.limits.registered_clients : state.limits.managed_clients)
      )
        denied("client_limit");
      if (!state.is_active && !state.selection.client_ids.includes(prior.id))
        denied("client_read_only");
      return;
    }
    const selected = state.is_active
      ? state.clients
      : state.clients.filter((c) => state.selection.client_ids.includes(c.id));
    if (
      selected.length >= state.limits.clients ||
      selected.filter((c) => c.registered === registered).length >=
        (registered ? state.limits.registered_clients : state.limits.managed_clients)
    )
      denied("client_limit");
  }
  async registerClient(user: string, id: string) {
    const state = await this.state(user);
    if (!state.is_active && !state.selection.client_ids.includes(id))
      await this.db.execute(
        sql`update free_selections set client_ids=${JSON.stringify([...state.selection.client_ids, id])}::jsonb where user_id=${user}`,
      );
  }
  async range(user: string, from: string, to: string) {
    const state = await this.state(user);
    const min = new Date(this.now().getTime() - 30 * 86400000).toISOString().slice(0, 10);
    return {
      date_from: state.is_active ? from : from < min ? min : from,
      date_to: to,
      limited: !state.is_active && from < min,
    };
  }
}
