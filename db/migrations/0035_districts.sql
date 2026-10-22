ALTER TABLE "service_requests" ADD COLUMN "district" varchar(32);--> statement-breakpoint
ALTER TABLE "technician_applications" ADD COLUMN "districts" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "districts" jsonb DEFAULT '[]'::jsonb NOT NULL;