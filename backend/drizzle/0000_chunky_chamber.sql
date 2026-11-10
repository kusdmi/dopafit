CREATE TYPE "public"."exercise_difficulty" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."exercise_media_kind" AS ENUM('image', 'video', 'gif', 'iframe');--> statement-breakpoint
CREATE TYPE "public"."photo_kind" AS ENUM('front', 'back', 'left', 'right');--> statement-breakpoint
CREATE TYPE "public"."program_kind" AS ENUM('strength', 'functional', 'cardio', 'plyometric', 'custom');--> statement-breakpoint
CREATE TYPE "public"."workout_session_status" AS ENUM('in_progress', 'finished', 'cancelled');--> statement-breakpoint
CREATE TABLE "calendar_event_clients" (
	"event_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_calendar_event_clients_event_id" UNIQUE("event_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"owner_user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"time" time NOT NULL,
	"type" varchar(30) NOT NULL,
	"status" varchar(30) NOT NULL,
	"workout_session_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_calendar_events_type" CHECK (type IN ('personal', 'with_clients')),
	CONSTRAINT "ck_calendar_events_status" CHECK (status IN ('planned', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "code_send_attempts" (
	"contact" varchar(255) NOT NULL,
	"ip" varchar(45),
	"purpose" varchar(30) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_code_send_attempts_purpose" CHECK (purpose IN ('register', 'password_reset', 'login', 'verify_email', 'verify_phone', 'change_email', 'change_phone', 'change_login_method', 'account_delete'))
);
--> statement-breakpoint
CREATE TABLE "custom_measurement_fields" (
	"user_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"unit" varchar(10) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_custom_measurement_fields_user_id" UNIQUE("user_id","slot")
);
--> statement-breakpoint
CREATE TABLE "exercise_categories" (
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"emoji" varchar(16) NOT NULL,
	"image_key" varchar(512),
	"position" integer DEFAULT 0 NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_exercise_categories_slug" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "exercise_favorites" (
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_exercise_favorites_user_id" UNIQUE("user_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_media" (
	"exercise_id" uuid NOT NULL,
	"kind" "exercise_media_kind" NOT NULL,
	"object_key" varchar(512),
	"url" varchar(1024),
	"position" integer DEFAULT 0 NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_exercise_media_ck_exercise_media_object_key_xor_url" CHECK ((object_key IS NULL) != (url IS NULL))
);
--> statement-breakpoint
CREATE TABLE "exercise_shares" (
	"exercise_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_exercise_shares_exercise_user" UNIQUE("exercise_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"category_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"alt_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty" "exercise_difficulty" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contraindications" text,
	"owner_id" uuid,
	"deleted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_requests" (
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"status" varchar(30) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_link_requests_status" CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "managed_clients" (
	"owner_id" uuid NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"phone" varchar(20),
	"injuries" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_photos" (
	"measurement_id" uuid NOT NULL,
	"kind" "photo_kind" NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_measurement_photos_measurement_id" UNIQUE("measurement_id","kind")
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"height" numeric(5, 1),
	"weight" numeric(5, 1),
	"waist" numeric(5, 1),
	"chest" numeric(5, 1),
	"hips" numeric(5, 1),
	"thigh" numeric(5, 1),
	"shoulder" numeric(5, 1),
	"ankle" numeric(5, 1),
	"calf" numeric(5, 1),
	"biceps" numeric(5, 1),
	"forearm" numeric(5, 1),
	"wrist" numeric(5, 1),
	"neck" numeric(5, 1),
	"custom_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_measurements_user_id" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" uuid NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"workout_reminders" boolean DEFAULT true NOT NULL,
	"measurement_reminders" boolean DEFAULT true NOT NULL,
	"progress_updates" boolean DEFAULT true NOT NULL,
	"weekly_reports" boolean DEFAULT false NOT NULL,
	"motivational" boolean DEFAULT true NOT NULL,
	"new_features" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_notification_settings_user_id" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"user_id" uuid NOT NULL,
	"type" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" varchar(2000) NOT NULL,
	"payload" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_notifications_type" CHECK (type IN ('workout_reminder', 'subscription', 'referral', 'support', 'system', 'link_request', 'account'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'RUB' NOT NULL,
	"plan" varchar(30) NOT NULL,
	"kind" varchar(30) NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"provider_payment_id" varchar(128),
	"recipient_user_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_payments_provider_payment_id" UNIQUE("provider_payment_id"),
	CONSTRAINT "ck_payments_plan" CHECK (plan IN ('m1', 'm6', 'm12')),
	CONSTRAINT "ck_payments_kind" CHECK (kind IN ('purchase', 'renewal', 'gift', 'referral_bonus')),
	CONSTRAINT "ck_payments_status" CHECK (status IN ('pending', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "program_days" (
	"program_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" smallint NOT NULL,
	"deleted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_slot_exercises" (
	"slot_id" uuid NOT NULL,
	"exercise_id" uuid,
	"custom_name" varchar(255),
	"sets" smallint NOT NULL,
	"reps" smallint NOT NULL,
	"variant_order" smallint NOT NULL,
	"deleted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_slots" (
	"day_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"deleted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"owner_id" uuid,
	"name" varchar(255) NOT NULL,
	"kind" "program_kind" NOT NULL,
	"source_program_id" uuid,
	"for_trainer_client_id" uuid,
	"deleted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"user_id" uuid NOT NULL,
	"token" varchar(1024) NOT NULL,
	"platform" varchar(16) NOT NULL,
	"p256dh" varchar(256),
	"auth" varchar(256),
	"last_seen_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_push_tokens_token" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"referrer_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"bonus_granted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_referrals_referred_user_id" UNIQUE("referred_user_id"),
	CONSTRAINT "ck_referrals_status" CHECK (status IN ('pending', 'qualified'))
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_refresh_tokens_token_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "scheduler_runs" (
	"task_name" varchar(64) NOT NULL,
	"run_date" date NOT NULL,
	"status" varchar(30) NOT NULL,
	"detail" varchar(500),
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_scheduler_runs_task_name" UNIQUE("task_name","run_date"),
	CONSTRAINT "ck_scheduler_runs_status" CHECK (status IN ('running', 'success', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid NOT NULL,
	"tier" varchar(32) DEFAULT 'premium' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"source_payment_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_subscriptions_status" CHECK (status IN ('active', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "support_replies" (
	"ticket_id" uuid NOT NULL,
	"author" varchar(30) NOT NULL,
	"body" varchar(5000) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_support_replies_author" CHECK (author IN ('user', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"user_id" uuid NOT NULL,
	"subject" varchar(255) NOT NULL,
	"message" varchar(5000) NOT NULL,
	"channel" varchar(16) DEFAULT 'in_app' NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_support_tickets_status" CHECK (status IN ('open', 'answered', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "trainer_client_periods" (
	"trainer_client_id" uuid NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_trainer_client_period_bounds" CHECK (end_date IS NULL OR end_date >= start_date)
);
--> statement-breakpoint
CREATE TABLE "trainer_clients" (
	"trainer_id" uuid NOT NULL,
	"user_id" uuid,
	"managed_client_id" uuid,
	"status" varchar(30) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"note" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_trainer_clients_exactly_one_subject" CHECK ((user_id IS NULL) <> (managed_client_id IS NULL)),
	CONSTRAINT "ck_trainer_clients_status" CHECK (status IN ('active', 'archived', 'unlinked'))
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"gender" varchar(30),
	"birth_date" date,
	"city" varchar(120),
	"injuries" text,
	"clients_per_month" smallint,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_profiles_user_id" UNIQUE("user_id"),
	CONSTRAINT "ck_user_profiles_gender" CHECK (gender IN ('male', 'female'))
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid NOT NULL,
	"weight_unit" varchar(5) DEFAULT 'kg' NOT NULL,
	"height_unit" varchar(5) DEFAULT 'cm' NOT NULL,
	"theme" varchar(10) DEFAULT 'system' NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"notification_types" jsonb DEFAULT '{"workout_reminders":true,"measurement_reminders":true,"progress_updates":true,"weekly_reports":false,"motivation":true,"product_news":false}'::jsonb NOT NULL,
	"analytics_config" jsonb,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_settings_user_id" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"email" varchar(255),
	"phone" varchar(20),
	"password_hash" varchar(255),
	"role" varchar(30) NOT NULL,
	"referral_code" varchar(16) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"login_method" varchar(30) DEFAULT 'code' NOT NULL,
	"verification_deadline_at" timestamp with time zone,
	"personal_data_consent_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivation_reason" varchar(30),
	"anonymized_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_users_referral_code" UNIQUE("referral_code"),
	CONSTRAINT "uq_users_phone" UNIQUE("phone"),
	CONSTRAINT "ck_users_role" CHECK (role IN ('client', 'trainer')),
	CONSTRAINT "ck_users_login_method" CHECK (login_method IN ('code', 'password', 'two_factor')),
	CONSTRAINT "ck_users_deactivation_reason" CHECK (deactivation_reason IN ('user_request', 'unverified_email'))
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"contact" varchar(255) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"purpose" varchar(30) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"user_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_verification_codes_purpose" CHECK (purpose IN ('register', 'password_reset', 'login', 'verify_email', 'verify_phone', 'change_email', 'change_phone', 'change_login_method', 'account_delete'))
);
--> statement-breakpoint
CREATE TABLE "workout_session_exercises" (
	"session_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"chosen_variant_id" uuid NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"program_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"self_user_id" uuid,
	"trainer_client_id" uuid,
	"seq_number" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "workout_session_status" NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_workout_sessions_exactly_one_owner" CHECK ((self_user_id IS NULL) <> (trainer_client_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"session_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"weight" numeric(6, 2) NOT NULL,
	"reps" smallint NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_event_clients" ADD CONSTRAINT "calendar_event_clients_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_clients" ADD CONSTRAINT "calendar_event_clients_client_id_trainer_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."trainer_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_workout_session_id_workout_sessions_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_measurement_fields" ADD CONSTRAINT "custom_measurement_fields_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_favorites" ADD CONSTRAINT "exercise_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_favorites" ADD CONSTRAINT "exercise_favorites_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_shares" ADD CONSTRAINT "exercise_shares_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_shares" ADD CONSTRAINT "exercise_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_category_id_exercise_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."exercise_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_requests" ADD CONSTRAINT "link_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_requests" ADD CONSTRAINT "link_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_clients" ADD CONSTRAINT "managed_clients_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_photos" ADD CONSTRAINT "measurement_photos_measurement_id_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_slot_exercises" ADD CONSTRAINT "program_slot_exercises_slot_id_program_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."program_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_slot_exercises" ADD CONSTRAINT "program_slot_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_slots" ADD CONSTRAINT "program_slots_day_id_program_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."program_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_source_program_id_programs_id_fk" FOREIGN KEY ("source_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_for_trainer_client_id_trainer_clients_id_fk" FOREIGN KEY ("for_trainer_client_id") REFERENCES "public"."trainer_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_source_payment_id_payments_id_fk" FOREIGN KEY ("source_payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_replies" ADD CONSTRAINT "support_replies_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_client_periods" ADD CONSTRAINT "trainer_client_periods_trainer_client_id_trainer_clients_id_fk" FOREIGN KEY ("trainer_client_id") REFERENCES "public"."trainer_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_clients" ADD CONSTRAINT "trainer_clients_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_clients" ADD CONSTRAINT "trainer_clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_clients" ADD CONSTRAINT "trainer_clients_managed_client_id_managed_clients_id_fk" FOREIGN KEY ("managed_client_id") REFERENCES "public"."managed_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_slot_id_program_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."program_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_chosen_variant_id_program_slot_exercises_id_fk" FOREIGN KEY ("chosen_variant_id") REFERENCES "public"."program_slot_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_day_id_program_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."program_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_self_user_id_users_id_fk" FOREIGN KEY ("self_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_trainer_client_id_trainer_clients_id_fk" FOREIGN KEY ("trainer_client_id") REFERENCES "public"."trainer_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_slot_id_program_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."program_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_variant_id_program_slot_exercises_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."program_slot_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_calendar_events_workout_session_id" ON "calendar_events" USING btree ("workout_session_id");--> statement-breakpoint
CREATE INDEX "ix_calendar_events_owner_date" ON "calendar_events" USING btree ("owner_user_id","date");--> statement-breakpoint
CREATE INDEX "ix_code_send_attempts_contact_created" ON "code_send_attempts" USING btree ("contact","created_at");--> statement-breakpoint
CREATE INDEX "ix_code_send_attempts_ip_created" ON "code_send_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "ix_exercise_media_exercise_id" ON "exercise_media" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "ix_exercise_shares_exercise_id" ON "exercise_shares" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "ix_exercise_shares_user_id" ON "exercise_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_exercises_category_id" ON "exercises" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "ix_exercises_owner_id" ON "exercises" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ix_link_requests_from_status" ON "link_requests" USING btree ("from_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_link_requests_pending_pair" ON "link_requests" USING btree (least(from_user_id, to_user_id),greatest(from_user_id, to_user_id)) WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "ix_link_requests_to_status" ON "link_requests" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE INDEX "ix_managed_clients_owner" ON "managed_clients" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ix_notification_settings_user_id" ON "notification_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_notifications_is_read" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "ix_payments_user_id" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_program_days_program_id" ON "program_days" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "ix_program_slot_exercises_slot_id" ON "program_slot_exercises" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "ix_program_slots_day_id" ON "program_slots" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "ix_push_tokens_user_id" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_referrals_referrer_id" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "ix_refresh_tokens_user_id" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_subscriptions_user_id" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_support_replies_ticket_id" ON "support_replies" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ix_support_tickets_user_id" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_trainer_client_periods_card_start" ON "trainer_client_periods" USING btree ("trainer_client_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_trainer_client_periods_open" ON "trainer_client_periods" USING btree ("trainer_client_id") WHERE end_date IS NULL;--> statement-breakpoint
CREATE INDEX "ix_trainer_clients_trainer_status" ON "trainer_clients" USING btree ("trainer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_trainer_clients_trainer_user" ON "trainer_clients" USING btree ("trainer_id","user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email_lower" ON "users" USING btree (lower(email));--> statement-breakpoint
CREATE INDEX "ix_verification_codes_user_id" ON "verification_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_verification_codes_contact_purpose" ON "verification_codes" USING btree ("contact","purpose");--> statement-breakpoint
CREATE INDEX "ix_workout_session_exercises_session_id" ON "workout_session_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ix_workout_sessions_self_user_id" ON "workout_sessions" USING btree ("self_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workout_sessions_self_seq" ON "workout_sessions" USING btree ("self_user_id","seq_number") WHERE self_user_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_workout_sessions_trainer_client_id" ON "workout_sessions" USING btree ("trainer_client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workout_sessions_card_seq" ON "workout_sessions" USING btree ("trainer_client_id","seq_number") WHERE trainer_client_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_workout_sets_variant_id" ON "workout_sets" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "ix_workout_sets_session_id" ON "workout_sets" USING btree ("session_id");