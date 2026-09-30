import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminController } from './admin/admin.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { IdentityGuard } from './auth/identity.guard.js';
import { RateLimitGuard } from './common/rate-limit.js';
import { CurriculumController } from './curriculum/curriculum.controller.js';
import { FeedbackController } from './feedback/feedback.controller.js';
import { HealthController } from './health/health.controller.js';
import { InterviewModule } from './interview/interview.module.js';
import { PersistenceModule } from './persistence/persistence.module.js';
import { MyDataController } from './privacy/my-data.controller.js';
import { ProgressController } from './progress/progress.controller.js';
import { ProgressService } from './progress/progress.service.js';
import { StoriesController } from './stories/stories.controller.js';

@Module({
  imports: [PersistenceModule, AuthModule, InterviewModule],
  controllers: [
    HealthController,
    CurriculumController,
    ProgressController,
    StoriesController,
    FeedbackController,
    MyDataController,
    AdminController,
  ],
  // Guards run in this order: identity first, so rate limits can key on the signed-in user.
  providers: [ProgressService, { provide: APP_GUARD, useExisting: IdentityGuard }, { provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
