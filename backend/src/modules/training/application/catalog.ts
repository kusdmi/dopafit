import type * as M from "../domain/models/index.js";
import type { FileStorage, Repositories, TrainingUnitOfWork } from "../domain/ports.js";
import { fail } from "../domain/rules.js";

/** One media item as `ExerciseMediaOut` documents it. */
interface MediaView {
  id: string;
  kind: M.Media["kind"];
  url: string;
  position: number;
}

function item(ex: M.Exercise, user: string) {
  const ownership: M.Ownership =
    ex.owner_id === user ? "own" : ex.owner_id && ex.is_shared ? "shared" : "global";
  return {
    id: ex.id,
    name: ex.name,
    category_id: ex.category_id,
    difficulty: ex.difficulty,
    is_favorite: ex.is_favorite,
    ownership,
  };
}
async function owned(r: Repositories, actor: M.Actor, id: string) {
  const exercise = await r.catalog.get(actor.id, id);
  if (!exercise || exercise.owner_id !== actor.id) return fail("not_found", "Exercise not found");
  return exercise;
}
export class CatalogApplication {
  constructor(
    private readonly uow: TrainingUnitOfWork,
    private readonly storage: FileStorage,
    private readonly now: () => string,
    private readonly uuid: () => string,
    private readonly limits: { customExercises: number; mediaBytes: number; embedHosts: string[] },
  ) {}
  categories(actor: M.Actor) {
    return this.uow.run([], (r) => r.catalog.categories(actor.id));
  }
  list(
    actor: M.Actor,
    search: string | null,
    category: string | null,
    favorites: boolean,
    limit: number,
    offset: number,
  ) {
    return this.uow.run([], async (r) => {
      const result = await r.catalog.list(actor.id, search, category, favorites, limit, offset);
      return { items: result.items.map((e) => item(e, actor.id)), total: result.total };
    });
  }
  /**
   * The URL a media item is served under: its own for a link, a freshly signed one for an
   * uploaded object. Never null: `M.Media` carries exactly one of the two, whether it was
   * just written here or validated against that invariant when read back from the database.
   */
  private mediaUrl(media: M.Media): Promise<string> {
    return media.url !== undefined
      ? Promise.resolve(media.url)
      : this.storage.presignedGet(media.object_key);
  }

  private async mediaView(media: M.Media): Promise<MediaView> {
    const url = await this.mediaUrl(media);
    return { id: media.id, kind: media.kind, url, position: media.position };
  }
  private async view(r: Repositories, actor: M.Actor, id: string) {
    const ex = await r.catalog.get(actor.id, id);
    if (!ex) return fail("not_found", "Exercise not found");
    const media = await Promise.all((await r.catalog.media(id)).map((m) => this.mediaView(m)));
    return {
      ...item(ex, actor.id),
      alt_names: ex.alt_names,
      description: ex.description,
      steps: ex.steps,
      contraindications: ex.contraindications,
      image_url: media.find((m) => m.kind === "image" || m.kind === "gif")?.url ?? null,
      media,
    };
  }
  get(actor: M.Actor, id: string) {
    return this.uow.run([], (r) => this.view(r, actor, id));
  }
  create(actor: M.Actor, input: M.ExerciseDraft) {
    return this.uow.run([`catalog:${actor.id}`], async (r) => {
      if ((await r.catalog.countOwn(actor.id)) >= this.limits.customExercises)
        fail("conflict", "Достигнут лимит пользовательских упражнений", {
          reason: "custom_exercise_limit",
          limit: this.limits.customExercises,
        });
      const id = await r.catalog.create(actor.id, input);
      return this.view(r, actor, id);
    });
  }
  update(actor: M.Actor, id: string, input: Partial<M.ExerciseDraft>) {
    return this.uow.run([`exercise:${id}`], async (r) => {
      await owned(r, actor, id);
      await r.catalog.update(
        id,
        Object.fromEntries(Object.entries(input).filter(([, v]) => v != null)),
      );
      return this.view(r, actor, id);
    });
  }
  remove(actor: M.Actor, id: string) {
    return this.uow.run([`exercise:${id}`], async (r) => {
      await owned(r, actor, id);
      await r.catalog.remove(id, this.now());
    });
  }
  favorite(actor: M.Actor, id: string, value: boolean) {
    return this.uow.run([`favorite:${actor.id}:${id}`], async (r) => {
      const ex = await r.catalog.get(actor.id, id);
      if (!ex) return fail("not_found", "Exercise not found");
      await r.catalog.favorite(actor.id, id, value);
      return item({ ...ex, is_favorite: value }, actor.id);
    });
  }
  link(
    actor: M.Actor,
    id: string,
    input: { kind: M.Media["kind"]; url: string; position: number },
  ) {
    return this.uow.run([`exercise:${id}`], async (r) => {
      await owned(r, actor, id);
      if (input.kind !== "iframe" && input.kind !== "video")
        fail("validation_error", "Links must be of kind iframe or video");
      let url: URL;
      try {
        url = new URL(input.url);
      } catch {
        return fail("validation_error", "Embed URL host is not allowed");
      }
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !this.limits.embedHosts.includes(url.hostname.toLowerCase())
      )
        fail("validation_error", "Embed URL host is not allowed");
      return this.mediaView(await r.catalog.addMedia({ exercise_id: id, ...input }));
    });
  }
  upload(actor: M.Actor, id: string, kind: M.Media["kind"], raw: Uint8Array, contentType: string) {
    return this.uow.run([`exercise:${id}`], async (r) => {
      await owned(r, actor, id);
      if (kind !== "image" && kind !== "gif")
        fail("validation_error", "Only image or gif files are allowed");
      if (
        !(kind === "gif" ? ["image/gif"] : ["image/jpeg", "image/png", "image/webp"]).includes(
          contentType,
        )
      )
        fail("validation_error", `Unsupported content type for ${kind}: ${contentType}`);
      if (raw.length > this.limits.mediaBytes) fail("validation_error", "File too large");
      const optimized = await this.storage.optimizeImage(raw, contentType);
      const key = `exercises/${id}/${this.uuid()}.${optimized.extension}`;
      await this.storage.putObject(key, optimized.data, optimized.contentType);
      try {
        return await this.mediaView(
          await r.catalog.addMedia({ exercise_id: id, kind, object_key: key, position: 0 }),
        );
      } catch (error) {
        await this.storage.delete(key).catch(() => undefined);
        throw error;
      }
    });
  }
  async removeMedia(actor: M.Actor, id: string, mediaId: string) {
    const key = await this.uow.run([`exercise:${id}`], async (r) => {
      await owned(r, actor, id);
      const media = (await r.catalog.media(id)).find((m) => m.id === mediaId);
      if (!media) return fail("not_found", "Media not found");
      await r.catalog.removeMedia(media.id);
      return media.object_key;
    });
    if (key) await this.storage.delete(key);
  }
}
