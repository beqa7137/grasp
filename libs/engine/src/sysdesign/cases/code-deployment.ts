import { DISTRIBUTION, distribution, secondsSpan, type DistributionSettings } from './deploy/distribution.js';
import { rollout, type RolloutSettings } from './deploy/rollout.js';
import { durationText } from './email/smtp-retry.js';
import { storageText } from './email/storage.js';
import type { CaseStudy } from './types.js';
import { num } from './widget-checkpoint.js';

const SERVICES = 2_000;
const DEPLOYS_A_DAY = 4;
const PEAK_HOUR = 3;
const SERVERS = 50_000;
const REGIONS = 5;
const INSTANCES_A_SERVICE = 100;
const LARGEST = 20_000;
const ARTIFACT_MB = 500;
const ORIGIN_GBPS = 10;
const POLL_S = 30;
const REPORT_S = 60;

const deploys = SERVICES * DEPLOYS_A_DAY;
const hourly = deploys / 24;
const peakHour = hourly * PEAK_HOUR;
const instances = SERVICES * INSTANCES_A_SERVICE;
const dailyBytes = deploys * INSTANCES_A_SERVICE * ARTIFACT_MB * 1e6;
const averageGbps = (dailyBytes * 8) / 86_400 / 1e9;

const fleet: DistributionSettings = {
  sizeMb: ARTIFACT_MB,
  hosts: LARGEST,
  originGbps: ORIGIN_GBPS,
  caches: 0,
  p2p: false,
  delta: false,
};
const fromOrigin = distribution(fleet);
const fatOrigin = distribution({ ...fleet, originGbps: ORIGIN_GBPS * 10 });
const cached = distribution({ ...fleet, caches: REGIONS });
const swarm = distribution({ ...fleet, caches: REGIONS, p2p: true });
const delta = distribution({ ...fleet, caches: REGIONS, p2p: true, delta: true });
const fanOutMin = Math.round(fromOrigin.seconds / 60);
const perHostS = (ARTIFACT_MB * 8e6) / (DISTRIBUTION.hostDownGbps * 1e9);

const plan: RolloutSettings = {
  fleet: 2_000,
  canaryPct: 1,
  waves: 4,
  shape: 'equal',
  bakeMin: 30,
  maxUnavailablePct: 5,
  hostMin: 5,
  detectMin: 20,
};
const planned = rollout(plan);
const [canaryWave, firstWave] = planned.waves;
const bakes = planned.waves.length - 1;
const unbaked = rollout({ ...plan, bakeMin: 0 });
const inFlight = peakHour * (planned.totalMin / 60);
const serialYears = (deploys * planned.totalMin) / 60 / 24 / 365;
const noCanary = Math.ceil((plan.hostMin + plan.detectMin) / plan.hostMin) * planned.batch;

const polls = SERVERS / POLL_S;
const reports = SERVERS / REPORT_S;
const labRps = Math.round(polls + reports);
const labReadShare = Math.floor((polls / (polls + reports)) * 100);

export const CODE_DEPLOYMENT: CaseStudy = {
  id: 'code-deployment',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify the scope and what a deploy must never do',
      prompt: `An internal deployment platform for a large company, in the spirit of Google's and Facebook's in-house systems or the open-source Spinnaker and Argo Rollouts: it builds each service's code into an artifact and rolls it out safely to ${num(SERVERS)} servers in ${REGIONS} regions. The scope is build, deploy and rollout; running the test suites is the CI system's job, which decides what may be released and is not designed here.`,
      decision: {
        question: 'Thousands of deploys a day reach production. Which promise matters most?',
        options: [
          {
            label:
              'A bad release is caught while it runs on a small, known slice of the fleet and is rolled back automatically, and every server always runs a recorded release',
            best: true,
            why: "A deploy system's worst failure is breaking the whole fleet at once. Bounding the blast radius and knowing what runs where make every other failure recoverable.",
          },
          {
            label: 'Every commit reaches every server within minutes',
            why: 'Reaching every server at once is exactly how one bad commit takes down every server. Fast is right for the first few hosts, not for all of them together.',
          },
          {
            label: 'No deploy ever fails',
            why: 'Builds break, hosts die and bad code gets merged. The system must expect failure and contain it, not promise it away.',
          },
          {
            label: 'Every server runs the same release at every moment',
            why: 'A rollout runs two releases side by side for hours by design. What is required instead is that both work together, which is backward compatibility.',
          },
        ],
      },
      points: [
        'Functional: build a commit into an artifact; deploy a chosen artifact to an environment (staging, then the production regions) with a rollout plan; watch health and halt or roll back automatically; roll back on demand; show who deployed what, where and when.',
        'Safety: a bad release reaches a bounded slice, the canary, before the rest, and no rollout leaves the fleet partly broken: each one ends fully on the new release or fully back on the old, and one that cannot pages a person.',
        'Rollback in minutes: the previous release stays on every host, so going back is a restart, with no build and no download.',
        'Auditability: every deploy records who, what (the artifact digest and its commit), where, when, the approvals and the outcome, in a log nobody can edit.',
        'Many teams at once: one service never waits for another, and only one rollout per service and environment runs at a time.',
        `Scale (from the interviewer): ${num(SERVICES)} services on ${num(SERVERS)} servers in ${REGIONS} regions, each service deploying about ${DEPLOYS_A_DAY} times a day; artifacts of about ${num(ARTIFACT_MB)} MB; the largest service runs on ${num(LARGEST)} servers.`,
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the deploy rate',
      prompt: `${num(SERVICES)} services each deploy about ${DEPLOYS_A_DAY} times a day. Deploys bunch into working hours; assume the busiest hour runs at ${PEAK_HOUR}x the day's average hour. How many deploys start in the busiest hour?`,
      estimate: {
        question: 'Deploys started in the busiest hour',
        answer: peakHour,
        unit: 'deploys/hour',
        working: [
          `${num(SERVICES)} services × ${DEPLOYS_A_DAY} = ${num(deploys)} deploys a day.`,
          `${num(deploys)} / 24 h ≈ ${num(hourly)} an hour on average.`,
          `× ${PEAK_HOUR} in the busiest hour = ${num(peakHour)} an hour.`,
        ],
      },
      points: [
        `${num(peakHour)} an hour is ${Number((peakHour / 3_600).toFixed(2))} a second, one every ${Number((3_600 / peakHour).toFixed(1))} s: the control plane's request rate is small.`,
        `Host updates: a service runs on ${num(INSTANCES_A_SERVICE)} servers on average (services share servers: ${num(instances)} instances on ${num(SERVERS)} servers, ${num(instances / SERVERS)} each), so the busiest hour updates ${num(peakHour * INSTANCES_A_SERVICE)} instances, ${num((peakHour * INSTANCES_A_SERVICE) / 3_600)} a second.`,
        `Concurrency: a safe rollout takes hours (the rollout stage works one out at ${durationText(planned.totalMin)}), so if the busiest rate held that long, about ${num(inFlight)} rollouts would be in flight at once (Little's law: ${num(peakHour)} an hour × ${Number((planned.totalMin / 60).toFixed(2))} hours). Locks must be per service.`,
        'The hard numbers are not requests but bytes and time, next.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the artifact fan-out',
      prompt: `The largest service runs on ${num(LARGEST)} servers, and its artifact is ${num(ARTIFACT_MB)} MB. If every server downloads it from one artifact store with ${ORIGIN_GBPS} Gbit/s of egress, how long does a release take just to arrive?`,
      estimate: {
        question: 'Time for every server to download it from one origin',
        answer: fanOutMin,
        unit: 'minutes',
        working: [
          `${num(LARGEST)} × ${num(ARTIFACT_MB)} MB = ${storageText(fromOrigin.originBytes)}.`,
          `${storageText(fromOrigin.originBytes)} × 8 = ${num((fromOrigin.originBytes * 8) / 1e12)} Tbit; at ${ORIGIN_GBPS} Gbit/s that is ${num(fromOrigin.seconds)} s.`,
          `${num(fromOrigin.seconds)} s / 60 ≈ ${num(fanOutMin)} minutes, ${secondsSpan(fromOrigin.seconds)}.`,
        ],
      },
      points: [
        `Each server alone needs only ${num(perHostS)} s (${num(ARTIFACT_MB)} MB at the ${DISTRIBUTION.hostDownGbps} Gbit/s a deploy agent may use); the origin's one link is the bottleneck, and every other service's deploys, an urgent fix among them, queue behind this one.`,
        `Across the company: ${num(deploys)} deploys × ${num(INSTANCES_A_SERVICE)} servers × ${num(ARTIFACT_MB)} MB = ${storageText(dailyBytes)} a day, about ${num(averageGbps)} Gbit/s on average and ${num(averageGbps * PEAK_HOUR)} Gbit/s in the busiest hour, if every byte came from one place.`,
        "Pre-stage: download the artifact to every host the rollout will touch before the first wave, so a wave's time is restart time, and a rollback needs no download.",
        'The fixes, in the distribution stage: regional caches, hosts sharing pieces with each other, and deltas.',
      ],
    },
    {
      kind: 'api',
      title: 'Design the deploy API',
      prompt:
        'Teams deploy from a CI pipeline, a chat command or a web page, and automation retries when a call times out. Decide what a deploy request is.',
      decision: {
        question: 'What does the API take to deploy a service?',
        options: [
          {
            label:
              "A release: the service, the artifact's digest (not a tag or a branch), the environment and a rollout plan, with an idempotency key. The system records it as the service's desired state and answers 202 with a deployment id",
            best: true,
            why: 'A digest names exactly one set of bytes, so what was tested is what runs everywhere. Recording intent lets the control plane drive and resume the rollout, and the key turns a retried request into the same deployment, not a second one.',
          },
          {
            label: 'The commit, built again on each host',
            why: "Two builds of one commit can differ (a dependency or the compiler changed in between), and every host's binary becomes its own, untested artifact.",
          },
          {
            label: 'A tag such as latest or prod that hosts pull whenever they restart',
            why: 'A tag moves: hosts that restart at different times run different builds, nothing records which, and a rollback is a guess.',
          },
          {
            label: 'A script that connects to every host over SSH and runs the steps, answering when it finishes',
            why: 'Hours on one connection that can drop part way, no record of where it got to, and no way for anyone else to see or stop it.',
          },
        ],
      },
      points: [
        '`POST /v1/deployments` with the service, the artifact digest, the environment, a plan (or a named one) and a reason, plus an `Idempotency-Key` header; it answers 202 with the deployment id.',
        '`GET /v1/deployments/{id}` returns the state, the current wave and the hosts on each release; an event stream feeds the web page and chat.',
        'Actions on a deployment, each a `POST`: `:pause`, `:resume`, `:rollback` (to the previous release or a chosen digest) and `:promote` (end a bake early, with a reason).',
        'Who may deploy: each service names its owners; production needs a passing CI run of that exact digest and, for some services, a second person to approve. Every call is recorded with the caller.',
        'A rollback is a deploy of the previous digest with a faster plan: a release like any other, recorded and watched the same way.',
      ],
    },
    {
      kind: 'data',
      title: 'Model deployments and locks',
      prompt: `About ${num(inFlight)} rollouts can be in flight at once. Two engineers on one team, or an engineer and a pipeline, may start deploys of the same service within seconds of each other.`,
      decision: {
        question: 'What keeps two deploys of one service from fighting over its hosts?',
        options: [
          {
            label:
              "One active deployment per service and environment, claimed by a conditional write on the service's row (compare-and-set on its version). The second request queues behind it or is refused with the running deployment's id",
            best: true,
            why: 'The conditional write makes the check and the claim one atomic step, so exactly one wins however close together they arrive, and other services never wait.',
          },
          {
            label: 'A global lock: one deployment at a time across the company',
            why: `Each rollout runs for hours: a day's ${num(deploys)} deploys at ${durationText(planned.totalMin)} each would take over ${Math.floor(serialYears)} years in series.`,
          },
          {
            label: 'Read whether a deployment is running, and insert one if not',
            why: 'Two requests both read none and both insert: the check and the write are separate steps, so the race is still there.',
          },
          {
            label: 'Let both run, and the later one wins on each host',
            why: "Hosts flip between two builds, each rollout's analysis watches a mix of both, and neither can be rolled back cleanly.",
          },
        ],
      },
      points: [
        'Tables: services (owners, default plan, current release, the active deployment, a version), releases (digest, commit, provenance, who built it), deployments (service, environment, from and to release, plan, state, current wave, times), and an append-only audit log of every transition and who caused it.',
        'A deployment is a state machine: pending, rolling out (wave by wave), paused, completed, rolling back, rolled back, failed. Every transition is a conditional update from the expected state, so two workers can never both advance it.',
        'Per host: the release the control plane wants it to run and the release its agent reports, with the time of the last report. A rollout reads these to know which hosts are done.',
        'The worker driving a deployment holds it by a lease it renews; if the worker dies, the lease expires and another resumes from the recorded state, with a fencing token so a stale worker cannot write.',
        `The store is small (${num(SERVICES)} services, ${num(deploys)} deployments a day) and must be strongly consistent: a replicated SQL database, or a consensus store such as etcd.`,
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: 'Trace a release from a merged commit to the last server, and name each component.',
      lab: true,
      points: [
        'Build service: hermetic builds from a commit with a shared cache; the result is an artifact named by its digest, with signed provenance.',
        'Artifact store (the origin): content-addressed and replicated across regions; regional caches in front of it, and hosts that share pieces with each other.',
        'Control plane: the deploy API, the deploy store (services, releases, deployments, the audit log) and rollout workers that move each deployment through its waves.',
        'Health analysis: compares metrics of the canary with a baseline and tells the rollout workers to continue, pause or roll back.',
        'Host agents: one on every server; each reads its desired state, fetches and verifies the artifact, swaps it in, checks readiness and reports what it runs.',
        `Open the build in the Design Lab for the control plane: ${num(SERVERS)} agents poll their desired state every ${POLL_S} s, ${num(polls)} reads a second, mostly from a cache since it changes only when a deploy does, and report their state every ${REPORT_S} s, ${num(reports)} writes a second through a queue: about ${num(labRps)} requests a second, ${labReadShare}% reads. The object store stands for the artifact store, whose bytes reach hosts through caches and peers, not through the control plane.`,
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Build once, sign and keep',
      prompt: `A merged commit must become the artifact that runs on ${num(LARGEST)} servers, and the bytes in production must be the bytes that were tested.`,
      decision: {
        question: 'What exactly is promoted from staging to production?',
        options: [
          {
            label:
              'The artifact built once by a hermetic build, named by the SHA-256 digest of its contents, signed, with provenance naming the commit and build that made it; every environment and region gets those same bytes',
            best: true,
            why: 'One digest end to end means a test result, an approval and an audit entry all refer to exactly what runs.',
          },
          {
            label: 'A fresh build of the same commit for each environment',
            why: 'Unless the build is fully reproducible, two builds can differ (a dependency release or a timestamp in between), so production runs bytes that never went through staging.',
          },
          {
            label: 'The newest artifact in the store, found by its version label',
            why: 'Labels can be re-pointed or mistyped, and the newest may not be the one that passed; a digest cannot change.',
          },
          {
            label: 'The source tree, compiled on each host at start-up',
            why: 'Every host builds its own binary with whatever toolchain it has, start-up takes minutes, and none of those binaries was tested.',
          },
        ],
      },
      points: [
        "Hermetic: every input is declared and pinned (source, dependencies by digest, the toolchain itself), and build steps run sandboxed without the network, so the same inputs give the same output. Bazel, from Google's internal Blaze, works this way.",
        'Reproducible: stripping timestamps, file order and build paths from the outputs makes them bit-for-bit identical, so anyone can rebuild and compare digests (the Reproducible Builds project, `SOURCE_DATE_EPOCH`).',
        'Caching: each build step is keyed by a hash of its inputs and command; a key already in the shared cache reuses its output instead of rebuilding, so a one-line change rebuilds only what depends on it. Outputs are stored by the hash of their content.',
        'Artifact store: each artifact is kept by digest and never changed; a name such as a release number is only a pointer to a digest, and moving it is recorded. Keep recent releases so a rollback never needs a rebuild, and collect what no environment has used for months.',
        "Signing and provenance: the build platform signs a provenance statement (source commit, build steps, dependencies) for each artifact, for example as an in-toto attestation, and the artifact itself, for example with Sigstore's cosign. SLSA 1.0's build track has levels: L1, provenance exists; L2, it is produced and signed by a hosted build platform; L3, that platform is hardened so one build cannot influence another or reach the signing keys.",
        'Admission: hosts refuse an artifact whose signature or provenance does not verify, or that was not built from the release branch by the build platform.',
        'Secrets never go in the artifact, which is copied to every cache and host and kept for months. The service fetches them at start-up from a secrets manager under its own identity, so rotating a secret is a config change, not a rebuild.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Get the artifact to every server',
      prompt: `Every release of the largest service must reach ${num(LARGEST)} servers in ${REGIONS} regions, and from one origin that took ${secondsSpan(fromOrigin.seconds)}.`,
      decision: {
        question: 'How does the artifact reach the servers?',
        options: [
          {
            label:
              "A cache in each region fetches it from the origin once; hosts fetch pieces from their region's cache and from each other, peer to peer, checking every piece against the digest, before the rollout starts",
            best: true,
            why: 'The origin sends a few copies instead of thousands, and the load on a cache stops growing with the hosts because every downloading host also uploads; checking pieces makes untrusted peers harmless.',
          },
          {
            label: 'Every host downloads from the origin, which gets a 10 times bigger link',
            why: `${storageText(fromOrigin.originBytes)} a release still leaves one place: at ${ORIGIN_GBPS * 10} Gbit/s it is ${secondsSpan(fatOrigin.seconds)}, and every deploy in the company still waits on that one link.`,
          },
          {
            label: 'Hosts take turns: at most 100 download from the origin at once',
            why: `Throttling protects the origin but not the deadline: the same ${storageText(fromOrigin.originBytes)} still takes at least ${secondsSpan(fromOrigin.seconds)}.`,
          },
          {
            label: 'The build server copies the artifact to each host over SSH',
            why: `One machine's link carries all ${storageText(fromOrigin.originBytes)}, and a copy that fails part way leaves a host with a partial file and no record of it.`,
          },
        ],
      },
      widget: 'artifact-distribution',
      points: [
        `Regional caches: the origin is the artifact store, replicated for durability. A cache in each region (or zone) fetches an artifact once and serves it inside the region. With ${REGIONS} caches the origin sends ${REGIONS} × ${num(ARTIFACT_MB)} MB = ${storageText(cached.originBytes)}, in ${secondsSpan(cached.tierSeconds.origin!)}; but each cache now sends ${num(LARGEST / REGIONS)} × ${num(ARTIFACT_MB)} MB over its ${DISTRIBUTION.cacheGbps} Gbit/s: ${secondsSpan(cached.seconds)}.`,
        `Peer to peer: the artifact is split into pieces of a few MB; each host downloads pieces from the cache and from other hosts while uploading what it has, as in BitTorrent. Upload capacity grows with the number of hosts, so in the fluid model the time stops growing with the fleet: ${secondsSpan(swarm.seconds)} here, one host's own ${DISTRIBUTION.hostDownGbps} Gbit/s.`,
        "Who does this: Twitter deployed with BitTorrent (its open-source tool was called Murder), Facebook has described distributing its large web binary to its servers with BitTorrent, and Uber's Kraken and the CNCF project Dragonfly share container images peer to peer.",
        'Every piece is checked against a hash listed in the signed release, so a corrupt or malicious peer can waste a download but never plant bytes.',
        `Deltas: hosts already hold the previous release, so send only what changed. Container images do this by layers (a host pulls only the layers it lacks); content-defined chunking finds unchanged chunks inside large files; binary diffs, like Chrome's Courgette for updates, go further at the cost of CPU to build and apply them. With ${DISTRIBUTION.deltaShare * 100}% changed, every term shrinks tenfold: ${secondsSpan(delta.seconds)}.`,
        'The model is a lower bound: real swarms add the hops a piece takes, verification, slow disks and stragglers, so expect minutes rather than seconds. What it shows is which tier grows with the fleet.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Roll out in waves',
      prompt: `A change to a service on ${num(plan.fleet)} servers. The plan: a ${plan.canaryPct}% canary (${num(planned.canary)} hosts), then ${plan.waves} equal waves, each wave but the last baking ${durationText(plan.bakeMin)} before the next; at most ${plan.maxUnavailablePct}% of hosts (${num(planned.batch)}) out at once, and a batch takes ${durationText(plan.hostMin)} to drain, restart and pass readiness.`,
      decision: {
        question: 'Why roll out this way rather than faster?',
        options: [
          {
            label:
              'The canary is compared automatically with a baseline, each wave bakes before the next, and waves follow zones and regions, while the cap on hosts out keeps capacity for traffic',
            best: true,
            why: `A bad build is caught on ${num(planned.canary)} hosts instead of ${num(plan.fleet)}, the bake gives slow failures time to show, and the cap keeps ${100 - plan.maxUnavailablePct}% of capacity serving.`,
          },
          {
            label: 'Faster is better: update all hosts at once',
            why: 'A bad build takes down every host together: the blast radius is the whole fleet, and nothing healthy is left to serve while you roll back.',
          },
          {
            label: 'A rolling update of 5% at a time, with no canary and no bake, is just as safe',
            why: `Each batch follows the last in ${durationText(plan.hostMin)}, so a failure that takes ${durationText(plan.detectMin)} to show has reached ${num(noCanary)} hosts, ${Math.round((noCanary / plan.fleet) * 100)}% of the fleet, before anyone sees it.`,
          },
          {
            label: `Blue-green is safer: bring up ${num(plan.fleet)} new hosts, then switch all traffic to them at once`,
            why: 'Rollback is instant, but it needs twice the capacity during the switch, and the switch sends every user to the new build at once, so a bad build reaches everyone before it is caught.',
          },
        ],
      },
      estimate: {
        question: 'Total rollout time, if nothing goes wrong',
        answer: planned.totalMin,
        unit: 'minutes',
        working: [
          `The canary: ${num(canaryWave.hosts)} hosts in 1 batch, ${durationText(canaryWave.endMin - canaryWave.startMin)}.`,
          `Each wave: ${num(plan.fleet - planned.canary)} / ${plan.waves} = ${num(firstWave.hosts)} hosts in ${Math.ceil(firstWave.hosts / planned.batch)} batches of ${num(planned.batch)}, ${durationText(firstWave.endMin - firstWave.startMin)}; ${plan.waves} waves, ${num(plan.waves * (firstWave.endMin - firstWave.startMin))} min.`,
          `${bakes} bakes of ${durationText(plan.bakeMin)} (after the canary and the first ${plan.waves - 1} waves): ${num(bakes * plan.bakeMin)} min.`,
          `${num(canaryWave.endMin)} + ${num(plan.waves * (firstWave.endMin - firstWave.startMin))} + ${num(bakes * plan.bakeMin)} = ${num(planned.totalMin)} minutes, ${durationText(planned.totalMin)}.`,
        ],
      },
      widget: 'rollout-plan',
      points: [
        'Rolling update: replace hosts in batches while the rest serve. Kubernetes Deployments default to maxUnavailable 25% and maxSurge 25%; those are defaults, not rules, and a large service usually takes far smaller steps. Surge starts new hosts before stopping old ones, so capacity never drops, at the cost of spare machines.',
        'Blue-green: two full environments, and traffic switches from one to the other; rolling back is switching back. It suits small services and cut-overs, costs double capacity during the switch, and on its own exposes everyone at once, so pair it with a gradual traffic shift, which is a canary.',
        'Canary: a small slice runs the new build on real traffic beside a baseline; only a passing canary continues. Spinnaker (with Kayenta for the analysis) and Argo Rollouts automate this.',
        'Waves follow failure domains: a canary in one zone, then the rest of that zone, then one region, then the rest, so a bad build is contained by the same boundaries that contain hardware failures and never reaches every region at once.',
        `Bake time waits after each wave for failures that take time: a memory leak, a job that runs hourly, a cache entry that expires. In the model, analysis flags a bad build ${durationText(plan.detectMin)} after the canary serves it: a ${durationText(plan.bakeMin)} bake keeps it on the ${num(planned.exposed)} canary hosts, while with no bake it reaches ${num(unbaked.exposed)}.`,
        `The price: of the ${durationText(planned.totalMin)}, ${durationText(bakes * plan.bakeMin)} is baking. That suits ${DEPLOYS_A_DAY} deploys a day; an urgent fix takes a faster, approved plan, never a skipped canary.`,
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Judge health and roll back automatically',
      prompt: `The canary runs the new build on ${num(planned.canary)} hosts. The system, not a person watching dashboards, must decide whether the rollout continues.`,
      decision: {
        question: 'How does the system judge the canary?',
        options: [
          {
            label:
              'Compare its metrics (errors, latency, crashes, saturation) with a baseline group of the same size on the old build, started at the same time with the same share of traffic, by a statistical test over a minimum number of requests',
            best: true,
            why: 'Same size, same age and same traffic leave the build as the only difference, so a real regression stands out, and the minimum sample keeps the noise of a few hosts from deciding either way.',
          },
          {
            label: 'Compare the canary with the rest of the production fleet',
            why: 'The fleet has run for days with warm caches while the canary just restarted, which alone looks like a regression; and thousands of hosts against a few dozen make an uneven comparison.',
          },
          {
            label: "Compare the canary's error rate with last week's at the same hour",
            why: "Traffic, dependencies and other teams' releases change from week to week, so the difference measures the week, not the build.",
          },
          {
            label: 'Pass it once every canary host passes its health check',
            why: 'A health check says the process is up and can serve, not that its answers are right or fast; most bad builds pass it.',
          },
        ],
      },
      points: [
        'Health checks: liveness (restart a stuck process) and readiness (take traffic only once warmed up). A host joins the load balancer only when ready, and a batch is done only when its hosts are ready and serving.',
        'Canary analysis: Kayenta, built by Netflix and Google for Spinnaker, compares each metric of canary and baseline with a nonparametric test (Mann-Whitney U) and combines the results into a score with a pass mark. Caveats: few hosts and requests give a test little power, so rare errors need a longer canary or more traffic; with many metrics some differ by chance, so weight a few critical ones; and slow failures do not show in minutes, which is what bake time is for.',
        'Automatic rollback triggers: a failing canary score, errors or latency past a threshold relative to the baseline, crash loops, or hosts failing readiness after the swap. Any of them halts the rollout and returns the changed hosts to the previous release, already on disk.',
        `Capacity: the cap on hosts out at once (here ${plan.maxUnavailablePct}%, ${num(planned.peakDown)} hosts) is the capacity lost at the worst moment; surge adds hosts first instead. Size the cap from the headroom the service has at its busiest hour, or deploy off-peak.`,
        "Error budgets: with a 99.9% availability target, 0.1% of requests in the window may fail. When a service has spent its budget, releases other than fixes stop until it recovers, as Google's SRE practice describes.",
        'Deploy freezes: holidays, big launches or an incident in progress close the gates; the system enforces them, with an audited override for fixes.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Drive hosts by desired state',
      prompt:
        'Rollout workers drive thousands of deployments for hours while hosts reboot, die and come back. Halfway through a rollout, the control plane goes down for 20 minutes.',
      decision: {
        question: 'What do the hosts do while the control plane is down?',
        options: [
          {
            label:
              'Keep running whatever release each has and change nothing; agents keep retrying, and when the control plane is back it resumes the rollout from its recorded state, with analysis gating the next wave',
            best: true,
            why: 'The outage says nothing about the build, so the safe move is no move: both releases keep serving, as they were built to, and no wave goes ahead without analysis watching it.',
          },
          {
            label: 'Roll every updated host back to the previous release',
            why: 'Restarting hosts with no evidence against the build costs capacity for nothing, and agents acting on their own without the control plane is how fleets thrash.',
          },
          {
            label: 'Carry on with the remaining waves from the plan each host cached',
            why: 'Nothing checks health between waves any more, so a bad build would go everywhere unwatched.',
          },
          {
            label: 'Stop serving until the control plane is back, to avoid a mixed fleet',
            why: "The deploy tool's outage becomes an outage of every service, while a mixed fleet is normal during any rollout.",
          },
        ],
      },
      points: [
        'Desired state, not scripts: the control plane records what each host should run; an agent on each host compares that with what it runs and acts until they match, as Kubernetes controllers do. A crash anywhere means the loop runs again later; no half-finished script loses its place.',
        "Idempotent agents: 'run release X' fetches and verifies X if missing, swaps it in only if it is not already running, and reports either way. Repeating it changes nothing, so retries and duplicates are safe.",
        `Pull, not push: agents poll their desired state (every ${POLL_S} s in the Lab) or hold a watch, so the control plane needs no connection into ${num(SERVERS)} hosts, and a host that was down catches up when it returns.`,
        'Stragglers and dead hosts: a wave is done when, say, 99% of its hosts report the new release and pass readiness; hosts that time out are retried, then drained and sent to repair, and the wave moves on. A host that returns later converges to the current desired state, not the one it missed.',
        'Stuck rollouts: every state has a deadline. A deployment that sits in one wave past it (a host that never becomes ready, analysis that cannot get metrics) pages its owner and shows which hosts and which check hold it, rather than waiting forever or pushing on.',
        'Deploy the control plane and the agents through a separate, simpler path, so a bad release of the deploy system cannot take away the way to roll it back.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Change the schema separately',
      prompt:
        'A service renames a column, `email` to `contact_email`, in a table every request reads. During a rollout old and new code run side by side for hours, and either may be rolled back.',
      decision: {
        question: 'How do you ship the rename?',
        options: [
          {
            label:
              'Expand and contract: add the new column; deploy code that writes both and reads the new one, falling back to the old; backfill; once no old code remains and rollback past it is no longer needed, stop using the old column; finally drop it',
            best: true,
            why: 'Every step works with the code before and after it, so the rollout and a rollback are both safe at every point.',
          },
          {
            label: 'Rename the column and deploy the new code in the same release',
            why: 'Hosts still on the old build query a column that no longer exists and fail, and rolling the code back does not bring the column back.',
          },
          {
            label: 'Stop all servers, migrate, then start the new build',
            why: 'Planned downtime for every rename, and if the new build is bad you must reverse a migration under pressure.',
          },
          {
            label: 'Deploy the new code first, then rename the column',
            why: 'The new code fails until the rename runs and the old code fails after it, so some hosts are broken at every moment in between.',
          },
        ],
      },
      points: [
        'Why separately: two releases run at once during every rollout, and a rollback means the old code meets the new schema. So schema changes ship on their own, each backward compatible with the code on both sides of it.',
        'Rolling back a data migration: data moves forward. A backfill is written to be rerunnable, and the way back is keeping the old column, and the code that reads it, until the new data has proven itself. Destructive steps (dropping a column, narrowing a type) come last, in their own release, after the rollback window.',
        'Large tables: online schema change tools such as gh-ost and pt-online-schema-change copy into a shadow table and swap, so an ALTER does not lock a busy table; backfills run in small, throttled batches.',
        'The same rule holds for APIs and messages: add fields, tolerate unknown ones, and remove one only after every reader has stopped using it (protobuf field numbers are never reused).',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Separate config, flags and code',
      prompt:
        "A new ranking feature shipped dark in Monday's release, behind a flag. On Thursday the flag is turned on for 50% of users, and errors climb.",
      decision: {
        question: 'What is the fastest safe fix?',
        options: [
          {
            label:
              "Turn the flag off: it takes effect in seconds through the flag service, without a restart, and leaves the rest of Monday's release in place",
            best: true,
            why: 'The change that caused it was the flip, so undoing exactly that is the smallest and fastest step.',
          },
          {
            label: "Roll the service back to the release before Monday's",
            why: "It would work, but it takes as long as a rollout and removes every other change shipped since Monday, while the cause was Thursday's flip.",
          },
          {
            label: 'Write a fix and send it to every host at once, skipping the canary',
            why: 'A rushed change that skips the safety checks is how one incident becomes two.',
          },
          {
            label: 'Edit the configuration file on the servers by hand',
            why: 'Unrecorded, unreviewed and different on each host, and the next deploy silently reverts it.',
          },
        ],
      },
      points: [
        'A code deploy changes the binary; a config deploy changes values a running binary reads (timeouts, limits, routing). Config changes cause many outages, so they get the same discipline: versioned, reviewed, validated against a schema, rolled out in stages with health checks, and rolled back by version.',
        'Feature flags separate deploying code from releasing a feature: code ships dark, and the feature is turned on for a share of users in steps. The Feature Flag Service case covers how flags are evaluated, bucketed and propagated.',
        'Which lever: a binary rollback for a bad build, a flag off for a bad feature, a config rollback for a bad value. Each is a recorded change with an owner.',
        'Clean up: a flag whose rollout has finished is removed from the code in a later release, or flags pile up into combinations nobody has tested.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Plan for failure',
      prompt:
        "A regional cache's disk corrupts an artifact, or an intruder in the cache replaces it with one of their own. Thousands of hosts are about to fetch it.",
      decision: {
        question: 'How do hosts stay safe from a poisoned cache?',
        options: [
          {
            label:
              'Agents check every artifact, and every piece, against the digest named in the signed release before running it; a mismatch is refused, reported and fetched from another source, and the bad entry is evicted',
            best: true,
            why: 'The digest comes from the signed release, not from the cache, so whatever a cache or a peer serves either matches exactly or is rejected.',
          },
          {
            label: 'Trust the cache: it is inside our network',
            why: 'Disks corrupt, and intruders tamper; a trusted cache is one more place from which an attacker can plant code on every server.',
          },
          {
            label: 'Have the cache compute a checksum and send it with the file',
            why: 'A checksum from the same place as the file proves nothing: a corrupted or malicious cache sends one that matches.',
          },
          {
            label: 'Expire cached artifacts after an hour so bad copies age out',
            why: 'Every host fetches the bad copy for that hour and nothing ever notices; content named by its digest never needs to expire.',
          },
        ],
      },
      points: [
        'A bad deploy that passed its canary: the triggers halt it and roll back the waves it reached, the release is marked bad so no pipeline promotes it again, and the postmortem asks why the canary missed it (too little traffic, a missing metric, too short a bake).',
        'Rollback is fast because it is routine: the previous release is on every host, so it is a restart, and rollback paths are exercised regularly rather than first used on the worst day.',
        'The control plane down mid-rollout: hosts keep their current release and the deployment resumes from its recorded state, as in the desired-state stage.',
        'A bad agent release can break deploys everywhere, so the agent goes out through the same canary and waves, and the previous agent can always roll it back.',
        "A leaked signing key: revoke it, rebuild and re-sign from source, and refuse artifacts signed only with the old key. Short-lived signing certificates, as in Sigstore's keyless signing, shrink the window.",
        'The audit log answers the first question of every incident, what changed, in seconds.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Operate it',
      prompt: 'You have five minutes left. What do you watch, and what would page you?',
      points: [
        'Deploys: deploys a day, success and rollback rates, time from merge to production, and rollouts stuck past their deadline (these page the owner).',
        'Fleet: hosts on each release per service, hosts not matching their desired state, and agents that stopped reporting.',
        'Distribution: origin egress, cache hit rate, the share of bytes from peers, time to pre-stage an artifact, and digest mismatches (each one investigated).',
        "Safety: canary verdicts and how often a failed canary was a real problem, releases that broke an SLO despite passing, and each service's remaining error budget.",
        'Supply chain: artifacts admitted without valid provenance (should be zero), signing key use, and overrides of freezes and approvals.',
      ],
    },
  ],
  pitfalls: [
    'Deploying a tag or a branch instead of an immutable digest.',
    'One origin serving every host, so every deploy queues behind the biggest.',
    'Judging a canary against the warmed-up fleet or last week instead of a baseline of the same age.',
    'No bake time, so a slow failure reaches much of the fleet before anyone sees it.',
    'Renaming a column in the same release as the code that needs it.',
    'Imperative scripts that cannot resume after a crash, instead of desired state and idempotent agents.',
    'Secrets baked into the artifact.',
  ],
  followUps: [
    {
      question: 'How do you deploy a stateful service such as a replicated database?',
      answer:
        'One replica at a time, followers first, then a planned failover of the leader, with replication health gating each step, and never more than one replica of a shard out at once so its quorum holds.',
    },
    {
      question: 'How do you roll back a release that included a data migration?',
      answer:
        'Roll back the code, not the data: the migration only expanded the schema and is rerunnable, so the old code still works on it, and the new code kept writing the old form too until the contract step, which comes only after the rollback window.',
    },
    {
      question: 'How do you let a team ship a hotfix in 15 minutes?',
      answer:
        'A pre-approved fast plan: the same digest, signing and audit, a canary with a short bake on a small slice, then large waves. It shortens the waits; it never skips the canary or the checks.',
    },
  ],
};
