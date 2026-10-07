import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { replay, type StoredEvent } from '@grasp/engine';
import { NATIVE_PLATFORM } from '../core/platform';
import { ProgressService } from '../core/progress.service';
import { NOTIFICATIONS, type NotificationsApi, ReminderService } from './reminder.service';

interface Scheduled {
  id: number;
  title: string;
  body: string;
  schedule?: { at?: Date };
  isExactNotification?: boolean;
}

function setup(opts: { native?: boolean; grant?: 'granted' | 'denied'; events?: StoredEvent[] } = {}) {
  localStorage.clear();
  const log: string[] = [];
  let scheduled: Scheduled[] = [];
  let tapped: ((e: { notification: { id: number } }) => void) | undefined;
  const navigations: string[] = [];
  const permission = { display: 'prompt' };
  const fake = {
    checkPermissions: async () => permission,
    requestPermissions: async () => {
      log.push('request');
      permission.display = opts.grant ?? 'granted';
      return permission;
    },
    cancel: async ({ notifications }: { notifications: { id: number }[] }) => {
      log.push(`cancel ${notifications.length}`);
      scheduled = scheduled.filter((n) => !notifications.some((c) => c.id === n.id));
    },
    schedule: async ({ notifications }: { notifications: Scheduled[] }) => {
      log.push(`schedule ${notifications.length}`);
      scheduled.push(...notifications);
      return { notifications: notifications.map((n) => ({ id: n.id })) };
    },
    addListener: async (_: string, fn: typeof tapped) => {
      tapped = fn;
      return { remove: async () => undefined };
    },
  } as unknown as NotificationsApi;
  const state = signal(replay(opts.events ?? []));

  TestBed.configureTestingModule({
    providers: [
      { provide: NATIVE_PLATFORM, useValue: opts.native ?? true },
      { provide: NOTIFICATIONS, useValue: fake },
      { provide: ProgressService, useValue: { state } },
      { provide: Router, useValue: { navigateByUrl: async (url: string) => navigations.push(url) } },
    ],
  });
  const service = TestBed.inject(ReminderService);
  return { service, log, scheduled: () => scheduled, tap: (id: number) => tapped?.({ notification: { id } }), navigations, state };
}

describe('ReminderService', () => {
  it('asks for permission when turned on and plans one reminder per day with something to do', async () => {
    const { service, log, scheduled } = setup();
    await service.init();
    expect(await service.setEnabled(true)).toBe(true);
    await service.setTime('08:15');
    await service.reschedule();

    expect(log[0]).toBe('request');
    const list = scheduled();
    expect(list).toHaveLength(7);
    expect(new Set(list.map((n) => n.id)).size).toBe(7);
    expect(list.every((n) => n.schedule?.at?.getHours() === 8 && n.schedule.at.getMinutes() === 15)).toBe(true);
    expect(list[0].title).toBe('10 new cards ready');
    expect(list.every((n) => n.isExactNotification === false)).toBe(true);
    expect(service.scheduled()).toBe(7);
    expect(JSON.parse(localStorage.getItem('CapacitorStorage.grasp.reminders')!)).toEqual({ enabled: true, time: '08:15' });
  });

  it('stays off when the permission is declined', async () => {
    const { service, scheduled } = setup({ grant: 'denied' });
    await service.init();
    expect(await service.setEnabled(true)).toBe(false);
    await service.reschedule();
    expect(service.prefs().enabled).toBe(false);
    expect(service.permission()).toBe('denied');
    expect(scheduled()).toHaveLength(0);
  });

  it('does not nag a learner with nothing to do, and clears reminders when turned off', async () => {
    const quiet: StoredEvent = { id: 'evt-settings-1', at: new Date().toISOString(), type: 'settings.changed', settings: { newPerDay: 0 } };
    const { service, scheduled, state, log } = setup();
    await service.init();
    await service.setEnabled(true);
    await service.reschedule();
    expect(scheduled()).toHaveLength(7);

    state.set(replay([quiet]));
    await service.reschedule();
    expect(scheduled()).toHaveLength(0);
    expect(service.scheduled()).toBe(0);

    state.set(replay([]));
    await service.setEnabled(false);
    await service.reschedule();
    expect(scheduled()).toHaveLength(0);
    expect(log.at(-1)).toBe('cancel 7');
  });

  it('opens the review when a reminder is tapped', async () => {
    const { service, tap, navigations } = setup();
    await service.init();
    tap(7_100);
    tap(42);
    expect(navigations).toEqual(['/today/review']);
  });

  it('does nothing on the web', async () => {
    const { service, log } = setup({ native: false });
    await service.init();
    await service.setEnabled(true);
    await service.reschedule();
    expect(service.permission()).toBe('unsupported');
    expect(log).toEqual([]);
  });
});
