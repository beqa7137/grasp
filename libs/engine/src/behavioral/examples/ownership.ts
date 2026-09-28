import type { CompetencyExamples } from '../types.js';

export const OWNERSHIP: CompetencyExamples = {
  competencyId: 'ownership',
  strong: [
    {
      level: 'early',
      questionId: 'ownership-4',
      situation:
        'Eight months into my first job, on the data team of a food delivery company, I owned a nightly job that loaded restaurant orders into the warehouse. The finance dashboard that the operations managers read every morning was built on it.',
      task: 'I had renamed a column in the job to match a new naming convention and shipped it on a Thursday. What followed was my mistake to own, and so was the fix.',
      action:
        'On Monday an operations manager asked why weekend revenue showed as zero. I checked and saw that my rename had broken the dashboard query, which still read the old column, so three days of numbers were blank. I did not wait to be asked: I posted in the team channel within the hour that it was my change and gave an estimate for the fix. I restored the old column name as an alias so the dashboard worked at once, then backfilled the three missing days and checked the totals against the payments system to the cent. Then I asked myself why nobody, including me, noticed for three days. The job had succeeded, so no alert fired. I wrote a small check that fails the run when any table the dashboard reads loses a column or loads fewer than half the usual rows, and I asked my lead to review it. I also added a step to my own checklist: search the dashboard queries before renaming anything.',
      result:
        'The dashboard was correct again 3 hours after the report, with all three days backfilled. In the next six months the new check caught two more breaking changes from other engineers before any dashboard showed wrong numbers, and my lead added it to the template for every new warehouse job.',
      reflection:
        'I learned that a job that runs green can still be broken, so I now define what correct output looks like before I call something done.',
      notes: {
        situation: 'Sets up a small scope that fits a first job, and names who depended on the job so the stakes are real.',
        task: 'Takes responsibility in the first breath, without softening it, which is what "you dropped the ball" questions test.',
        action:
          'Owns the mistake publicly within the hour, fixes the symptom first, then asks why it went unnoticed and closes that gap. Every step is "I".',
        result: 'Time to fix plus a lasting effect (two later catches, a team template), which shows the fix outgrew the mistake.',
        reflection: 'Turns an embarrassing slip into a habit about defining correct output, which a junior can carry into every task.',
      },
    },
    {
      level: 'mid',
      questionId: 'ownership-6',
      situation:
        "Our monorepo's main CI pipeline ran about 4,000 integration tests on every merge, and a checkout test that timed out at random failed roughly one build in six. Engineers had learned to hit retry, which added about twenty minutes to every affected merge and hid real failures behind the noise.",
      task: 'Nobody owned the test, since the team that wrote it had been reorganized. I was on the developer tooling team, so I decided the health of the pipeline was mine to fix.',
      action:
        'First I pulled three months of CI logs into a spreadsheet instead of guessing, and found the failures clustered when two shards ran at the same time. Reading the test, I saw it reserved a fixed port on the shared runner, so two shards occasionally fought over it. I considered an automatic retry, a one-line change, but I rejected it because it would have kept hiding the collision and any real bug behind it. Instead I changed the test harness to ask the operating system for a free port and pass it through an environment variable. Before merging, I ran the suite 500 times in a scratch pipeline to prove the fix, and I asked the team that now owned checkout to review it so they understood the change. I also added a dashboard of flaky failures per test and a weekly alert for any test that failed and then passed on retry, so the next flaky test would get a name and an owner instead of a shrug.',
      result:
        'Flaky failures on main dropped from about 16 percent of builds to under 1 percent within two weeks. That removed about 180 retries a month, roughly 60 engineer hours, and the weekly alert caught four more flaky tests the next quarter, each fixed by its owning team.',
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
    {
      level: 'senior',
      questionId: 'ownership-7',
      situation:
        'I was a staff engineer on the platform group of a fintech company with about 300 engineers. Reading a cloud provider notice, I saw that the managed Postgres version under 41 of our databases would lose support in eleven months, after which the provider would upgrade them on its own schedule.',
      task: "Each database belonged to a product team, and no one tracked versions across them, so nobody saw the risk. I decided to own the outcome: every database upgraded on our schedule, not the provider's.",
      action:
        "I first made the risk concrete. I listed all 41 databases with their owners and sizes, and I tested a forced upgrade on a copy of our largest ledger database: it took 38 minutes of downtime and broke two extensions we relied on. I took that to the engineering directors with a one-page proposal, because I had no authority over the product teams' roadmaps and needed theirs. I asked for two days per team, not a big migration project. I wrote the runbook myself, with a blue-green upgrade that cut downtime to under a minute, and I ran the first three upgrades alongside their owners so the runbook was proven on real traffic. I set up a weekly tracker the directors could read at a glance, and when two teams slipped for launches, I paired a platform engineer with them instead of escalating. For the payments team, whose extension broke, I found and tested a replacement and wrote the change for them to review. Finally I made version drift a standing check: a monthly report of every database more than one major version behind.",
      result:
        'All 41 databases were upgraded six weeks before the deadline, with a total of 4 minutes of customer-facing downtime across them, against an estimated 9 hours, scaled from the 38-minute test by database size, if the provider had forced the upgrades. The monthly report has since started two more upgrade rounds, and each took teams under a day because the runbook already existed.',
      reflection:
        'I learned that at staff level, owning a risk means making it cheap for other teams to act on it, not only being the one who noticed it.',
      notes: {
        situation: 'One number (41 databases) and one date (eleven months) show a risk that spans the whole company.',
        task: 'Explains why nobody saw it, then defines ownership as an outcome ("on our schedule"), not a task.',
        action:
          'Makes the risk concrete with a test, wins directors without formal authority, and lowers the cost for every team: a runbook, paired help and a fix written for them. The monthly check keeps owning it after the deadline.',
        result: 'Compares actual downtime with the estimated cost of doing nothing, and shows the process outlasted the project.',
        reflection: 'States what ownership means at senior scope, which is exactly the bar the interviewer is calibrating.',
      },
    },
  ],
  weak: [
    {
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
    {
      questionId: 'ownership-1',
      situation:
        "This was at an online learning company, where I was a backend engineer on the courses team. The company had grown quickly, from about 20 engineers to about 90 in two years, and a lot of the early tooling had not kept up. There were three frontend teams, a design team that had recently been split in two, and a web platform team that was supposed to own shared components but was mostly busy with a framework upgrade. The shared video player component had been written years before by someone who had since left, and every team had copied it and changed it a little, so there were four versions in the codebase. Accessibility had come up in a few planning meetings, and a large university customer had mentioned it during their renewal, but it was never on anyone's roadmap.",
      task: 'None of this was my job as a backend engineer, but a support ticket from a blind student who could not pause a video landed with my team, and I wanted it solved.',
      action: 'I added keyboard controls and screen reader labels to one shared version of the player, and I moved the four teams onto it.',
      result: 'The player went from 23 accessibility audit failures to 0, and the university renewed its contract.',
      reflection: 'It went well.',
      flaws: ['long-setup', 'no-reflection'],
      why: {
        'long-setup':
          'The company growth, the team structure and the history of the player fill most of the answer, while the actual work, moving four teams onto one player, gets a single sentence.',
        'no-reflection': '"It went well" says nothing learned, so the interviewer has to ask the most common follow-up themselves.',
      },
      fix: 'The setup would shrink to two sentences: four copies of an inaccessible video player, and a blind student who could not pause a lecture. The Action would explain how a backend engineer got four frontend teams to adopt one player, and the answer would close with a lesson such as fixing the shared component, not the copies.',
    },
  ],
};
