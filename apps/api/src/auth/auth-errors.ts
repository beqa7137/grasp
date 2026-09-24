import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import type { Provider } from './auth.types.js';

const NAMES: Record<Provider, string> = { google: 'Google', github: 'GitHub' };

const error = (status: HttpStatus, code: string, message: string, extra: object = {}) =>
  new HttpException({ statusCode: status, message, code, ...extra }, status);

export const notSignedIn = () => new UnauthorizedException('Not signed in');

export const sessionEnded = () => new UnauthorizedException('Your session has ended. Please sign in again.');

export const tokenInvalid = (message: string) => error(HttpStatus.UNAUTHORIZED, 'token_invalid', message);

export const signInRequired = () =>
  error(HttpStatus.UNAUTHORIZED, 'sign_in_required', 'This progress belongs to an account. Sign in to continue.');

export const providerDisabled = (provider: Provider) =>
  error(HttpStatus.NOT_FOUND, 'provider_disabled', `${NAMES[provider]} sign-in isn't available on this server.`);

export const providerUnavailable = (provider: Provider) =>
  error(
    HttpStatus.SERVICE_UNAVAILABLE,
    'provider_unavailable',
    `${NAMES[provider]} can't be reached right now. Please try again in a moment.`,
  );

export const invalidCredential = (provider: Provider) =>
  error(HttpStatus.UNAUTHORIZED, 'invalid_credential', `${NAMES[provider]} sign-in couldn't be verified. Please try again.`);

export const invalidTicket = () =>
  error(HttpStatus.UNAUTHORIZED, 'invalid_ticket', 'That GitHub sign-in has expired or was already used. Please try again.');

export const emailUnverified = (provider: Provider) =>
  error(
    HttpStatus.FORBIDDEN,
    'email_unverified',
    `${NAMES[provider]} didn't share a verified email address. Verify one with ${NAMES[provider]}, then try again.`,
  );

/** With no `providers`, the account comes from the earlier email-code sign-in, which only Google can recover. */
export const accountExists = (provider: Provider, providers: Provider[]) =>
  error(
    HttpStatus.CONFLICT,
    'account_exists',
    providers.length
      ? `This email already has a Grasp account. Sign in with ${providers.map((p) => NAMES[p]).join(' or ')} first, then connect ${NAMES[provider]} under Sign-in methods.`
      : 'This email belongs to an account from the earlier email sign-in. Sign in with Google using this address to recover it.',
    { providers },
  );

export const identityInUse = (provider: Provider) =>
  error(HttpStatus.CONFLICT, 'identity_in_use', `That ${NAMES[provider]} account is already linked to a different Grasp account.`);

/** RFC 6749 token-endpoint error, the shape OAuth clients such as the app's sign-in plugin expect. */
export const oauthError = (status: HttpStatus, code: string, description: string) =>
  new HttpException({ error: code, error_description: description }, status);
