SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_at" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "feedback_created_at_id" ON "feedback" USING btree ("created_at","id");--> statement-breakpoint
DROP INDEX "feedback_created_at";
