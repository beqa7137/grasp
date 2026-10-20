---
name: redesign-iteration
description: Build one iteration of the approved Grasp redesign (docs/REDESIGN.md, R0 to R48) through a multi-agent workflow - plan, two critics, a builder, three reviewers with three refuters per finding, and up to three fix rounds - in its own worktree. Use when the loop picks the next redesign iteration, or to resume one that a restart interrupted.
---

# Build a redesign iteration

`docs/LOOP.md`'s Redesign section names the next iteration; `docs/REDESIGN.md` section 5.2 has its scope, acceptance
checks and content review, section 5.1 its dependencies, and section 5.0 the gates every iteration passes.

## Prepare

Follow `.claude/skills/grasp-env/SKILL.md`, then for iteration `Rn`:

1. `git fetch origin main && git worktree add -b rn /var/tmp/rn origin/main` (base on the previous iteration's branch
   instead if that one has not landed yet), then `npm ci` there.
2. Create its databases `grasp_test_rn` and `grasp_e2e_rn`.
3. Pick a free port pair (see grasp-env) and the next LOOP Shipped row number.

## Run

Run `workflow.js` in this directory with the Workflow tool (`scriptPath`), passing `args`:

```json
{
  "id": "R4",
  "title": "engine release A",
  "row": 101,
  "worktree": "/var/tmp/r4",
  "branch": "r4",
  "base": "<sha of origin/main>",
  "testDb": "grasp_test_r4",
  "e2eDb": "grasp_e2e_r4",
  "port": 4402,
  "ghPort": 4502,
  "scratch": "<the session's scratchpad directory>",
  "extra": "Anything the agents must know beyond the spec: what the previous iteration left, R-specific traps."
}
```

The workflow returns the plan summary, the critics' issues, the build (commits, evidence, follow-ups) and each review
round's confirmed and refuted findings. It needs the user's opt-in to multi-agent workflows (ultracode, or asking for
one). Without it, run the same stages with the Agent tool: a builder, then two or three independent reviewers, then the
builder again with the confirmed findings.

## Local checks

The default for every iteration (owner decision during R15): run `npm run verify`, the build, and the e2e specs the
change touches on desktop and phone, plus `type.spec`, `a11y` and `navigation` when names, layout or routes change, and
the most-affected of those specs on iphone. The full three-device suite runs only in CI, on the exact head. Run
`timing.mjs` once (7 runs, one order), and only for changes that touch loading, first paint or a hub tap. The audit and
pixdiff stay as before.

## Resume after a restart

Commit the worktree's uncommitted work as WIP (grasp-env), then run the workflow again with `resumeFromRunId` and the
same `args` plus `"resumeNote"`: name the WIP commits and ask the builder to review them, finish, and squash
(`git reset --soft <base>`, then commit). Only the builder prompt reads `resumeNote`, so the plan and critiques replay
from cache.

## Judge the result

- A finding counts when at least two of three refuters could not refute it. Read the confirmed findings yourself; a
  fix that only moves the problem (each R2 round broke focus somewhere new) needs the rule fixed, not the case.
- The workflow stops after three review rounds even if the last fix round was not reviewed. Decide whether a further
  focused check is worth it; record in the LOOP row when it was skipped.
- Then land it with `.claude/skills/land-change/SKILL.md`.
