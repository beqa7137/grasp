SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "stories" (
	"learner_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"competency_ids" text[] NOT NULL,
	"draft" jsonb NOT NULL,
	"rehearsal" jsonb,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stories_learner_id_id_pk" PRIMARY KEY("learner_id","id")
);
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;