import { DestroyRef, Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { planReminders } from '@grasp/engine';
import { ProgressService } from '../core/progress.service';
import { type ClockTime, parseClockTime, upcomingTimes } from './reminder-times';

const PREFS_KEY = 'grasp.reminders';
const DAYS_AHEAD = 7;
/** Notification ids owned by reminders; one per scheduled day. */
const ID_BASE = 7_100;
const RESCHEDULE_DEBOUNCE_MS = 1_500;

export interface ReminderPrefs {
  enabled: boolean;
  time: ClockTime;
}

export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

const DEFAULT_PREFS: ReminderPrefs = { enabled: false, time: '19:00' };

export type NotificationsApi = Pick<
  typeof LocalNotifications,
  'checkPermissions' | 'requestPermissions' | 'schedule' | 'cancel' | 'addListener'
>;

export const NOTIFICATIONS = new InjectionToken<NotificationsApi>('local notifications', { factory: () => LocalNotifications });
export const NATIVE_PLATFORM = new InjectionToken<boolean>('native platform', { factory: () => Capacitor.isNativePlatform() });

/**
 * Daily study reminders as local notifications, planned from the review forecast: each of the next
 * seven days gets one only if there will be something to do, and the texts say how much. Replanned
 * whenever progress changes, so studying early quietly drops today's reminder. Device-local by design.
 */
@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly progress = inject(ProgressService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NOTIFICATIONS);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly supported = inject(NATIVE_PLATFORM);
  readonly prefs = signal<ReminderPrefs>(DEFAULT_PREFS);
  readonly permission = signal<ReminderPermission>(this.supported ? 'prompt' : 'unsupported');
  readonly active = computed(() => this.prefs().enabled && this.permission() === 'granted');
  /** How many reminders are currently scheduled, for the settings screen. */
  readonly scheduled = signal(0);

  constructor() {
    effect(() => {
      this.progress.state();
      this.prefs();
      this.permission();
      untracked(() => this.queueReschedule());
    });
    // Coming back after a day or more shifts the 7-day window even when no progress changed.
    const onVisible = () => document.visibilityState === 'visible' && this.queueReschedule();
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: PREFS_KEY });
    const saved = value ? (JSON.parse(value) as Partial<ReminderPrefs>) : {};
    this.prefs.set({
      enabled: saved.enabled === true,
      time: saved.time && parseClockTime(saved.time) ? saved.time : DEFAULT_PREFS.time,
    });
    if (!this.supported) return;
    this.permission.set(toPermission((await this.notifications.checkPermissions()).display));
    await this.notifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      if (notification.id >= ID_BASE && notification.id < ID_BASE + DAYS_AHEAD) void this.router.navigateByUrl('/drill');
    });
  }

  /** Returns false when the learner declined the notification permission. */
  async setEnabled(enabled: boolean): Promise<boolean> {
    if (enabled && this.supported && this.permission() !== 'granted') {
      this.permission.set(toPermission((await this.notifications.requestPermissions()).display));
      if (this.permission() !== 'granted') return false;
    }
    await this.save({ ...this.prefs(), enabled });
    return true;
  }

  async setTime(time: ClockTime): Promise<void> {
    if (!parseClockTime(time)) return;
    await this.save({ ...this.prefs(), time });
  }

  private async save(prefs: ReminderPrefs) {
    this.prefs.set(prefs);
    await Preferences.set({ key: PREFS_KEY, value: JSON.stringify(prefs) });
  }

  private queueReschedule() {
    if (!this.supported) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.reschedule(), RESCHEDULE_DEBOUNCE_MS);
  }

  /** Replans now instead of after the debounce. */
  async reschedule(): Promise<void> {
    if (!this.supported) return;
    clearTimeout(this.timer);
    const ids = Array.from({ length: DAYS_AHEAD }, (_, i) => ({ id: ID_BASE + i }));
    await this.notifications.cancel({ notifications: ids });
    if (!this.active()) {
      this.scheduled.set(0);
      return;
    }
    const now = new Date();
    const times = upcomingTimes(now, this.prefs().time, DAYS_AHEAD);
    const reminders = planReminders(this.progress.state(), times, now.getTimezoneOffset());
    if (reminders.length) {
      await this.notifications.schedule({
        notifications: reminders.map((r) => ({
          id: ID_BASE + times.indexOf(r.at),
          title: r.title,
          body: r.body,
          schedule: { at: r.at, allowWhileIdle: true },
          // A daily nudge does not need minute precision. Exact alarms would make Android 12+ open the
          // "Alarms & reminders" settings screen on every replan, and Play restricts that permission.
          isExactNotification: false,
        })),
      });
    }
    this.scheduled.set(reminders.length);
  }
}

function toPermission(state: string): ReminderPermission {
  return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
}
