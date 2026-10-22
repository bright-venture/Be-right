CREATE TABLE "technician_presence" (
	"technician_id" integer PRIMARY KEY NOT NULL,
	"available_since" timestamp with time zone,
	"lat" double precision,
	"lng" double precision,
	"accuracy" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "technician_presence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "technician_presence" ADD CONSTRAINT "technician_presence_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;