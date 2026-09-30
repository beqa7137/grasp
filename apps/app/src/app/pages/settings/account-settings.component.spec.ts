import { ErrorHandler, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AlertController, ToastController } from '@ionic/angular';
import { ApiError } from '../../core/api.service';
import { type AccountUser, AuthService, type IdentitySummary, type SignInProvider } from '../../core/auth.service';
import { SignInOptionsComponent } from '../../core/sign-in-options.component';
import { AccountSettingsComponent } from './account-settings.component';

interface Options {
  user?: AccountUser | null;
  providers?: SignInProvider[] | null;
  loadProviders?: () => Promise<SignInProvider[] | null>;
  identities?: IdentitySummary[] | null;
  signInRequired?: boolean;
  outcome?: () => Promise<boolean>;
  unsyncedStories?: () => Promise<{ count: number; checked: boolean }>;
}

interface AlertOptions {
  message: string;
  buttons: { text: string; handler?: () => void }[];
}

function setup(opts: Options = {}) {
  const calls: string[] = [];
  const toasts: string[] = [];
  const reported: unknown[] = [];
  const alerts: AlertOptions[] = [];
  const user = signal(opts.user ?? null);
  const providers = signal(opts.providers === undefined ? ['google', 'github'] : opts.providers);
  const providersFailed = signal(false);
  const auth = {
    user,
    signedIn: computed(() => user() !== null),
    signInRequired: signal(opts.signInRequired ?? false),
    providers,
    providersFailed,
    identities: signal(opts.identities ?? null),
    loadProviders: async () => {
      calls.push('loadProviders');
      if (!opts.loadProviders) return;
      providersFailed.set(false);
      const loaded = await opts.loadProviders();
      providers.set(loaded);
      providersFailed.set(loaded === null);
    },
    loadIdentities: async () => void calls.push('loadIdentities'),
    signIn: async (provider: SignInProvider) => (calls.push(`signIn ${provider}`), (opts.outcome ?? (async () => true))()),
    connect: async (provider: SignInProvider) => (calls.push(`connect ${provider}`), (opts.outcome ?? (async () => true))()),
    unsyncedStories: opts.unsyncedStories ?? (async () => ({ count: 0, checked: true })),
    signOut: async (discardUnsyncedStories: boolean) => void calls.push(`signOut ${discardUnsyncedStories}`),
  };
  TestBed.configureTestingModule({
    imports: [AccountSettingsComponent],
    providers: [
      { provide: AuthService, useValue: auth },
      {
        provide: ToastController,
        useValue: { create: async ({ message }: { message: string }) => ({ present: async () => toasts.push(message) }) },
      },
      {
        provide: AlertController,
        useValue: { create: async (options: AlertOptions) => (alerts.push(options), { present: async () => {} }) },
      },
      { provide: ErrorHandler, useValue: { handleError: (e: unknown) => reported.push(e) } },
    ],
  });
  const fixture = TestBed.createComponent(AccountSettingsComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = () => [...el.querySelectorAll('button')].map((b) => b.textContent!.trim());
  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent!.trim()) === name)!;
  const click = async (name: string) => {
    button(name).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return {
    fixture,
    el,
    auth,
    calls,
    toasts,
    reported,
    alerts,
    buttons,
    button,
    click,
    alert: () => el.querySelector('[role=alert]')?.textContent?.trim(),
  };
}

const ada: AccountUser = { id: 'u1', email: 'ada@example.com' };
const googleIdentity: IdentitySummary = { provider: 'google', email: 'ada@gmail.com', linkedAt: '2026-09-24T00:00:00.000Z' };

describe('AccountSettingsComponent', () => {
  it('loads the providers and the linked methods when it opens', () => {
    const { calls } = setup();
    expect(calls).toEqual(['loadIdentities', 'loadProviders']);
  });

  it('offers every provider this device can sign in with', () => {
    const { el, buttons } = setup();
    expect(el.textContent).toContain(
      'Study and scripted practice work without an account. Sign in to sync progress and use AI interviews.',
    );
    expect(buttons()).toEqual(['Continue with Google', 'Continue with GitHub']);
  });

  it('offers only the available provider', () => {
    const { buttons } = setup({ providers: ['github'] });
    expect(buttons()).toEqual(['Continue with GitHub']);
  });

  it('explains when the server has no sign-in', () => {
    const { el, buttons } = setup({ providers: [] });
    expect(el.textContent).toContain("Sign-in isn't available on this device.");
    expect(buttons()).toEqual([]);
  });

  it('shows neither buttons nor the unavailable notice while the providers are unknown', () => {
    const { el, buttons } = setup({ providers: null });
    expect(buttons()).toEqual([]);
    expect(el.textContent).not.toContain("isn't available");
    expect(el.textContent).not.toContain("Couldn't load");
  });

  it('offers to try again when the sign-in options failed to load', async () => {
    let answer: SignInProvider[] | null = null;
    const { fixture, el, buttons, click, calls } = setup({ providers: null, loadProviders: async () => answer });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain("Couldn't load sign-in options.");
    expect(buttons()).toEqual(['Try again']);

    await click('Try again');
    expect(calls).toEqual(['loadIdentities', 'loadProviders', 'loadProviders']);
    expect(el.textContent).toContain("Couldn't load sign-in options.");

    answer = ['github'];
    await click('Try again');
    expect(el.textContent).not.toContain("Couldn't load");
    expect(buttons()).toEqual(['Continue with GitHub']);
  });

  it('asks to sign in again after the session ended', () => {
    const { el } = setup({ signInRequired: true });
    expect(el.querySelector('.notice')?.textContent).toContain('Your session ended.');
  });

  it('signs in and confirms it', async () => {
    const { click, calls, toasts, alert } = setup();
    await click('Continue with GitHub');
    expect(calls).toContain('signIn github');
    expect(toasts).toEqual(['Signed in. Your progress is now synced to your account.']);
    expect(alert()).toBeUndefined();
  });

  it('keeps the chooser alive while the adopted account finishes syncing', async () => {
    let resolve!: (value: boolean) => void;
    const result = new Promise<boolean>((done) => (resolve = done));
    const { fixture, auth, el, toasts } = setup({ outcome: () => result });
    const chooser = fixture.debugElement.query(By.directive(SignInOptionsComponent)).componentInstance as SignInOptionsComponent;
    const signingIn = chooser.signIn('google');
    auth.user.set(ada);
    fixture.detectChanges();
    expect(el.textContent).toContain('Waiting for sign-in');
    expect(el.textContent).not.toContain('ada@example.com');
    resolve(true);
    await signingIn;
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('ada@example.com');
    expect(el.textContent).not.toContain('Waiting for sign-in');
    expect(toasts).toEqual(['Signed in. Your progress is now synced to your account.']);
  });

  it('stays quiet when the person cancels', async () => {
    const { click, toasts, alert, reported } = setup({ outcome: async () => false });
    await click('Continue with Google');
    expect(toasts).toEqual([]);
    expect(alert()).toBeUndefined();
    expect(reported).toEqual([]);
  });

  it("shows the API's explanation of what to do next", async () => {
    for (const [status, code] of [
      [429, 'rate_limited'],
      [409, 'account_exists'],
      [403, 'email_unverified'],
      [409, 'identity_in_use'],
    ] as const) {
      const { click, alert, reported } = setup({
        outcome: async () => {
          throw new ApiError(status, `What to do about ${code}.`, code);
        },
      });
      await click('Continue with GitHub');
      expect(alert()).toBe(`What to do about ${code}.`);
      expect(reported).toEqual([]);
      TestBed.resetTestingModule();
    }
  });

  it('shows the generic message for any other API error', async () => {
    const { click, alert } = setup({
      outcome: async () => {
        throw new ApiError(401, 'That GitHub sign-in has expired or was already used. Please try again.', 'invalid_ticket');
      },
    });
    await click('Continue with GitHub');
    expect(alert()).toBe("Sign-in didn't complete. Please try again.");
  });

  it('shows a generic message for anything else and reports failures the server never saw', async () => {
    const failure = new Error('Unable to open login window. Please allow popups.');
    const { click, alert, reported, button } = setup({
      outcome: async () => {
        throw failure;
      },
    });
    await click('Continue with Google');
    expect(alert()).toBe("Sign-in didn't complete. Please try again.");
    expect(reported).toEqual([failure]);
    expect(button('Continue with Google').disabled).toBe(false);
  });

  it('shows the account, its linked methods and a way to connect the other provider', () => {
    const { el, buttons, button } = setup({ user: ada, identities: [googleIdentity] });
    expect(el.textContent).toContain('ada@example.com');
    expect(buttons()).toEqual(['Sign out', 'Connect']);
    expect(el.querySelector('h3')?.textContent).toBe('Sign-in methods');
    const rows = [...el.querySelectorAll('.methods li')].map((row) =>
      [...row.querySelectorAll('strong, p, button')].map((part) => part.textContent!.trim()),
    );
    expect(rows).toEqual([
      ['Google', 'Connected · ada@gmail.com'],
      ['GitHub', 'Connect'],
    ]);
    expect(button('Connect GitHub')).toBeDefined();
    expect(el.textContent).not.toContain('Continue with');
  });

  it('keeps linked methods listed even where this device cannot sign in with them', () => {
    const { el } = setup({ user: ada, identities: [googleIdentity], providers: ['github'] });
    expect([...el.querySelectorAll('.methods li strong')].map((s) => s.textContent)).toEqual(['Google', 'GitHub']);
    expect(el.querySelector('[aria-label="Connect Google"]')).toBeNull();
  });

  it('hides the methods until they have loaded', () => {
    const { el } = setup({ user: ada, identities: null });
    expect(el.textContent).not.toContain('Sign-in methods');
  });

  it('connects a provider and explains when it belongs to another account', async () => {
    const connected = setup({ user: ada, identities: [googleIdentity] });
    await connected.click('Connect GitHub');
    expect(connected.calls).toContain('connect github');
    expect(connected.toasts).toEqual(['You can now sign in with GitHub too.']);
    TestBed.resetTestingModule();

    const inUse = setup({
      user: ada,
      identities: [googleIdentity],
      outcome: async () => {
        throw new ApiError(409, 'That GitHub account is already linked to a different Grasp account.', 'identity_in_use');
      },
    });
    await inUse.click('Connect GitHub');
    expect(inUse.alert()).toBe('That GitHub account is already linked to a different Grasp account.');
  });

  it('warns before signing out that stories which have not reached the account leave the device', async () => {
    const { click, alerts, calls } = setup({
      user: ada,
      identities: [googleIdentity],
      unsyncedStories: async () => ({ count: 2, checked: true }),
    });
    await click('Sign out');
    expect(alerts[0]?.message).toBe('2 stories have not reached your account. Signing out removes them from this device.');
    alerts[0]!.buttons.find((b) => b.text === 'Sign out')!.handler!();
    expect(calls).toContain('signOut true');
  });

  it('says the stories could not be checked when the account could not be asked', async () => {
    const { click, alerts } = setup({
      user: ada,
      identities: [googleIdentity],
      unsyncedStories: async () => ({ count: 1, checked: false }),
    });
    await click('Sign out');
    expect(alerts[0]?.message).toBe(
      '1 story on this device could not be checked against your account. Signing out removes it from this device.',
    );
  });

  it('asks to try again, signing nothing out, when the stories cannot be read', async () => {
    const { click, alerts, calls, toasts } = setup({
      user: ada,
      identities: [googleIdentity],
      unsyncedStories: async () => Promise.reject(new SyntaxError('Unexpected token')),
    });
    await click('Sign out');
    expect(alerts).toEqual([]);
    expect(calls.some((call) => call.startsWith('signOut'))).toBe(false);
    expect(toasts).toEqual(['Could not check your stories before signing out. Please try again.']);
  });

  it('signs out without a warning when every story is in the account', async () => {
    const { click, alerts, calls } = setup({ user: ada, identities: [googleIdentity] });
    await click('Sign out');
    expect(alerts[0]?.message).toBe('Your progress stays in your account. This device starts fresh until you sign in again.');
    alerts[0]!.buttons.find((b) => b.text === 'Sign out')!.handler!();
    expect(calls).toContain('signOut false');
  });
});
