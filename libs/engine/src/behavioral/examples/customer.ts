import type { CompetencyExamples } from '../types.js';

export const CUSTOMER: CompetencyExamples = {
  competencyId: 'customer',
  strong: [
    {
      level: 'early',
      lookFor:
        "One user's problem treated as theirs rather than a ticket: you talked to them, reproduced it from their words, and pushed back on a partial fix.",
      questionId: 'customer-1',
      situation:
        'In my first year on the Android team of a pharmacy delivery app, a support agent forwarded a ticket from a user in a rural area whose refill orders kept failing at checkout. She was 71, ordered heart medication every month, and had already driven to the store twice because the app said her payment failed.',
      task: 'The ticket was assigned to me as a small bug, and I set myself the goal of making sure she could order her next refill, due in six days, from home.',
      action:
        'I asked support whether she would take a call, and I spent twenty minutes on the phone with her while she described each screen. She mentioned the spinner ran for a long time before the error, which made me suspect the network rather than the payment. I reproduced it by throttling my test phone to a slow 3G profile, and found that the checkout screen refreshed the whole product catalog, about 4 megabytes, before it sent the order. On her connection that took longer than our 15-second timeout, so the order was never sent, and the app showed its generic "payment failed" message for any error. I removed the catalog refresh from checkout, since the server already checked prices, and I split the error message so a slow connection said so and offered a retry. My lead suggested only raising the timeout, but I showed him a trace where her checkout took 40 seconds, and he agreed the refresh had to go. I asked support to take her next order by phone as a backup, and I called her back when the fix reached the store to walk her through her next order.',
      result:
        'She placed her refill from home two days before it was due. Across all users, checkout failures on slow connections fell from 6 percent to under 1 percent, and "payment failed" tickets dropped from about 30 a month to 2.',
      reflection:
        'I learned that a detail a user mentions in passing, like how long a spinner ran, can be the whole diagnosis, so I now ask users to describe what they saw before I open the logs.',
      notes: {
        situation: 'Makes the user a real person with a real cost, a missed medication, rather than a ticket number.',
        task: "Sized for a junior engineer: one bug, but framed around the user's deadline rather than closing the ticket.",
        action:
          'Shows the candidate calling the user, turning her words into a reproduction, and pushing back on a partial fix with evidence, which is ownership at an early stage.',
        result: 'Closes the loop on the one user first, then shows the fix helped everyone on slow networks.',
        reflection: 'A concrete habit that came out of the story, asking users what they saw, which a junior engineer can credibly claim.',
      },
    },
    {
      level: 'mid',
      lookFor:
        "One important customer's complaint traced to its cause by watching them work, their real failures turned into tests, and a fix chosen for what their work can tolerate.",
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
    {
      level: 'senior',
      lookFor:
        'Testing a roadmap against what users need before teams commit to it, and changing it through data and shared experiments rather than authority.',
      questionId: 'customer-2',
      situation:
        'I was the staff engineer for the recommendations org at a streaming service, across four teams, and the roadmap for the next two quarters was a new deep ranking model aimed at raising click-through on the home screen by 3 percent.',
      task: 'Before we committed about 12 engineers to it, I wanted to confirm the model addressed the reason members were leaving, and to change the plan if it did not.',
      action:
        'I started with evidence instead of the model. I asked our research team to share 40 recent interviews with members who had cancelled, and I read all of them myself. The complaint that came up most was not bad recommendations but seeing the same titles for weeks; people said the home screen felt stale. I checked that against data: I joined impression logs with cancellations and found members who saw the same title in the top row more than 15 times in a month cancelled at 1.8 times the rate of others, even after controlling for viewing hours. A ranking model tuned for clicks would make that worse, since familiar titles get clicked. I wrote a two-page proposal to swap the first quarter of the plan for an impression fatigue signal and a diversity constraint on the top rows, and I reviewed it one on one with each team lead and the product director before the planning meeting, because a roadmap change announced cold gets defended rather than discussed. The ranking lead disagreed, so I agreed to run both ideas in the same experiment, with 90 day retention as the deciding metric instead of clicks.',
      result:
        'The fatigue change cut repeated top row impressions by 60 percent and lowered 90 day cancellations by 0.4 points, worth about 9 million dollars a year. The new model raised clicks by 2 percent but did not move retention, so the org moved it behind the fatigue work, and retention became the primary metric in every home screen experiment since.',
      reflection:
        'I learned that the metric a roadmap optimizes is itself a guess about users, so I now ask what user complaint a metric stands for before we commit a quarter to moving it.',
      notes: {
        situation: 'Establishes org-level scope and the cost of the default plan: two quarters of work for about a dozen engineers.',
        task: 'Frames the job as testing the roadmap against users, the decision only a senior can influence.',
        action:
          'Moves from interviews to data to a proposal, and shows influence without authority: pre-wiring the leads and settling a disagreement with a shared experiment.',
        result: 'Reports the user outcome, the money, and the lasting change to how the org measures success.',
        reflection: 'Generalizes the lesson to how metrics are chosen, the altitude expected of a staff engineer.',
      },
    },
  ],
  weak: [
    {
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
    {
      questionId: 'customer-6',
      situation:
        "I was on the web team for an online tax filing product, and the year before, the product manager had decided that users wanted a faster way to import last year's return. The design team produced a new import wizard with five steps, legal reviewed the wording for about a month, and marketing planned a campaign around it. There were also a lot of changes in the tax forms that year, so the whole release was late, and the support team was short-staffed because two agents had left in the spring.",
      task: 'I was asked to build the frontend of the wizard, which the product manager had specified in detail, and to ship it before the filing season opened in January.',
      action:
        'I built the wizard exactly to the spec, with all five steps, and I wrote tests for every field mapping. When I noticed the first screen had a lot of text, I mentioned it to the product manager, but it was her call. I shipped it on time, two days before the season opened.',
      result:
        'Only 8 percent of returning users finished the wizard, and support tickets about importing doubled. Users kept uploading photos of paper returns, which it did not support.',
      reflection:
        'I learned that I should push back harder when a product manager hands me a spec, because the users did not read the instructions on the first screen, and the design team had not tested it with anyone.',
      flaws: ['blame', 'long-setup'],
      why: {
        blame:
          'The miss is pinned on the product manager, the designers and users who "did not read the instructions", and never on how the candidate understood the users, which is exactly what this question probes.',
        'long-setup':
          'The history of the spec, the legal review, the tax form changes and the support staffing take many times the words of the Action, which is a single sentence.',
      },
      fix: 'The setup would be two sentences: an import wizard built to a detailed spec, and 8 percent completion after launch. The Action would own the miss and show what the candidate did next: "I watched five session recordings, saw users trying to upload photos of paper returns, and built a photo upload path." The reflection would say what the candidate now does before building, such as asking to see how users do the task today.',
    },
  ],
};
