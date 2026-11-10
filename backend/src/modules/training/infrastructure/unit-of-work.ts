import { sql } from "drizzle-orm";
import type { Database } from "../../../platform/db/index.js";
import { AppError } from "../../../domain/error.js";
import type {
  Repositories,
  TrainingUnitOfWork,
  TrainingPush,
  TrainingAccess,
} from "../domain/ports.js";
import { PgClientRepository } from "./clients.js";
import { PgCatalogRepository } from "./catalog.js";
import { PgProgramRepository } from "./programs.js";
import { PgWorkoutRepository } from "./workouts.js";
import { PgMeasurementRepository } from "./measurements.js";
import { PgCalendarRepository } from "./calendar.js";
import type { Executor } from "./sql.js";

export function repositories(db: Executor): Repositories {
  return {
    clients: new PgClientRepository(db),
    catalog: new PgCatalogRepository(db),
    programs: new PgProgramRepository(db),
    workouts: new PgWorkoutRepository(db),
    measurements: new PgMeasurementRepository(db),
    calendar: new PgCalendarRepository(db),
  };
}
export class PgTrainingUnitOfWork implements TrainingUnitOfWork {
  constructor(
    private readonly db: Database,
    private readonly deliver?: (message: TrainingPush) => Promise<void>,
    private readonly logError: (error: unknown) => void = console.error,
    private readonly access?: (db: Executor) => TrainingAccess,
  ) {}
  async run<T>(lockKeys: string[], work: (repositories: Repositories) => Promise<T>): Promise<T> {
    const messages: TrainingPush[] = [];
    let result: T;
    try {
      result = await this.db.transaction(async (tx) => {
        // Sort all locks globally. UUID replay and owner numbering are serialized across processes.
        for (const key of [...new Set(lockKeys)].sort())
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key},0))`);
        const repo = repositories(tx);
        repo.access = this.access?.(tx);
        const notify = repo.clients.notify.bind(repo.clients);
        repo.clients.notify = async (userId, title, body, data) => {
          const id = await notify(userId, title, body, data);
          // `notification_id` едет рядом с маршрутом: тап по системному пушу должен не
          // только открыть экран, но и погасить само уведомление, а service worker знает
          // о нём ровно то, что лежит в payload.
          messages.push({
            userId,
            type: "link_request",
            title,
            body,
            data: { ...data, notification_id: id },
          });
          return id;
        };
        return work(repo);
      });
    } catch (error) {
      let cause: unknown = error;
      for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
        const pg = cause as { code?: string; cause?: unknown };
        if (pg.code === "23505" || pg.code === "23503" || pg.code === "23514")
          throw new AppError("conflict", "The request conflicts with the current state");
        cause = pg.cause;
      }
      throw error;
    }
    if (this.deliver)
      for (const message of messages) {
        try {
          await this.deliver(message);
        } catch (error) {
          this.logError(error);
        }
      }
    return result;
  }
}
