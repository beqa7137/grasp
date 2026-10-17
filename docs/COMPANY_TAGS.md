# Company tags: interview reports and their monthly refresh

Problem and case pages list "Reported in interviews": public write-ups by candidates that name that exact problem or
case at a company (R49, REDESIGN.md 5.2). This page is how the list stays honest.

## What a report is

- One row in `libs/engine/src/companies/reports.data.ts`: the item (`problem` or `case` and its id), the company, the
  source URL, its publisher (from `source-policy.ts`) and title, the reported date with its basis, the day it was last
  checked, and a note of what was asked, in our own words, at most 200 characters.
- **Same problem only.** "Similar to", "a variation of" and a different structure (an n-ary tree for our binary tree,
  Course Schedule II for Course Schedule) are not reports.
- **Dates.** The interview date when the write-up gives one (`interview`), otherwise its publication date
  (`published`), or, when the page shows only a last-updated date (GeeksforGeeks does), that date (`updated`). They show
  as "Interview Aug 2025", "Published May 2025" or "Updated Sep 2025". Expiry runs from whichever is stored, and a
  partial date counts from its last day.
- **Never stored:** problem text, post text, author names, profile links or outcomes. No page copies are kept anywhere,
  not even while working.

## Sources

`source-policy.ts` decides. A source must be an https page on an allowed publisher's own host, and never on a denied
host (`DENIED_HOSTS`: LeetCode, Glassdoor, Blind, 1point3acres, Reddit, Exponent/Aced, Hello Interview,
interviewing.io, PracHub, GitHub's company-wise lists). `reports.spec.ts` fails on any row that breaks this.

- `manual` publishers (today GeeksforGeeks, the Roundz Newsletter on Substack and Taro, whose terms forbid crawling or
  scraping): a person, or an agent acting as one, opens each page once to read it. No script ever fetches them, and
  nothing is collected in bulk. An agent's single page read counts as manual only where the publisher does not block
  it.
- `automated` publishers: only where the terms allow scripted access. The audit may send them a HEAD request after
  reading robots.txt. None is listed yet.
- A publisher whose terms change to forbid our use moves to `DENIED_HOSTS`, and its rows are removed in the same change.

## When a report shows

Decided on the device each day, so no release is needed: a row is hidden once its reported date is over 24 months old,
and once 100 days pass after its `checked` day. A stopped refresh therefore makes the lists disappear rather than go
stale. A page with no shown report shows no list.

## The monthly refresh

Around the 3rd of each month:

1. Branch from `main`: `git switch -c company-tags/YYYY-MM origin/main`.
2. Run the audit: `npm run build:engine && node tools/company-tags/audit.mjs` (add `--no-links` offline, `--today
YYYY-MM-DD` to look ahead). It writes `company-tags-audit-YYYY-MM-DD.md` in the system's temporary directory (or
   `--out <file>`; keep it outside the repository, so it is never committed or format-checked): policy refusals, rows past or within 45 days of expiry,
   rechecks overdue or due within 45 days, items losing their last shown row, link checks (automated publishers only)
   and a checklist of manual pages. It changes no data and never fetches a manual or denied publisher.
3. Edit `reports.data.ts`:
   - remove refused and expired rows;
   - open each manual page on the checklist once, as a reader would; if it still names the same problem and supports
     the date, set `checked` to today, otherwise remove the row;
   - if a manual page refuses the request (a 403, a captcha, a login wall), an agent does not retry it through another
     route or tool: it leaves `checked` unchanged and lists the row in the change for a person to open in a browser.
     If nobody does, the 100-day recheck hides the row;
   - set `LAST_REFRESH` in `reports.data.ts` to today: no row may claim a later `checked`;
   - remove a row whose link is gone (a 404 or 410 on two runs a month apart, or a manual check that fails);
   - add new reports only from pages read the same way, each with a note in our own words.
4. Run `npm run verify`, push the branch, and have the change reviewed (same problem, date basis, own words, allowed
   publisher). Only a reviewed change lands, through `CLAUDE.md`'s release sequence with its `docs/LOOP.md` line. The
   refresh itself never pushes `main`, since every push to `main` is a release.

A takedown request from a company, publisher or author is handled the same way, out of cycle, with the request noted in
`docs/LOOP.md` (no personal data).

## Source access log

Every time pages of a manual publisher were loaded other than one at a time by a reader, or a check was out of the
ordinary, it is recorded here.

- 2026-10-16: the research pass fetched about 80 Roundz Newsletter posts and 25 GeeksforGeeks pages with a script and
  kept text copies while matching; the copies were deleted the same day.
- 2026-10-17: before shipping, each of the 26 pilot source pages was read once as a single page by an agent, with no
  copy kept (one GeeksforGeeks page refused the first request and opened on one retry; one Roundz post was read a second
  time in the fix round to word its note).
- 2026-10-17: the R49 code review's Chromium link checks loaded about 16 roundz.substack.com pages through popups its
  network stub missed, as a person clicking the links would.
