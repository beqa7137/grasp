import type { CompetencyExamples } from '../types.js';

export const TRADEOFFS: CompetencyExamples = {
  competencyId: 'tradeoffs',
  strong: [
    {
      level: 'early',
      lookFor:
        "One design choice in your own feature: each option's cost estimated, how often the bad case happens checked with data, what users lose named, and when you would revisit it.",
      questionId: 'tradeoffs-2',
      situation:
        'In my first year on the Android team of a grocery delivery app, I was given the offline shopping list: users wanted to edit their list in stores with no signal.',
      task: 'I owned the sync design, and the hard question was what happened when two people in a household edited the same list while offline.',
      action:
        'I sketched two options and estimated each. Merging edits item by item, so both people kept their changes, would take about seven weeks, most of it in conflict rules and tests. Last write wins, where the most recent full list replaces the other, would take about three. Before choosing, I pulled a week of analytics to see how often the conflict could even happen: only 4 percent of lists were shared, and edits to the same shared list within ten minutes of each other were under 1 percent of those. So I chose last write wins, and I wrote down plainly what we gave up: a household could occasionally lose an item the other person had added. To make that cost visible instead of silent, I logged every sync where the server had a newer version than the one the phone started from, so I could count real conflicts after launch. I also told my tech lead and the product manager the exact condition that would make me switch: if more than 1 percent of syncs conflicted, or if shared lists passed 10 percent of all lists. I kept the sync payload keyed by item ID rather than as one blob, so an item-level merge could be added later without a data migration.',
      result:
        'The offline list shipped in three weeks, and 18 percent of weekly users edited a list offline in the first month. Conflicts ran at 0.2 percent of syncs, with two support tickets in the quarter. A year later shared lists reached 11 percent, the trigger fired, and a teammate built the item-level merge in five weeks on top of my payload format.',
      reflection:
        'I learned to measure how often the bad case actually happens before paying for it, and to agree in advance on the number that would change my mind.',
      notes: {
        situation: 'One sentence of product context at the scope of a first-year engineer: a single feature on one app.',
        task: 'Names the precise design question, concurrent offline edits, so the trade-off is concrete from the start.',
        action:
          'Puts weeks on both options, checks the frequency of the failure with data, names what users lose, and sets a measurable condition for revisiting the choice.',
        result: 'Shows the shortcut paid off, the cost stayed small as predicted, and the revisit trigger worked when usage changed.',
        reflection:
          'A reusable rule, measure the bad case and agree on the switching number up front, rather than a vague line about trade-offs.',
      },
    },
    {
      level: 'mid',
      lookFor:
        'Debt taken on deliberately to hit a date: what could not be compromised kept apart from what could, the cost told to whoever pays it, and a written trigger to repay it.',
      questionId: 'tradeoffs-3',
      situation:
        'Our notifications service sent push and email for a food delivery app, and marketing needed a new promotion engine live before a holiday campaign five weeks away.',
      task: 'I owned the design. The clean approach, a rules engine with its own scheduler, would take about ten weeks, so I had to decide how much debt to take on to hit the date.',
      action:
        'I split the design into what had to be right and what could be temporary. Audience targeting and send limits had to be right, because a bug there would spam millions of users, so I built them properly, with tests and a dry-run mode. Scheduling I chose to hard code: campaigns would live in a config file and be triggered by our existing cron system, instead of a scheduler with its own interface. I knew that meant engineers, not marketers, would launch every campaign, and I said so plainly to the marketing lead before starting. To keep the debt from becoming permanent, I wrote a short design note describing the shortcut, its cost, and the conditions for paying it back: more than two campaigns a week, or any need to change a campaign mid-send. I put the payback work on the roadmap for the quarter after the holidays and got my manager to agree to it in writing. I also kept the config format close to what a real scheduler would store, so migrating later would be a translation, not a rewrite.',
      result:
        'The engine launched in four and a half weeks and sent the holiday campaign to 6 million users with no send-limit violations. By February marketing wanted three campaigns a week, the payback trigger fired, and the proper scheduler shipped in six weeks, reusing about 70 percent of the original code.',
      reflection:
        'Tech debt worked here because I wrote down its price and the trigger for paying it before taking it on, so nobody had to argue about it later.',
      notes: {
        situation: 'Two facts, the deadline and the stakes, and nothing else.',
        task: 'Frames the trade-off as a gap in weeks, so the decision in the Action is measurable.',
        action:
          'Separates what could not be compromised from what could, tells the affected stakeholder what they were giving up, and puts a written trigger on repaying the debt.',
        result: 'Shows the shortcut paid off and then shows the debt actually being repaid on schedule.',
        reflection:
          'States the rule that made the debt safe, writing down its price and payback trigger before taking it on, which is the insight interviewers look for.',
      },
    },
    {
      level: 'senior',
      lookFor:
        "Two leaders' goals in conflict: each option priced in money and risk, each side asked what decision the data really drives, and one proposal both sides agreed to.",
      questionId: 'tradeoffs-4',
      situation:
        'I was a staff engineer on the data platform of a travel marketplace. Finance needed the nightly revenue close finished and frozen by 6 a.m., and the growth org wanted hourly dashboards from the same warehouse.',
      task: 'Our warehouse budget could not cover both as asked, the two VPs each expected to win, and neither team reported to me, so I had to find a decision both would accept.',
      action:
        "I started by pricing each request instead of debating it. I replayed a week of queries and found hourly refreshes of all 140 growth tables would triple compute cost, to about 90,000 dollars a month, and would compete with the finance jobs between 2 and 6 a.m., the window where the close had already missed its deadline four times that quarter. Then I met each side separately and asked what decision each number actually drove. Finance needed exact, audited figures once a day. Growth, it turned out, made intraday decisions from only 12 metrics, mostly bookings and ad spend by channel, and was happy with approximate figures if they were labelled as such. I wrote a one-page proposal with three options and their cost, risk to the close, and freshness, and I recommended the middle one: finance jobs get reserved capacity overnight, and the 12 growth metrics refresh hourly from the event stream, approximate and marked as such, with the other 128 tables staying daily. I was explicit about what growth gave up: hourly views of the long tail of tables, and exactness during the day. I brought both VPs into one review with the proposal rather than letting them escalate separately, and I asked the growth director to co-present the metric list, since it was her team's analysis. I also put a date on revisiting it: after one quarter, with the close success rate and dashboard usage in hand.",
      result:
        'Both VPs signed off in that meeting. The close hit its 6 a.m. deadline every night for the next two quarters, compute rose 18 percent instead of tripling, and the hourly metrics were used by 70 people weekly. At the quarterly review, usage showed 3 more metrics were needed hourly, and we added them.',
      reflection:
        'When two leaders want conflicting things, the leverage is in asking what decision each request drives. The real need was usually much smaller than the ask.',
      notes: {
        situation: 'Two senior stakeholders, one shared resource and a hard deadline, which is the scope a staff answer needs.',
        task: 'States the constraint and the lack of authority in one sentence, so the influence in the Action matters.',
        action:
          'Prices each option in dollars and risk, narrows the ask by asking what decision it drives, names what the losing side gave up, and gets both leaders to decide together.',
        result: 'Numbers for the deadline, the cost and adoption, and a scheduled revisit that actually changed the plan.',
        reflection: 'A transferable technique, asking what decision a request drives, drawn directly from the story.',
      },
    },
  ],
  weak: [
    {
      questionId: 'tradeoffs-1',
      situation: 'I was the tech lead on a small platform team, and for a while we had way more requests coming in than we could handle.',
      task: 'I had to figure out what to work on and what to push back on, while keeping stakeholders happy.',
      action:
        'I looked at everything on our plate and prioritized based on impact and effort. I talked to the stakeholders to understand what really mattered to them, and I made some tough calls about what to drop. I focused the team on the highest-impact work and made sure I communicated the trade-offs clearly so there were no surprises. For the things we could not get to, I set expectations and gave people a rough timeline for when we might revisit them.',
      result: 'We delivered the top 3 priorities for the quarter, and stakeholders appreciated the transparency.',
      reflection: 'It all worked out.',
      flaws: ['vague', 'no-reflection'],
      why: {
        vague:
          '"Impact and effort" and "tough calls" never name a single request that was dropped, so the interviewer hears the vocabulary of prioritization but not a decision.',
        'no-reflection':
          '"It all worked out" skips what the candidate would weigh differently next time, the follow-up this question almost always gets.',
      },
      fix: 'The Action would name the requests and the call: "We had eleven asks; I kept the database upgrade and the build cache because they blocked every team, and I said no to a custom deploy dashboard, offering the existing one with two saved filters instead." It would end with a lesson, such as publishing the ranked list so stakeholders could argue with the ranking rather than with each request.',
    },
    {
      questionId: 'tradeoffs-7',
      situation:
        'The largest project I have led was moving our recommendation models from a nightly batch system to real-time scoring. The company is a streaming service with about 20 million subscribers, and recommendations drive most of what people watch. The batch system had been built five years earlier by a team that no longer existed, it ran on a Hadoop cluster that infrastructure wanted to shut down, and any new model took weeks to get into production. Leadership had also set a goal to personalize the home screen within a session, which the nightly batch could never do.',
      task: 'As the lead, I had to plan the migration across the ML, data and client teams, decide what to build first, and get it done before the Hadoop cluster was turned off at the end of the year.',
      action:
        'We broke the work into phases and ranked them by risk. We moved the feature pipeline to streaming first, because every model depended on it, and we held the home screen redesign until scoring was stable. We cut support for three older models and agreed with the product teams which rows would lose personalization for a quarter.',
      result:
        'The migration finished two months before the cluster shutdown. New models now reach production in 2 days instead of 3 weeks, and in-session personalization lifted home screen plays by 6 percent.',
      reflection:
        'I learned to rank a migration by what everything else depends on, and to cut old scope early rather than carrying it along.',
      flaws: ['we-not-i', 'long-setup'],
      why: {
        'we-not-i':
          'Every decision in the Action belongs to "we", so for a question about the largest scope the candidate has led, the interviewer cannot tell which calls were theirs.',
        'long-setup':
          'The company, the history of the batch system and the leadership goal take more than twice the words of the Action, where the prioritization calls the question asks about are squeezed into three sentences.',
      },
      fix: 'The setup would be two sentences: a nightly recommendation system on a cluster being shut down in eight months, and a goal of in-session personalization. The Action would say "I": why I ranked the feature pipeline first, how I chose the three models to cut and whose rows lost personalization, and how I got the client team to accept waiting a quarter for the redesign.',
    },
  ],
};
