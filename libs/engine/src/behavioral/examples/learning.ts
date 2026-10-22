import type { CompetencyExamples } from '../types.js';

export const LEARNING: CompetencyExamples = {
  competencyId: 'learning',
  strong: [
    {
      level: 'early',
      lookFor:
        'A method for getting useful in unfamiliar code: one request traced end to end, time-boxed questions, and tests that caught your wrong assumption before it shipped.',
      questionId: 'learning-1',
      situation:
        'In my first job I joined a logistics company whose shipping rate service was about 400,000 lines of Java, older than most of the team. Peak season started in five weeks.',
      task: 'My first ticket was a surcharge for oversized parcels, due in three weeks, and I had never seen the code or worked in Java at that scale.',
      action:
        'Instead of reading the code top down, I took one real rate request from the logs and stepped through it in the debugger, drawing each of the nine classes it passed through. I kept a running list of questions, and I gave each one thirty minutes on my own before asking. The ones left over I brought to a daily 20-minute slot with my onboarding buddy, so I did not interrupt him all day. Before changing anything, I wrote characterization tests that pinned the current price for 50 real requests. That is where my picture broke: I had assumed prices were computed in one place, but a caching layer rounded them before my surcharge step would run, so my first design would have charged the surcharge on a rounded price. I moved the surcharge ahead of the rounding, checked all 50 prices still matched, and added cases for oversized parcels. Then I cleaned up my diagram and added it to the team wiki.',
      result:
        'The surcharge shipped in 12 days, with no pricing incidents through peak season. The 50 tests caught a rounding regression from another change two months later, and the next two hires used my diagram and merged their first change in their first week instead of the usual three.',
      reflection:
        'I learned to follow one real request through the code before reading broadly, and to pin down current behavior with tests before I trust my picture of it.',
      notes: {
        situation: 'A large, old codebase and a date that cannot move give the ramp-up real pressure in two sentences.',
        task: 'Names exactly what was new to the candidate, so the interviewer can judge how far they had to come.',
        action:
          'Shows a method: trace one request, time-box questions, pin behavior with tests. It names the wrong assumption and how the tests exposed it before it shipped.',
        result: 'Days to ship plus two lasting effects, a caught regression and faster onboarding for the next hires.',
        reflection: 'Two concrete habits the candidate will reuse on every new codebase, which is what this question is after.',
      },
    },
    {
      level: 'mid',
      lookFor:
        'Volunteering for work in a stack you did not know, mixing reading, small experiments and review, and catching newcomer mistakes before users saw them.',
      questionId: 'learning-2',
      situation:
        'I was a backend engineer writing Python at a ticketing company when the only engineer who knew our Go API gateway left. A ticket sale for a large concert tour was six weeks away, and the last big sale had been hit by bots.',
      task: 'I volunteered to add per-client rate limiting to the gateway before the sale, although I had never written Go.',
      action:
        'I did the official Go tour over two evenings, then learned the rest from the gateway code with the standard library docs open beside it. Whenever I did not trust my understanding, I wrote a throwaway program to test it. One showed me that a goroutine waiting on a channel that nobody closes leaks forever unless it also watches a canceled context, which was exactly the mistake in how I had planned to expire idle clients. I asked a Go engineer on the payments team for a 30-minute review of my pull requests each week, focused on idiom rather than logic. She pointed out that I was writing Python in Go: panicking where I should return errors, and hiding a map behind an interface that nothing else implemented. I rewrote the limiter as a token bucket per client with a mutex, and I turned on the race detector in CI, which caught a data race in my cleanup loop on its first run. Before the sale I load tested it with recorded traffic at five times the previous peak.',
      result:
        'The limiter shipped in five weeks and handled 12,000 requests per second while adding under 1 millisecond at p99. On sale day it throttled a bot burst at 40 times normal traffic with no outage, and within three months I was reviewing the Go changes of two teammates.',
      reflection:
        'I learned that a new language takes days to read but weeks of honest review to write well, so I now find a fluent reviewer before I write much code.',
      notes: {
        situation: 'A departed owner and a fixed sale date explain why learning fast mattered, not just learning.',
        task: 'Volunteering for work in a language they had never used shows the stretch plainly.',
        action:
          'Mixes reading, small experiments and targeted review. The idiom feedback and the race detector show how they caught mistakes a newcomer makes before users saw them.',
        result: 'Performance numbers, a real test on sale day, and a sign of fluency: reviewing others within three months.',
        reflection: 'Separates reading a language from writing it well, and names the habit that follows.',
      },
    },
    {
      level: 'senior',
      lookFor:
        'Learning a new domain from people who practise it while teaching a team, checking your understanding before it shaped a design, and the knowledge spreading beyond you.',
      questionId: 'learning-3',
      situation:
        'As a staff engineer at an online marketplace, I was asked to lead a new team building the ledger behind seller payouts. I had built search and recommendations for years and knew almost nothing about accounting.',
      task: 'In one quarter I had to learn the domain well enough to design the ledger and to teach it to six engineers who knew as little as I did.',
      action:
        "I started with the people, not the code. I spent three days with the finance operations team while they reconciled a month of payouts by hand, and I wrote down every term they used. I learned the basics of double-entry bookkeeping from a textbook in the evenings, then turned my notes into a one-page glossary and asked the company's controller to mark it up. She found my biggest misunderstanding: to finance, a payout was a settlement batch with its own fees, not a single transfer, which would have changed the core table. Before writing any design, I replayed one real month of transactions through a spreadsheet model of the ledger to see if every account balanced. It exposed two cases I had missed, refunds issued after a payout and rounding in currency conversion. I wrote the design around the glossary, ran four one-hour sessions teaching the team the domain with real examples from that month, and made a finance reviewer a standing member of our design reviews.",
      result:
        'The ledger launched in 11 weeks. Monthly reconciliation fell from three days of manual work to about 2 hours, and unexplained discrepancies dropped from roughly 18,000 dollars a month to under 50 dollars. Two other teams adopted the glossary for their own payment work.',
      reflection:
        'I learned that in a new domain the fastest teachers are the people doing the work by hand, and that writing the vocabulary down exposes my gaps before the design does.',
      notes: {
        situation: 'A senior engineer with deep expertise elsewhere and none in accounting sets up a real domain jump.',
        task: 'Pairs learning with teaching six others, which is the senior bar for this competency.',
        action:
          'Learns from practitioners, checks understanding with an expert and a cheap model, and names the misunderstanding that would have shaped the core table. Then scales the knowledge to the team.',
        result: 'Hard numbers on reconciliation and money, plus reuse beyond the team, show the learning paid off widely.',
        reflection: 'A lesson about where domain knowledge lives, which transfers to any new field.',
      },
    },
  ],
  weak: [
    {
      questionId: 'learning-6',
      situation: 'I really care about staying current, because our industry moves fast and the tools change all the time.',
      task: 'I wanted to keep my skills sharp and bring good new ideas back to my team whenever I could.',
      action:
        'I read a lot of tech blogs and newsletters, and I listen to podcasts on my commute. When something looks interesting, I try it out on the side. Recently I got into some of the newer frontend frameworks and played around with them for a while. I also shared some articles with my team and suggested we look at a few of the tools I had found. I go to meetups when I can, and I watch conference talks from time to time.',
      result: 'The team liked the ideas, and some of what I shared ended up in our codebase eventually.',
      reflection: 'I learned that staying current is something you have to keep working at, week after week.',
      flaws: ['vague', 'no-result'],
      why: {
        vague:
          'No blog, framework or tool is named, and "played around with them" says nothing about what was learned, so it sounds like a habit claimed rather than practiced.',
        'no-result':
          '"Some of what I shared ended up in our codebase" has no number and no named change, so the interviewer cannot tell if it mattered.',
      },
      fix: 'The answer would name one thing, such as trying a new bundler on a side branch, and what the experiment measured. The Result would give the change it made: build time fell from 4 minutes to 40 seconds once the team adopted it.',
    },
    {
      questionId: 'learning-4',
      situation:
        'I joined a team that owned a search indexing service, and the onboarding was honestly a mess because nobody had written anything down.',
      task: 'I had to add a new field to the index within my first month, with no real guidance from anyone.',
      action:
        'The tech lead was always too busy to answer questions, and the engineer who knew the pipeline replied to my messages days later, so I mostly had to figure it out myself. I read through the indexing code and the schema files and found where documents were mapped. I finally asked in the team channel why a full reindex took so long, and someone told me about a script that reindexed only changed documents, which nobody had bothered to mention. I used that script, added the field and tested it on staging before shipping.',
      result: 'The field shipped in 3 weeks, and the script cut my reindex test cycle from about 6 hours to 20 minutes.',
      reflection: 'Teams should really document their tools.',
      flaws: ['blame', 'no-reflection'],
      why: {
        blame:
          'The tech lead, the pipeline engineer and the whole team are cast as the obstacle, while the candidate never asks why the question came so late.',
        'no-reflection':
          'The closing line is a demand of others, not a lesson, so the interviewer learns nothing about how the candidate would ramp up next time.',
      },
      fix: 'The Action would own the timing: "I spent a week reindexing by hand before I asked, and asking on day two would have saved me days." It would end with the lesson, such as asking early about the slowest step, and note that the candidate then wrote the missing onboarding page.',
    },
  ],
};
