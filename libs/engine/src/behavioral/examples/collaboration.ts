import type { CompetencyExamples } from '../types.js';

export const COLLABORATION: CompetencyExamples = {
  competencyId: 'collaboration',
  strong: [
    {
      level: 'early',
      lookFor:
        'Building your part with design and product: constraints raised before the build, a prototype instead of objections, and your plan changed by their research.',
      questionId: 'collaboration-1',
      situation:
        'In my first year as a frontend engineer at a travel booking site, I was assigned the mobile passenger details form, where about 30 percent of users who reached it abandoned the booking. A product manager owned that number and a designer owned the new mockups.',
      task: 'My part was the build, but I wanted the three of us to ship one version we all stood behind, not have the mockups thrown over a wall to me.',
      action:
        'Before writing code, I asked the designer for thirty minutes to walk through the mockups on a real phone. Two things would not work as drawn: the date of birth picker was a custom scroll wheel that screen readers could not operate, and errors only showed on submit, which on a small screen hid them below the fold. Instead of just listing problems, I built a rough prototype in a day with the native date input and inline errors, and showed it to her next to her version. She kept her visual style and took the native input. She pushed back on errors firing while people typed, which she had seen annoy users in research, so I changed them to fire when a field lost focus. With the product manager, I set the new form behind an experiment flag for half of mobile traffic, so the decision would rest on data rather than taste. I wrote each decision and its reason in the ticket so all three of us had one source, and I posted a short demo for the support team before launch.',
      result:
        'After two weeks, abandonment on the form fell from 30 percent to 22 percent in the experiment group, and the product manager rolled it out to all mobile users. The designer asked me to review her mockups early on her next two projects.',
      reflection:
        'I learned that a working alternative shown early turns a design critique into a shared decision, so I now ask for a walkthrough before I start any build.',
      notes: {
        situation:
          'Names both partner roles and the number they cared about, which sets up a real three-way collaboration in two sentences.',
        task: 'States the collaborative goal, one version all three stand behind, not just "build the form".',
        action:
          'Raises constraints before the build, answers with a prototype instead of objections, and changes their own plan when the designer brings research. Every step is "I".',
        result: 'A before and after number, plus the designer inviting them in earlier, which is direct evidence of a better partnership.',
        reflection: 'A concrete habit a junior can repeat on every project: ask for the walkthrough before writing code.',
      },
    },
    {
      level: 'mid',
      lookFor:
        "Stepping into another team's problem: time cleared openly with your lead, the problem shrunk together, and no new dependency on you left behind.",
      questionId: 'collaboration-2',
      situation:
        "I was a backend engineer on the search team of a used car marketplace. The mobile team's release in three weeks needed saved search alerts, and they were blocked on an endpoint my team had promised and then deprioritized for a ranking project.",
      task: 'The endpoint was not on my plan for the quarter, but their date was at risk because of us, and I knew the search index better than anyone on their team.',
      action:
        'I asked my lead if I could spend a week on it, and offered to push a ranking cleanup task by one sprint; she agreed. Then I met the mobile engineer leading the feature and, instead of building what the old spec said, asked what the app actually needed. It only needed listings that were new since the user last looked, not a full search rerun, which made the job much smaller. I wrote the API contract first and shared it the same day, so they could build against a mock server while I built the real thing. I implemented it as a nightly job that stored the last seen listing for each saved search and returned only newer matches, which kept the extra load on the search cluster under 2 percent. I joined their standup until the endpoint shipped, reviewed their client code for the pagination edge cases, and wrote a short runbook so the on-call engineer on my team could support it without me.',
      result:
        'The endpoint shipped in 8 days and the mobile release went out on its original date. About 12 percent of weekly active users opened at least one alert in the first month, and the mobile team reused the contract-first pattern for two later features.',
      reflection:
        'I learned that the fastest way to unblock another team is to ask what they need before building what was written down, and to give them a contract on day one.',
      notes: {
        situation: 'Owns that the block came from their own team, which makes stepping in a responsibility rather than a favor.',
        task: 'Says why the candidate was the right person, knowing the index, and that the work was outside their plan.',
        action:
          'Clears the time openly with their lead, shrinks the problem by asking the other team, and unblocks them early with a contract. The runbook shows they did not make themselves a new dependency.',
        result: 'The date held, the feature mattered to users, and the other team adopted the way of working.',
        reflection: 'Two specific moves for unblocking others that carry to any cross-team dependency.',
      },
    },
    {
      level: 'senior',
      lookFor:
        "A project across several teams with a fixed date and no authority: each team's constraints learned first, work split so no team blocks another, and credit shared by name.",
      questionId: 'collaboration-3',
      situation:
        'As a senior engineer at a healthcare scheduling company, I led the move of appointment reminders from email only to SMS. It needed work from four teams, messaging, patient accounts, compliance tooling and the mobile app, and none of them reported to me.',
      task: "My job was to get it live before a large clinic network's contract started in four months, without the authority to set any other team's priorities.",
      action:
        "I began by meeting each team lead one to one to learn what was already on their plate and what would make this cheap for them. Then I wrote a two-page design that split the work into pieces each team could ship on its own, with a written interface between them, so no team had to wait on another to start. Where a team was short on time, I took work off them: I wrote the consent storage changes in the accounts service myself and had their engineers review it, rather than asking them to find a sprint. I ran a thirty-minute weekly sync from one tracker, and I kept it honest by marking my own pieces red when they slipped. When the SMS provider's delivery reports turned out to arrive up to an hour late, which broke the compliance team's audit design, I paired with their engineer for two days on a redesign around idempotent status updates instead of debating whose problem it was. At launch I wrote the announcement, named the engineer on each team who built each piece, and sent a note to each of their managers.",
      result:
        'Reminders went live in 15 weeks, two weeks ahead of the contract date. No-shows at the pilot clinics fell from 11 percent to 7 percent in the first quarter, and two of the four teams reused the design template for their next cross-team project.',
      reflection:
        'I learned that when I do not control the teams, my leverage is making their part small, clear and visible, and taking the awkward pieces myself.',
      notes: {
        situation: 'Four named teams and no reporting line make the lack of control explicit, which is the heart of the question.',
        task: 'A fixed external date and no authority, so the listener knows the candidate had to earn every commitment.',
        action:
          "Learns each team's constraints first, designs the work so teams do not block each other, absorbs work where teams are thin, and solves a cross-team bug side by side. Credit is shared by name at launch.",
        result: 'The date, a patient outcome and a lasting change in how teams run joint projects.',
        reflection: 'Names what leverage looks like without authority, which is the senior bar for this competency.',
      },
    },
  ],
  weak: [
    {
      questionId: 'collaboration-7',
      situation:
        'We were launching a new payments reconciliation service, and the SRE team had to sign off before it could take production traffic.',
      task: 'We needed to get through their production readiness review in time for the end of quarter launch.',
      action:
        'We filled out their readiness checklist and sent it over, but the SRE team took almost two weeks to even look at it, and when they did they came back with a long list of requirements that felt more like box ticking than real concerns. We added the dashboards and alerts they asked for and set up a runbook, although honestly a lot of it was never going to be used. We pushed back on the load test because our traffic was small, and they finally let us launch without it once our director got involved.',
      result: 'We launched 3 days after the original date, mostly because of the review delays.',
      reflection: 'I learned that it is worth engaging SRE earlier so their process does not slow you down.',
      flaws: ['we-not-i', 'blame'],
      why: {
        'we-not-i':
          'The Action is all "we", so the interviewer cannot tell whether the candidate wrote the checklist, built the alerts or argued about the load test.',
        blame:
          'The SRE team is cast as slow box tickers and the delay is pinned on them, which is exactly the red flag this question is looking for: reliability partners treated as a gate.',
      },
      fix: 'The Action would say "I asked the SRE on the review what worried them most" and "I ran the load test they asked for", and would admit what they caught, such as a missing alert on reconciliation lag. The Result would give numbers and credit the review, for example a launch 3 days late but with zero pages in the first month.',
    },
    {
      questionId: 'collaboration-5',
      situation: 'A teammate on my team was having a hard time with his work and seemed pretty overwhelmed.',
      task: 'I wanted to help him get back on track, because I could see it was affecting him and the rest of the team.',
      action:
        'I reached out and asked how he was doing, and I let him know I was there if he needed anything. I offered to help with some of his tasks and I paired with him a few times on the harder parts. I shared some tips that had helped me when I was new, and I tried to be supportive and patient. I also made sure to check in with him regularly so he did not feel alone.',
      result: 'Over the next two months he became much more confident and his work improved a lot.',
      reflection: 'It worked out well.',
      flaws: ['vague', 'no-reflection'],
      why: {
        vague:
          'There is no task, system or moment to picture: nothing says what he was stuck on, what the pairing covered or which tips helped, so it could describe any team and is hard to believe.',
        'no-reflection':
          '"It worked out well" is a verdict, not a lesson, so the interviewer still does not know what the candidate learned.',
      },
      fix: 'The answer would name the real problem, for example a new teammate whose pull requests on the billing service kept failing review for missing migrations, and the specific help: two pairing sessions writing a migration together and a checklist he then owned. It would close with a lesson such as asking what someone is stuck on before offering general support.',
    },
  ],
};
