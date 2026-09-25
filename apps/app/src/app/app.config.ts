import { type ApplicationConfig, ErrorHandler, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  PreloadAllModules,
  RouteReuseStrategy,
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { ReportingErrorHandler, initErrorReporting } from './core/error-reporting';
import { LearnerService } from './core/learner.service';
import { PageTitleStrategy } from './core/page-title.strategy';
import { ProgressService } from './core/progress.service';
import { DiagnosticPromptService } from './pages/diagnostic/diagnostic-prompt.service';
import { PilotService } from './pilot/pilot.service';
import { ReminderService } from './reminders/reminder.service';
import { RuntimeConfigService } from './core/runtime-config.service';
import { ShortcutsService } from './core/shortcuts.service';
import { ThemeService } from './core/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(routes, withComponentInputBinding(), withPreloading(PreloadAllModules)),
    provideAppInitializer(async () => {
      // Started first: loading the runtime config can wait on the network, and the theme should not.
      const themeReady = inject(ThemeService).init();
      const runtime = inject(RuntimeConfigService);
      const learner = inject(LearnerService);
      const progress = inject(ProgressService);
      const pilot = inject(PilotService);
      const diagnosticPrompt = inject(DiagnosticPromptService);
      const auth = inject(AuthService);
      const reminders = inject(ReminderService);
      const shortcuts = inject(ShortcutsService);
      await runtime.load();
      void initErrorReporting(runtime);
      await learner.init();
      await auth.init();
      await progress.init();
      await Promise.all([pilot.init(), diagnosticPrompt.init(), reminders.init(), shortcuts.init(), themeReady]);
    }),
  ],
};
