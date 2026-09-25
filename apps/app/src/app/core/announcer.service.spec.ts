import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnnouncerService } from './announcer.service';

describe('AnnouncerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [AnnouncerService] });
  });
  afterEach(() => vi.useRealTimers());

  it('empties the status region before each message, so a repeated message is read again', () => {
    const announcer = TestBed.inject(AnnouncerService);
    announcer.announce('Added Cache.');
    expect(announcer.message()).toBe('');
    vi.runAllTimers();
    expect(announcer.message()).toBe('Added Cache.');

    announcer.announce('Added Cache.');
    expect(announcer.message()).toBe('');
    vi.runAllTimers();
    expect(announcer.message()).toBe('Added Cache.');
  });

  it('reads only the last of several messages in quick succession', () => {
    const announcer = TestBed.inject(AnnouncerService);
    announcer.announce('Added Cache.');
    announcer.announce('Removed Cache.');
    vi.runAllTimers();
    expect(announcer.message()).toBe('Removed Cache.');
  });

  it('drops a pending message once the page that owns it is gone', () => {
    const page = createEnvironmentInjector([AnnouncerService], TestBed.inject(EnvironmentInjector));
    const announcer = page.get(AnnouncerService);
    announcer.announce('Interviewer: Could you say more?');
    page.destroy();
    vi.runAllTimers();
    expect(announcer.message()).toBe('');
  });
});
