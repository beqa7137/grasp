import { HttpException, HttpStatus } from '@nestjs/common';
import { STORY_LIMITS, nextChange, type Story } from '@grasp/engine';

/** Deletes beyond this many drop their oldest tombstones; a device that stale can bring those stories back. */
export const MAX_TOMBSTONES = 100;

/**
 * The winner is decided on the device's own time; the time stored is no later than the server's clock, so a device
 * running ahead cannot outrank later edits, and never at or before the copy it replaces.
 */
export function storedAt(story: Story, stored: Story | undefined, now: Date): Story {
  // A story keeps the first creation time the account saw, so a copy from an app too old to send one cannot drop it.
  const created = stored?.createdAt ?? story.createdAt;
  return {
    ...story,
    ...(created ? { createdAt: new Date(Math.min(Date.parse(created), now.getTime())).toISOString() } : {}),
    updatedAt: nextChange(stored, new Date(Math.min(Date.parse(story.updatedAt), now.getTime()))),
  };
}

export const storyLimitReached = () =>
  new HttpException(
    {
      statusCode: HttpStatus.CONFLICT,
      message: `An account keeps at most ${STORY_LIMITS.stories} stories. Delete one to add another.`,
      code: 'story_limit',
    },
    HttpStatus.CONFLICT,
  );

export abstract class StoryStore {
  /** Oldest change first, tombstones included, so every device hears of each delete. */
  abstract list(learnerId: string): Promise<Story[]>;
  /**
   * Stores `story` unless the stored copy changed at the same time or later, and returns the copy that holds. A
   * tombstone for a story never stored is returned without being kept.
   */
  abstract put(learnerId: string, story: Story, now?: Date): Promise<Story>;
  abstract deleteLearner(learnerId: string): Promise<void>;
}
