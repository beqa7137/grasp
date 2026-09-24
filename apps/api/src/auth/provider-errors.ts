/** The provider rejected the credential (bad, expired or foreign token, or a spent authorization code). */
export class InvalidCredentialError extends Error {}

/** The provider could not be reached or answered with a server error, so the credential could not be checked. */
export class ProviderUnavailableError extends Error {}
