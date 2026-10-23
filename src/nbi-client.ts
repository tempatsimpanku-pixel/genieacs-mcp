import { assertGet, parseReadPath } from './guard.js';
import { NbiError } from './errors.js';

export interface NbiClientOptions {
  baseUrl: string;
  auth?: { user: string; pass: string } | undefined;
  timeoutMs: number;
  /** Test hook. */
  fetchImpl?: typeof fetch;
}

export interface NbiResponse<T = unknown> {
  data: T;
  /** `X-Total-Count` header when the NBI sent it. */
  total?: number;
}

const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Minimal read-only GenieACS NBI client. There is deliberately no method other than GET:
 * the HTTP verb is a constant, and every path goes through the guard. */
export class NbiClient {
  private readonly base: string;
  private readonly authHeader: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: NbiClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.authHeader = opts.auth ? `Basic ${Buffer.from(`${opts.auth.user}:${opts.auth.pass}`).toString('base64')}` : undefined;
    this.timeoutMs = opts.timeoutMs;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Values that must never appear in output (the credentials we hold). */
  secrets(): string[] {
    return this.authHeader ? [this.authHeader.slice(6)] : [];
  }

  /** GET a guarded path. `params` are appended to the query string (URL-encoded). */
  async get<T = unknown>(pathAndQuery: string, params: Record<string, string | number | undefined> = {}): Promise<NbiResponse<T>> {
    assertGet('GET');
    const target = parseReadPath(pathAndQuery);
    const usp = new URLSearchParams(target.query);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, String(v));
    const qs = usp.toString();
    const url = `${this.base}${target.path}${qs ? `?${qs}` : ''}`;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'GET', redirect: 'manual', signal: ctl.signal,
        headers: { accept: 'application/json', ...(this.authHeader ? { authorization: this.authHeader } : {}) },
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === 'AbortError') throw new NbiError('timeout', `the NBI did not answer within ${this.timeoutMs} ms.`);
      const code = (e as { cause?: { code?: string } }).cause?.code;
      throw new NbiError('network', `cannot reach the NBI${code ? ` (${code})` : ''}.`);
    }
    try {
      if (res.status >= 300 && res.status < 400) throw new NbiError('http', `the NBI answered with a redirect (HTTP ${res.status}); redirects are not followed. Check nbi.base_url.`, res.status);
      if (res.status === 401 || res.status === 403) throw new NbiError('auth', `the NBI rejected the credentials (HTTP ${res.status}).`, res.status);
      if (res.status === 404) throw new NbiError('not_found', 'the NBI has no such resource (HTTP 404).', 404);
      if (!res.ok) throw new NbiError('http', `the NBI answered HTTP ${res.status}.`, res.status);
      const text = await readCapped(res);
      let data: unknown;
      try { data = text.length ? JSON.parse(text) : null; } catch { throw new NbiError('parse', 'the NBI did not return JSON.'); }
      const totalHeader = res.headers.get('x-total-count');
      const total = totalHeader !== null && /^\d+$/.test(totalHeader) ? Number(totalHeader) : undefined;
      return { data: data as T, ...(total !== undefined ? { total } : {}) };
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) { void reader.cancel(); throw new NbiError('too_large', 'the NBI response exceeds 8 MB; narrow the query or use a projection.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
