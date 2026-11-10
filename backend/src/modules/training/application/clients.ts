import type {
  Actor,
  ClientCard,
  ClientChanges,
  ClientDraft,
  LinkRequest,
} from "../domain/models/index.js";
import type { Repositories, TrainingUnitOfWork } from "../domain/ports.js";
import { fail, requireCard, requireTrainer } from "../domain/rules.js";

/** The card fields every view carries, whether or not the trainer's own notes are included. */
interface CardSummary {
  id: string;
  client_user_id: string | null;
  display_name: string;
  full_name: string | null;
  phone: string | null;
  status: ClientCard["status"];
  start_date: string;
  end_date: string | null;
  workout_count: number;
  last_activity_at: string | null;
  has_injuries: boolean;
}

/** A summary plus the two trainer-only fields, as ClientDetailOut documents them. */
interface CardDetail extends CardSummary {
  injuries: string | null;
  note: string | null;
}

/**
 * The card as the API returns it. `detail` adds the two fields only a trainer's own view
 * carries; the overloads state that, so a caller that asks for the detail view is typed as
 * receiving both — `ClientDetailOut` documents them as required, and a single signature with
 * a conditional spread would widen them to optional and hide that.
 */
function cardView(card: ClientCard, detail: true): CardDetail;
function cardView(card: ClientCard, detail?: false): CardSummary;
function cardView(card: ClientCard, detail = false): CardSummary | CardDetail {
  const {
    id,
    user_id,
    display_name,
    full_name,
    phone,
    status,
    start_date,
    end_date,
    workout_count,
    last_activity_at,
    injuries,
    note,
  } = card;
  const summary: CardSummary = {
    id,
    client_user_id: user_id,
    display_name,
    full_name,
    phone,
    status,
    start_date,
    end_date,
    workout_count,
    last_activity_at,
    has_injuries: !!injuries?.trim(),
  };
  return detail ? { ...summary, injuries, note } : summary;
}
/** A link request as `LinkRequestOut` documents it. */
interface RequestView {
  id: string;
  direction: "incoming" | "outgoing";
  counterpart: { user_id: string; name: string; role: Actor["role"] };
  status: LinkRequest["status"];
  created_at: string;
}

async function requestView(
  repo: Repositories,
  request: LinkRequest,
  user: Actor,
): Promise<RequestView> {
  const outgoing = request.from_user_id === user.id;
  const otherId = outgoing ? request.to_user_id : request.from_user_id;
  const other = await repo.clients.account(otherId);
  if (!other) return fail("not_found", "User not found");
  return {
    id: request.id,
    direction: outgoing ? "outgoing" : "incoming",
    counterpart: { user_id: otherId, name: other.full_name, role: other.role },
    status: request.status,
    created_at: request.created_at,
  };
}
export class ClientApplication {
  constructor(
    private readonly uow: TrainingUnitOfWork,
    private readonly now: () => string,
  ) {}
  list(actor: Actor) {
    requireTrainer(actor);
    return this.uow.run([], async (r) => {
      const cards = await r.clients.list(actor.id);
      return {
        stats: {
          total: cards.length,
          active: cards.filter((c) => c.status === "active").length,
          workouts: cards.reduce((sum, c) => sum + c.workout_count, 0),
        },
        items: cards.map((c) => cardView(c)),
      };
    });
  }
  /**
   * The caller's own trainer, for the client-side "Мой тренер" screen.
   *
   * The counterpart of `list`: that one requires a trainer and answers with its roster, this
   * one answers with the single trainer on the other end of the caller's active link. A
   * trainer asking has no trainer, and a client with no link is a normal state, so both
   * answer `{ trainer: null }` rather than a refusal — the screen renders its empty state
   * from that, and never from a missing endpoint.
   */
  myTrainer(actor: Actor) {
    return this.uow.run([], async (r) => ({
      trainer: actor.role === "trainer" ? null : await r.clients.trainerOf(actor.id),
    }));
  }
  create(actor: Actor, input: ClientDraft) {
    requireTrainer(actor);
    return this.uow.run([`entitlements:${actor.id}`, `clients:${actor.id}`], async (r) => {
      await r.access?.client(actor.id, false);
      const id = await r.clients.create(actor.id, input, this.now());
      await r.access?.registerClient(actor.id, id);
      return cardView((await r.clients.get(id))!);
    });
  }
  get(actor: Actor, id: string) {
    requireTrainer(actor);
    return this.uow.run([], async (r) =>
      cardView(requireCard(actor, await r.clients.get(id)), true),
    );
  }
  update(actor: Actor, id: string, input: ClientChanges) {
    requireTrainer(actor);
    return this.uow.run([`entitlements:${actor.id}`, `card:${id}`], async (r) => {
      const card = requireCard(actor, await r.clients.get(id));
      await r.access?.client(actor.id, !!card.user_id, id);
      if (!card.managed_client_id) fail("forbidden", "Linked clients cannot be edited");
      await r.clients.update(card, input);
      return cardView((await r.clients.get(id))!);
    });
  }
  note(actor: Actor, id: string, note: string | null) {
    requireTrainer(actor);
    return this.uow.run([`entitlements:${actor.id}`, `card:${id}`], async (r) => {
      const card = requireCard(actor, await r.clients.get(id));
      await r.access?.client(actor.id, !!card.user_id, id);
      if (note !== null) await r.clients.setNote(id, note);
      return cardView((await r.clients.get(id))!, true);
    });
  }
  /**
   * The card this actor may act on: the trainer's own card, or — when the actor
   * IS the client on it — their own side of the relationship.
   *
   * `requireCard` only ever matches `card.trainer_id`, so a client asking to
   * unlink would get "not found" for a card that is plainly theirs.
   */
  private async cardFor(
    r: Repositories,
    actor: Actor,
    id: string,
    action: "archive" | "unarchive" | "unlink",
  ): Promise<ClientCard> {
    const card = await r.clients.get(id);
    if (action === "unlink" && actor.role !== "trainer") {
      if (!card || card.user_id !== actor.id) return fail("not_found", "Client not found");
      return card;
    }
    return requireCard(actor, card);
  }
  status(actor: Actor, id: string, action: "archive" | "unarchive" | "unlink") {
    // Архивирование — распоряжение тренера своей картотекой, оно остаётся за
    // ним. А вот РАЗОРВАТЬ связь вправе обе стороны: отношение обоюдное, и
    // держать клиента в нём, пока тренер не отпустит, нельзя. Раньше здесь
    // стоял безусловный requireTrainer(), и у клиента выхода не было вовсе.
    if (action !== "unlink") requireTrainer(actor);
    return this.uow.run([`entitlements:${actor.id}`, `card:${id}`], async (r) => {
      const card = await this.cardFor(r, actor, id, action);
      if (action === "unarchive") await r.access?.client(actor.id, !!card.user_id, id);
      if (action === "archive" && card.status !== "active")
        fail("conflict", "Client card is not active");
      if (action === "unarchive" && card.status !== "archived")
        fail("conflict", "Client card is not archived");
      await r.clients.setStatus(
        id,
        action === "archive" ? "archived" : action === "unarchive" ? "active" : "unlinked",
      );
      if (action === "unlink") {
        await r.clients.closePeriod(id, this.now());
        // Уведомляем ОБЕ стороны, кто бы ни разорвал связь. Список строится из
        // самой карточки, а не из `actor.id`: инициатором теперь может быть и
        // клиент, и тогда `actor.id` — это он сам, а тренера звали бы по
        // `card.trainer_id`. Set убирает дубль, если стороны совпали.
        if (card.user_id)
          for (const user of new Set([card.trainer_id, card.user_id]))
            await r.clients.notify(
              user,
              "Связь тренер-клиент разорвана",
              "Связь тренер-клиент была разорвана.",
              { card_id: id },
            );
      }
    });
  }
  requests(actor: Actor, direction: string | null) {
    return this.uow.run([], async (r) => {
      const requests = (await r.clients.requests(actor.id)).filter((req) =>
        direction === "incoming"
          ? req.to_user_id === actor.id
          : direction === "outgoing"
            ? req.from_user_id === actor.id
            : true,
      );
      return Promise.all(requests.map((req) => requestView(r, req, actor)));
    });
  }
  async request(actor: Actor, query: string) {
    const target = await this.uow.run([], (r) => r.clients.findAccount(query));
    if (!target || target.id === actor.id)
      return fail("not_found", "User not found", { reason: "account_not_found" });
    if (target.role === actor.role)
      fail("validation_error", "A link must be between a trainer and a client", {
        reason: "link_role_mismatch",
      });
    return this.uow.run([`pair:${[actor.id, target.id].sort().join(":")}`], async (r) => {
      if (await r.clients.pending(actor.id, target.id))
        fail("conflict", "A pending request already exists", { reason: "link_request_pending" });
      if (
        await r.clients.linked(
          actor.role === "trainer" ? actor.id : target.id,
          actor.role === "client" ? actor.id : target.id,
        )
      )
        fail("conflict", "Already linked", { reason: "already_linked" });
      const request = await r.clients.createRequest(actor.id, target.id);
      // Заголовок называет отправителя, тело — что с этим делать. Прежняя пара
      // «Новый запрос на связь» / «Вам отправили запрос на добавление в
      // тренер-клиент» не говорила ни кто написал, ни куда идти, и на экране
      // уведомлений по ней нельзя было понять, требуется ли ответ.
      await r.clients.notify(
        target.id,
        actor.role === "trainer"
          ? "Тренер хочет добавить вас"
          : "Клиент хочет к вам присоединиться",
        "Откройте запросы, чтобы принять или отклонить.",
        { request_id: request.id },
      );
      return requestView(r, request, actor);
    });
  }
  /**
   * Settles a pending request.
   *
   * `cancel` is the one action with nothing to return — its route answers 204 — while `accept`
   * and `decline` always answer with the updated request, which is what `LinkRequestOut`
   * documents as their body. The overloads say so: a single signature returning the union
   * would make the view optional on the two routes that must always carry one, and a missing
   * body would serialize as an empty 200 rather than being caught here.
   */
  async decide(actor: Actor, id: string, action: "accept" | "decline"): Promise<RequestView>;
  async decide(actor: Actor, id: string, action: "cancel"): Promise<void>;
  async decide(
    actor: Actor,
    id: string,
    action: "accept" | "decline" | "cancel",
  ): Promise<RequestView | void> {
    const snapshot = await this.uow.run([], (r) => r.clients.request(id));
    if (!snapshot) return fail("not_found", "Request not found");
    const fromAccount = await this.uow.run([], (r) => r.clients.account(snapshot.from_user_id));
    const trainerId = fromAccount?.role === "trainer" ? snapshot.from_user_id : snapshot.to_user_id;
    return this.uow.run(
      [
        `entitlements:${trainerId}`,
        `request:${id}`,
        `pair:${[snapshot.from_user_id, snapshot.to_user_id].sort().join(":")}`,
      ],
      async (r) => {
        const req = await r.clients.request(id);
        if (
          !req ||
          req.status !== "pending" ||
          (action === "cancel" ? req.from_user_id !== actor.id : req.to_user_id !== actor.id)
        )
          return fail("not_found", "Request not found");
        req.status =
          action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
        await r.clients.setRequestStatus(id, req.status);
        if (action === "cancel") return;
        if (action === "accept") {
          const from = (await r.clients.account(req.from_user_id))!;
          const client = (await r.clients.account(
            from.role === "client" ? req.from_user_id : req.to_user_id,
          ))!;
          const trainer = from.role === "trainer" ? from.id : req.to_user_id;
          const prior = (await r.clients.list(trainer)).find(
            (c) =>
              (c.user_id === client.id ||
                (!!client.phone && c.phone === client.phone && !!c.managed_client_id)) &&
              c.status !== "unlinked",
          );
          await r.access?.client(trainer, true, prior?.id);
          await r.clients.ensureLinkedCard(
            from.role === "trainer" ? from.id : req.to_user_id,
            client,
            this.now(),
          );
          const linked = (await r.clients.list(trainer)).find(
            (c) => c.user_id === client.id && c.status === "active",
          );
          if (linked) await r.access?.registerClient(trainer, linked.id);
        }
        await r.clients.notify(
          req.from_user_id,
          action === "accept" ? "Запрос принят" : "Запрос отклонён",
          action === "accept"
            ? "Теперь вы связаны — можно начинать работу."
            : "Ваш запрос отклонили.",
          { request_id: id },
        );
        return requestView(r, req, actor);
      },
    );
  }
}
