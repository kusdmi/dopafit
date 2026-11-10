import { z } from "@hono/zod-openapi";
import { AccountRole, PHONE_PATTERN } from "../../../endpoint.js";

/**
 * The DTOs only training's operations name — clients and link requests, the exercise
 * catalog, programs, logged workouts, measurements, the calendar and the analytics series.
 *
 * These are the eighty-one that were left in the shared schema file once auth's forty-two had
 * moved out, and every one of them is referenced by this module alone: no other module names
 * any of them, which is what makes training their owner. The file they came from held exactly
 * these plus HealthOut, which describes the process rather than a domain and so went to live
 * beside the liveness endpoint that answers with it; with both gone the shared file has been
 * deleted.
 *
 * AccountRole is the one name here that is not training's alone — auth's UserOut carries it
 * too — so it stays in src/endpoint.ts, where both modules reach it without either importing
 * the other's schemas. PHONE_PATTERN joined it there for the same reason.
 *
 * Relative order is the one they held in the shared file, since nothing depends on it —
 * `createContract` discovers schemas by walking the routes, and the emitted components are
 * sorted by name.
 */

export const AddExerciseToProgramRequest = z
  .object({
    day_id: z.string().uuid(),
    exercise_id: z.string().uuid(),
    reps: z.number().int().min(1).max(999).default(10).optional(),
    sets: z.number().int().min(1).max(99).default(3).optional(),
    slot_exercise_id: z.union([z.string().uuid(), z.null()]).optional(),
    slot_id: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .describe("Add an exercise from the catalog to a program day (screen 22.x).")
  .openapi("AddExerciseToProgramRequest");
export const BodyParameter = z
  .enum([
    "height",
    "weight",
    "waist",
    "chest",
    "hips",
    "thigh",
    "shoulder",
    "ankle",
    "calf",
    "biceps",
    "forearm",
    "wrist",
    "neck",
  ])
  .openapi("BodyParameter");
export const ParameterPoint = z
  .object({ date: z.string().date(), value: z.number() })
  .openapi("ParameterPoint");
export const ParameterStats = z
  .object({ avg: z.number(), change_percent: z.number(), max: z.number(), min: z.number() })
  .openapi("ParameterStats");
export const ParameterSeries = z
  .object({
    custom_slot: z.union([z.number().int(), z.null()]).optional(),
    name: z.union([z.string(), z.null()]).optional(),
    parameter: z.union([BodyParameter, z.null()]).optional(),
    points: z.array(ParameterPoint),
    stats: ParameterStats,
    unit: z.union([z.string(), z.null()]).optional(),
  })
  .describe(
    "One anthropometry series.\n\nA series is either a standard body parameter (``parameter`` set, the standard\n``BodyParameter`` enum) or a user-defined custom field (``custom_slot`` set, with\nthe field's ``name``/``unit`` so the client can label the chart). Exactly one of\n``parameter``/``custom_slot`` is populated; the other stays null. This keeps a\nsingle response shape and one endpoint for both kinds (B010).",
  )
  .openapi("ParameterSeries");
export const AnalyticsRange = z
  .object({ date_from: z.string().date(), date_to: z.string().date(), limited: z.boolean() })
  .openapi("AnalyticsRange");
export const AvailableMeasurementsOut = z
  .object({ parameters: z.array(BodyParameter), custom_slots: z.array(z.number().int()) })
  .openapi("AvailableMeasurementsOut");
export const AnthropometrySeriesOut = z
  .object({ parameters: z.array(ParameterSeries), range: AnalyticsRange.optional() })
  .openapi("AnthropometrySeriesOut");
export const ExerciseMediaKind = z
  .enum(["image", "video", "gif", "iframe"])
  .openapi("ExerciseMediaKind");
export const ExerciseMediaUpload = z
  .object({
    file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
    kind: ExerciseMediaKind,
  })
  .openapi("ExerciseMediaUpload");
export const PhotoKind = z.enum(["front", "back", "left", "right"]).openapi("PhotoKind");
export const MeasurementPhotoUpload = z
  .object({
    file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
    kind: PhotoKind,
  })
  .openapi("MeasurementPhotoUpload");
export const EventClientOut = z
  .object({ client_id: z.string().uuid(), name: z.string() })
  .openapi("EventClientOut");
export const EventStatus = z.enum(["planned", "completed", "cancelled"]).openapi("EventStatus");
export const EventType = z.enum(["personal", "with_clients"]).openapi("EventType");
export const EventOut = z
  .object({
    clients: z.array(EventClientOut).default([]).optional(),
    date: z.string().date(),
    id: z.string().uuid(),
    owner_name: z.string(),
    program_id: z.union([z.string().uuid(), z.null()]),
    program_name: z.union([z.string(), z.null()]),
    status: EventStatus,
    time: z.string().time(),
    type: EventType,
    workout_session_id: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .openapi("EventOut");
export const MonthStats = z
  .object({
    completed: z.number().int(),
    personal: z.number().int(),
    planned: z.number().int(),
    unique_clients: z.number().int(),
    with_clients: z.number().int(),
  })
  .openapi("MonthStats");
export const CalendarMonthOut = z
  .object({
    events: z.array(EventOut),
    month: z.number().int(),
    stats: MonthStats,
    year: z.number().int(),
  })
  .openapi("CalendarMonthOut");
export const CategoryOut = z
  .object({
    emoji: z.string(),
    exercise_count: z.number().int(),
    id: z.string().uuid(),
    image_url: z.union([z.string(), z.null()]),
    name: z.string(),
    slug: z.string(),
  })
  .openapi("CategoryOut");
export const ChartPoint = z
  .object({ date: z.string().date(), value: z.number() })
  .openapi("ChartPoint");
export const ClientCreateRequest = z
  .object({
    display_name: z.string().min(1).max(100),
    injuries: z.union([z.string().max(2000), z.null()]).optional(),
    note: z.union([z.string().max(2000), z.null()]).optional(),
    phone: z.union([z.string().regex(PHONE_PATTERN), z.null()]).optional(),
    start_date: z.union([z.string().date(), z.null()]).optional(),
  })
  .openapi("ClientCreateRequest");
export const ClientStatus = z.enum(["active", "archived", "unlinked"]).openapi("ClientStatus");
export const ClientDetailOut = z
  .object({
    client_user_id: z.union([z.string().uuid(), z.null()]),
    display_name: z.string(),
    end_date: z.union([z.string().date(), z.null()]),
    full_name: z.union([z.string(), z.null()]),
    has_injuries: z.boolean(),
    id: z.string().uuid(),
    injuries: z.union([z.string(), z.null()]),
    last_activity_at: z.union([z.string().datetime({ offset: true }), z.null()]),
    note: z.union([z.string(), z.null()]),
    phone: z.union([z.string(), z.null()]),
    start_date: z.string().date(),
    status: ClientStatus,
    workout_count: z.number().int(),
  })
  .openapi("ClientDetailOut");
export const ClientOut = z
  .object({
    client_user_id: z.union([z.string().uuid(), z.null()]),
    display_name: z.string(),
    end_date: z.union([z.string().date(), z.null()]),
    full_name: z.union([z.string(), z.null()]),
    has_injuries: z.boolean(),
    id: z.string().uuid(),
    last_activity_at: z.union([z.string().datetime({ offset: true }), z.null()]),
    phone: z.union([z.string(), z.null()]),
    start_date: z.string().date(),
    status: ClientStatus,
    workout_count: z.number().int(),
  })
  .openapi("ClientOut");
export const ClientTrainerFieldsUpdateRequest = z
  .object({ note: z.union([z.string().max(2000), z.null()]).optional() })
  .openapi("ClientTrainerFieldsUpdateRequest");
export const ClientUpdateRequest = z
  .object({
    display_name: z.union([z.string().min(1).max(100), z.null()]).optional(),
    end_date: z.union([z.string().date(), z.null()]).optional(),
    injuries: z.union([z.string().max(2000), z.null()]).optional(),
    phone: z.union([z.string().regex(PHONE_PATTERN), z.null()]).optional(),
    start_date: z.union([z.string().date(), z.null()]).optional(),
  })
  .openapi("ClientUpdateRequest");
export const ClientsStatsOut = z
  .object({ active: z.number().int(), total: z.number().int(), workouts: z.number().int() })
  .openapi("ClientsStatsOut");
export const ClientsListOut = z
  .object({ items: z.array(ClientOut), stats: ClientsStatsOut })
  .openapi("ClientsListOut");
/**
 * The trainer a client is linked to, as the client sees them — the mirror of `ClientOut`.
 *
 * Every other view of the pair is the trainer's: `/clients` lists a trainer's own cards and
 * refuses a client outright, so the client side had no way to name its own trainer and the
 * "Мой тренер" screen could only ever render the empty state. The shape stays deliberately
 * thin: the person's name and contact, and the link's start date, which is what the screen
 * shows. Nothing here is the trainer's private data about the client (`note`, `injuries`);
 * those stay on the trainer-only detail view.
 */
export const MyTrainerOut = z
  .object({
    /**
     * The trainer_clients row this link lives on.
     *
     * The client needs it to address the relationship itself — unlinking is
     * `POST /clients/{card_id}/unlink`, and without the id the client has no
     * way to name the link they are in. It is the id of a row that is already
     * about this very client, so it discloses nothing the caller may not see.
     */
    card_id: z.string().uuid(),
    full_name: z.union([z.string(), z.null()]),
    linked_since: z.string().date(),
    phone: z.union([z.string(), z.null()]),
    trainer_user_id: z.string().uuid(),
  })
  .openapi("MyTrainerOut");
/** Either the linked trainer, or `null` — an unlinked client is a normal state, not a 404. */
export const MyTrainerResponse = z
  .object({ trainer: z.union([MyTrainerOut, z.null()]) })
  .openapi("MyTrainerResponse");
export const ComparePhotoOut = z
  .object({ date: z.string().date(), url: z.string() })
  .openapi("ComparePhotoOut");
export const CounterpartOut = z
  .object({ name: z.string(), role: AccountRole, user_id: z.string().uuid() })
  .openapi("CounterpartOut");
export const CustomFieldOut = z
  .object({ name: z.string(), slot: z.number().int(), unit: z.string() })
  .openapi("CustomFieldOut");
export const CustomFieldUpdateRequest = z
  .object({ name: z.string().min(1).max(50), unit: z.string().min(1).max(10) })
  .openapi("CustomFieldUpdateRequest");
export const CustomValue = z
  .object({
    name: z.string(),
    slot: z.number().int().min(1).max(3),
    unit: z.string(),
    value: z.number(),
  })
  .openapi("CustomValue");
export const DashboardChartOut = z
  .object({ change_percent: z.union([z.number(), z.null()]), points: z.array(ChartPoint) })
  .openapi("DashboardChartOut");
export const PersonalRecordOut = z
  .object({ exercise_id: z.string().uuid(), exercise_name: z.string(), weight: z.number() })
  .openapi("PersonalRecordOut");
export const WeekDayOut = z
  .object({
    date: z.string().date(),
    has_client_workout: z.boolean(),
    has_personal_workout: z.boolean(),
  })
  .openapi("WeekDayOut");
export const DashboardOut = z
  .object({
    full_name: z.string(),
    measurement_chart: DashboardChartOut,
    month_workout_count: z.number().int(),
    personal_record: z.union([PersonalRecordOut, z.null()]),
    strength_chart: DashboardChartOut,
    week: z.array(WeekDayOut),
  })
  .openapi("DashboardOut");
export const DashboardPeriod = z.enum(["1m", "3m", "6m", "1y"]).openapi("DashboardPeriod");
export const StrengthExerciseOut = z
  .object({ exercise_id: z.string().uuid(), exercise_name: z.string() })
  .openapi("StrengthExerciseOut");
/** Exercises the caller has actually lifted, so the strength picker offers only charts that exist. */
export const StrengthExercisesOut = z
  .object({ items: z.array(StrengthExerciseOut) })
  .openapi("StrengthExercisesOut");
export const SlotExerciseCreate = z
  .object({
    custom_name: z.union([z.string().min(1).max(255), z.null()]).optional(),
    exercise_id: z.union([z.string().uuid(), z.null()]).optional(),
    id: z.union([z.string().uuid(), z.null()]).optional(),
    reps: z.number().int().min(1).max(999),
    sets: z.number().int().min(1).max(99),
    variant_order: z
      .number()
      .int()
      .min(0)
      .max(10)
      .describe("0 = primary; alternatives limited by entitlements"),
  })
  .openapi("SlotExerciseCreate");
export const SlotCreate = z
  .object({
    exercises: z.array(SlotExerciseCreate).min(1).max(11),
    id: z.union([z.string().uuid(), z.null()]).optional(),
    position: z.number().int().min(0),
  })
  .openapi("SlotCreate");
export const DayCreate = z
  .object({
    id: z.union([z.string().uuid(), z.null()]).optional(),
    name: z.string().min(1).max(100),
    position: z.number().int().min(0),
    slots: z.array(SlotCreate).default([]).optional(),
  })
  .openapi("DayCreate");
export const SlotExerciseOut = z
  .object({
    exercise_id: z.union([z.string().uuid(), z.null()]),
    has_contraindications: z.boolean(),
    id: z.string().uuid(),
    name: z.string(),
    reps: z.number().int(),
    sets: z.number().int(),
    variant_order: z.number().int(),
  })
  .openapi("SlotExerciseOut");
export const SlotOut = z
  .object({
    exercises: z.array(SlotExerciseOut),
    id: z.string().uuid(),
    position: z.number().int(),
  })
  .openapi("SlotOut");
export const DayOut = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    position: z.number().int(),
    slots: z.array(SlotOut),
  })
  .openapi("DayOut");
export const Difficulty = z.enum(["beginner", "intermediate", "advanced"]).openapi("Difficulty");
export const EventCreateRequest = z
  .object({
    client_ids: z.array(z.string().uuid()).default([]).optional(),
    date: z.string().date(),
    program_id: z.union([z.string().uuid(), z.null()]).optional(),
    time: z.string().time(),
  })
  .openapi("EventCreateRequest");
export const EventUpdateRequest = z
  .object({
    client_ids: z.union([z.array(z.string().uuid()), z.null()]).optional(),
    date: z.union([z.string().date(), z.null()]).optional(),
    program_id: z.union([z.string().uuid(), z.null()]).optional(),
    status: z.union([EventStatus, z.null()]).optional(),
    time: z.union([z.string().time(), z.null()]).optional(),
  })
  .openapi("EventUpdateRequest");
export const ExerciseCreateRequest = z
  .object({
    alt_names: z.array(z.string()).default([]).optional(),
    category_id: z.string().uuid(),
    contraindications: z.union([z.string(), z.null()]).optional(),
    description: z.string().default("").optional(),
    difficulty: Difficulty,
    name: z.string().min(1).max(255),
    steps: z.array(z.string()).default([]).optional(),
  })
  .openapi("ExerciseCreateRequest");
export const ExerciseHistoryEntry = z
  .object({
    performed_at: z.string().datetime({ offset: true }),
    reps: z.number().int(),
    set_id: z.string().uuid(),
    weight: z.number(),
  })
  .openapi("ExerciseHistoryEntry");
export const ExerciseHistoryDay = z
  .object({ date: z.string(), entries: z.array(ExerciseHistoryEntry) })
  .openapi("ExerciseHistoryDay");
export const ExerciseHistoryOut = z
  .object({
    days: z.array(ExerciseHistoryDay),
    exercise_id: z.union([z.string().uuid(), z.null()]),
    name: z.string(),
  })
  .openapi("ExerciseHistoryOut");
export const Ownership = z.enum(["own", "shared", "global"]).openapi("Ownership");
export const ExerciseListItem = z
  .object({
    category_id: z.string().uuid(),
    difficulty: Difficulty,
    id: z.string().uuid(),
    is_favorite: z.boolean(),
    name: z.string(),
    ownership: Ownership,
  })
  .openapi("ExerciseListItem");
export const ExerciseMediaLinkRequest = z
  .object({
    kind: ExerciseMediaKind,
    position: z.number().int().default(0).optional(),
    url: z.string().min(1).max(1024),
  })
  .openapi("ExerciseMediaLinkRequest");
export const ExerciseMediaOut = z
  .object({
    id: z.string().uuid(),
    kind: ExerciseMediaKind,
    position: z.number().int(),
    url: z.string(),
  })
  .openapi("ExerciseMediaOut");
export const ExerciseOut = z
  .object({
    alt_names: z.array(z.string()),
    category_id: z.string().uuid(),
    contraindications: z.union([z.string(), z.null()]),
    description: z.string(),
    difficulty: Difficulty,
    id: z.string().uuid(),
    image_url: z.union([z.string(), z.null()]),
    is_favorite: z.boolean(),
    media: z.array(ExerciseMediaOut).default([]).optional(),
    name: z.string(),
    ownership: Ownership,
    steps: z.array(z.string()),
  })
  .openapi("ExerciseOut");
export const ExerciseSummaryStat = z
  .object({
    delta: z
      .union([z.number(), z.null()])
      .describe(
        "Change of this metric vs the average of the same metric across prior finished sessions with this exercise (kg). None when there is no prior history.",
      )
      .optional(),
    value: z.number(),
  })
  .openapi("ExerciseSummaryStat");
export const ExerciseSummary = z
  .object({
    avg: ExerciseSummaryStat,
    max: ExerciseSummaryStat,
    min: ExerciseSummaryStat,
    name: z.string(),
  })
  .openapi("ExerciseSummary");
export const ExerciseSync = z
  .object({
    chosen_variant_id: z.string().uuid(),
    is_completed: z.boolean(),
    slot_id: z.string().uuid(),
  })
  .openapi("ExerciseSync");
export const ExerciseUpdateRequest = z
  .object({
    alt_names: z.union([z.array(z.string()), z.null()]).optional(),
    category_id: z.union([z.string().uuid(), z.null()]).optional(),
    contraindications: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    difficulty: z.union([Difficulty, z.null()]).optional(),
    name: z.union([z.string().min(1).max(255), z.null()]).optional(),
    steps: z.union([z.array(z.string()), z.null()]).optional(),
  })
  .openapi("ExerciseUpdateRequest");
export const LinkRequestCreateRequest = z
  .object({ query: z.string().min(1).describe("email or phone of the counterpart") })
  .openapi("LinkRequestCreateRequest");
export const LinkRequestDirection = z
  .enum(["incoming", "outgoing"])
  .openapi("LinkRequestDirection");
export const LinkRequestStatus = z
  .enum(["pending", "accepted", "declined", "cancelled"])
  .openapi("LinkRequestStatus");
export const LinkRequestOut = z
  .object({
    counterpart: CounterpartOut,
    created_at: z.string().datetime({ offset: true }),
    direction: LinkRequestDirection,
    id: z.string().uuid(),
    status: LinkRequestStatus,
  })
  .openapi("LinkRequestOut");
export const MeasurementCreate = z
  .object({
    ankle: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    biceps: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    calf: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    chest: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    custom_values: z.array(CustomValue).default([]).optional(),
    date: z.string().date(),
    forearm: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    height: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    hips: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    id: z.union([z.string().uuid(), z.null()]).optional(),
    neck: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    shoulder: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    thigh: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    waist: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    weight: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
    wrist: z.union([z.number().min(0).max(9999.9), z.null()]).optional(),
  })
  .openapi("MeasurementCreate");
export const MeasurementPhotoOut = z
  .object({ kind: PhotoKind, url: z.string() })
  .openapi("MeasurementPhotoOut");
export const MeasurementOut = z
  .object({
    ankle: z.union([z.number().min(0), z.null()]).optional(),
    biceps: z.union([z.number().min(0), z.null()]).optional(),
    calf: z.union([z.number().min(0), z.null()]).optional(),
    chest: z.union([z.number().min(0), z.null()]).optional(),
    custom_values: z.array(CustomValue).default([]).optional(),
    date: z.string().date(),
    forearm: z.union([z.number().min(0), z.null()]).optional(),
    height: z.union([z.number().min(0), z.null()]).optional(),
    hips: z.union([z.number().min(0), z.null()]).optional(),
    id: z.string().uuid(),
    neck: z.union([z.number().min(0), z.null()]).optional(),
    photos: z.array(MeasurementPhotoOut).default([]).optional(),
    shoulder: z.union([z.number().min(0), z.null()]).optional(),
    thigh: z.union([z.number().min(0), z.null()]).optional(),
    updated_at: z.string().datetime({ offset: true }),
    waist: z.union([z.number().min(0), z.null()]).optional(),
    weight: z.union([z.number().min(0), z.null()]).optional(),
    wrist: z.union([z.number().min(0), z.null()]).optional(),
  })
  .openapi("MeasurementOut");
export const ExerciseListPage = z
  .object({ items: z.array(ExerciseListItem), total: z.number().int() })
  .openapi("ExerciseListPage");
export const MeasurementPage = z
  .object({ items: z.array(MeasurementOut), total: z.number().int() })
  .openapi("MeasurementPage");
export const PhotoComparisonOut = z
  .object({ first: ComparePhotoOut, second: ComparePhotoOut })
  .openapi("PhotoComparisonOut");
export const PhotoDatesOut = z
  .object({ dates: z.array(z.string().date()) })
  .openapi("PhotoDatesOut");
export const ProgramKind = z
  .enum(["strength", "functional", "cardio", "plyometric", "custom"])
  .openapi("ProgramKind");
export const ProgramCreate = z
  .object({
    days: z.array(DayCreate).min(1).max(10),
    id: z.union([z.string().uuid(), z.null()]).optional(),
    kind: ProgramKind.default("custom").optional(),
    name: z.string().min(1).max(255),
  })
  .openapi("ProgramCreate");
export const ProgramUpdate = ProgramCreate.safeExtend({
  expected_updated_at: z.string().datetime({ offset: true }),
}).openapi("ProgramUpdate");
export const ProgramListItem = z
  .object({
    day_count: z.number().int(),
    exercise_count: z.number().int(),
    for_client_id: z.union([z.string().uuid(), z.null()]).optional(),
    for_client_name: z.union([z.string(), z.null()]).optional(),
    id: z.string().uuid(),
    is_standard: z.boolean(),
    is_received: z.boolean().optional(),
    kind: ProgramKind,
    name: z.string(),
    updated_at: z.string().datetime({ offset: true }),
  })
  .openapi("ProgramListItem");
export const ProgramOut = z
  .object({
    days: z.array(DayOut),
    id: z.string().uuid(),
    is_standard: z.boolean(),
    is_received: z.boolean().optional(),
    kind: ProgramKind,
    name: z.string(),
    source_author_name: z.union([z.string(), z.null()]),
    updated_at: z.string().datetime({ offset: true }),
  })
  .openapi("ProgramOut");
export const SessionSummaryOut = z
  .object({
    avg_rest_seconds: z.union([z.number().int(), z.null()]),
    duration_seconds: z.number().int(),
    exercises: z.array(ExerciseSummary),
    finished_at: z.string().datetime({ offset: true }),
    seq_number: z.number().int(),
    session_id: z.string().uuid(),
  })
  .openapi("SessionSummaryOut");
export const SetSync = z
  .object({
    id: z.string().uuid(),
    performed_at: z.string().datetime({ offset: true }),
    reps: z.number().int().min(1).max(999),
    slot_id: z.string().uuid(),
    variant_id: z.string().uuid(),
    weight: z.number().min(0).max(2000),
  })
  .openapi("SetSync");
export const SessionSyncRequest = z
  .object({
    client_id: z.union([z.string().uuid(), z.null()]).optional(),
    day_id: z.string().uuid(),
    exercises: z.array(ExerciseSync),
    finished_at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    local_date: z
      .union([z.string().date(), z.null()])
      .describe(
        "Client-local calendar date of the session, used for all day grouping (analytics, calendar auto-mark, week widget, dashboard). Falls back to the UTC date of started_at when omitted (older offline clients).",
      )
      .optional(),
    program_id: z.string().uuid(),
    sets: z.array(SetSync),
    started_at: z.string().datetime({ offset: true }),
  })
  .openapi("SessionSyncRequest");
export const ShareProgramRequest = z
  .object({ client_id: z.string().uuid() })
  .openapi("ShareProgramRequest");
export const WorkoutMetric = z.enum(["weight", "reps", "sets"]).openapi("WorkoutMetric");
export const WorkoutSeriesPoint = z
  .object({
    session_count: z.number().int().optional(),
    date: z.string().date(),
    reps: z.union([z.number(), z.null()]),
    sets: z.union([z.number().int(), z.null()]),
    weight: z.union([z.number(), z.null()]),
  })
  .openapi("WorkoutSeriesPoint");
export const WorkoutSeriesStats = z
  .object({
    avg_reps: z.union([z.number(), z.null()]),
    avg_weight: z.union([z.number(), z.null()]),
    total_workouts: z.number().int(),
  })
  .openapi("WorkoutSeriesStats");
export const WorkoutSeriesOut = z
  .object({
    points: z.array(WorkoutSeriesPoint),
    stats: WorkoutSeriesStats,
    range: AnalyticsRange.optional(),
  })
  .openapi("WorkoutSeriesOut");
/**
 * One exercise's slice of a workout series, for the per-exercise breakdown.
 *
 * Shaped after `ParameterSeries` in anthropometry: identity fields plus the same
 * `points`/`stats` the ungrouped response carries, so a client renders one card
 * per entry with no second shape to learn. The analytics screen draws a chart
 * per exercise of the selected program day, which a single averaged series
 * cannot express.
 */
export const ExerciseSeries = z
  .object({
    exercise_id: z.string().uuid(),
    name: z.string(),
    points: z.array(WorkoutSeriesPoint),
    stats: WorkoutSeriesStats,
  })
  .openapi("ExerciseSeries");
export const WorkoutSeriesByExerciseOut = z
  .object({ exercises: z.array(ExerciseSeries), range: AnalyticsRange.optional() })
  .openapi("WorkoutSeriesByExerciseOut");
