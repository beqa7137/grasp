import type { CompetencyExamples } from '../types.js';

export const DELIVERY: CompetencyExamples = {
  competencyId: 'delivery',
  strong: [
    {
      level: 'early',
      lookFor:
        'A feature you owned against a real date, the quality line you would not cross, and the risk raised early rather than a silent slip.',
      questionId: 'delivery-5',
      situation:
        'In my second year as an Android engineer at a note-taking app, I owned PDF export for notes. Marketing had a launch post booked for the following Wednesday, and the app store build had to go out that Friday to reach most users by then.',
      task: 'My job was to have export in that build, working for the common case, without any user getting a crash or a broken file.',
      action:
        'On Tuesday my tests turned up an edge case: notes with more than about 200 embedded images ran the export out of memory on phones with 3 GB of RAM or less, and the app crashed. Streaming the images page by page would take about a week. I did not want to quietly ship it, and I did not want to slip the whole release either, so I measured how often it could happen. Our analytics showed that under 2 percent of notes had more than 100 images. I wrote up two options for my lead and the product manager that afternoon: slip the release a week, or ship on Friday with a guard. The guard was mine to build: before exporting, the app counted the images and checked free memory, and if the note was too large it offered a text export with image links instead of crashing. They picked the guard. I wrote tests for the guard path on our lowest-memory test phone, put export behind a remote flag at 10 percent of users over the weekend and everyone on Tuesday, and watched crash reports and support tickets myself each morning. Then I spent the next sprint on streaming export.',
      result:
        'The build went out on Friday and the launch post ran on schedule. In the first month, 1,240 exports took the text-only path, export caused no crashes, and streaming export shipped two weeks later and removed the guard.',
      reflection:
        'I learned that "ship or slip" is rarely the only choice: a small guard that makes the failure safe can buy the time to do it right.',
      notes: {
        situation: 'A feature a junior can own, a real date and a clear reason the date mattered.',
        task: 'Names the quality line the candidate would not cross (no crash or broken file), which frames every later choice.',
        action:
          'Measures the risk instead of guessing, brings options to the lead and the product manager early, and builds a safe failure mode plus a staged rollout. The follow-through sprint shows the shortcut was paid back.',
        result: 'Date hit, the size of the accepted risk as a number, and the proof that nothing crashed.',
        reflection: 'A reusable lesson about making failures safe, which answers "would you make the same call again?"',
      },
    },
    {
      level: 'mid',
      lookFor:
        'Leading delivery under pressure: priorities set in order and said out loud, scope cut with the people who agreed to it, and each call backed by evidence and told to the people it affects.',
      questionId: 'delivery-7',
      situation:
        'I was the on-call engineer for our payments service when, at 2 a.m. on a Friday, the card payment success rate dropped from 97 percent to 71 percent. Checkout was still up, and some customers were being charged twice.',
      task: 'My job was to stop the double charges first, restore payments second, and keep support and finance informed while I did it.',
      action:
        'I opened an incident channel, paged the payments lead, and asked a support engineer to own customer updates so I could focus on the system. The dashboards showed timeouts to the card processor, not declines, which told me our requests were slow rather than rejected. In the deploy log I found a release from that evening that had lowered the processor client timeout from 30 seconds to 5. Our service was giving up on payments that later succeeded, and the retry logic then created a second charge. I rolled back the release instead of patching the timeout live, because a rollback was a known state and a hot fix at 2 a.m. was not. For the double charges, I wrote a query joining our ledger with the processor settlement report to find every duplicate, and I chose to have finance refund them in the morning rather than script automatic refunds that night, since a bug in a refund script would have moved real money twice. The next week I added an idempotency key to every payment request, so a retry can never create a second charge.',
      result:
        'Payment success was back at 97 percent 40 minutes after the page. Finance refunded 312 duplicate charges by noon, support closed the related tickets within two days, and there has not been a duplicate charge since the idempotency change.',
      reflection:
        'The lesson I took was that retries are only safe when the operation is idempotent, so I now ask about idempotency in every payments design review.',
      notes: {
        situation: 'Opens with the exact metric and the harm to customers, so the stakes are clear before any detail.',
        task: 'States the order of priorities (stop the harm, then restore, then communicate), which is how interviewers want incidents run.',
        action:
          'Shows the diagnosis as a chain of evidence, and explains two deliberate choices: rolling back instead of hot fixing, and refunding by hand instead of by script.',
        result: 'Time to recovery, the size of the cleanup and a lasting outcome, all as numbers.',
        reflection:
          'Turns the incident into a habit, asking about idempotency in every payments design review, which answers "what changed afterward?" before it is asked.',
      },
    },
    {
      level: 'senior',
      lookFor:
        'A date across teams you did not manage: a slip spotted early in the data, priced options brought to leaders, and teams unblocked rather than chased.',
      questionId: 'delivery-2',
      situation:
        'As a staff engineer on the data platform, I led the move of about 200 nightly pipelines, owned by six teams, off an orchestrator hosted in a data center whose lease ended on June 30. Missing it meant a six-month lease extension at about 400,000 dollars.',
      task: 'I owned the plan and the date across all six teams, though none of their engineers reported to me.',
      action:
        'In week six of sixteen, my tracker showed 31 pipelines moved against a plan of 60. I dug in rather than hoping it would recover, and found the slip was not effort: the 40 pipelines with hand-written SQL retries took three times as long to port as we had estimated. I told my director and the finance partner that same week, before anyone asked, with a new forecast of July 25 and three options: extend the lease, add two engineers for eight weeks, or move the 160 simple pipelines first and run the 40 hard ones in a small cloud copy of the old orchestrator for one month. I recommended the third, since it cost about 30,000 dollars and kept the new platform on schedule. Once they agreed, I rebuilt the plan with each team lead and wrote a converter that handled the common retry pattern, which cut porting time for the hard pipelines roughly in half. I sent a weekly one-paragraph status to all six teams with the numbers, so nobody learned of a problem from someone else.',
      result:
        'We left the data center on June 27, three days early. The 40 hard pipelines finished in the interim cloud copy by July 21, the fallback cost about 30,000 dollars instead of 400,000 for the lease extension, and there were no missed nightly runs.',
      reflection:
        'I learned to break estimates down by kind of work from day one, since an average hid the 40 pipelines that were three times harder.',
      notes: {
        situation: 'A hard date, the cross-team scope and the dollar cost of missing it, in two sentences.',
        task: 'Names the ownership without authority, which is the senior bar for a delivery question.',
        action:
          'Spots the slip early from data, finds the real cause, and brings leaders a date and three priced options with a recommendation. The converter and weekly status show the candidate unblocking teams, not just reporting on them.',
        result: 'Date hit, cost against the alternative and no service impact, all as numbers.',
        reflection: "Names the early sign that was missed, answering the question's own follow-up before it is asked.",
      },
    },
  ],
  weak: [
    {
      questionId: 'delivery-1',
      situation:
        'So at the time I was on the web team, and we had just gone through a reorg, so a lot of things were in flux. There was a big conference coming up that the sales team had been planning around for months, and leadership had promised a bunch of customers a new reporting feature that would be ready for it. The original plan had been to build it over the quarter, but another project ran long, so the start kept getting pushed, and by the time it landed on our plate there was very little time left. On top of that, a couple of people were out, the designs were not final, and nobody was totally sure what the backend would look like.',
      task: 'My task was to get the reporting feature done in time for the conference, which was pretty tight, and make sure it worked well enough to demo to customers without any issues.',
      action:
        'I worked really hard on it and put in a lot of extra hours. I prioritized the most important parts, cut some scope, and kept everyone in the loop. I also worked closely with design and the backend folks to make sure things lined up.',
      result: 'We shipped it 2 days before the conference, and all four customer demos ran without a problem.',
      reflection: 'It was a lot of work.',
      flaws: ['long-setup', 'vague', 'no-reflection'],
      why: {
        'long-setup':
          'The reorg, the conference and the delays take up most of the answer, and what the candidate did gets three short sentences.',
        vague:
          '"Prioritized the most important parts" and "cut some scope" never say which parts or what was cut, so there is nothing to believe or probe.',
        'no-reflection': '"It was a lot of work" leaves the follow-up "what would you do differently?" unanswered.',
      },
      fix: 'The setup would shrink to two sentences: a promised reporting feature, six weeks of work, and three weeks left. The Action would name the cut ("I dropped CSV export and custom date ranges, which only two customers had asked for") and how the backend risk was handled, and the answer would close with a lesson such as agreeing on the API contract on day one.',
    },
    {
      questionId: 'delivery-4',
      situation:
        'We were building a new returns flow for an online clothing store, due before the holiday season, and it depended on the shipping team adding a label API.',
      task: 'We had to launch returns by November 1, and the label API was the one piece we could not build ourselves.',
      action:
        'We built our side against the spec the shipping team gave us and asked them for a date. They kept saying it was almost done, but they missed two dates and never told us why, which honestly was typical of that team. We raised it in our standup and our manager escalated it to theirs. When the API finally arrived, it did not match the spec they had written, so we had to rework our integration in the last week. We also added a fallback where customers could print a generic label, and we tested everything as fast as we could.',
      result:
        'We launched on November 8, a week late, and about 30 percent of returns used the generic label for the first month because of their API.',
      reflection: 'I learned that you cannot count on other teams to hit their dates, so we should build in extra buffer.',
      flaws: ['we-not-i', 'blame'],
      why: {
        'we-not-i':
          'The Action never says "I", so the interviewer cannot tell whether the candidate chased the dependency, built the fallback or only watched.',
        blame:
          'The shipping team is blamed for the slip and the rework ("typical of that team", "because of their API"), and the reflection concludes other teams cannot be trusted, with no look at what the candidate could have done earlier.',
      },
      fix: 'The Action would say what the candidate did, such as "I asked the shipping lead for a contract test against their spec in week one" and "I built the generic-label fallback", and treat the late API as a risk to manage, not a team to fault. The reflection would own a lesson, like agreeing on a tested contract before building against a spec.',
    },
  ],
};
