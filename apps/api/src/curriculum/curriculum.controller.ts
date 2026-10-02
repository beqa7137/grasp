import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  ALGORITHMS,
  COMPONENTS,
  DRILL_CARDS,
  InputError,
  PATTERNS,
  REVIEW_ITEMS,
  SCENARIOS,
  SD_TOPICS,
  algorithmMeta,
  describeItem,
  generateQuestion,
  getAlgorithm,
  getReviewItem,
  newSeed,
  scenarioVariant,
} from '@grasp/engine';
import { PublicRead } from '../common/public-read.js';

@Controller('curriculum')
export class CurriculumController {
  @Get('patterns')
  @PublicRead()
  patterns() {
    return PATTERNS;
  }

  @Get('algorithms')
  @PublicRead()
  algorithms() {
    return ALGORITHMS.map(algorithmMeta);
  }

  @Post('algorithms/:id/trace')
  trace(@Param('id') id: string, @Body() body: { input?: unknown }) {
    const algo = getAlgorithm(id);
    if (!algo) throw new NotFoundException(`Unknown algorithm ${id}`);
    try {
      const input = algo.validate(body?.input ?? algo.defaultInput);
      return { input, frames: algo.trace(input) };
    } catch (err) {
      if (err instanceof InputError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  @Get('drills')
  @PublicRead()
  drills() {
    return DRILL_CARDS;
  }

  @Get('topics')
  @PublicRead()
  topics() {
    return { patterns: PATTERNS.map(({ id, name, track, order }) => ({ id, name, track, order })), systemDesign: SD_TOPICS };
  }

  @Get('review-items')
  @PublicRead()
  reviewItems() {
    return REVIEW_ITEMS.map(describeItem);
  }

  /** A fresh variant of a review item; pass `seed` to reproduce one. */
  @Get('review-items/:id/question')
  question(@Param('id') id: string, @Query('seed', new ParseIntPipe({ optional: true })) seed?: number) {
    if (!getReviewItem(id)) throw new NotFoundException(`Unknown review item ${id}`);
    return generateQuestion(id, seed ?? newSeed());
  }

  @Get('scenarios')
  @PublicRead()
  scenarios() {
    return {
      components: COMPONENTS,
      scenarios: SCENARIOS.map((s) => ({ ...s, revisits: (s.variants ?? []).map((_, i) => scenarioVariant(s.id, i + 1)) })),
    };
  }
}
