export interface User {
  id: string;
  email: string;
  /** The learner whose events, interviews and feedback belong to this account. */
  learnerId: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export type Provider = 'google' | 'github';

/** A provider account linked to a user, keyed on the provider's stable subject id, never on email. */
export interface AuthIdentity {
  id: string;
  userId: string;
  provider: Provider;
  subject: string;
  /** Last verified email the provider reported, lowercased; informational only. */
  email: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface IdentitySummary {
  provider: Provider;
  email: string | null;
  linkedAt: string;
}

/** Who a provider says is signing in, after its credential has been verified. */
export interface VerifiedIdentity {
  provider: Provider;
  subject: string;
  /** Only an address the provider verified; null otherwise. */
  email: string | null;
  /** True when the provider owns the email's domain, so it may be linked to an existing account with that email. */
  authoritative: boolean;
}

export type OneTimePurpose = 'google_nonce' | 'github_ticket';

/** A single-use random value, stored only as a hash. */
export interface OneTimeRecord {
  hash: string;
  purpose: OneTimePurpose;
  payload: unknown;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  /** Every rotation of one sign-in shares a family; reuse of a rotated token revokes the family. */
  familyId: string;
  tokenHash: string;
  expiresAt: string;
  /** Set when this token was exchanged for a new one. */
  rotatedAt: string | null;
  /** Set on logout or suspected theft; a revoked token never works again. */
  revokedAt: string | null;
  createdAt: string;
}

/** Who is calling: an account (bearer token) or an anonymous device (x-learner-id). */
export interface Identity {
  learnerId: string;
  userId: string | null;
}
