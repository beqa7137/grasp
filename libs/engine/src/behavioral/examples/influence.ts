import type { CompetencyExamples } from '../types.js';

export const INFLUENCE: CompetencyExamples = {
  competencyId: 'influence',
  strong: [
    {
      level: 'early',
      questionId: 'influence-4',
      situation:
        'A year into my first job, on the Android team of a ride-hailing app, I noticed our cold start on low-end phones took 3.8 seconds, largely because six third-party SDKs initialized on the main thread at launch.',
      task: 'I wanted to defer most of them, but our principal engineer was openly skeptical: a lazy-init change two years earlier had broken marketing attribution and cost a quarter of campaign data.',
      action:
        'Before pitching anything, I read the postmortem of that earlier attempt so I could speak to his real worry rather than my idea. It showed the attribution SDK had to see the launch intent before anything else ran. So I changed my proposal: keep attribution and crash reporting eager, and defer only the four SDKs that nothing needed in the first screen. I measured cold start with Macrobenchmark on three low-end devices, 20 runs each, and recorded a trace showing exactly where the time went. I booked 20 minutes with him, opened with the old postmortem and how my plan avoided that failure, and only then showed the numbers. He asked what would happen if a deferred SDK was needed early, so I added a guard that initializes it on first use, and I offered to ship it behind a feature flag to 5 percent of users with an attribution comparison dashboard I built.',
      result:
        'Median cold start on low-end devices fell from 3.8 to 2.6 seconds, attribution events stayed within 1 percent of the control group, and the flag went to 100 percent after two weeks. He later asked me to present the approach at the Android guild.',
      reflection:
        "I learned that a senior person's skepticism often encodes a past failure, so I now find out what went wrong last time before I pitch the fix.",
      notes: {
        situation: 'A junior-sized scope with a concrete, measured symptom: one app, one launch path, 3.8 seconds.',
        task: 'Makes the skeptic reasonable by naming the failure behind his doubt, so the pitch has something real to overcome.',
        action:
          'Prepares for the audience, not the idea: reads the old postmortem, reshapes the proposal around it, and leads with his concern before the data. The guard and the 5 percent flag answer his objection instead of arguing with it.',
        result: 'Proves the gain and the absence of the feared harm with numbers, and the guild invitation shows he was won over.',
        reflection: 'Turns the story into a habit that works at any level: learn why the last attempt failed before pitching the next one.',
      },
    },
    {
      level: 'mid',
      questionId: 'influence-5',
      situation:
        'Our web storefront still ran on a hand-rolled state management layer from 2017, and new checkout features took about twice as long as estimated because changes rippled unpredictably across 40 components.',
      task: 'I wanted two engineers for six weeks to move checkout to a standard state library, but the product and engineering managers had a roadmap full of features and no appetite for work without a visible payoff.',
      action:
        'I knew arguing that the code was ugly would not work, so I built the case in their terms. I went through the last 12 checkout tickets and compared estimate with actual: the median overrun was 90 percent, and eight of the tickets had caused a regression in another component. I turned that into a cost of roughly three engineer weeks a quarter lost to overruns and bug fixes. Then I shrank the ask. Instead of a big migration, I proposed moving only the payment step first, which the roadmap already touched for a new wallet feature, so the migration would ride along with work the product manager wanted anyway. I also offered a checkpoint: if the payment step did not beat our historical overrun, I would stop and keep the old layer. I deliberately did not ask for a feature freeze, because I judged that would lose the room; a freeze, it turned out, was their biggest worry. I paired with a teammate on the first step and wrote a short migration guide so the rest of the team could move other steps as they touched them.',
      result:
        'The wallet feature landed within 10 percent of its estimate, the first checkout ticket in a year to do so. That convinced the managers to fund the remaining steps, and over the next two quarters checkout regressions fell from about three a month to fewer than one.',
      reflection:
        'I learned that tech debt gets funded when it is priced in a currency the listener already cares about, and when the first step is small enough to be safe to approve.',
      notes: {
        situation: 'Gives the debt a concrete symptom (features take twice as long) instead of calling the code bad.',
        task: 'Makes the resistance explicit and reasonable, so the persuasion in the Action has something real to overcome.',
        action:
          'Shows the persuasion technique step by step: evidence from tickets, a cost in engineer weeks, a smaller ask tied to planned work, and an exit if it failed. The feature freeze it chose not to ask for is the trade-off.',
        result: 'The first milestone proves the argument with a number, then the lasting effect shows the payoff.',
        reflection:
          "States the persuasion principle, pricing debt in the listener's currency and keeping the first step small, in terms of this story.",
      },
    },
    {
      level: 'senior',
      questionId: 'influence-7',
      situation:
        'As a staff engineer in a logistics company with 14 backend teams, I traced 23 incidents in one year to the same bug class: services wrote to their database and then published an event, and when the publish failed, other services never heard about the change.',
      task: 'I had no authority over the other teams, but I wanted every service that publishes events to adopt the transactional outbox pattern with idempotent consumers.',
      action:
        'I started with evidence, not a mandate. I wrote an RFC that listed all 23 incidents with their customer impact, including 1,800 shipments that showed the wrong status for hours, and priced the on-call time at about 400 engineer hours a year. Rather than ask teams to build the pattern themselves, I built a small reference library in Go and Java so adopting it took days, not weeks. I went first to the leads of the two teams with the most incidents, because their adoption would be the proof the others listened to, and I paired with each of them on their first migration. The data platform team pushed back hard: a polling outbox would add load to databases they were already struggling to scale. They were right, so I changed the design to relay the outbox through change data capture, which they already ran, and credited them in the revised RFC. I deliberately did not ask our VP to require it, because a mandate would have made it a compliance chore; instead I proposed that the architecture review add the outbox to its checklist for new services, and the review board agreed.',
      result:
        'Within 18 months, 11 of the 14 teams had migrated, dual-write incidents fell from 23 a year to 3, and every new service since has launched with the outbox from day one.',
      reflection:
        'I learned that at org scope the cheapest path wins, so I now ship the library and the first migration with the proposal, and I treat the loudest objection as a design review.',
      notes: {
        situation: 'Frames an org-wide problem with data across 14 teams, the scope a senior answer needs.',
        task: 'States the lack of authority up front, which is what makes this influence rather than direction.',
        action:
          'Uses several influence tools in order: incident evidence priced in hours, a library that makes yes cheap, early adopters as proof, and a design change credited to the objectors. Declining to escalate to the VP is the trade-off.',
        result: 'Counts adoption and the drop in incidents, and the review checklist shows the change outlived the push.',
        reflection: 'Names two habits a staff engineer can reuse: lower the cost of adoption, and treat objections as input.',
      },
    },
  ],
  weak: [
    {
      questionId: 'influence-2',
      situation: 'Our engineering org had no consistent way of doing code reviews, and quality varied a lot between teams.',
      task: 'We wanted to get everyone using a shared set of review standards and better tooling.',
      action:
        'We put together a working group and came up with a set of best practices for reviews. We rolled them out gradually, talked to a lot of teams, and got feedback along the way. We also set up some automation to handle the easy stuff so reviewers could focus on what mattered. There was some resistance at first, but we worked through it and eventually most teams came around.',
      result: 'Within about 6 months, 9 of our 12 teams had adopted the standards, and median review turnaround fell from two days to one.',
      reflection: 'I learned that adoption takes time and you have to bring people along with you.',
      flaws: ['we-not-i', 'vague'],
      why: {
        'we-not-i': 'The Action never says "I", so it is unclear whether the candidate led the working group or sat in on it.',
        vague:
          '"Best practices", "some automation" and "worked through" the resistance never name a practice, a tool or an objection, so the story could describe any rollout.',
      },
      fix: 'The Action would say what the candidate did personally: "I drafted the five review rules, I added a bot that labels pull requests over 400 lines, and I met the two most skeptical team leads to hear their objection, which was slower merges." It would then show how that objection shaped the rollout.',
    },
    {
      questionId: 'influence-1',
      situation:
        'I was on the search team of an online marketplace, and we needed the catalog team to add structured size and color fields to their product API so we could build filters.',
      task: 'My job was to get the catalog team to put the new fields on their roadmap for the quarter instead of their own planned work.',
      action:
        'I wrote up the request and sent it to their tech lead, but he kept saying they had no capacity, which honestly was an excuse, because they always said that about anything that was not their idea. Their product manager was not much better and did not seem to understand how search worked. I explained the value several times in meetings and kept pushing, and when that went nowhere I raised it with my director so the decision would get made above their heads. After that the catalog team finally agreed to do it, though they dragged their feet on the details and I had to keep chasing them for updates.',
      result: 'Eventually the fields shipped and we launched the filters, and the feedback from users was really positive overall.',
      reflection:
        'I learned that some teams will only move when leadership gets involved, so it is worth escalating earlier rather than wasting time trying to convince them.',
      flaws: ['blame', 'no-result'],
      why: {
        blame:
          'The catalog lead\'s capacity concern is dismissed as "an excuse" and the product manager "did not understand", so the resistance is treated as the other side being wrong rather than having different goals; the lesson even concludes that escalating beats persuading.',
        'no-result':
          '"Eventually" and "really positive" give no date, no adoption and no change in search behavior, so there is no way to tell whether the filters mattered.',
      },
      fix: 'The Action would ask what the catalog team needed, for example that structured fields would also cut their own data-quality tickets, and offer something in return, such as the search team writing the migration. The Result would name what changed: the fields shipped in six weeks and filter users converted 12 percent better.',
    },
  ],
};
