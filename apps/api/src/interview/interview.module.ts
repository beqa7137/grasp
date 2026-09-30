import Anthropic from '@anthropic-ai/sdk';
import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { SpendStore } from '../persistence/spend.store.js';
import { ClaudeInterviewer } from './claude.interviewer.js';
import { InterviewController } from './interview.controller.js';
import { InterviewService } from './interview.service.js';
import { Interviewer } from './interviewer.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import { priceFor } from './pricing.js';
import { SpendGuard } from './spend-guard.js';

@Module({
  controllers: [InterviewController],
  providers: [
    InterviewService,
    OfflineInterviewer,
    {
      provide: SpendGuard,
      inject: [APP_CONFIG, SpendStore],
      useFactory: (config: AppConfig, store: SpendStore) => new SpendGuard(config.aiDailyBudgetUsd, store),
    },
    {
      provide: Interviewer,
      inject: [APP_CONFIG, SpendGuard],
      useFactory: (config: AppConfig, spend: SpendGuard) => {
        const log = new Logger('Interviewer');
        if (!config.anthropicApiKey) {
          log.warn('ANTHROPIC_API_KEY not set; using the offline scripted interviewer.');
          return new OfflineInterviewer();
        }
        const baseUrl = process.env['ANTHROPIC_BASE_URL']?.replace(/\/$/, '');
        const unsafe = !priceFor(config.anthropicModel)
          ? 'ANTHROPIC_MODEL must have verified pricing and request limits.'
          : process.env['ANTHROPIC_CUSTOM_HEADERS']?.trim()
            ? 'ANTHROPIC_CUSTOM_HEADERS is incompatible with verified AI spend limits.'
            : baseUrl && baseUrl !== 'https://api.anthropic.com'
              ? 'ANTHROPIC_BASE_URL must use the standard Anthropic endpoint for verified AI spend limits.'
              : null;
        // A misconfigured paid interviewer must not take sign-in and progress down with it.
        if (unsafe) {
          log.error(`${unsafe} Using the offline scripted interviewer.`);
          return new OfflineInterviewer();
        }
        const client = new Anthropic({
          apiKey: config.anthropicApiKey,
          baseURL: 'https://api.anthropic.com',
          logLevel: 'off',
          timeout: config.anthropicTimeoutMs,
          maxRetries: config.anthropicMaxRetries,
        });
        return new ClaudeInterviewer(
          client,
          {
            model: config.anthropicModel,
            replyDeadlineMs: config.interviewReplyDeadlineMs,
            scoreDeadlineMs: config.interviewScoreDeadlineMs,
          },
          spend,
        );
      },
    },
  ],
  exports: [Interviewer],
})
export class InterviewModule {}
