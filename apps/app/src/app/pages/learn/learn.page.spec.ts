import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ProgressService } from '../../core/progress.service';
import { DiagnosticPromptService } from '../diagnostic/diagnostic-prompt.service';
import { LearnPage } from './learn.page';

describe('LearnPage sync notice', () => {
  it('shows the session notice instead of the retry alert when sign-in is required', () => {
    const signInRequired = signal(false);
    TestBed.configureTestingModule({
      imports: [LearnPage],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { get: async () => ({ events: [] }), post: async () => undefined } },
        { provide: AuthService, useValue: { signInRequired } },
        { provide: DiagnosticPromptService, useValue: { dismissed: signal(true) } },
      ],
    });
    const progress = TestBed.inject(ProgressService);
    const fixture = TestBed.createComponent(LearnPage);
    const el = fixture.nativeElement as HTMLElement;

    progress.syncStatus.set('offline');
    fixture.detectChanges();
    expect(el.querySelector('.sync-error')).not.toBeNull();
    expect(el.querySelector('.resume')).toBeNull();

    signInRequired.set(true);
    fixture.detectChanges();
    expect(el.querySelector('.sync-error')).toBeNull();
    expect(el.querySelector('.resume')?.textContent).toContain('Your session ended');
  });
});
