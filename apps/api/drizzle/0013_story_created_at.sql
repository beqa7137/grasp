SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "created_at" timestamp with time zone;