export interface User {
  id: string;
  email: string;
  /** The learner whose events, interviews and feedback belong to this account. */
  learnerId: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface LoginCode {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
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
