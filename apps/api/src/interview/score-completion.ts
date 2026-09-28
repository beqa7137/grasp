import { ConflictException } from '@nestjs/common';
import type { InterviewScoredEvent } from '@grasp/engine';
import { isDeepStrictEqual } from 'node:util';
import type { InterviewSession } from './interview.types.js';

export function completedScore(stored: InterviewSession, candidate: InterviewSession): InterviewSession {
  let completed = stored;
  if (stored.status === 'active') {
    if (
      !isDeepStrictEqual(stored.messages, candidate.messages) ||
      stored.hintsUsed !== candidate.hintsUsed ||
      (stored.mode ?? 'offline') !== (candidate.mode ?? 'offline') ||
      stored.track !== candidate.track ||
      !isDeepStrictEqual(stored.problem, candidate.problem)
    ) {
      throw new ConflictException('Interview changed while scoring; try again');
    }
    completed = {
      ...stored,
      status: candidate.status,
      scorecard: structuredClone(candidate.scorecard),
      scoredAt: candidate.scoredAt,
      usage: structuredClone(candidate.usage),
    };
  }
  if (
    completed.status !== 'scored' ||
    !completed.scorecard ||
    typeof completed.scoredAt !== 'string' ||
    !Number.isFinite(Date.parse(completed.scoredAt))
  ) {
    throw new ConflictException('Interview score is incomplete');
  }
  return completed;
}

export function scoredEvent(completed: InterviewSession): InterviewScoredEvent {
  return {
    id: `interview-${completed.id}`,
    at: completed.scoredAt!,
    type: 'interview.scored',
    sessionId: completed.id,
    track: completed.track,
    verdict: completed.scorecard!.verdict,
    weakPatterns: completed.scorecard!.weakPatterns,
  };
}
