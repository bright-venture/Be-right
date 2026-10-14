CREATE TABLE "emergency_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"problem" varchar(64) NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"address" text,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"request_id" integer,
	"handled_by" integer,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergency_requests_created_idx" ON "emergency_requests" USING btree ("created_at");