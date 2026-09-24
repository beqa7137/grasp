import { SIGN_IN_CALLBACK_PATH, answersPendingSignIn } from './sign-in-callback';

const PENDING_KEY = 'social_login_oauth_pending';
const githubPending = JSON.stringify({ provider: 'oauth2', providerId: 'github', state: 'victim-state' });
const googlePending = JSON.stringify({ provider: 'google', loginType: 'online', nonce: 'victim-nonce' });

const callback = (rest: string) => new URL(`https://grasp.example${SIGN_IN_CALLBACK_PATH}${rest}`);

function answers(pending: string | null, rest: string): boolean {
  localStorage.clear();
  if (pending !== null) localStorage.setItem(PENDING_KEY, pending);
  return answersPendingSignIn(callback(rest));
}

describe('answersPendingSignIn', () => {
  afterEach(() => localStorage.clear());

  it('is the path the app registers as its web redirect', () => {
    expect(SIGN_IN_CALLBACK_PATH).toBe('/auth/callback');
  });

  it('turns away every callback while no sign-in is pending, or when the pending entry is unreadable', () => {
    expect(answers(null, '?code=c&state=victim-state')).toBe(false);
    expect(answers(null, '#access_token=a&id_token=i')).toBe(false);
    expect(answers('true', '#access_token=a&id_token=i')).toBe(false);
    expect(answers('{not json', '?code=c&state=victim-state')).toBe(false);
    expect(answers('null', '?code=c&state=victim-state')).toBe(false);
    expect(answers(JSON.stringify({ provider: 'twitter', state: 'victim-state' }), '?code=c&state=victim-state')).toBe(false);
  });

  describe('GitHub', () => {
    it("accepts the authorization code for the pending flow's state", () => {
      expect(answers(githubPending, '?code=c&state=victim-state')).toBe(true);
    });

    it('accepts a refusal for the pending flow, so it reaches the app as a cancel', () => {
      expect(answers(githubPending, '?error=access_denied&error_description=denied&state=victim-state')).toBe(true);
    });

    it('turns away a code or refusal for any other state', () => {
      expect(answers(githubPending, '?code=c&state=attacker-state')).toBe(false);
      expect(answers(githubPending, '?code=c')).toBe(false);
      expect(answers(githubPending, '?code=c#state=victim-state')).toBe(false);
      expect(answers(githubPending, '?error=access_denied&state=attacker-state')).toBe(false);
      expect(answers(JSON.stringify({ provider: 'oauth2', providerId: 'github' }), '?code=c&state=victim-state')).toBe(false);
    });

    it('turns away a callback with neither a code nor an error', () => {
      expect(answers(githubPending, '?state=victim-state')).toBe(false);
      expect(answers(githubPending, '#code=c&state=victim-state')).toBe(false);
    });

    it('turns away a ticket or token placed in the URL, which would skip the code exchange', () => {
      expect(answers(githubPending, '#access_token=ticket')).toBe(false);
      expect(answers(githubPending, '?state=victim-state#access_token=ticket')).toBe(false);
      expect(answers(githubPending, '?code=c&state=victim-state#access_token=ticket')).toBe(false);
      expect(answers(githubPending, '?code=c&state=victim-state&access_token=ticket')).toBe(false);
      expect(answers(githubPending, '?code=c&state=victim-state#id_token=i')).toBe(false);
      expect(answers(githubPending, '?code=c&state=victim-state&id_token=i')).toBe(false);
    });
  });

  describe('Google', () => {
    it('accepts the implicit-flow tokens in the fragment', () => {
      expect(answers(googlePending, '#access_token=a&token_type=Bearer&id_token=i&state=popup')).toBe(true);
    });

    it('accepts a refusal, so it reaches the app as a cancel', () => {
      expect(answers(googlePending, '#error=access_denied&state=popup')).toBe(true);
      expect(answers(googlePending, '?error=access_denied')).toBe(true);
    });

    it('turns away incomplete tokens, tokens outside the fragment and authorization codes', () => {
      expect(answers(googlePending, '#access_token=a')).toBe(false);
      expect(answers(googlePending, '#id_token=i')).toBe(false);
      expect(answers(googlePending, '?access_token=a&id_token=i')).toBe(false);
      expect(answers(googlePending, '?code=c&scope=openid')).toBe(false);
      expect(answers(googlePending, '#error=access_denied&id_token=i')).toBe(false);
      expect(answers(googlePending, '')).toBe(false);
    });
  });
});
