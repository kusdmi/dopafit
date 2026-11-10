import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "./database.js";
import { createApi } from "../src/http/app.js";
import { createTrainingModule } from "../src/modules/training/index.js";
import { trainingEndpoints } from "../src/modules/training/http/index.js";
import { PgEntitlements } from "../src/modules/commerce/index.js";
import * as T from "../src/platform/db/schema.js";

const { db, dispose } = await createTestDatabase();
afterAll(dispose);
let time = new Date("2026-11-04T12:00:00Z");
const now = () => new Date(time);
const access = (tx: Pick<typeof db, "execute">) => new PgEntitlements(tx, now);
const storage = {
  async putObject() {},
  async getObject() {
    return { data: new Uint8Array(), contentType: "image/jpeg" };
  },
  async delete() {},
  async presignedGet() {
    return "";
  },
  async optimizeImage(data: Uint8Array, contentType: string) {
    return { data, contentType, extension: "jpg" };
  },
};
const training = createTrainingModule(db, storage, { access, now: () => now().toISOString() });
const api = createApi({
  endpoints: trainingEndpoints(training.application),
  authenticate: async (id) => ({ id, role: "trainer" }),
});
async function user() {
  const id = crypto.randomUUID();
  await db.insert(T.users).values({ id, role: "trainer", referral_code: id.slice(0, 16) });
  return id;
}
async function premium(id: string) {
  await db.insert(T.subscriptions).values({
    user_id: id,
    starts_at: new Date(now().getTime() - 86400000),
    ends_at: new Date(now().getTime() + 86400000),
  });
}
async function state(id: string) {
  return db.transaction((tx) => access(tx).state(id));
}
function call(id: string, path: string, body?: unknown, method = "POST") {
  return api.request(`/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${id}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function draft(days = 1, exercises = 1, alternatives = 0) {
  return {
    id: crypto.randomUUID(),
    name: "Program",
    kind: "custom",
    days: Array.from({ length: days }, (_, d) => ({
      name: `Day ${d}`,
      position: d,
      slots: Array.from({ length: exercises }, (_, s) => ({
        position: s,
        exercises: Array.from({ length: alternatives + 1 }, (_, v) => ({
          custom_name: `Exercise ${v}`,
          sets: 3,
          reps: 10,
          variant_order: v,
        })),
      })),
    })),
  };
}
async function create(id: string, body = draft()) {
  const response = await call(id, "/programs", body);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
  return response.json();
}

describe("entitlements under the resource transaction", () => {
  for (const paid of [false, true]) {
    const limits = paid
      ? { days: 7, exercises: 10, alternatives: 5 }
      : { days: 3, exercises: 5, alternatives: 2 };
    for (const field of ["days", "exercises", "alternatives"] as const) {
      it(`${paid ? "premium" : "free"} accepts the ${field} boundary and rejects one beyond`, async () => {
        const id = await user();
        if (paid) await premium(id);
        const size = { days: 1, exercises: 1, alternatives: 0, [field]: limits[field] };
        const body = draft(size.days, size.exercises, size.alternatives);
        const program = await create(id, body);
        size[field]++;
        const response = await call(
          id,
          `/programs/${program.id}`,
          {
            ...draft(size.days, size.exercises, size.alternatives),
            expected_updated_at: program.updated_at,
          },
          "PUT",
        );
        expect(response.status).toBe(403);
      });
    }
  }
  it("serializes concurrent creates at the free own-program limit; deletion releases the slot", async () => {
    const id = await user();
    const requests = await Promise.all([
      call(id, "/programs", draft()),
      call(id, "/programs", draft()),
    ]);
    expect(requests.map((r) => r.status).sort()).toEqual([201, 403]);
    const selected = (await state(id)).selection.program_ids[0];
    expect((await call(id, `/programs/${selected}`, undefined, "DELETE")).status).toBe(204);
    await create(id);
  });
  it("requires one immutable choice per expiry, allows an atomic reduced copy, and starts a new cycle after renewal", async () => {
    const id = await user();
    await premium(id);
    const large = await create(id, draft(4));
    await create(id);
    await db
      .update(T.subscriptions)
      .set({ ends_at: new Date(now().getTime() - 1000) })
      .where(eq(T.subscriptions.user_id, id));
    const before = await state(id);
    expect(before.selection.required).toBe(true);
    expect((await call(id, "/programs", draft())).status).toBe(403);
    const selected = await call(id, "/subscriptions/free-selection", {
      cycle: before.selection.cycle,
      program_ids: [],
      client_ids: [],
      copies: [{ source_id: large.id, program: draft(3) }],
    });
    expect(selected.status).toBe(200);
    const after = await state(id);
    expect(after.selection).toMatchObject({ required: false, confirmed: true });
    expect(after.selection.program_ids).toHaveLength(1);
    expect(after.programs).toHaveLength(3);
    expect(
      (
        await call(id, "/subscriptions/free-selection", {
          cycle: before.selection.cycle,
          program_ids: [large.id],
          client_ids: [],
        })
      ).status,
    ).toBe(409);
    expect((await call(id, `/programs/${large.id}`, undefined, "GET")).status).toBe(200);
    await premium(id);
    expect((await state(id)).is_active).toBe(true);
    time = new Date(time.getTime() + 2 * 86400000);
    const next = await state(id);
    expect(next.selection.cycle).not.toBe(before.selection.cycle);
    expect(next.selection.required).toBe(true);
  });
  it("enforces 10 free clients under concurrent creation and keeps the 11th out", async () => {
    const id = await user();
    const responses = await Promise.all(
      Array.from({ length: 11 }, (_, i) => call(id, "/clients", { display_name: `Client ${i}` })),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(10);
    expect(responses.filter((r) => r.status === 403)).toHaveLength(1);
  });
  it("caps premium own programs at 100 under concurrency", async () => {
    const id = await user();
    await premium(id);
    await db.insert(T.programs).values(
      Array.from({ length: 99 }, (_, i) => ({
        owner_id: id,
        name: `Program ${i}`,
        kind: "custom" as const,
      })),
    );
    const responses = await Promise.all([
      call(id, "/programs", draft()),
      call(id, "/programs", draft()),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 403]);
  });
  it("caps premium registered and managed clients separately at 50", async () => {
    const trainer = await user();
    await premium(trainer);
    for (let i = 0; i < 50; i++) {
      const client = await user();
      await db.insert(T.trainer_clients).values({
        trainer_id: trainer,
        user_id: client,
        status: "active",
        start_date: now().toISOString().slice(0, 10),
      });
    }
    await db.transaction(async (tx) => {
      await expect(access(tx).client(trainer, true)).rejects.toMatchObject({ code: "forbidden" });
    });
    const responses = await Promise.all(
      Array.from({ length: 51 }, (_, i) =>
        call(trainer, "/clients", { display_name: `Managed ${i}` }),
      ),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(50);
    expect(responses.filter((r) => r.status === 403)).toHaveLength(1);
    expect((await state(trainer)).usage.clients).toBe(100);
  });
  it("applies a trainer's program quota to each client independently and preserves received copies after expiry", async () => {
    const trainer = await user();
    const client = await user();
    await premium(trainer);
    const [card] = await db
      .insert(T.trainer_clients)
      .values({
        trainer_id: trainer,
        user_id: client,
        status: "active",
        start_date: now().toISOString().slice(0, 10),
      })
      .returning();
    const source = await create(trainer, draft(7, 10, 5));
    for (let i = 0; i < 100; i++)
      expect(
        (await call(trainer, `/programs/${source.id}/share`, { client_id: card.id })).status,
      ).toBe(200);
    expect(
      (await call(trainer, `/programs/${source.id}/share`, { client_id: card.id })).status,
    ).toBe(403);
    expect((await state(client)).usage.own_programs).toBe(0);
    const list = await call(client, "/programs?standard=false", undefined, "GET");
    const received = (await list.json())[0];
    await db
      .update(T.subscriptions)
      .set({ ends_at: new Date(now().getTime() - 1000) })
      .where(eq(T.subscriptions.user_id, trainer));
    const detail = await call(client, `/programs/${received.id}`, undefined, "GET");
    expect(detail.status).toBe(200);
    expect((await detail.json()).days).toHaveLength(7);
    await create(client);
    expect((await call(client, "/programs", draft())).status).toBe(403);
  });
  it("allows pre-expiry workouts to sync and standard or received programs to execute for free", async () => {
    const id = await user();
    await premium(id);
    const p = await create(id, draft(4));
    const started = new Date(now().getTime() - 10000).toISOString();
    await db
      .update(T.subscriptions)
      .set({ ends_at: new Date(now().getTime() - 1000) })
      .where(eq(T.subscriptions.user_id, id));
    await db.transaction(async (tx) => {
      await access(tx).workout(id, p.id, started, null);
      await expect(access(tx).workout(id, p.id, now().toISOString(), null)).rejects.toMatchObject({
        code: "forbidden",
      });
      await access(tx).workout(id, crypto.randomUUID(), now().toISOString(), null);
    });
  });
  it("blocks only the over-limit client group until selection is confirmed", async () => {
    const trainer = await user();
    await premium(trainer);
    const own = await create(trainer);
    const cards: string[] = [];
    for (let i = 0; i < 11; i++) {
      const response = await call(trainer, "/clients", { display_name: `Pending client ${i}` });
      expect(response.status).toBe(201);
      cards.push((await response.json()).id);
    }
    await db
      .update(T.subscriptions)
      .set({ ends_at: new Date(now().getTime() - 1000) })
      .where(eq(T.subscriptions.user_id, trainer));
    const pending = await state(trainer);
    expect(pending.selection.required).toBe(true);
    expect(
      (
        await call(
          trainer,
          `/clients/${cards[0]}/trainer-fields`,
          { note: "Premature edit" },
          "PATCH",
        )
      ).status,
    ).toBe(403);
    await db.transaction((tx) => access(tx).workout(trainer, own.id, now().toISOString(), null));
    await expect(
      db.transaction((tx) => access(tx).workout(trainer, own.id, now().toISOString(), cards[0])),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      (
        await call(trainer, "/subscriptions/free-selection", {
          cycle: pending.selection.cycle,
          program_ids: [own.id],
          client_ids: cards.slice(0, 10),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          trainer,
          `/clients/${cards[0]}/trainer-fields`,
          { note: "Selected client" },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          trainer,
          `/clients/${cards[10]}/trainer-fields`,
          { note: "Excluded client" },
          "PATCH",
        )
      ).status,
    ).toBe(403);
  });
  it("clamps analytics to server minus 30 days but keeps zero and all-history availability", async () => {
    const id = await user();
    for (const date of ["2020-01-01", now().toISOString().slice(0, 10)])
      await call(id, "/measurements", { date, neck: 0, custom_values: [] });
    const parameters = await call(id, "/analytics/anthropometry/parameters", undefined, "GET");
    expect(await parameters.json()).toMatchObject({ parameters: ["neck"] });
    const response = await call(
      id,
      `/analytics/anthropometry/series?date_from=2020-01-01&date_to=2030-01-01&parameters=neck`,
      undefined,
      "GET",
    );
    const result = await response.json();
    expect(result.range).toMatchObject({ limited: true });
    expect(result.parameters[0].points).toEqual([
      { date: now().toISOString().slice(0, 10), value: 0 },
    ]);
  });
});
