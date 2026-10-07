import type { Router } from '@angular/router';
import { ApiError, type ApiService } from '../../core/api.service';
import { needsSignIn, startInterview } from './start-interview';

describe('startInterview', () => {
  it('creates the session and opens it', async () => {
    const api = { post: vi.fn(async () => ({ id: 'session' })) };
    const router = { navigate: vi.fn(async () => true) };
    await startInterview(api as unknown as ApiService, router as unknown as Router, {
      track: 'behavioral',
      problemId: 'conflict',
      mode: 'ai',
    });
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/interview/sessions', { track: 'behavioral', problemId: 'conflict', mode: 'ai' });
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/mock', 'session']);
  });

  it('opens nothing when the start is refused', async () => {
    const api = { post: vi.fn(async () => Promise.reject(new ApiError(503, 'Unavailable', 'ai_unavailable'))) };
    const router = { navigate: vi.fn(async () => true) };
    await expect(
      startInterview(api as unknown as ApiService, router as unknown as Router, { track: 'behavioral', mode: 'ai' }),
    ).rejects.toThrow('Unavailable');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('needsSignIn', () => {
  it('is true for an AI refusal to a guest and for a session that ended, and nothing else', () => {
    expect(needsSignIn(new ApiError(403, 'Sign in', 'ai_sign_in_required'))).toBe(true);
    expect(needsSignIn(new ApiError(401, 'Sign in again', 'token_invalid'))).toBe(true);
    expect(needsSignIn(new ApiError(401, 'Sign in again', 'sign_in_required'))).toBe(true);
    expect(needsSignIn(new ApiError(503, 'Unavailable', 'ai_unavailable'))).toBe(false);
    expect(needsSignIn(new ApiError(401, 'Other', 'something_else'))).toBe(false);
    expect(needsSignIn(new Error('network'))).toBe(false);
  });
});
