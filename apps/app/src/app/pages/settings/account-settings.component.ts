import { ChangeDetectionStrategy, Component, ErrorHandler, computed, inject, signal } from '@angular/core';
import { AlertController, IonIcon, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logoGithub, logoGoogle } from 'ionicons/icons';
import { ApiError } from '../../core/api.service';
import { AuthService, SIGN_IN_PROVIDERS, UnsyncedStories, type SignInProvider } from '../../core/auth.service';
import { SIGN_IN_ICONS, SIGN_IN_LABELS, SignInOptionsComponent, signInErrorMessage } from '../../core/sign-in-options.component';

function unsyncedWarning(count: number, checked: boolean): string {
  const stories = count === 1 ? '1 story' : `${count} stories`;
  const them = count === 1 ? 'it' : 'them';
  return checked
    ? `${stories} ${count === 1 ? 'has' : 'have'} not reached your account. Signing out removes ${them} from this device.`
    : `${stories} on this device could not be checked against your account. Signing out removes ${them} from this device.`;
}

@Component({
  selector: 'app-account-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, SignInOptionsComponent],
  template: `
    <section class="panel block">
      <h2>Account</h2>
      @if (account(); as user) {
        <div class="row">
          <div>
            <strong>{{ user.email }}</strong>
            <p class="muted small">Progress and behavioral stories sync across every device where you sign in.</p>
          </div>
          <button class="g-btn" [disabled]="busy()" (click)="confirmSignOut()">Sign out</button>
        </div>
        @if (methods().length) {
          <h3 id="sign-in-methods">Sign-in methods</h3>
          <ul class="methods" aria-labelledby="sign-in-methods">
            @for (method of methods(); track method.provider) {
              <li class="row">
                <div class="method">
                  <ion-icon [name]="icons[method.provider]" aria-hidden="true" />
                  <div>
                    <strong>{{ labels[method.provider] }}</strong>
                    @if (method.identity; as identity) {
                      <p class="muted small">Connected{{ identity.email ? ' · ' + identity.email : '' }}</p>
                    }
                  </div>
                </div>
                @if (!method.identity) {
                  <button
                    class="g-btn"
                    [attr.aria-label]="'Connect ' + labels[method.provider]"
                    [disabled]="busy()"
                    (click)="connect(method.provider)"
                  >
                    Connect
                  </button>
                }
              </li>
            }
          </ul>
        }
      } @else {
        @if (auth.signInRequired()) {
          <p class="notice">Your session ended. Sign in again to keep syncing this device's progress.</p>
        }
        <p class="muted intro">Study and scripted practice work without an account. Sign in to sync progress and use AI interviews.</p>
        <app-sign-in-options [disabled]="busy()" (busyChange)="signingIn.set($event)" (signedIn)="confirmSignedIn()" />
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </section>
  `,
  styles: `
    .block {
      padding: 18px 18px 8px;
      margin-bottom: 16px;
    }
    h2 {
      font: 600 1.0625rem/1.2 var(--g-font-display);
      margin: 0 0 8px;
    }
    h3 {
      font: 600 0.875rem/1.2 var(--g-font-display);
      color: var(--g-muted);
      margin: 12px 0 8px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0;
      border-top: 1px solid var(--g-line);
    }
    .row p {
      margin: 2px 0 0;
    }
    .row .g-btn {
      flex: none;
    }
    .small {
      font-size: 0.8125rem;
    }
    .intro {
      margin: 0 0 12px;
      line-height: 1.5;
    }
    .methods {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .method {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .method ion-icon {
      flex: none;
      font-size: 20px;
    }
    .notice {
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(var(--g-warn-rgb), 0.12);
      color: var(--g-warn);
      font-size: 0.875rem;
    }
    .error {
      color: var(--g-danger);
      font-size: 0.875rem;
      line-height: 1.45;
      margin: 0 0 12px;
    }
  `,
})
export class AccountSettingsComponent {
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  private readonly errors = inject(ErrorHandler);
  readonly auth = inject(AuthService);
  readonly busy = signal(false);
  readonly signingIn = signal(false);
  readonly account = computed(() => (this.signingIn() ? null : this.auth.user()));
  readonly error = signal<string | null>(null);
  readonly labels = SIGN_IN_LABELS;
  readonly icons = SIGN_IN_ICONS;

  /** Linked providers, plus the ones this device could connect. Empty until the account's identities load. */
  readonly methods = computed(() => {
    const identities = this.auth.identities();
    if (!identities) return [];
    const available = this.auth.providers() ?? [];
    return SIGN_IN_PROVIDERS.map((provider) => ({ provider, identity: identities.find((i) => i.provider === provider) ?? null })).filter(
      (method) => method.identity || available.includes(method.provider),
    );
  });

  constructor() {
    addIcons({ logoGoogle, logoGithub });
    if (this.auth.signedIn()) void this.auth.loadProviders();
    void this.auth.loadIdentities();
  }

  confirmSignedIn() {
    return this.toast('Signed in. Your progress is now synced to your account.');
  }

  async connect(provider: SignInProvider) {
    this.error.set(null);
    this.busy.set(true);
    try {
      if (await this.auth.connect(provider)) await this.toast(`You can now sign in with ${SIGN_IN_LABELS[provider]} too.`);
    } catch (e) {
      this.error.set(signInErrorMessage(e));
      // API errors are reported by the server; plugin failures (such as a misconfigured client) are only visible here.
      if (!(e instanceof ApiError)) this.errors.handleError(e);
    } finally {
      this.busy.set(false);
    }
  }

  async confirmSignOut() {
    this.busy.set(true);
    let unsynced;
    try {
      unsynced = await this.auth.unsyncedStories();
    } catch {
      await this.toast('Could not check your stories before signing out. Please try again.');
      return;
    } finally {
      this.busy.set(false);
    }
    const alert = await this.alerts.create({
      header: 'Sign out?',
      message: unsynced.count
        ? unsyncedWarning(unsynced.count, unsynced.checked)
        : 'Your progress stays in your account. This device starts fresh until you sign in again.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Sign out', role: 'destructive', handler: () => void this.signOut(unsynced.count > 0) },
      ],
    });
    await alert.present();
  }

  private async signOut(discardUnsyncedStories: boolean) {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.signOut(discardUnsyncedStories);
    } catch (e) {
      await this.toast(
        e instanceof UnsyncedStories
          ? 'Some stories have not reached your account yet, so nothing was removed. Try signing out again.'
          : 'Could not finish signing out. Please try again.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async toast(message: string) {
    const toast = await this.toasts.create({ message, duration: 3500, position: 'bottom' });
    await toast.present();
  }
}
