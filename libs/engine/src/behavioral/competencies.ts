import type { BehavioralQuestion, Competency } from './types.js';

type QuestionEntry = [prompt: string, probes: string, followUps: [string, string, string]];

const questions = (competencyId: string, entries: QuestionEntry[]): BehavioralQuestion[] =>
  entries.map(([prompt, probes, followUps], i) => ({ id: `${competencyId}-${i + 1}`, competencyId, prompt, probes, followUps }));

export const COMPETENCIES: readonly Competency[] = [
  {
    id: 'ownership',
    why: 'Interviewers ask this to see if you act on problems nobody assigned you. A junior owns a task end to end; a senior owns an outcome across teams and keeps owning it after launch.',
    strongSignals: [
      'Names a problem outside their assigned work and says why they picked it up.',
      'Describes the concrete steps they took, not what the team did in general.',
      'Follows through after launch: monitoring, fixing the follow-up bugs, handing off cleanly.',
      'Says what they set aside to make room, who agreed to it, and why it was worth it.',
      'Ties the result to a number: fewer pages, hours saved, a metric that moved.',
    ],
    redFlags: [
      'Says "we" throughout, so you cannot tell what they did themselves.',
      'Blames another team for the problem and stops there.',
      'Describes a task their manager assigned and calls it ownership.',
      "Took over someone else's work without telling them or their manager.",
      'Ends the story at launch, with no word on whether it worked.',
    ],
    questions: questions('ownership', [
      [
        'Tell me about a time you took on a problem that was outside your job description.',
        'Whether you notice gaps nobody owns and act on them instead of waiting.',
        [
          'Why did nobody else own it already?',
          'How did you make time for it alongside your own work?',
          'Who did you tell before you started, and how did they react?',
        ],
      ],
      [
        "Describe a time a problem in another team's system was hurting your users. What did you do?",
        'Whether you push across team lines respectfully, rather than filing a ticket and walking away.',
        [
          'How did you get the other team to prioritize it?',
          'What did you do for your users while the fix was pending?',
          'Would you handle the handoff the same way next time?',
        ],
      ],
      [
        'Tell me about something you built that you kept improving long after it shipped.',
        'Whether you own outcomes over time, not just the launch date.',
        [
          'How did you know it needed more work after launch?',
          'What did you decide to stop investing in, and when?',
          'Who owns it today, and how did it get to them?',
        ],
      ],
      [
        'Tell me about a time you dropped the ball on something you owned.',
        'Whether you take responsibility plainly when the outcome was bad and your part in it was real.',
        [
          'When did you first realize it was slipping?',
          'What did you tell the people depending on you?',
          'What did you put in place so it would not happen again?',
        ],
      ],
      [
        'Describe a time you had to decide whether to fix something yourself or escalate it.',
        'Your judgment on when ownership means doing the work and when it means raising it with the right people.',
        [
          'What made you choose that path over the other one?',
          'What would have happened if you had waited a week?',
          'How did the person you escalated to respond?',
        ],
      ],
      [
        'Tell me about a recurring issue, like a flaky test or a noisy alert, that everyone tolerated until you fixed it.',
        'Whether you remove chronic pain that others have learned to live with.',
        [
          'How much time was it costing the team before you fixed it?',
          'Why had nobody fixed it before?',
          'How did you make sure it stayed fixed?',
        ],
      ],
      [
        'Tell me about a time you noticed a risk nobody else was worried about.',
        "Whether you act on risks early, before they become someone else's incident.",
        ['What tipped you off?', 'How did you get others to take it seriously?', 'What would have happened otherwise?'],
      ],
    ]),
  },
  {
    id: 'delivery',
    why: 'This checks whether you ship what you commit to, and what you do when the plan breaks. A junior finishes a scoped task; a senior cuts scope, manages dependencies and warns people early.',
    strongSignals: [
      'States the deadline, what drove it, and what was at stake if it slipped.',
      'Names the scope they cut or deferred to land on time, and who agreed to it.',
      'Raised the risk early, with a date and a fallback, not on the day of the deadline.',
      'Describes how they unblocked a dependency instead of waiting on it.',
      'Reports the result with a number: date hit, adoption, revenue or latency.',
    ],
    redFlags: [
      'Hit the date by quietly skipping tests, then shipped a regression.',
      'Only mentions long hours as the way they delivered.',
      'Surprised stakeholders with a slip on or after the due date.',
      'Cannot say what happened after the work shipped.',
      'Picks a story with no real pressure, so nothing had to be traded off.',
    ],
    questions: questions('delivery', [
      [
        'Tell me about a time you delivered a project under a tight deadline.',
        'How you plan, cut scope and keep quality when time is short.',
        [
          'What did you leave out to make the date?',
          'How did you decide what was safe to cut?',
          'What happened to the deferred work afterward?',
        ],
      ],
      [
        'Describe a project that slipped. When did you know, and what did you do?',
        'Whether you surface bad news early and come with options, not just a new date.',
        ['Who did you tell first, and how?', 'What options did you offer them?', 'Looking back, what early sign did you miss?'],
      ],
      [
        'What is the most important thing you shipped in the last year?',
        'Your sense of impact, and whether you can describe your own part in it.',
        [
          'Why did this matter more than the other things you worked on?',
          'What part would not have happened without you?',
          'How did you measure whether it worked?',
        ],
      ],
      [
        'Tell me about a time a dependency on another team put your delivery at risk.',
        'Whether you manage dependencies actively rather than waiting and blaming.',
        [
          'When did you first engage the other team?',
          'What did you build or change to reduce the dependency?',
          'How did the final date compare with the original one?',
        ],
      ],
      [
        'Describe a time you had to choose between shipping on time and shipping with the quality you wanted.',
        'Your judgment on the quality bar, and whether you own the consequences of the call.',
        ['What quality risk did you accept, exactly?', 'What was your plan if that risk hit users?', 'Would you make the same call again?'],
      ],
      [
        'Tell me about a large project you broke into milestones. How did you choose what came first?',
        'Whether you plan in milestones that reduce risk and give stakeholders something real to see.',
        [
          'What did stakeholders get to see at the first milestone?',
          'How did you track progress against the plan?',
          'When did the plan change, and what did you do?',
        ],
      ],
      [
        'Tell me about a high-severity incident you helped resolve while on call.',
        'How you act under pressure in an incident, and whether you fix what caused it afterward.',
        ['What did you do in the first ten minutes?', 'How did you keep stakeholders informed?', 'What changed after the postmortem?'],
      ],
    ]),
  },
  {
    id: 'ambiguity',
    why: 'This tests whether you move forward when nobody hands you a spec. Level shows in how much ambiguity you absorb: a junior clarifies a task, a senior defines the problem and aligns others on it.',
    strongSignals: [
      'Explains what was unclear: the goal, the users, the owner or the constraints.',
      'Names the questions they asked, and who they asked, to shrink the unknowns.',
      'Made a reversible call to start moving, and said what would make them change it.',
      'Wrote down the plan and its assumptions and shared them for pushback.',
      'Shows how the direction changed as they learned more, and why.',
    ],
    redFlags: [
      'Waited for someone else to clarify before doing anything.',
      'Picked a direction alone and never checked it with the people affected.',
      'Describes a problem that was actually well defined.',
      'Cannot say which assumptions turned out to be wrong.',
      'Treats every unknown as needing a full investigation before any action.',
    ],
    questions: questions('ambiguity', [
      [
        'Tell me about a time you had to make progress without clear requirements.',
        'Whether you turn a vague ask into a concrete plan without waiting to be told.',
        [
          'What was the first thing you did to reduce the uncertainty?',
          'Which assumption turned out to be wrong?',
          'How did you know you had enough clarity to start?',
        ],
      ],
      [
        'Describe a project where the goal changed partway through. How did you handle it?',
        "How you adapt to a shifting goal without losing the work already done or the team's morale.",
        [
          'How much of the earlier work did you keep?',
          'How did you explain the change to your team?',
          'What would you do at the start next time to limit the churn?',
        ],
      ],
      [
        'Tell me about a time you had to make a decision with incomplete data.',
        'Whether you weigh the cost of waiting against the cost of being wrong.',
        [
          'What data did you wish you had?',
          'Could you reverse the decision, and how did that shape it?',
          'How did it turn out, and what did it teach you about your judgment?',
        ],
      ],
      [
        'Tell me about a time you had to pick a direction before the data could settle it.',
        'Whether you commit to a direction under real uncertainty and bring others along with it.',
        [
          'What options were you choosing between?',
          'How did you get others to back a call the data could not prove?',
          'What would have made you change course?',
        ],
      ],
      [
        'Tell me about a time a stakeholder asked for a specific solution and the real problem turned out to be different.',
        'Whether you dig for the underlying need instead of building the literal request.',
        [
          'What did you build in the end?',
          'What questions did you ask to find the real need?',
          'How did you handle it when they held on to the original request?',
        ],
      ],
      [
        'Tell me about a time you went in the wrong direction because the problem was unclear.',
        'Whether you notice a wrong turn quickly and are honest about it.',
        ['How long did it take you to notice?', 'What did the wrong turn cost the project?', 'What signal would have told you sooner?'],
      ],
      [
        'Tell me about a time you joined an unfamiliar codebase or domain and had to contribute fast.',
        'How you get oriented quickly on unfamiliar ground and start contributing safely.',
        ['What did you do in the first week?', 'Who did you lean on?', 'What did you misunderstand at first?'],
      ],
    ]),
  },
  {
    id: 'conflict',
    why: "This checks whether you can disagree without damaging the relationship, then commit once a decision is made. Committees want arguments grounded in data. At senior levels they expect real stakes, such as a disagreement with a manager or another team's lead.",
    strongSignals: [
      "States the disagreement fairly, including the other person's strongest argument.",
      'Brought data, a prototype or an experiment instead of repeating their opinion louder.',
      'Talked to the person directly and privately before involving anyone else.',
      'Committed fully once the decision went against them, and says what that looked like.',
      'The working relationship was intact or better afterward, with an example.',
    ],
    redFlags: [
      'Paints the other person as unreasonable or incompetent.',
      'Tells it so they were plainly right and the other side had no real point.',
      "Went over the person's head as a first move.",
      'Kept relitigating the decision after it was made.',
      'Picks a trivial disagreement, like code style, to avoid a real one.',
    ],
    questions: questions('conflict', [
      [
        'Tell me about a time you disagreed with a teammate on a technical decision.',
        'Whether you argue on evidence and keep the relationship working.',
        [
          'What was the strongest point on their side?',
          'What evidence changed minds, or failed to?',
          'How is your relationship with them now?',
        ],
      ],
      [
        'Describe a time you disagreed with your manager.',
        'Whether you push back upward with respect and accept the call when it is theirs to make.',
        [
          'How did you raise it, and in what setting?',
          'What did your manager say that you had not considered?',
          'What did you do once the decision was final?',
        ],
      ],
      [
        'Tell me about a time you committed to a decision you disagreed with.',
        'Whether you can disagree and then commit fully, without quiet resistance.',
        [
          'What did committing look like in practice?',
          'Did the outcome change your view?',
          'Is there a point where you would not have committed?',
        ],
      ],
      [
        'Describe a conflict between two people on your team that you helped resolve.',
        'Whether you can mediate fairly and point people back at the shared goal.',
        [
          'How did you stay neutral between them?',
          'What was the root of the conflict, beyond the surface issue?',
          'How did you know it was really resolved?',
        ],
      ],
      [
        'Tell me about a conflict with a senior leader on another team.',
        'Whether you handle a power gap without folding or going around people.',
        [
          'What did they care about that you did not at first?',
          'Who else did you bring in, and when?',
          'Where does the relationship stand now?',
        ],
      ],
      [
        'Tell me about a disagreement you lost, where you later realized the other side was right.',
        'Intellectual honesty, and whether you can update your view without ego getting in the way.',
        ['What made you realize they were right?', 'Did you tell them?', 'How has it changed the way you argue now?'],
      ],
      [
        'Tell me about a time you pushed back on a deadline or scope your manager set.',
        'Whether you push back upward with data and alternatives, not just complaints.',
        ['What data did you bring?', 'What alternative did you offer?', 'What was decided?'],
      ],
    ]),
  },
  {
    id: 'influence',
    why: 'This tests whether you can change what people do when you cannot tell them to. It is a core senior signal: the bigger the group you moved, and the less authority you had, the higher the scope.',
    strongSignals: [
      'Starts from what the other team cared about, not from what the candidate needed from them.',
      'Built the case with evidence: a prototype, a cost estimate, user data or an incident.',
      'Won over one or two key people first and let them carry the message.',
      'Changed their own proposal based on pushback, and says what changed.',
      'Names the concrete change: a roadmap item, a standard adopted, a migration done.',
    ],
    redFlags: [
      'Escalated to a manager to force the outcome and calls that influence.',
      'Describes persuading people who already reported to them.',
      'Treats resistance as the other side being wrong rather than having different goals.',
      'Got verbal agreement but cannot say what actually changed.',
      'Never adjusted the idea in response to feedback.',
    ],
    questions: questions('influence', [
      [
        'Tell me about a time you convinced another team to change their plans.',
        'Whether you move people with competing priorities through their incentives, not pressure.',
        [
          'What did that team gain from saying yes?',
          'Who was the hardest person to convince, and why?',
          'Did you have to give anything up to get a yes?',
        ],
      ],
      [
        'Describe a time you drove adoption of a new tool, practice or standard across teams.',
        'Whether you can make a change stick beyond your own team.',
        ['How did you pick the first teams to adopt it?', 'How did you measure adoption?', 'What did you do about the teams that refused?'],
      ],
      [
        'Tell me about a time you tried to influence a decision and failed.',
        'Whether you learn from losing, and read people and timing better afterward.',
        ['Why do you think it did not land?', 'What would you change about the pitch?', 'Did the decision change later on?'],
      ],
      [
        'Tell me about a time you pitched an idea to someone much more senior who was skeptical.',
        'Whether you build credibility and frame an idea so a skeptical senior audience takes it seriously.',
        ['What made them skeptical?', 'How did you prepare for that conversation?', 'Where did they land in the end?'],
      ],
      [
        'Describe a time you had to get buy-in for work with no immediate payoff, like paying down tech debt.',
        'Whether you can translate an engineering need into business terms that others will fund.',
        [
          'How did you put a cost on doing nothing?',
          'What did you have to promise in exchange?',
          'Did the payoff show up, and did you report it back?',
        ],
      ],
      [
        'Tell me about a time you changed your own position after listening to the people you were trying to persuade.',
        'Whether influence runs both ways for you, or you only broadcast.',
        [
          'What did they know that you did not?',
          'How did you explain the change to your own team?',
          'Was the final plan better, and how do you know?',
        ],
      ],
      [
        'Tell me about a technical direction you set that other teams adopted.',
        'Whether your technical judgment shapes how work gets done beyond your own team.',
        ['How did you write it up?', 'Who objected?', 'How many teams follow it today?'],
      ],
    ]),
  },
  {
    id: 'failure',
    why: 'This tests self-awareness and whether you learn from mistakes. Committees want a real mistake with a real cost, clearly owned; the higher the level, the bigger the stakes and the more systemic the fix.',
    strongSignals: [
      'Picks a genuine mistake that was their own, not a disguised strength.',
      'States the cost plainly: downtime, lost users, wasted weeks or a missed launch.',
      'Explains the reasoning that led to the mistake, not just what happened.',
      'Describes a change to how they work, and a later time it helped.',
      'Fixed the process or the system, not just the one instance.',
    ],
    redFlags: [
      'Offers a humblebrag, such as working too hard or caring too much.',
      'Blames circumstances, other teams or unclear requirements for the whole outcome.',
      'Chooses a failure with no real consequences.',
      'Gives a vague lesson, like "communicate more", with no specific change.',
      'Gets defensive or evasive when asked about their own part.',
    ],
    questions: questions('failure', [
      [
        'Tell me about a time you failed.',
        'Whether you own a real mistake and can say concretely what you changed.',
        ['What was your part in it, specifically?', 'How did you find out it had gone wrong?', 'When did the lesson help you later?'],
      ],
      [
        'Describe a production incident you caused. What happened next?',
        'How you respond under pressure, and whether you fix the system that let the mistake through.',
        [
          'How long did it take to mitigate, and how?',
          'What did the review find as the root cause?',
          'What guardrail exists now that did not before?',
        ],
      ],
      [
        'Tell me about a decision you made that turned out to be wrong.',
        'Whether you can separate a bad outcome from a bad decision, and learn from the reasoning.',
        ['With what you knew then, was it still a reasonable call?', 'When did you realize it was wrong?', 'How did you unwind it?'],
      ],
      [
        'Tell me about a project you worked on that got cancelled or never shipped.',
        'Whether you can reflect on wasted effort without bitterness and take something from it.',
        [
          'Could you have seen the cancellation coming earlier?',
          'What from that work was reused?',
          'How did you keep the team motivated at the end?',
        ],
      ],
      [
        'What is a piece of critical feedback you received, and what did you do with it?',
        'Whether you are coachable and act on feedback rather than defend against it.',
        ['How did you react when you first heard it?', 'What did you change, specifically?', 'How did you check that the change stuck?'],
      ],
      [
        'Tell me about a time you missed something important in a code review or design review.',
        'Whether you take shared responsibility for what gets through review, not just your own code.',
        ['Why do you think you missed it?', 'What did it cost once it shipped?', 'How do you review differently now?'],
      ],
      [
        'What is the biggest technical mistake you have made?',
        'Whether you can own a costly technical call and say what changed because of it.',
        ['What was your reasoning at the time?', 'How much did it cost?', 'What exists now so no one repeats it?'],
      ],
    ]),
  },
  {
    id: 'customer',
    why: "This tests whether you start from the user's problem rather than the technology. Committees read how close you got to real users and data; a senior changed a roadmap or design because of them.",
    strongSignals: [
      'Names the specific user or customer and describes the problem in their words.',
      'Used real evidence: support tickets, usage data, interviews or watching someone use the product.',
      'Changed what they built because of what they learned about users.',
      "Weighed one loud customer's request against what most users needed.",
      'Reports the user outcome: fewer tickets, better retention, faster task completion.',
    ],
    redFlags: [
      'Talks only about the technology, with users as an afterthought.',
      'Built exactly what was asked without asking why.',
      'Treats users as the problem, as if they were using the product wrong.',
      'Cannot say how they knew users were better off.',
      "Mistakes an internal stakeholder's preference for a user need, with no evidence.",
    ],
    questions: questions('customer', [
      [
        'Tell me about a time you went above and beyond for a customer.',
        "Whether you care about users' outcomes, and where you draw sensible limits.",
        ['How did you find out about their problem?', 'What did it cost you or the team?', 'Did the fix help other customers too?'],
      ],
      [
        'Describe a time you used customer feedback or data to change what you were building.',
        'Whether evidence about users actually changes your decisions.',
        ['What exactly did the data show?', 'Who disagreed with the change, and why?', 'How did you check that the change helped?'],
      ],
      [
        'Tell me about a time you said no to a customer request.',
        'Whether you can protect the product and most users while still treating the customer well.',
        ['What was the underlying need behind the request?', 'What did you offer instead?', 'How did the customer take it?'],
      ],
      [
        'Describe a time you had to balance what a customer wanted with what was technically sound.',
        'Whether you find the option that serves the user without creating a mess you pay for later.',
        [
          'What were the options on the table?',
          'How did you explain the trade-off to someone who is not an engineer?',
          'What did it look like a year later?',
        ],
      ],
      [
        'Tell me about a launch where you checked whether users were actually better off.',
        'Whether you close the loop on impact instead of treating launch as the finish line.',
        [
          'What did you measure, and why that?',
          'Were the numbers what you hoped, and what did you do next?',
          'How soon after launch did you look?',
        ],
      ],
      [
        'Tell me about a time you shipped something that users did not want.',
        'Whether you admit a miss honestly and trace it back to how you understood the user.',
        [
          'What signal told you it had missed?',
          'What did you learn about the users too late?',
          'What did you do with the feature afterward?',
        ],
      ],
      [
        'Tell me about a time you worked directly with a user to diagnose their problem.',
        'Whether you get close enough to a user to see the real problem firsthand.',
        ['What did you see that the tickets missed?', 'What did you change as a result?', 'How did you follow up with them?'],
      ],
    ]),
  },
  {
    id: 'leadership',
    why: "This checks whether you make the people and work around you better, with or without a title. A junior helps a peer; a senior grows engineers and raises a team's bar. At staff level, you set direction across teams.",
    strongSignals: [
      'Names the person they mentored and what that person can do now that they could not before.',
      'Adapted their approach to the person, rather than using one style for everyone.',
      'Delegated real ownership, including the risk of the person failing.',
      'Raised a team standard, such as review quality or on-call health, and shows how it spread.',
      'Gave hard feedback directly and kindly, and says what changed after.',
    ],
    redFlags: [
      'Describes mentoring as answering questions when asked.',
      "Takes credit for the mentee's work.",
      'Kept the interesting work and delegated the rest.',
      "Avoided a hard conversation until it became a manager's problem.",
      'Cannot point to anyone who grew because of them.',
    ],
    questions: questions('leadership', [
      [
        'Tell me about someone you mentored. How did they grow?',
        'Whether you invest in others deliberately and can point to real growth.',
        [
          'What did they need that was different from others you have helped?',
          'How did you know they were ready for more?',
          'What did you learn from mentoring them?',
        ],
      ],
      [
        'Describe a time you had to give difficult feedback to a peer or someone junior.',
        'Whether you address problems directly and kindly instead of avoiding them.',
        ['How did you prepare for the conversation?', 'How did they take it in the moment?', 'What changed in the weeks after?'],
      ],
      [
        'Tell me about a time you led a project without being the manager.',
        'Whether you set direction and coordinate people through clarity and trust, not authority.',
        ['How did you divide the work?', 'How did you keep everyone aligned on the goal?', 'What would the team say about how you led?'],
      ],
      [
        'Tell me about a time you raised the bar for your team.',
        'Whether you improve how the whole team works, not only your own output.',
        [
          'What was the standard before, and what is it now?',
          'Who resisted, and how did you bring them along?',
          'How do you know the new standard held?',
        ],
      ],
      [
        'Describe a time you delegated something important and it did not go well.',
        'Whether you hand over real ownership and support people without taking the work back.',
        [
          'What support did you give them before it went wrong?',
          'When did you step in, and how?',
          'How would you set it up differently next time?',
        ],
      ],
      [
        'How have you helped a new team member get productive quickly?',
        'Whether you treat onboarding as something you can shape, not something to wait out.',
        [
          'What did their first week look like?',
          'What part of onboarding did you change for the next person?',
          'How long until they shipped something real?',
        ],
      ],
      [
        'Tell me about a time you worked with a teammate who was underperforming.',
        "Whether you address underperformance directly and fairly before it becomes a manager's problem.",
        ['What did you think the cause was?', 'What did you say to them, and when?', 'When did you involve their manager?'],
      ],
    ]),
  },
  {
    id: 'tradeoffs',
    why: 'This tests whether you choose well when you cannot do everything. Committees look for explicit criteria and data; a senior answer shows saying no to good work and owning the cost of what was dropped.',
    strongSignals: [
      'States the options and the criteria used to rank them, such as impact, cost and risk.',
      'Uses numbers to compare the options, even rough estimates.',
      'Names what they chose not to do and who was disappointed.',
      'Got the people affected to agree on the priority, or at least understand it.',
      'Revisits the choice later and says whether it was right.',
    ],
    redFlags: [
      'Tried to do everything and worked nights to make it fit.',
      'Let whoever shouted loudest set the priority.',
      'Cannot name anything they deprioritized.',
      'Explains the choice only as what their manager told them to do.',
      'Presents a trade-off where one option was obviously better.',
    ],
    questions: questions('tradeoffs', [
      [
        'Tell me about a time you had more work than you could possibly do. How did you decide what to drop?',
        'Whether you prioritize with explicit criteria rather than urgency or noise.',
        [
          'What criteria did you use to rank the work?',
          'Who did you tell about what was dropped?',
          'Did anything you dropped come back to bite you?',
        ],
      ],
      [
        'Tell me about a significant technical trade-off you made. What did you give up?',
        'Whether you understand the costs of your design choices and can defend them with reasons.',
        [
          'What was the alternative you rejected?',
          'What would have to change for you to pick the other option?',
          'Did the cost turn out the way you expected?',
        ],
      ],
      [
        'Tell me about a time you chose to take on tech debt on purpose.',
        'Whether you take on debt deliberately, with a known cost and a plan to pay it back.',
        ['What did the shortcut buy you?', 'How did you record the debt so it was not forgotten?', 'Did it get paid back, and when?'],
      ],
      [
        'Tell me about a time two stakeholders wanted conflicting things from your team. How did you decide?',
        "Whether you settle competing demands with explicit criteria and keep both sides' trust.",
        ['What did each side stand to lose?', 'Who did you bring the decision to, if anyone?', 'How did the side that lost take it?'],
      ],
      [
        'Describe a time you prioritized something that was not the obvious choice.',
        'Whether you can see value others missed and make the case for it.',
        [
          'What did you see that others did not?',
          'How did you convince people to back it?',
          'How did the result compare with what you expected?',
        ],
      ],
      [
        'Tell me about a prioritization call you got wrong.',
        'Whether you judge your own calls honestly and adjust how you weigh work.',
        ['What made the call look right at the time?', 'How did you find out it was wrong?', 'What do you weigh differently now?'],
      ],
      [
        'What is the project with the largest scope you have led?',
        'Whether your scope matches your level, and which calls about scope and priority were yours.',
        ['How many teams were involved?', 'What decision was yours alone?', 'What would have gone differently without you?'],
      ],
    ]),
  },
  {
    id: 'technical-depth',
    why: 'This checks that you understand the systems you worked on, down to the details. Interviewers dig until you run out of answers; a senior answer holds up several levels deep and says why the obvious fix failed.',
    strongSignals: [
      'Explains the problem precisely enough that a stranger could reproduce it.',
      'Walks through the hypotheses they ruled out and the evidence for each.',
      'Goes several levels deeper on any part when asked, without hand-waving.',
      'Explains why the obvious solution would not have worked.',
      'Quantifies the result: latency, error rate, cost or throughput before and after.',
    ],
    redFlags: [
      'Stays at the level of buzzwords and falls apart under follow-up questions.',
      'Describes a system the team built but cannot explain their own part in it.',
      'Cannot say what alternatives were considered.',
      'Claims a result without any measurement.',
      'Picks a story whose scope is below the level they are interviewing for.',
    ],
    questions: questions('technical-depth', [
      [
        'Tell me about the most technically challenging problem you have worked on.',
        'Whether the depth is real, and where your understanding stops.',
        [
          'Why was the obvious approach not enough?',
          'Which part was hardest to get right?',
          'If you rebuilt it today, what would you change?',
        ],
      ],
      [
        'Walk me through a hard bug you tracked down.',
        'Whether you debug methodically with hypotheses and evidence rather than luck.',
        [
          'What was your first hypothesis, and how did you rule it out?',
          'What tool or signal finally cracked it?',
          'What did you add so the next person finds it faster?',
        ],
      ],
      [
        'Describe a time you improved the performance of a system. What was the bottleneck?',
        'Whether you measure before optimizing and understand why the fix worked.',
        ['How did you find the bottleneck?', 'What were the numbers before and after?', 'What became the next bottleneck?'],
      ],
      [
        'Tell me about a design you proposed that was rejected or significantly changed in review.',
        'Whether you can take technical criticism and understand the flaws others found.',
        ['What was the main objection?', 'Did you agree with it at the time?', 'How did the final design differ from yours?'],
      ],
      [
        'Describe a time you had to learn a new technology or domain quickly to solve a problem.',
        'How you ramp up on unfamiliar ground, and how you know when you understand enough.',
        ['What did you read or build first?', 'Who did you learn from?', 'What did you get wrong while you were still learning?'],
      ],
      [
        'Tell me about a system you owned that hit its limits. What broke first?',
        'Whether you understand where your own system breaks, and what hitting its limits taught you.',
        [
          'How did you find out it was breaking?',
          'What did you change, and what did you choose not to change?',
          'What would you design differently from day one?',
        ],
      ],
      [
        'Tell me about a time you made a service more reliable. Where did you start?',
        'Whether you improve reliability from failure data, not guesses, and can prove the gain.',
        [
          'Which failure modes did you rank highest, and on what data?',
          'What did you try that did not help?',
          'How did the error rate or uptime change afterward?',
        ],
      ],
    ]),
  },
];

export function getCompetency(id: string): Competency | undefined {
  return COMPETENCIES.find((c) => c.id === id);
}
