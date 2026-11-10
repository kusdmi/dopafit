import type { Database } from "../../platform/db/index.js";
import type { FileStorage, TrainingPush, TrainingAccess } from "./domain/ports.js";
import { PgTrainingUnitOfWork } from "./infrastructure/unit-of-work.js";
import { ClientApplication } from "./application/clients.js";
import { CatalogApplication } from "./application/catalog.js";
import { ProgramApplication } from "./application/programs.js";
import { WorkoutApplication } from "./application/workouts.js";
import { MeasurementApplication } from "./application/measurements.js";
import { CalendarApplication } from "./application/calendar.js";
import { AnalyticsApplication } from "./application/analytics.js";
import { DEFAULT_MAX_MEDIA_BYTES } from "../../limits.js";

export type { FileStorage } from "./domain/ports.js";
export interface TrainingOptions {
  access?: (db: Pick<Database, "execute">) => TrainingAccess;
  now?: () => string;
  uuid?: () => string;
  customExerciseLimit?: number;
  maxMediaBytes?: number;
  embedHosts?: string[];
  deliver?: (message: TrainingPush) => Promise<void>;
  logError?: (error: unknown) => void;
}
/**
 * Builds the training applications, one per sub-domain. The operations themselves live in
 * ./http/, split across a file per sub-domain and composed by ./http/index.ts.
 */
export function createTrainingModule(
  db: Database,
  storage: FileStorage,
  options: TrainingOptions = {},
) {
  const uow = new PgTrainingUnitOfWork(db, options.deliver, options.logError, options.access);
  const now = options.now ?? (() => new Date().toISOString());
  const uuid = options.uuid ?? (() => crypto.randomUUID());
  const mediaBytes = options.maxMediaBytes ?? DEFAULT_MAX_MEDIA_BYTES;
  const applications = {
    clients: new ClientApplication(uow, now),
    catalog: new CatalogApplication(uow, storage, now, uuid, {
      customExercises: options.customExerciseLimit ?? 10,
      mediaBytes,
      embedHosts: options.embedHosts ?? [
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
        "youtube-nocookie.com",
        "www.youtube-nocookie.com",
        "vimeo.com",
        "player.vimeo.com",
        "rutube.ru",
        "www.rutube.ru",
        "vk.com",
        "www.vk.com",
        "vkvideo.ru",
        "www.vkvideo.ru",
      ],
    }),
    programs: new ProgramApplication(uow, now, uuid),
    workouts: new WorkoutApplication(uow),
    measurements: new MeasurementApplication(uow, storage, uuid, mediaBytes),
    calendar: new CalendarApplication(uow, now),
    analytics: new AnalyticsApplication(uow, now),
  };
  return { application: applications };
}
