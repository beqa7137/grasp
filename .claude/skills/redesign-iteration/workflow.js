export const meta = {
  name: 'redesign-iteration',
  description: 'Build one redesign iteration from docs/REDESIGN.md: plan, critique, build, adversarial review with refuters, fix rounds',
  phases: [
    { title: 'Plan', detail: 'a planner writes the plan; two critics attack it' },
    { title: 'Build', detail: 'the builder implements the iteration in its worktree' },
    { title: 'Review', detail: 'simplify, adversarial and browser reviewers, then refuters' },
    { title: 'Fix', detail: 'the builder fixes confirmed findings; re-review the fix' },
  ],
}

const A = args
const S = A.scratch
const W = A.worktree
const ENV = `Environment (shared machine; other agents may be working elsewhere):
- Your git worktree is ${W} (branch ${A.branch}, based on ${A.base}, which is origin/main). Work only there. Never touch /home/user/grasp, /home/user/grasp/.claude/worktrees, /var/tmp/r0 or other worktrees.
- \`export PATH=$HOME/node24/node-v24.21.0-linux-x64/bin:$PATH\`. Run \`npm ci\` in ${W} first if node_modules is missing.
- Postgres: run ${W}/.claude/skills/grasp-env/ensure-pg.sh. Use only your databases: TEST_DATABASE_URL=postgresql://postgres@localhost:5433/${A.testDb} and, for e2e and audits, DATABASE_URL=postgresql://postgres@localhost:5433/${A.e2eDb}.
- Browsers: PLAYWRIGHT_BROWSERS_PATH=/var/tmp/pw and CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell. Never run \`playwright install\`.
- Ports: yours are E2E_PORT=${A.port} and E2E_GITHUB_PORT=${A.ghPort}; reviewers use ${A.port + 1} and ${A.ghPort + 1}. Never use any port listed as taken in .claude/skills/grasp-env/SKILL.md or used by another running iteration. Blank AI_GATEWAY_API_KEY, ANTHROPIC_API_KEY and VERCEL_OIDC_TOKEN for every server you start.
- Kill only processes you started, by PID. Never use pkill -f or killall.
- Machine load causes WebKit flakes: run only the e2e specs and audit states you need, never the whole e2e suite (the lead runs it once at the end). "WebKit encountered an internal error" is a known Playwright WPENetworkProcess segfault here; rerun that spec once before treating it as real.
- tools/verify/README.md documents the gates R0 built (first-paint bytes in postbuild, the style ratchet, profiles desktop, w1024, ipad, pixel7, w320, the data-motion test mode, the tablet e2e project via E2E_TABLET=1, the stored screenshot set and pixdiff). Use them as section 5.0 of docs/REDESIGN.md requires.
- Commit as the owner: \`git -c user.name="Beka Goderdzishvili" -c user.email=beqa.goder@gmail.com commit\`, message ending in exactly:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011TocjxDk4FRCUxi1ynBHEv
  Never push. Never put a model name in a commit message. Never use em dashes anywhere.`

const CONTEXT = `You are working on Grasp, a learning app for algorithm patterns and system design (Angular 22 zoneless with Ionic in apps/app, NestJS API in apps/api serving the web build, engine in libs/engine, e2e in e2e, browser tools in tools/verify). The owner approved docs/REDESIGN.md; this task is its iteration ${A.id}. Read its section 5.2 entry for ${A.id} (scope, acceptance, content review), section 5.0, section 5.1 dependencies, and every spec section the scope refers to, plus docs/LOOP.md (Rules for picking, the Redesign section and R0's row 97 decisions) and tools/verify/README.md. ${A.extra ?? ''}`

const PLAN_SCHEMA = { type: 'object', properties: { planPath: { type: 'string' }, summary: { type: 'string' } }, required: ['planPath', 'summary'] }
const CRIT_SCHEMA = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, issue: { type: 'string' }, change: { type: 'string' } }, required: ['severity', 'issue', 'change'] } } }, required: ['issues'] }
const BUILD_SCHEMA = { type: 'object', properties: { commits: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, verifyPassed: { type: 'boolean' }, evidence: { type: 'string' }, followUps: { type: 'array', items: { type: 'string' } } }, required: ['commits', 'summary', 'verifyPassed', 'evidence', 'followUps'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, file: { type: 'string' }, detail: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'severity', 'file', 'detail', 'fix'] } } }, required: ['findings'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } }, required: ['refuted', 'reason'] }
const tag = A.id.toLowerCase()

phase('Plan')
const plan = await agent(`${CONTEXT}\n\n${ENV}\n\nYou are the planner. Do not edit the repository. Write a concrete plan for ${A.id} to ${S}/${tag}-plan.md: for every scope item and acceptance check, the files to change, the approach and the trade-offs (CLAUDE.md asks for this), how each acceptance check will be proven, which gates and profiles of 5.0 apply, and anything in the scope that is wrong about the current code (check every claim against the repo). Keep to the simplest thing that meets the acceptance checks. Return the plan path and a summary.`, { label: `plan:${tag}`, phase: 'Plan', schema: PLAN_SCHEMA })

const critiques = await parallel([
  ['scope', `Check the plan against ${A.id}'s scope and acceptance in docs/REDESIGN.md and the 5.0 gates line by line: anything missing, misread or not provable.`],
  ['risk', 'Attack the plan for risk and simplicity: regressions in screens it does not mean to touch, accessibility, both themes, phone and 320 px, first paint, e2e breakage, flakiness, and needless complexity. Check every claim about the current code by reading it.'],
].map(([k, lens]) => () => agent(`${CONTEXT}\n\nRead the plan at ${plan.planPath}. You are an independent critic; do not edit anything. ${lens} Return concrete issues with the change you want.`, { label: `critique:${k}`, phase: 'Plan', schema: CRIT_SCHEMA })))
const critique = critiques.filter(Boolean).flatMap((c) => c.issues)

phase('Build')
let build = await agent(`${CONTEXT}\n\n${ENV}\n\nYou are the builder for ${A.id}. The plan is at ${plan.planPath}.${A.resumeNote ? ' ' + A.resumeNote : ''} Critics raised these issues; address each (adopt, or reject with a reason in your summary):\n${JSON.stringify(critique, null, 1)}\n\nImplement ${A.id} fully in ${W}:\n- Meet every acceptance check and prove each with a command you ran or a screenshot you read.\n- npm run verify exits 0 (the postbuild first-paint line and the style ratchet included; an intended baseline change is committed and stated).\n- Run the e2e specs you touched or that cover touched screens on desktop, phone and iphone, plus the tablet subset if navigation, the player or the Lab changed.\n- Run audit.mjs for the affected states in both themes on desktop, w1024, pixel7 and w320 (plus ipad when navigation changes), and pixdiff against the stored set of main; read every differing screenshot.\n- Match the surrounding code's idiom; no comments except non-obvious reasons; no new dependencies.\n- Add docs/LOOP.md Shipped row ${A.row} for "Redesign ${A.id}: ${A.title}" in the style of the existing rows, change the Redesign section's "Next:" line to the next iteration, and record follow-ups.\n- Commit. Return the commits, a summary, whether verify passed, the evidence and follow-ups.`, { label: `build:${tag}`, phase: 'Build', schema: BUILD_SCHEMA })

const REVIEWERS = [
  { key: 'simplify', prompt: `Simplify review of \`git -C ${W} diff ${A.base} HEAD\`: reuse, simplification and comments (CLAUDE.md rules), efficiency, and altitude (fixes at the right layer, data fixed at its source). Report only real problems with a concrete fix.` },
  { key: 'adversarial', prompt: `Adversarial review of \`git -C ${W} diff ${A.base} HEAD\` against ${A.id}'s scope and acceptance: does each change do what the spec says, on every screen and state it affects, in both themes, on phone, 320 px and desktop, with the keyboard and a screen reader? Hunt regressions in untouched behaviour, wrong copy (CLAUDE.md writing rules), and acceptance checks that pass vacuously. Prove each finding with a probe, a test or exact file:line quotes.` },
  { key: 'browser', prompt: `Browser review. Serve the build in ${W} (build only if apps/app/dist is missing or stale; never rebuild while serving) on port ${A.port + 1} with WEB_DIST_DIR through a /var/tmp symlink path, DATABASE_URL=postgresql://postgres@localhost:5433/${A.e2eDb}, NODE_ENV=production, a 40-character JWT_SECRET and blank AI keys. Run tools/verify/audit.mjs for every state the change touches in both themes on desktop, w1024, pixel7 and w320 (and ipad when navigation changed), OUT under ${S}/${tag}-browser, and READ the screenshots. Report clipped text, overlap, wrong layout, axe violations, page errors and anything that does not match the spec, with the state and screenshot path. Kill the server by PID when done.` },
]

const reviewRound = async (round, scopeNote) => {
  const results = await pipeline(
    REVIEWERS,
    (r) => agent(`${CONTEXT}\n\n${ENV}\n\nYou are an independent reviewer; do not commit or edit files in ${W}. ${scopeNote}\n\n${r.prompt}`, { label: `review${round}:${r.key}`, phase: 'Review', schema: FINDINGS }),
    (res, r) => parallel((res?.findings ?? []).map((f, i) => () =>
      parallel([0, 1, 2].map((k) => () => agent(`${CONTEXT}\n\n${ENV}\n\nDo not commit or edit files in ${W}. Another reviewer reports this problem in ${A.id} (\`git -C ${W} diff ${A.base} HEAD\`):\n\nTitle: ${f.title}\nSeverity: ${f.severity}\nFile: ${f.file}\nDetail: ${f.detail}\nProposed fix: ${f.fix}\n\nTry to REFUTE it: reproduce it yourself (scratch copies under ${S}/${tag}-refute-${round}-${r.key}-${i}-${k}, removed after), check it is real, in scope for ${A.id} (pre-existing problems outside its scope do not count) and correctly rated. Default to refuted=true if you cannot reproduce it.`, { label: `confirm${round}:${r.key}:${i}:${k}`, phase: 'Review', schema: VERDICT })))
        .then((vs) => ({ ...f, from: r.key, upheld: vs.filter(Boolean).filter((v) => !v.refuted).length, reasons: vs.filter(Boolean).map((v) => v.reason) })),
    )),
  )
  const all = results.filter(Boolean).flat()
  return { confirmed: all.filter((f) => f.upheld >= 2), refuted: all.filter((f) => f.upheld < 2).map((f) => ({ title: f.title, from: f.from })) }
}

const history = []
let scope = `Review the whole ${A.id} change.`
for (let round = 1; round <= 3; round++) {
  phase('Review')
  const { confirmed, refuted } = await reviewRound(round, scope)
  history.push({ round, confirmed: confirmed.map((f) => ({ title: f.title, severity: f.severity, from: f.from })), refuted })
  log(`review round ${round}: ${confirmed.length} confirmed, ${refuted.length} refuted`)
  if (!confirmed.length) break
  phase('Fix')
  const before = build.commits[build.commits.length - 1]
  const fixed = await agent(`${CONTEXT}\n\n${ENV}\n\nYou are the ${A.id} builder, fix round ${round}. Your work is committed in ${W}. Reviewers confirmed these problems (each upheld by at least 2 of 3 refuters):\n${JSON.stringify(confirmed.map((f) => ({ title: f.title, severity: f.severity, file: f.file, detail: f.detail, fix: f.fix, refuterNotes: f.reasons })), null, 1)}\n\nFix every one at its root, with a test where it is behaviour. Re-run npm run verify and the affected checks only. Update LOOP row ${A.row} if what shipped changed. Commit, and return the new commits, a summary, whether verify passed and the evidence.`, { label: `fix${round}:${tag}`, phase: 'Fix', schema: BUILD_SCHEMA })
  if (!fixed) break
  build = { ...build, commits: [...build.commits, ...fixed.commits], summary: `${build.summary}\n\nFix round ${round}: ${fixed.summary}`, verifyPassed: fixed.verifyPassed, evidence: `${build.evidence}\n\nFix round ${round}: ${fixed.evidence}`, followUps: [...build.followUps, ...(fixed.followUps ?? [])] }
  scope = `Review fix round ${round} (\`git -C ${W} diff ${before} HEAD\`): does it fix these confirmed findings, and did it introduce new problems? ${JSON.stringify(confirmed.map((f) => f.title))}. Report only problems in or caused by this fix, or confirmed findings left unfixed.`
}

return { plan: plan.summary, critique, build, history }
