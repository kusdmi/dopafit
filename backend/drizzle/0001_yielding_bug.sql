ALTER TABLE "calendar_events" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_calendar_events_program_id" ON "calendar_events" USING btree ("program_id");