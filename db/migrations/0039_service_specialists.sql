CREATE TABLE "service_specialists" (
	"service" varchar(64) PRIMARY KEY NOT NULL,
	"specialist_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_specialists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_specialists" ADD CONSTRAINT "service_specialists_specialist_id_users_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;