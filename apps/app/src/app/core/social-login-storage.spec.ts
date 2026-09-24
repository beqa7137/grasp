import { GoogleSocialLogin } from '@capgo/capacitor-social-login/dist/esm/google-provider.js';
import { OAuth2SocialLogin } from '@capgo/capacitor-social-login/dist/esm/oauth2-provider.js';
import { clearAfterLogin, clearBeforeLogin, clearPopupMarkers, readPendingSignIn } from './social-login-storage';

describe('social login storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('clears the popup markers an earlier attempt left in this tab, and nothing else', () => {
    sessionStorage.setItem('social_login_oauth_popup', 'nonce-1');
    sessionStorage.setItem('social_login_oauth_delivered', '1');
    sessionStorage.setItem('grasp.other', 'kept');
    localStorage.setItem('social_login_oauth_pending', '{}');
    clearPopupMarkers();
    expect({ ...sessionStorage }).toEqual({ 'grasp.other': 'kept' });
    expect(localStorage.getItem('social_login_oauth_pending')).toBe('{}');
  });

  it('reads the pending sign-in', () => {
    expect(readPendingSignIn()).toBeNull();
    localStorage.setItem('social_login_oauth_pending', '{"provider":"google"}');
    expect(readPendingSignIn()).toBe('{"provider":"google"}');
  });

  it("drops the Google tokens and the PKCE verifiers under the plugin's own private keys, and keeps its provider config", () => {
    const googleTokensKey: string = new GoogleSocialLogin()['GOOGLE_STATE_KEY'];
    const pendingLoginPrefix: string = new OAuth2SocialLogin()['STATE_PREFIX'];
    localStorage.setItem(googleTokensKey, '{"idToken":"i"}');
    localStorage.setItem(`${pendingLoginPrefix}state-1`, '{"codeVerifier":"v1"}');
    localStorage.setItem(`${pendingLoginPrefix}state-2`, '{"codeVerifier":"v2"}');
    localStorage.setItem('capgo_social_login_oauth2_config_github', '{"appId":"Ov23abc"}');
    clearAfterLogin({ rejected: false });
    expect({ ...localStorage }).toEqual({ capgo_social_login_oauth2_config_github: '{"appId":"Ov23abc"}' });
  });

  it('carries on when the browser blocks storage', () => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'key').mockImplementation(blocked);
    expect(readPendingSignIn()).toBeNull();
    expect(() => {
      clearPopupMarkers();
      clearBeforeLogin();
      clearAfterLogin({ rejected: true });
    }).not.toThrow();
  });
});
