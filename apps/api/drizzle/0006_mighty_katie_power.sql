SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "erased_learners" (
	"learner_id" uuid PRIMARY KEY NOT NULL,
	"erased_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE FUNCTION reject_erased_learner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text, 0));
  IF EXISTS (SELECT 1 FROM erased_learners WHERE learner_id = NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P4100', MESSAGE = 'Learner data was erased';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reject_erased_learner_insert
BEFORE INSERT ON learners
FOR EACH ROW EXECUTE FUNCTION reject_erased_learner();
