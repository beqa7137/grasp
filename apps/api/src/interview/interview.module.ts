import Anthropic from '@anthropic-ai/sdk';
import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { CoordinationStore } from '../persistence/stores.js';
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
    {
      provide: SpendGuard,
      inject: [APP_CONFIG, CoordinationStore],
      useFactory: (config: AppConfig, store: CoordinationStore) => new SpendGuard(config.aiDailyBudgetUsd, store),
    },
    {
      provide: Interviewer,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const log = new Logger('Interviewer');
        if (!config.anthropicApiKey) {
          log.warn('ANTHROPIC_API_KEY not set — using the offline scripted interviewer.');
          return new OfflineInterviewer();
        }
        if (!priceFor(config.anthropicModel)) {
          log.warn(`No price entry for ${config.anthropicModel}: costs are not tracked and AI_DAILY_BUDGET_USD cannot apply.`);
        }
        log.log(`AI interviewer enabled (${config.anthropicModel}).`);
        const client = new Anthropic({
          apiKey: config.anthropicApiKey,
          timeout: config.anthropicTimeoutMs,
          maxRetries: config.anthropicMaxRetries,
        });
        return new ClaudeInterviewer(client, { model: config.anthropicModel });
      },
    },
  ],
  exports: [Interviewer],
})
export class InterviewModule {}
