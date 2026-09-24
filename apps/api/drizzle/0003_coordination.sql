CREATE TABLE "counters" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"total" double precision NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "counters_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"key" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "counters_expires_at" ON "counters" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "leases_expires_at" ON "leases" USING btree ("expires_at");