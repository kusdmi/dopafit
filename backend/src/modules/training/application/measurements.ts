import * as M from "../domain/models/index.js";
import type { FileStorage, Repositories, TrainingUnitOfWork } from "../domain/ports.js";
import { fail, requireCard } from "../domain/rules.js";
import { privatePhotoUrl } from "./photo-url.js";

async function owned(r: Repositories, actor: M.Actor, id: string) {
  const m = await r.measurements.get(id);
  if (!m || m.user_id !== actor.id) return fail("not_found", "Measurement not found");
  return m;
}
export class MeasurementApplication {
  constructor(
    private readonly uow: TrainingUnitOfWork,
    private readonly storage: FileStorage,
    private readonly uuid: () => string,
    private readonly maxBytes: number,
  ) {}
  private async view(r: Repositories, actor: M.Actor, m: M.Measurement) {
    const { user_id, ...value } = m;
    const photos =
      user_id === actor.id
        ? (await r.measurements.photos(m.id)).map((p) => ({
            kind: p.kind,
            url: privatePhotoUrl(m.id, p.kind),
          }))
        : [];
    return { ...value, photos };
  }
  list(actor: M.Actor, client: string | null, limit: number, offset: number) {
    return this.uow.run([], async (r) => {
      const user = client
        ? requireCard(actor, await r.clients.get(client), true).user_id
        : actor.id;
      if (!user) return { items: [], total: 0 };
      const result = await r.measurements.list(user, client, limit, offset);
      return {
        items: await Promise.all(result.items.map((m) => this.view(r, actor, m))),
        total: result.total,
      };
    });
  }
  get(actor: M.Actor, id: string) {
    return this.uow.run([], async (r) => this.view(r, actor, await owned(r, actor, id)));
  }
  create(actor: M.Actor, input: M.MeasurementDraft) {
    if (!M.measurementFields.some((f) => input[f] !== null) && !input.custom_values.length)
      fail("validation_error", "At least one measurement field is required");
    const id = input.id ?? this.uuid();
    return this.uow.run([`measurement:${id}`, `measurements:${actor.id}`], async (r) => {
      const existing = await r.measurements.get(id);
      if (existing) {
        if (existing.user_id !== actor.id) fail("forbidden", "Measurement belongs to another user");
        return { value: await this.view(r, actor, existing), created: false };
      }
      const clash = await r.measurements.byDate(actor.id, input.date);
      if (clash)
        fail("measurement_date_conflict", "A measurement for this date already exists", {
          existing_id: clash.id,
          date: input.date,
        });
      await r.measurements.create(actor.id, { ...input, id });
      return { value: await this.view(r, actor, (await r.measurements.get(id))!), created: true };
    });
  }
  update(actor: M.Actor, id: string, input: M.MeasurementDraft) {
    return this.uow.run([`measurement:${id}`, `measurements:${actor.id}`], async (r) => {
      await owned(r, actor, id);
      const clash = await r.measurements.byDate(actor.id, input.date);
      if (clash && clash.id !== id)
        fail("measurement_date_conflict", "A measurement for this date already exists", {
          existing_id: clash.id,
          date: input.date,
        });
      await r.measurements.update(id, input);
      return this.view(r, actor, (await r.measurements.get(id))!);
    });
  }
  async remove(actor: M.Actor, id: string) {
    const keys = await this.uow.run(
      [`measurement:${id}`, `measurements:${actor.id}`],
      async (r) => {
        await owned(r, actor, id);
        const photos = await r.measurements.photos(id);
        await r.measurements.remove(id);
        return photos.map((p) => p.object_key);
      },
    );
    await Promise.allSettled(keys.map((key) => this.storage.delete(key)));
  }
  fields(actor: M.Actor, client: string | null) {
    return this.uow.run([], async (r) => {
      const user = client
        ? requireCard(actor, await r.clients.get(client), true).user_id
        : actor.id;
      return user ? r.measurements.fields(user) : [];
    });
  }
  setField(actor: M.Actor, input: M.CustomField) {
    if (input.slot < 1 || input.slot > 3) fail("validation_error", "Slot must be between 1 and 3");
    return this.uow.run([`measurements:${actor.id}`], async (r) => {
      await r.measurements.setField(actor.id, input);
      return input;
    });
  }
  upload(actor: M.Actor, id: string, kind: M.PhotoKind, raw: Uint8Array, contentType: string) {
    return this.uow.run([`measurement:${id}`], async (r) => {
      await owned(r, actor, id);
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType))
        fail("validation_error", `Unsupported content type: ${contentType}`);
      if (raw.length > this.maxBytes) fail("validation_error", "File too large");
      const optimized = await this.storage.optimizeImage(raw, contentType);
      const key = `measurements/${id}/${kind}.${optimized.extension}`;
      await this.storage.putObject(key, optimized.data, optimized.contentType);
      await r.measurements.setPhoto(id, kind, key);
      return { kind, url: privatePhotoUrl(id, kind) };
    });
  }
  async photo(actor: M.Actor, id: string, kind: M.PhotoKind) {
    const key = await this.uow.run([], async (r) => {
      await owned(r, actor, id);
      const photo = (await r.measurements.photos(id)).find((p) => p.kind === kind);
      if (!photo) return fail("not_found", "Photo not found");
      return photo.object_key;
    });
    const object = await this.storage.getObject(key);
    if (!["image/jpeg", "image/png", "image/webp"].includes(object.contentType))
      return fail("not_found", "Photo not found");
    return object;
  }
  async removePhoto(actor: M.Actor, id: string, kind: M.PhotoKind) {
    const key = await this.uow.run([`measurement:${id}`], async (r) => {
      await owned(r, actor, id);
      const photo = (await r.measurements.photos(id)).find((p) => p.kind === kind);
      if (!photo) return fail("not_found", "Photo not found");
      await r.measurements.removePhoto(id, kind);
      return photo.object_key;
    });
    await this.storage.delete(key);
  }
}
