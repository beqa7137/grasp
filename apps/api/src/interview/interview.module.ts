import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { SpendStore } from '../persistence/spend.store.js';
import { InterviewController } from './interview.controller.js';
import { InterviewService } from './interview.service.js';
import { Interviewer } from './interviewer.js';
import { createInterviewer } from './interviewer.factory.js';
import { OfflineInterviewer } from './offline.interviewer.js';
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
      useFactory: (config: AppConfig, spend: SpendGuard) => createInterviewer(config, spend),
    },
  ],
  exports: [Interviewer],
})
export class InterviewModule {}
