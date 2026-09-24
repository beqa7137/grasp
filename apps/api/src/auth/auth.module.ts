import { Logger, Module } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { GitHubController } from './github.controller.js';
import { DisabledGitHubOAuthClient, GitHubOAuthClient, HttpGitHubOAuthClient } from './github-oauth.client.js';
import { GitHubSignInService } from './github-sign-in.service.js';
import { GoogleController } from './google.controller.js';
import { DisabledGoogleIdTokenVerifier, GoogleIdTokenVerifier, JoseGoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { GoogleSignInService } from './google-sign-in.service.js';
import { IdentityGuard } from './identity.guard.js';
import { OneTimeValues } from './one-time-values.js';
import { SessionService } from './session.service.js';
import { TokenService } from './tokens.js';

@Module({
  controllers: [AuthController, GoogleController, GitHubController],
  providers: [
    SessionService,
    AccountService,
    OneTimeValues,
    GoogleSignInService,
    GitHubSignInService,
    IdentityGuard,
    {
      provide: TokenService,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        if (config.jwtSecret) return new TokenService(config.jwtSecret);
        new Logger('Auth').warn('JWT_SECRET not set: using a random secret, so sessions end when the server restarts.');
        return new TokenService(randomBytes(32).toString('hex'));
      },
    },
    {
      provide: GoogleIdTokenVerifier,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.google ? new JoseGoogleIdTokenVerifier(config.google) : new DisabledGoogleIdTokenVerifier(),
    },
    {
      provide: GitHubOAuthClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => (config.github ? new HttpGitHubOAuthClient(config.github) : new DisabledGitHubOAuthClient()),
    },
  ],
  exports: [IdentityGuard, TokenService],
})
export class AuthModule {}
