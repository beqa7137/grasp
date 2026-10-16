import type { CompetencyExamples } from '../types.js';

export const FEEDBACK: CompetencyExamples = {
  competencyId: 'feedback',
  strong: [
    {
      level: 'early',
      lookFor:
        'Asking for feedback, meeting it with questions instead of a defense, changes you can measure, and asking again to close the loop.',
      questionId: 'feedback-3',
      situation:
        'Eight months into my first job, on a team building a payments dashboard, my pull requests were taking days to get approved, so I asked a senior engineer in a one-to-one what made them hard to review. He told me they often ran past 1,000 lines, and my descriptions said what changed but never why.',
      task: 'I wanted my work reviewed faster and trusted more, so I needed to understand the feedback properly and change how I worked in a way he could see.',
      action:
        'My first reaction was to explain that the features were big, but I stopped and asked him for two examples instead. He showed me a pull request where three reviewers had asked the same question about a currency rounding change buried in line 800. That made it concrete. For my next feature, a refunds table, I split the work into five stacked pull requests, each under 300 lines, each doing one thing: the API client, the data model, the table, the filters and the tests. I wrote a short description template with three headings, what, why and how to test, and I used it on every pull request. I also started tracking the time from opening a pull request to approval in a small spreadsheet, so I would know if the change worked rather than guess. After a month I asked him directly whether my pull requests were easier to review now and what was still missing. He said the descriptions still skipped the risky parts, so I added a fourth heading: what could break.',
      result:
        'My median time to approval fell from four days to under one day across the next 14 pull requests, and none of them needed a second round of review. Two other engineers copied my template, and the team made it the default pull request template that quarter.',
      reflection:
        'I learned to answer criticism with a question and a visible change, and to go back and ask whether it worked, because that follow-up is what earned his trust.',
      notes: {
        situation:
          'The candidate went looking for the feedback, and it is specific and checkable, at the right scope for an early-career engineer.',
        task: 'Frames the goal as acting on the feedback visibly, not as defending the old habit.',
        action:
          'Admits the defensive first reaction and replaces it with a question, then shows concrete changes and a way to measure them. Asking again after a month closes the loop.',
        result: 'A before and after number, plus the team adopting the change, shows it worked beyond the candidate.',
        reflection: 'Names the habit, ask then change then check, rather than a generic line about being open to feedback.',
      },
    },
    {
      level: 'mid',
      lookFor:
        'Holding the bar with a peer without losing the relationship: a conversation instead of a public block, must-fix kept apart from preference, and feedback taken in return.',
      questionId: 'feedback-2',
      situation:
        'I was reviewing a migration from a peer on our orders service. It added an index to a Postgres table with 400 million rows using a plain CREATE INDEX, which blocks writes to the table until the build finishes.',
      task: 'He was under pressure to ship before a sales event, so I needed to stop the migration without making him feel I was blocking him for the sake of it.',
      action:
        'Before leaving a blocking comment, I called him, because a red "changes requested" three days before a deadline reads as an attack. He said it had run in three seconds on staging. I pointed out that staging has about 2 million rows, and rather than argue, I ran the migration on a restored production snapshot while we talked: the build took 14 minutes, which would have meant 14 minutes of checkouts hanging and timing out. That number made the case for me. I kept my review comment to the risk and the evidence, and I split the rest of my notes into must-fix and optional, so he knew exactly what stood between him and merging. I offered to pair on the fix: CREATE INDEX CONCURRENTLY, which cannot run inside a transaction, so we added a flag to our migration tool to skip the wrapping transaction for that file. A week later I asked him how the review had felt. He said the call helped, but that my first comment had quoted a style nit alongside the real problem, which diluted it. I stopped mixing the two after that.',
      result:
        'The index shipped the next day, before the sales event, with zero write downtime. I also added a CI check that flags any CREATE INDEX without CONCURRENTLY on an existing table, and it caught 3 more migrations in the next quarter.',
      reflection:
        'I learned that evidence shown together beats an opinion written in a comment, and that asking how a review landed taught me something about my own reviews too.',
      notes: {
        situation: 'The technical risk is stated precisely, so the interviewer can see why the push back mattered.',
        task: 'Holds the bar and the relationship together, which is the real skill a code review question tests.',
        action:
          'Chooses a call over a public block, lets data make the argument, separates must-fix from preference and offers help. The follow-up question turns into feedback the candidate receives and acts on.',
        result: 'Zero downtime, plus a CI check that prevents the class of problem, not only this instance.',
        reflection: 'Two lessons, one about giving feedback and one about receiving it, both tied to specific moves in the story.',
      },
    },
    {
      level: 'senior',
      lookFor:
        'Feedback upward on a process you do not own: checked with data, given privately, the effect named without blaming intent, and an offer to do the work.',
      questionId: 'feedback-5',
      situation:
        'As a staff engineer in an infrastructure group of about 60 engineers, I noticed our incident reviews had turned into hunts for who pushed the bad change. Our director ran them and often opened with that question.',
      task: 'The reviews were hers, so I needed to give her feedback she could act on without embarrassing her in front of her teams.',
      action:
        'I first checked whether the pattern was real rather than my impression. Near-miss reports, where someone caught a problem before customers saw it, had fallen from about 12 a month to 3 over two quarters, while real incidents had not dropped. I also read the last eight review documents and found that six named an individual as the cause. I asked her for 30 minutes alone and opened with the effect, not her intent: I said I believed she wanted accountability, and showed her the near-miss chart and the six reviews. I said the question of who pushed it was teaching people to hide small mistakes. She pushed back that some engineers were careless, and I agreed that could be true, and suggested we handle that in one-to-ones rather than in the review. I proposed a new format, starting with the timeline and asking what made the mistake easy to make, and offered to facilitate the next two reviews so she could watch it work. I asked if I could check back in two months with the numbers, and I put the date in both our calendars.',
      result:
        'At the two-month check-in, near-miss reports were back to 14 a month, and repeat incidents fell from 6 in the previous quarter to 2. She adopted the format for all reviews and asked me to give her feedback after each one for a month.',
      reflection:
        'I learned that upward feedback lands when it leads with data and the effect on people, offers a way forward, and comes with a date to check the result together.',
      notes: {
        situation: 'A real power gap and a process with real cost, described without painting the director as the villain.',
        task: 'Acknowledges who owns the process, so the goal is to influence it, not to take it over.',
        action:
          'Verifies with data first, speaks privately, separates intent from effect, concedes a fair point and offers to do the work. Scheduling the follow-up turns feedback into a shared experiment.',
        result: 'Leading and lagging numbers both moved, and the director asking for more feedback shows it landed well.',
        reflection: 'A reusable recipe for upward feedback, grounded in what worked in this story.',
      },
    },
  ],
  weak: [
    {
      questionId: 'feedback-1',
      situation: 'An engineer on another team kept making changes that broke things for my team.',
      task: 'I felt someone needed to say something, and since I worked with him the most, I decided it should be me.',
      action:
        'I found a good moment and talked to him about it. I tried to be honest but kind, and I focused on the impact rather than on him as a person. I gave him some examples and explained how it was making things harder for my team. He was a bit defensive at first, but I listened to his side and we talked it through. I told him I was there to help if he needed anything.',
      result: 'He took it well in the end, and things improved a lot after our conversation. The team noticed the difference.',
      reflection: 'I learned that giving feedback is easier when you are honest and kind and focus on the impact on the team.',
      flaws: ['vague', 'no-result'],
      why: {
        vague:
          'There is no behavior to picture: "changes that broke things" and "some examples" could describe anyone, and the interviewer never hears what was actually said.',
        'no-result': '"Things improved a lot" gives no evidence, such as fewer broken builds or a heads-up before each breaking change.',
      },
      fix: 'The answer would name the behavior, for example an engineer who changed a shared API response without notice and broke the mobile build twice in a month, and quote the opening line of the conversation. The Result would show it changed: no unannounced breaking change in the next quarter, after he added a contract test to his pipeline.',
    },
    {
      questionId: 'feedback-7',
      situation:
        'In my last performance review, my manager said I was hard to work with in design reviews. The feedback came from two engineers on the search team, who said I dismissed their ideas. This was during a year when our team was rebuilding the indexing pipeline, the deadlines were tight, and there were a lot of strong opinions about the architecture from several teams.',
      task: 'I had to decide how to respond to feedback I thought was unfair, since I was only defending good engineering.',
      action:
        'I asked my manager which reviews they meant. I explained that those engineers had proposed a design that would not scale, and that I had just been direct about it. I did try to soften my tone in the next few reviews.',
      result: 'My next review, 6 months later, did not mention it again.',
      reflection:
        'I learned that some people take directness personally, and that you have to be careful how you phrase things around them.',
      flaws: ['long-setup', 'blame'],
      why: {
        'long-setup':
          'The background about the pipeline and the deadlines takes longer than the Action, which is only three sentences, so the interviewer never hears how the candidate actually changed.',
        blame:
          'The candidate recasts the feedback as the other engineers being sensitive, which is exactly the defensiveness the question tests for.',
      },
      fix: 'The answer would cut the background to a sentence and spend the time on the Action: asking the two engineers directly what felt dismissive, hearing that they were cut off mid-sentence, and starting to restate their idea before critiquing it. The Result would come from them, such as one of them asking the candidate to review their next design.',
    },
  ],
};
