CREATE TABLE "emergency_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"category" varchar(64) NOT NULL,
	"problem" varchar(64) NOT NULL,
	"name" varchar(255),
	"phone" varchar(32),
	"kind" varchar(16) NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "emergency_calls" ADD CONSTRAINT "emergency_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_calls" ADD CONSTRAINT "emergency_calls_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergency_calls_created_idx" ON "emergency_calls" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "service_requests" DROP COLUMN "urgency_suggested";--> statement-breakpoint
ALTER TABLE "service_requests" DROP COLUMN "urgency_final";--> statement-breakpoint
DROP TYPE "public"."urgency_level";