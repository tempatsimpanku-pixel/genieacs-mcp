import { PolicyError } from './errors.js';

/** Read-only guard. Everything that can reach the NBI passes through here first:
 * only GET, only the documented collections, never the task-creation endpoint. */

/** NBI collections that can be read. */
export const READ_ROOTS = ['devices', 'tasks', 'faults', 'files', 'presets', 'provisions', 'virtualparameters', 'objects'] as const;
export type ReadRoot = (typeof READ_ROOTS)[number];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const refuse = (what: string): never => {
  throw new PolicyError(`Refused by policy: genieacs-nbi-mcp is read-only. ${what} is not available (no tasks, tags, parameter writes, refreshObject, reboot, factoryReset, file upload or delete).`);
};

/** Only GET is ever sent. Write verbs get a policy message, anything else a plain one. */
export function assertGet(method: string): void {
  const m = method.trim().toUpperCase();
  if (m === 'GET') return;
  if (WRITE_METHODS.has(m)) refuse(`${m} requests`);
  throw new PolicyError(`Refused by policy: only GET is allowed (got "${method.slice(0, 16)}").`);
}

export interface ReadTarget {
  /** Normalised path, always starting with "/". */
  path: string;
  /** Raw query string without "?" (may be empty). */
  query: string;
  root: ReadRoot;
}

/** Validate a user supplied NBI path (+ optional query string). Throws PolicyError. */
export function parseReadPath(input: string): ReadTarget {
  if (typeof input !== 'string' || input.length === 0 || input.length > 4000) throw new PolicyError('Refused by policy: path must be 1–4000 characters.');
  if (/[\u0000-\u001f\u007f\\#]/.test(input)) throw new PolicyError('Refused by policy: path contains control characters, backslash or a fragment.');
  if (!input.startsWith('/') || input.startsWith('//')) throw new PolicyError('Refused by policy: path must be relative to the NBI and start with a single "/" (e.g. /devices?limit=5).');
  const qi = input.indexOf('?');
  const rawPath = qi === -1 ? input : input.slice(0, qi);
  const query = qi === -1 ? '' : input.slice(qi + 1);

  const segments = rawPath.split('/').slice(1);
  if (segments.length > 1 && segments[segments.length - 1] === '') segments.pop(); // tolerate one trailing slash
  const decoded: string[] = [];
  for (const s of segments) {
    let d = s;
    try { for (let i = 0; i < 3 && /%/.test(d); i++) d = decodeURIComponent(d); } catch { throw new PolicyError('Refused by policy: malformed percent-encoding in path.'); }
    if (d === '.' || d === '..' || /[\\\u0000-\u001f]/.test(d) || (s !== '' && d === '')) throw new PolicyError('Refused by policy: path traversal or empty segment.');
    decoded.push(d);
  }
  const root = decoded[0]?.toLowerCase();
  if (!root || !(READ_ROOTS as readonly string[]).includes(root)) {
    throw new PolicyError(`Refused by policy: "/${decoded[0] ?? ''}" is not a readable NBI collection. Allowed: ${READ_ROOTS.map((r) => `/${r}`).join(', ')}.`);
  }
  // /devices/{id}/tasks is the task-creation endpoint; /devices/{id}/tags/{tag} writes tags.
  if (root === 'devices' && decoded.length > 1) {
    const rest = decoded.slice(2).map((s) => s.toLowerCase());
    if (decoded.length > 2 && rest.length > 0) refuse(`/devices/{id}/${rest.join('/')}`);
  }
  if (root !== 'devices' && decoded.length > 2) refuse(`/${decoded.join('/')}`);
  // Query flags that make the ACS act on the device.
  for (const part of query.split('&')) {
    const key = part.split('=')[0]!.toLowerCase();
    let k = key;
    try { k = decodeURIComponent(key); } catch { /* keep raw */ }
    if (k === 'connection_request' || k === 'connectionrequest') refuse('the connection_request flag');
  }
  return { path: `/${segments.join('/')}`, query, root: root as ReadRoot };
}
