import { ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService, type SignInProvider } from './auth.service';
import { SignInOptionsComponent } from './sign-in-options.component';

function setup(outcome: () => Promise<boolean> = async () => true) {
  const auth = {
    providers: signal<SignInProvider[] | null>(['github']),
    providersFailed: signal(false),
    loadProviders: vi.fn(async () => undefined),
    signIn: vi.fn(outcome),
  };
  const reported = vi.fn();
  TestBed.configureTestingModule({
    imports: [SignInOptionsComponent],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: ErrorHandler, useValue: { handleError: reported } },
    ],
  });
  const fixture = TestBed.createComponent(SignInOptionsComponent);
  const completed = vi.fn();
  const cancelled = vi.fn();
  fixture.componentInstance.signedIn.subscribe(completed);
  fixture.componentInstance.cancelled.subscribe(cancelled);
  fixture.detectChanges();
  return { fixture, auth, completed, cancelled, reported };
}

describe('SignInOptionsComponent', () => {
  it('shares one provider attempt and disables dismissal until it settles', async () => {
    let resolve!: (value: boolean) => void;
    const result = new Promise<boolean>((done) => (resolve = done));
    const { fixture, auth, completed } = setup(() => result);
    fixture.componentRef.setInput('cancelLabel', 'Cancel sign-in');
    const first = fixture.componentInstance.signIn('github');
    await fixture.componentInstance.signIn('github');
    fixture.detectChanges();
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    expect([...fixture.nativeElement.querySelectorAll('button')].every((button: HTMLButtonElement) => button.disabled)).toBe(true);
    resolve(true);
    await first;
    expect(completed).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('does not complete or report an error when the provider is cancelled', async () => {
    const { fixture, completed, reported } = setup(async () => false);
    await fixture.componentInstance.signIn('github');
    expect(completed).not.toHaveBeenCalled();
    expect(reported).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('does not emit completion after its view has been left', async () => {
    let resolve!: (value: boolean) => void;
    const result = new Promise<boolean>((done) => (resolve = done));
    const { fixture, completed } = setup(() => result);
    const warning = vi.spyOn(console, 'warn');
    const signingIn = fixture.componentInstance.signIn('github');
    fixture.destroy();
    resolve(true);
    await signingIn;
    expect(completed).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('honors a disabled parent without starting a provider flow', async () => {
    const { fixture, auth, completed } = setup();
    fixture.componentRef.setInput('disabled', true);
    await fixture.componentInstance.signIn('github');
    expect(auth.signIn).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
  });

  it('distinguishes loading, unavailable providers, and a retryable loading failure', async () => {
    const { fixture, auth } = setup();
    auth.providers.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading sign-in options');
    auth.providersFailed.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load sign-in options.");
    fixture.nativeElement.querySelector('button').click();
    expect(auth.loadProviders).toHaveBeenCalledTimes(2);
    auth.providers.set([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Sign-in isn't available on this device.");
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
