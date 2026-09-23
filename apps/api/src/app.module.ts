import { Controller, Get, Inject, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './config.js';
import { CurriculumController } from './curriculum/curriculum.controller.js';
import { InterviewModule } from './interview/interview.module.js';
import { PersistenceModule } from './persistence/persistence.module.js';
import { ProgressController } from './progress/progress.controller.js';
import { ProgressService } from './progress/progress.service.js';

@Controller('health')
class HealthController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  health() {
    return {
      status: 'ok',
      storage: this.config.databaseUrl ? 'postgres' : 'memory',
      interviewer: this.config.anthropicApiKey ? 'ai' : 'offline',
    };
  }
}

@Module({
  imports: [PersistenceModule, InterviewModule],
  controllers: [HealthController, CurriculumController, ProgressController],
  providers: [ProgressService],
})
export class AppModule {}
