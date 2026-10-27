DROP TABLE "pricing_settings" CASCADE;--> statement-breakpoint
ALTER TABLE "service_requests" DROP CONSTRAINT "service_requests_suggested_technician_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "service_requests" DROP COLUMN "suggested_technician_id";--> statement-breakpoint
ALTER TABLE "service_requests" DROP COLUMN "price_breakdown";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "base_lat";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "base_lng";