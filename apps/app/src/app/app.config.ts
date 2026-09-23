import { type ApplicationConfig, ErrorHandler, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { PreloadAllModules, RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { ReportingErrorHandler, initErrorReporting } from './core/error-reporting';
import { LearnerService } from './core/learner.service';
import { ProgressService } from './core/progress.service';
import { PilotService } from './pilot/pilot.service';
import { RuntimeConfigService } from './core/runtime-config.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(routes, withComponentInputBinding(), withPreloading(PreloadAllModules)),
    provideAppInitializer(async () => {
      const runtime = inject(RuntimeConfigService);
      const learner = inject(LearnerService);
      const progress = inject(ProgressService);
      const pilot = inject(PilotService);
      const auth = inject(AuthService);
      await runtime.load();
      void initErrorReporting(runtime);
      await learner.init();
      await auth.init();
      await progress.init();
      await pilot.init();
    }),
  ],
};
