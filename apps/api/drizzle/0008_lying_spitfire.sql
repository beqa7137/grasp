SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "erased_learners" ADD COLUMN "merged_into" uuid;
