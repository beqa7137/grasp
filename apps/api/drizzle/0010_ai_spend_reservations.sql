SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "ai_spend_days" (
	"day" date PRIMARY KEY NOT NULL,
	"legacy_micros" bigint DEFAULT 0 NOT NULL,
	"settled_micros" bigint DEFAULT 0 NOT NULL,
	"reserved_micros" bigint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_spend_days_legacy_range" CHECK ("ai_spend_days"."legacy_micros" between 0 and 9007199254740991),
	CONSTRAINT "ai_spend_days_settled_nonnegative" CHECK ("ai_spend_days"."settled_micros" >= 0),
	CONSTRAINT "ai_spend_days_reserved_nonnegative" CHECK ("ai_spend_days"."reserved_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_spend_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"actual_micros" bigint,
	CONSTRAINT "ai_spend_reservations_reserved_range" CHECK ("ai_spend_reservations"."reserved_micros" between 1 and 9007199254740991),
	CONSTRAINT "ai_spend_reservations_actual_range" CHECK ("ai_spend_reservations"."actual_micros" between 0 and 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "ai_spend_reservations" ADD CONSTRAINT "ai_spend_reservations_day_ai_spend_days_day_fk" FOREIGN KEY ("day") REFERENCES "public"."ai_spend_days"("day") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_spend_days_expires_at" ON "ai_spend_days" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ai_spend_reservations_day" ON "ai_spend_reservations" USING btree ("day");
--> statement-breakpoint
INSERT INTO ai_spend_days (day, legacy_micros, expires_at)
SELECT (window_start AT TIME ZONE 'UTC')::date,
  CASE WHEN total >= 0 AND total < 'Infinity'::double precision
    THEN ceil(total::text::numeric * 1000000)::bigint ELSE -1 END,
  (((window_start AT TIME ZONE 'UTC')::date + 91)::timestamp AT TIME ZONE 'UTC')
FROM counters
WHERE key = 'ai-spend-usd' AND expires_at > now();
--> statement-breakpoint
CREATE FUNCTION current_ai_spend_day() RETURNS ai_spend_days
LANGUAGE plpgsql SET lock_timeout = '1500ms' AS $$
DECLARE
  admission_day date := (statement_timestamp() AT TIME ZONE 'UTC')::date;
  current_day ai_spend_days;
  legacy_dollars numeric;
  legacy_amount numeric;
BEGIN
  INSERT INTO ai_spend_days (day, expires_at)
  VALUES (admission_day, (admission_day + 91)::timestamp AT TIME ZONE 'UTC')
  ON CONFLICT (day) DO NOTHING;

  SELECT * INTO current_day FROM ai_spend_days WHERE day = admission_day FOR UPDATE;
  SELECT total::text::numeric INTO legacy_dollars FROM counters
  WHERE key = 'ai-spend-usd' AND window_start = admission_day::timestamp AT TIME ZONE 'UTC';
  legacy_dollars := coalesce(legacy_dollars, 0);
  IF NOT (legacy_dollars >= 0 AND legacy_dollars < 'Infinity'::numeric) THEN
    RAISE EXCEPTION 'Invalid legacy spend amount' USING ERRCODE = '22003';
  END IF;
  legacy_amount := ceil(legacy_dollars * 1000000);
  IF legacy_amount > 9007199254740991 THEN
    RAISE EXCEPTION 'Spend total exceeds supported range' USING ERRCODE = '22003';
  END IF;
  IF legacy_amount > current_day.legacy_micros THEN
    UPDATE ai_spend_days SET legacy_micros = legacy_amount::bigint WHERE day = admission_day
    RETURNING * INTO current_day;
  END IF;
  RETURN current_day;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION reserve_ai_spend(request_id uuid, amount bigint, budget bigint) RETURNS date
LANGUAGE plpgsql SET lock_timeout = '1500ms' AS $$
DECLARE
  current_day ai_spend_days;
  next_total numeric;
BEGIN
  IF request_id IS NULL OR amount IS NULL OR amount NOT BETWEEN 1 AND 9007199254740991
    OR (budget IS NOT NULL AND budget NOT BETWEEN 0 AND 9007199254740991) THEN
    RAISE EXCEPTION 'Invalid spend reservation' USING ERRCODE = '22003';
  END IF;
  current_day := current_ai_spend_day();
  IF EXISTS (SELECT 1 FROM ai_spend_reservations WHERE id = request_id) THEN
    RAISE EXCEPTION 'Spend reservation already exists' USING ERRCODE = '23505';
  END IF;
  next_total := current_day.legacy_micros::numeric + current_day.settled_micros
    + current_day.reserved_micros + amount;
  IF next_total > 9007199254740991 THEN
    RAISE EXCEPTION 'Spend total exceeds supported range' USING ERRCODE = '22003';
  END IF;
  IF budget IS NOT NULL AND next_total > budget THEN RETURN NULL; END IF;

  INSERT INTO ai_spend_reservations (id, day, reserved_micros) VALUES (request_id, current_day.day, amount);
  UPDATE ai_spend_days SET reserved_micros = reserved_micros + amount WHERE day = current_day.day;
  RETURN current_day.day;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION settle_ai_spend(request_id uuid, actual bigint) RETURNS void
LANGUAGE plpgsql SET lock_timeout = '1500ms' AS $$
DECLARE
  admission_day date;
  held bigint;
BEGIN
  IF request_id IS NULL OR actual IS NULL OR actual NOT BETWEEN 0 AND 9007199254740991 THEN
    RAISE EXCEPTION 'Invalid spend settlement' USING ERRCODE = '22003';
  END IF;
  SELECT day INTO admission_day FROM ai_spend_reservations WHERE id = request_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM day FROM ai_spend_days WHERE day = admission_day FOR UPDATE;
  UPDATE ai_spend_reservations SET actual_micros = actual WHERE id = request_id AND actual_micros IS NULL
  RETURNING reserved_micros INTO held;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE ai_spend_days SET reserved_micros = reserved_micros - held, settled_micros = settled_micros + actual
  WHERE day = admission_day;
END;
$$;
