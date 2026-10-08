ALTER TABLE "technician_applications" ADD COLUMN "meeting_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "technician_applications" ADD COLUMN "meeting_place" varchar(200);--> statement-breakpoint
ALTER TABLE "technician_applications" ADD COLUMN "meeting_note" text;