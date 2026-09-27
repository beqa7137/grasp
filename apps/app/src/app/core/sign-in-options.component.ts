import { ChangeDetectionStrategy, Component, DestroyRef, ErrorHandler, inject, input, output, signal } from '@angular/core';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logoGithub, logoGoogle } from 'ionicons/icons';
import { ApiError } from './api.service';
import { AuthService, type SignInProvider } from './auth.service';

export const SIGN_IN_LABELS: Record<SignInProvider, string> = { google: 'Google', github: 'GitHub' };
export const SIGN_IN_ICONS: Record<SignInProvider, string> = { google: 'logo-google', github: 'logo-github' };
const EXPLAINED_ERRORS = new Set(['account_exists', 'email_unverified', 'identity_in_use', 'rate_limited']);

export function signInErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code !== undefined && EXPLAINED_ERRORS.has(error.code)
    ? error.message
    : "Sign-in didn't complete. Please try again.";
}

@Component({
  selector: 'app-sign-in-options',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, IonSpinner],
  template: `
    @if (auth.providers(); as providers) {
      @if (providers.length) {
        <div class="providers">
          @for (provider of providers; track provider) {
            <button class="g-btn" [disabled]="busy() || disabled()" (click)="signIn(provider)">
              <ion-icon [name]="icons[provider]" aria-hidden="true" />Continue with {{ labels[provider] }}
            </button>
          }
        </div>
      } @else {
        <p class="muted">Sign-in isn't available on this device. You can keep studying and use scripted practice.</p>
      }
    } @else if (auth.providersFailed()) {
      <p class="muted">Couldn't load sign-in options.</p>
      <button class="g-btn" [disabled]="busy() || disabled()" (click)="auth.loadProviders()">Try again</button>
    } @else {
      <p class="muted loading" role="status"><ion-spinner name="crescent" />Loading sign-in options…</p>
    }
    @if (busy()) {
      <p class="muted" role="status">Waiting for sign-in…</p>
    }
    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }
    @if (cancelLabel(); as label) {
      <button class="g-btn ghost cancel" [disabled]="busy() || disabled()" (click)="cancelled.emit()">{{ label }}</button>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    p {
      margin: 0 0 12px;
      line-height: 1.5;
    }
    .providers {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .providers button {
      flex: 1 1 220px;
      padding: 12px 14px;
    }
    .loading {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    ion-spinner {
      width: 18px;
      height: 18px;
    }
    .error {
      color: var(--g-danger);
      font-size: 0.875rem;
    }
    .cancel {
      margin-bottom: 8px;
    }
  `,
})
export class SignInOptionsComponent {
  readonly auth = inject(AuthService);
  private readonly errors = inject(ErrorHandler);
  private readonly destroyRef = inject(DestroyRef);
  readonly disabled = input(false);
  readonly cancelLabel = input<string | null>(null);
  readonly signedIn = output<void>();
  readonly cancelled = output<void>();
  readonly busyChange = output<boolean>();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly labels = SIGN_IN_LABELS;
  readonly icons = SIGN_IN_ICONS;

  constructor() {
    addIcons({ logoGoogle, logoGithub });
    void this.auth.loadProviders();
  }

  async signIn(provider: SignInProvider) {
    if (this.busy() || this.disabled()) return;
    this.busy.set(true);
    this.busyChange.emit(true);
    this.error.set(null);
    try {
      if ((await this.auth.signIn(provider)) && !this.destroyRef.destroyed) this.signedIn.emit();
    } catch (error) {
      this.error.set(signInErrorMessage(error));
      if (!(error instanceof ApiError)) this.errors.handleError(error);
    } finally {
      this.busy.set(false);
      if (!this.destroyRef.destroyed) this.busyChange.emit(false);
    }
  }
}
