import { Interviewer, type ReplyResult, type ScoreResult } from './interviewer.js';
import type { InterviewSession, Scorecard } from './interview.types.js';
import { behavioralReply, behavioralScorecard } from './offline.behavioral.js';
import { RUBRICS } from './prompts.js';
import { verdictForAverage } from './scorecard.schema.js';

interface Stage {
  ask: string;
  skipIf?: RegExp;
}

const OFFLINE_SUMMARY =
  'Scripted practice checks which rubric areas you covered, not whether your answers were right. Use this scorecard to guide your next practice session.';

const WRAP_UP = 'Thanks, that is time. Hit "End & score" whenever you are ready.';

const CODING_STAGES: Stage[] = [
  {
    ask: 'Good. Before we go further, what input sizes and edge cases would you want to confirm with me?',
    skipIf: /constraint|input size|how large|empty|clarif|assum/i,
  },
  {
    ask: 'Okay. What is the simplest correct approach, and what does it cost in time and space?',
    skipIf: /brute|naive|simplest|O\(n\s*\^?\s*2\)|quadratic/i,
  },
  {
    ask: 'Can we do better? Where is the repeated work in that approach?',
    skipIf: /better|optimi[sz]|stack|hash|two pointers?|window|binary search|heap|linear/i,
  },
  {
    ask: 'Walk me through your improved approach on the example. What is its time and space complexity, and why?',
    skipIf: /O\(n\)|O\(n log n\)|O\(log n\)|amortized/i,
  },
  {
    ask: 'What edge cases would break a naive implementation? How does your approach handle them?',
    skipIf: /edge case|empty|duplicate|single element|overflow/i,
  },
  { ask: 'Nice. Last one: how would your solution change if the input arrived as a stream instead of an array?' },
];

const DESIGN_STAGES: Stage[] = [
  {
    ask: 'Sounds good. What are the core functional requirements, and which non-functional ones matter most here?',
    skipIf: /requirement|functional|latency|availability|consisten/i,
  },
  {
    ask: "Let's size it. Give me rough numbers for requests per second, storage over five years, and read/write ratio.",
    skipIf: /\b\d+\s*(k|m|b|million|billion|qps|rps|tb|gb)\b/i,
  },
  {
    ask: 'Sketch the high-level design: the main components and how a request flows through them.',
    skipIf: /load balanc|api server|service|gateway/i,
  },
  {
    ask: 'What does the data model look like, and which database would you choose? Why?',
    skipIf: /schema|table|key-value|nosql|postgres|dynamo|cassandra|sql/i,
  },
  { ask: 'Where is the first bottleneck as traffic grows 10×? How do you scale past it?', skipIf: /shard|partition|replica|cache|cdn/i },
  { ask: 'A key component fails at peak. Walk me through what users experience and how the system recovers.' },
];

const SIGNALS: Record<string, RegExp> = {
  constraints: /\b(constraint|input size|n\s*[<≤]|range|negative|empty|duplicate|assum|clarif)/i,
  complexity: /\bO\(|complexit|linear|logarithmic|quadratic|amortized/i,
  edge: /\bedge case|empty|single|overflow|null|boundary|duplicate/i,
  tradeoff: /trade-?off|instead|alternativ|pros|cons|downside|versus|vs\.?\b/i,
  estimation: /\b\d+\s*(k|m|b|million|billion|qps|rps|tb|gb|per second|\/s)\b/i,
  scaling: /shard|partition|replica|cache|cdn|queue|load balanc|horizontal/i,
  failure: /fail|retry|timeout|redundan|failover|idempot|backup/i,
};

export class OfflineInterviewer extends Interviewer {
  readonly mode = 'offline' as const;

  async reply(session: InterviewSession, onDelta: (text: string) => void, signal: AbortSignal): Promise<ReplyResult> {
    const last = session.messages[session.messages.length - 1];
    let text: string;
    if (session.track === 'behavioral') {
      text = behavioralReply(session);
    } else if (last?.code && !last.hint) {
      const lines = last.code.source.split('\n').filter((l) => l.trim()).length;
      text = `Thanks, I see ${lines} line${lines === 1 ? '' : 's'} of ${last.code.language}. Walk me through it on the first example: what do your variables hold after each step, and what is the time and space complexity?`;
    } else if (last?.hint) {
      const rung = Math.min(session.hintsUsed - 1, session.problem.hints.length - 1);
      text = `Here's a nudge: ${session.problem.hints[Math.max(0, rung)]}`;
    } else if (last && last.content.trim().split(/\s+/).length < 6) {
      text = 'Could you say a bit more? Walk me through your reasoning out loud, the way you would at a whiteboard.';
    } else {
      text = this.nextQuestion(session);
    }
    for (const word of text.split(/(?<=\s)/)) {
      if (signal.aborted) break;
      onDelta(word);
      await new Promise((r) => setTimeout(r, 18));
    }
    return { text };
  }

  /** Asks the first rubric question the candidate hasn't already covered and hasn't been asked yet. */
  private nextQuestion(session: InterviewSession): string {
    const stages = session.track === 'coding' ? CODING_STAGES : DESIGN_STAGES;
    const said = session.messages
      .filter((m) => m.role === 'candidate' && !m.hint)
      .map((m) => m.content)
      .join('\n');
    const asked = new Set(session.messages.filter((m) => m.role === 'interviewer').map((m) => m.content));
    const next = stages.find((st) => !asked.has(st.ask) && !st.skipIf?.test(said));
    return next?.ask ?? WRAP_UP;
  }

  async score(session: InterviewSession): Promise<ScoreResult> {
    return { scorecard: this.scorecard(session) };
  }

  scorecard(session: InterviewSession, summary = OFFLINE_SUMMARY): Scorecard {
    if (session.track === 'behavioral') return behavioralScorecard(session, summary);
    const said = session.messages
      .filter((m) => m.role === 'candidate' && !m.hint)
      .map((m) => m.content)
      .join('\n');
    const has = (k: keyof typeof SIGNALS) => SIGNALS[k].test(said);
    const words = said.split(/\s+/).filter(Boolean).length;
    const engagement = words > 250 ? 1 : words > 80 ? 0.5 : 0;
    const hintPenalty = Math.min(1, session.hintsUsed * 0.34);

    const coding = session.track === 'coding';
    const signals = coding
      ? [has('constraints'), has('tradeoff') || has('complexity'), has('complexity'), has('edge'), engagement > 0]
      : [has('constraints'), has('estimation'), has('scaling'), has('tradeoff') || has('failure'), engagement > 0];

    const dimensions = RUBRICS[session.track].map((r, i) => {
      const base = signals[i] ? 3 : words > 40 ? 2 : 1;
      const score = Math.max(1, Math.min(4, Math.round(base + (i === 1 ? -hintPenalty : 0) + (engagement === 1 && signals[i] ? 0.4 : 0))));
      return { name: r.name, score, evidence: signals[i] ? 'Addressed in your answers.' : 'Little or no evidence in the transcript.' };
    });
    const avg = dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
    return {
      verdict: verdictForAverage(avg),
      summary,
      dimensions,
      strengths: dimensions.filter((d) => d.score >= 3).map((d) => d.name),
      improvements: dimensions
        .filter((d) => d.score < 3)
        .map((d) => `${d.name}: ${RUBRICS[session.track].find((r) => r.name === d.name)!.lookFor}`),
      weakPatterns: avg < 3 ? session.problem.patternIds : [],
      mode: 'offline',
    };
  }
}
