ALTER TABLE "technician_applications" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "technician_applications" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "technician_applications" ADD CONSTRAINT "technician_applications_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Applications already in progress before the two-step review (contacted or hired) count as approved,
-- so specialists keep seeing them. New ones wait for an admin.
UPDATE "technician_applications" SET "approved_at" = "created_at" WHERE "status" IN ('contacted', 'hired');
