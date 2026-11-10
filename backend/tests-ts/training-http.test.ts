import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase } from "./database.js";
import { createTrainingModule, type FileStorage } from "../src/modules/training/index.js";
import { trainingEndpoints } from "../src/modules/training/http/index.js";
import { createApi } from "../src/http/app.js";
import * as S from "../src/modules/training/http/schemas.js";
import * as T from "../src/platform/db/schema.js";
import type { Principal } from "../src/domain/principal.js";

let environment: Awaited<ReturnType<typeof createTestDatabase>>;
let app: ReturnType<typeof createApi>;
let category: string;
const identities = new Map<string, Principal>();
const uploads = new Map<string, Uint8Array>();
const signed: string[] = [];
let now = "2026-09-09T12:00:00.000Z";
let pushCalls = 0;
/** Payload'ы доставленных пушей — по ним проверяется, что в них едет notification_id. */
const pushed: { data: Record<string, string> }[] = [];
const storage: FileStorage = {
  async putObject(key, data) {
    uploads.set(key, data);
  },
  async getObject(key) {
    const data = uploads.get(key);
    if (!data) throw new Error("Photo not found");
    return { data, contentType: "image/jpeg" };
  },
  async presignedGet(key) {
    signed.push(key);
    return `https://private.example/${key}?signed=yes`;
  },
  async delete(key) {
    uploads.delete(key);
  },
  async optimizeImage(data, contentType) {
    return { data, contentType, extension: contentType === "image/gif" ? "gif" : "webp" };
  },
};
async function user(role: Principal["role"] = "client", phone?: string) {
  const id = crypto.randomUUID();
  const email = `${id}@example.com`;
  await environment.db
    .insert(T.users)
    .values({ id, email, role, phone, referral_code: id.slice(0, 12) });
  await environment.db.insert(T.user_profiles).values({ user_id: id, full_name: `Name ${id}` });
  const identity = { id, role };
  identities.set(id, identity);
  return { ...identity, email };
}
function call(user: Principal, path: string, method = "GET", body?: unknown) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${user.id}`,
      ...(body instanceof FormData
        ? {}
        : body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
}
async function body(response: Response, status = 200) {
  const json = await response.json();
  expect({ status: response.status, body: json }).toMatchObject({ status });
  return json;
}
async function exercise(owner: Principal) {
  return S.ExerciseOut.parse(
    await body(
      await call(owner, "/exercises", "POST", {
        name: "Bench press",
        category_id: category,
        difficulty: "beginner",
      }),
      201,
    ),
  );
}
async function program(owner: Principal, exerciseId?: string) {
  return S.ProgramOut.parse(
    await body(
      await call(owner, "/programs", "POST", {
        id: crypto.randomUUID(),
        name: "Program",
        days: [
          {
            id: crypto.randomUUID(),
            name: "Day",
            position: 0,
            slots: [
              {
                id: crypto.randomUUID(),
                position: 0,
                exercises: [
                  {
                    id: crypto.randomUUID(),
                    ...(exerciseId ? { exercise_id: exerciseId } : { custom_name: "Pushups" }),
                    sets: 3,
                    reps: 10,
                    variant_order: 0,
                  },
                ],
              },
            ],
          },
        ],
      }),
      201,
    ),
  );
}
function session(
  p: ReturnType<typeof S.ProgramOut.parse>,
  day = "2026-09-09",
  weights = [20, 30],
  client?: string,
) {
  const slot = p.days[0].slots[0];
  return {
    id: crypto.randomUUID(),
    program_id: p.id,
    day_id: p.days[0].id,
    client_id: client ?? null,
    started_at: `${day}T10:00:00Z`,
    finished_at: `${day}T10:30:00Z`,
    local_date: day,
    exercises: [{ slot_id: slot.id, chosen_variant_id: slot.exercises[0].id, is_completed: true }],
    sets: weights.map((weight, index) => ({
      id: crypto.randomUUID(),
      slot_id: slot.id,
      variant_id: slot.exercises[0].id,
      weight,
      reps: 10,
      performed_at: `${day}T10:${String(index + 1).padStart(2, "0")}:00Z`,
    })),
  };
}
async function card(trainer: Principal, phone?: string) {
  return S.ClientOut.parse(
    await body(
      await call(trainer, "/clients", "POST", {
        display_name: "Managed client",
        phone,
        start_date: "2026-09-01",
        injuries: "Knee",
        note: "Trainer note",
      }),
      201,
    ),
  );
}
async function link(trainer: Principal, client: Principal & { email: string }) {
  const request = S.LinkRequestOut.parse(
    await body(await call(trainer, "/link-requests", "POST", { query: client.email }), 201),
  );
  await body(await call(client, `/link-requests/${request.id}/accept`, "POST"));
  return S.ClientsListOut.parse(await body(await call(trainer, "/clients"))).items.find(
    (c) => c.client_user_id === client.id,
  )!;
}

function forgedProgram(exerciseId: string) {
  return {
    name: "Forged",
    days: [
      {
        name: "Day",
        position: 0,
        slots: [
          {
            position: 0,
            exercises: [{ exercise_id: exerciseId, sets: 3, reps: 10, variant_order: 0 }],
          },
        ],
      },
    ],
  };
}
async function measurement(owner: Principal, date: string, weight: number) {
  return S.MeasurementOut.parse(
    await body(await call(owner, "/measurements", "POST", { date, weight }), 201),
  );
}
async function uploadPhoto(owner: Principal, measurementId: string, kind: string) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" }));
  return body(await call(owner, `/measurements/${measurementId}/photos`, "POST", form), 201);
}
function appendix(dayId: string, exerciseId: string) {
  return {
    day_id: dayId,
    exercise_id: exerciseId,
    slot_id: crypto.randomUUID(),
    slot_exercise_id: crypto.randomUUID(),
  };
}
const renamed = {
  display_name: "Renamed",
  start_date: "2026-08-01",
  end_date: "2026-12-01",
  phone: "+79990002222",
  injuries: "Shoulder",
};

describe("training PostgreSQL and HTTP behavior", () => {
  beforeAll(async () => {
    environment = await createTestDatabase();
    category = (
      await environment.db
        .insert(T.exercise_categories)
        .values({ name: "Chest", slug: "chest", emoji: "X" })
        .returning()
    )[0].id;
    const training = createTrainingModule(environment.db, storage, {
      now: () => now,
      customExerciseLimit: 2,
      deliver: async (message) => {
        pushCalls++;
        pushed.push({ data: message.data });
        throw new Error("Push unavailable");
      },
      logError: () => undefined,
    });
    app = createApi({
      endpoints: trainingEndpoints(training.application),
      authenticate: async (token) => {
        const identity = identities.get(token);
        if (!identity) throw new Error("Unknown identity");
        return identity;
      },
      logError: console.error,
    });
  });
  afterAll(async () => {
    await environment?.dispose();
  });

  describe("client roster access", () => {
    it("rejects a client reading the trainer roster", async () => {
      const client = await user();
      expect((await call(client, "/clients")).status).toBe(403);
    });

    it("hides a managed card from a trainer who does not own it", async () => {
      const trainer = await user("trainer");
      const stranger = await user("trainer");
      const managed = await card(trainer);
      expect((await call(stranger, `/clients/${managed.id}`)).status).toBe(404);
    });
  });

  describe("managed card merging on link", () => {
    it("reuses the managed card that already holds the client phone", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990001111");
      const managed = await card(trainer, "+79990001111");
      const linked = await link(trainer, client);
      expect(linked.id).toBe(managed.id);
    });

    it("keeps the trainer note when a managed card merges into a linked one", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990001112");
      const managed = await card(trainer, "+79990001112");
      await link(trainer, client);
      const detail = S.ClientDetailOut.parse(
        await body(await call(trainer, `/clients/${managed.id}`)),
      );
      expect(detail.note).toBe("Trainer note");
    });

    it("keeps the recorded injuries when a managed card merges into a linked one", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990001113");
      const managed = await card(trainer, "+79990001113");
      await link(trainer, client);
      const detail = S.ClientDetailOut.parse(
        await body(await call(trainer, `/clients/${managed.id}`)),
      );
      expect(detail.injuries).toBe("Knee");
    });

    it("drops the standalone managed snapshot once the card is linked", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990001114");
      await card(trainer, "+79990001114");
      await link(trainer, client);
      expect(
        (await environment.db.select().from(T.managed_clients)).find(
          (s) => s.phone === "+79990001114",
        ),
      ).toBeUndefined();
    });
  });

  describe("linked card editing", () => {
    it("refuses to overwrite the identity fields of a linked card", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990002001");
      const managed = await card(trainer, "+79990002001");
      await link(trainer, client);
      expect(
        (await call(trainer, `/clients/${managed.id}`, "PUT", { display_name: "Overwrite" }))
          .status,
      ).toBe(403);
    });

    it("lets the trainer revise its own note on a linked card", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990002002");
      const managed = await card(trainer, "+79990002002");
      await link(trainer, client);
      expect(
        S.ClientDetailOut.parse(
          await body(
            await call(trainer, `/clients/${managed.id}/trainer-fields`, "PATCH", {
              note: "Revised",
            }),
          ),
        ).note,
      ).toBe("Revised");
    });
  });

  describe("unlinking a client", () => {
    it("acknowledges the unlink request", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990003001");
      const managed = await card(trainer, "+79990003001");
      await link(trainer, client);
      expect(await body(await call(trainer, `/clients/${managed.id}/unlink`, "POST"))).toEqual({
        ok: true,
      });
    });

    // Archiving is gated on the card status, not on the link: after /unlink the card
    // becomes "unlinked", which is neither "active" (archive) nor "archived" (unarchive).
    it("refuses to archive a card that was unlinked", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990003002");
      const managed = await card(trainer, "+79990003002");
      await link(trainer, client);
      await body(await call(trainer, `/clients/${managed.id}/unlink`, "POST"));
      expect((await call(trainer, `/clients/${managed.id}/archive`, "POST")).status).toBe(409);
    });

    it("refuses to unarchive a card that was unlinked", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990003003");
      const managed = await card(trainer, "+79990003003");
      await link(trainer, client);
      await body(await call(trainer, `/clients/${managed.id}/unlink`, "POST"));
      expect((await call(trainer, `/clients/${managed.id}/unarchive`, "POST")).status).toBe(409);
    });

    // Связь обоюдная: выйти из неё вправе обе стороны, а не только тренер.
    it("lets the client break the link themselves", async () => {
      const trainer = await user("trainer", "+79990007001");
      const client = await user("client", "+79990007002");
      const linked = await link(trainer, client);

      await body(await call(client, `/clients/${linked.id}/unlink`, "POST"));

      const { trainer: mine } = S.MyTrainerResponse.parse(
        await body(await call(client, "/clients/my-trainer")),
      );
      expect(mine).toBeNull();
    });

    it("notifies both sides when the client is the one who unlinks", async () => {
      const trainer = await user("trainer", "+79990007003");
      const client = await user("client", "+79990007004");
      const linked = await link(trainer, client);

      await body(await call(client, `/clients/${linked.id}/unlink`, "POST"));

      // Тренер должен узнать об этом, хотя действие совершил не он. Маршрут
      // /notifications принадлежит модулю messaging и в этом приложении не
      // смонтирован, поэтому читаем таблицу напрямую — как и соседний тест
      // про пуш при заявке на связь.
      for (const principal of [trainer, client]) {
        const rows = await environment.db
          .select()
          .from(T.notifications)
          .where(eq(T.notifications.user_id, principal.id));
        expect(rows.map((n) => n.title)).toContain("Связь тренер-клиент разорвана");
      }
    });

    it("refuses to unlink a card belonging to someone else", async () => {
      const trainer = await user("trainer", "+79990007005");
      const client = await user("client", "+79990007006");
      const linked = await link(trainer, client);
      const stranger = await user();

      expect((await call(stranger, `/clients/${linked.id}/unlink`, "POST")).status).toBe(404);
    });

    // Архив остаётся распоряжением тренера своей картотекой.
    it("still refuses to let a client archive their own card", async () => {
      const trainer = await user("trainer", "+79990007007");
      const client = await user("client", "+79990007008");
      const linked = await link(trainer, client);

      expect((await call(client, `/clients/${linked.id}/archive`, "POST")).status).toBe(403);
    });

    it("attempts a push notification while linking a client", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990003004");
      await card(trainer, "+79990003004");
      // pushCalls is module-level and accumulates across the file, so assert the
      // delta this test causes rather than an absolute count.
      const before = pushCalls;
      await link(trainer, client);
      expect(pushCalls).toBeGreaterThan(before);
    });
  });

  // The client side of the pair: every other clients route answers a trainer, so this is the
  // only way the "Мой тренер" screen can tell a linked client from an unlinked one.
  describe("the client's own trainer", () => {
    it("names the trainer a client is linked to", async () => {
      const trainer = await user("trainer", "+79990005001");
      const client = await user("client", "+79990005002");
      await link(trainer, client);
      const { trainer: mine } = S.MyTrainerResponse.parse(
        await body(await call(client, "/clients/my-trainer")),
      );
      expect(mine).toMatchObject({ trainer_user_id: trainer.id, phone: "+79990005001" });
      expect(mine?.full_name).toBe(`Name ${trainer.id}`);
    });

    it("answers with no trainer for a client who has none", async () => {
      const client = await user("client");
      expect(
        S.MyTrainerResponse.parse(await body(await call(client, "/clients/my-trainer"))).trainer,
      ).toBeNull();
    });

    // The accepted link request stays "accepted" forever, so a screen reading it would keep
    // showing an unlinked trainer; the card status is what actually settles the question.
    it("forgets the trainer once the card is unlinked", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990005003");
      const managed = await card(trainer, "+79990005003");
      await link(trainer, client);
      await body(await call(trainer, `/clients/${managed.id}/unlink`, "POST"));
      expect(
        S.MyTrainerResponse.parse(await body(await call(client, "/clients/my-trainer"))).trainer,
      ).toBeNull();
    });

    it("answers with no trainer for a trainer", async () => {
      const trainer = await user("trainer");
      expect(
        S.MyTrainerResponse.parse(await body(await call(trainer, "/clients/my-trainer"))).trainer,
      ).toBeNull();
    });
  });

  describe("relationship periods", () => {
    it("closes the open period at the unlink moment", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990004001");
      const managed = await card(trainer, "+79990004001");
      await link(trainer, client);
      await body(await call(trainer, `/clients/${managed.id}/unlink`, "POST"));
      const periods = await environment.db
        .select()
        .from(T.trainer_client_periods)
        .where(eq(T.trainer_client_periods.trainer_client_id, managed.id));
      expect(periods).toHaveLength(1);
      expect(periods[0].end_date?.toISOString()).toBe(now);
    });

    it("opens a second period when the same client links again", async () => {
      const trainer = await user("trainer");
      const client = await user("client", "+79990004002");
      const managed = await card(trainer, "+79990004002");
      await link(trainer, client);
      await body(await call(trainer, `/clients/${managed.id}/unlink`, "POST"));
      const restore = now;
      now = "2026-09-09T15:00:00.000Z";
      try {
        await link(trainer, client);
      } finally {
        now = restore;
      }
      expect(
        await environment.db
          .select()
          .from(T.trainer_client_periods)
          .where(eq(T.trainer_client_periods.trainer_client_id, managed.id)),
      ).toHaveLength(2);
    });
  });

  describe("link requests", () => {
    it("serializes opposite-direction requests into one winner", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const results = await Promise.all([
        call(trainer, "/link-requests", "POST", { query: client.email }),
        call(client, "/link-requests", "POST", { query: trainer.email }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it("hides a pending request from an unrelated user", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const stranger = await user();
      await body(await call(trainer, "/link-requests", "POST", { query: client.email }), 201);
      const req = S.LinkRequestOut.array().parse(
        await body(await call(client, "/link-requests")),
      )[0];
      expect((await call(stranger, `/link-requests/${req.id}/accept`, "POST")).status).toBe(404);
    });

    it("refuses to let the sender decline its own request", async () => {
      const trainer = await user("trainer");
      const client = await user();
      await body(await call(trainer, "/link-requests", "POST", { query: client.email }), 201);
      const req = S.LinkRequestOut.array().parse(
        await body(await call(client, "/link-requests")),
      )[0];
      const sender = req.direction === "incoming" ? trainer : client;
      expect((await call(sender, `/link-requests/${req.id}/decline`, "POST")).status).toBe(404);
    });

    it("lets the recipient decline the request", async () => {
      const trainer = await user("trainer");
      const client = await user();
      await body(await call(trainer, "/link-requests", "POST", { query: client.email }), 201);
      const req = S.LinkRequestOut.array().parse(
        await body(await call(client, "/link-requests")),
      )[0];
      const recipient = req.direction === "incoming" ? client : trainer;
      expect(
        S.LinkRequestOut.parse(
          await body(await call(recipient, `/link-requests/${req.id}/decline`, "POST")),
        ).status,
      ).toBe("declined");
    });

    // `code` («conflict», «not_found») слишком общий, чтобы по нему выбрать русский
    // текст на экране: сервер остаётся языконезависимым и отдаёт машиночитаемый
    // признак, а формулировку подставляет словарь frontend/src/shared/api/error-reasons.ts.
    it("names the reason when a request to the same person is already pending", async () => {
      const trainer = await user("trainer");
      const client = await user();
      await body(await call(trainer, "/link-requests", "POST", { query: client.email }), 201);
      expect(
        await body(await call(trainer, "/link-requests", "POST", { query: client.email }), 409),
      ).toMatchObject({ details: { reason: "link_request_pending" } });
    });

    it("names the reason when the pair is already linked", async () => {
      const trainer = await user("trainer");
      const client = await user();
      await link(trainer, client);
      expect(
        await body(await call(trainer, "/link-requests", "POST", { query: client.email }), 409),
      ).toMatchObject({ details: { reason: "already_linked" } });
    });

    it("names the reason when no account answers the query", async () => {
      const trainer = await user("trainer");
      expect(
        await body(
          await call(trainer, "/link-requests", "POST", { query: "nobody@example.com" }),
          404,
        ),
      ).toMatchObject({ details: { reason: "account_not_found" } });
    });

    // Тап по СИСТЕМНОМУ пушу разбирает service worker, который знает об уведомлении
    // ровно то, что лежит в payload. Без `notification_id` устройство знает, какой
    // экран открыть, но не какую строку при этом погасить.
    it("carries the id of the notification row in the push payload", async () => {
      const trainer = await user("trainer");
      const client = await user();
      pushed.length = 0;
      await body(await call(trainer, "/link-requests", "POST", { query: client.email }), 201);

      expect(pushed).toHaveLength(1);
      const rows = await environment.db
        .select()
        .from(T.notifications)
        .where(eq(T.notifications.user_id, client.id));
      expect(rows).toHaveLength(1);
      expect(pushed[0]!.data.notification_id).toBe(rows[0]!.id);
    });

    it("lets the sender cancel a request it just created", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const next = S.LinkRequestOut.parse(
        await body(await call(trainer, "/link-requests", "POST", { query: client.email }), 201),
      );
      expect((await call(trainer, `/link-requests/${next.id}`, "DELETE")).status).toBe(204);
    });
  });

  describe("exercise catalog visibility", () => {
    it("hides a trainer exercise from a client with no shared program", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const ex = await exercise(trainer);
      await link(trainer, client);
      expect((await call(client, `/exercises/${ex.id}`)).status).toBe(404);
    });

    it("exposes an exercise as shared once its program is shared", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const ex = await exercise(trainer);
      const p = await program(trainer, ex.id);
      const linked = await link(trainer, client);
      await body(await call(trainer, `/programs/${p.id}/share`, "POST", { client_id: linked.id }));
      expect(
        S.ExerciseOut.parse(await body(await call(client, `/exercises/${ex.id}`))).ownership,
      ).toBe("shared");
    });

    it("refuses to let a client edit an exercise shared with it", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const ex = await exercise(trainer);
      const p = await program(trainer, ex.id);
      const linked = await link(trainer, client);
      await body(await call(trainer, `/programs/${p.id}/share`, "POST", { client_id: linked.id }));
      expect((await call(client, `/exercises/${ex.id}`, "PATCH", { name: "Hijack" })).status).toBe(
        404,
      );
    });

    it("hides a shared exercise from an unrelated user", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const stranger = await user();
      const ex = await exercise(trainer);
      const p = await program(trainer, ex.id);
      const linked = await link(trainer, client);
      await body(await call(trainer, `/programs/${p.id}/share`, "POST", { client_id: linked.id }));
      expect((await call(stranger, `/exercises/${ex.id}`)).status).toBe(404);
    });

    it("hides a deleted exercise from the client it was shared with", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const ex = await exercise(trainer);
      const p = await program(trainer, ex.id);
      const linked = await link(trainer, client);
      await body(await call(trainer, `/programs/${p.id}/share`, "POST", { client_id: linked.id }));
      expect((await call(trainer, `/exercises/${ex.id}`, "DELETE")).status).toBe(204);
      expect((await call(client, `/exercises/${ex.id}`)).status).toBe(404);
    });
  });

  describe("exercise favorites and quota", () => {
    it("lists a favorited shared exercise under the favorites filter", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const ex = await exercise(trainer);
      const p = await program(trainer, ex.id);
      const linked = await link(trainer, client);
      await body(await call(trainer, `/programs/${p.id}/share`, "POST", { client_id: linked.id }));
      await body(await call(client, `/exercises/${ex.id}/favorite?is_favorite=true`, "PUT"));
      expect(
        await body(await call(client, "/exercises?favorites_only=true&limit=1")),
      ).toMatchObject({
        total: 1,
        items: [{ id: ex.id, is_favorite: true }],
      });
    });

    it("rejects a custom exercise beyond the owner quota", async () => {
      const trainer = await user("trainer");
      // The module is configured with customExerciseLimit: 2, so the third create fails.
      await exercise(trainer);
      await exercise(trainer);
      expect(
        (
          await call(trainer, "/exercises", "POST", {
            name: "Over quota",
            category_id: category,
            difficulty: "beginner",
          })
        ).status,
      ).toBe(409);
    });
  });

  describe("exercise media", () => {
    it("rejects an embed url from a look-alike host", async () => {
      const trainer = await user("trainer");
      const ex = await exercise(trainer);
      expect(
        (
          await call(trainer, `/exercises/${ex.id}/media/link`, "POST", {
            kind: "iframe",
            url: "https://youtube.com.evil.example/embed/a",
          })
        ).status,
      ).toBe(422);
    });

    it("removes an accepted embed link", async () => {
      const trainer = await user("trainer");
      const ex = await exercise(trainer);
      const embed = S.ExerciseMediaOut.parse(
        await body(
          await call(trainer, `/exercises/${ex.id}/media/link`, "POST", {
            kind: "iframe",
            url: "https://www.youtube.com/embed/a",
          }),
          201,
        ),
      );
      expect((await call(trainer, `/exercises/${ex.id}/media/${embed.id}`, "DELETE")).status).toBe(
        204,
      );
    });

    it("shows an uploaded image as the exercise preview to a client", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const ex = await exercise(trainer);
      const p = await program(trainer, ex.id);
      const linked = await link(trainer, client);
      await body(await call(trainer, `/programs/${p.id}/share`, "POST", { client_id: linked.id }));
      const form = new FormData();
      form.set("kind", "image");
      form.set("file", new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" }));
      const media = S.ExerciseMediaOut.parse(
        await body(await call(trainer, `/exercises/${ex.id}/media`, "POST", form), 201),
      );
      expect(
        S.ExerciseOut.parse(await body(await call(client, `/exercises/${ex.id}`))).image_url,
      ).toBe(media.url);
    });
  });

  describe("program synchronization", () => {
    const draft = () => ({
      id: crypto.randomUUID(),
      name: "Offline program",
      days: [
        {
          id: crypto.randomUUID(),
          name: "First",
          position: 0,
          slots: [
            {
              id: crypto.randomUUID(),
              position: 0,
              exercises: [
                {
                  id: crypto.randomUUID(),
                  custom_name: "Pushups",
                  sets: 3,
                  reps: 10,
                  variant_order: 0,
                },
              ],
            },
          ],
        },
        { id: crypto.randomUUID(), name: "Unused", position: 1 },
      ],
    });

    it("rejects a program without exercises and creates no empty record", async () => {
      const owner = await user();
      const empty = {
        id: crypto.randomUUID(),
        name: "Empty program",
        days: [{ id: crypto.randomUUID(), name: "Day", position: 0, slots: [] }],
      };
      expect((await call(owner, "/programs", "POST", empty)).status).toBe(422);
      const programs = S.ProgramListItem.array().parse(await body(await call(owner, "/programs")));
      expect(programs.some((item) => item.id === empty.id)).toBe(false);
    });

    it("creates a concurrently replayed program exactly once", async () => {
      const owner = await user();
      const d = draft();
      const created = await Promise.all([
        call(owner, "/programs", "POST", d),
        call(owner, "/programs", "POST", d),
      ]);
      expect(created.map((r) => r.status).sort()).toEqual([200, 201]);
    });

    it("refuses to let another user claim an existing program UUID", async () => {
      const owner = await user();
      const stranger = await user();
      const d = draft();
      await body(await call(owner, "/programs", "POST", d), 201);
      expect((await call(stranger, "/programs", "POST", d)).status).toBe(403);
    });

    it("refuses to recreate a program whose UUID was already deleted", async () => {
      const owner = await user();
      const d = draft();
      const p = S.ProgramOut.parse(await body(await call(owner, "/programs", "POST", d), 201));
      expect((await call(owner, `/programs/${p.id}`, "DELETE")).status).toBe(204);
      expect((await call(owner, "/programs", "POST", d)).status).toBe(409);
    });

    it("hides a deleted program from its owner", async () => {
      const owner = await user();
      const d = draft();
      const p = S.ProgramOut.parse(await body(await call(owner, "/programs", "POST", d), 201));
      expect((await call(owner, `/programs/${p.id}`, "DELETE")).status).toBe(204);
      expect((await call(owner, `/programs/${p.id}`)).status).toBe(404);
    });
  });

  describe("program tree pruning", () => {
    const draft = () => ({
      id: crypto.randomUUID(),
      name: "Offline program",
      days: [
        {
          id: crypto.randomUUID(),
          name: "First",
          position: 0,
          slots: [
            {
              id: crypto.randomUUID(),
              position: 0,
              exercises: [
                {
                  id: crypto.randomUUID(),
                  custom_name: "Pushups",
                  sets: 3,
                  reps: 10,
                  variant_order: 0,
                },
              ],
            },
          ],
        },
        { id: crypto.randomUUID(), name: "Unused", position: 1 },
      ],
    });

    async function replaced() {
      const owner = await user();
      const p = S.ProgramOut.parse(
        await body(await call(owner, "/programs", "POST", draft()), 201),
      );
      await body(await call(owner, "/workouts/sessions/sync", "POST", session(p)), 201);
      const updated = S.ProgramOut.parse(
        await body(
          await call(owner, `/programs/${p.id}`, "PUT", {
            expected_updated_at: p.updated_at,
            name: "Edited",
            days: [
              {
                name: "New",
                position: 0,
                slots: [
                  {
                    position: 0,
                    exercises: [
                      {
                        custom_name: "Squats",
                        sets: 3,
                        reps: 10,
                        variant_order: 0,
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        ),
      );
      const days = await environment.db
        .select()
        .from(T.program_days)
        .where(eq(T.program_days.program_id, p.id));
      return { p, updated, days };
    }

    it("replaces the day list on update", async () => {
      const { updated } = await replaced();
      expect(updated.days).toHaveLength(1);
    });

    it("soft-deletes a day that a recorded workout still references", async () => {
      const { p, days } = await replaced();
      expect(days.find((d) => d.id === p.days[0].id)?.deleted_at).not.toBeNull();
    });

    it("hard-deletes a day that no workout references", async () => {
      const { p, days } = await replaced();
      expect(days.some((d) => d.id === p.days[1].id)).toBe(false);
    });
  });

  describe("program update conflicts", () => {
    const edit = (expected: string, name: string) => ({
      expected_updated_at: expected,
      name,
      days: [
        {
          name: "Day",
          position: 0,
          slots: [
            {
              position: 0,
              exercises: [{ custom_name: "Pushups", sets: 3, reps: 10, variant_order: 0 }],
            },
          ],
        },
      ],
    });

    it("rejects a stale editor without changing the newer program", async () => {
      const owner = await user();
      const original = await program(owner);
      const path = `/programs/${original.id}`;
      const first = S.ProgramOut.parse(
        await body(await call(owner, path, "PUT", edit(original.updated_at, "First edit"))),
      );
      expect(first.updated_at).not.toBe(original.updated_at);

      const stale = await call(owner, path, "PUT", edit(original.updated_at, "Stale edit"));
      expect(stale.status).toBe(409);
      expect((await stale.json()).code).toBe("conflict");
      expect(S.ProgramOut.parse(await body(await call(owner, path))).name).toBe("First edit");

      const fresh = S.ProgramOut.parse(
        await body(await call(owner, path, "PUT", edit(first.updated_at, "Fresh edit"))),
      );
      expect(fresh.name).toBe("Fresh edit");
      expect(fresh.updated_at).not.toBe(first.updated_at);
    });

    it("accepts only one of two simultaneous edits from the same version", async () => {
      const owner = await user();
      const original = await program(owner);
      const path = `/programs/${original.id}`;
      const responses = await Promise.all([
        call(owner, path, "PUT", edit(original.updated_at, "Editor A")),
        call(owner, path, "PUT", edit(original.updated_at, "Editor B")),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      const saved = S.ProgramOut.parse(await body(await call(owner, path)));
      expect(["Editor A", "Editor B"]).toContain(saved.name);
    });

    it("requires the version loaded by the editor", async () => {
      const owner = await user();
      const original = await program(owner);
      const { expected_updated_at: _version, ...withoutVersion } = edit(
        original.updated_at,
        "Edit",
      );
      expect(_version).toBe(original.updated_at);
      expect((await call(owner, `/programs/${original.id}`, "PUT", withoutVersion)).status).toBe(
        422,
      );
    });
  });

  describe("program forgery", () => {
    it("refuses to create a program that references another user's exercise", async () => {
      const owner = await user();
      const attacker = await user();
      const ex = await exercise(owner);
      expect((await call(attacker, "/programs", "POST", forgedProgram(ex.id))).status).toBe(404);
    });

    it("refuses to update a program to reference another user's exercise", async () => {
      const owner = await user();
      const attacker = await user();
      const ex = await exercise(owner);
      const p = await program(attacker);
      expect(
        (
          await call(attacker, `/programs/${p.id}`, "PUT", {
            ...forgedProgram(ex.id),
            expected_updated_at: p.updated_at,
          })
        ).status,
      ).toBe(404);
    });

    it("leaves the program untouched after a rejected forged update", async () => {
      const owner = await user();
      const attacker = await user();
      const ex = await exercise(owner);
      const p = await program(attacker);
      await call(attacker, `/programs/${p.id}`, "PUT", {
        ...forgedProgram(ex.id),
        expected_updated_at: p.updated_at,
      });
      expect(S.ProgramOut.parse(await body(await call(attacker, `/programs/${p.id}`))).name).toBe(
        "Program",
      );
    });
  });

  describe("workout session synchronization", () => {
    it("reloads a finished session summary for its owner and hides it from another account", async () => {
      const owner = await user();
      const stranger = await user();
      const p = await program(owner);
      const saved = S.SessionSummaryOut.parse(
        await body(await call(owner, "/workouts/sessions/sync", "POST", session(p)), 201),
      );
      const path = `/workouts/sessions/${saved.session_id}/summary`;
      expect(S.SessionSummaryOut.parse(await body(await call(owner, path)))).toEqual(saved);
      expect((await call(stranger, path)).status).toBe(404);
      expect((await call(owner, `/workouts/sessions/${crypto.randomUUID()}/summary`)).status).toBe(
        404,
      );
    });

    it("revokes access to a trainer's session summary when the client unlinks", async () => {
      const trainer = await user("trainer");
      const client = await user("client");
      const connection = await link(trainer, client);
      const p = await program(trainer);
      const saved = S.SessionSummaryOut.parse(
        await body(
          await call(
            trainer,
            "/workouts/sessions/sync",
            "POST",
            session(p, "2026-09-09", [20], connection.id),
          ),
          201,
        ),
      );
      const path = `/workouts/sessions/${saved.session_id}/summary`;
      expect((await call(trainer, path)).status).toBe(200);
      await body(await call(client, `/clients/${connection.id}/unlink`, "POST"));
      expect((await call(trainer, path)).status).toBe(404);
    });

    it("creates a concurrently replayed session exactly once", async () => {
      const owner = await user();
      const p = await program(owner);
      const draft = {
        ...session(p),
        started_at: "2026-09-08T21:30:00Z",
        finished_at: "2026-09-08T22:00:00Z",
        local_date: "2026-09-09",
      };
      const first = await Promise.all([
        call(owner, "/workouts/sessions/sync", "POST", draft),
        call(owner, "/workouts/sessions/sync", "POST", draft),
      ]);
      expect(first.map((r) => r.status).sort()).toEqual([200, 201]);
    });

    it("refuses a session referencing a program the caller does not own", async () => {
      const owner = await user();
      const stranger = await user();
      const p = await program(owner);
      expect((await call(stranger, "/workouts/sessions/sync", "POST", session(p))).status).toBe(
        404,
      );
    });

    it("rejects a session dated in the future", async () => {
      const owner = await user();
      const p = await program(owner);
      expect(
        (
          await call(owner, "/workouts/sessions/sync", "POST", {
            ...session(p),
            local_date: "2099-01-01",
          })
        ).status,
      ).toBe(422);
    });

    it("assigns a distinct sequence number to every concurrent session", async () => {
      const owner = await user();
      const p = await program(owner);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => call(owner, "/workouts/sessions/sync", "POST", session(p))),
      );
      const summaries = await Promise.all(
        results.map(async (r) => S.SessionSummaryOut.parse(await body(r, 201))),
      );
      expect(new Set(summaries.map((s) => s.seq_number)).size).toBe(8);
    });

    it("numbers concurrent sessions as a gapless run from the next free number", async () => {
      const owner = await user();
      const p = await program(owner);
      await body(await call(owner, "/workouts/sessions/sync", "POST", session(p)), 201);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => call(owner, "/workouts/sessions/sync", "POST", session(p))),
      );
      const summaries = await Promise.all(
        results.map(async (r) => S.SessionSummaryOut.parse(await body(r, 201))),
      );
      expect(summaries.map((s) => s.seq_number).sort((a, b) => a - b)).toEqual([
        2, 3, 4, 5, 6, 7, 8, 9,
      ]);
    });

    it("groups recorded sets under their local date in exercise history", async () => {
      const owner = await user();
      const p = await program(owner);
      await body(await call(owner, "/workouts/sessions/sync", "POST", session(p)), 201);
      const history = S.ExerciseHistoryOut.parse(
        await body(
          await call(owner, `/workouts/history/by-variant/${p.days[0].slots[0].exercises[0].id}`),
        ),
      );
      expect(history.days.map((d) => d.date)).toEqual(["2026-09-09"]);
    });
  });

  describe("workout reference forgery", () => {
    it("refuses a session pointing at another user's program", async () => {
      const owner = await user();
      const attacker = await user();
      const privateProgram = await program(owner);
      expect(
        (await call(attacker, "/workouts/sessions/sync", "POST", session(privateProgram))).status,
      ).toBe(404);
    });

    it("refuses a session whose day belongs to another user's program", async () => {
      const owner = await user();
      const attacker = await user();
      const privateProgram = await program(owner);
      const ownProgram = await program(attacker);
      const wrongDay = { ...session(ownProgram), day_id: privateProgram.days[0].id };
      expect((await call(attacker, "/workouts/sessions/sync", "POST", wrongDay)).status).toBe(404);
    });

    it("refuses a session whose sets point at another user's slots", async () => {
      const owner = await user();
      const attacker = await user();
      const privateProgram = await program(owner);
      const ownProgram = await program(attacker);
      const wrongSet = { ...session(ownProgram), sets: session(privateProgram).sets };
      expect((await call(attacker, "/workouts/sessions/sync", "POST", wrongSet)).status).toBe(404);
    });

    it("refuses a session whose exercise selection points at another user's slots", async () => {
      const owner = await user();
      const attacker = await user();
      const privateProgram = await program(owner);
      const ownProgram = await program(attacker);
      const wrongSelection = {
        ...session(ownProgram),
        exercises: session(privateProgram).exercises,
      };
      expect((await call(attacker, "/workouts/sessions/sync", "POST", wrongSelection)).status).toBe(
        404,
      );
    });

    it("writes no sets for an attacker whose forged sessions were all rejected", async () => {
      const owner = await user();
      const attacker = await user();
      const privateProgram = await program(owner);
      const ownProgram = await program(attacker);
      for (const forged of [
        session(privateProgram),
        { ...session(ownProgram), day_id: privateProgram.days[0].id },
        { ...session(ownProgram), sets: session(privateProgram).sets },
        { ...session(ownProgram), exercises: session(privateProgram).exercises },
      ])
        await call(attacker, "/workouts/sessions/sync", "POST", forged);
      expect(
        await environment.db
          .select()
          .from(T.workout_sessions)
          .where(eq(T.workout_sessions.self_user_id, attacker.id)),
      ).toHaveLength(0);
    });

    it("hides another user's exercise history from an attacker", async () => {
      const owner = await user();
      const attacker = await user();
      const privateProgram = await program(owner);
      expect(
        (
          await call(
            attacker,
            `/workouts/history/by-variant/${privateProgram.days[0].slots[0].exercises[0].id}`,
          )
        ).status,
      ).toBe(404);
    });

    it("refuses a trainer recording a session for a client it is not linked to", async () => {
      const owner = await user();
      const trainer = await user("trainer");
      const otherTrainer = await user("trainer");
      const privateProgram = await program(owner);
      const linked = await link(trainer, owner);
      expect(
        (
          await call(
            otherTrainer,
            "/workouts/sessions/sync",
            "POST",
            session(privateProgram, "2026-09-09", [20], linked.id),
          )
        ).status,
      ).toBe(404);
    });

    it("accepts a session the linked trainer records for its client", async () => {
      const owner = await user();
      const trainer = await user("trainer");
      const privateProgram = await program(owner);
      const linked = await link(trainer, owner);
      await body(
        await call(
          trainer,
          "/workouts/sessions/sync",
          "POST",
          session(privateProgram, "2026-09-09", [20], linked.id),
        ),
        201,
      );
    });
  });

  describe("measurement conflicts", () => {
    it("rejects measurements outside database bounds for both creation and update", async () => {
      const owner = await user();
      const m = await measurement(owner, "2026-08-17", 80);
      for (const weight of [-1, 10000, 9999.99]) {
        expect(
          (await call(owner, "/measurements", "POST", { date: "2026-08-18", weight })).status,
        ).toBe(422);
        expect(
          (await call(owner, `/measurements/${m.id}`, "PUT", { date: "2026-08-17", weight }))
            .status,
        ).toBe(422);
      }
      const unchanged = await body(await call(owner, `/measurements/${m.id}`));
      expect(unchanged.weight).toBe(80);
    });
    it("creates a concurrently replayed measurement exactly once", async () => {
      const owner = await user();
      const draft = { id: crypto.randomUUID(), date: "2026-09-09", weight: 80 };
      const results = await Promise.all([
        call(owner, "/measurements", "POST", draft),
        call(owner, "/measurements", "POST", draft),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    });

    it("names the existing row when a second measurement takes a taken date", async () => {
      const owner = await user();
      const m = S.MeasurementOut.parse(
        await body(
          await call(owner, "/measurements", "POST", { date: "2026-09-09", weight: 80 }),
          201,
        ),
      );
      expect(
        await body(
          await call(owner, "/measurements", "POST", { date: "2026-09-09", weight: 81 }),
          409,
        ),
      ).toMatchObject({
        code: "measurement_date_conflict",
        details: { existing_id: m.id, date: "2026-09-09" },
      });
    });

    it("refuses a measurement carrying another user's UUID", async () => {
      const owner = await user();
      const stranger = await user();
      const draft = { id: crypto.randomUUID(), date: "2026-09-09", weight: 80 };
      await body(await call(owner, "/measurements", "POST", draft), 201);
      expect((await call(stranger, "/measurements", "POST", draft)).status).toBe(403);
    });

    it("lets only one of two same-date measurements win", async () => {
      const owner = await user();
      const different = await Promise.all([
        call(owner, "/measurements", "POST", { date: "2026-09-08", weight: 70 }),
        call(owner, "/measurements", "POST", { date: "2026-09-08", weight: 71 }),
      ]);
      expect(different.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it("tells the loser of a same-date race which row won", async () => {
      const owner = await user();
      const different = await Promise.all([
        call(owner, "/measurements", "POST", { date: "2026-09-08", weight: 70 }),
        call(owner, "/measurements", "POST", { date: "2026-09-08", weight: 71 }),
      ]);
      // The loser of a same-date race must still be told which row won, so an offline
      // client can merge instead of retrying forever against a generic conflict.
      const loser = different.find((r) => r.status === 409)!;
      const winner = different.find((r) => r.status === 201)!;
      expect(await loser.json()).toMatchObject({
        code: "measurement_date_conflict",
        details: { existing_id: (await winner.json()).id, date: "2026-09-08" },
      });
    });

    it("rejects a measurement carrying no values at all", async () => {
      const owner = await user();
      expect((await call(owner, "/measurements", "POST", { date: "2026-09-07" })).status).toBe(422);
    });

    it("names the existing row when an update moves a measurement onto a taken date", async () => {
      const owner = await user();
      const first = S.MeasurementOut.parse(
        await body(
          await call(owner, "/measurements", "POST", { date: "2026-09-01", weight: 80 }),
          201,
        ),
      );
      const second = S.MeasurementOut.parse(
        await body(
          await call(owner, "/measurements", "POST", { date: "2026-09-02", weight: 79 }),
          201,
        ),
      );
      expect(
        await body(
          await call(owner, `/measurements/${second.id}`, "PUT", { date: "2026-09-01", waist: 90 }),
          409,
        ),
      ).toMatchObject({
        code: "measurement_date_conflict",
        details: { existing_id: first.id, date: "2026-09-01" },
      });
    });

    it("replaces every field of a measurement on update", async () => {
      const owner = await user();
      const second = S.MeasurementOut.parse(
        await body(
          await call(owner, "/measurements", "POST", { date: "2026-09-02", weight: 79 }),
          201,
        ),
      );
      expect(
        S.MeasurementOut.parse(
          await body(
            await call(owner, `/measurements/${second.id}`, "PUT", {
              date: "2026-09-03",
              waist: 90,
            }),
          ),
        ),
      ).toMatchObject({ date: "2026-09-03", waist: 90, weight: null });
    });

    it("rejects a custom field slot outside the allowed range", async () => {
      const owner = await user();
      expect(
        (
          await call(owner, "/measurements/custom-fields/4", "PUT", {
            name: "Invalid slot",
            unit: "cm",
          })
        ).status,
      ).toBe(422);
    });
  });

  describe("measurement photos", () => {
    it("serves private photo bytes only to the measurement owner", async () => {
      const owner = await user();
      const stranger = await user();
      const m = await measurement(owner, "2026-09-09", 80);
      const signedBefore = signed.length;
      const uploaded = S.MeasurementPhotoOut.parse(await uploadPhoto(owner, m.id, "front"));
      const url = `/measurements/${m.id}/photos/front/content`;
      expect(uploaded.url).toBe(`/api/v1${url}`);
      expect(signed.length).toBe(signedBefore);
      const response = await call(owner, url);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
      expect((await call(stranger, url)).status).toBe(404);
      expect((await app.request(`/api/v1${url}`)).status).toBe(401);
    });

    it("attaches an uploaded photo to its measurement", async () => {
      const owner = await user();
      const m = await measurement(owner, "2026-09-09", 80);
      await uploadPhoto(owner, m.id, "front");
      expect(
        S.MeasurementOut.parse(await body(await call(owner, `/measurements/${m.id}`))).photos,
      ).toHaveLength(1);
    });

    it("omits client photos from the trainer measurement list", async () => {
      const owner = await user();
      const trainer = await user("trainer");
      const m = await measurement(owner, "2026-09-09", 80);
      await uploadPhoto(owner, m.id, "front");
      const linked = await link(trainer, owner);
      expect(await body(await call(trainer, `/measurements?client_id=${linked.id}`))).toMatchObject(
        { items: [{ id: m.id, photos: [] }] },
      );
    });

    it("signs no photo url while serving the trainer measurement list", async () => {
      const owner = await user();
      const trainer = await user("trainer");
      const m = await measurement(owner, "2026-09-09", 80);
      await uploadPhoto(owner, m.id, "front");
      const linked = await link(trainer, owner);
      // `signed` accumulates across the file, so compare against the count taken here.
      const signedBefore = signed.length;
      await body(await call(trainer, `/measurements?client_id=${linked.id}`));
      expect(signed.length).toBe(signedBefore);
    });

    it("refuses a trainer reading its client's photo dates", async () => {
      const owner = await user();
      const trainer = await user("trainer");
      const linked = await link(trainer, owner);
      expect(
        (await call(trainer, `/analytics/photos/dates?kind=front&client_id=${linked.id}`)).status,
      ).toBe(403);
    });

    it("hides a measurement from an unrelated user", async () => {
      const owner = await user();
      const stranger = await user();
      const m = await measurement(owner, "2026-09-09", 80);
      expect((await call(stranger, `/measurements/${m.id}`)).status).toBe(404);
    });

    it("deletes a photo of a kind from its measurement", async () => {
      const owner = await user();
      const m = await measurement(owner, "2026-09-09", 80);
      await uploadPhoto(owner, m.id, "front");
      expect((await call(owner, `/measurements/${m.id}/photos/front`, "DELETE")).status).toBe(204);
    });

    it("deletes a measurement that still carries photos", async () => {
      const owner = await user();
      const m = await measurement(owner, "2026-09-09", 80);
      await uploadPhoto(owner, m.id, "front");
      expect((await call(owner, `/measurements/${m.id}`, "DELETE")).status).toBe(204);
    });

    it("removes the stored objects of a deleted measurement", async () => {
      const owner = await user();
      const m = await measurement(owner, "2026-09-01", 80);
      await uploadPhoto(owner, m.id, "front");
      expect((await call(owner, `/measurements/${m.id}`, "DELETE")).status).toBe(204);
      expect([...uploads.keys()].some((key) => key.includes(m.id))).toBe(false);
    });
  });

  describe("photo comparison", () => {
    async function withPhotos() {
      const owner = await user();
      const first = await measurement(owner, "2026-09-01", 80);
      const second = await measurement(owner, "2026-09-03", 79);
      for (const id of [first.id, second.id]) await uploadPhoto(owner, id, "front");
      return { owner, first, second };
    }

    it("lists the dates that carry a photo of the requested kind", async () => {
      const { owner } = await withPhotos();
      expect(
        S.PhotoDatesOut.parse(await body(await call(owner, "/analytics/photos/dates?kind=front")))
          .dates,
      ).toEqual(["2026-09-01", "2026-09-03"]);
    });

    it("resolves the earlier date of a comparison to its own photo", async () => {
      const { owner, first } = await withPhotos();
      const comparison = S.PhotoComparisonOut.parse(
        await body(
          await call(
            owner,
            "/analytics/photos/compare?kind=front&first_date=2026-09-01&second_date=2026-09-03",
          ),
        ),
      );
      expect(comparison.first.url).toContain(first.id);
    });

    it("resolves the later date of a comparison to its own photo", async () => {
      const { owner, second } = await withPhotos();
      const comparison = S.PhotoComparisonOut.parse(
        await body(
          await call(
            owner,
            "/analytics/photos/compare?kind=front&first_date=2026-09-01&second_date=2026-09-03",
          ),
        ),
      );
      expect(comparison.second.url).toContain(second.id);
    });

    it("refuses a comparison of a kind with no photos", async () => {
      const { owner } = await withPhotos();
      expect(
        (
          await call(
            owner,
            "/analytics/photos/compare?kind=back&first_date=2026-09-01&second_date=2026-09-03",
          )
        ).status,
      ).toBe(404);
    });
  });

  describe("revoked trainer access", () => {
    it("rejects the former trainer's measurement and analytics reads after unlink", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const linked = await link(trainer, client);
      const own = await measurement(client, "2026-09-10", 77);
      await body(
        await call(client, "/measurements/custom-fields/1", "PUT", { name: "Bodyfat", unit: "%" }),
      );
      const series = `/analytics/anthropometry/series?client_id=${linked.id}&date_from=2026-09-01&date_to=2026-09-30&parameters=weight`;
      const workouts = `/analytics/workouts/series?client_id=${linked.id}&date_from=2026-09-01&date_to=2026-09-30`;
      const reads = [
        `/measurements?client_id=${linked.id}`,
        `/measurements/custom-fields?client_id=${linked.id}`,
        series,
        workouts,
      ];
      for (const path of reads) expect((await call(trainer, path)).status).toBe(200);
      expect((await call(trainer, `/measurements/${own.id}`)).status).toBe(404);

      await body(await call(client, `/clients/${linked.id}/unlink`, "POST"));
      for (const path of reads) expect((await call(trainer, path)).status).toBe(404);
      // The owner keeps access to the same measurement after the relationship ends.
      expect((await call(client, `/measurements/${own.id}`)).status).toBe(200);
    });
  });

  describe("trainer access windows", () => {
    async function windowed() {
      const trainer = await user("trainer");
      const other = await user("trainer");
      const client = await user();
      const linked = await link(trainer, client);
      const p = await program(trainer);
      await environment.db
        .update(T.trainer_client_periods)
        .set({
          start_date: new Date("2026-09-01T00:00:00Z"),
          end_date: new Date("2026-09-09T12:00:00Z"),
        })
        .where(eq(T.trainer_client_periods.trainer_client_id, linked.id));
      return { trainer, other, client, linked, p };
    }

    it("shows a linked client's independent workout from a shared program only within the link period", async () => {
      const trainer = await user("trainer");
      const other = await user("trainer");
      const client = await user();
      const oldProgram = await program(client);
      await body(
        await call(
          client,
          "/workouts/sessions/sync",
          "POST",
          session(oldProgram, "2026-09-08", [22]),
        ),
        201,
      );

      const linked = await link(trainer, client);
      const catalogExercise = await exercise(trainer);
      const source = await program(trainer, catalogExercise.id);
      const shared = S.ProgramListItem.parse(
        await body(
          await call(trainer, `/programs/${source.id}/share`, "POST", { client_id: linked.id }),
        ),
      );
      const copy = S.ProgramOut.parse(await body(await call(client, `/programs/${shared.id}`)));
      const draft = session(copy, "2026-09-10", [57]);
      draft.sets[0].reps = 9;
      await body(await call(client, "/workouts/sessions/sync", "POST", draft), 201);

      const path = `/analytics/workouts/series?client_id=${linked.id}&date_from=2026-09-01&date_to=2026-09-30`;
      const series = S.WorkoutSeriesOut.parse(await body(await call(trainer, path)));
      expect(series.stats.total_workouts).toBe(1);
      expect(series.points).toMatchObject([{ date: "2026-09-10", weight: 57, reps: 9 }]);
      const listed = S.ClientsListOut.parse(await body(await call(trainer, "/clients")));
      expect(listed.items.find((item) => item.id === linked.id)).toMatchObject({
        workout_count: 1,
        last_activity_at: "2026-09-10T10:00:00.000Z",
      });
      expect((await call(other, path)).status).toBe(404);

      const variant = copy.days[0].slots[0].exercises[0].id;
      const history = S.ExerciseHistoryOut.parse(
        await body(
          await call(trainer, `/workouts/history/by-variant/${variant}?client_id=${linked.id}`),
        ),
      );
      expect(history.days).toMatchObject([
        { date: "2026-09-10", entries: [{ weight: 57, reps: 9 }] },
      ]);

      await body(await call(client, `/clients/${linked.id}/unlink`, "POST"));
      expect((await call(trainer, path)).status).toBe(404);
      expect(
        (await call(trainer, `/workouts/history/by-variant/${variant}?client_id=${linked.id}`))
          .status,
      ).toBe(404);
    });

    it("counts only the workouts inside the relationship period", async () => {
      const { trainer, linked, p } = await windowed();
      for (const hour of ["09", "12", "13"]) {
        const draft = session(p, "2026-09-09", [20], linked.id);
        draft.started_at = `2026-09-09T${hour}:00:00Z`;
        await body(await call(trainer, "/workouts/sessions/sync", "POST", draft), 201);
      }
      expect(
        S.WorkoutSeriesOut.parse(
          await body(
            await call(
              trainer,
              `/analytics/workouts/series?client_id=${linked.id}&date_from=2026-09-01&date_to=2026-09-30`,
            ),
          ),
        ).stats.total_workouts,
      ).toBe(1);
    });

    it("hides a client's workout series from an unrelated trainer", async () => {
      const { other, linked } = await windowed();
      expect(
        (
          await call(
            other,
            `/analytics/workouts/series?client_id=${linked.id}&date_from=2026-09-01&date_to=2026-09-30`,
          )
        ).status,
      ).toBe(404);
    });

    it("includes the full numerical history while the relationship is active", async () => {
      const { trainer, client, linked } = await windowed();
      await body(
        await call(client, "/measurements", "POST", { date: "2026-09-09", weight: 80 }),
        201,
      );
      await body(
        await call(client, "/measurements", "POST", { date: "2026-09-10", weight: 81 }),
        201,
      );
      expect(await body(await call(trainer, `/measurements?client_id=${linked.id}`))).toMatchObject(
        { total: 2, items: [{ date: "2026-09-10" }, { date: "2026-09-09" }] },
      );
    });

    it("exposes the client's custom field labels to its trainer", async () => {
      const { trainer, client, linked } = await windowed();
      await body(
        await call(client, "/measurements/custom-fields/1", "PUT", { name: "Bodyfat", unit: "%" }),
      );
      expect(
        await body(await call(trainer, `/measurements/custom-fields?client_id=${linked.id}`)),
      ).toEqual([{ slot: 1, name: "Bodyfat", unit: "%" }]);
    });

    it("hides the client's custom field labels from an unrelated trainer", async () => {
      const { other, linked } = await windowed();
      expect((await call(other, `/measurements/custom-fields?client_id=${linked.id}`)).status).toBe(
        404,
      );
    });
  });

  describe("workout analytics", () => {
    async function recorded() {
      const owner = await user();
      const ex = await exercise(owner);
      const p = await program(owner, ex.id);
      for (const [day, weights] of [
        ["2026-09-08", [10, 30]],
        ["2026-09-09", [40]],
        ["2026-09-09", [60]],
      ] as const)
        await body(
          await call(owner, "/workouts/sessions/sync", "POST", session(p, day, [...weights])),
          201,
        );
      return { owner, ex };
    }

    it("aggregates multiple sessions of one local day into a single point", async () => {
      const { owner, ex } = await recorded();
      const series = S.WorkoutSeriesOut.parse(
        await body(
          await call(
            owner,
            `/analytics/workouts/series?date_from=2026-09-01&date_to=2026-09-30&exercise_id=${ex.id}`,
          ),
        ),
      );
      expect(series).toMatchObject({
        points: [
          { date: "2026-09-08", weight: 20, sets: 2 },
          { date: "2026-09-09", weight: 50, sets: 2 },
        ],
        stats: { total_workouts: 3, avg_weight: 35 },
      });
    });

    /**
     * A program whose single day holds TWO exercises, each in its own slot — the
     * shape the analytics screen charts one card per. The generic `program()`
     * helper builds a one-slot day, which cannot show a per-exercise split.
     */
    async function twoExerciseDay() {
      const owner = await user();
      const bench = await exercise(owner);
      const squat = S.ExerciseOut.parse(
        await body(
          await call(owner, "/exercises", "POST", {
            name: "Squat",
            category_id: category,
            difficulty: "beginner",
          }),
          201,
        ),
      );
      const dayId = crypto.randomUUID();
      const slots = [bench, squat].map((ex, position) => ({
        id: crypto.randomUUID(),
        position,
        exercises: [
          {
            id: crypto.randomUUID(),
            exercise_id: ex.id,
            sets: 3,
            reps: 10,
            variant_order: 0,
          },
        ],
      }));
      const p = S.ProgramOut.parse(
        await body(
          await call(owner, "/programs", "POST", {
            id: crypto.randomUUID(),
            name: "Program",
            days: [{ id: dayId, name: "Day", position: 0, slots }],
          }),
          201,
        ),
      );
      // One session, two exercises: bench at 100kg, squat at 50kg on the same day.
      const day = "2026-09-09";
      const built = p.days[0].slots.map((slot, i) => ({
        slot,
        variant: slot.exercises[0],
        weight: i === 0 ? 100 : 50,
      }));
      await body(
        await call(owner, "/workouts/sessions/sync", "POST", {
          id: crypto.randomUUID(),
          program_id: p.id,
          day_id: p.days[0].id,
          client_id: null,
          started_at: `${day}T10:00:00Z`,
          finished_at: `${day}T10:30:00Z`,
          local_date: day,
          exercises: built.map((b) => ({
            slot_id: b.slot.id,
            chosen_variant_id: b.variant.id,
            is_completed: true,
          })),
          sets: built.map((b, index) => ({
            id: crypto.randomUUID(),
            slot_id: b.slot.id,
            variant_id: b.variant.id,
            weight: b.weight,
            reps: 10,
            performed_at: `${day}T10:0${index + 1}:00Z`,
          })),
        }),
        201,
      );
      return { owner, bench, squat, program: p };
    }

    it("splits a day's exercises into one series each", async () => {
      const { owner, bench, squat } = await twoExerciseDay();
      const out = S.WorkoutSeriesByExerciseOut.parse(
        await body(
          await call(
            owner,
            "/analytics/workouts/series-by-exercise?date_from=2026-09-01&date_to=2026-09-30",
          ),
        ),
      );
      // The ungrouped endpoint averages these two lifts into a single 75kg point;
      // grouped, each exercise keeps its own weight.
      expect(
        [...out.exercises]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((e) => ({ id: e.exercise_id, name: e.name, weight: e.points[0]?.weight })),
      ).toEqual([
        { id: bench.id, name: "Bench press", weight: 100 },
        { id: squat.id, name: "Squat", weight: 50 },
      ]);
    });

    it("counts a session once per exercise it contains", async () => {
      const { owner } = await twoExerciseDay();
      const out = S.WorkoutSeriesByExerciseOut.parse(
        await body(
          await call(
            owner,
            "/analytics/workouts/series-by-exercise?date_from=2026-09-01&date_to=2026-09-30",
          ),
        ),
      );
      // One session holding both exercises: each series saw it once.
      expect(out.exercises.map((e) => e.stats.total_workouts)).toEqual([1, 1]);
    });

    it("narrows the per-exercise split to one exercise when asked", async () => {
      const { owner, bench } = await twoExerciseDay();
      const out = S.WorkoutSeriesByExerciseOut.parse(
        await body(
          await call(
            owner,
            `/analytics/workouts/series-by-exercise?date_from=2026-09-01&date_to=2026-09-30&exercise_id=${bench.id}`,
          ),
        ),
      );
      expect(out.exercises.map((e) => e.name)).toEqual(["Bench press"]);
    });

    it("counts this month's workouts on the dashboard", async () => {
      const { owner } = await recorded();
      const dashboard = S.DashboardOut.parse(await body(await call(owner, "/analytics/dashboard")));
      expect(dashboard.month_workout_count).toBe(3);
    });

    it("reports the heaviest set as the personal record", async () => {
      const { owner, ex } = await recorded();
      const dashboard = S.DashboardOut.parse(await body(await call(owner, "/analytics/dashboard")));
      expect(dashboard).toMatchObject({ personal_record: { exercise_id: ex.id, weight: 60 } });
    });

    it("charts the daily best weight and its change on the dashboard", async () => {
      const { owner } = await recorded();
      const dashboard = S.DashboardOut.parse(await body(await call(owner, "/analytics/dashboard")));
      expect(dashboard).toMatchObject({
        strength_chart: {
          points: [
            { date: "2026-09-08", value: 30 },
            { date: "2026-09-09", value: 60 },
          ],
          change_percent: 100,
        },
      });
    });

    it("marks the days of the dashboard week that carry a personal workout", async () => {
      const { owner } = await recorded();
      const dashboard = S.DashboardOut.parse(await body(await call(owner, "/analytics/dashboard")));
      expect(dashboard.week.find((d) => d.date === "2026-09-09")?.has_personal_workout).toBe(true);
    });

    it("offers only the exercises the caller has actually lifted", async () => {
      const { owner, ex } = await recorded();
      const list = S.StrengthExercisesOut.parse(
        await body(await call(owner, "/analytics/strength-exercises")),
      );
      expect(list.items).toEqual([{ exercise_id: ex.id, exercise_name: ex.name }]);
    });

    it("keeps one user's strength exercises out of another's picker", async () => {
      await recorded();
      // A second account with no workouts of its own must see an empty picker
      // rather than the first account's exercises.
      const stranger = await user();
      const list = S.StrengthExercisesOut.parse(
        await body(await call(stranger, "/analytics/strength-exercises")),
      );
      expect(list.items).toEqual([]);
    });
  });

  describe("anthropometry analytics", () => {
    it("computes a custom parameter series alongside the requested built-in one", async () => {
      const owner = await user();
      await body(
        await call(owner, "/measurements/custom-fields/1", "PUT", { name: "Bodyfat", unit: "%" }),
      );
      for (const [date, weight, value] of [
        ["2026-09-08", 80, 20],
        ["2026-09-09", 78, 18],
      ] as const)
        await body(
          await call(owner, "/measurements", "POST", {
            date,
            weight,
            custom_values: [{ slot: 1, name: "Bodyfat", unit: "%", value }],
          }),
          201,
        );
      const custom = S.AnthropometrySeriesOut.parse(
        await body(
          await call(
            owner,
            "/analytics/anthropometry/series?date_from=2026-09-01&date_to=2026-09-30&parameters=weight&custom_slots=1",
          ),
        ),
      );
      expect(custom.parameters).toHaveLength(2);
      expect(custom.parameters[1]).toMatchObject({
        custom_slot: 1,
        name: "Bodyfat",
        stats: { min: 18, avg: 19, max: 20, change_percent: -10 },
      });
    });
  });

  describe("calendar events", () => {
    it("refuses an event referencing another trainer's client", async () => {
      const trainer = await user("trainer");
      const other = await user("trainer");
      const client = await card(trainer);
      expect(
        (
          await call(other, "/calendar/events", "POST", {
            date: "2026-09-09",
            time: "12:00",
            client_ids: [client.id],
          })
        ).status,
      ).toBe(404);
    });

    it("rejects an event carrying an impossible time", async () => {
      const trainer = await user("trainer");
      expect(
        (await call(trainer, "/calendar/events", "POST", { date: "2026-09-09", time: "99:99" }))
          .status,
      ).toBe(422);
    });

    it("deduplicates a client repeated in one booking", async () => {
      const trainer = await user("trainer");
      const client = await card(trainer);
      const event = S.EventOut.parse(
        await body(
          await call(trainer, "/calendar/events", "POST", {
            date: "2026-09-09",
            time: "12:00",
            client_ids: [client.id, client.id],
          }),
          201,
        ),
      );
      expect(event.clients).toHaveLength(1);
    });

    it("shows the assigned program to both trainer and linked client", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const linked = await link(trainer, client);
      const assigned = await program(trainer);
      const event = S.EventOut.parse(
        await body(
          await call(trainer, "/calendar/events", "POST", {
            date: "2026-09-10",
            time: "18:00",
            client_ids: [linked.id],
            program_id: assigned.id,
          }),
          201,
        ),
      );
      expect(event).toMatchObject({ program_id: assigned.id, program_name: assigned.name });
      for (const viewer of [trainer, client]) {
        const month = S.CalendarMonthOut.parse(
          await body(await call(viewer, "/calendar/month?year=2026&month=9")),
        );
        expect(month.events.find((entry) => entry.id === event.id)).toMatchObject({
          program_id: assigned.id,
          program_name: assigned.name,
        });
      }
    });

    it("refuses assigning another user's program and allows clearing an assignment", async () => {
      const owner = await user();
      const stranger = await user();
      const assigned = await program(owner);
      expect(
        (
          await call(stranger, "/calendar/events", "POST", {
            date: "2026-09-10",
            time: "18:00",
            program_id: assigned.id,
          })
        ).status,
      ).toBe(404);
      const event = S.EventOut.parse(
        await body(
          await call(owner, "/calendar/events", "POST", {
            date: "2026-09-10",
            time: "18:00",
            program_id: assigned.id,
          }),
          201,
        ),
      );
      const cleared = S.EventOut.parse(
        await body(await call(owner, `/calendar/events/${event.id}`, "PUT", { program_id: null })),
      );
      expect(cleared).toMatchObject({ program_id: null, program_name: null });
    });

    // Часы тестов стоят на 2026-09-09 (см. `now` вверху файла), поэтому
    // 2026-09-08 — вчера, а 2026-09-10 — завтра.
    it("refuses a personal booking on a day that has passed", async () => {
      const owner = await user();
      expect(
        (await call(owner, "/calendar/events", "POST", { date: "2026-09-08", time: "12:00" }))
          .status,
      ).toBe(422);
    });

    it("refuses a client booking on a day that has passed", async () => {
      const trainer = await user("trainer");
      const client = await card(trainer);
      expect(
        (
          await call(trainer, "/calendar/events", "POST", {
            date: "2026-09-08",
            time: "12:00",
            client_ids: [client.id],
          })
        ).status,
      ).toBe(422);
    });

    it("still allows a booking later today", async () => {
      const owner = await user();
      // Сегодняшний день не прошёл: вечерняя тренировка ещё впереди.
      await body(
        await call(owner, "/calendar/events", "POST", { date: "2026-09-09", time: "23:00" }),
        201,
      );
    });

    it("refuses moving a future booking into the past", async () => {
      const owner = await user();
      const event = S.EventOut.parse(
        await body(
          await call(owner, "/calendar/events", "POST", { date: "2026-09-10", time: "12:00" }),
          201,
        ),
      );
      expect(
        (await call(owner, `/calendar/events/${event.id}`, "PUT", { date: "2026-09-08" })).status,
      ).toBe(422);
    });

    it("still allows cancelling a booking whose day has passed", async () => {
      const owner = await user();
      const event = S.EventOut.parse(
        await body(
          await call(owner, "/calendar/events", "POST", { date: "2026-09-10", time: "12:00" }),
          201,
        ),
      );
      // Время идёт: запись становится прошедшей, но убрать невыполненный план
      // из календаря по-прежнему можно — это единственный способ.
      const restore = now;
      now = "2026-09-20T12:00:00.000Z";
      try {
        expect((await call(owner, `/calendar/events/${event.id}`, "DELETE")).status).toBe(204);
      } finally {
        now = restore;
      }
    });

    it("turns an event into a personal one when its last client is removed", async () => {
      const trainer = await user("trainer");
      const client = await card(trainer);
      const event = S.EventOut.parse(
        await body(
          await call(trainer, "/calendar/events", "POST", {
            date: "2026-09-09",
            time: "12:00",
            client_ids: [client.id],
          }),
          201,
        ),
      );
      const updated = S.EventOut.parse(
        await body(
          await call(trainer, `/calendar/events/${event.id}`, "PUT", {
            client_ids: [],
            time: "13:00",
          }),
        ),
      );
      expect(updated.type).toBe("personal");
      expect(updated.clients).toHaveLength(0);
    });
  });

  describe("calendar visibility for the booked client", () => {
    /** Тренер записывает связанного клиента на будущий день. */
    async function booked() {
      const trainer = await user("trainer");
      const client = await user();
      const linked = await link(trainer, client);
      const event = S.EventOut.parse(
        await body(
          await call(trainer, "/calendar/events", "POST", {
            date: "2026-09-10",
            time: "12:00",
            client_ids: [linked.id],
          }),
          201,
        ),
      );
      return { trainer, client, linked, event };
    }

    it("shows the client a session their trainer booked for them", async () => {
      const { client, event } = await booked();
      const month = S.CalendarMonthOut.parse(
        await body(await call(client, "/calendar/month?year=2026&month=9")),
      );
      expect(month.events.map((e) => e.id)).toContain(event.id);
    });

    it("names the event owner so the client sees their trainer", async () => {
      const { trainer, client, event } = await booked();
      const month = S.CalendarMonthOut.parse(
        await body(await call(client, "/calendar/month?year=2026&month=9")),
      );
      expect(month.events.find((e) => e.id === event.id)?.owner_name).toBe(`Name ${trainer.id}`);
    });

    it("removes a cancelled booking from both sides' active counts", async () => {
      const { trainer, client, event } = await booked();
      expect((await call(trainer, `/calendar/events/${event.id}`, "DELETE")).status).toBe(204);
      for (const viewer of [trainer, client]) {
        const month = S.CalendarMonthOut.parse(
          await body(await call(viewer, "/calendar/month?year=2026&month=9")),
        );
        expect(month.events.find((e) => e.id === event.id)?.status).toBe("cancelled");
        expect(month.stats).toMatchObject({
          with_clients: 0,
          planned: 0,
          unique_clients: 0,
        });
      }
    });

    it("marks the booked day on the client's home week strip", async () => {
      const { client } = await booked();
      const dashboard = S.DashboardOut.parse(
        await body(await call(client, "/analytics/dashboard")),
      );
      // 2026-09-10 лежит в той же неделе, что и «сегодня» теста (09-09).
      expect(dashboard.week.find((d) => d.date === "2026-09-10")?.has_client_workout).toBe(true);
    });

    it("keeps the session out of an unrelated user's calendar", async () => {
      const { event } = await booked();
      const stranger = await user();
      const month = S.CalendarMonthOut.parse(
        await body(await call(stranger, "/calendar/month?year=2026&month=9")),
      );
      expect(month.events.map((e) => e.id)).not.toContain(event.id);
    });
  });

  describe("calendar cancellation", () => {
    async function cancelled() {
      const trainer = await user("trainer");
      const client = await card(trainer);
      const event = S.EventOut.parse(
        await body(
          await call(trainer, "/calendar/events", "POST", {
            date: "2026-09-09",
            time: "12:00",
            client_ids: [client.id],
          }),
          201,
        ),
      );
      expect((await call(trainer, `/calendar/events/${event.id}`, "DELETE")).status).toBe(204);
      return { trainer, event };
    }

    it("marks a deleted event as cancelled in the month view", async () => {
      const { trainer } = await cancelled();
      const month = S.CalendarMonthOut.parse(
        await body(await call(trainer, "/calendar/month?year=2026&month=9")),
      );
      expect(month.events[0].status).toBe("cancelled");
    });

    it("excludes a cancelled event from the planned count", async () => {
      const { trainer } = await cancelled();
      const month = S.CalendarMonthOut.parse(
        await body(await call(trainer, "/calendar/month?year=2026&month=9")),
      );
      expect(month.stats.planned).toBe(0);
    });

    it("keeps the cancelled event row in the database", async () => {
      const { event } = await cancelled();
      expect(
        (
          await environment.db.execute(
            sql`select count(*)::int count from calendar_events where id=${event.id}`,
          )
        ).rows[0].count,
      ).toBe(1);
    });
  });

  describe("calendar auto-completion", () => {
    it("does not complete a booking for a different program", async () => {
      const owner = await user();
      const assigned = await program(owner);
      const performed = await program(owner);
      const booking = S.EventOut.parse(
        await body(
          await call(owner, "/calendar/events", "POST", {
            date: "2026-09-09",
            time: "18:00",
            program_id: assigned.id,
          }),
          201,
        ),
      );
      await body(await call(owner, "/workouts/sessions/sync", "POST", session(performed)), 201);

      const month = S.CalendarMonthOut.parse(
        await body(await call(owner, "/calendar/month?year=2026&month=9")),
      );
      expect(month.events.find((event) => event.id === booking.id)).toMatchObject({
        program_id: assigned.id,
        status: "planned",
      });
      expect(month.events.find((event) => event.program_id === performed.id)).toMatchObject({
        status: "completed",
      });
    });

    it("auto-completes exactly one planned event for a synchronized local date", async () => {
      const owner = await user();
      const p = await program(owner);
      const event = () =>
        call(owner, "/calendar/events", "POST", { date: "2026-09-09", time: "00:30" });
      await body(await event(), 201);
      await body(await event(), 201);
      await body(
        await call(owner, "/workouts/sessions/sync", "POST", {
          ...session(p),
          started_at: "2026-09-08T21:30:00Z",
          finished_at: "2026-09-08T22:00:00Z",
          local_date: "2026-09-09",
        }),
        201,
      );
      const month = S.CalendarMonthOut.parse(
        await body(await call(owner, "/calendar/month?year=2026&month=9")),
      );
      expect(month.stats.completed).toBe(1);
    });

    // Тренировку начинают из программы, а не из календаря: записи на этот день
    // нет вовсе. Раньше completeFromSession в таком случае не находила план и
    // молча выходила — выполненная тренировка не появлялась в календаре.
    it("records a completed workout that had no planned event", async () => {
      const owner = await user();
      const p = await program(owner);
      await body(
        await call(owner, "/workouts/sessions/sync", "POST", {
          ...session(p),
          started_at: "2026-09-08T21:30:00Z",
          finished_at: "2026-09-08T22:00:00Z",
          local_date: "2026-09-09",
        }),
        201,
      );
      const month = S.CalendarMonthOut.parse(
        await body(await call(owner, "/calendar/month?year=2026&month=9")),
      );
      expect(month.stats.completed).toBe(1);
      expect(month.events).toHaveLength(1);
      expect(month.events[0]).toMatchObject({
        date: "2026-09-09",
        type: "personal",
        status: "completed",
      });
      // Дата — из local_date (её прислал клиент), час — UTC от started_at:
      // настоящую зону восстанавливать не из чего, см. completeFromSession.
      expect(month.events[0]!.time.slice(0, 5)).toBe("21:30");
      expect(month.events[0]!.workout_session_id).not.toBeNull();
    });

    // Sync повторяют офлайн-очередь и просто ретраи запроса. Второе событие на
    // тот же день было бы видимым дублем в календаре.
    it("does not add a second event when the same session is synced twice", async () => {
      const owner = await user();
      const p = await program(owner);
      const payload = {
        ...session(p),
        started_at: "2026-09-08T21:30:00Z",
        finished_at: "2026-09-08T22:00:00Z",
        local_date: "2026-09-09",
      };
      await body(await call(owner, "/workouts/sessions/sync", "POST", payload), 201);
      await call(owner, "/workouts/sessions/sync", "POST", payload);
      const month = S.CalendarMonthOut.parse(
        await body(await call(owner, "/calendar/month?year=2026&month=9")),
      );
      expect(month.events).toHaveLength(1);
    });
  });

  describe("managed card updates", () => {
    it("applies every editable field of a managed card", async () => {
      const trainer = await user("trainer");
      const c = await card(trainer);
      expect(
        S.ClientOut.parse(await body(await call(trainer, `/clients/${c.id}`, "PUT", renamed))),
      ).toMatchObject({
        display_name: "Renamed",
        start_date: "2026-08-01",
        end_date: "2026-12-01",
        has_injuries: true,
      });
    });

    it("moves the access period start to the edited start date", async () => {
      const trainer = await user("trainer");
      const c = await card(trainer);
      await body(await call(trainer, `/clients/${c.id}`, "PUT", renamed));
      const periods = await environment.db
        .select()
        .from(T.trainer_client_periods)
        .where(eq(T.trainer_client_periods.trainer_client_id, c.id));
      expect(periods[0].start_date.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    });

    it("leaves the access period open despite an edited end date", async () => {
      const trainer = await user("trainer");
      const c = await card(trainer);
      await body(await call(trainer, `/clients/${c.id}`, "PUT", renamed));
      const periods = await environment.db
        .select()
        .from(T.trainer_client_periods)
        .where(eq(T.trainer_client_periods.trainer_client_id, c.id));
      expect(periods[0].end_date).toBeNull();
    });

    it("archives and restores a managed card", async () => {
      const trainer = await user("trainer");
      const c = await card(trainer);
      await body(await call(trainer, `/clients/${c.id}/archive`, "POST"));
      await body(await call(trainer, `/clients/${c.id}/unarchive`, "POST"));
    });
  });

  describe("sharing a program with a managed client", () => {
    async function shared() {
      const trainer = await user("trainer");
      const c = await card(trainer);
      const ex = await exercise(trainer);
      const p = await program(trainer, ex.id);
      await body(await call(trainer, `/clients/${c.id}`, "PUT", renamed));
      const item = S.ProgramListItem.parse(
        await body(await call(trainer, `/programs/${p.id}/share`, "POST", { client_id: c.id })),
      );
      return { trainer, c, ex, p, item };
    }

    it("badges the shared copy with its client and content counts", async () => {
      const { c, item } = await shared();
      expect(item).toMatchObject({
        for_client_id: c.id,
        for_client_name: "Renamed",
        day_count: 1,
        exercise_count: 1,
      });
    });

    it("lists the shared copy among the trainer's non-standard programs", async () => {
      const { trainer, item } = await shared();
      const list = S.ProgramListItem.array().parse(
        await body(await call(trainer, "/programs?standard=false")),
      );
      expect(list.find((entry) => entry.id === item.id)).toEqual(item);
    });
  });

  describe("shared program attribution", () => {
    it("shows the source trainer's name only on the shared copy", async () => {
      const trainer = await user("trainer");
      const client = await user();
      const linked = await link(trainer, client);
      const source = await program(trainer);
      const original = S.ProgramOut.parse(
        await body(await call(trainer, `/programs/${source.id}`)),
      );
      expect(original.source_author_name).toBeNull();

      const shared = S.ProgramListItem.parse(
        await body(
          await call(trainer, `/programs/${source.id}/share`, "POST", { client_id: linked.id }),
        ),
      );
      const copy = S.ProgramOut.parse(await body(await call(client, `/programs/${shared.id}`)));
      expect(copy.source_author_name).toBe(`Name ${trainer.id}`);
      expect(copy.days).toHaveLength(source.days.length);
      expect((await call(await user(), `/programs/${shared.id}`)).status).toBe(404);
    });
  });

  describe("empty managed client data", () => {
    it("returns no measurements for a managed client", async () => {
      const trainer = await user("trainer");
      const c = await card(trainer);
      expect(await body(await call(trainer, `/measurements?client_id=${c.id}`))).toEqual({
        items: [],
        total: 0,
      });
    });

    it("returns no custom fields for a managed client", async () => {
      const trainer = await user("trainer");
      const c = await card(trainer);
      expect(
        await body(await call(trainer, `/measurements/custom-fields?client_id=${c.id}`)),
      ).toEqual([]);
    });

    it("returns an empty anthropometry series for a managed client", async () => {
      const trainer = await user("trainer");
      const c = await card(trainer);
      expect(
        await body(
          await call(
            trainer,
            `/analytics/anthropometry/series?client_id=${c.id}&date_from=2026-01-01&date_to=2026-12-31&parameters=weight`,
          ),
        ),
      ).toMatchObject({ parameters: [] });
    });
  });

  describe("appending an exercise to a program", () => {
    it("adds the appended exercise as a new slot", async () => {
      const trainer = await user("trainer");
      const ex = await exercise(trainer);
      const p = await program(trainer, ex.id);
      const first = S.ProgramOut.parse(
        await body(
          await call(trainer, `/programs/${p.id}/exercises`, "POST", appendix(p.days[0].id, ex.id)),
        ),
      );
      expect(first.days[0].slots).toHaveLength(2);
    });

    it("replays an identical append without adding a second slot", async () => {
      const trainer = await user("trainer");
      const ex = await exercise(trainer);
      const p = await program(trainer, ex.id);
      const appended = appendix(p.days[0].id, ex.id);
      const first = S.ProgramOut.parse(
        await body(await call(trainer, `/programs/${p.id}/exercises`, "POST", appended)),
      );
      const second = S.ProgramOut.parse(
        await body(await call(trainer, `/programs/${p.id}/exercises`, "POST", appended)),
      );
      expect(second.days[0].slots).toEqual(first.days[0].slots);
    });
  });

  describe("exercise catalog metadata", () => {
    it("counts the caller's own exercises per category", async () => {
      const trainer = await user("trainer");
      const ex = await exercise(trainer);
      const categories = S.CategoryOut.array().parse(
        await body(await call(trainer, "/exercises/categories")),
      );
      expect(categories.find((item) => item.id === category)?.exercise_count).toBe(1);
      expect(ex.category_id).toBe(category);
    });

    it("applies every descriptive field of an exercise patch", async () => {
      const trainer = await user("trainer");
      const ex = await exercise(trainer);
      expect(
        S.ExerciseOut.parse(
          await body(
            await call(trainer, `/exercises/${ex.id}`, "PATCH", {
              alt_names: ["Press"],
              description: "Description",
              steps: ["Step"],
              contraindications: "Knee",
            }),
          ),
        ),
      ).toMatchObject({
        alt_names: ["Press"],
        description: "Description",
        steps: ["Step"],
        contraindications: "Knee",
      });
    });

    it("reports the unpaged total when a search offset skips every match", async () => {
      const trainer = await user("trainer");
      const ex = await exercise(trainer);
      await body(await call(trainer, `/exercises/${ex.id}`, "PATCH", { alt_names: ["Press"] }));
      expect(await body(await call(trainer, "/exercises?search=Press&offset=1"))).toMatchObject({
        items: [],
        total: 1,
      });
    });
  });
});
