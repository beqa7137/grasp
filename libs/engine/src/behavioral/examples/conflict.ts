import type { CompetencyExamples } from '../types.js';

export const CONFLICT: CompetencyExamples = {
  competencyId: 'conflict',
  strong: [
    {
      level: 'early',
      questionId: 'conflict-6',
      situation:
        'In my first year as a frontend engineer, I needed a date range picker for our booking web app. I wanted to write my own, and the senior engineer reviewing my plan wanted me to use the picker from our shared component library.',
      task: 'I owned the feature and had two weeks for it, so I needed to settle the choice with her quickly and then build it well.',
      action:
        'I made my case in a short message: the library picker could not show prices under each date, which the design needed, and I thought my own would take three days. She asked one question I could not answer: how would mine work with a screen reader and a keyboard? I still believed my version was faster, but it was her call as the reviewer, so I used the library picker and added an optional price label under each date to it, which the designer accepted. I built it that way properly rather than grudgingly. I built the price label into the library itself so other teams could use it, and I wrote the keyboard tests for it. A month later our company ran an accessibility audit, and I read the findings for the other booking screens, several of which had hand-rolled controls like the one I had wanted to write. That was when I saw she had been right. I told her so directly in our next one-to-one and asked her to review how I planned the next component before I started building.',
      result:
        'The audit found 17 issues in hand-rolled controls on other screens and none in the date picker. The price label I added to the library was reused by two other teams within a quarter, and she became the engineer I ask first when I plan a new component.',
      reflection:
        'I learned that when a reviewer asks a question I cannot answer, that gap is usually the whole disagreement, so now I check accessibility and reuse before I propose building something new.',
      notes: {
        situation: 'States both positions in plain terms and keeps the scope right for a first-year engineer: one component.',
        task: "Owns the decision's outcome without framing the goal as winning.",
        action:
          'Shows the candidate committing fully after losing, turning the constraint into a contribution to the library, and saying out loud that the other side was right.',
        result: 'The audit numbers prove the point, and the reuse and the ongoing relationship show the loss paid off.',
        reflection: 'Names the exact signal they missed, an unanswerable question, and the habit that replaced it.',
      },
    },
    {
      level: 'mid',
      questionId: 'conflict-1',
      situation:
        'On our iOS and Android shopping app, a senior teammate and I disagreed about offline support for the cart. He wanted a full local database with sync, and I thought that was far more than the problem needed.',
      task: 'There were six weeks before the holiday release, and as the engineer leading the cart work, I needed us to agree on a design without the argument stalling the team.',
      action:
        'Rather than keep debating in pull request comments, I suggested we each write a one-page proposal with the same three sections: the user problem, the cost and the failure modes. Writing mine forced me to check my own assumption, so I pulled our analytics and found that 9 percent of cart sessions lost connectivity, mostly in gaps under 30 seconds on subways and in stores. His proposal made a fair point I had underrated: a sync layer would also fix a separate bug where carts diverged across devices. I proposed a middle path: queue cart edits locally and replay them in order when the connection returned, and I left cross-device sync out of the holiday release, with a ticket and a date for it. I asked him to own the conflict rules for the replay queue, since he knew that problem best, and I built the queue and its tests. When the tech lead asked for a decision, I presented both proposals side by side rather than only mine, so the choice was about the data and not about who argued harder.',
      result:
        'The queue shipped in four weeks, two ahead of the release. Cart abandonment after a connection drop fell from 22 percent to 8 percent over the holiday season, and his sync design became the plan for the following quarter.',
      reflection:
        'Writing both proposals in the same format turned a debate about opinions into a comparison, and I have used that structure for every design disagreement since.',
      notes: {
        situation: 'States both positions fairly in two sentences, without painting the teammate as wrong.',
        task: 'Names the deadline and the real goal: a decision that does not stall the team, not winning the argument.',
        action:
          'Shows the candidate testing their own view with data, conceding a point, and giving the other engineer real ownership. The deferred sync work is the trade-off, made explicit.',
        result: "Numbers for delivery and for users, and the teammate's idea surviving, which shows the relationship held.",
        reflection:
          'Names the technique the candidate kept using, writing both proposals in the same format, which is more convincing than "communication matters".',
      },
    },
    {
      level: 'senior',
      questionId: 'conflict-5',
      situation:
        'As a staff engineer on our platform team, I ran the shared Kubernetes clusters that 30 teams deployed to. The director of machine learning wanted to buy a separate GPU cluster from a cloud vendor and run it outside our platform, and I thought that would split our security and cost controls in two.',
      task: 'I had no authority over her budget, and she was two levels above me, so I needed to change the plan on its merits or find a version I could fully support.',
      action:
        "I asked her for an hour alone before raising it anywhere else, and I spent most of it asking what the platform had failed to give her team. Her answer was specific: training jobs waited a median of 9 hours for GPUs because our scheduler treated them like any other workload, and twice a job had been evicted after 30 hours of training. That was a fair complaint, and I told her so. I proposed a six-week pilot: a dedicated GPU node pool on our clusters, with a queue that gave her team guaranteed capacity and let long jobs checkpoint instead of being evicted. I set the success bar with her, not for her: median wait under 1 hour and no lost jobs, and I agreed in writing that if the pilot missed it, I would help her team set up the vendor cluster myself. I got two platform engineers assigned to the pilot and joined her team's weekly sync for the whole six weeks so problems reached me directly. I only brought in our VP once we had the results, and I presented them jointly with her.",
      result:
        'The median wait fell from 9 hours to 40 minutes, with no evicted jobs in the pilot. She chose to stay on the platform, which saved about 1.4 million dollars a year in duplicate tooling and kept a single security review for every workload. Her team now co-owns the GPU queue with mine.',
      reflection:
        'I learned that a senior leader who wants to leave a shared system is usually telling you that it failed them, so I now start by measuring that failure before defending the system.',
      notes: {
        situation: "A real power gap and real stakes on both sides, with the other leader's goal stated fairly.",
        task: 'Names the lack of authority and allows for losing, which makes the approach credible.',
        action:
          'Goes to the person privately first, concedes her strongest point with numbers, and offers a pilot with a jointly set bar and a written commitment to help if it fails. The VP comes in only with results, presented together.',
        result: 'Numbers for users, cost and control, plus shared ownership as proof the relationship improved.',
        reflection: 'A lesson about reading a conflict as feedback on your system, which is the senior version of listening first.',
      },
    },
  ],
  weak: [
    {
      questionId: 'conflict-2',
      situation: 'My manager wanted to move our API gateway to a new vendor product, and I thought our existing setup was fine.',
      task: 'I needed to push back before the team sank months into a migration I thought was a mistake.',
      action:
        'I told him in our weekly check-in that I disagreed, and I wrote a document comparing the two options on cost, latency and migration effort. The problem was that he had already made up his mind after a vendor demo and did not really engage with the numbers. I brought it up again in the architecture review, and I pointed out that the new gateway added about 15 milliseconds per request in my benchmark. He still went ahead, so I did my part of the migration, but I made sure my concerns were on record in the review notes.',
      result:
        'The migration took five months instead of the two he had promised, and the latency increase showed up in production, just like my benchmark predicted.',
      reflection: 'In the end I was right.',
      flaws: ['blame', 'no-reflection'],
      why: {
        blame:
          'The manager "did not really engage" and the story ends with the candidate being proven right, so it reads as keeping score rather than working through a disagreement.',
        'no-reflection':
          '"In the end I was right" is a verdict, not a lesson, so the interviewer still does not know what the candidate would do differently.',
      },
      fix: "The Action would try to understand why the manager wanted the new gateway (it turned out to be the vendor's rate limiting) and propose a pilot on one low-traffic route to settle the latency question with data. It would close by owning a lesson, such as asking about the goal behind a decision before arguing about the solution.",
    },
    {
      questionId: 'conflict-4',
      situation:
        'Two engineers on my team kept clashing over how things should be done, and it was starting to affect the rest of the group.',
      task: 'As the most experienced person on the team, I felt I needed to step in and help them work it out before it got worse.',
      action:
        'I talked to each of them separately to hear their side, and I tried to stay neutral and not take sides. I realized they both cared about quality but had different ideas about process. I got them together and helped them focus on what they had in common rather than their differences. I encouraged them to communicate more openly and to assume good intent. I also checked in with them afterward to make sure things stayed on track.',
      result:
        'Things got a lot better between them after that, and the team felt more relaxed. They were able to work together much more effectively going forward.',
      reflection:
        'I learned that most conflicts come from miscommunication, and that listening to both sides is the key to resolving them.',
      flaws: ['vague', 'no-result'],
      why: {
        vague:
          'There is no disagreement to picture: no project, no decision they fought over and nothing either person said, so "different ideas about process" could describe any team, and the interviewer cannot believe it happened.',
        'no-result':
          '"A lot better" and "more effectively" give no evidence, such as reviews that stopped stalling or a release that shipped after being blocked.',
      },
      fix: "The answer would name the real dispute, for example one engineer blocking the other's pull requests over test coverage for three weeks, and the specific move, such as agreeing a written coverage rule for the service together. The Result would show it held: review time back to under a day and no reverted merges between them in the next two months.",
    },
  ],
};
