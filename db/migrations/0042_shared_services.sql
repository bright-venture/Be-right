-- Several specialists can share a service: the key becomes the pair (service, specialist).
ALTER TABLE "service_specialists" DROP CONSTRAINT "service_specialists_pkey";--> statement-breakpoint
ALTER TABLE "service_specialists" ADD CONSTRAINT "service_specialists_service_specialist_id_pk" PRIMARY KEY("service","specialist_id");
