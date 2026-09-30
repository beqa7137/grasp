import {
  BEHAVIORAL_REDIRECT,
  behavioralInterviewerPrompt,
  behavioralScorerPrompt,
  behavioralTranscript,
  behavioralTurn,
} from './behavioral.prompts.js';
import { behavioralScorecardJsonSchema, normalizeBehavioralScorecard } from './behavioral.scorecard.js';
import type { InterviewMessage, InterviewSession } from './interview.types.js';
import { candidateTurn, interviewerSystemPrompt, scorerSystemPrompt, transcriptText } from './prompts.js';
import { normalizeScorecard, scorecardJsonSchema } from './scorecard.schema.js';

export const REDIRECT_REPLY = "Let's keep going with the problem. Could you walk me through where your approach stands right now?";

const behavioral = (session: InterviewSession) => session.track === 'behavioral';

export const systemPromptFor = (s: InterviewSession) => (behavioral(s) ? behavioralInterviewerPrompt(s) : interviewerSystemPrompt(s));
export const scorerPromptFor = (s: InterviewSession) => (behavioral(s) ? behavioralScorerPrompt(s) : scorerSystemPrompt(s));
export const transcriptFor = (s: InterviewSession) => (behavioral(s) ? behavioralTranscript(s) : transcriptText(s));
export const candidateTurnFor = (s: InterviewSession, m: InterviewMessage) => (behavioral(s) ? behavioralTurn(m) : candidateTurn(m));
export const redirectFor = (s: InterviewSession) => (behavioral(s) ? BEHAVIORAL_REDIRECT : REDIRECT_REPLY);
export const scorecardJsonSchemaFor = (s: InterviewSession) =>
  behavioral(s) ? behavioralScorecardJsonSchema() : scorecardJsonSchema(s.track);
export const normalizeScorecardFor = (s: InterviewSession, json: string) =>
  behavioral(s) ? normalizeBehavioralScorecard(s, json) : normalizeScorecard(s.track, json);
export const scoringRequest = (s: InterviewSession) => `Score this interview.\n\n<transcript>\n${transcriptFor(s)}\n</transcript>`;
