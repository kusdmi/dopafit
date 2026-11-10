CREATE TABLE "free_selections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"cycle" text NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"program_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"client_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "confirmation_url" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "assigned_by" uuid;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "assigned_client_id" uuid;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "first_name" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "last_name" varchar(255);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "middle_name" varchar(255);--> statement-breakpoint
ALTER TABLE "free_selections" ADD CONSTRAINT "free_selections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_assigned_client_id_trainer_clients_id_fk" FOREIGN KEY ("assigned_client_id") REFERENCES "public"."trainer_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "uq_payments_request" UNIQUE("user_id","request_id");
--> statement-breakpoint
WITH names AS (SELECT id, regexp_split_to_array(trim(full_name), '\s+') parts FROM user_profiles)
UPDATE user_profiles p SET
first_name = CASE WHEN cardinality(n.parts)>=3 THEN n.parts[2] ELSE coalesce(n.parts[1],'') END,
last_name = CASE WHEN cardinality(n.parts)>=3 THEN n.parts[1] ELSE n.parts[2] END,
middle_name = CASE WHEN cardinality(n.parts)>=3 THEN array_to_string(n.parts[3:cardinality(n.parts)],' ') ELSE NULL END
FROM names n WHERE n.id=p.id;
--> statement-breakpoint
UPDATE programs p SET assigned_by=s.owner_id,assigned_client_id=coalesce(p.for_trainer_client_id,c.id)
FROM programs s LEFT JOIN trainer_clients c ON c.trainer_id=s.owner_id
WHERE p.source_program_id=s.id AND s.owner_id IS NOT NULL AND (p.for_trainer_client_id=c.id OR p.owner_id=c.user_id);
