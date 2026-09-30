import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { deletedStory } from '@grasp/engine';
import { notSignedIn } from '../auth/auth-errors.js';
import { LearnerId, UserId } from '../common/learner-id.decorator.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StoryStore } from '../persistence/story.store.js';
import { storyIdSchema, storySchema, type StoryDto } from './stories.schema.js';

/** Behavioral stories sync for signed-in accounts only; anonymous learners keep theirs on the device. */
@Controller('stories')
export class StoriesController {
  constructor(private readonly store: StoryStore) {}

  @Get()
  @RateLimit({ limit: 60, windowMs: 60_000 })
  async list(@LearnerId() learnerId: string, @UserId() userId: string | null) {
    if (!userId) throw notSignedIn();
    return { stories: await this.store.list(learnerId) };
  }

  /** A first sign-in uploads the whole device bank, up to 100 stories, one request each. */
  @Put(':id')
  @RateLimit({ limit: 120, windowMs: 60_000 })
  async put(
    @LearnerId() learnerId: string,
    @UserId() userId: string | null,
    @Param('id', new ZodValidationPipe(storyIdSchema)) id: string,
    @Body(new ZodValidationPipe(storySchema)) body: StoryDto,
  ) {
    if (!userId) throw notSignedIn();
    const story = body.deleted ? deletedStory(id, body.updatedAt) : { ...body, id };
    return { story: await this.store.put(learnerId, story) };
  }
}
