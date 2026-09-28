import type { CompetencyExamples } from '../types.js';

export const AMBIGUITY: CompetencyExamples = {
  competencyId: 'ambiguity',
  strong: [
    {
      level: 'early',
      questionId: 'ambiguity-7',
      situation:
        'In my first year, after moving from checkout to the search team, I was asked to add a delivery-date filter to product search. The ranking service was 40,000 lines of Java I had never seen, and its owner was on leave for three weeks.',
      task: 'The filter was promised for a sprint demo in ten days, and I needed to ship it without breaking ranking for the 2 million searches a day that went through the service.',
      action:
        'On the first day, I did not start coding. I traced a single real search request end to end with the debugger and drew the path on one page: the query parser, the filter builder and the scoring step. That showed me filters were added in one place, so my change could stay out of the scoring code I did not understand. I wrote down my three biggest assumptions, including that delivery dates were already in the index, and posted them in the team channel with a question for each. A teammate on another squad corrected the second one within an hour: dates were indexed per warehouse, not per product, so a naive filter would have hidden items that shipped from a nearer warehouse. I asked her for twenty minutes to walk me through the warehouse model, then wrote the filter to take the earliest date across warehouses. Before merging, I replayed 5,000 logged queries against the old and new build and compared the top ten results, so I could show ranking was unchanged when the filter was off.',
      result:
        'The filter shipped on day nine. The replay showed zero ranking differences with the filter off, and in its first month 11 percent of searches used it. My one-page request trace became the onboarding doc the team gives every new engineer.',
      reflection:
        'I learned to write my assumptions down and ask about them on day one, because the one I got wrong would have been a quiet bug that no test of mine would have caught.',
      notes: {
        situation: 'Gives the size of the unknown and why the usual shortcut, asking the owner, was not available.',
        task: 'Sets a scope right for a junior engineer: one feature, with a clear risk to protect.',
        action:
          'Shows a concrete orientation method, a traced request and written assumptions, and an assumption proved wrong early rather than after launch.',
        result: 'Measures safety (zero ranking differences) and use, and shows the learning helped the next new engineer.',
        reflection: 'Ties the habit directly to the bug it prevented in this story.',
      },
    },
    {
      level: 'mid',
      questionId: 'ambiguity-5',
      situation:
        'A sales director asked my data team for a real-time dashboard, refreshed every minute, showing each rep\'s pipeline. Our warehouse loaded once a night, so "real time" meant a new streaming pipeline, roughly a quarter of work.',
      task: 'I was the data engineer asked to scope it, and I wanted to be sure a streaming pipeline solved the right problem before the team committed three months to it.',
      action:
        "Before estimating, I asked the director to walk me through the last time the current report had let her down. She described a Monday forecast call where two deals had closed on Friday but still showed as open, so she had overcounted the quarter. That told me the problem was stale deal status, not minute-by-minute freshness. I then checked the report's access logs and saw it was opened about twice a day, mostly right before forecast calls. I proposed a smaller option: an hourly incremental load of just the deals table, plus a timestamp on the dashboard showing when the data was last refreshed. I was explicit about what she would not get, which was live activity counts, and I wrote down that we would revisit streaming if hourly data ever caused a wrong call. She agreed after I showed her a mock of the dashboard with Friday's closed deals appearing within the hour. I built the load on our existing scheduler rather than adding a streaming system my team would have to run on call.",
      result:
        'It shipped in two weeks instead of a quarter. The forecast error the director had flagged, deals counted as open after closing, went to zero over the next six forecast calls, and the pipeline has needed no on-call pages in eight months.',
      reflection:
        'I learned to ask for the last time the current thing failed someone, because that story reveals the real requirement faster than the stated one.',
      notes: {
        situation: 'Shows the gap between the request and its cost in two sentences, so the Action has stakes.',
        task: 'Frames the goal as solving the right problem, not delivering the literal request, which is the point of an ambiguity question.',
        action:
          'Names the technique (ask for a concrete past failure), the evidence gathered, and what the stakeholder would give up, said out loud rather than hidden.',
        result: 'Compares the time against the original plan and shows the real problem went away, with numbers for both.',
        reflection:
          'Names a reusable interviewing habit, asking for the last time the current thing failed someone, tied directly to what happened.',
      },
    },
    {
      level: 'senior',
      questionId: 'ambiguity-4',
      situation:
        'As a staff engineer on the infrastructure team, I saw that three enterprise deals needed our data kept in the EU, but legal could not yet say whether that meant storage only or processing too. The answer would take at least six months.',
      task: 'Six product teams were each planning their own workaround, so I needed to pick one direction for the company that would hold up whichever way the legal answer went.',
      action:
        'I started by listing the two readings of the rule and, for each, what every service would have to change. That showed most of the cost was shared: both readings needed a separate EU database cluster and tenant routing at the edge. Only the processing reading also needed EU copies of the 14 background workers. I proposed we build the shared part now and design the workers so they could be moved later, but not move them yet. Since each team owned its own roadmap, I wrote a two-page decision record with the options, the cost of each and the signal that would make me change course: a written legal opinion requiring EU processing. I reviewed it with each team lead one at a time before the architecture forum, and changed the plan when the payments lead showed me their fraud model could not be split by region, so payments kept one global fraud service, with that exception written into the plan for legal to review. I then asked the sales engineers which services each of the three deals actually touched, so the order of migration followed revenue rather than whoever asked loudest.',
      result:
        'All six teams adopted the plan instead of building their own workarounds. The EU cluster went live in four months, the three deals worth 2.1 million dollars a year closed, and when legal ruled for processing too, moving the workers took five weeks instead of the two quarters we had first estimated.',
      reflection:
        'I learned that under real uncertainty the useful move is to find the work that is right in every case, build that first, and write down in advance what would change the rest.',
      notes: {
        situation:
          'Names an uncertainty nobody could resolve quickly, with a cost to waiting, which is what a senior ambiguity story needs.',
        task: "Company-wide scope: one direction for six teams, not one team's plan.",
        action:
          'Shows influence without authority: a written record with an explicit change signal, one-to-one reviews before the forum, and the plan changing when a lead found a real gap.',
        result: 'Numbers for adoption, revenue and time, and proof the reversible design paid off when the answer came.',
        reflection: 'A reusable way to act under uncertainty, drawn straight from how the story played out.',
      },
    },
  ],
  weak: [
    {
      questionId: 'ambiguity-1',
      situation:
        'I was building an internal tool for our operations team to manage refunds, and the product manager gave me a one-line ticket with basically no requirements.',
      task: 'I had to deliver something useful by the end of the sprint even though nobody would tell me what they actually wanted.',
      action:
        'The product manager kept saying they were too busy to meet, and the operations lead changed their mind every time I asked a question, so honestly it was frustrating. I ended up building what I thought made sense: a table of refund requests with filters and an approve button. I wrote up my assumptions in the ticket so that if it was wrong, nobody could say I had not flagged it. I demoed it at the end of the sprint, and then operations came back with a bunch of changes they should have mentioned at the start, which I worked through in the next sprint.',
      result:
        'Operations started using it, and after the changes they were mostly happy with it. It was definitely better than the spreadsheet they had been using before.',
      reflection: 'I learned that when requirements are unclear, you have to protect yourself by documenting everything.',
      flaws: ['blame', 'no-result'],
      why: {
        blame:
          'The product manager was "too busy" and operations "should have mentioned" the changes, so the answer is about who let the candidate down, not how they drew the requirements out.',
        'no-result':
          '"Mostly happy" and "better than the spreadsheet" give no measure, such as refunds handled per day or minutes per refund.',
      },
      fix: 'The Action would show the candidate creating clarity: shadowing an operations analyst for an afternoon, sketching two layouts and getting a pick in a ten-minute call. The Result would say the tool cut the time per refund from about 6 minutes to 2, and the Reflection would be about getting a user in front of a mock early rather than protecting yourself.',
    },
    {
      questionId: 'ambiguity-2',
      situation:
        'We were building a referral program in our fitness app, and halfway through the quarter leadership changed the goal from new signups to retention of existing members.',
      task: 'Our squad had to rework the feature so it counted toward the new goal without missing the end of the quarter.',
      action:
        'We got together as a team and went through what we had already built. We decided to keep the invite flow but change the reward, so instead of a discount for new signups, both people got a free month if they worked out together for four weeks. We reworked the backend to track shared workouts, and our designer updated the screens. We also set up an experiment against the old version, and we shipped it about two weeks before the quarter ended.',
      result: 'Members offered the new reward were 18 percent more likely to still be active after 60 days than the control group.',
      reflection: 'It worked out well in the end.',
      flaws: ['we-not-i', 'no-reflection'],
      why: {
        'we-not-i':
          'Every step is "we": the interviewer cannot tell whether the candidate proposed the new reward, built the tracking or only watched it happen.',
        'no-reflection':
          '"It worked out well" repeats the Result, so nothing says what the candidate would do at the start next time to limit the churn.',
      },
      fix: 'The Action would say what the candidate personally did, for example: I inventoried the built work, proposed keeping the invite flow and changing the reward, and built the shared-workout tracking. It would end with a lesson such as tying every feature to a metric that survives a goal change, since that is why most of the work could be kept.',
    },
  ],
};
