# Pilot protocol

A two-week pilot with about ten people preparing for big-tech interviews. The aim is evidence, not polish: does the loop (learn a pattern, watch and predict, spaced review, apply it in an interview) build skill that sticks, and do people come back to it on their own?

## Questions the pilot answers

1. **Habit.** Do testers return on most days without being reminded?
2. **Learning.** Does spaced review hold recall near the FSRS target, and do testers feel more confident in the patterns they practised?
3. **Interviewer.** Does the AI interviewer feel realistic, and do its scorecards match how testers judge their own performance?
4. **Value.** Which parts pull their weight (visualizers, Design Lab, review, interviews), and which are ignored?

## Success criteria

These are the targets `npm run pilot:report` checks. Definitions are in [Metric definitions](#metric-definitions).

| Metric                                      | Target  | Why                                        |
| ------------------------------------------- | ------- | ------------------------------------------ |
| D1 retention                                | ≥ 50%   | First session was worth returning for      |
| D7 retention                                | ≥ 30%   | The loop survives the novelty week         |
| Active days per learner, last 7 days        | ≥ 3     | It's becoming a habit                      |
| Did a spaced review                         | ≥ 80%   | The core loop is discoverable              |
| Finished a scored interview                 | ≥ 50%   | Testers reach the payoff feature           |
| Interview completion (scored / started)     | ≥ 60%   | Interviews are engaging enough to finish   |
| Recall on items seen at least a day earlier | ≥ 80%   | Scheduling works (FSRS aims for 90%)       |
| Average in-app usefulness rating            | ≥ 4.0/5 | Testers find it useful for their prep      |
| AI cost per scored interview                | ≤ $0.25 | The unit economics can support a paid tier |

**Decision rule:**

- **Continue to a wider beta** if at least seven targets are met, including both retention targets.
- **Iterate and re-run with a new cohort** if four to six are met.
- **Rethink the core loop before building more** if three or fewer are met.

The exit interviews explain the numbers; they don't replace them.

## Cohort

- **10 testers** actively preparing for interviews at large tech companies within the next three months:
  - 4 new grads or interns
  - 4 engineers with 2–5 years of experience
  - 2 senior engineers focused on system design
- **Platforms:** at least 3 on iOS, at least 3 on Android, the rest on the web.
- **Screener:** target companies and timeline; current prep tools; hours per week available (need at least 3); a self-rating from 1 to 5 on arrays/strings, graphs, dynamic programming and system design.
- **Exclude** close friends of the team where possible; their feedback skews positive.

## Timeline

| When      | What                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Week 0    | Deploy (see [DEPLOYMENT.md](DEPLOYMENT.md)), set `ADMIN_TOKEN` and `AI_DAILY_BUDGET_USD`, run `npm run eval:interviewer`, walk through every flow on each platform (the web flows are automated in `e2e/`; the native apps still need a pass on real devices) |
| Day 1     | 15-minute onboarding call per tester; baseline survey; send the welcome message below                                                                                                                                                                         |
| Days 1–14 | Testers use Grasp on their own; operator checks run daily                                                                                                                                                                                                     |
| Day 7     | Short check-in message; first weekly report                                                                                                                                                                                                                   |
| Day 14    | Exit survey and a 30-minute exit interview; final report                                                                                                                                                                                                      |
| Day 15–17 | Synthesis and decision against the success criteria                                                                                                                                                                                                           |

### Welcome message

> Thanks for joining the Grasp pilot! For the next two weeks, try to spend 10–15 minutes a day. Start with the 5-minute **placement check** on the Learn tab, then **Review**, then learn or visualize one pattern. Over the two weeks, aim for at least **two mock interviews** and **two Design Lab missions**. When something breaks, confuses you or sparks an idea, tap **Feedback** on the right edge of the screen. It takes 20 seconds and we read everything. You can export or delete your data at any time in Settings. Link: https://…

## Surveys

**Baseline (day 1) and exit (day 14):**

- Self-rating from 1 to 5: arrays/strings, two pointers and sliding window, graphs, dynamic programming, system design.
- "How ready do you feel for a big-tech interview loop?" (1–5)

**Exit only:**

- How likely are you to recommend Grasp to a friend preparing for interviews? (0–10)
- Which part helped most, and which would you drop?
- How realistic was the AI interviewer? (1–5) Did its scorecard match your own sense of how it went?
- What would you have used instead of Grasp these two weeks?
- Would you pay for it? What would it replace?

**Exit interview prompts:** walk through the last session; the moment something clicked; the moment they nearly quit; what they'd tell a friend it is.

## Operating the pilot

**Daily (about 5 minutes):**

- Skim new feedback: `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/api/admin/feedback`
- Check Sentry for new issues.
- Check yesterday's AI spend in the report.
- Fix anything that blocks a tester the same day.

**Weekly:**

```bash
ADMIN_TOKEN=... npm run pilot:report -- --url https://<host> --out reports/week-1.md
```

Review the targets table and the daily activity, then tag each feedback note as one of **bug**, **UX**, **content**, **interviewer** or **idea**.

**Triage:**

- A bug that loses progress or blocks a core flow is fixed the same day.
- A confusing flow is fixed within the week.
- Ideas are collected and considered after the pilot.

**Before releasing Google and GitHub sign-in:** accounts from the old email-code sign-in have no Google or GitHub sign-in method. List them with the query in [ACCOUNTS.md](ACCOUNTS.md#accounts-from-the-old-email-code-sign-in) and ask those testers to connect one under Settings → Sign-in methods while they are still signed in. Once signed out, only a Gmail or Google Workspace address gets back in unaided; the same section describes the operator's remedy for everyone else.

## Data and privacy

- **What is stored:**
  - learning events (reviews, predictions, missions, interview results)
  - interview transcripts and scorecards
  - feedback notes, each with the screen and app version it was sent from

  All of it sits under a random learner id generated on the device. Testers who choose to sign in do so with Google or GitHub; Grasp keeps only the account's verified email address and its Google or GitHub account id, to recognize the tester on their next sign-in.

- **Third parties:** interview transcripts, shared code and behavioral answers are sent to OpenAI's GPT-6 Luna through Vercel's AI Gateway to run and score interviews. Error reports go to Sentry with request bodies, headers and learner ids stripped. Sign-in goes through Google or GitHub, whichever the tester picks.
- **Consent:** testers see a pilot notice on first launch that explains the above, and the onboarding message repeats it.
- **Access:** only the operator holding `ADMIN_TOKEN` can see aggregate metrics and feedback. The metrics never include learner ids.
- **Tester control:** Settings → Export downloads everything stored for that learner. Settings → Delete erases progress, interviews, feedback, the account and sign-in methods from the server, then clears the device. If device cleanup fails, the app asks the tester to try Delete again. A tombstone keeps the random learner ID and deletion time so a stale device cannot restore erased data. It contains no learning content, email or provider identity.
- **Retention:** tombstones remain while the service runs to reject stale devices. A merged guest learner tombstone may also hold its destination learner ID until that destination is erased. Delete the pilot database, including tombstones, 90 days after the pilot ends, unless a tester explicitly asks to keep their progress.

## Metric definitions

All days are UTC. A learner is **active** on a day if they recorded a learning event, sent an interview message or sent feedback that day.

- **D1 / D7 retention:** among learners whose first active day is at least 1 (or 7) days ago, the share who were active again on or after day 1 (or day 7).
- **Active days per learner (7d):** the average number of distinct active days in the last 7 days, over learners active in that window.
- **Activation steps:** the share of all learners who ever did each thing (the placement check, a review, a visualizer prediction, a completed mission, a started interview, a scored interview).
- **Recall after at least a day:** among graded reviews of an item the same learner had reviewed at least 24 hours earlier, the share answered correctly. This is the observable counterpart of the FSRS retention target.
- **Interview completion:** scored sessions divided by started sessions.
- **AI cost per scored interview:** total AI spend across all sessions, including unscored ones, divided by scored sessions.
- **Median session length:** the time between the first and last action of a visit. Visits are separated by 30 minutes of inactivity.

Metrics come from `GET /api/admin/metrics` (`apps/api/src/admin/cohort-metrics.ts`, unit-tested in `cohort-metrics.spec.ts`).
