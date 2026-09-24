import { SIGN_IN_CALLBACK_PATH, answersPendingSignIn, stripOAuthResponse } from './sign-in-callback';

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

describe('stripOAuthResponse', () => {
  const origin = 'https://grasp.example';
  const strip = (path: string) => stripOAuthResponse(new URL(`${origin}${path}`));

  it('leaves a URL without an OAuth response alone', () => {
    expect(strip('/settings')).toBeNull();
    expect(strip('/drill?pattern=two-pointers#top')).toBeNull();
    expect(strip('/settings?#')).toBeNull();
  });

  it('removes an authorization code or refusal from the query, keeping the rest', () => {
    expect(strip('/settings?code=c&state=s')).toBe(`${origin}/settings`);
    expect(strip('/drill?pattern=two-pointers&code=c&state=s#top')).toBe(`${origin}/drill?pattern=two-pointers#top`);
    expect(strip('/settings?error=access_denied&error_description=denied&error_uri=https%3A%2F%2Fdocs.github.com')).toBe(
      `${origin}/settings`,
    );
  });

  it('removes tokens, codes and refusals from the fragment, keeping the rest', () => {
    expect(strip('/settings#access_token=t&token_type=bearer&expires_in=300&scope=user%3Aemail&state=s')).toBe(`${origin}/settings`);
    expect(strip('/settings?pattern=p#id_token=i&keep=1&access_token=a')).toBe(`${origin}/settings?pattern=p#keep=1`);
    expect(strip('/settings#error=access_denied')).toBe(`${origin}/settings`);
    expect(strip('/settings#code=c&state=s')).toBe(`${origin}/settings`);
  });

  it("removes tokens from the query too, since the plugin's GitHub flow reads the query and the fragment as one", () => {
    expect(strip('/settings?access_token=t&token_type=bearer')).toBe(`${origin}/settings`);
    expect(strip('/settings?pattern=p&id_token=i')).toBe(`${origin}/settings?pattern=p`);
  });

  it('recognizes encoded keys, and keeps the exact text of everything else', () => {
    expect(strip('/settings?acc%65ss_token=t')).toBe(`${origin}/settings`);
    expect(strip('/settings#%63ode=c')).toBe(`${origin}/settings`);
    expect(strip('/drill?q=a%20b+c&code=c&pattern=%E2%9C%93')).toBe(`${origin}/drill?q=a%20b+c&pattern=%E2%9C%93`);
  });
});
