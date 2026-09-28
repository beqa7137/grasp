import type { CompetencyExamples } from './types.js';

export const EXAMPLES: readonly CompetencyExamples[] = [
  {
    competencyId: 'ownership',
    strong: {
      questionId: 'ownership-6',
      situation:
        "Our monorepo's main CI pipeline ran about 4,000 integration tests on every merge, and a checkout test that timed out at random failed roughly one build in six. Engineers had learned to hit retry, which added about twenty minutes to every affected merge and hid real failures behind the noise.",
      task: 'Nobody owned the test, since the team that wrote it had been reorganized. I was on the developer tooling team, so I decided the health of the pipeline was mine to fix.',
      action:
        'First I pulled three months of CI logs into a spreadsheet instead of guessing, and found the failures clustered when two shards ran at the same time. Reading the test, I saw it reserved a fixed port on the shared runner, so two shards occasionally fought over it. I considered an automatic retry, a one-line change, but I rejected it because it would have kept hiding the collision and any real bug behind it. Instead I changed the test harness to ask the operating system for a free port and pass it through an environment variable. Before merging, I ran the suite 500 times in a scratch pipeline to prove the fix, and I asked the team that now owned checkout to review it so they understood the change. I also added a dashboard of flaky failures per test and a weekly alert for any test that failed and then passed on retry, so the next flaky test would get a name and an owner instead of a shrug.',
      result:
        'Flaky failures on main dropped from about 16 percent of builds to under 1 percent within two weeks. Retried merges fell from about one in six to fewer than one in a hundred, saving roughly 60 engineer hours a month, and the weekly alert caught four more flaky tests the next quarter, each fixed by its owning team.',
      reflection:
        'I learned that a tolerated annoyance usually has a boring root cause, and that measuring it first is what gets people to care.',
      notes: {
        situation:
          'Puts a number on the pain (one build in six, twenty minutes for every affected merge), so the listener feels why it mattered in two sentences.',
        task: 'Says plainly that nobody owned it and why the candidate chose to, which is exactly what an ownership question probes.',
        action:
          'Every step is "I" with its reason, and it names the tempting shortcut (an automatic retry) and why it was rejected. The dashboard and alert show thinking past the single fix.',
        result: 'Before and after numbers, plus a second-order effect (four more flaky tests found) that proves the fix lasted.',
        reflection: 'Names the habit of measuring a tolerated annoyance before fixing it, a lesson that carries to other problems.',
      },
    },
    weak: {
      questionId: 'ownership-2',
      situation:
        "Our mobile app relied on the identity team's login service, and for about a month users were getting logged out randomly, especially on Android.",
      task: 'Our team was getting the support tickets, so we needed to figure out what was going on and get it fixed.',
      action:
        'We started by looking through our crash logs and the support tickets to see if there was a pattern. We noticed the logouts happened when the refresh token expired while the app was in the background. We reached out to the identity team and set up a meeting to walk them through what we were seeing. They agreed it was on their side, so we worked with them on a fix to how tokens were refreshed, and in the meantime we added a retry on our side so the app would try to refresh again before logging anyone out. We kept an eye on things after the fix went out.',
      result:
        'After the fix went out, the logout complaints mostly went away and the identity team was happy with how we handled it. Support stopped escalating it to us.',
      reflection: 'I learned that it really helps to reach out to other teams directly instead of just filing tickets.',
      flaws: ['we-not-i', 'no-result'],
      why: {
        'we-not-i':
          'Every step of the Action starts with "we", so the interviewer cannot tell who spotted the token pattern or who got the identity team to act.',
        'no-result': '"Mostly went away" has no number, so there is no telling whether the fix helped nearly every user or only some.',
      },
      fix: 'The Action would say "I matched the logouts to background token refresh" and "I set up the meeting with the identity team\'s lead", keeping "we" only for work that was truly shared. The Result would give numbers: logout tickets fell from about 40 a week to 2, and average Android session length recovered within a week.',
    },
  },
  {
    competencyId: 'delivery',
    strong: {
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
    weak: {
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
  },
  {
    competencyId: 'ambiguity',
    strong: {
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
    weak: {
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
  },
  {
    competencyId: 'conflict',
    strong: {
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
    weak: {
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
  },
  {
    competencyId: 'influence',
    strong: {
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
    weak: {
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
  },
  {
    competencyId: 'failure',
    strong: {
      questionId: 'failure-2',
      situation:
        'I was on the accounts team of a subscription platform with about two million users, and I wrote a database migration that added a required column with a default value to the users table.',
      task: 'It was my change and my deploy, so once it went wrong my job was to restore service, explain what happened, and make sure it could not happen again.',
      action:
        "The migration looked harmless in review, but on our version of Postgres that default rewrote the entire table while holding a lock, and logins began timing out about a minute after the deploy. I recognized the lock pattern on the database dashboard, said in the incident channel that my migration was the likely cause, and canceled it instead of waiting, since I could not predict how long the rewrite would take on production data. Logins recovered as soon as the lock released. I wrote the postmortem myself and was specific that the root cause was my assumption, not a reviewer's miss: I had tested only against a staging table with a few thousand rows. I redid the change in three steps: add the column as nullable, backfill it in batches of 10,000 rows, then add the NOT NULL rule as a check constraint marked NOT VALID and validate it separately, which does not block reads or writes. The bigger fix was the process. I added a check to our migration linter that flags table rewrites and long locks, and I built a nightly job that restores a sanitized, production-sized snapshot to staging, so migrations are tested at real scale.",
      result:
        'The outage lasted 14 minutes and blocked about 30,000 login attempts. The three-step migration ran the next day with no impact, and over the following year the linter flagged seven risky migrations from other teams before they shipped.',
      reflection:
        'I learned that small test data hides the failures that only happen at scale, so I now ask how big the table is before I ask whether the migration is correct.',
      notes: {
        situation: 'Gives the scale up front, because scale is what made a harmless change dangerous.',
        task: 'Owns the mistake in the first words ("my change and my deploy") with no hedging.',
        action:
          'Takes responsibility out loud during and after the incident, explains why canceling beat waiting, and spends most of its time on the systemic fix rather than the apology.',
        result: "Counts the damage honestly, then shows the fix preventing other teams' mistakes.",
        reflection:
          'Names the habit that changed, asking how big the table is before judging a migration, which is what a failure question is really asking for.',
      },
    },
    weak: {
      questionId: 'failure-6',
      situation:
        'This was on the billing team. We had a pretty complicated setup where invoices were generated by a batch job that ran overnight, pulled usage from three different services, and then applied discounts from a pricing service another team owned. The code was old, the original authors had left, and there was almost no documentation, so everybody was a little afraid to touch it. A newer engineer on my team had been asked to add support for annual discounts, and the pull request was large, around 1,500 lines, because they had also refactored a lot of things along the way.',
      task: 'I was one of two reviewers on the pull request, and I was supposed to check the discount logic before it went out with the monthly billing run.',
      action:
        'I reviewed it, but honestly the author should never have mixed a refactor with a feature change, and the other reviewer approved it without really reading it. I focused on the parts I understood and left some comments on naming. I missed that the discount was being applied twice for annual customers. After it went out, I helped track down the bug and wrote the fix.',
      result: 'About 300 customers were overcharged in the first run, and finance had to issue refunds over the next two weeks.',
      reflection: 'I learned that big pull requests are dangerous and people need to split them up before asking for review.',
      flaws: ['long-setup', 'blame'],
      why: {
        'long-setup':
          'The batch job, the missing documentation and the size of the pull request take more words than everything the candidate did, and the miss itself gets a single sentence.',
        blame:
          'The author "should never" have mixed the changes and the other reviewer did not "really read it", although the question asks what the candidate missed; even the lesson is about what other people should do.',
      },
      fix: 'The setup would be two sentences: a 1,500-line pull request touching invoice discounts, with the candidate as the reviewer responsible for that logic. The Action would own the miss ("I skimmed the discount path because I did not understand it, and I did not say so") and describe what the candidate changed, such as asking for large changes to be split and writing a test for every discount type before approving.',
    },
  },
  {
    competencyId: 'customer',
    strong: {
      questionId: 'customer-7',
      situation:
        'I worked on site search for a marketplace of used industrial equipment. A large buyer, the procurement manager at a construction firm, complained that searching by part number returned nothing useful, and the firm was considering moving its orders elsewhere.',
      task: 'The account manager asked me to talk to the buyer directly, find out what was going wrong, and fix it if the problem was in search.',
      action:
        'I set up a screen share with the buyer instead of reading the ticket secondhand, and asked them to run the searches they did every day. Within ten minutes I saw the pattern: they typed part numbers with dashes and spaces exactly as printed on the equipment, like 4R-7 225, while sellers listed them as 4R7225. Our tokenizer split on dashes and spaces, so the pieces matched thousands of unrelated listings. I asked for a list of 50 part numbers they had failed to find and turned it into a test set before changing anything. I added a normalized part number field that strips punctuation and whitespace at index time and at query time for tokens that look like part numbers, and boosted exact matches on it. I considered fuzzy matching on part numbers, but I decided against it, because a near match on a hydraulic part is a wrong part, and a wrong order is worse than no result. I shipped it behind a flag, reran the 50 queries, and joined a second call so the buyer could try it before I rolled it out to everyone.',
      result:
        "Of the buyer's 50 failed searches, 47 now returned the right part first. Across the site, searches containing a part number that ended with no click fell from 38 percent to 12 percent, and the firm kept its orders with us.",
      reflection: 'Watching a user search for ten minutes taught me more than a week of query logs, so I now ask for a screen share early.',
      notes: {
        situation: 'Says who the user is and what the business stood to lose.',
        task: 'Short and specific: talk to the user, diagnose, fix. It leaves the space for the Action.',
        action:
          "Shows the candidate going to the user rather than the logs, building a test set from their real failures, and rejecting fuzzy matching for a reason rooted in the customer's domain.",
        result: 'Numbers for the one customer and for everyone, plus the business outcome that started the story.',
        reflection: 'Names the practice the candidate adopted, asking for a screen share early, which makes the lesson believable.',
      },
    },
    weak: {
      questionId: 'customer-5',
      situation:
        'We launched a redesigned onboarding flow for our budgeting app, and I wanted to make sure it was actually helping users get set up.',
      task: 'My goal was to check whether the new flow was better for users, not just whether it shipped on time.',
      action:
        'I looked at the data after launch and talked to some of the product folks about what they were seeing. I also read through a lot of the feedback that came in from users and the app store reviews. I set up some tracking so we could see how people were moving through the flow, and I shared what I found with the team so we could keep iterating on it. I made a few tweaks based on what I learned.',
      result:
        'Overall, users seemed to respond well to the new onboarding, and the feedback was a lot more positive than before. The team felt good about the direction.',
      reflection: 'I learned that it is important to look at the data after launching, not just ship and move on.',
      flaws: ['no-result', 'vague'],
      why: {
        'no-result':
          'The question asks whether users were better off, and "seemed to respond well" is the whole answer, with no completion rate, retention or ticket count.',
        vague: '"Looked at the data", "some tracking" and "a few tweaks" never say which metric, which step of the flow, or what changed.',
      },
      fix: 'The Action would name the measure and the finding: "I added step-level events and found 30 percent of users quit at the bank linking step, so I moved it after the budget setup and made it skippable." The Result would compare setup completion before and after, say from 41 percent to 63 percent, and note whether those users were still active a month later.',
    },
  },
  {
    competencyId: 'leadership',
    strong: {
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
    weak: {
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
  },
  {
    competencyId: 'tradeoffs',
    strong: {
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
    weak: {
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
  },
  {
    competencyId: 'technical-depth',
    strong: {
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
    weak: {
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
  },
];

export function examplesFor(competencyId: string): CompetencyExamples | undefined {
  return EXAMPLES.find((e) => e.competencyId === competencyId);
}
