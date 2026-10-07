---
name: land-change
description: Land a finished, reviewed Grasp change on main, which releases it to production - rebase onto origin/main, resolve docs/LOOP.md table conflicts safely, write the LOOP landing note, run the full three-device e2e suite in CI on the exact head, fast-forward main, and confirm the release. Use whenever an iteration is ready to ship.
---

# Land a change

A push to `main` runs CI and then `deploy.yml`, so every push to `main` is a release. Follow CLAUDE.md's "Releasing a
change"; this is the procedure.

## 1. Rebase onto main

`git fetch origin main`, then in the change's worktree `git rebase origin/main`. Conflicts are almost always in
`docs/LOOP.md`'s Shipped table, because every landing edits its own row and prettier re-pads the whole table when the
widest row changes. Never resolve them blind:

1. List the hunks: `grep -n '^<<<<<<<\|^=======\|^>>>>>>>' docs/LOOP.md` and read each side's row numbers (lines
   starting `| <n> `).
2. Keep main's version of every row that main has, and this change's version of its own row (the newest; check which
   one carries the latest text, for example a "Landing:" note or a later review round).
3. Write the result, check no markers remain, run `npx prettier --check docs/LOOP.md`, then `git add` and continue.

Any conflict outside LOOP.md: read both sides and merge by intent. Never pick a side wholesale.

## 2. Write the LOOP landing note

Add a short **Landing:** sentence to the change's row: what the full suite showed (on the head before this note, or
"in CI on this exact head") and anything deliberately skipped. Keep the row under the table's widest row when you can,
so prettier does not re-pad every row. Commit as the owner with the session trailers.

## 3. Full suite in CI on the exact head

1. Push the head to the working branch (force-with-lease if it was rewritten).
2. Dispatch CI on it: `gh api -X POST repos/beqa7137/grasp/actions/workflows/ci.yml/dispatches -f ref=<branch>`. Its
   eight shards take about 12 minutes; the local container needs 45 to 50.
3. Find the run: `gh api "repos/beqa7137/grasp/actions/workflows/ci.yml/runs?branch=<branch>&per_page=1"` and check
   `head_sha` is the head you pushed. Wait for `conclusion == success`.
4. On a failure, read the failing job's log (`gh api repos/beqa7137/grasp/actions/jobs/<id>/logs`). A WebKit internal
   error or one known flaky test: re-run the failed jobs once. Anything else: fix it on the branch and repeat.
5. If the change touches a path in `native.yml`'s `paths` list, dispatch `native.yml` the same way.

## 4. Fast-forward main and confirm

1. `git fetch origin main && git merge-base --is-ancestor origin/main <sha>` must hold, then
   `git push origin <sha>:main`. Never force-push main.
2. Main's CI finds the passing run for the same commit and skips its jobs; deploy follows.
3. When the deploy finishes, `curl -s https://grasp-rho-taupe.vercel.app/api/health` must report the new `release`.
   Since 2026-10-07 the owner runs no other production check unless asked.

## 5. Tidy up

Reset the working branch to the new main and re-apply any work-in-progress commits that were parked on it, then push
it with force-with-lease. Remove worktrees and databases of iterations that have landed only when nothing else needs
them.
