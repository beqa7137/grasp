import type { TestingModuleBuilder } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import type { Test as Request } from 'supertest';
import { NATIVE_REDIRECT_URI } from '../../src/auth/github-sign-in.service.js';
import { GoogleIdTokenVerifier } from '../../src/auth/google-id-token.verifier.js';
import { FakeGitHub, type GitHubAccount } from './fake-github.js';
import { FakeGoogle, type GoogleAccount } from './fake-google.js';

type Http = () => { post(path: string): Request };

let lastIp = 0;
/** Sign-in routes have strict per-IP limits, so each flow in a test comes from its own address. */
export const freshIp = () => {
  lastIp++;
  return `10.${(lastIp >> 16) & 255}.${(lastIp >> 8) & 255}.${lastIp & 255}`;
};

/** Google and GitHub stand-ins wired into the app under test: a trusted signing key and a local GitHub. */
export class OAuthFakes {
  private constructor(
    readonly google: FakeGoogle,
    readonly github: FakeGitHub,
  ) {}

  static async start(): Promise<OAuthFakes> {
    return new OAuthFakes(await FakeGoogle.create(), await FakeGitHub.start());
  }

  env(): Record<string, string> {
    return { ...this.google.env(), ...this.github.env() };
  }

  readonly customize = (builder: TestingModuleBuilder) => builder.overrideProvider(GoogleIdTokenVerifier).useValue(this.google.verifier());

  close(): Promise<void> {
    return this.github.close();
  }

  /** What the app posts for `account`: an ID token carrying a nonce freshly issued by the server, and that nonce. */
  async googleCredential(http: Http, account: GoogleAccount): Promise<{ idToken: string; nonce: string }> {
    const { nonce } = (await http().post('/api/auth/google/nonce').set('X-Forwarded-For', freshIp()).expect(200)).body;
    return { idToken: await this.google.idToken(account, nonce), nonce };
  }

  /** Runs the app's side of GitHub's code flow against the token endpoint and returns the Grasp ticket. */
  async githubTicket(http: Http, account: GitHubAccount, redirectUri = NATIVE_REDIRECT_URI): Promise<string> {
    const verifier = randomBytes(32).toString('base64url');
    const code = this.github.authorize(account, redirectUri, verifier);
    const res = await http()
      .post('/api/auth/github/token')
      .set('X-Forwarded-For', freshIp())
      .type('form')
      .send({ grant_type: 'authorization_code', client_id: this.github.clientId, code, redirect_uri: redirectUri, code_verifier: verifier })
      .expect(200);
    return res.body.access_token;
  }
}
