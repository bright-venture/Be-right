ALTER TABLE "service_requests" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emergency_calls" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "emergency_calls" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "emergency_calls" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "emergency_calls" ADD COLUMN "request_id" integer;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "contact_name" varchar(255);--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "emergency" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "emergency_calls" ADD CONSTRAINT "emergency_calls_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE set null ON UPDATE no action;