/** Redaction of secrets in NBI output. TR-069 data trees contain Wi-Fi keys, PPP/ACS passwords,
 * SNMP communities, connection-request credentials … none of which should reach a model. */

export const MASK = '***REDACTED***';

/** Key (or last parameter-path segment) names whose value is a secret. */
const SECRET_KEY = /(pass(word|phrase|wd)?|psk|presharedkey|keypassphrase|wepkey|secret|community|token|apikey|api_key|privatekey|authkey|cwmp.?pass|connectionrequestpassword|^key$)/i;
const SECRET_TEXT = [
  /\b(pass(?:word|wd)?|psk|secret|community|token|api[_-]?key)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;)"']+)/gi,
  /(\bBearer\s+)[A-Za-z0-9._~+/-]{8,}=*/g,
];

export function isSecretKey(name: string): boolean { return SECRET_KEY.test(name); }

export function redactText(text: string, extra: readonly string[] = []): string {
  let out = text;
  for (const s of extra) if (s.length >= 4) out = out.split(s).join(MASK);
  out = out.replace(SECRET_TEXT[0]!, (_m, k: string, sep: string) => `${k}${sep}${MASK}`);
  out = out.replace(SECRET_TEXT[1]!, (_m, p: string) => `${p}${MASK}`);
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep copy with secrets masked. Handles GenieACS parameter nodes (`{_value, _type, …}`) by masking `_value`
 * whenever the node's own key looks secret, and plain strings through `redactText`. */
export function redactData<T>(value: T, extra: readonly string[] = []): T {
  const walk = (v: unknown, keyHint: string | undefined, depth: number): unknown => {
    if (depth > 64) return '[max depth]';
    if (typeof v === 'string') return keyHint && isSecretKey(keyHint) ? MASK : redactText(v, extra);
    if (Array.isArray(v)) return v.map((x) => walk(x, keyHint, depth + 1));
    if (isObj(v)) {
      const secretNode = keyHint !== undefined && isSecretKey(keyHint);
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        if (secretNode && k === '_value') out[k] = MASK;
        else if (k.startsWith('_') && k !== '_value' && k !== '_id') out[k] = x; // _type, _writable, _timestamp … metadata
        else out[k] = walk(x, k, depth + 1);
      }
      return out;
    }
    if (keyHint && isSecretKey(keyHint) && v !== null && v !== undefined) return MASK;
    return v;
  };
  return walk(value, undefined, 0) as T;
}
