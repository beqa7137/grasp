import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { AuthSession } from '../../src/auth/session.service.js';
import { freshIp, type OAuthFakes } from './oauth.js';

export async function signInLearner(app: NestExpressApplication, fakes: OAuthFakes, learnerId = randomUUID()) {
  const http = () => request(app.getHttpServer());
  const credential = await fakes.googleCredential(http, { sub: learnerId, email: `${learnerId}@example.com` });
  const response = await http()
    .post('/api/auth/google')
    .set('X-Forwarded-For', freshIp())
    .set('x-learner-id', learnerId)
    .send(credential)
    .expect(200);
  const session = response.body as AuthSession;
  expect(session.learnerId).toBe(learnerId);
  return { learnerId, headers: { Authorization: `Bearer ${session.accessToken}`, 'x-learner-id': learnerId } };
}
