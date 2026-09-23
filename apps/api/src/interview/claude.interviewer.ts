import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { PATTERNS } from '@grasp/engine';
import { z } from 'zod';
import { Interviewer } from './interviewer.js';
import type { InterviewSession, Scorecard } from './interview.types.js';
import { RUBRICS, interviewerSystemPrompt, scorerSystemPrompt, transcriptText } from './prompts.js';

const scorecardSchema = z.object({
  verdict: z.enum(['strong-hire', 'hire', 'lean-hire', 'lean-no-hire', 'no-hire']),
  summary: z.string(),
  dimensions: z.array(z.object({ name: z.string(), score: z.number().int().min(1).max(4), evidence: z.string() })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  weakPatterns: z.array(z.string()),
});

export class ClaudeInterviewer extends Interviewer {
  readonly mode = 'ai' as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  async reply(session: InterviewSession, onDelta: (text: string) => void, signal: AbortSignal): Promise<string> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: 1024,
        system: [{ type: 'text', text: interviewerSystemPrompt(session), cache_control: { type: 'ephemeral' } }],
        messages: toClaudeMessages(session),
        output_config: { effort: 'low' },
      },
      { signal },
    );
    stream.on('text', onDelta);
    const final = await stream.finalMessage();
    return final.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  }

  async score(session: InterviewSession): Promise<Scorecard> {
    const message = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      system: scorerSystemPrompt(session),
      messages: [{ role: 'user', content: `Transcript:\n\n${transcriptText(session)}` }],
      output_config: { format: zodOutputFormat(scorecardSchema) },
    });
    const parsed = message.parsed_output;
    if (!parsed) throw new Error('Scorer returned no structured output');
    const valid = new Set(PATTERNS.map((p) => p.id));
    const names = new Set(RUBRICS[session.track].map((r) => r.name));
    return {
      ...parsed,
      dimensions: parsed.dimensions.filter((d) => names.has(d.name)),
      weakPatterns: parsed.weakPatterns.filter((p) => valid.has(p)),
      mode: 'ai',
    };
  }
}

/** Claude expects alternating turns starting with the user; the interviewer's opening becomes context. */
function toClaudeMessages(session: InterviewSession): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [{ role: 'user', content: '(The candidate joins the call.)' }];
  for (const m of session.messages) {
    const role = m.role === 'interviewer' ? 'assistant' : 'user';
    const content = m.hint ? `[HINT REQUESTED] ${m.content}` : m.content;
    const last = out[out.length - 1];
    if (last.role === role) last.content = `${last.content as string}\n\n${content}`;
    else out.push({ role, content });
  }
  return out;
}
