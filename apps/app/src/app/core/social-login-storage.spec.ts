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
