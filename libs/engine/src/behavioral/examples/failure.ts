import type { CompetencyExamples } from '../types.js';

export const FAILURE: CompetencyExamples = {
  competencyId: 'failure',
  strong: [
    {
      level: 'early',
      lookFor:
        'A real mistake in your own work, its cost stated plainly, the reasoning that led to it, and a specific change in how you work that paid off on the next piece of work.',
      questionId: 'failure-5',
      situation:
        'Six months after I joined a bank as a new graduate, working on its web dashboard, my tech lead told me in a one-on-one that my pull requests were so large that reviewing them was slowing the whole team down.',
      task: 'I had to decide whether the feedback was fair and, if it was, change how I delivered work without slowing down my own features.',
      action:
        'My first reaction was defensive: I said the features were big, so the pull requests had to be. I went home annoyed, and the next morning I checked instead of arguing. My last ten pull requests averaged about 900 lines, and the median wait for a first review was three days, against less than a day for the rest of the team. I also saw two of them had shipped bugs that the reviewers told me they had skimmed past. So I went back to my lead, said she was right, and asked her to show me how she split work. I started opening a draft pull request on the first day of each task with only the plan, then broke features into stacked changes of under 300 lines: types and API client first, then the component, then wiring and tests. I added a short description template listing what to review closely and what was mechanical. After a month I asked her and two reviewers whether it was actually easier, and adjusted the template from their answers.',
      result:
        'Over the next quarter my median pull request dropped to about 250 lines and my median time to first review fell from three days to under 5 hours. The next feature I built, a transactions filter, shipped as seven small changes with no bugs found after release.',
      reflection:
        'I learned that my first response to criticism is to defend myself, so now I thank the person, wait a day, and look for evidence before I decide whether they are right.',
      notes: {
        situation: 'A realistic junior failure with a team-sized cost, told through the feedback that exposed it.',
        task: 'Frames the real choice, whether to accept the feedback, which is what the question is testing.',
        action:
          'Admits the defensive first reaction honestly, then checks the claim with data before changing anything. The concrete habits and the follow-up with reviewers show the change was deliberate, not a vague promise.',
        result: 'Measures the change in review time and shows it paying off on the next feature.',
        reflection: 'Names a personal habit for receiving criticism, not just the lesson about pull request size.',
      },
    },
    {
      level: 'mid',
      lookFor:
        'A mistake that reached production, owned in your first words, with most of the answer spent on fixing the system rather than on the apology.',
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
    {
      level: 'senior',
      lookFor:
        'A wrong call of yours that cost several teams: the untested assumption named as the root cause, then fixes from the instance to the system to how decisions get made.',
      questionId: 'failure-7',
      situation:
        'As the staff engineer for machine learning infrastructure at an online real estate marketplace, I made the call to build our own feature store on Cassandra instead of adopting an existing one, for six ML teams serving listing search and price estimates.',
      task: 'The decision was mine, so when it went badly my job was to own it publicly, get the teams onto something that worked, and change how we make build-or-buy decisions.',
      action:
        'My reasoning at the time was that no existing store could meet our 10 millisecond lookup budget. I never prototyped the alternatives to test that; I assumed it. Fourteen months and five engineers in, a mismatch between how our batch pipeline and our online path computed the same feature, which existing stores prevent by defining each feature once for both paths, silently degraded the search ranking model, and contact requests to agents fell 4 percent for three weeks before anyone caught it. I wrote the retrospective myself and said plainly that the root cause was my decision to build without testing the alternatives, not the engineer who wrote the bug. Then I did the prototype I had skipped: I benchmarked an open-source feature store with a Redis online tier against our real traffic, and it met the budget with room to spare. I proposed migrating, planned it team by team so no model lost its features mid-quarter, and built a nightly job that compares online and offline values for every feature and pages when they drift. Finally, I wrote a decision template for our org that requires a working prototype of the buy option before any platform build larger than a quarter of effort.',
      result:
        'The migration took five months, feature store pages fell from about 12 a month to 2, and three engineers moved back to model work. The drift check has caught four skew bugs before they reached users, and the template has been used for nine decisions, two of which chose to buy after the prototype.',
      reflection:
        'I learned that seniority makes untested assumptions more expensive, not less, so I now ask what evidence would change my mind and go get it before I commit a team.',
      notes: {
        situation: 'A senior-sized mistake: an architecture call that shaped six teams, with the candidate as the decision maker.',
        task: 'Owns the decision and lays out the three jobs that follow: accountability, recovery and prevention.',
        action:
          'Explains the flawed reasoning, an assumption never tested, and names it as the root cause instead of the engineer who wrote the bug. The fixes go from the instance to the system to the org: migration, drift check and a decision template.',
        result: 'Counts the recovery and shows both safeguards working afterward with numbers.',
        reflection: 'Connects the lesson to seniority itself, which is the systemic insight a staff-level failure answer needs.',
      },
    },
  ],
  weak: [
    {
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
    {
      questionId: 'failure-4',
      situation:
        'I was on the web team of a spreadsheet app, working on real-time co-editing so several people could edit a sheet at once.',
      task: 'We were building the sync engine for co-editing and the conflict handling, and it was supposed to launch at the end of the year as the headline feature.',
      action:
        'We spent the first few months designing the data model and we decided to use a custom merge approach for conflicting edits. We built a prototype on iOS first and then we started porting it to Android. Our testing kept finding edge cases with the same cell edited by two people at once, so we kept adding special cases, and we pushed the launch back twice. I worked on some of the Android storage code. In the end leadership decided we were taking too long and canceled the project so our team could move to a collaboration feature instead.',
      result: 'The project was canceled after about 9 months, and roughly 40 percent of the sync code was never used.',
      reflection: 'It was a frustrating time for everyone.',
      flaws: ['we-not-i', 'no-reflection'],
      why: {
        'we-not-i':
          'The Action says "we" throughout and "I" once, for "some of the Android storage code", so the interviewer cannot tell which decisions, if any, the candidate made or questioned.',
        'no-reflection':
          'Ending on how frustrating it felt skips the lesson the question is really after: whether the cancellation could have been seen coming, and what the candidate does differently now.',
      },
      fix: 'The Action would name the candidate\'s own part: "I owned conflict handling, and I kept adding special cases for two months instead of saying the custom merge approach was not converging." The reflection would say what changed: "Now I set a checkpoint on risky designs, and if the edge cases are still growing by then, I raise it and propose an off-the-shelf approach."',
    },
  ],
};
