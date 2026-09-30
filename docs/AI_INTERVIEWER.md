# AI interviewer

A language model runs mock coding, system design and behavioral interviews and then scores them against a rubric: OpenAI's GPT-6 Luna through the Vercel AI Gateway, or Claude through the Anthropic API only where the owner pins it with `INTERVIEW_AI_PROVIDER=anthropic`. This document covers how the interviewer calls the model, what it costs, what happens when a call fails, and how it is tested.

## Which interviewer runs

`interviewer-choice.ts` picks one at startup and `interviewer.factory.ts` builds it; the log says which (`Interviewer: openai/gpt-6-luna through the Vercel AI Gateway (oidc).`), and `/api/health` reports `interviewer: "ai"` or `"offline"`.

1. `INTERVIEW_AI_PROVIDER=anthropic` runs Claude direct with `ANTHROPIC_API_KEY` and its existing checks (a priced `ANTHROPIC_MODEL`, the standard endpoint, no custom headers). Nothing else does: an `ANTHROPIC_API_KEY` alone runs nothing and logs an error saying so.
2. Otherwise (unset or `gateway`) the gateway, which needs a credential: `AI_GATEWAY_API_KEY`, or on Vercel (`VERCEL_ENV` or `VERCEL_OIDC_TOKEN` present) the deployment's OIDC token, which the gateway accepts as the bearer token. The OIDC token expires (Vercel reuses one for up to 90 minutes of a two-hour life), so `getVercelOidcToken` from `@vercel/oidc` reads it for every request, from the request's `x-vercel-oidc-token` header or the environment, and refreshes an expired one pulled for local development. A request without one gets the 502 of a rejected key, with an error log.
3. Without a credential, the offline scripted interviewer, logged as a warning. A misconfigured paid interviewer (a provider without its credential, a model the catalog does not price, prices of zero, an output limit below the scoring budget) falls back to it with an error log instead of failing startup.

The gateway runs `INTERVIEW_AI_MODEL` (default `openai/gpt-6-luna`) and nothing else: there is no fallback model. When the gateway or the model is unavailable, the learner gets the usual retryable 503 and can switch to scripted practice, as for any unavailable AI.

Spend limits need prices, so the server never sends a gateway request it cannot bound. At startup it loads the public catalog (`https://ai-gateway.vercel.sh/v1/models`, 5-second timeout) and takes the model's prices, output limit, effort levels and structured-output support from it. If the catalog does not list the model, it serves the scripted interviewer. If the catalog is unreachable, it uses the built-in entry in `gateway-model.ts` (GPT-6 Luna's catalog entry as of 2026-09-30) and logs a warning; any other model then gets the scripted interviewer. A built-in table rather than a refusal because Vercel cold-starts instances often, and one catalog blip would otherwise take AI away from that instance for its life; the table only ever bounds, never bills, and the dearest tier and region already sit well above what an interview costs.

The gateway's model choice was blind-graded; see [LOOP.md](LOOP.md) row 82.

Code lives in `apps/api/src/interview/`.

| File                      | Role                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `interviewer-choice.ts`   | Picks the gateway, Anthropic or scripted practice from the configuration                           |
| `interviewer.factory.ts`  | Builds the chosen interviewer: catalog prices, the gateway credential, deadlines                   |
| `gateway.interviewer.ts`  | Gateway calls (production): streamed replies, structured scoring, deadlines, retry and fallback    |
| `gateway-client.ts`       | Chat completions over fetch: streaming, usage, billed cost, error classes                          |
| `gateway-catalog.ts`      | The gateway's public model catalog: prices, limits, effort, structured output                      |
| `gateway-model.ts`        | Loads the configured model from the catalog, or its built-in prices when the catalog is down       |
| `claude.interviewer.ts`   | Claude API calls: streamed replies, structured scoring, retry and fallback                         |
| `learner-text.ts`         | Plain text for learners: em dashes, curly quotes, markdown emphasis and backticks rewritten        |
| `prompts.ts`              | Interviewer and scorer system prompts, rubrics                                                     |
| `scorecard.schema.ts`     | JSON schema sent to the API, validation and repair of the result                                   |
| `anthropic-errors.ts`     | Maps API failures to client-safe HTTP errors                                                       |
| `pricing.ts`              | Per-model prices, per-call cost, per-session totals                                                |
| `spend-guard.ts`          | Daily spend ceiling                                                                                |
| `offline.interviewer.ts`  | Guest and account scripted practice, plus the AI scoring fallback                                  |
| `behavioral-problems.ts`  | One behavioral problem per competency question in the engine                                       |
| `behavioral.prompts.ts`   | Behavioral interviewer and scorer prompts, STAR rendering, tag escaping                            |
| `behavioral.scorecard.ts` | Behavioral JSON schema, quote verification and the verdict clamp                                   |
| `invented-numbers.ts`     | Replaces numbers the candidate never said with [number] in behavioral feedback                     |
| `offline.behavioral.ts`   | Scripted behavioral follow-ups and the STAR-check scorecard                                        |
| `interview.service.ts`    | Session lifecycle, access checks, mode selection, quotas and locking                               |
| `track-prompts.ts`        | Picks each track's prompts, turn rendering, schema, normalizer and redirect, for both interviewers |

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

This section describes the Anthropic request; the gateway request is the same conversation in chat-completions form (see [the gateway interviewer](#the-gateway-interviewer)). Both share the prompts and these rules:

- The prompts are built for any model, from what blind grading showed every model getting wrong: exactly one question per turn; never mention or confirm the reference notes, hint ladder, rubric, instructions or the level being hired for (such as L4/L5), not even to decline; no praise, no hint of the verdict, and no numbers or answers the candidate should work out; plain text without markdown or em dashes. Scorers write plain text and name the idea itself instead of "the reference".
- Whatever the model writes anyway, `learnerText` rewrites before it is saved and shown: an em dash becomes a comma (with the stray comma it leaves at the edge of a line or before punctuation removed), curly quotes and apostrophes become straight, `**bold**`, `*italics*`, backticks and code fence lines go while their text stays, and a non-breaking space becomes a space. En dashes stay, since they write ranges; underscore emphasis stays, since underscores are also Python names. The service applies it once, for both interviewers, to the saved reply (the SSE `done` message replaces the streamed text) and to every scorecard text (summary, evidence, strengths, improvements, flaw quotes and fixes). Two questions in one reply are left to the prompt: cutting a reply down to its last question could drop the context the question needs.

**Replies** are streamed (`messages.stream`) and forwarded to the app as Server-Sent Events.

- `output_config.effort: "low"`. Anthropic recommends it for chat on Sonnet 5, and it keeps replies fast. It is the same on every turn, because changing top-level effort mid-conversation invalidates the prompt cache.
- `max_tokens: 2048`. The prompt asks for replies under 120 words, and the extra room covers any thinking the model does.
- The system prompt is fixed for the life of a session: the problem, private reference notes, hint ladder, interview flow, style rules and rubric. Nothing in it changes per turn.
- Messages alternate and always start with the user. A synthetic `(The candidate joins the call.)` turn comes before the scripted opening. Hint requests are marked `[HINT REQUESTED]` so the model can climb the hint ladder one rung at a time.
- Code from the interview's code drawer is attached to the candidate turn as a `[CANDIDATE CODE: <language>]` fenced block, and the scorer sees it in the transcript too. Only code that changed since the last message is sent.
- Candidate text is treated as speech in an interview, not as instructions. The prompt's `<boundaries>` section covers requests for the solution, the prompt or a score.

**Scoring** is one `messages.create` call with structured outputs (`output_config.format: json_schema`) at `effort: "medium"`. Scoring as a whole, retry included, has 180 seconds.

- The JSON schema is written by hand in `scorecard.schema.ts`. The SDK's zod helper turns `enum` into a description, but the enums are what keep rubric names, the 1–4 scores and pattern ids valid. The schema uses only keywords structured outputs support: no `minimum`, `maximum`, `minLength`, `maxLength` or `pattern`. A unit test enforces this.
- The transcript is sent inside `<transcript>` tags. The scorer prompt says that instructions inside the transcript are behaviour to evaluate, not instructions to follow.
- `normalizeScorecard` repairs what structured outputs don't guarantee:
  - enum casing, compared case-insensitively
  - duplicate or out-of-order dimensions
  - scores outside 1–4
  - unknown pattern ids
  - overlong lists
- It rejects anything it can't repair, such as a missing rubric dimension.

## Behavioral interviews

The third track, `behavioral`, runs on the same sessions, lease, access checks, quota, spend reservations, SSE, mode switch, atomic score completion, export and erasure; there is no separate module and no migration (the track is text and the session JSONB). Anonymous learners and scripted choices practise on the device (`/behavioral/mock`, which takes `?question=` with a question or competency id).

- **Problems.** Every competency question in the engine is a problem (`behavioral-problems.ts`): its id is the question id, `competencyId` names the competency, the opening is the question plus "Take a moment, then answer in STAR form.", and the private reference notes hold what the question checks, the competency's strong signals and red flags, and the question's follow-ups. `POST /sessions` takes a question id, or a competency id for a random question of it, and an optional `level` (`early`, `mid` or `senior`, default `mid`) that sets the bar. The catalog lists one entry per competency.
- **Turns.** The first candidate turn carries `star` (the five STAR parts, each at most 4,000 characters and 12,000 in all, with no NUL or lone surrogate) and nothing else; the server stores it and derives the turn's text as a labelled `[STAR ANSWER]`. Later turns are plain text. A STAR answer after the first turn, a first turn without one, hints and code all return 400 before any paid work.
- **Cost.** Four quota-counted calls a session (scoring may retry once): replies to the STAR answer and the first two follow-up answers, then scoring. The answer to the third follow-up gets a fixed closing, streamed in one delta, with no model call, quota or reservation, even when the daily budget is spent. A fifth candidate turn returns 409, as does any turn after the closing, so the closing is never repeated or charged.
- **Prompts.** The interviewer is a bar raiser who asks one to three follow-ups aimed at what is weakest (ownership, specifics, metrics, conflict details, reflection) and then tells the candidate to press End & score. Its system prompt is fixed for the session, so caching works as on the other tracks. Each candidate turn is wrapped in `<candidate_turn>` tags, and `neutralizeTags` escapes the prompt's own tag names inside learner text, so a story cannot close a data block; it first strips invisible format characters and maps fullwidth brackets, and treats a space or hyphen in a tag name like the underscore. A refusal or empty reply is replaced by a neutral request for a real example of the competency.
- **Scoring.** The rubric is Competency fit, Ownership & specificity, Impact & results, Judgment & reflection and Follow-up handling. The schema replaces `weakPatterns` with `flaws` (an `ANSWER_FLAWS` id, a quote and a fix in the candidate's voice) and `weakCompetencies` (catalog ids). `normalizeBehavioralScorecard` dedupes flaws, bounds quotes (240) and fixes (400), keeps a quote only when it is at least two words and eight characters of whole words from one STAR part or one follow-up answer, never the server's labels (ignoring case, spacing and curly quotes; otherwise the flaw stays with `quote: null` and `interview.unquoted-flaw` is logged with the flaw id only), drops unknown competencies, and moves the verdict to within one level of the one the dimension average implies.
- **Invented numbers.** The scorer prompt asks for placeholders such as [number] where only the candidate knows a figure, yet cheaper models write fixes like "The pipeline failure rate dropped from ~33% to <5%" for a candidate who said "about a third", which teaches the learner to make metrics up. `replaceInventedNumbers` therefore turns every number in a fix, an improvement or the summary that the candidate never wrote in a STAR part or follow-up answer into [number], keeping its units and words (`~[number]%`, `$[number]M`, `[number] ms`). Numbers compare as values, so "33 %" matches "33%" and "1,000" matches "1000", and any number the candidate said may be reused; a version such as 15.4 compares whole. A bracketed placeholder stays unless it holds an invented figure (`[95%]` becomes [number]). Step numbers ("Step 2"), list markers, ordinals, "1:1" and numbers inside names (p99, v2.1, EC2, GPT-4) are not claims and stay. Quotes are not touched. The replaced count is logged as `interview.invented-numbers` (the count only, never text) and returned as `inventedNumbers` on the interviewer's `ScoreResult`, next to `usage`: the service stores only the scorecard, so the count reaches the eval and never the learner or the database.
- **Scripted practice.** The offline branch asks for more when an answer is under 12 words, otherwise asks the question's three follow-ups in order; the service's free closing then ends it. Its scorecard maps the STAR checks and follow-up lengths onto the rubric, capped at 3, lists the flaws those checks catch without quotes, and flags the competency when the average is below 3. It is also the AI scoring fallback.
- **Progress.** The `interview.scored` event carries `competencyId` and `weakCompetencies` and no weak patterns (the upload schema enforces both). The reducer keeps a `behavioral` slice per competency (`lastAt`, `verdict`, `weakSince`); `weakSince` is cleared by a later interview on that competency that does not flag it. A story tagged with a competency flagged since its last telling is due for rehearsal (`isDue`/`dueStories` with the slice).
- **App.** The Interview tab's Behavioral track lists the competencies; AI starts `{ track: 'behavioral', problemId: <competency id>, mode: 'ai' }`, and a question or competency page offers the same start for its id. The session hides code and hints. The first turn is a STAR form that can start from a story tagged with the competency and sends nothing before Give answer; follow-ups use the chat composer, which closes after the server's closing. The scorecard lists each flaw by its `ANSWER_FLAWS` label with its quote and fix, points each weak competency at the stories now due for it (or at writing one), and can keep the answer as a story. The app records the same `interview.scored` event as the server. The disclosure copy in Settings, the interview home and the session is a draft awaiting the owner.
- **Privacy.** Only the STAR text and follow-up answers reach the provider, never story titles, ids or tags, and nothing from anonymous learners. Logs carry no learner text.

## Saving scorecards and review progress

Score completion saves the scorecard and its deterministic `interview.scored` event in one short Postgres transaction. The event feeds weak patterns into review scheduling. Provider calls and spend settlement finish before that transaction starts. A failure in either write rolls back both; a committed response lost in transit can be retried without another provider call or another event. In-memory development storage publishes the same pair synchronously under its learner-state lock.

Completion uses the learner lock shared with deletion and guest merge, then locks the session row. If competing workers outlive the 15-minute lease, the first committed score wins and later scorers receive that stored card. A candidate based on an older transcript, hints, problem or mode receives 409 instead of replacing newer active work. Delayed replies and mode saves also receive 409 once the stored session is scored.

A scoring retry can restore a missing event for an existing scorecard using its original `scoredAt`, without provider admission or quota. Reading a session alone does not perform this repair. A missing or invalid score time receives 409; the server does not invent a timestamp. An event already stored under the deterministic ID is kept unchanged, even when its payload differs: the session's scorecard stays the source of truth, and a learner who uploads a different event first cannot make every paid scoring attempt fail.

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

`AI_DAILY_BUDGET_USD` caps shared liability for attempts admitted on each UTC day. Before every provider attempt, including retries, the API atomically reserves its maximum verified cost in Postgres. Complete usage settles the hold to actual cost; a stream cut off after it reported its input settles at that input plus the output cap; other uncertain transport, metadata or settlement retains the full hold. Admission errors prevent provider dispatch. Reservations settle independently of session persistence, and account deletion does not erase incurred charges. Offline practice makes no paid reservation. An unknown model, custom headers or another endpoint logs an error at startup and serves the scripted interviewer. See [AI spend reservations](DEPLOYMENT.md#ai-spend-reservations) for bounds, concurrency headroom, day rollover, retention and rollout restrictions.

## Failure handling

The metered request wrapper retries eligible 408, 409, 429 and 5xx responses and connection errors, with backoff that honours `retry-after`. Each attempt reserves separately; automatic SDK retries are disabled, and connected streams are not retried. `ANTHROPIC_MAX_RETRIES` sets the maximum retry count (default 2). `ANTHROPIC_TIMEOUT_MS` sets the time to first byte (default 60 s), which does not bound a stream that keeps sending tokens, so each call also has a whole deadline: `INTERVIEW_REPLY_DEADLINE_MS` (default 90 s) for a reply, its retries and stream included, and `INTERVIEW_SCORE_DEADLINE_MS` (default 180 s) for scoring, both attempts and their retries included. Config caps both at 280 s, so a call ends before Vercel's 300 s function limit could kill it with the session lease held. A deadline cancels the upstream request, and a disconnect cancels the upstream reply request (scoring ignores disconnects); a reply cut off after its stream started settles its spend as described above.

What remains after those retries is mapped in `anthropic-errors.ts`:

| Failure                                                         | Learner sees                      | Logged as  |
| --------------------------------------------------------------- | --------------------------------- | ---------- |
| 429, 529, or a `rate_limit_error`/`overloaded_error` mid-stream | 503 "busy, try again in a moment" | warn       |
| 5xx, `api_error`, connection error or timeout                   | 503 "unavailable, try again"      | warn       |
| 400, 401, 403, 404 (bad request, key or model)                  | 502 generic message               | error      |
| Reply or scoring still running at its deadline                  | 503 "unavailable, try again"      | warn       |
| Client disconnects mid-stream                                   | nothing, the request is dropped   | not logged |

- **Errors before the first streamed token** return a JSON error response. **Errors after it** arrive as an SSE `error` event. In both cases the candidate's turn is not saved, so the app puts the text back in the input and the learner can resend it.
- **A refusal or empty reply** is replaced by a neutral prompt to continue the interview.
- **Scoring** retries once if the output fails validation or stops with `max_tokens`/`refusal`. If the second attempt fails too, the offline heuristic scorer produces the card with `mode: "offline"` and a summary that says so, and the app labels it "scripted practice estimate". API errors and the scoring deadline are not replaced by the heuristic: they return 503, nothing is committed, and the learner can score again at once. Scoring is not cancelled when the learner disconnects: the card commits with its progress event, and scoring again returns it without another paid call.
- **Concurrent requests** for the same session (a double-tap, two tabs) get 409 while its reply, scoring or mode-switch lease is held. The lease is shared across API instances, is released when the call ends, and expires after 15 minutes. Score completion and terminal-session write guards also protect the saved result when work outlives that lease.
- **Per-learner quota:** `INTERVIEW_MESSAGES_PER_HOUR` (default 120) replies and scorings per clock hour, counted across instances. Each session allows at most 30 candidate turns of up to 4,000 characters.

## Testing

| Suite                                                                                           | What it proves                                                                                                                                                                                                                                                                                                                                                                           | Needs                |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `src/interview/claude.interviewer.spec.ts`                                                      | Request contract (model, effort, caching, alternation, hint marking), cache-stable prefixes, usage and cost, every error mapping, SDK retry, aborts, reply and scoring deadlines, schema keywords, score retry and fallback                                                                                                                                                              | nothing              |
| `src/interview/scorecard.schema.spec.ts`                                                        | Repair and rejection rules                                                                                                                                                                                                                                                                                                                                                               | nothing              |
| `src/interview/behavioral.*.spec.ts`, `offline.interviewer.spec.ts`                             | Behavioral problems, prompt content and cache stability, STAR rendering, tag escaping, schema enums, quote verification, the verdict clamp, scripted follow-ups and scoring                                                                                                                                                                                                              | nothing              |
| `test/interview-behavioral.e2e-spec.ts`                                                         | A STAR answer and three follow-ups over SSE with the free closing (no provider call, quota or spend), the turn cap and turn rules, flaws and the progress event, guest refusal and scripted practice, the budget, and the progress upload schema. Runs against memory and Postgres                                                                                                       | optional Postgres    |
| `src/interview/pricing.spec.ts`, `spend-guard.spec.ts`                                          | Cost maths, day rollover, budget ceiling                                                                                                                                                                                                                                                                                                                                                 | nothing              |
| `test/interview-ai.e2e-spec.ts`                                                                 | The full HTTP path with the real SDK: SSE streaming, usage persisted but not exposed, AI scoring into progress events, 503 before and during a stream, a reply cut at its deadline and resent, a scoring deadline answered with 503 then scored again, a disconnect cancelling upstream, 409 on concurrent turns, the budget ceiling. Runs against memory and Postgres                   | optional Postgres    |
| `test/paid-access.e2e-spec.ts`                                                                  | Guest UUID rotation cannot dispatch paid work; explicit mode choice, authenticated admission, logout races, stable account quotas, guest merge and legacy sessions                                                                                                                                                                                                                       | optional Postgres    |
| `test/interview-score.e2e-spec.ts`                                                              | Matching score/event pairs, cached repair, lost responses, expired-lease races, stale work, collisions and retired learners                                                                                                                                                                                                                                                              | optional Postgres    |
| `test/interview-score-postgres.e2e-spec.ts`, `test/spend-budget.e2e-spec.ts`                    | Real SQL rollback, ambiguous commit acknowledgement, deletion/merge lock ordering, and incurred spend retained across score rollback                                                                                                                                                                                                                                                     | Postgres             |
| `src/interview/gateway.interviewer.spec.ts`, `gateway-catalog.spec.ts`, `gateway-model.spec.ts` | Gateway request shape, streaming, both scoring formats, the behavioral track, usage, cost and billed settlement, error mapping, reply and scoring deadlines (backoff included), OpenAI pinning, catalog parsing with regional tiers and zero prices, built-in prices and the catalog outage path                                                                                         | nothing              |
| `src/interview/interviewer-choice.spec.ts`, `interviewer.factory.spec.ts`                       | Which interviewer each configuration gets (Claude only when pinned), the API key and the per-request OIDC token, the catalog outage, and scripted practice instead of a failed startup for unpriced, free or short-output models                                                                                                                                                         | nothing              |
| `src/interview/learner-text.spec.ts`, `prompt-rules.spec.ts`                                    | The learner-text rewrites on graded examples (and what they leave alone), and the prompt rules every model broke                                                                                                                                                                                                                                                                         | nothing              |
| `test/interview-gateway.e2e-spec.ts`                                                            | A whole session through `GatewayInterviewer` and a scripted gateway over HTTP: GPT-6 Luna only, plain text saved and shown, usage, scoring into progress, a reply cut at its deadline and resent, scoring past its deadline as a retryable 503 then scored. Runs against memory and Postgres                                                                                             | optional Postgres    |
| `test/live/interviewer.live-spec.ts`                                                            | The production model (GPT-6 Luna through the gateway): scripted strong and weak candidates on every track (behavioral: a strong senior answer, "we" throughout, no metric, blame, an injection attempt, with expected flaws), verdict direction, a gap of at least 1.0 between strong and weak averages, expected weak patterns, cache hits, reply length, no headings, no solution leak | `AI_GATEWAY_API_KEY` |

The Claude contract and e2e suites use a real `Anthropic` client whose `fetch` is scripted (`test/support/fake-anthropic.ts`), so the SDK's own request serialization, SSE parser, retry logic and error classes are exercised. The gateway suites use the real `GatewayClient` over a scripted `fetch` (`test/support/fake-gateway.ts`), so its SSE parser, usage and billed-cost reading and error classes are exercised the same way. All of them run offline in CI.

Run the live eval before changing prompts, the model or effort:

```bash
AI_GATEWAY_API_KEY=... npm run eval:interviewer                                   # default openai/gpt-6-luna
AI_GATEWAY_API_KEY=... INTERVIEW_AI_MODEL=anthropic/claude-sonnet-5.5 npm run eval:interviewer
```

It runs `GatewayInterviewer` with the model's catalog prices, exactly as production does, and prints a table with verdict, average score, token classes, cost and time to first token for each scenario. Full transcripts and scorecards go to `apps/api/eval-results/` (gitignored) for review. Without a local key, run **Interviewer eval** from the Actions tab: it uses the repository's `AI_GATEWAY_API_KEY` secret (the owner adds it), puts the table in the run summary and keeps the transcripts as a downloadable artifact for 30 days. To compare several models, use the comparison below.

## The gateway interviewer

`GatewayInterviewer` runs the interview on a chat model behind the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway): GPT-6 Luna in production, and any model in the comparison below. It calls the OpenAI-compatible `https://ai-gateway.vercel.sh/v1/chat/completions` with plain `fetch`, and sends exactly what Claude gets, through the same track dispatch in `track-prompts.ts` (so behavioral sessions get the behavioral prompts, `<candidate_turn>` rendering, schema, normalizer and redirect): the same system prompts, the turns from `toClaudeMessages` (as chat messages after a `system` message), the same scoring request, and the track's scorecard schema, with its normalizer on the result.

- **Routing**: an `openai/` model is pinned to OpenAI itself (`providerOptions.gateway.only: ["openai"]`), since the disclosure names OpenAI; other models are left to the gateway's routing.
- **Replies** stream with `stream_options.include_usage`, `reasoning.effort` near `low` and `providerOptions.gateway.caching: "auto"`. The gateway then adds cache markers for providers that need them (Anthropic and Alibaba); OpenAI, Google and DeepSeek cache implicitly. `x-session-affinity` carries the session id so a provider can keep the cache warm.
- **Scoring** uses `response_format: {type: "json_schema", strict: true}` at effort near `medium` when the catalog lists `response_format` for the model. Otherwise the schema goes at the end of the scoring request and the JSON object is cut out of the reply text; the report shows which (`json_schema` or `text`). The retry after an unusable card and the offline fallback after two are the same as Claude's.
- **Prices, output limits and effort levels** come from the public catalog at `https://ai-gateway.vercel.sh/v1/models`, fetched at startup (see [Which interviewer runs](#which-interviewer-runs)). Cost uses the base rates (tiers start at 200k prompt tokens; regional prices apply only to pinned requests); spend bounds use the dearest tier and region, tiers within a region included. When a model has no effort control (Haiku 4.5), none is sent; when it lacks the wanted level, the next stronger one is used (Gemini 3 Flash scores at `high`).
- **Usage** on this API reports cache reads as `usage.prompt_tokens_details.cached_tokens` and no cache writes, so writes are counted at the input rate. The gateway's own charge (`provider_metadata.gateway.cost`) is recorded next to the computed cost, and the spend hold settles at the billed figure when the gateway reports one (the computed cost otherwise), since that is what Vercel charges. Session usage keeps the computed cost.
- **Credentials** are fetched for each call before it reserves any spend, bounded by the per-try timeout, the deadline and the disconnect like a request (an OIDC refresh makes requests with no timeout of its own); a credential that fails is the 502 of a rejected key.
- **Failures** are raised as the Anthropic SDK's error classes, so the metered retry, spend holds and learner-safe mapping in `anthropic-errors.ts` apply unchanged.
- **Deadlines** are Claude's, through the same helpers (`deadlineAfter`, `abortedBy`, `deadlineExceeded`): a reply, retries and stream included, is cancelled upstream at `INTERVIEW_REPLY_DEADLINE_MS` (combined with the learner's disconnect through `AbortSignal.any`) and answered with the retryable 503; scoring, both attempts, every retry and the backoff between them, stops at `INTERVIEW_SCORE_DEADLINE_MS` with a retryable 503, so the learner scores again rather than getting a scripted card for an AI interview. A try cut off after its stream started keeps its whole hold, since chat completions report usage only at the end.

At the time of writing the catalog lists `response_format` for Claude Sonnet 5.5, Claude Haiku 4.5, Gemini 3 Flash, GPT OSS 120B and DeepSeek V4 Flash, but not for Qwen 3.7 Plus, which therefore scores from text.

### Comparing models

Run the comparison (it costs money; the default budget is $3):

```bash
AI_GATEWAY_API_KEY=... npm run eval:models
AI_GATEWAY_API_KEY=... MODELS=anthropic/claude-sonnet-5.5,google/gemini-3-flash BUDGET_USD=1 OUT=/tmp/models npm run eval:models
```

| Variable             | Default                                                                                           | Purpose                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `AI_GATEWAY_API_KEY` | required                                                                                          | Gateway key; the run fails at once without it or if it is rejected                         |
| `MODELS`             | GPT-6 Luna, Sonnet 5.5, Gemini 3 Flash, GPT OSS 120B, DeepSeek V4 Flash, Haiku 4.5, Qwen 3.7 Plus | Comma-separated gateway model ids                                                          |
| `BUDGET_USD`         | `3`                                                                                               | Every call holds its maximum cost first; the run stops before a call could pass the budget |
| `OUT`                | `apps/api/eval-results/models-<time>/` (gitignored)                                               | Where `models.json` and `models.md` go                                                     |

Each model runs every live-eval scenario on all three tracks (`test/live/scenarios.ts`, which includes the behavioral scenarios) through `runScenario` and is judged by the live eval's own checks (`scenarioChecks`, `separationChecks`). `models.md` has a summary table (pass rate over all checks, mean computed and billed cost per session, p50 time to first token and per reply) and a table per scenario (verdict, average, failed checks, tokens, cost, scoring time, warnings or the provider's error). `models.json` keeps every transcript and scorecard.

Two checks need more than the scorecard:

- **Fixes invent no numbers** (behavioral scenarios) fails when the scorer's feedback held any number the candidate never said, counted before the normalizer replaced it. The report shows the count per scenario and the total per model (`Invented numbers`), so a model that invents is visible even though the learner would only have seen [number].
- **Cache reads from reply 3** is judged only for a model that reported a cache read on at least one of its calls in the run; otherwise it is marked not reported and counts neither way, so the pass rate measures the interview rather than the gateway's usage fields. The catalog cannot decide this: it prices cache reads for every default model, yet in the first run Gemini 3 Flash and Haiku 4.5 reported none on any call. A model that reports reads elsewhere and misses them in one scenario still fails there. The direct Claude eval always judges it, since the Anthropic API reports cache reads. Compare the billed cost for a model marked not reported.

## Configuration

| Variable                      | Default                               | Purpose                                                                         |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| `INTERVIEW_AI_PROVIDER`       | `gateway` with a gateway credential   | `gateway` or `anthropic`; see [Which interviewer runs](#which-interviewer-runs) |
| `INTERVIEW_AI_MODEL`          | `openai/gpt-6-luna`                   | The gateway model; it must be in the catalog                                    |
| `AI_GATEWAY_API_KEY`          | unset (Vercel's OIDC token on Vercel) | Gateway key; not needed on Vercel                                               |
| `ANTHROPIC_API_KEY`           | unset                                 | Claude direct, used only with `INTERVIEW_AI_PROVIDER=anthropic`                 |
| `ANTHROPIC_MODEL`             | `claude-sonnet-5`                     | A Claude model with verified pricing and request bounds                         |
| `ANTHROPIC_TIMEOUT_MS`        | `60000`                               | Time to first byte per request, either provider (scoring: its deadline)         |
| `INTERVIEW_REPLY_DEADLINE_MS` | `90000`                               | A whole reply, retries and stream included (max 280 s)                          |
| `INTERVIEW_SCORE_DEADLINE_MS` | `180000`                              | Whole scoring, attempts and retries included (max 280 s)                        |
| `ANTHROPIC_MAX_RETRIES`       | `2`                                   | Metered retries for transient failures, either provider                         |
| `AI_DAILY_BUDGET_USD`         | unset                                 | Shared daily liability ceiling with Postgres                                    |
| `INTERVIEW_MESSAGES_PER_HOUR` | `120`                                 | Per-learner message and scoring quota                                           |
