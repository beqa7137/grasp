SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "session_families" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_families" ADD CONSTRAINT "session_families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_families_user" ON "session_families" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "session_families" ("id", "user_id", "revoked_at", "created_at")
SELECT "family_id", "user_id", max("revoked_at"), min("created_at")
FROM "refresh_tokens"
GROUP BY "family_id", "user_id";
