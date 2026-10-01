import type pg from 'pg';
import { median, RATING_NAMES, ratio, round, utcDaysAgo, type CohortMetrics } from '../admin/cohort-metrics.js';
import type { FeedbackKind } from '../feedback/feedback.types.js';
import type { Verdict } from '../interview/interview.types.js';
import { MetricsStore } from './metrics.store.js';

/** The report reads every event; it is for the operator only, so it may run past the 3-second limit learner routes keep. */
const REPORT_TIMEOUT_MS = 30_000;

const CANDIDATE_TURNS = `
  select s.learner_id, m->>'at' as at
  from interview_sessions s, jsonb_array_elements(s.session->'messages') m
  where m->>'role' = 'candidate'`;

// A 30-minute bin never spans a session gap (more than 30 minutes) or a UTC midnight, so learner days and session
// lengths come from one parallel aggregate instead of a sort of every timestamp.
const ACTIVITY = `
  with stamps as (
    select learner_id, occurred_at as at from learning_events
    union all select learner_id, created_at from interview_sessions
    union all select learner_id, at::timestamptz from (${CANDIDATE_TURNS}) t where coalesce(at, '') <> ''
    union all select learner_id, created_at from feedback
  ), bins as (
    select learner_id, date_bin('30 minutes', at, timestamptz '1970-01-01Z') as bin, min(at) as first, max(at) as last
    from stamps group by 1, 2
  ), days as (
    select learner_id, (bin at time zone 'UTC')::date as day from bins group by 1, 2
  ), learners as (
    select min(day) as first, max(day) as last, count(*) filter (where day >= $2::date) as recent from days group by learner_id
  ), edges as (
    select learner_id, bin, first, last,
      (first <= lag(last) over w + interval '30 minutes') is not true as starts,
      (lead(first) over w <= last + interval '30 minutes') is not true as ends
    from bins window w as (partition by learner_id order by bin)
  ), sessions as (
    select ends, (extract(epoch from last - max(first) filter (where starts) over (partition by learner_id order by bin)) * 1000)::bigint as ms
    from edges where starts or ends
  )
  select l.*, d.daily, s.lower_ms, s.upper_ms
  from (
    select count(*)::int as total,
      count(*) filter (where last >= $1::date)::int as active1d,
      count(*) filter (where last >= $2::date)::int as active7d,
      count(*) filter (where first >= $2::date)::int as new7d,
      count(*) filter (where first <= $3::date)::int as d1_of,
      count(*) filter (where first <= $3::date and last >= first + 1)::int as d1,
      count(*) filter (where first <= $4::date)::int as d7_of,
      count(*) filter (where first <= $4::date and last >= first + 7)::int as d7,
      coalesce(sum(recent), 0)::int as recent_days,
      count(*) filter (where recent > 0)::int as recent_learners
    from learners
  ) l, (
    select json_object_agg(to_char(day, 'YYYY-MM-DD'), n) as daily
    from (select day, count(*)::int as n from days where day >= $5::date group by day) x
  ) d, (
    select percentile_disc(0.5) within group (order by ms) as lower_ms, percentile_disc(0.5) within group (order by ms desc) as upper_ms
    from sessions where ends
  ) s`;

const EVENTS = `
  select count(*) filter (where 'diagnostic.completed' = any(types))::int as placement,
    count(*) filter (where types && array['review.graded', 'drill.reviewed'])::int as reviewed,
    count(*) filter (where 'predict.answered' = any(types))::int as predicted,
    count(*) filter (where 'scenario.completed' = any(types))::int as mission,
    coalesce(sum(predictions), 0)::int as predictions, coalesce(sum(correct), 0)::int as correct_predictions,
    coalesce(sum(scenarios), 0)::int as scenarios, coalesce(sum(revisits), 0)::int as revisits
  from (
    select array_agg(type) as types, sum(n) filter (where type = 'predict.answered') as predictions,
      sum(correct) as correct, sum(n) filter (where type = 'scenario.completed') as scenarios, sum(revisits) as revisits
    from (
      select learner_id, type, count(*) as n,
        count(*) filter (where type = 'predict.answered' and (payload->>'correct')::boolean) as correct,
        count(*) filter (where type = 'scenario.completed' and coalesce((payload->>'variant')::numeric, 0) <> 0) as revisits
      from learning_events group by 1, 2
    ) t group by learner_id
  ) l`;

// Ordering inside the subquery lets workers sort review rows in parallel; the window then reads them in order. Legacy
// drill grades map to ratings as the engine's upcast() maps them.
const REVIEWS = `
  select count(*)::int as total, count(*) filter (where correct)::int as correct,
    ${RATING_NAMES.map((name, i) => `count(*) filter (where rating = ${i + 1})::int as ${name}`).join(', ')},
    count(*) filter (where day >= $1::date + 7)::int as last7,
    count(*) filter (where later)::int as eligible, count(*) filter (where later and correct)::int as recalled,
    array[${Array.from({ length: 14 }, (_, k) => `count(*) filter (where day = $1::date + ${k})::int`).join(', ')}] as daily
  from (
    select correct, rating, (at at time zone 'UTC')::date as day,
      at >= lag(at) over (partition by learner_id, item order by at) + interval '1 day' as later
    from (
      select learner_id, occurred_at as at,
        (case type when 'review.graded' then payload->>'itemId' else 'rec:' || (payload->>'cardId') end) collate "C" as item,
        case type when 'review.graded' then (payload->>'correct')::boolean else (payload->>'grade')::int >= 3 end as correct,
        case type when 'review.graded' then (payload->>'rating')::int else (array[1, 1, 1, 2, 3, 4])[(payload->>'grade')::int + 1] end as rating
      from learning_events where type in ('review.graded', 'drill.reviewed')
      order by 1, 3, 2
    ) r
  ) x`;

const INTERVIEWS = `
  with s as (
    select learner_id, track, session, jsonb_typeof(session->'scorecard') = 'object' as scored, session->'usage' as usage,
      jsonb_typeof(session->'usage') = 'object' as metered,
      (select count(*) from jsonb_array_elements(session->'messages') m where m->>'role' = 'candidate') as turns
    from interview_sessions
  )
  select count(*)::int as started, count(*) filter (where scored)::int as scored,
    count(distinct learner_id)::int as learners, count(distinct learner_id) filter (where scored)::int as scored_learners,
    count(*) filter (where scored and session->'scorecard'->>'mode' = 'ai')::int as ai,
    count(*) filter (where scored and session->'scorecard'->>'mode' = 'offline')::int as offline,
    coalesce(sum(turns), 0)::int as turns, coalesce(sum((session->>'hintsUsed')::numeric), 0) as hints,
    coalesce(sum((usage->>'costUsd')::numeric) filter (where metered), 0) as cost,
    coalesce(sum((usage->>'cacheReadTokens')::numeric) filter (where metered), 0) as cached,
    coalesce(sum((usage->>'inputTokens')::numeric + (usage->>'cacheReadTokens')::numeric + (usage->>'cacheWriteTokens')::numeric)
      filter (where metered), 0) as prompt,
    (select json_object_agg(track, n) from (select track, count(*)::int as n from s group by track) t) as by_track,
    (select json_object_agg(verdict, n) from (select session->'scorecard'->>'verdict' as verdict, count(*)::int as n from s where scored group by 1) v)
      as verdicts,
    (select json_object_agg(day, n) from (select left(at, 10) as day, count(*)::int as n from (${CANDIDATE_TURNS}) t where left(at, 10) >= $1 group by 1) d)
      as daily
  from s`;

const FEEDBACK = `
  select count(*)::int as total, count(rating)::int as rated, coalesce(sum(rating), 0)::int as rating_sum,
    (select json_object_agg(kind, n) from (select kind, count(*)::int as n from feedback group by kind) k) as by_kind,
    (select json_agg(r) from (select kind, message, rating, created_at as "createdAt" from feedback order by created_at desc, id desc limit 20) r)
      as recent
  from feedback`;

interface Activity {
  total: number;
  active1d: number;
  active7d: number;
  new7d: number;
  d1_of: number;
  d1: number;
  d7_of: number;
  d7: number;
  recent_days: number;
  recent_learners: number;
  daily: Record<string, number> | null;
  lower_ms: string | null;
  upper_ms: string | null;
}

interface Events {
  placement: number;
  reviewed: number;
  predicted: number;
  mission: number;
  predictions: number;
  correct_predictions: number;
  scenarios: number;
  revisits: number;
}

type Reviews = Record<(typeof RATING_NAMES)[number], number> & {
  total: number;
  correct: number;
  last7: number;
  eligible: number;
  recalled: number;
  daily: number[];
};

interface Interviews {
  started: number;
  scored: number;
  learners: number;
  scored_learners: number;
  ai: number;
  offline: number;
  turns: number;
  hints: string;
  cost: string;
  cached: string;
  prompt: string;
  by_track: Record<string, number> | null;
  verdicts: Partial<Record<Verdict, number>> | null;
  daily: Record<string, number> | null;
}

interface Feedback {
  total: number;
  rated: number;
  rating_sum: number;
  by_kind: Record<string, number> | null;
  recent: { kind: FeedbackKind; message: string; rating: number | null; createdAt: string }[] | null;
}

/** The cohort report as SQL aggregates: one consistent snapshot, and only totals leave the database. */
export class PostgresMetricsStore extends MetricsStore {
  constructor(private readonly pool: pg.Pool) {
    super();
  }

  async cohort(now: Date): Promise<CohortMetrics> {
    const days = (n: number) => utcDaysAgo(now, n);
    const from = days(13);
    const client = await this.pool.connect();
    let failed = false;
    try {
      const query = async <T>(text: string, values: unknown[] = []) => {
        // pg honours a per-query read timeout over the pool's, though its typings leave it out.
        const config: pg.QueryConfig & { query_timeout: number } = { text, values, query_timeout: REPORT_TIMEOUT_MS };
        return (await client.query<T & pg.QueryResultRow>(config)).rows[0];
      };
      await query('begin isolation level repeatable read read only');
      await query(`select set_config('statement_timeout', '${REPORT_TIMEOUT_MS}', true)`);
      const activity = await query<Activity>(ACTIVITY, [days(0), days(6), days(1), days(7), from]);
      const events = await query<Events>(EVENTS);
      const reviews = await query<Reviews>(REVIEWS, [from]);
      const interviews = await query<Interviews>(INTERVIEWS, [from]);
      const feedback = await query<Feedback>(FEEDBACK);
      await query('commit');
      return report(now, activity, events, reviews, interviews, feedback);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      client.release(failed);
    }
  }
}

function report(now: Date, a: Activity, e: Events, r: Reviews, i: Interviews, f: Feedback): CohortMetrics {
  const cost = Number(i.cost);
  const prompt = Number(i.prompt);
  const minutes = [a.lower_ms, a.upper_ms].flatMap((ms) => (ms === null ? [] : [Number(ms) / 60_000]));
  const dates = Array.from({ length: 14 }, (_, k) => utcDaysAgo(now, 13 - k));

  return {
    generatedAt: now.toISOString(),
    learners: { total: a.total, active1d: a.active1d, active7d: a.active7d, newLast7d: a.new7d },
    activation: {
      tookPlacementCheck: ratio(e.placement, a.total),
      reviewed: ratio(e.reviewed, a.total),
      predicted: ratio(e.predicted, a.total),
      completedMission: ratio(e.mission, a.total),
      startedInterview: ratio(i.learners, a.total),
      scoredInterview: ratio(i.scored_learners, a.total),
    },
    retention: { d1: ratio(a.d1, a.d1_of), d7: ratio(a.d7, a.d7_of) },
    engagement: {
      activeDaysPerLearnerLast7d: round(a.recent_learners ? a.recent_days / a.recent_learners : null),
      medianSessionMinutes: round(median(minutes), 1),
    },
    reviews: {
      total: r.total,
      last7d: r.last7,
      correct: ratio(r.correct, r.total),
      ratings: { again: r.again, hard: r.hard, good: r.good, easy: r.easy },
      recallAfterADay: ratio(r.recalled, r.eligible),
    },
    predictions: { total: e.predictions, correct: ratio(e.correct_predictions, e.predictions) },
    missions: { completions: e.scenarios - e.revisits, revisits: e.revisits },
    interviews: {
      started: i.started,
      scored: ratio(i.scored, i.started),
      byTrack: i.by_track ?? {},
      verdicts: i.verdicts ?? {},
      averageCandidateTurns: round(i.started ? i.turns / i.started : null, 1),
      aiScored: i.ai,
      heuristicScored: i.offline,
      hintsPerSession: round(i.started ? Number(i.hints) / i.started : null),
      costUsd: round(cost, 4)!,
      costPerScoredUsd: round(i.scored ? cost / i.scored : null, 4),
      cacheReadShare: round(prompt ? Number(i.cached) / prompt : null),
    },
    feedback: {
      total: f.total,
      byKind: f.by_kind ?? {},
      averageRating: round(f.rated ? f.rating_sum / f.rated : null),
      recent: (f.recent ?? []).map((entry) => ({ ...entry, createdAt: new Date(entry.createdAt).toISOString() })),
    },
    daily: dates.map((date, k) => ({
      date,
      activeLearners: a.daily?.[date] ?? 0,
      reviews: r.daily[k],
      interviewTurns: i.daily?.[date] ?? 0,
    })),
  };
}
