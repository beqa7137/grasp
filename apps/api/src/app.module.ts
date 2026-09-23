import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { IdentityGuard } from './auth/identity.guard.js';
import { UserThrottlerGuard } from './auth/user-throttler.guard.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { CurriculumController } from './curriculum/curriculum.controller.js';
import { FeedbackController } from './feedback/feedback.controller.js';
import { HealthController } from './health/health.controller.js';
import { InterviewModule } from './interview/interview.module.js';
import { PersistenceModule } from './persistence/persistence.module.js';
import { MyDataController } from './privacy/my-data.controller.js';
import { ProgressController } from './progress/progress.controller.js';
import { ProgressService } from './progress/progress.service.js';

@Module({
  imports: [
    PersistenceModule,
    AuthModule,
    InterviewModule,
    ThrottlerModule.forRootAsync({
      imports: [PersistenceModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: 60_000, limit: config.rateLimitPerMinute }],
        errorMessage: 'Too many requests. Please wait a moment and try again.',
      }),
    }),
  ],
  controllers: [HealthController, CurriculumController, ProgressController, FeedbackController, MyDataController, AdminController],
  // Guards run in this order: identity first, so rate limits can key on the signed-in user.
  providers: [ProgressService, { provide: APP_GUARD, useExisting: IdentityGuard }, { provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
