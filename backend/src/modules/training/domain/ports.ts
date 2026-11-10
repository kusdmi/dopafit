import type * as M from "./models/index.js";

export interface ClientRepository {
  list(trainer: M.Id): Promise<M.ClientCard[]>;
  get(id: M.Id): Promise<M.ClientCard | null>;
  create(trainer: M.Id, input: M.ClientDraft, now: M.Instant): Promise<M.Id>;
  update(card: M.ClientCard, input: M.ClientChanges): Promise<void>;
  setNote(id: M.Id, note: string): Promise<void>;
  setStatus(id: M.Id, status: M.ClientCard["status"]): Promise<void>;
  closePeriod(id: M.Id, now: M.Instant): Promise<void>;
  findAccount(query: string): Promise<M.Account | null>;
  account(id: M.Id): Promise<M.Account | null>;
  requests(user: M.Id): Promise<M.LinkRequest[]>;
  request(id: M.Id): Promise<M.LinkRequest | null>;
  pending(a: M.Id, b: M.Id): Promise<boolean>;
  linked(trainer: M.Id, client: M.Id): Promise<boolean>;
  trainerOf(client: M.Id): Promise<M.TrainerLink | null>;
  createRequest(from: M.Id, to: M.Id): Promise<M.LinkRequest>;
  setRequestStatus(id: M.Id, status: M.LinkRequest["status"]): Promise<void>;
  ensureLinkedCard(trainer: M.Id, client: M.Account, now: M.Instant): Promise<void>;
  /**
   * Creates the notification row and answers its id.
   *
   * The id is not a convenience: the push built from this row carries it, and the tap on
   * that push is what marks the row read (PgTrainingUnitOfWork stamps it into the payload,
   * frontend/src/sw.ts hands it back to the app). Without it the device knows which screen
   * to open but not which row it just opened.
   */
  notify(user: M.Id, title: string, body: string, payload: Record<string, string>): Promise<M.Id>;
}
export interface CatalogRepository {
  categories(user: M.Id): Promise<M.Category[]>;
  list(
    user: M.Id,
    search: string | null,
    category: M.Id | null,
    favorites: boolean,
    limit: number,
    offset: number,
  ): Promise<{ items: M.Exercise[]; total: number }>;
  get(user: M.Id, id: M.Id): Promise<M.Exercise | null>;
  accessibleExerciseIds(user: M.Id, ids: M.Id[]): Promise<M.Id[]>;
  countOwn(user: M.Id): Promise<number>;
  create(user: M.Id, input: M.ExerciseDraft): Promise<M.Id>;
  update(id: M.Id, input: Partial<M.ExerciseDraft>): Promise<void>;
  remove(id: M.Id, now: M.Instant): Promise<void>;
  favorite(user: M.Id, exercise: M.Id, value: boolean): Promise<void>;
  media(id: M.Id): Promise<M.Media[]>;
  addMedia(input: M.MediaDraft): Promise<M.Media>;
  removeMedia(id: M.Id): Promise<void>;
}
export interface ProgramRepository {
  list(user: M.Id, standard: boolean | null): Promise<M.ProgramListSummary[]>;
  get(id: M.Id): Promise<M.Program | null>;
  create(
    owner: M.Id,
    input: M.ProgramDraft,
    source?: M.Id,
    card?: M.Id,
    assignedBy?: M.Id,
    assignedClient?: M.Id,
  ): Promise<M.Id>;
  update(id: M.Id, input: M.ProgramDraft, now: M.Instant): Promise<void>;
  remove(id: M.Id, now: M.Instant): Promise<void>;
  append(
    day: M.Id,
    position: number,
    slot: M.Id,
    variant: M.Id,
    exercise: M.Id,
    sets: number,
    reps: number,
  ): Promise<void>;
  shareExercises(exercises: M.Id[], owner: M.Id, recipient: M.Id): Promise<void>;
  variant(id: M.Id): Promise<M.HistoryVariant | null>;
}
export interface WorkoutRepository {
  get(id: M.Id): Promise<M.Session | null>;
  nextSequence(user: M.Id | null, card: M.Id | null): Promise<number>;
  create(
    input: M.SessionDraft,
    user: M.Id | null,
    card: M.Id | null,
    sequence: number,
  ): Promise<void>;
  sets(session: M.Id): Promise<M.PerformedSet[]>;
  priorSets(session: M.Session): Promise<M.PerformedSet[]>;
  history(variant: M.Id, user: M.Id | null, card: M.Id | null): Promise<M.PerformedSet[]>;
  points(filter: M.WorkoutFilter): Promise<M.WorkoutPoint[]>;
  pointsByExercise(filter: M.WorkoutFilter): Promise<M.ExerciseWorkoutPoint[]>;
  count(filter: M.WorkoutFilter): Promise<number>;
  best(
    filter: M.WorkoutFilter,
  ): Promise<{ exercise_id: M.Id; exercise_name: string; weight: number } | null>;
  strength(filter: M.WorkoutFilter): Promise<M.Point[]>;
  strengthExercises(
    filter: M.WorkoutFilter,
  ): Promise<{ exercise_id: M.Id; exercise_name: string }[]>;
}
export interface MeasurementRepository {
  available(user: M.Id): Promise<{ parameters: M.BodyParameter[]; custom_slots: number[] }>;
  get(id: M.Id): Promise<M.Measurement | null>;
  byDate(user: M.Id, date: M.Day): Promise<M.Measurement | null>;
  list(
    user: M.Id,
    card: M.Id | null,
    limit: number,
    offset: number,
  ): Promise<{ items: M.Measurement[]; total: number }>;
  create(user: M.Id, input: M.MeasurementDraft): Promise<M.Id>;
  update(id: M.Id, input: M.MeasurementDraft): Promise<void>;
  remove(id: M.Id): Promise<void>;
  fields(user: M.Id): Promise<M.CustomField[]>;
  setField(user: M.Id, input: M.CustomField): Promise<void>;
  photos(id: M.Id): Promise<M.Photo[]>;
  setPhoto(id: M.Id, kind: M.PhotoKind, key: string): Promise<void>;
  removePhoto(id: M.Id, kind: M.PhotoKind): Promise<void>;
  photoDates(user: M.Id, kind: M.PhotoKind): Promise<M.Photo[]>;
  points(
    user: M.Id,
    card: M.Id | null,
    field: M.MeasurementField | number,
    from: M.Day,
    to: M.Day,
  ): Promise<M.Point[]>;
}
export interface CalendarRepository {
  month(user: M.Id, year: number, month: number): Promise<M.Event[]>;
  get(id: M.Id): Promise<M.Event | null>;
  create(user: M.Id, input: M.EventDraft): Promise<M.Id>;
  update(id: M.Id, input: M.EventChanges): Promise<void>;
  completeFromSession(session: M.Session, owner: M.Id): Promise<void>;
  bookings(user: M.Id, from: M.Day, to: M.Day): Promise<{ date: M.Day; type: M.Event["type"] }[]>;
}
export interface TrainingAccess {
  premium(user: string): Promise<boolean>;
  workout(user: string, program: string, started: string, client: string | null): Promise<void>;
  program(
    user: string,
    input: { days: { slots: { exercises: unknown[] }[] }[] },
    id: string,
    existing: boolean,
    client?: string | null,
  ): Promise<void>;
  client(user: string, registered: boolean, existingId?: string): Promise<void>;
  registerClient(user: string, id: string): Promise<void>;
  confirm(
    user: string,
    input: { cycle: string; program_ids: string[]; client_ids: string[] },
  ): Promise<unknown>;
  range(
    user: string,
    from: string,
    to: string,
  ): Promise<{ date_from: string; date_to: string; limited: boolean }>;
}
export interface Repositories {
  access?: TrainingAccess;
  clients: ClientRepository;
  catalog: CatalogRepository;
  programs: ProgramRepository;
  workouts: WorkoutRepository;
  measurements: MeasurementRepository;
  calendar: CalendarRepository;
}
export interface TrainingUnitOfWork {
  run<T>(lockKeys: string[], work: (repositories: Repositories) => Promise<T>): Promise<T>;
}
export interface TrainingPush {
  userId: string;
  type: "link_request";
  title: string;
  body: string;
  data: Record<string, string>;
}
export interface FileStorage {
  putObject(key: string, data: Uint8Array, contentType: string): Promise<void>;
  getObject(key: string): Promise<{ data: Uint8Array; contentType: string }>;
  presignedGet(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  optimizeImage(
    data: Uint8Array,
    contentType: string,
  ): Promise<{ data: Uint8Array; contentType: string; extension: string }>;
}
