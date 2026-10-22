CREATE TABLE "pricing_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pricing_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "region" varchar(32);--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "suggested_technician_id" integer;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "price_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "base_lat" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "base_lng" double precision;--> statement-breakpoint
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_suggested_technician_id_users_id_fk" FOREIGN KEY ("suggested_technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;