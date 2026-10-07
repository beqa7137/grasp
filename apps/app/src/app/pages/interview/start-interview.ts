import type { Router } from '@angular/router';
import { ApiError, type ApiService } from '../../core/api.service';
import { crossState } from '../../ui/cross-link.directive';
import type { InterviewMode, InterviewSession, InterviewTrack } from './interview.types';

export interface InterviewStart {
  track: InterviewTrack;
  /** A problem id; for a behavioral interview a question id, or a competency id for one of its questions. None picks one. */
  problemId?: string;
  mode: InterviewMode;
}

export async function startInterview(api: ApiService, router: Router, start: InterviewStart): Promise<void> {
  const session = await api.post<InterviewSession>('/interview/sessions', start);
  const target = `/mock/${session.id}`;
  // Started from a behavioral question too, so back returns there.
  await router.navigateByUrl(target, { state: crossState(router, target) });
}

/** The API refused the AI interviewer until the learner signs in, or signs in again. */
export const needsSignIn = (error: unknown) =>
  error instanceof ApiError &&
  (error.code === 'ai_sign_in_required' || (error.status === 401 && (error.code === 'token_invalid' || error.code === 'sign_in_required')));
