import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ConfigError } from './errors.js';

export { ConfigError };

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const nbiSchema = z.object({
  base_url: z.string().min(1).optional(),
  auth: z.object({
    user_env: z.string().regex(ENV_NAME).default('GENIEACS_NBI_USER'),
    pass_env: z.string().regex(ENV_NAME).default('GENIEACS_NBI_PASS'),
  }).strict().default({ user_env: 'GENIEACS_NBI_USER', pass_env: 'GENIEACS_NBI_PASS' }),
  timeout_ms: z.number().int().min(500).max(120_000).default(15_000),
  default_limit: z.number().int().min(1).max(10_000).default(50),
  max_limit: z.number().int().min(1).max(10_000).default(500),
  max_output_bytes: z.number().int().min(2_000).max(5_000_000).default(200_000),
  redact: z.boolean().default(true),
}).strict();

const fileSchema = z.object({ nbi: nbiSchema.default(() => nbiSchema.parse({})) }).strict();

export interface ServerConfig {
  baseUrl: string;
  /** Present only when both user and password are set. */
  auth?: { user: string; pass: string };
  timeoutMs: number;
  defaultLimit: number;
  maxLimit: number;
  maxOutputBytes: number;
  redact: boolean;
  warnings: string[];
}

/** The base URL must be http(s) without embedded credentials. Returned without a trailing slash. */
export function normalizeBaseUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new ConfigError('nbi.base_url / GENIEACS_NBI_URL is not a valid URL.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ConfigError('nbi.base_url must use http: or https:.');
  if (u.username || u.password) throw new ConfigError('nbi.base_url must not contain credentials; use GENIEACS_NBI_USER / GENIEACS_NBI_PASS.');
  if (u.search || u.hash) throw new ConfigError('nbi.base_url must not contain a query string or fragment.');
  return u.toString().replace(/\/+$/, '');
}

/** Refuse group/world accessible secret files (POSIX only). */
export function checkPrivateFile(file: string, label: string): void {
  if (process.platform === 'win32') return;
  let st: fs.Stats;
  try { st = fs.statSync(file); } catch { throw new ConfigError(`${label}: file not found.`); }
  if ((st.mode & 0o077) !== 0) throw new ConfigError(`${label}: file must not be accessible by group/others (chmod 600).`);
}

/** Merge the optional YAML file with the environment (environment wins for URL and credentials). */
export function loadConfig(file: string | undefined, env: NodeJS.ProcessEnv = process.env): ServerConfig {
  let raw: unknown = {};
  if (file) {
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); } catch { throw new ConfigError('cannot read the configuration file.'); }
    try { raw = parseYaml(text) ?? {}; } catch (e) { throw new ConfigError(`invalid YAML: ${(e as Error).message.split('\n')[0]}`); }
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0]!;
    throw new ConfigError(`invalid configuration at "${i.path.join('.') || '(root)'}": ${i.message}`);
  }
  const n = parsed.data.nbi;
  const url = env.GENIEACS_NBI_URL || n.base_url;
  if (!url) throw new ConfigError('no NBI URL: set nbi.base_url in the config file or GENIEACS_NBI_URL.');
  if (n.default_limit > n.max_limit) throw new ConfigError('nbi.default_limit must not exceed nbi.max_limit.');

  const warnings: string[] = [];
  const user = env[n.auth.user_env] || undefined;
  const pass = env[n.auth.pass_env] || undefined;
  if ((user && !pass) || (!user && pass)) throw new ConfigError(`set both ${n.auth.user_env} and ${n.auth.pass_env}, or neither.`);
  const baseUrl = normalizeBaseUrl(url);
  if (user && baseUrl.startsWith('http://') && !isPrivateHost(new URL(baseUrl).hostname)) {
    warnings.push('basic credentials would be sent over plain http to a non-private host; put TLS in front of the NBI.');
  }
  return {
    baseUrl, ...(user && pass ? { auth: { user, pass } } : {}),
    timeoutMs: n.timeout_ms, defaultLimit: n.default_limit, maxLimit: n.max_limit, maxOutputBytes: n.max_output_bytes, redact: n.redact, warnings,
  };
}

function isPrivateHost(h: string): boolean {
  return h === 'localhost' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === '::1' || h === '[::1]';
}
