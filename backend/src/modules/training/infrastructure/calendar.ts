import { sql } from "drizzle-orm";
import type { CalendarRepository } from "../domain/ports.js";
import type * as M from "../domain/models/index.js";
import { insert, one, rows, update, type Executor } from "./sql.js";

export class PgCalendarRepository implements CalendarRepository {
  constructor(private readonly db: Executor) {}
  async month(user: string, year: number, month: number) {
    const start = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`;
    // Месяц показывает и СВОИ записи, и те, куда пользователя записал тренер.
    // Раньше условием было только `owner_user_id`, то есть автор записи, и
    // забронированная тренером тренировка у клиента в календаре не появлялась
    // вовсе — хотя именно он на неё и идёт.
    //
    // Связь непрямая: `calendar_event_clients` указывает на КАРТОЧКУ клиента
    // (`trainer_clients.id`), а не на пользователя, поэтому нужен переход
    // `client_id -> trainer_clients.user_id`. У карточки без аккаунта
    // (managed-клиент) `user_id` пуст — такая запись ничьим календарём, кроме
    // тренерского, и не является.
    const events = await rows<M.Event>(
      this.db,
      sql`select e.*,coalesce(p.full_name,'') owner_name,pr.name program_name from calendar_events e left join user_profiles p on p.user_id=e.owner_user_id left join programs pr on pr.id=e.program_id where e.date>=${start}::date and e.date<${start}::date+interval '1 month' and (e.owner_user_id=${user} or exists(select 1 from calendar_event_clients ec join trainer_clients c on c.id=ec.client_id where ec.event_id=e.id and c.user_id=${user})) order by e.date,e.time,e.id`,
    );
    return this.withClients(events);
  }
  async get(id: string) {
    const event = await one<M.Event>(
      this.db,
      sql`select e.*,coalesce(p.full_name,'') owner_name,pr.name program_name from calendar_events e left join user_profiles p on p.user_id=e.owner_user_id left join programs pr on pr.id=e.program_id where e.id=${id}`,
    );
    return event ? (await this.withClients([event]))[0]! : null;
  }
  private async withClients(events: M.Event[]) {
    if (!events.length) return [];
    const links = await rows<{ event_id: string; client_id: string; name: string }>(
      this.db,
      sql`select ec.event_id,ec.client_id,coalesce(p.full_name,m.display_name,'') name from calendar_event_clients ec join trainer_clients c on c.id=ec.client_id left join user_profiles p on p.user_id=c.user_id left join managed_clients m on m.id=c.managed_client_id where ec.event_id in (${sql.join(
        events.map((e) => sql`${e.id}`),
        sql`,`,
      )}) order by ec.id`,
    );
    return events.map((e) => ({
      ...e,
      clients: links
        .filter((l) => l.event_id === e.id)
        .map((l) => ({ client_id: l.client_id, name: l.name })),
    }));
  }
  async create(user: string, input: M.EventDraft) {
    const id = await insert(this.db, "calendar_events", {
      owner_user_id: user,
      program_id: input.program_id,
      date: input.date,
      time: input.time,
      type: input.client_ids.length ? "with_clients" : "personal",
      status: "planned",
    });
    for (const client of new Set(input.client_ids))
      await insert(this.db, "calendar_event_clients", { event_id: id, client_id: client });
    return id;
  }
  async update(id: string, input: M.EventChanges) {
    const { client_ids, ...changes } = input;
    const values = Object.fromEntries(
      Object.entries(changes).filter(
        ([key, value]) => value != null || (key === "program_id" && value === null),
      ),
    );
    await update(this.db, "calendar_events", id, {
      ...values,
      ...(client_ids ? { type: client_ids.length ? "with_clients" : "personal" } : {}),
    });
    if (client_ids) {
      await this.db.execute(sql`delete from calendar_event_clients where event_id=${id}`);
      for (const client of new Set(client_ids))
        await insert(this.db, "calendar_event_clients", { event_id: id, client_id: client });
    }
  }
  async completeFromSession(session: M.Session, owner: string) {
    const event = await one<{ id: string }>(
      this.db,
      sql`select e.id from calendar_events e where e.owner_user_id=${owner} and e.date=${session.local_date} and e.status='planned' and e.workout_session_id is null and (e.program_id is null or e.program_id=${session.program_id}) and ${session.trainer_client_id ? sql`e.type='with_clients' and exists(select 1 from calendar_event_clients ec where ec.event_id=e.id and ec.client_id=${session.trainer_client_id})` : sql`e.type='personal'`} order by (e.program_id=${session.program_id}) desc nulls last,e.time,e.id limit 1 for update`,
    );
    if (event) {
      await update(this.db, "calendar_events", event.id, {
        status: "completed",
        workout_session_id: session.id,
      });
      return;
    }
    // Плана на этот день не было — тренировку начали прямо из программы, минуя
    // календарь. Раньше метод здесь молча выходил, и проведённая тренировка не
    // появлялась в календаре вообще: месяц показывает события, а не сессии.
    // Поэтому дописываем уже выполненное событие задним числом.
    //
    // Идемпотентность держит сам workout_session_id: sync ре-отправляет ту же
    // сессию (офлайн-очередь, повтор запроса), и без этой проверки на каждую
    // доставку заводилось бы новое событие того же дня.
    const recorded = await one<{ id: string }>(
      this.db,
      sql`select id from calendar_events where workout_session_id=${session.id} limit 1`,
    );
    if (recorded) return;
    const id = await insert(this.db, "calendar_events", {
      owner_user_id: owner,
      program_id: session.program_id,
      date: session.local_date,
      // Час старта в UTC. Настоящую зону пользователя восстановить не из чего:
      // в базе её нет, а пара (started_at, local_date) её НЕ задаёт — день
      // 09-09 при старте 21:30Z даёт любое смещение от +2:30 до +14:00, и
      // «ближайшее подходящее» было бы просто выдумкой. День при этом берётся
      // из local_date, поэтому событие стоит в календаре на правильной дате;
      // расходится только показанный час.
      // TODO: клиент уже шлёт local_date — если добавить в sync и смещение
      // зоны, здесь появится честное местное время (правка контракта).
      time: new Date(session.started_at).toISOString().slice(11, 19),
      type: session.trainer_client_id ? "with_clients" : "personal",
      status: "completed",
      workout_session_id: session.id,
    });
    if (session.trainer_client_id)
      await insert(this.db, "calendar_event_clients", {
        event_id: id,
        client_id: session.trainer_client_id,
      });
  }
  bookings(user: string, from: string, to: string) {
    // Та же видимость, что и у `month()` выше: полоска недели на Главной
    // обязана отмечать и тренировку, на которую записал тренер, иначе день
    // выглядит свободным ровно у того, кто на неё идёт.
    return rows<{ date: string; type: M.Event["type"] }>(
      this.db,
      sql`select distinct e.date,e.type from calendar_events e where e.date>=${from} and e.date<=${to} and e.status<>'cancelled' and (e.owner_user_id=${user} or exists(select 1 from calendar_event_clients ec join trainer_clients c on c.id=ec.client_id where ec.event_id=e.id and c.user_id=${user}))`,
    );
  }
}
