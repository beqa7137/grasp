import type { CompetencyExamples } from '../types.js';

export const LEADERSHIP: CompetencyExamples = {
  competencyId: 'leadership',
  strong: [
    {
      level: 'early',
      questionId: 'leadership-6',
      situation:
        'When I had been a frontend engineer for about a year, on a four-person team building a shipment tracking app for a freight broker, a new engineer joined from a backend background. Our last two hires had each taken about six weeks to merge their first real feature.',
      task: 'My lead asked me to be his onboarding buddy, and I set the goal of having him ship a feature customers would see within his first three weeks.',
      action:
        'On his first day I asked what he already knew, and found he was fluent in TypeScript but had never used our state management library, so I skipped the language basics and focused there. I noticed our setup doc was eight months old, so instead of fixing it myself I asked him to follow it and write down every step that failed, and I paired with him on each one. He found eleven broken steps in two days, and I had him open the pull request fixing the doc so his first merged change was his own. For his first feature, I picked a real ticket from our backlog, adding a filter to the shipments table, because it touched the API, the store and the UI in one small change. I sketched the data flow with him on a whiteboard, then let him write it while I reviewed his pull request the same day he opened it, because a review that waits two days stalls a new person more than anyone. I also held a fifteen minute check-in every afternoon the first week, and dropped it to twice a week once he stopped bringing questions.',
      result:
        "He shipped the filter to customers on day 13, less than half the six weeks our last hires took. The fixed setup doc cut the next hire's setup from three days to one afternoon, and my lead made the buddy checklist I wrote part of our onboarding.",
      reflection:
        "I learned that a new person's confusion is a map of what is broken in our docs, so I now ask every new hire to keep a list of what surprised them in their first week.",
      notes: {
        situation: 'Gives a baseline, six weeks to a first feature, so the improvement means something.',
        task: 'A goal sized for a junior engineer, one new teammate, with a checkable deadline.',
        action:
          'Every step adapts to the person, skipping what he knew, and gives him ownership early, fixing the doc himself, while the candidate removes the waiting that slows new people down.',
        result: 'Measures his ramp-up against the baseline and shows the practice spreading to the next hire.',
        reflection: 'Turns the story into a habit the candidate kept, which makes the lesson believable.',
      },
    },
    {
      level: 'mid',
      questionId: 'leadership-1',
      situation:
        'A new graduate who was strong at modeling but had never run a production service joined our machine learning platform team. Within her first month, two of her deploys had paged the on-call engineer.',
      task: 'My manager asked me to mentor her, and the goal we agreed on was that she could take the primary on-call rotation for the feature store serving path by the end of the quarter.',
      action:
        'I started by asking what she found hard rather than assuming, and she said she did not know what to check before a deploy. So instead of handing her a checklist, I had her write one from her two incidents, and I reviewed it with her. I paired with her on her next three deploys and deliberately let her drive while I only asked questions, like which dashboard would show a problem first. I resisted the urge to fix her pull requests myself, which would have been faster for me but would have taught her nothing. Every week I gave her one piece of written feedback, always tied to a specific change, so it was concrete and she could look back on it. Halfway through the quarter I was her secondary for her first on-call week and stepped in only once, when she asked. When a latency regression came up, I suggested she lead the investigation and present it at the team review, since explaining it to others was the fastest way to make the knowledge hers.',
      result:
        "By the end of the quarter she was on the primary rotation, and she had zero deploy-related pages in her next six months. Her pre-deploy checklist became the team's standard, and deploy-related pages across the team fell by about 40 percent.",
      reflection:
        'I learned that the most useful thing a mentor can do is ask the question at the right moment and then stay quiet long enough for the answer to be theirs.',
      notes: {
        situation: 'Describes the mentee by a specific gap and its cost, not by a vague "needed help".',
        task: 'Sets a concrete, checkable goal with a deadline, so growth can be measured.',
        action:
          'Every step shows a teaching choice and why it was made, including the faster option it gave up (fixing her code), which proves this was mentoring and not rescuing.',
        result: 'Shows her growth and the wider effect on the team, both with numbers.',
        reflection:
          'Names the mentoring technique, asking the question at the right moment and then staying quiet, specific enough to be believed.',
      },
    },
    {
      level: 'senior',
      questionId: 'leadership-4',
      situation:
        'I was a staff engineer on the infrastructure team of a payments company with about 120 engineers in 14 teams. Each team ran its own services and its own incident process, and in one year we had 31 customer-facing incidents, 9 of them repeats of an earlier one.',
      task: 'The bar I wanted to raise was learning from incidents across the org: my goal was to cut repeat incidents in half within a year, with no authority over any of the teams.',
      action:
        "I first read every postmortem from that year and found the pattern: most listed follow-up actions, but 60 percent of those actions were never done, because they went into each team's backlog and lost to feature work. So I did not start with a new template, which would have been the easy win. I proposed three changes: every customer-facing incident gets a blameless review within five working days, follow-up actions get an owner and a due date in one shared tracker, and a monthly review where team leads walk through open actions together. I piloted it with two teams whose leads volunteered after I showed them their own numbers, one of them the worst repeat offender, and I ran their first reviews myself to show what blameless looked like, stopping anyone who asked who pushed the change. When the pilot teams closed 85 percent of their actions, I presented their numbers at the engineering all-hands instead of asking for a mandate, and I asked the two pilot leads to present with me. Then I trained eight engineers from other teams to facilitate reviews, so the practice would not depend on me.",
      result:
        'Within a year, 12 of the 14 teams had adopted the process, the share of follow-up actions completed rose from 40 percent to 88 percent, and repeat incidents fell from 9 to 2. Two years later it is still running, and the facilitators now train new ones without me.',
      reflection:
        'I learned that a standard spreads when the people it helps are the ones presenting it, so I now look for a willing team to prove a practice before I ask the org to adopt it.',
      notes: {
        situation: 'Sets org-level scope with numbers, and names the real cost: repeat incidents.',
        task: 'States the bar to be raised, a measurable goal, and the constraint of no authority.',
        action:
          'Starts from evidence, fixes the root cause rather than the easy symptom, and spreads the practice through a pilot and peers rather than a mandate, then makes it outlast the candidate.',
        result: 'Shows the standard spreading and holding, with numbers two years out.',
        reflection: 'A lesson about how change spreads in an organization, the altitude expected of a staff engineer.',
      },
    },
  ],
  weak: [
    {
      questionId: 'leadership-3',
      situation:
        'Our company had three different teams each running their own feature flag system, which had grown up over the years for historical reasons. One was homegrown, one used an open source library, and the third was a spreadsheet that people updated by hand before deploys. Leadership had been talking about consolidating for a long time, and there had been a couple of incidents where a flag was flipped in the wrong system. There was also a lot of politics, since each team liked its own tool and nobody wanted to be first to migrate.',
      task: 'I was asked to lead the consolidation even though I was not a manager, which meant coordinating engineers across all three teams with no direct authority over any of them.',
      action:
        'We started with a kickoff to agree on requirements, then we compared three options on audit logging and SDK support and picked the open source library. We migrated the teams one at a time, starting with the smallest, and I set up weekly syncs so we could track progress.',
      result: 'All three teams were on the shared system within 4 months, and there were no more flag incidents after the migration.',
      reflection: 'I learned that leading without authority is mostly about getting people aligned early and keeping communication open.',
      flaws: ['long-setup', 'we-not-i'],
      why: {
        'long-setup':
          'The history of the three flag systems and the politics take almost twice as many words as the Action, which is the part that shows leadership.',
        'we-not-i':
          'Apart from scheduling the syncs, every decision is "we", so the interviewer cannot tell who chose the library or who persuaded the reluctant team to go first.',
      },
      fix: 'The setup would be two sentences: three flag systems, two incidents from flipping the wrong one, and no authority over the teams. The Action would say what the candidate did about the politics: "I asked each team lead for their must-haves, I scored the options against them in a shared doc, and I migrated my own team first so nobody else had to go first."',
    },
    {
      questionId: 'leadership-5',
      situation:
        "I was the tech lead on a mobile team, and I decided to hand the migration of our app's analytics to a newer engineer on the team.",
      task: 'I wanted to give him a chance to own something important and grow, while I focused on other priorities.',
      action:
        'I explained the project to him at a high level and told him I was around if he needed anything. I checked in with him from time to time, and things seemed fine. Near the end I realized there were some problems with the data, so I got more involved and helped him get it back on track. I gave him some feedback afterward about communicating earlier, and I made sure the migration still finished.',
      result: 'The migration shipped about 3 weeks late, and some of the data had issues for a while.',
      reflection: 'Delegation is hard.',
      flaws: ['vague', 'no-reflection'],
      why: {
        vague:
          '"At a high level", "from time to time", "some problems with the data" and "helped him get it back on track" never say what went wrong, what support he had, or what the candidate did when stepping in.',
        'no-reflection':
          'The question asks what the candidate would do differently, and "Delegation is hard" answers nothing, so the interviewer has to ask the most important follow-up.',
      },
      fix: 'The Action would be specific: "I handed him the migration with a one-line brief, and did not check that events matched between the old and new pipelines, so two weeks of purchase events were dropped before anyone noticed." The reflection would name the change: "Now when I delegate, I agree with the person on the one metric that tells us early if it is going wrong, and we look at it together every week."',
    },
  ],
};
