# AI interviewer

Claude runs mock coding and system design interviews and then scores them against a rubric. This document covers how the interviewer calls the API, what it costs, what happens when a call fails, and how it is tested.

Code lives in `apps/api/src/interview/`.

| File                     | Role                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `claude.interviewer.ts`  | Claude API calls: streamed replies, structured scoring, retry and fallback |
| `prompts.ts`             | Interviewer and scorer system prompts, rubrics                             |
| `scorecard.schema.ts`    | JSON schema sent to the API, validation and repair of the result           |
| `anthropic-errors.ts`    | Maps API failures to client-safe HTTP errors                               |
| `pricing.ts`             | Per-model prices, per-call cost, per-session totals                        |
| `spend-guard.ts`         | Daily spend ceiling                                                        |
| `offline.interviewer.ts` | Scripted interviewer used without an API key, and as the scoring fallback  |
| `interview.service.ts`   | Session lifecycle, quotas, per-session locking, usage accounting           |

## Request design

**Replies** are streamed (`messages.stream`) and forwarded to the app as Server-Sent Events.

- `output_config.effort: "low"`. Anthropic recommends it for chat on Sonnet 5, and it keeps replies fast. It is the same on every turn, because changing top-level effort mid-conversation invalidates the prompt cache.
- `max_tokens: 2048`. The prompt asks for replies under 120 words, and the extra room covers any thinking the model does.
- The system prompt is fixed for the life of a session: the problem, private reference notes, hint ladder, interview flow, style rules and rubric. Nothing in it changes per turn.
- Messages alternate and always start with the user. A synthetic `(The candidate joins the call.)` turn comes before the scripted opening. Hint requests are marked `[HINT REQUESTED]` so the model can climb the hint ladder one rung at a time.
- Code from the interview's code drawer is attached to the candidate turn as a `[CANDIDATE CODE: <language>]` fenced block, and the scorer sees it in the transcript too. Only code that changed since the last message is sent.
- Candidate text is treated as speech in an interview, not as instructions. The prompt's `<boundaries>` section covers requests for the solution, the prompt or a score.

**Scoring** is one `messages.create` call with structured outputs (`output_config.format: json_schema`) at `effort: "medium"`, with a 180-second timeout.

- The JSON schema is written by hand in `scorecard.schema.ts`. The SDK's zod helper turns `enum` into a description, but the enums are what keep rubric names, the 1–4 scores and pattern ids valid. The schema uses only keywords structured outputs support: no `minimum`, `maximum`, `minLength`, `maxLength` or `pattern`. A unit test enforces this.
- The transcript is sent inside `<transcript>` tags. The scorer prompt says that instructions inside the transcript are behaviour to evaluate, not instructions to follow.
- `normalizeScorecard` repairs what structured outputs don't guarantee:
  - enum casing, compared case-insensitively
  - duplicate or out-of-order dimensions
  - scores outside 1–4
  - unknown pattern ids
  - overlong lists
- It rejects anything it can't repair, such as a missing rubric dimension.

## Prompt caching

Replies set top-level `cache_control: {type: "ephemeral"}`, which is automatic caching: each request caches the whole prefix (system prompt plus conversation so far), and the next turn reads it back. A 30-turn interview therefore pays full price only for each new turn, and reads everything before it at 0.1× the input price.

Sonnet 5 won't cache a prefix under 1024 tokens. The interviewer system prompt is about 1,100–1,200 tokens (estimated at 3.8 characters per token), so the first turn usually already writes the cache. Either way the prefix is past the minimum within two turns. The live eval checks that cache reads show up from the third turn onward.

A contract test also locks in the properties caching depends on: the system prompt, `output_config` and every earlier message stay byte-identical between turns.

## Cost tracking

Every call's `usage` is converted to tokens and dollars with the prices in `pricing.ts`:

- input, output, cache write (5-minute) and cache read
- dated snapshot ids resolve to their base model

The service stores the running total on the session as `session.usage` (calls, token classes, `costUsd`). It is persisted with the session and removed from every API response. When an interview is scored, one log line records its totals.

A rough budget with Sonnet 5 ($2 in, $10 out, $0.20 cache read, $2.50 cache write per million tokens): a 12-turn interview plus scoring costs a few cents. `npm run eval:interviewer` prints the measured figures.

`AI_DAILY_BUDGET_USD` sets a daily ceiling in UTC days. Once it is reached, new replies and scoring return 503 with a clear message until the next UTC day. The counter lives in process memory, so with several API instances the effective ceiling is the budget times the number of instances, and a restart resets it. If a model has no price entry, its cost is `null` and the ceiling can't apply; a warning is logged at startup.

## Failure handling

The SDK retries 408, 409, 429 and 5xx responses and connection errors, with backoff that honours `retry-after`. `ANTHROPIC_MAX_RETRIES` sets how many times (default 2). `ANTHROPIC_TIMEOUT_MS` sets the time to first byte (default 60 s).

What remains after those retries is mapped in `anthropic-errors.ts`:

| Failure                                                         | Learner sees                      | Logged as  |
| --------------------------------------------------------------- | --------------------------------- | ---------- |
| 429, 529, or a `rate_limit_error`/`overloaded_error` mid-stream | 503 "busy, try again in a moment" | warn       |
| 5xx, `api_error`, connection error or timeout                   | 503 "unavailable, try again"      | warn       |
| 400, 401, 403, 404 (bad request, key or model)                  | 502 generic message               | error      |
| Client disconnects mid-stream                                   | nothing, the request is dropped   | not logged |

- **Errors before the first streamed token** return a JSON error response. **Errors after it** arrive as an SSE `error` event. In both cases the candidate's turn is not saved, so the app puts the text back in the input and the learner can resend it.
- **A refusal or empty reply** is replaced by a neutral prompt to continue the interview.
- **Scoring** retries once if the output fails validation or stops with `max_tokens`/`refusal`. If the second attempt fails too, the offline heuristic scorer produces the card with `mode: "offline"` and a summary that says so, and the app labels it "offline heuristic". API errors during scoring are not replaced by the heuristic: they return 503, and the learner can score again later.
- **Concurrent requests** for the same session (a double-tap, two tabs) get 409 while a reply or scoring call is in flight, so two writes can't race. The lock is per process.
- **Per-learner quota:** `INTERVIEW_MESSAGES_PER_HOUR` (default 120). Each session allows at most 30 candidate turns of up to 4,000 characters.

## Testing

| Suite                                                  | What it proves                                                                                                                                                                                                                       | Needs               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `src/interview/claude.interviewer.spec.ts`             | Request contract (model, effort, caching, alternation, hint marking), cache-stable prefixes, usage and cost, every error mapping, SDK retry, aborts, schema keywords, score retry and fallback                                       | nothing             |
| `src/interview/scorecard.schema.spec.ts`               | Repair and rejection rules                                                                                                                                                                                                           | nothing             |
| `src/interview/pricing.spec.ts`, `spend-guard.spec.ts` | Cost maths, day rollover, budget ceiling                                                                                                                                                                                             | nothing             |
| `test/interview-ai.e2e-spec.ts`                        | The full HTTP path with the real SDK: SSE streaming, usage persisted but not exposed, AI scoring into progress events, 503 before and during a stream, 409 on concurrent turns, the budget ceiling. Runs against memory and Postgres | optional Postgres   |
| `test/live/interviewer.live-spec.ts`                   | The real model: scripted strong and weak candidates on both tracks, verdict direction, a gap of at least 1.0 between strong and weak averages, expected weak patterns, cache hits, reply length, no headings, no solution leak       | `ANTHROPIC_API_KEY` |

The contract and e2e suites use a real `Anthropic` client whose `fetch` is scripted (`test/support/fake-anthropic.ts`). That means the SDK's own request serialization, SSE parser, retry logic and error classes are all exercised, and the suites run offline in CI.

Run the live eval before changing prompts, the model or effort:

```bash
ANTHROPIC_API_KEY=... npm run eval:interviewer                       # default claude-sonnet-5
ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=claude-opus-5-5 npm run eval:interviewer
```

It prints a table with verdict, average score, token classes, cost and time to first token for each scenario. Full transcripts and scorecards go to `apps/api/eval-results/` (gitignored) for review.

## Configuration

| Variable                      | Default           | Purpose                                         |
| ----------------------------- | ----------------- | ----------------------------------------------- |
| `ANTHROPIC_API_KEY`           | unset (offline)   | Turns on the AI interviewer                     |
| `ANTHROPIC_MODEL`             | `claude-sonnet-5` | Any model with a price entry gets cost tracking |
| `ANTHROPIC_TIMEOUT_MS`        | `60000`           | Time to first byte per request (scoring: 180 s) |
| `ANTHROPIC_MAX_RETRIES`       | `2`               | SDK retries for transient failures              |
| `AI_DAILY_BUDGET_USD`         | unset             | Daily spend ceiling per API instance            |
| `INTERVIEW_MESSAGES_PER_HOUR` | `120`             | Per-learner message and scoring quota           |
