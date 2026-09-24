import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { RuntimeConfigService } from './runtime-config.service';
import { DEVICE_PLATFORM, type ProviderConfig, SOCIAL_LOGIN, type SocialLoginApi, SocialSignInService } from './social-sign-in.service';

const WEB_CLIENT = 'web.apps.googleusercontent.com';
const IOS_CLIENT = 'ios.apps.googleusercontent.com';
const serverConfig: ProviderConfig = {
  google: { webClientId: WEB_CLIENT, iosClientId: IOS_CLIENT },
  github: { clientId: 'Ov23abc', authorizeUrl: 'https://github.com/login/oauth/authorize' },
};

const cancelled = () => Object.assign(new Error('User cancelled'), { code: 'USER_CANCELLED' });

const base64url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
/** An unsigned ID token: only the API checks signatures. The name puts `-` and `_` into the payload. */
const idToken = (claims: Record<string, unknown>) =>
  `${base64url('{"alg":"RS256"}')}.${base64url(JSON.stringify({ name: 'Zoë ??>>', ...claims }))}.signature`;
const googleResult = (nonce: unknown) => ({
  provider: 'google',
  result: { responseType: 'online', idToken: idToken({ sub: '1', nonce }), accessToken: { token: 'google-access' } },
});

interface Options {
  platform?: 'web' | 'ios' | 'android';
  config?: ProviderConfig;
  apiBase?: string;
  googleIosClientId?: string | null;
  login?: (options: { provider: string; options: Record<string, unknown> }) => Promise<unknown>;
}

function setup(opts: Options = {}) {
  const log: unknown[][] = [];
  let configFetches = 0;
  const plugin = {
    initialize: async (options: unknown) => void log.push(['initialize', options]),
    login: async (options: { provider: string; options: Record<string, unknown> }) => {
      log.push(['login', options]);
      if (opts.login) return opts.login(options);
      return options.provider === 'google'
        ? googleResult(options.options['nonce'])
        : { provider: 'oauth2', result: { providerId: 'github', accessToken: { token: 'grasp-ticket' } } };
    },
    logout: async (options: unknown) => void log.push(['logout', options]),
  } as unknown as SocialLoginApi;
  TestBed.configureTestingModule({
    providers: [
      { provide: DEVICE_PLATFORM, useValue: opts.platform ?? 'web' },
      { provide: SOCIAL_LOGIN, useValue: async () => plugin },
      {
        provide: ApiService,
        useValue: { get: async (path: string) => (configFetches++, expect(path).toBe('/auth/config'), opts.config ?? serverConfig) },
      },
      {
        provide: RuntimeConfigService,
        useValue: {
          apiBase: () => opts.apiBase ?? '/api',
          config: () => ({ googleIosClientId: opts.googleIosClientId ?? null }),
        },
      },
    ],
  });
  return { social: TestBed.inject(SocialSignInService), log, fetches: () => configFetches };
}

const initialized = (log: unknown[][]) => log.filter(([call]) => call === 'initialize').map(([, options]) => options);

describe('SocialSignInService', () => {
  it('offers what the server enables on the web and Android, fetching the config once', async () => {
    for (const platform of ['web', 'android'] as const) {
      const { social, fetches } = setup({ platform });
      expect(await social.providers()).toEqual(serverConfig);
      await social.providers();
      expect(fetches()).toBe(1);
      TestBed.resetTestingModule();
    }
  });

  it('offers Google on iOS only when the build registered the same iOS client', async () => {
    const matching = setup({ platform: 'ios', googleIosClientId: IOS_CLIENT });
    expect((await matching.social.providers()).google).toEqual(serverConfig.google);
    TestBed.resetTestingModule();

    const otherBuild = setup({ platform: 'ios', googleIosClientId: 'other.apps.googleusercontent.com' });
    expect(await otherBuild.social.providers()).toEqual({ google: null, github: serverConfig.github });
    TestBed.resetTestingModule();

    const noIosClient = setup({ platform: 'ios', config: { ...serverConfig, google: { webClientId: WEB_CLIENT, iosClientId: null } } });
    expect((await noIosClient.social.providers()).google).toBeNull();
  });

  it('initializes the plugin once for the web popup flow, with an absolute token endpoint', async () => {
    const { social, log } = setup();
    await social.github();
    await social.github();
    expect(initialized(log)).toEqual([
      {
        google: {
          webClientId: WEB_CLIENT,
          iOSClientId: IOS_CLIENT,
          iOSServerClientId: WEB_CLIENT,
          mode: 'online',
          redirectUrl: `${location.origin}/auth/callback`,
        },
        oauth2: {
          github: {
            appId: 'Ov23abc',
            authorizationBaseUrl: 'https://github.com/login/oauth/authorize',
            accessTokenEndpoint: `${location.origin}/api/auth/github/token`,
            redirectUrl: `${location.origin}/auth/callback`,
            scope: 'user:email',
            pkceEnabled: true,
            responseType: 'code',
            androidUseCustomTabs: true,
          },
        },
      },
    ]);
  });

  it('uses the app scheme and the configured API on native, and leaves out providers this build cannot use', async () => {
    const { social, log } = setup({ platform: 'ios', apiBase: 'https://grasp.example/api' });
    await social.github();
    expect(initialized(log)).toEqual([
      {
        oauth2: {
          github: expect.objectContaining({
            accessTokenEndpoint: 'https://grasp.example/api/auth/github/token',
            redirectUrl: 'dev.grasp.app://oauth/github',
          }),
        },
      },
    ]);
  });

  it('returns the Google ID token for the server nonce and signs out of Google on native', async () => {
    const { social, log } = setup({ platform: 'android' });
    expect(await social.google('nonce-1')).toBe(idToken({ sub: '1', nonce: 'nonce-1' }));
    expect(log.slice(1)).toEqual([
      ['login', { provider: 'google', options: { nonce: 'nonce-1', forcePrompt: true } }],
      ['logout', { provider: 'google' }],
    ]);
    const google = (initialized(log)[0] as { google: Record<string, unknown> }).google;
    expect(google['redirectUrl']).toBeUndefined();
  });

  it('keeps the Google logout off the web, where the plugin cannot complete it', async () => {
    const { social, log } = setup({ platform: 'web' });
    expect(await social.google('nonce-1')).toBe(idToken({ sub: '1', nonce: 'nonce-1' }));
    expect(log.filter(([call]) => call === 'logout')).toEqual([]);
  });

  it('hands the plugin a fresh PKCE verifier for each GitHub sign-in and returns it with the ticket, which it clears from the plugin', async () => {
    const { social, log } = setup();
    const first = await social.github();
    const second = await social.github();
    expect(first?.ticket).toBe('grasp-ticket');
    expect(first?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second?.codeVerifier).not.toBe(first?.codeVerifier);
    expect(log.slice(1)).toEqual([
      ['login', { provider: 'oauth2', options: { providerId: 'github', codeVerifier: first?.codeVerifier } }],
      ['logout', { provider: 'oauth2', providerId: 'github' }],
      ['login', { provider: 'oauth2', options: { providerId: 'github', codeVerifier: second?.codeVerifier } }],
      ['logout', { provider: 'oauth2', providerId: 'github' }],
    ]);
  });

  it('turns a cancelled provider screen into null and passes real failures on', async () => {
    const cancelling = setup({
      login: async () => {
        throw cancelled();
      },
    });
    expect(await cancelling.social.github()).toBeNull();
    expect(await cancelling.social.google('nonce-1')).toBeNull();
    expect(cancelling.log.filter(([call]) => call === 'logout')).toEqual([]);
    TestBed.resetTestingModule();

    const failing = setup({
      login: async () => {
        throw new Error('Unable to open login window. Please allow popups.');
      },
    });
    await expect(failing.social.github()).rejects.toThrow('allow popups');
  });

  it('rejects a Google ID token issued for a different sign-in', async () => {
    for (const token of [
      idToken({ sub: '1', nonce: 'attacker-nonce' }),
      idToken({ sub: '1' }),
      'not-a-jwt',
      'a.%%%.c',
      `a.${base64url('null')}.c`,
    ]) {
      const { social } = setup({ login: async () => ({ provider: 'google', result: { responseType: 'online', idToken: token } }) });
      await expect(social.google('nonce-1')).rejects.toThrow('different sign-in');
      TestBed.resetTestingModule();
    }
  });

  it('treats a refusal at GitHub as a cancel, whichever way the plugin words it', async () => {
    for (const message of ['The user has denied your application access.', 'access_denied']) {
      const { social } = setup({
        login: async () => {
          throw new Error(message);
        },
      });
      expect(await social.github()).toBeNull();
      TestBed.resetTestingModule();
    }
  });

  it('rejects a GitHub result without a ticket', async () => {
    const { social } = setup({ login: async () => ({ provider: 'oauth2', result: { providerId: 'github', accessToken: null } }) });
    await expect(social.github()).rejects.toThrow('no ticket');
  });
});

describe('SocialSignInService web storage', () => {
  const leftovers = {
    session: { social_login_oauth_popup: 'nonce-0', social_login_oauth_delivered: '1', 'grasp.session': 'kept' },
    local: {
      social_login_oauth_pending: '{"provider":"google","nonce":"nonce-0"}',
      capgo_social_login_google_state: '{"accessToken":"a","idToken":"i"}',
      'social_login_oauth_result_nonce-0': '{"type":"oauth-error"}',
      'social_login_oauth_result_state-0': '{"type":"oauth-response"}',
      'capgo_social_login_oauth2_state_state-0': '{"providerId":"github","codeVerifier":"abandoned-verifier"}',
      capgo_social_login_oauth2_config_github: '{"appId":"Ov23abc"}',
      'grasp.local': 'kept',
    },
  };
  const kept = {
    session: { 'grasp.session': 'kept' },
    local: { capgo_social_login_oauth2_config_github: '{"appId":"Ov23abc"}', 'grasp.local': 'kept' },
  };
  const stored = () => ({ session: { ...sessionStorage }, local: { ...localStorage } });

  function leaveOldAttempt() {
    for (const [key, value] of Object.entries(leftovers.session)) sessionStorage.setItem(key, value);
    for (const [key, value] of Object.entries(leftovers.local)) localStorage.setItem(key, value);
  }

  beforeEach(leaveOldAttempt);
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('gives the popup a tab without a stale delivery flag', async () => {
    let deliveredAtLogin: string | null = 'unset';
    const { social } = setup({
      login: async (options) => (
        (deliveredAtLogin = sessionStorage.getItem('social_login_oauth_delivered')),
        googleResult(options.options['nonce'])
      ),
    });
    await social.google('nonce-1');
    expect(deliveredAtLogin).toBeNull();
  });

  it('drops the markers, Google tokens, relayed results and abandoned PKCE verifiers after a sign-in, leaving the finished flow to the plugin', async () => {
    for (const provider of ['google', 'github'] as const) {
      const { social } = setup();
      expect(await (provider === 'google' ? social.google('nonce-1') : social.github())).toBeTruthy();
      expect(stored()).toEqual({
        session: kept.session,
        local: { ...kept.local, social_login_oauth_pending: leftovers.local.social_login_oauth_pending },
      });
      TestBed.resetTestingModule();
      leaveOldAttempt();
    }
  });

  it('also drops the pending flow after a cancel', async () => {
    const { social } = setup({
      login: async () => {
        throw cancelled();
      },
    });
    expect(await social.google('nonce-1')).toBeNull();
    expect(stored()).toEqual(kept);
  });

  it('also drops the pending flow after a failure', async () => {
    const { social } = setup({
      login: async () => {
        throw new Error('Failed to open popup');
      },
    });
    await expect(social.google('nonce-1')).rejects.toThrow('Failed to open popup');
    expect(stored()).toEqual(kept);
  });

  it('signs in even when the browser blocks storage', async () => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'key').mockImplementation(blocked);
    try {
      const { social } = setup();
      expect(await social.github()).toMatchObject({ ticket: 'grasp-ticket' });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('leaves storage alone in the native apps', async () => {
    const { social } = setup({ platform: 'android' });
    await social.google('nonce-1');
    await social.github();
    expect(stored()).toEqual(leftovers);
  });
});
