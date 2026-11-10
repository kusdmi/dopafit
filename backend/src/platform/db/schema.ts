import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  smallint,
  numeric,
  jsonb,
  timestamp,
  date,
  time,
  unique,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";

// Tables below are grouped by owning module/concern rather than FK dependency
// order. Every cross-table `.references(() => otherTable.id)` here is a lazy
// arrow-function callback, resolved by Drizzle only when it builds the FK
// constraints — not at `pgTable()` call time — so declaration order between
// tables is not load-bearing. The enums, however, are called eagerly as
// column-type functions (e.g. `exercise_difficulty("difficulty")`) and must
// stay declared before any table that uses them.

export const exercise_difficulty = pgEnum("exercise_difficulty", [
  "beginner",
  "intermediate",
  "advanced",
]);
export const exercise_media_kind = pgEnum("exercise_media_kind", [
  "image",
  "video",
  "gif",
  "iframe",
]);
export const photo_kind = pgEnum("photo_kind", ["front", "back", "left", "right"]);
export const program_kind = pgEnum("program_kind", [
  "strength",
  "functional",
  "cardio",
  "plyometric",
  "custom",
]);
export const workout_session_status = pgEnum("workout_session_status", [
  "in_progress",
  "finished",
  "cancelled",
]);

// ---------------------------------------------------------------------------
// Auth & identity (module: auth)
// Accounts, credentials, verification and everything scoped 1:1 to a user.
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 20 }),
    password_hash: varchar("password_hash", { length: 255 }),
    role: varchar("role", { length: 30, enum: ["client", "trainer"] }).notNull(),
    referral_code: varchar("referral_code", { length: 16 }).notNull(),
    email_verified: boolean("email_verified").notNull().default(false),
    phone_verified: boolean("phone_verified").notNull().default(false),
    login_method: varchar("login_method", { length: 30, enum: ["code", "password", "two_factor"] })
      .notNull()
      .default("code"),
    verification_deadline_at: timestamp("verification_deadline_at", {
      withTimezone: true,
      mode: "date",
    }),
    personal_data_consent_at: timestamp("personal_data_consent_at", {
      withTimezone: true,
      mode: "date",
    }),
    is_active: boolean("is_active").notNull().default(true),
    deactivated_at: timestamp("deactivated_at", { withTimezone: true, mode: "date" }),
    deactivation_reason: varchar("deactivation_reason", {
      length: 30,
      enum: ["user_request", "unverified_email"],
    }),
    anonymized_at: timestamp("anonymized_at", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_users_referral_code").on(t.referral_code),
    unique("uq_users_phone").on(t.phone),
    uniqueIndex("uq_users_email_lower").on(sql`lower(email)`),
    check("ck_users_role", sql`role IN ('client', 'trainer')`),
    check("ck_users_login_method", sql`login_method IN ('code', 'password', 'two_factor')`),
    check(
      "ck_users_deactivation_reason",
      sql`deactivation_reason IN ('user_request', 'unverified_email')`,
    ),
  ],
);

export const user_profiles = pgTable(
  "user_profiles",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    full_name: varchar("full_name", { length: 255 }).notNull(),
    first_name: varchar("first_name", { length: 255 }).notNull().default(""),
    last_name: varchar("last_name", { length: 255 }),
    middle_name: varchar("middle_name", { length: 255 }),
    gender: varchar("gender", { length: 30, enum: ["male", "female"] }),
    birth_date: date("birth_date"),
    city: varchar("city", { length: 120 }),
    injuries: text("injuries"),
    clients_per_month: smallint("clients_per_month"),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_user_profiles_user_id").on(t.user_id),
    check("ck_user_profiles_gender", sql`gender IN ('male', 'female')`),
  ],
);

export const user_settings = pgTable(
  "user_settings",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weight_unit: varchar("weight_unit", { length: 5 }).notNull().default("kg"),
    height_unit: varchar("height_unit", { length: 5 }).notNull().default("cm"),
    theme: varchar("theme", { length: 10 }).notNull().default("system"),
    notifications_enabled: boolean("notifications_enabled").notNull().default(true),
    // Ни читается, ни пишется: какие уведомления хочет пользователь, описывает
    // только таблица notification_settings. Колонка оставлена с NOT NULL
    // default, чтобы обойтись без миграции — как weight_unit/height_unit выше.
    notification_types: jsonb("notification_types")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({
        workout_reminders: true,
        measurement_reminders: true,
        progress_updates: true,
        weekly_reports: false,
        motivation: true,
        product_news: false,
      }),
    analytics_config: jsonb("analytics_config").$type<Record<string, unknown>>(),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("uq_user_settings_user_id").on(t.user_id)],
);

export const refresh_tokens = pgTable(
  "refresh_tokens",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token_hash: varchar("token_hash", { length: 64 }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revoked_at: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_refresh_tokens_token_hash").on(t.token_hash),
    index("ix_refresh_tokens_user_id").on(t.user_id),
  ],
);

export const verification_codes = pgTable(
  "verification_codes",
  {
    contact: varchar("contact", { length: 255 }).notNull(),
    code_hash: varchar("code_hash", { length: 64 }).notNull(),
    purpose: varchar("purpose", {
      length: 30,
      enum: [
        "register",
        "password_reset",
        "login",
        "verify_email",
        "verify_phone",
        "change_email",
        "change_phone",
        "change_login_method",
        "account_delete",
      ],
    }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    attempts: smallint("attempts").notNull().default(0),
    used_at: timestamp("used_at", { withTimezone: true, mode: "date" }),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_verification_codes_user_id").on(t.user_id),
    index("ix_verification_codes_contact_purpose").on(t.contact, t.purpose),
    check(
      "ck_verification_codes_purpose",
      sql`purpose IN ('register', 'password_reset', 'login', 'verify_email', 'verify_phone', 'change_email', 'change_phone', 'change_login_method', 'account_delete')`,
    ),
  ],
);

export const code_send_attempts = pgTable(
  "code_send_attempts",
  {
    contact: varchar("contact", { length: 255 }).notNull(),
    ip: varchar("ip", { length: 45 }),
    purpose: varchar("purpose", {
      length: 30,
      enum: [
        "register",
        "password_reset",
        "login",
        "verify_email",
        "verify_phone",
        "change_email",
        "change_phone",
        "change_login_method",
        "account_delete",
      ],
    }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_code_send_attempts_contact_created").on(t.contact, t.created_at),
    index("ix_code_send_attempts_ip_created").on(t.ip, t.created_at),
    check(
      "ck_code_send_attempts_purpose",
      sql`purpose IN ('register', 'password_reset', 'login', 'verify_email', 'verify_phone', 'change_email', 'change_phone', 'change_login_method', 'account_delete')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Training — exercise catalog (module: training)
// ---------------------------------------------------------------------------

export const exercise_categories = pgTable(
  "exercise_categories",
  {
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    image_key: varchar("image_key", { length: 512 }),
    position: integer("position").notNull().default(0),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("uq_exercise_categories_slug").on(t.slug)],
);

export const exercises = pgTable(
  "exercises",
  {
    category_id: uuid("category_id")
      .notNull()
      .references(() => exercise_categories.id),
    name: varchar("name", { length: 255 }).notNull(),
    alt_names: jsonb("alt_names").$type<string[]>().notNull().default([]),
    difficulty: exercise_difficulty("difficulty").notNull(),
    description: text("description").notNull().default(""),
    steps: jsonb("steps").$type<string[]>().notNull().default([]),
    contraindications: text("contraindications"),
    owner_id: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_exercises_category_id").on(t.category_id),
    index("ix_exercises_owner_id").on(t.owner_id),
  ],
);

export const exercise_media = pgTable(
  "exercise_media",
  {
    exercise_id: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    kind: exercise_media_kind("kind").notNull(),
    object_key: varchar("object_key", { length: 512 }),
    url: varchar("url", { length: 1024 }),
    position: integer("position").notNull().default(0),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "ck_exercise_media_ck_exercise_media_object_key_xor_url",
      sql`(object_key IS NULL) != (url IS NULL)`,
    ),
    index("ix_exercise_media_exercise_id").on(t.exercise_id),
  ],
);

export const exercise_favorites = pgTable(
  "exercise_favorites",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exercise_id: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("uq_exercise_favorites_user_id").on(t.user_id, t.exercise_id)],
);

export const exercise_shares = pgTable(
  "exercise_shares",
  {
    exercise_id: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_exercise_shares_exercise_user").on(t.exercise_id, t.user_id),
    index("ix_exercise_shares_exercise_id").on(t.exercise_id),
    index("ix_exercise_shares_user_id").on(t.user_id),
  ],
);

// ---------------------------------------------------------------------------
// Training — trainer/client relationships (module: training)
// managed_clients also backs the auth module's client-without-account flow.
// ---------------------------------------------------------------------------

export const link_requests = pgTable(
  "link_requests",
  {
    from_user_id: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    to_user_id: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", {
      length: 30,
      enum: ["pending", "accepted", "declined", "cancelled"],
    }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_link_requests_from_status").on(t.from_user_id, t.status),
    uniqueIndex("uq_link_requests_pending_pair")
      .on(sql`least(from_user_id, to_user_id)`, sql`greatest(from_user_id, to_user_id)`)
      .where(sql`status = 'pending'`),
    index("ix_link_requests_to_status").on(t.to_user_id, t.status),
    check(
      "ck_link_requests_status",
      sql`status IN ('pending', 'accepted', 'declined', 'cancelled')`,
    ),
  ],
);

export const managed_clients = pgTable(
  "managed_clients",
  {
    owner_id: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    display_name: varchar("display_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    injuries: text("injuries"),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ix_managed_clients_owner").on(t.owner_id)],
);

export const trainer_clients = pgTable(
  "trainer_clients",
  {
    trainer_id: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    managed_client_id: uuid("managed_client_id").references(() => managed_clients.id, {
      onDelete: "cascade",
    }),
    status: varchar("status", { length: 30, enum: ["active", "archived", "unlinked"] }).notNull(),
    start_date: date("start_date").notNull(),
    end_date: date("end_date"),
    note: text("note"),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "ck_trainer_clients_exactly_one_subject",
      sql`(user_id IS NULL) <> (managed_client_id IS NULL)`,
    ),
    index("ix_trainer_clients_trainer_status").on(t.trainer_id, t.status),
    uniqueIndex("uq_trainer_clients_trainer_user")
      .on(t.trainer_id, t.user_id)
      .where(sql`user_id IS NOT NULL`),
    check("ck_trainer_clients_status", sql`status IN ('active', 'archived', 'unlinked')`),
  ],
);

export const trainer_client_periods = pgTable(
  "trainer_client_periods",
  {
    trainer_client_id: uuid("trainer_client_id")
      .notNull()
      .references(() => trainer_clients.id, { onDelete: "cascade" }),
    start_date: timestamp("start_date", { withTimezone: true, mode: "date" }).notNull(),
    end_date: timestamp("end_date", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_trainer_client_periods_card_start").on(t.trainer_client_id, t.start_date),
    uniqueIndex("uq_trainer_client_periods_open")
      .on(t.trainer_client_id)
      .where(sql`end_date IS NULL`),
    check("ck_trainer_client_period_bounds", sql`end_date IS NULL OR end_date >= start_date`),
  ],
);

// ---------------------------------------------------------------------------
// Training — programs (module: training)
// programs.source_program_id self-references via `(): AnyPgColumn => programs.id`,
// which is a lazy callback, so the self-reference is safe regardless of order.
// ---------------------------------------------------------------------------

export const programs = pgTable("programs", {
  owner_id: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  kind: program_kind("kind").notNull(),
  assigned_by: uuid("assigned_by").references(() => users.id),
  assigned_client_id: uuid("assigned_client_id").references(() => trainer_clients.id),
  source_program_id: uuid("source_program_id").references((): AnyPgColumn => programs.id, {
    onDelete: "set null",
  }),
  for_trainer_client_id: uuid("for_trainer_client_id").references(() => trainer_clients.id, {
    onDelete: "set null",
  }),
  deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  id: uuid("id").defaultRandom().primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const program_days = pgTable(
  "program_days",
  {
    program_id: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    position: smallint("position").notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ix_program_days_program_id").on(t.program_id)],
);

export const program_slots = pgTable(
  "program_slots",
  {
    day_id: uuid("day_id")
      .notNull()
      .references(() => program_days.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ix_program_slots_day_id").on(t.day_id)],
);

export const program_slot_exercises = pgTable(
  "program_slot_exercises",
  {
    slot_id: uuid("slot_id")
      .notNull()
      .references(() => program_slots.id, { onDelete: "cascade" }),
    exercise_id: uuid("exercise_id").references(() => exercises.id, { onDelete: "set null" }),
    custom_name: varchar("custom_name", { length: 255 }),
    sets: smallint("sets").notNull(),
    reps: smallint("reps").notNull(),
    variant_order: smallint("variant_order").notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ix_program_slot_exercises_slot_id").on(t.slot_id)],
);

// ---------------------------------------------------------------------------
// Training — workouts & calendar (module: training)
// ---------------------------------------------------------------------------

export const workout_sessions = pgTable(
  "workout_sessions",
  {
    program_id: uuid("program_id")
      .notNull()
      .references(() => programs.id),
    day_id: uuid("day_id")
      .notNull()
      .references(() => program_days.id),
    self_user_id: uuid("self_user_id").references(() => users.id, { onDelete: "cascade" }),
    trainer_client_id: uuid("trainer_client_id").references(() => trainer_clients.id, {
      onDelete: "cascade",
    }),
    seq_number: integer("seq_number").notNull(),
    started_at: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    local_date: date("local_date").notNull(),
    finished_at: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    status: workout_session_status("status").notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "ck_workout_sessions_exactly_one_owner",
      sql`(self_user_id IS NULL) <> (trainer_client_id IS NULL)`,
    ),
    index("ix_workout_sessions_self_user_id").on(t.self_user_id),
    uniqueIndex("uq_workout_sessions_self_seq")
      .on(t.self_user_id, t.seq_number)
      .where(sql`self_user_id IS NOT NULL`),
    index("ix_workout_sessions_trainer_client_id").on(t.trainer_client_id),
    uniqueIndex("uq_workout_sessions_card_seq")
      .on(t.trainer_client_id, t.seq_number)
      .where(sql`trainer_client_id IS NOT NULL`),
  ],
);

export const workout_session_exercises = pgTable(
  "workout_session_exercises",
  {
    session_id: uuid("session_id")
      .notNull()
      .references(() => workout_sessions.id, { onDelete: "cascade" }),
    slot_id: uuid("slot_id")
      .notNull()
      .references(() => program_slots.id),
    chosen_variant_id: uuid("chosen_variant_id")
      .notNull()
      .references(() => program_slot_exercises.id),
    is_completed: boolean("is_completed").notNull().default(false),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ix_workout_session_exercises_session_id").on(t.session_id)],
);

export const workout_sets = pgTable(
  "workout_sets",
  {
    session_id: uuid("session_id")
      .notNull()
      .references(() => workout_sessions.id, { onDelete: "cascade" }),
    slot_id: uuid("slot_id")
      .notNull()
      .references(() => program_slots.id),
    variant_id: uuid("variant_id")
      .notNull()
      .references(() => program_slot_exercises.id),
    weight: numeric("weight", { precision: 6, scale: 2, mode: "number" }).notNull(),
    reps: smallint("reps").notNull(),
    performed_at: timestamp("performed_at", { withTimezone: true, mode: "date" }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_workout_sets_variant_id").on(t.variant_id),
    index("ix_workout_sets_session_id").on(t.session_id),
  ],
);

export const calendar_events = pgTable(
  "calendar_events",
  {
    owner_user_id: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    program_id: uuid("program_id").references(() => programs.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    time: time("time").notNull(),
    type: varchar("type", { length: 30, enum: ["personal", "with_clients"] }).notNull(),
    status: varchar("status", {
      length: 30,
      enum: ["planned", "completed", "cancelled"],
    }).notNull(),
    workout_session_id: uuid("workout_session_id").references(() => workout_sessions.id, {
      onDelete: "set null",
    }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_calendar_events_program_id").on(t.program_id),
    index("ix_calendar_events_workout_session_id").on(t.workout_session_id),
    index("ix_calendar_events_owner_date").on(t.owner_user_id, t.date),
    check("ck_calendar_events_type", sql`type IN ('personal', 'with_clients')`),
    check("ck_calendar_events_status", sql`status IN ('planned', 'completed', 'cancelled')`),
  ],
);

export const calendar_event_clients = pgTable(
  "calendar_event_clients",
  {
    event_id: uuid("event_id")
      .notNull()
      .references(() => calendar_events.id, { onDelete: "cascade" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => trainer_clients.id, { onDelete: "cascade" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("uq_calendar_event_clients_event_id").on(t.event_id, t.client_id)],
);

// ---------------------------------------------------------------------------
// Training — measurements & photos (module: training)
// ---------------------------------------------------------------------------

export const custom_measurement_fields = pgTable(
  "custom_measurement_fields",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    name: varchar("name", { length: 50 }).notNull(),
    unit: varchar("unit", { length: 10 }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("uq_custom_measurement_fields_user_id").on(t.user_id, t.slot)],
);

export const measurements = pgTable(
  "measurements",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    height: numeric("height", { precision: 5, scale: 1, mode: "number" }),
    weight: numeric("weight", { precision: 5, scale: 1, mode: "number" }),
    waist: numeric("waist", { precision: 5, scale: 1, mode: "number" }),
    chest: numeric("chest", { precision: 5, scale: 1, mode: "number" }),
    hips: numeric("hips", { precision: 5, scale: 1, mode: "number" }),
    thigh: numeric("thigh", { precision: 5, scale: 1, mode: "number" }),
    shoulder: numeric("shoulder", { precision: 5, scale: 1, mode: "number" }),
    ankle: numeric("ankle", { precision: 5, scale: 1, mode: "number" }),
    calf: numeric("calf", { precision: 5, scale: 1, mode: "number" }),
    biceps: numeric("biceps", { precision: 5, scale: 1, mode: "number" }),
    forearm: numeric("forearm", { precision: 5, scale: 1, mode: "number" }),
    wrist: numeric("wrist", { precision: 5, scale: 1, mode: "number" }),
    neck: numeric("neck", { precision: 5, scale: 1, mode: "number" }),
    custom_values: jsonb("custom_values")
      .$type<{ slot: number; value: number }[]>()
      .notNull()
      .default([]),
    created_by_user_id: uuid("created_by_user_id").references(() => users.id),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("uq_measurements_user_id").on(t.user_id, t.date)],
);

export const measurement_photos = pgTable(
  "measurement_photos",
  {
    measurement_id: uuid("measurement_id")
      .notNull()
      .references(() => measurements.id, { onDelete: "cascade" }),
    kind: photo_kind("kind").notNull(),
    object_key: varchar("object_key", { length: 512 }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("uq_measurement_photos_measurement_id").on(t.measurement_id, t.kind)],
);

// ---------------------------------------------------------------------------
// Commerce (module: commerce)
// ---------------------------------------------------------------------------

export const payments = pgTable(
  "payments",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("RUB"),
    plan: varchar("plan", { length: 30, enum: ["m1", "m6", "m12"] }).notNull(),
    kind: varchar("kind", {
      length: 30,
      enum: ["purchase", "renewal", "gift", "referral_bonus"],
    }).notNull(),
    status: varchar("status", { length: 30, enum: ["pending", "succeeded", "failed", "cancelled"] })
      .notNull()
      .default("pending"),
    provider_payment_id: varchar("provider_payment_id", { length: 128 }),
    request_id: uuid("request_id"),
    confirmation_url: text("confirmation_url"),
    recipient_user_id: uuid("recipient_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_payments_request").on(t.user_id, t.request_id),
    unique("uq_payments_provider_payment_id").on(t.provider_payment_id),
    index("ix_payments_user_id").on(t.user_id),
    check("ck_payments_plan", sql`plan IN ('m1', 'm6', 'm12')`),
    check("ck_payments_kind", sql`kind IN ('purchase', 'renewal', 'gift', 'referral_bonus')`),
    check("ck_payments_status", sql`status IN ('pending', 'succeeded', 'failed', 'cancelled')`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: varchar("tier", { length: 32 }).notNull().default("premium"),
    starts_at: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    status: varchar("status", { length: 30, enum: ["active", "expired", "cancelled"] })
      .notNull()
      .default("active"),
    auto_renew: boolean("auto_renew").notNull().default(false),
    source_payment_id: uuid("source_payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_subscriptions_user_id").on(t.user_id),
    uniqueIndex("uq_subscriptions_active_open_term")
      .on(t.user_id)
      .where(sql`ends_at IS NULL AND status = 'active'`),
    check("ck_subscriptions_status", sql`status IN ('active', 'expired', 'cancelled')`),
  ],
);

export const referrals = pgTable(
  "referrals",
  {
    referrer_id: uuid("referrer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referred_user_id: uuid("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 30, enum: ["pending", "qualified"] })
      .notNull()
      .default("pending"),
    bonus_granted_at: timestamp("bonus_granted_at", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_referrals_referred_user_id").on(t.referred_user_id),
    index("ix_referrals_referrer_id").on(t.referrer_id),
    check("ck_referrals_status", sql`status IN ('pending', 'qualified')`),
  ],
);

// ---------------------------------------------------------------------------
// Messaging (module: messaging)
// Notifications, push delivery and support conversations.
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", {
      length: 30,
      enum: [
        "workout_reminder",
        "subscription",
        "referral",
        "support",
        "system",
        "link_request",
        "account",
      ],
    }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: varchar("body", { length: 2000 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    is_read: boolean("is_read").notNull().default(false),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_notifications_user_id").on(t.user_id),
    index("ix_notifications_is_read").on(t.is_read),
    check(
      "ck_notifications_type",
      sql`type IN ('workout_reminder', 'subscription', 'referral', 'support', 'system', 'link_request', 'account')`,
    ),
  ],
);

export const notification_settings = pgTable(
  "notification_settings",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    push_enabled: boolean("push_enabled").notNull().default(true),
    workout_reminders: boolean("workout_reminders").notNull().default(true),
    measurement_reminders: boolean("measurement_reminders").notNull().default(true),
    progress_updates: boolean("progress_updates").notNull().default(true),
    weekly_reports: boolean("weekly_reports").notNull().default(false),
    motivational: boolean("motivational").notNull().default(true),
    new_features: boolean("new_features").notNull().default(false),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_notification_settings_user_id").on(t.user_id),
    index("ix_notification_settings_user_id").on(t.user_id),
  ],
);

export const push_tokens = pgTable(
  "push_tokens",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 1024 }).notNull(),
    platform: varchar("platform", { length: 16 }).notNull(),
    p256dh: varchar("p256dh", { length: 256 }),
    auth: varchar("auth", { length: 256 }),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_push_tokens_token").on(t.token),
    index("ix_push_tokens_user_id").on(t.user_id),
  ],
);

export const support_tickets = pgTable(
  "support_tickets",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 255 }).notNull(),
    message: varchar("message", { length: 5000 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull().default("in_app"),
    status: varchar("status", { length: 30, enum: ["open", "answered", "closed"] })
      .notNull()
      .default("open"),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_support_tickets_user_id").on(t.user_id),
    check("ck_support_tickets_status", sql`status IN ('open', 'answered', 'closed')`),
  ],
);

export const support_replies = pgTable(
  "support_replies",
  {
    ticket_id: uuid("ticket_id")
      .notNull()
      .references(() => support_tickets.id, { onDelete: "cascade" }),
    author: varchar("author", { length: 30, enum: ["user", "admin"] }).notNull(),
    body: varchar("body", { length: 5000 }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_support_replies_ticket_id").on(t.ticket_id),
    check("ck_support_replies_author", sql`author IN ('user', 'admin')`),
  ],
);

// ---------------------------------------------------------------------------
// Platform / scheduler (module: messaging infrastructure)
// Bookkeeping for scheduled background jobs; not domain data.
// ---------------------------------------------------------------------------

export const scheduler_runs = pgTable(
  "scheduler_runs",
  {
    task_name: varchar("task_name", { length: 64 }).notNull(),
    run_date: date("run_date").notNull(),
    status: varchar("status", { length: 30, enum: ["running", "success", "failed"] }).notNull(),
    detail: varchar("detail", { length: 500 }),
    started_at: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    finished_at: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_scheduler_runs_task_name").on(t.task_name, t.run_date),
    check("ck_scheduler_runs_status", sql`status IN ('running', 'success', 'failed')`),
  ],
);

// A separate entitlement cycle never changes the underlying trainer-client relationship.
export const free_selections = pgTable("free_selections", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  cycle: text("cycle").notNull(),
  confirmed: boolean("confirmed").notNull().default(false),
  program_ids: jsonb("program_ids").$type<string[]>().notNull().default([]),
  client_ids: jsonb("client_ids").$type<string[]>().notNull().default([]),
});
