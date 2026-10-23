/** Raised for configuration problems. Messages name the offending KEY, never its value. */
export class ConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'ConfigError'; }
}

/** The request was refused by the read-only policy before anything was sent. */
export class PolicyError extends Error {
  readonly kind = 'policy' as const;
  constructor(message: string) { super(message); this.name = 'PolicyError'; }
}

export type NbiErrorKind = 'auth' | 'not_found' | 'timeout' | 'network' | 'http' | 'parse' | 'too_large';

/** A failure talking to the NBI. Messages never contain credentials. */
export class NbiError extends Error {
  constructor(readonly kind: NbiErrorKind, message: string, readonly status?: number) { super(message); this.name = 'NbiError'; }
}
