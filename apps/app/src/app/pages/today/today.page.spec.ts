import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PopoverController } from '@ionic/angular';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ProgressService } from '../../core/progress.service';
import { DiagnosticPromptService } from '../diagnostic/diagnostic-prompt.service';
import { TodayPage } from './today.page';

describe('TodayPage sync notice', () => {
  const signInRequired = signal(false);
  const user = signal<{ id: string } | null>(null);

  beforeEach(() => {
    signInRequired.set(false);
    user.set(null);
    TestBed.configureTestingModule({
      imports: [TodayPage],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { get: async () => ({ events: [] }), post: async () => undefined } },
        { provide: AuthService, useValue: { signInRequired, user } },
        { provide: DiagnosticPromptService, useValue: { dismissed: signal(true) } },
        { provide: PopoverController, useValue: {} },
      ],
    });
  });

  // The page loads its loop card and Up next after first paint; let those imports land before the test environment goes.
  afterEach(async () => {
    await Promise.all([
      import('./up-next.component'),
      import('./today-aside.component'),
      import('./loop-card.component'),
      import('./loop-events'),
    ]);
    await new Promise((resolve) => setTimeout(resolve));
  });

  function render() {
    const progress = TestBed.inject(ProgressService);
    const fixture = TestBed.createComponent(TodayPage);
    return { progress, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it.each([
    { name: 'future dated updates', pending: { future: 1, oversized: 0 }, reason: 'future date and cannot sync yet' },
    { name: 'oversized updates', pending: { future: 0, oversized: 1 }, reason: 'too large to sync' },
    { name: 'mixed updates', pending: { future: 2, oversized: 1 }, reason: 'future date, and some is too large to sync' },
  ])('explains $name', ({ pending, reason }) => {
    const { progress, fixture, el } = render();
    progress.pendingSync.set(pending);
    progress.syncStatus.set('pending');
    fixture.detectChanges();

    const notice = el.querySelector('.sync-notice');
    const status = el.querySelector('.sync');
    expect(notice?.textContent).toContain(reason);
    expect(notice?.textContent).toContain('saved on this device');
    expect(notice?.getAttribute('role')).toBe('alert');
    expect(notice?.querySelector('button')?.textContent).toContain('Try again');
    expect(status?.textContent).toContain('Sync pending');
    expect((status?.querySelector('ion-icon') as HTMLElement & { name?: string })?.name).toBe('time-outline');
  });

  it.each(['offline', 'pending'] as const)('shows the session notice instead of a %s retry notice when sign-in is required', (status) => {
    const { progress, fixture, el } = render();
    progress.pendingSync.set({ future: 1, oversized: 0 });
    progress.syncStatus.set(status);
    fixture.detectChanges();
    expect(el.querySelector('.sync-notice')).not.toBeNull();

    signInRequired.set(true);
    fixture.detectChanges();
    expect(el.querySelector('.sync-notice')).toBeNull();
    expect(el.querySelector('.resume')?.textContent).toContain('Your session ended');
  });

  it('labels unavailable sync without claiming the device is offline', () => {
    const { progress, fixture, el } = render();
    progress.syncStatus.set('offline');
    fixture.detectChanges();

    expect(el.querySelector('.sync')?.textContent).toContain('Sync unavailable');
    expect((el.querySelector('.sync ion-icon') as HTMLElement & { name?: string })?.name).toBe('alert-circle-outline');
    expect(el.querySelector('.sync-notice')?.textContent).toContain('Sync is unavailable');
  });

  it('holds the pending reason during a retry and shows the updated reason when it finishes', async () => {
    const { progress, fixture, el } = render();
    progress.pendingSync.set({ future: 1, oversized: 0 });
    progress.syncStatus.set('pending');
    let finishRetry!: () => void;
    vi.spyOn(progress, 'resync').mockImplementation(() => new Promise<void>((resolve) => (finishRetry = resolve)));
    fixture.detectChanges();
    const initialNotice = el.querySelector('.sync-notice span')?.textContent;

    const retry = fixture.componentInstance.retrySync();
    progress.syncStatus.set('syncing');
    fixture.detectChanges();
    expect(el.querySelector('.sync-notice span')?.textContent).toBe(initialNotice);
    expect((el.querySelector('.sync-notice button') as HTMLButtonElement).disabled).toBe(true);

    progress.pendingSync.set({ future: 0, oversized: 1 });
    progress.syncStatus.set('pending');
    finishRetry();
    await retry;
    fixture.detectChanges();
    expect(el.querySelector('.sync-notice')?.textContent).toContain('too large to sync');
    expect(el.querySelector('.sync-notice')?.textContent).not.toContain('future date');
    expect((el.querySelector('.sync-notice button') as HTMLButtonElement).disabled).toBe(false);
  });

  it("holds the first-run card on a signed-in device until the launch's first pull, so it never overwrites the account's loop", () => {
    const { progress, fixture } = render();
    expect(fixture.componentInstance.holdLoopCard()).toBe(false);
    user.set({ id: 'account' });
    expect(fixture.componentInstance.holdLoopCard()).toBe(true);
    progress.pulled.set(true);
    expect(fixture.componentInstance.holdLoopCard()).toBe(false);
  });
});
