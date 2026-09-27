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
| `offline.interviewer.ts` | Guest and account scripted practice, plus the AI scoring fallback          |
| `interview.service.ts`   | Session lifecycle, access checks, mode selection, quotas and locking       |

## Practice modes and paid access

Every new interview defaults to scripted practice (`mode: "offline"`), including on a server with AI configured and for signed-in learners. The opening prompt, replies, hints and heuristic scorecard are available to guests. Scripted scoring checks rubric coverage, not answer correctness. Learning, code execution, visualizers and reviews also remain available without an account.

AI requires both an explicit choice and an active account. `POST /api/interview/sessions` accepts `mode: "ai"`; `POST /api/interview/sessions/:id/mode` changes an active session to `"ai"` or `"offline"`. Mode changes preserve the transcript and affect future replies and the final score. They share the reply/scoring lease, so switching while work is in flight returns 409. Scored interviews cannot change mode.

The catalog and each public session include `aiAccess: "available" | "sign-in-required" | "unavailable"`. This describes the current caller's access on this server; the session's `mode` describes the selected practice mode. The mutation endpoint always rechecks access, even if the client has an earlier capability response.

Before any AI reply, hint or uncached score consumes the interview quota or changes the transcript, the service requires verified access claims and rechecks their session family in shared storage. A guest receives `403 ai_sign_in_required`, without a provider call or paid reservation. An unavailable AI provider returns `503 ai_unavailable`; the learner can explicitly switch to scripted practice. Storage failures fail closed. A cached scorecard returns without fresh paid admission and preserves its own historical `mode`.

The active-family check is the paid operation's admission point. Logout before that check rejects the operation. An operation already admitted can finish after logout; this does not promise cancellation of incurred provider work. Account erasure still prevents the result from being persisted. Each provider attempt retains the separate monetary reservation check described below.

Signed-in calls use the account's server-resolved learner ID, so changing a device UUID, IP or browser does not renew that account's hourly quota. Scripted and AI actions retain their existing shared hourly interview allowance. This is an account-based limit, not proof of one human per account or a lifetime trial: account deletion/recreation or additional verified accounts can obtain a new allowance. The shared monetary ceiling still bounds admitted paid liability.

Sign-in happens inside the interview UI. It does not upgrade or send an answer automatically. Cancellation or failure leaves the answer and code draft in place; successful guest adoption or merge retains the session ID. The learner then explicitly chooses AI and submits their next action. Provider loading failure has a retry; disabled or device-incompatible sign-in still leaves scripted practice available. Existing active accounts do not lose AI access merely because new sign-in providers are disabled.

Session mode is stored in the existing JSONB session, with no schema migration. Legacy active records without a selected mode use scripted practice until explicitly changed; completed unmarked records use their historical scorecard mode for the session label. Existing scorecards retain their scoring mode and content. Before rollout, retire older paid instances and protect their deployment URLs: old code ignores session mode and does not require an account for paid calls. Older cached clients also do not send mode and therefore start scripted sessions on this API. A rollback to older code requires disabling paid provider configuration first.

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

## Saving scorecards and review progress

Score completion saves the scorecard and its deterministic `interview.scored` event in one short Postgres transaction. The event feeds weak patterns into review scheduling. Provider calls and spend settlement finish before that transaction starts. A failure in either write rolls back both; a committed response lost in transit can be retried without another provider call or another event. In-memory development storage publishes the same pair synchronously under its learner-state lock.

Completion uses the learner lock shared with deletion and guest merge, then locks the session row. If competing workers outlive the 15-minute lease, the first committed score wins and later scorers receive that stored card. A candidate based on an older transcript, hints, problem or mode receives 409 instead of replacing newer active work. Delayed replies and mode saves also receive 409 once the stored session is scored.

A scoring retry can restore a missing event for an existing scorecard using its original `scoredAt`, without provider admission or quota. Reading a session alone does not perform this repair. A missing or invalid score time receives 409; the server does not invent a timestamp. A same-ID event must match the session, track, verdict, ordered weak patterns and exact timestamp instant. Equivalent time-zone offsets are accepted. A conflicting event receives 409 and remains unchanged; any new score write rolls back with it.

This completion guarantee does not change public progress uploads or later account-merge conflict rules. Public progress retains the first payload for a repeated ID. A pre-existing conflicting event under a merge destination can still need reconciliation, and is tracked separately in the improvement loop. Provider charges already incurred remain in the spend ledger even if scoring persistence rolls back or a late candidate loses; session usage only describes the result that was saved.

## Prompt caching

Replies set top-level `cache_control: {type: "ephemeral"}`, which is automatic caching: each request caches the whole prefix (system prompt plus conversation so far), and the next turn reads it back. A 30-turn interview therefore pays full price only for each new turn, and reads everything before it at 0.1× the input price.

Sonnet 5 won't cache a prefix under 1024 tokens. The interviewer system prompt is about 1,100–1,200 tokens (estimated at 3.8 characters per token), so the first turn usually already writes the cache. Either way the prefix is past the minimum within two turns. The live eval checks that cache reads show up from the third turn onward.

A contract test also locks in the properties caching depends on: the system prompt, `output_config` and every earlier message stay byte-identical between turns.

## Cost tracking

Every call's `usage` is converted to tokens and dollars with the prices in `pricing.ts`:

- input, output, cache write (5-minute) and cache read
- dated snapshot ids resolve to their base model

The service stores the running total on the session as `session.usage` (calls, token classes, `costUsd`). It is persisted with the session and removed from every API response.

A rough budget with Sonnet 5 ($2 in, $10 out, $0.20 cache read, $2.50 cache write per million tokens): a 12-turn interview plus scoring costs a few cents. `npm run eval:interviewer` prints the measured figures.

`AI_DAILY_BUDGET_USD` caps shared liability for attempts admitted on each UTC day. Before every provider attempt, including retries, the API atomically reserves its maximum verified cost in Postgres. Complete usage settles the hold to actual cost; uncertain transport, metadata or settlement retains the full hold. Admission errors prevent provider dispatch. Reservations settle independently of session persistence, and account deletion does not erase incurred charges. Offline practice makes no paid reservation. Unknown models are refused at startup. See [AI spend reservations](DEPLOYMENT.md#ai-spend-reservations) for bounds, concurrency headroom, day rollover, retention and rollout restrictions.

## Failure handling

The metered request wrapper retries eligible 408, 409, 429 and 5xx responses and connection errors, with backoff that honours `retry-after`. Each attempt reserves separately; automatic SDK retries are disabled, and connected streams are not retried. `ANTHROPIC_MAX_RETRIES` sets the maximum retry count (default 2). `ANTHROPIC_TIMEOUT_MS` sets the time to first byte (default 60 s).

What remains after those retries is mapped in `anthropic-errors.ts`:

| Failure                                                         | Learner sees                      | Logged as  |
| --------------------------------------------------------------- | --------------------------------- | ---------- |
| 429, 529, or a `rate_limit_error`/`overloaded_error` mid-stream | 503 "busy, try again in a moment" | warn       |
| 5xx, `api_error`, connection error or timeout                   | 503 "unavailable, try again"      | warn       |
| 400, 401, 403, 404 (bad request, key or model)                  | 502 generic message               | error      |
| Client disconnects mid-stream                                   | nothing, the request is dropped   | not logged |

- **Errors before the first streamed token** return a JSON error response. **Errors after it** arrive as an SSE `error` event. In both cases the candidate's turn is not saved, so the app puts the text back in the input and the learner can resend it.
- **A refusal or empty reply** is replaced by a neutral prompt to continue the interview.
- **Scoring** retries once if the output fails validation or stops with `max_tokens`/`refusal`. If the second attempt fails too, the offline heuristic scorer produces the card with `mode: "offline"` and a summary that says so, and the app labels it "scripted practice estimate". API errors during scoring are not replaced by the heuristic: they return 503, and the learner can score again later.
- **Concurrent requests** for the same session (a double-tap, two tabs) get 409 while its reply, scoring or mode-switch lease is held. The lease is shared across API instances, is released when the call ends, and expires after 15 minutes. Score completion and terminal-session write guards also protect the saved result when work outlives that lease.
- **Per-learner quota:** `INTERVIEW_MESSAGES_PER_HOUR` (default 120) replies and scorings per clock hour, counted across instances. Each session allows at most 30 candidate turns of up to 4,000 characters.

## Testing

| Suite                                                                        | What it proves                                                                                                                                                                                                                       | Needs               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `src/interview/claude.interviewer.spec.ts`                                   | Request contract (model, effort, caching, alternation, hint marking), cache-stable prefixes, usage and cost, every error mapping, SDK retry, aborts, schema keywords, score retry and fallback                                       | nothing             |
| `src/interview/scorecard.schema.spec.ts`                                     | Repair and rejection rules                                                                                                                                                                                                           | nothing             |
| `src/interview/pricing.spec.ts`, `spend-guard.spec.ts`                       | Cost maths, day rollover, budget ceiling                                                                                                                                                                                             | nothing             |
| `test/interview-ai.e2e-spec.ts`                                              | The full HTTP path with the real SDK: SSE streaming, usage persisted but not exposed, AI scoring into progress events, 503 before and during a stream, 409 on concurrent turns, the budget ceiling. Runs against memory and Postgres | optional Postgres   |
| `test/paid-access.e2e-spec.ts`                                               | Guest UUID rotation cannot dispatch paid work; explicit mode choice, authenticated admission, logout races, stable account quotas, guest merge and legacy sessions                                                                   | optional Postgres   |
| `test/interview-score.e2e-spec.ts`                                           | Matching score/event pairs, cached repair, lost responses, expired-lease races, stale work, collisions and retired learners                                                                                                          | optional Postgres   |
| `test/interview-score-postgres.e2e-spec.ts`, `test/spend-budget.e2e-spec.ts` | Real SQL rollback, ambiguous commit acknowledgement, deletion/merge lock ordering, and incurred spend retained across score rollback                                                                                                 | Postgres            |
| `test/live/interviewer.live-spec.ts`                                         | The real model: scripted strong and weak candidates on both tracks, verdict direction, a gap of at least 1.0 between strong and weak averages, expected weak patterns, cache hits, reply length, no headings, no solution leak       | `ANTHROPIC_API_KEY` |

The contract and e2e suites use a real `Anthropic` client whose `fetch` is scripted (`test/support/fake-anthropic.ts`). That means the SDK's own request serialization, SSE parser, retry logic and error classes are all exercised, and the suites run offline in CI.

Run the live eval before changing prompts, the model or effort:

```bash
ANTHROPIC_API_KEY=... npm run eval:interviewer                       # default claude-sonnet-5
ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=claude-opus-5-5 npm run eval:interviewer
```

It prints a table with verdict, average score, token classes, cost and time to first token for each scenario. Full transcripts and scorecards go to `apps/api/eval-results/` (gitignored) for review. Without a local key, run **Interviewer eval** from the Actions tab: it uses the repository's `ANTHROPIC_API_KEY` secret, puts the table in the run summary and keeps the transcripts as a downloadable artifact for 30 days.

## Configuration

| Variable                      | Default           | Purpose                                                |
| ----------------------------- | ----------------- | ------------------------------------------------------ |
| `ANTHROPIC_API_KEY`           | unset (offline)   | Makes AI available to signed-in learners who select it |
| `ANTHROPIC_MODEL`             | `claude-sonnet-5` | A model with verified pricing and request bounds       |
| `ANTHROPIC_TIMEOUT_MS`        | `60000`           | Time to first byte per request (scoring: 180 s)        |
| `ANTHROPIC_MAX_RETRIES`       | `2`               | Metered retries for transient failures                 |
| `AI_DAILY_BUDGET_USD`         | unset             | Shared daily liability ceiling with Postgres           |
| `INTERVIEW_MESSAGES_PER_HOUR` | `120`             | Per-learner message and scoring quota                  |
