import { BUCKETS, flickerChance } from './flags/bucketing.js';
import { PROPAGATION, bytesRate, propagation, secondsText, type PropagationSettings } from './flags/propagation.js';
import { blendedRate, percentText } from './flags/rollout.js';
import type { CaseStudy } from './types.js';
import { num } from './widget-checkpoint.js';

const FLAGS = 5_000;
const SERVICES = 400;
const INSTANCES_A_SERVICE = 50;
const PEAK_REQUESTS = 250_000;
const FLAGS_A_REQUEST = 20;
const ROUND_TRIP_MS = 1;
const POLL_S = 30;
const CHANGES_A_MIN = 2;
const SESSIONS = 3_000_000;
const SESSION_REFRESH_S = 120;
const SUMMARY_S = 30;
const BASE_ERRORS = 0.005;
const NEW_PATH_ERRORS = 0.01;
const FIRST_STAGE = 0.01;

const instances = SERVICES * INSTANCES_A_SERVICE;
const evaluations = PEAK_REQUESTS * FLAGS_A_REQUEST;
const fleet: PropagationSettings = {
  instances,
  delivery: 'poll',
  intervalS: POLL_S,
  payload: 'full',
  cdn: false,
  changesPerMin: CHANGES_A_MIN,
};
const naive = propagation(fleet);
const etag = propagation({ ...fleet, payload: 'etag' });
const delta = propagation({ ...fleet, payload: 'delta' });
const stream = propagation({ ...fleet, delivery: 'stream' });
const slowCdn = propagation({ ...fleet, intervalS: 300, cdn: true });
const etagShare = 1 - Math.exp((-CHANGES_A_MIN / 60) * POLL_S);
const megabytes = (bytesS: number) => Math.round(bytesS / 1e6);
const storm = (instances * PROPAGATION.rulesetKb) / 1e6;
const clientRps = SESSIONS / SESSION_REFRESH_S;
const summaryRps = instances / SUMMARY_S;
const labRps = Math.round((clientRps + summaryRps) / 100) * 100;
const readShare = Math.floor((clientRps / (clientRps + summaryRps)) * 100);
const blended = blendedRate(BASE_ERRORS, NEW_PATH_ERRORS, FIRST_STAGE);
const changesAYear = CHANGES_A_MIN * 60 * 24 * 365;

export const FEATURE_FLAGS: CaseStudy = {
  id: 'feature-flags',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what a flag must never do',
      prompt: `An in-house flag service, like LaunchDarkly or Unleash, for a large company: product teams turn features on for some users, roll them out gradually and switch them off in an emergency. Every request in ${num(SERVICES)} services asks it questions. Before drawing boxes, decide what the flag service may never do to the services that use it.`,
      decision: {
        question: 'A service evaluates a flag while the flag service is unreachable. What should the evaluation do?',
        options: [
          {
            label:
              'Answer at once from the last ruleset the SDK received, use the default written at the call site only for a flag it never received, and report the outage through metrics',
            best: true,
            why: 'The last ruleset is what was live a moment ago, so behaviour does not change during the outage; only new flag changes wait. The flag service can fail without any caller failing, which is the first requirement.',
          },
          {
            label: 'Wait up to 2 seconds for the flag service, then use the call-site default',
            why: `Each request evaluates about ${FLAGS_A_REQUEST} flags, so a wait on evaluation turns a flag service outage into slow or failed requests everywhere. A wait belongs only at startup, bounded, before the first ruleset arrives.`,
          },
          {
            label: 'Throw an error, so each caller decides what a missing flag means',
            why: 'Thousands of call sites will not all handle it, and an unhandled exception fails the request. The flag library must absorb its own failures.',
          },
          {
            label: "Return every flag's off variation until the service is back",
            why: 'Flags that launched months ago and serve everyone would switch the feature off across the fleet. Off is only the safe answer for a kill switch, whose off variation is chosen to be safe.',
          },
        ],
      },
      points: [
        'Functional: create flags with two or more variations; target them by user, by attributes (country, plan, app version) and by segments; roll out by percentage; switch any flag off at once; evaluate a flag for a context (a user, a device or an organization) from every service and every client.',
        'Evaluation is fast and never takes the caller down: no network call on the request path, and an SDK that cannot reach the service keeps serving what it last had.',
        'A change reaches every running instance in seconds, so a kill switch works during an incident, not after the next deploy.',
        'Auditability: every change records who made it, when, what it was before and after, and why; production changes can require an approval.',
        `Scale (from the interviewer): ${num(FLAGS)} flags across development, staging and production, ${num(SERVICES)} services with about ${num(INSTANCES_A_SERVICE)} instances each (${num(instances)} SDK instances), ${num(PEAK_REQUESTS)} requests a second at peak, each evaluating about ${FLAGS_A_REQUEST} flags. Web and mobile apps use flags too.`,
        'Out of scope: deploying code, the statistics of experiments (the flag service records who saw which variation; an experimentation platform analyses it), and secrets or general configuration.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the evaluations',
      prompt: `${num(PEAK_REQUESTS)} requests a second at peak across the company, each evaluating about ${FLAGS_A_REQUEST} flags. How many flag evaluations a second is that?`,
      estimate: {
        question: 'Flag evaluations per second at peak',
        answer: evaluations,
        unit: 'evaluations/s',
        working: [
          `${num(PEAK_REQUESTS)} requests a second × ${FLAGS_A_REQUEST} flags each = ${num(evaluations)} evaluations a second.`,
          `As one remote call each, that is ${num(evaluations)} calls a second, and ${FLAGS_A_REQUEST} sequential calls of about ${ROUND_TRIP_MS} ms add about ${FLAGS_A_REQUEST * ROUND_TRIP_MS} ms to every request.`,
        ],
      },
      points: [
        `${num(evaluations / 1e6)} million a second rules out a network hop per evaluation. Batching one call per request still means ${num(PEAK_REQUESTS)} calls a second and a dependency on every request path.`,
        'Evaluated in process, a flag is a lookup in an in-memory map and a few rule comparisons: microseconds of CPU, no tail latency and no cost per call.',
        `SDKs count evaluations per flag and variation and send the counts in one summary every ${SUMMARY_S} s instead of an event per evaluation: ${num(instances)} instances / ${SUMMARY_S} s ≈ ${num(summaryRps)} uploads a second. The counts show which flags are still used.`,
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate naive polling',
      prompt: `Each SDK needs its environment's ruleset: about 400 flags of 2.5 KB with their rules and segments, ${num(PROPAGATION.rulesetKb / 1000)} MB. If all ${num(instances)} instances download the whole ruleset every ${POLL_S} seconds, how many bytes a second does the flag service send?`,
      estimate: {
        question: 'Ruleset bytes a second sent to polling SDKs',
        answer: megabytes(naive.originBytesS),
        unit: 'MB/s',
        working: [
          `Polls: ${num(instances)} instances / ${POLL_S} s ≈ ${num(naive.originRps)} a second.`,
          `Bytes: ${num(naive.originRps)} × ${num(PROPAGATION.rulesetKb / 1000)} MB ≈ ${num(megabytes(naive.originBytesS))} MB a second, about ${((naive.originBytesS * 8) / 1e9).toFixed(1)} Gbit/s, nearly all of it rulesets the SDK already has.`,
        ],
      },
      points: [
        `With ${CHANGES_A_MIN} flag changes a minute, a conditional request (an ETag, answered 304 Not Modified when nothing changed) helps less than it seems: ${num(etagShare * 100)}% of ${POLL_S}-second polls see a change and download the whole ruleset again, ${bytesRate(etag.originBytesS)}.`,
        `Sending only the changes since the SDK's version cuts it to ${bytesRate(delta.originBytesS)}, and a stream carries only the changes, ${bytesRate(stream.originBytesS)}, and delivers each in under a second.`,
        `And ${POLL_S} s is the worst wait for a kill switch: too slow for an incident.`,
      ],
    },
    {
      kind: 'data',
      title: 'Model flags, rules and segments',
      prompt:
        'The same flag key is used in development, staging and production, and teams want to test a rule in staging before production. Model flags, their targeting and the environments so that the evaluation stays simple and a staging edit can never change production.',
      decision: {
        question: 'How do you model one flag across environments?',
        options: [
          {
            label:
              'One flag definition (key, variations, owner, description, kind) shared by all environments, and a separate targeting configuration per environment (on or off, rules, rollout, default), each environment with its own SDK key and versioned ruleset',
            best: true,
            why: 'Code uses one key everywhere, and the variations mean the same thing in every environment. Targeting differs per environment, so permissions, approvals and the audit log can be stricter in production, and a staging edit is a different record.',
          },
          {
            label: 'A separate flag per environment, such as `checkout-staging` and `checkout-prod`',
            why: 'Code has to pick a key per environment, the copies drift apart, and cleanup removes one and forgets the others.',
          },
          {
            label: 'One targeting configuration for all environments, with the environment as an attribute rules can match',
            why: 'A rule edit meant for staging is an edit to the production ruleset, so production cannot have its own permissions or approvals, and one typo reaches everyone.',
          },
          {
            label: "A configuration file per environment in each service's repository",
            why: 'Reviewed and versioned, but a change ships only when each service that reads it deploys, so a kill switch takes minutes to hours, and a flag shared by several services changes at several times.',
          },
        ],
      },
      points: [
        "Entities: project (a team's flags), environment (its own SDK keys and ruleset version), flag (key, kind such as boolean or string, variations by index, owner, tags, temporary or permanent, created), flag configuration per environment (on, off variation, individual targets, ordered rules, a default rule with a variation or a rollout, prerequisites, salt, version), segment (included and excluded keys, and rules), and context (a kind such as user or organization, a key and attributes).",
        'A rule is clauses (attribute, operator such as `in`, `startsWith` or `semVerGreaterThan`, values) that all must match, and serves a variation or a rollout over variations. Rules are tried in order and the first match wins.',
        'Evaluate in a fixed order: if the flag is off, its off variation; if a prerequisite flag does not return the required variation, the off variation; then individual targets, then the rules in order, then the default rule. Saving a prerequisite that would make a cycle is refused.',
        'Variations are referenced by index, and their values never change meaning once used: a rule that serves variation 1 must not start serving a different value because someone edited it.',
        "A segment reused by many flags (beta testers, internal staff) is defined once. A segment of millions of keys is kept out of the ruleset: SDKs ask a membership store for one user's segments and cache the answer, instead of downloading every key.",
        `Every saved change increments the flag's version and the environment's ruleset version, so an SDK knows whether it is current and can apply changes in order. At ${CHANGES_A_MIN} changes a minute, the audit log grows by about ${num(changesAYear / 1e6)} million entries a year, small for any database.`,
      ],
    },
    {
      kind: 'api',
      title: 'Evaluate in process',
      prompt: `${num(evaluations / 1e6)} million evaluations a second, from services in four languages. Decide where an evaluation runs, and what the SDK and the service say to each other.`,
      decision: {
        question: 'Where does a backend service evaluate its flags?',
        options: [
          {
            label:
              "In the service's own process: the SDK keeps the environment's ruleset in memory, updated by a stream, and evaluates each call locally",
            best: true,
            why: 'No network on the request path, so evaluation takes microseconds and costs nothing per call; an outage of the flag service only delays changes; and user attributes used for targeting never leave the service.',
          },
          {
            label: "Call the flag service's evaluate endpoint for each flag",
            why: `${num(evaluations)} calls a second, about ${FLAGS_A_REQUEST} ms added to each request, and the flag service's availability becomes every service's.`,
          },
          {
            label: "Read each flag's value from a shared Redis cluster",
            why: "Still a network hop per evaluation, and a flag's value depends on the user (a 10% rollout, a country rule), so one stored value per flag cannot answer it: the SDK would fetch the rules and evaluate them anyway.",
          },
          {
            label: 'Load the ruleset once at startup and keep it until the next deploy',
            why: 'Fast and independent, but a kill switch then needs a restart of every service, minutes to hours instead of seconds.',
          },
        ],
      },
      points: [
        'SDK interface: `variation(key, ctx, def)` returns the value, or `def` (the call-site default) when it has none, and never throws; `allFlags(ctx)` returns every value for one context, which a server can pass to its web page.',
        'SDK to service: `GET /sdk/ruleset` (the whole ruleset with its version and an ETag), `GET /sdk/stream` (server-sent events: the whole ruleset on connect, then each change with its version), and `POST /sdk/events` (evaluation counts and exposures, in batches).',
        'Management API for people and tools: create and edit flags with a comment, the version the edit was based on (`If-Match`, so two editors cannot overwrite each other) and, in production, an approval.',
        "Browsers and phones cannot hold the ruleset: it would expose every rule, segment and targeted user id to anyone who opens the developer tools, and it is far too large. Their SDKs send one context to an evaluation endpoint and receive only that context's values, so those user attributes do reach the service: mark sensitive ones private so they are used for evaluation but never stored or logged.",
        'A thin, shared evaluation core keeps four languages honest: the same rules, operators and hashing in every SDK, checked by one shared suite of test cases with expected results.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace a flag change from the dashboard to a running service, and an evaluation from a phone, and name each component on the way.',
      lab: true,
      points: [
        'Control plane: the dashboard and management API write flags to a relational database such as Postgres, in the same transaction as the audit log entry and an outbox row; it is small (thousands of flags) and its load is people, not traffic.',
        'Publisher: reads the outbox, builds the new versioned ruleset for the environment, stores it as an immutable snapshot (object storage behind a CDN), and sends the change to the stream servers.',
        "Delivery: stream servers hold the SDKs' server-sent event connections and push each change; the CDN serves snapshots for SDKs that start, reconnect or poll. A relay running in each cluster can hold one upstream connection and serve all the cluster's SDKs.",
        "Client evaluation: evaluation servers keep every environment's ruleset in memory and answer browsers and phones with one context's values.",
        'Events: SDK summaries and exposures go through a queue to workers that update per-flag evaluation counts (for lifecycle) and hand exposures to the experimentation platform.',
        `Open the build in the Design Lab: the request path is client evaluation, ${num(SESSIONS / 1e6)} million app sessions refreshing every ${SESSION_REFRESH_S / 60} minutes (${num(clientRps)} requests a second), plus ${num(summaryRps)} summary uploads a second from server SDKs: about ${num(labRps)} requests a second, ${readShare}% reads. The cache stands for the rulesets held in memory; the queue and workers take the summaries. Streams and the CDN are off this path: a change is one message per connection, not a request.`,
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Bucket users consistently',
      prompt: `A new checkout is rolled out to 10% of users. Every one of ${num(instances)} instances, in four languages, must give the same user the same answer on every request, without asking anyone.`,
      decision: {
        question: 'How does the SDK decide whether this user is in the 10%?',
        options: [
          {
            label: `Hash the flag's salt together with the user id into a bucket from 0 to ${num(BUCKETS - 1)}, and serve the new checkout to buckets below ${num(BUCKETS / 10)}`,
            best: true,
            why: 'The same inputs give the same bucket on every server, in every language and on every request, with no stored state. A salt per flag makes each flag pick its own users, and raising the percentage only moves the line, so everyone already in stays in.',
          },
          {
            label: 'Roll a random number on each evaluation and serve the new checkout when it is below 0.10',
            why: `Each request gets its own answer, so a user flips between old and new checkouts: over 5 requests, ${num(flickerChance(0.1) * 100)}% of users see both, and an experiment cannot tell who saw what.`,
          },
          {
            label: 'Hash the user id alone, the same way for every flag, and compare the bucket with the percentage',
            why: 'Consistent, but every flag then picks the same users: the 10% in this rollout are the 10% in every other 10% rollout. Two experiments overlap completely, so their effects cannot be told apart, and the same users take every risk.',
          },
          {
            label: "Store each user's assignment in the flag database the first time they are evaluated, and read it on every evaluation",
            why: `Sticky, but it puts a database read on each of ${num(evaluations)} evaluations a second and a write for every new user, so evaluation is no longer local or outage-proof. A hash gives the same stickiness with no state.`,
          },
        ],
      },
      widget: 'bucketing',
      points: [
        `bucket = hash(salt + ':' + user id) mod ${num(BUCKETS)}; the user is in when bucket < percentage × ${BUCKETS / 100}. The hash must be stable across languages and releases (Unleash uses MurmurHash3, LaunchDarkly SHA-1 of the flag key, the flag's salt and the user key), so it is part of the SDK specification, not an implementation detail.`,
        'A rollout over several variations gives each a range of buckets: control 0 to 4,999, treatment 5,000 to 9,999. Growing a variation extends its range at the edge; inserting or reordering ranges moves users who were already assigned.',
        'Changing the salt, or the attribute you bucket by, reshuffles everyone. Do it only to start a fresh sample on purpose, never in the middle of a rollout.',
        "Two flags with their own salts are independent: two 10% rollouts share about 1% of users (10% × 10%), not 10%. That keeps two experiments' effects apart.",
        'Bucket by the identity the change is about: an organization id for a business product, so a whole company sees one version; a device id before sign-in. A user who signs in changes id, and may change version once.',
        'An experiment also needs to know who was exposed: the SDK records (flag, variation, context) when the value is used, and the experimentation platform analyses it.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Propagate changes in seconds',
      prompt: `A kill switch must reach all ${num(instances)} instances within seconds, about ${CHANGES_A_MIN} changes a minute arrive across the environment, and the ruleset is ${num(PROPAGATION.rulesetKb / 1000)} MB.`,
      decision: {
        question: 'How do changes get from the flag service to every SDK?',
        options: [
          {
            label:
              'Each SDK holds a server-sent events stream that pushes every change with its version; on connect, or after a missed version, it fetches the whole ruleset from a CDN-cached snapshot, and it falls back to polling if the stream fails',
            best: true,
            why: `A change reaches every instance in about ${secondsText(stream.worstS)} and costs one small message per connection, ${bytesRate(stream.originBytesS)} at this rate. Versions make a missed message visible, and the snapshot path never loads the stream servers.`,
          },
          {
            label: `Every SDK polls the flag service for the whole ruleset every ${POLL_S} s`,
            why: `${bytesRate(naive.originBytesS)} of mostly unchanged rulesets, and a kill switch takes up to ${secondsText(naive.worstS)}.`,
          },
          {
            label: 'Every SDK polls through a CDN every 5 minutes, which the CDN caches for 5 minutes',
            why: `Cheap for the origin, but the CDN copy can be 5 minutes old when it is fetched: up to ${secondsText(slowCdn.worstS)}, about ${Math.round(slowCdn.worstS / 60)} minutes, before an instance stops a bad feature.`,
          },
          {
            label: 'The flag service calls a reload webhook on each instance after every change',
            why: 'The service would have to know and reach every instance as they scale up and down, retry each failed call, and an instance that missed one has no way to catch up until the next change.',
          },
        ],
      },
      widget: 'propagation',
      points: [
        "Server-sent events are one long HTTP response the server writes to: one-way, plain HTTP that passes through proxies, with reconnection built into the protocol. Send the whole ruleset as the first event, then one event per change carrying the flag's new version and the ruleset version.",
        'The SDK applies a change only if it is newer than what it holds, and if a version is missing it fetches the snapshot again. Heartbeats every 30 seconds or so let both sides detect a dead connection.',
        `Fan-out: with ${num(PROPAGATION.connectionsPerServer)} connections a server, ${num(instances)} instances need ${stream.streamServers} stream servers, plus spares in each zone; a relay per cluster cuts the connections to the central service to one per cluster.`,
        `Reconnect storms: if the stream servers restart, every SDK reconnects and wants the ruleset at once, ${num(instances)} × ${num(PROPAGATION.rulesetKb / 1000)} MB = ${num(storm)} GB. Reconnect with random jitter and backoff, and serve the snapshot from the CDN, keyed by version, so the origin is not in the path.`,
        'Polling stays as the fallback: with deltas since a version it is cheap, and it works where long-lived connections are blocked.',
        'Bootstrap: a new instance waits a bounded time (a second or two) for its first ruleset; failing that it loads the last snapshot it saved to disk or one baked into its image, and keeps trying in the background.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Keep a request consistent',
      prompt:
        'A checkout request passes through the web service, the cart service and the tax service, and all three read the flag `new-tax-calc`. The flag is raised from 10% to 50% while the request is in flight, and each service hears about it a few hundred milliseconds apart.',
      decision: {
        question: 'How do you keep one request consistent?',
        options: [
          {
            label:
              'Evaluate the flag once where the request enters and pass the value along with it, and inside each service evaluate against one ruleset snapshot per request',
            best: true,
            why: 'Downstream services use the decision that was made, not their own copy of a ruleset that may be a moment older or newer. A snapshot per request keeps related flags and prerequisites consistent with each other inside one service too.',
          },
          {
            label: 'Make every SDK apply the change at the same instant',
            why: `Instances hear about a change at different moments over a network, and nothing can make ${num(instances)} of them switch at once. Design for a window where both versions are live.`,
          },
          {
            label: 'Let each service evaluate the flag itself: the hash is the same everywhere',
            why: 'The hash is the same, but the rule is not while the change propagates: at 10% the tax service may say no while the cart service, already at 50%, says yes, for the same user in the same request.',
          },
          {
            label: 'Read the flag from the flag service with a strongly consistent read in each service',
            why: 'It adds the remote call the design avoids, and three reads at three moments can still straddle the change.',
          },
        ],
      },
      points: [
        'The SDK swaps its ruleset atomically: an immutable map replaced by one reference, so an evaluation sees the old ruleset or the new one, never half of each. A request that takes the reference once evaluates every flag against the same snapshot.',
        'Pass decisions, not flag keys, across services: a header or field with the variation the edge chose. The downstream service still needs a default for requests that arrive without it.',
        'Write code so both versions can be live at once, as with a database migration: the new path must read data the old path writes, and the reverse, for as long as the flag is between 0% and 100%.',
        "When one change needs another first (the cart service must accept a new field before the web service sends it), make it two flags with a prerequisite, or roll out the receiver's flag first.",
        'Measure propagation: SDKs report the ruleset version they hold, so the service can show how many instances have each change, and alert when some are minutes behind.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Roll out safely',
      prompt: `A new checkout path goes out behind a flag. The service fails ${percentText(BASE_ERRORS)} of requests today; the new path, it turns out, fails ${percentText(NEW_PATH_ERRORS)}. At a first stage of ${percentText(FIRST_STAGE)} of users, what should catch it, and what should undo it?`,
      decision: {
        question: 'What advances a rollout, and what stops it?',
        options: [
          {
            label:
              'Staged percentages (1%, 5%, 25%, 50%, 100%) with a hold at each; guardrail metrics compared between the users in the flag and the users out of it; automatic rollback to 0% when a guardrail breaks; and a kill switch anyone on call can flip',
            best: true,
            why: `Comparing the two groups shows ${percentText(NEW_PATH_ERRORS)} against ${percentText(BASE_ERRORS)}, double, even at ${percentText(FIRST_STAGE)}. Rollback is a flag change, so it propagates in seconds, and the hold at each stage limits how many users see a bad version before the metrics have enough data.`,
          },
          {
            label: "Watch the whole service's error rate before and after each step",
            why: `At ${percentText(FIRST_STAGE)} exposure the service's error rate moves from ${percentText(BASE_ERRORS)} to ${percentText(blended)}, lost in the noise. Only the comparison between the two groups shows it.`,
          },
          {
            label: 'Go straight to 100% at a quiet hour, with the kill switch ready',
            why: 'The kill switch limits how long, not how many: every user meets the bad version before anyone notices.',
          },
          {
            label: 'Let each team script its rollout in its deploy pipeline',
            why: 'Flags then move only when a pipeline runs, every team writes its own guardrails or none, and nobody can see or stop all rollouts in one place.',
          },
        ],
      },
      points: [
        'A rollout plan is data on the flag: the stages, the hold at each (long enough for the metric to have enough requests to compare) and the guardrails with their thresholds, so the flag service advances it and records each step in the audit log.',
        "Guardrails come from the observability system, split by variation: error rate, latency percentiles and a business metric such as checkout conversion. The SDK's exposure events say which users saw which variation, so the metrics can be split.",
        'Automatic rollback sets the rollout to 0% and pages the owner; it never deletes the flag or changes the code path.',
        'Kill switches are permanent flags around risky dependencies (a recommendations call, a new payment provider) whose off variation is the safe, degraded path, tested regularly so it works when needed.',
        'Rolling out a flag is not deploying code: the code for both paths is already deployed, so rollback takes seconds, and a deploy rollback would not undo a flag change.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Govern environments and teams',
      prompt: `${num(SERVICES)} services belong to dozens of teams, and anyone can break production with one rule. Decide who may change what, and how a change is recorded.`,
      decision: {
        question: 'Who can change a production flag, and how?',
        options: [
          {
            label:
              "Role-based permissions per project and environment; changes to production flags marked critical need a second person's approval, except a kill switch, which on-call can flip at once; every change goes to an append-only audit log with who, when, before and after, and why",
            best: true,
            why: 'Most changes get a second pair of eyes where they can hurt, and the one change that must be fast in an incident stays fast. The audit log answers "what changed?" in the first minute of every incident.',
          },
          {
            label: 'Anyone in engineering can change any flag in any environment',
            why: 'Fast, but a typo in a production rule is an outage and nothing records an intent. Teams also change flags they do not own.',
          },
          {
            label: 'Every production change needs an approval, kill switches included',
            why: 'Careful, but during an incident on-call waits for a reviewer before turning the broken feature off, which defeats the kill switch.',
          },
          {
            label: 'Flags change only through pull requests to a flags repository, applied by the deploy pipeline',
            why: 'Reviewed and versioned, but every change waits for a pipeline, minutes at best, so the kill switch is too slow.',
          },
        ],
      },
      points: [
        "Tenancy inside one company: projects per team, environments per project, roles scoped to both. A team can read other teams' flags to debug, but changes only its own.",
        'SDK keys are per environment: server keys are secrets that read the whole ruleset; client-side ids are public and see only flags marked available to clients.',
        'Approvals carry the diff, are tied to the flag version they were made against, and expire if the flag changes underneath them. Scheduled changes (turn on at launch time) go through the same approval.',
        'The audit log is written in the same transaction as the change, never edited, and kept for years; it also records every automatic step: rollout advances, rollbacks and stale flag notices.',
        "Per-tenant limits on the management API and on flag counts keep one team's script from slowing the dashboard for everyone.",
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Pay down flag debt',
      prompt: `Two years in, there are ${num(FLAGS)} flags. Half have served one variation to everyone for months, and nobody remembers which can go. Every one of them is a branch in the code and a path nobody tests.`,
      decision: {
        question: 'How do you keep flags from piling up?',
        options: [
          {
            label:
              'Each flag has an owner and a kind (release, experiment, kill switch, entitlement); temporary kinds get an expected removal date; the service marks a flag stale when it has served one variation to everyone for weeks, and code-reference scanning shows where it is still used, so the owner removes the code and then archives the flag',
            best: true,
            why: 'Staleness comes from data the service already has (its versions and evaluation counts), the code references tell the owner exactly what to delete, and permanent kinds such as kill switches are exempt.',
          },
          {
            label: 'Delete every flag 90 days after it was created',
            why: 'The code still asks for it, so it gets the call-site default, which may be the old behaviour: launched features silently turn off.',
          },
          {
            label: 'Hold a cleanup sprint every quarter',
            why: 'Without data on which flags are safe to remove, a sprint removes the obvious few, and the debt returns in weeks.',
          },
          {
            label: 'Cap each team at 50 flags',
            why: 'Teams then reuse old flags for new features, and a reused flag can switch on old code that is still deployed.',
          },
        ],
      },
      points: [
        'Remove a flag in order: make the winning path unconditional in code, deploy, confirm evaluations of the key drop to zero, then archive the flag. Archived, not deleted, so an evaluation of the key still shows up, as an alert.',
        'Code references: a job scans repositories for flag keys on every merge (LaunchDarkly publishes one, `ld-find-code-refs`), so each flag page lists the files that use it, and a flag with no references and no evaluations is safe to archive.',
        'Never reuse a flag key for something else. In 2012 Knight Capital repurposed an old flag; one server still had the old code behind it, and the firm lost more than $440 million in about 45 minutes.',
        'Each flag doubles the paths through the code in principle: test the default path and the new path, and remove the flag soon after 100% so the old path stops needing tests.',
        'Dashboards per team: flags past their removal date, stale flags, flags not evaluated in 30 days. Make the cost visible where teams already plan work.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Plan for failure',
      prompt:
        'Three things will go wrong: the flag service is down while services deploy, a bad rule ships to 100%, and SDKs a year old meet a rule they do not understand. Start with the one users feel at once.',
      decision: {
        question:
          'An engineer saves a rule that serves the new checkout to 100% instead of 10%, and checkout errors climb. What gets you back fastest, and what stops it next time?',
        options: [
          {
            label:
              "Restore the flag's previous version from its history (or flip its kill switch), which propagates in seconds; then require staged rollouts with guardrails for production, and an approval to jump past a stage",
            best: true,
            why: 'The flag changed, not the code, so undoing the flag change is the fix, and it reaches every instance in seconds. The process change removes the single-step jump to 100% that caused it.',
          },
          {
            label: 'Roll back the last deploy of the checkout service',
            why: 'The code did not change. A rollback takes minutes, and if the old build also has the flag check, it still reads the bad rule.',
          },
          {
            label: 'Restart the checkout instances so they reload their flags',
            why: 'They reload the same bad ruleset, and the restarts add an outage of their own.',
          },
          {
            label: 'Edit the rule back to 10% carefully, then post-mortem',
            why: 'Close, but rewriting a rule during an incident invites a second mistake. Restoring the recorded previous version is one click and exactly what was live before.',
          },
        ],
      },
      points: [
        'Flag service down at deploy time: new instances have no ruleset in memory. They wait a bounded second or two, then load the last snapshot from a local relay, the CDN or disk, and serve call-site defaults only for flags they have never seen. Deploys and autoscaling keep working; only flag changes wait.',
        'A bad rule at 100%: restore the previous version (every version is kept), or flip the kill switch. Guardrails with automatic rollback catch it at the first stage next time.',
        'SDK version skew: a year-old SDK receives a rule with an operator it does not know. It must fail safe, treating the rule as not matching and moving on to the next rule or the default, never crashing or matching everyone. The service records the SDK versions that connect and warns before a rule uses something some of them cannot evaluate.',
        'A corrupt or truncated ruleset: the SDK validates a payload (version, checksum, parse) before swapping it in, and keeps the last good one otherwise.',
        'The flag database down: no one can change flags for a while, but every evaluation keeps working, since nothing on the request path reads it.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Operate it',
      prompt: 'You have five minutes left. What do you watch, and what would page you?',
      points: [
        'Propagation: time from a saved change until 99% of instances report its version, and the instances more than a minute behind.',
        'Delivery: open streams per server, reconnect rate, snapshot age on the CDN, and SDKs falling back to polling.',
        'SDK health: versions in the fleet, evaluation errors (unknown flags, type mismatches) by service, and instances serving call-site defaults.',
        'Rollouts: rollouts in progress, guardrail breaches and automatic rollbacks, with the audit log linked.',
        'Hygiene: stale flags, flags past their removal date, and flags with no code references or evaluations.',
      ],
    },
  ],
  pitfalls: [
    'Putting a network call to the flag service on the request path for every evaluation.',
    'Rolling out by a random number on each request, so users flip between versions.',
    'Hashing the user id without a per-flag salt, so every rollout picks the same users.',
    'Letting an SDK throw, block or turn everything off when the flag service is unreachable.',
    'Treating a flag change as safe because no code was deployed: no stages, no guardrails, no approval.',
    'Leaving flags in the code for years, or reusing an old flag for a new feature.',
  ],
  followUps: [
    {
      question: 'How would you run experiments on top of this?',
      answer:
        'The flag gives each user a variation by hash and the SDK records an exposure when the value is used. The experimentation platform joins exposures with outcome metrics and compares the groups. The flag service guarantees stable, independent assignment and a record of who saw what; it does not do the statistics.',
    },
    {
      question: 'How do you serve flags across several regions?',
      answer:
        'Keep one control plane and its database in a primary region, and replicate each published snapshot and change to stream servers and CDN origins in every region. SDKs connect to their own region. A region cut off from the control plane keeps serving its last versions, so evaluation never depends on another region; only changes wait.',
    },
    {
      question: 'A team wants a flag that targets 2 million specific account ids. What do you do?',
      answer:
        'Make it a segment kept out of the ruleset: the list lives in a membership store, the SDK looks up one account and caches the answer, and the ruleset stays small. Better still, find the attribute those accounts share (a plan, a region, a signup date) and target the rule at it.',
    },
  ],
};
