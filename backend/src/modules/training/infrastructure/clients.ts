import { sql } from "drizzle-orm";
import type { ClientRepository } from "../domain/ports.js";
import type * as M from "../domain/models/index.js";
import { insert, one, rows, timestampPeriod, update, type Executor } from "./sql.js";

const visibleWorkout = sql`(w.trainer_client_id=c.id or w.self_user_id=c.user_id) and ${timestampPeriod(sql`c.id`, sql`w.started_at`)}`;
const cardSelect = sql`select c.*,coalesce(p.full_name,m.display_name,'') display_name,coalesce(p.full_name,m.display_name) full_name,coalesce(u.phone,m.phone) phone,coalesce(p.injuries,m.injuries) injuries,
 (select count(*)::int from workout_sessions w where ${visibleWorkout}) workout_count,
 (select max(started_at) from workout_sessions w where ${visibleWorkout}) last_activity_at
 from trainer_clients c left join users u on u.id=c.user_id left join user_profiles p on p.user_id=u.id left join managed_clients m on m.id=c.managed_client_id`;
const accountSelect = sql`select u.id,u.role,u.phone,coalesce(p.full_name,'') full_name,p.injuries from users u left join user_profiles p on p.user_id=u.id`;
export class PgClientRepository implements ClientRepository {
  constructor(private readonly db: Executor) {}
  list(trainer: string) {
    return rows<M.ClientCard>(
      this.db,
      sql`${cardSelect} where c.trainer_id=${trainer} order by c.created_at desc,c.id`,
    );
  }
  get(id: string) {
    return one<M.ClientCard>(this.db, sql`${cardSelect} where c.id=${id} for update of c`);
  }
  async create(trainer: string, input: M.ClientDraft, now: string) {
    const managed = await insert(this.db, "managed_clients", {
      owner_id: trainer,
      display_name: input.display_name,
      phone: input.phone ?? null,
      injuries: input.injuries ?? null,
    });
    const start = input.start_date ?? now.slice(0, 10);
    const id = await insert(this.db, "trainer_clients", {
      trainer_id: trainer,
      managed_client_id: managed,
      user_id: null,
      status: "active",
      start_date: start,
      note: input.note ?? null,
    });
    await this.openPeriod(id, `${start}T00:00:00.000Z`);
    return id;
  }
  async update(card: M.ClientCard, input: M.ClientChanges) {
    const nonNull = Object.fromEntries(Object.entries(input).filter(([, v]) => v != null));
    const { start_date, end_date, ...subject } = nonNull;
    if (card.managed_client_id)
      await update(this.db, "managed_clients", card.managed_client_id, subject);
    await update(this.db, "trainer_clients", card.id, { start_date, end_date });
    if (start_date)
      await this.db.execute(
        sql`update trainer_client_periods set start_date=${`${start_date}T00:00:00.000Z`},updated_at=now() where trainer_client_id=${card.id} and end_date is null`,
      );
  }
  async setNote(id: string, note: string) {
    await update(this.db, "trainer_clients", id, { note });
  }
  async setStatus(id: string, status: M.ClientCard["status"]) {
    await update(this.db, "trainer_clients", id, { status });
  }
  async closePeriod(id: string, now: string) {
    await this.db.execute(
      sql`update trainer_client_periods set end_date=${now},updated_at=now() where trainer_client_id=${id} and end_date is null`,
    );
  }
  async openPeriod(id: string, now: string) {
    await this.db.execute(
      sql`insert into trainer_client_periods(id,trainer_client_id,start_date) select gen_random_uuid(),${id},${now}::timestamptz where not exists(select 1 from trainer_client_periods where trainer_client_id=${id} and end_date is null)`,
    );
  }
  findAccount(query: string) {
    return one<M.Account>(
      this.db,
      sql`${accountSelect} where (lower(u.email)=lower(${query.trim()}) or u.phone=${query.trim()}) and u.is_active=true order by u.id limit 1`,
    );
  }
  account(id: string) {
    return one<M.Account>(this.db, sql`${accountSelect} where u.id=${id}`);
  }
  requests(user: string) {
    return rows<M.LinkRequest>(
      this.db,
      sql`select * from link_requests where from_user_id=${user} or to_user_id=${user} order by created_at desc,id`,
    );
  }
  request(id: string) {
    return one<M.LinkRequest>(this.db, sql`select * from link_requests where id=${id}`);
  }
  async pending(a: string, b: string) {
    return !!(await one(
      this.db,
      sql`select id from link_requests where status='pending' and ((from_user_id=${a} and to_user_id=${b}) or (from_user_id=${b} and to_user_id=${a}))`,
    ));
  }
  async linked(trainer: string, client: string) {
    return !!(await one(
      this.db,
      sql`select id from trainer_clients where trainer_id=${trainer} and user_id=${client} and status='active'`,
    ));
  }
  /**
   * The trainer a client is currently linked to, read from the client's side.
   *
   * Only an `active` card counts: `/unlink` sets the card to `unlinked` and the accepted link
   * request stays accepted forever, so the request row cannot answer this. `user_id` is unique
   * per trainer (uq_trainer_clients_trainer_user), and a client is linked to one trainer at a
   * time, so `limit 1` picks the single active row; the order key only keeps it deterministic
   * if historical data ever left two.
   */
  trainerOf(client: string) {
    return one<M.TrainerLink>(
      this.db,
      sql`select c.id card_id,c.trainer_id trainer_user_id,p.full_name,u.phone,c.start_date linked_since
 from trainer_clients c join users u on u.id=c.trainer_id left join user_profiles p on p.user_id=u.id
 where c.user_id=${client} and c.status='active' order by c.created_at desc,c.id limit 1`,
    );
  }
  async createRequest(from: string, to: string) {
    const id = await insert(this.db, "link_requests", {
      from_user_id: from,
      to_user_id: to,
      status: "pending",
    });
    return (await this.request(id))!;
  }
  async setRequestStatus(id: string, status: M.LinkRequest["status"]) {
    await update(this.db, "link_requests", id, { status });
  }
  async ensureLinkedCard(trainer: string, client: M.Account, now: string) {
    const existing = await one<{ id: string }>(
      this.db,
      sql`select id from trainer_clients where trainer_id=${trainer} and user_id=${client.id} for update`,
    );
    if (existing) {
      await this.setStatus(existing.id, "active");
      await this.openPeriod(existing.id, now);
      return;
    }
    const stub = client.phone
      ? await one<{ id: string; managed_client_id: string; injuries: string | null }>(
          this.db,
          sql`select c.id,c.managed_client_id,m.injuries from trainer_clients c join managed_clients m on m.id=c.managed_client_id where c.trainer_id=${trainer} and m.phone=${client.phone} order by c.created_at,c.id limit 1 for update of c`,
        )
      : null;
    if (stub) {
      await update(this.db, "trainer_clients", stub.id, {
        user_id: client.id,
        managed_client_id: null,
        status: "active",
      });
      if (stub.injuries?.trim() && !client.injuries?.trim())
        await this.db.execute(
          sql`update user_profiles set injuries=${stub.injuries},updated_at=now() where user_id=${client.id} and (injuries is null or trim(injuries)='')`,
        );
      await this.db.execute(sql`delete from managed_clients where id=${stub.managed_client_id}`);
      await this.openPeriod(stub.id, now);
      return;
    }
    const id = await insert(this.db, "trainer_clients", {
      trainer_id: trainer,
      user_id: client.id,
      managed_client_id: null,
      status: "active",
      start_date: now.slice(0, 10),
    });
    await this.openPeriod(id, now);
  }
  async notify(user: string, title: string, body: string, payload: Record<string, string>) {
    return insert(this.db, "notifications", {
      user_id: user,
      type: "link_request",
      title,
      body,
      payload: JSON.stringify(payload),
    });
  }
}
