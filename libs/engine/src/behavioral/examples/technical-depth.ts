import type { CompetencyExamples } from '../types.js';

export const TECHNICAL_DEPTH: CompetencyExamples = {
  competencyId: 'technical-depth',
  strong: [
    {
      level: 'early',
      lookFor:
        'A problem in code you built, measured before changing anything: the cause found with a profiler or traces rather than a guess, and the obvious fix tested before going further.',
      questionId: 'technical-depth-3',
      situation:
        'About a year into my first job, on the web dashboard of a logistics company, customers with large accounts complained that the order history page froze when it opened. For an account with 3,000 orders it took 4.8 seconds before the page responded to a click.',
      task: 'The page was mine to fix: I had built its filters a few months earlier, and my lead asked me to find the bottleneck before changing anything.',
      action:
        "My first guess was the API, so I checked that first. The network panel showed the orders request finishing in 400 milliseconds, which ruled it out. I then recorded the page load in the browser performance profiler and saw one long task of about 4 seconds, almost all of it in rendering the table. Reading the flame chart, I found two causes. Every cell with a price created a new currency formatter, and with 3,000 rows and six money columns that was 18,000 formatter constructions, each surprisingly expensive. And the table rendered every row at once, even though only about 30 fit on screen. The obvious fix was to cache the formatter, and I did that first, because it was one line; it brought the freeze down to 2.1 seconds, which proved the formatter was real but not the whole story. For the rest I chose a virtualized list that renders only the visible rows plus a small buffer. I rejected paginating the table, because support told me customers scrolled through months of orders to compare them, and pagination would have broken that. Virtualizing does break the browser's find-in-page, so I added a search box that filters the full list in memory. I wrote a test that renders 5,000 orders and fails if the initial render takes more than 300 milliseconds in CI.",
      result:
        'The page became responsive in 0.6 seconds for the 3,000 order account, down from 4.8, and memory use on that page fell by about half. Support tickets about the page stopped, from about 6 a month to none. The next bottleneck was the CSV export, which I profiled the same way the following sprint.',
      reflection:
        'I learned to profile before fixing, and to measure after the obvious fix too, because the first cause I find is rarely the only one.',
      notes: {
        situation: 'Gives the exact size and delay, so a stranger could reproduce the problem.',
        task: 'Shows why a junior engineer owned it and that the brief was to measure first, the right scope for an early-career answer.',
        action:
          'Rules out the API with evidence, finds two causes in the profiler, measures the obvious fix before going further, and explains why pagination was rejected.',
        result:
          'Before and after numbers for speed, memory and tickets, and names the next bottleneck, which the question often asks about.',
        reflection: 'A concrete habit, measuring again after the obvious fix, rather than a general line about performance.',
      },
    },
    {
      level: 'mid',
      lookFor:
        'A hard bug told as hypotheses narrowed by evidence, so an engineer can follow it, with the tempting fix you rejected and the safeguard you added.',
      questionId: 'technical-depth-2',
      situation:
        'I worked on the upload service for a video platform, and about 1 in 2,000 uploads was being stored corrupted. The files passed our checksum at upload time but failed to play days later.',
      task: 'Support had escalated it after three months of intermittent reports, and I was asked to find the cause because I had written most of the storage client.',
      action:
        'Since the checksums matched at upload, I suspected the bytes changed after verification, so I started by listing every place data was written after that point. I logged a checksum at each stage for a sample of uploads, which was cheaper than logging every upload and still caught cases within a day. The corrupted files all matched at the upload server and differed in object storage, and every one of them had been uploaded in more than 100 parts. That pointed at the multipart upload code. Reading it closely, I found that when a part was retried after a timeout, our client reused a buffer that a newer part had already started writing into. It only happened when a retry and a new part overlapped, which is why it was so rare. I wrote a test that forced that overlap with an artificial delay, and it reproduced the corruption every time. The fix was to copy each part into its own buffer before sending it. I rejected the faster fix of disabling retries, because it would have traded rare corruption for common failures. I also added an end-to-end checksum that object storage verifies on completion, so any future corruption fails loudly at upload instead of silently days later.',
      result:
        "Corrupted uploads went from about 1 in 2,000 to zero over the next three months. I compared every stored file with the checksum recorded at upload to find all 4,800 affected videos and re-uploaded 4,100 from the upload servers' retained copies; we asked the other owners to re-upload. The end-to-end checksum has since caught two unrelated storage bugs before users saw them.",
      reflection:
        'The lesson I kept was to log the invariant at every boundary, because the bug is almost always at the boundary nobody checked.',
      notes: {
        situation: 'Gives the exact failure rate and the confusing symptom, which is what makes the bug hard and the story worth telling.',
        task: 'Explains why this person was the one asked, in a single sentence.',
        action:
          'Walks through the reasoning as a series of hypotheses narrowed by evidence, so an engineer can follow and believe it, and names the tempting fix it rejected.',
        result: 'Numbers for the bug, the cleanup and the safeguard, which proves the fix and the prevention both worked.',
        reflection: 'Names a debugging principle drawn from the story, logging the invariant at every boundary, short enough to remember.',
      },
    },
    {
      level: 'senior',
      lookFor:
        'A reliability problem across several services: failure modes ranked from real incidents, the mechanism explained precisely, and the change landed through shared code.',
      questionId: 'technical-depth-7',
      situation:
        "I was a staff engineer in the payments org of an online marketplace, which ran 14 services owned by five teams. Checkout availability was 99.5 percent against a target of 99.95, and every team believed the problem was in someone else's service.",
      task: 'I was asked to lead the reliability effort across all five teams without any of them reporting to me, and to get checkout to target within two quarters.',
      action:
        "I started from failure data instead of opinions. I read the postmortems and traces for all 38 checkout incidents in the previous six months and classified each by its first failing component and how it spread. The pattern was clear: 26 of the 38 were cascades, where one slow dependency, often the fraud check, caused callers to retry, and the retries tripled load until healthy services timed out too. The obvious fix, which two teams had already tried, was adding replicas; I showed from the traces that extra capacity only delayed the cascade by a few minutes, because retries grew faster than capacity. The real problem was that nothing bounded the total work a single checkout could create. I proposed two changes in the shared HTTP client library all 14 services used: every request carries a deadline from the original checkout call, so downstream services stop work nobody is waiting for, and each client gets a retry budget of 10 percent of its traffic instead of three retries per request. Because it lived in one library, the teams only had to upgrade, not redesign. I built the change with one engineer from the fraud team, rolled it out behind a flag one service at a time, and ran a load test that injected a slow fraud check before each step. I tried and dropped one idea along the way: circuit breakers on every call path caused false trips during deploys, so I kept them only on the fraud and tax calls. I presented the incident analysis at each team's planning meeting so the upgrade was on their roadmap, not a favor to me.",
      result:
        'Over two quarters checkout availability rose from 99.5 to 99.96 percent. Cascading incidents fell from 26 in six months to 3 in the next six, and the slow-fraud load test that used to take checkout down now drops only 0.4 percent of requests. Three other orgs adopted the client library defaults the following year.',
      reflection:
        "I learned that cross-team reliability work goes fastest when the fix lives in one shared place and the case for it is made from everyone's own incident data.",
      notes: {
        situation: 'Gives the scale, the gap to the target and the political problem, which sets up a staff-level story.',
        task: 'States the lack of authority and the deadline in one sentence.',
        action:
          'Ranks failure modes from 38 real incidents, explains why the obvious fix of adding replicas failed, describes the mechanism precisely, names what did not help, and lands the change through a shared library instead of five negotiations.',
        result: 'Availability, incident counts and a load test result before and after, plus adoption beyond the org.',
        reflection: 'A lesson about influence and leverage drawn from the story, which is what a senior answer should end on.',
      },
    },
  ],
  weak: [
    {
      questionId: 'technical-depth-6',
      situation:
        'I was on the team that owned our event ingestion pipeline, which took clickstream events from the web and mobile apps, put them on a queue, and wrote them into the warehouse for analytics. It was originally built as a prototype by an engineer who had since moved on, and it grew from a side project into something the whole analytics org depended on. Traffic grew steadily over a couple of years, and then marketing started a big campaign that brought in much more traffic than anyone expected. The dashboards started lagging, analysts were complaining in the channel, and there was a lot of pressure from leadership to get it sorted out quickly.',
      task: 'I was responsible for figuring out what was breaking and getting the pipeline caught up so the dashboards were current again.',
      action:
        'I found that the consumers were the first thing to break: they wrote to the warehouse a row at a time, so they could not keep up once the queue backed up. I changed them to write in batches, added more consumer instances, and set up an alert on queue lag so I would hear about it before the analysts did.',
      result:
        'After the batching change, the pipeline caught up and the dashboards were current again. The analysts stopped complaining, and things have been stable since.',
      reflection: 'I learned that a prototype that becomes critical needs to be treated like production code much earlier.',
      flaws: ['long-setup', 'no-result'],
      why: {
        'long-setup':
          'The history of the prototype and the marketing campaign take about twice as many words as the Action, the only part that shows how the candidate found and fixed the bottleneck.',
        'no-result':
          '"Caught up" and "stable" leave out the numbers the question invites: the lag before and after, and the throughput the batched consumers reached.',
      },
      fix: 'The setup would be one sentence: a prototype ingestion pipeline that fell six hours behind during a campaign that tripled traffic. The Action would show how the candidate proved the consumers were the bottleneck (warehouse write latency against queue depth) and why they chose the batch size they did, and the Result would say lag fell from six hours to under a minute at 40,000 events a second.',
    },
    {
      questionId: 'technical-depth-4',
      situation:
        'On our order service I proposed replacing the nightly reconciliation job with an event-sourced ledger, because the job kept producing mismatches.',
      task: 'I wrote the design doc and had to get it through the architecture review.',
      action:
        'I laid out a design based on event sourcing, with a stream of immutable events and projections for the different read models, which I felt was the modern, scalable approach. The review board rejected most of it. Honestly, I think they were not comfortable with the pattern and did not take the time to understand it, and one of the principals had built the old job and was protective of it. They wanted something simpler that fit the existing stack, so I reworked it into an improved version of the batch job with better checks. I made it more robust and cleaned up a lot of the logic.',
      result: 'The reworked job shipped about 2 months later than my original plan, and it works better than before.',
      reflection: 'I learned that review boards tend to prefer familiar designs, so next time I would socialize the idea earlier.',
      flaws: ['blame', 'vague'],
      why: {
        blame:
          'The rejection is explained by the reviewers not understanding and a principal protecting his old code, so the interviewer never hears which objection was right, the thing this question is designed to find out.',
        vague:
          '"Modern, scalable", "more robust" and "works better" never say what caused the mismatches, what the reviewers objected to, or what changed in the numbers, so the depth cannot be tested.',
      },
      fix: "The Action would state the reviewers' main objection in technical terms (event sourcing needed replay and schema versioning the team had never operated, to fix a problem caused by two jobs reading at different snapshots) and admit it was right. It would say what the final design changed, reading both sources at one snapshot, and give the result as mismatches falling from about 40 a night to 1.",
    },
  ],
};
