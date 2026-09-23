import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { ClaudeInterviewer } from './claude.interviewer.js';
import { InterviewController } from './interview.controller.js';
import { InterviewService } from './interview.service.js';
import { Interviewer } from './interviewer.js';
import { OfflineInterviewer } from './offline.interviewer.js';

@Module({
  controllers: [InterviewController],
  providers: [
    InterviewService,
    {
      provide: Interviewer,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const log = new Logger('Interviewer');
        if (!config.anthropicApiKey) {
          log.warn('ANTHROPIC_API_KEY not set — using the offline scripted interviewer.');
          return new OfflineInterviewer();
        }
        log.log(`AI interviewer enabled (${config.anthropicModel}).`);
        return new ClaudeInterviewer(config.anthropicApiKey, config.anthropicModel);
      },
    },
  ],
})
export class InterviewModule {}
