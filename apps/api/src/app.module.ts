import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from './config.js';
import { CurriculumController } from './curriculum/curriculum.controller.js';
import { HealthController } from './health/health.controller.js';
import { InterviewModule } from './interview/interview.module.js';
import { PersistenceModule } from './persistence/persistence.module.js';
import { ProgressController } from './progress/progress.controller.js';
import { ProgressService } from './progress/progress.service.js';

@Module({
  imports: [
    PersistenceModule,
    InterviewModule,
    ThrottlerModule.forRootAsync({
      imports: [PersistenceModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ throttlers: [{ ttl: 60_000, limit: config.rateLimitPerMinute }] }),
    }),
  ],
  controllers: [HealthController, CurriculumController, ProgressController],
  providers: [ProgressService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
