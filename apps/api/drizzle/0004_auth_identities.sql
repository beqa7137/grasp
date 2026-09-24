CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "auth_identities_provider_subject" UNIQUE("provider","subject")
);
--> statement-breakpoint
CREATE TABLE "auth_one_time" (
	"hash" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"payload" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_identities_user" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_one_time_expires_at" ON "auth_one_time" USING btree ("expires_at");