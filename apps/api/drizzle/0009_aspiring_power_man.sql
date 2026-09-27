SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX "erased_learners_merged_into" ON "erased_learners" USING btree ("merged_into") WHERE "erased_learners"."merged_into" is not null;
