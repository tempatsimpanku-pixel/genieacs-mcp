import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, checkPrivateFile, loadConfig, normalizeBaseUrl } from '../../src/config.js';

const dirs: string[] = [];
function write(name: string, text: string, mode = 0o600): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gmcp-'));
  dirs.push(d);
  const f = path.join(d, name);
  fs.writeFileSync(f, text, { mode });
  return f;
}
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('loadConfig', () => {
  it('reads the YAML file and applies defaults', () => {
    const c = loadConfig(write('c.yaml', 'nbi:\n  base_url: http://10.0.0.5:7557/\n'), {});
    expect(c).toMatchObject({ baseUrl: 'http://10.0.0.5:7557', timeoutMs: 15000, defaultLimit: 50, maxLimit: 500, redact: true });
    expect(c.auth).toBeUndefined();
  });

  it('works from environment only', () => {
    const c = loadConfig(undefined, { GENIEACS_NBI_URL: 'https://acs.example.net/nbi', GENIEACS_NBI_USER: 'u', GENIEACS_NBI_PASS: 'p' });
    expect(c.baseUrl).toBe('https://acs.example.net/nbi');
    expect(c.auth).toEqual({ user: 'u', pass: 'p' });
  });

  it('environment URL overrides the file', () => {
    const c = loadConfig(write('c.yaml', 'nbi:\n  base_url: http://a.example:7557\n'), { GENIEACS_NBI_URL: 'http://b.example:7557' });
    expect(c.baseUrl).toBe('http://b.example:7557');
  });

  it('honours custom credential env names', () => {
    const c = loadConfig(write('c.yaml', 'nbi:\n  base_url: http://127.0.0.1:7557\n  auth: { user_env: MY_U, pass_env: MY_P }\n'), { MY_U: 'x', MY_P: 'y' });
    expect(c.auth).toEqual({ user: 'x', pass: 'y' });
  });

  it('requires a URL, and both or neither credential', () => {
    expect(() => loadConfig(undefined, {})).toThrow(/no NBI URL/);
    expect(() => loadConfig(undefined, { GENIEACS_NBI_URL: 'http://h:7557', GENIEACS_NBI_USER: 'u' })).toThrow(/both/);
  });

  it('rejects unknown keys, bad types, plaintext-password style keys and bad limits', () => {
    expect(() => loadConfig(write('c.yaml', 'nbi:\n  base_url: http://h:1\n  password: nope\n'), {})).toThrow(ConfigError);
    expect(() => loadConfig(write('c.yaml', 'nbi:\n  base_url: http://h:1\n  timeout_ms: fast\n'), {})).toThrow(/timeout_ms/);
    expect(() => loadConfig(write('c.yaml', 'nbi:\n  base_url: http://h:1\n  default_limit: 900\n  max_limit: 100\n'), {})).toThrow(/default_limit/);
    expect(() => loadConfig(write('c.yaml', ': : :\n  - ['), {})).toThrow(/invalid YAML/);
    expect(() => loadConfig('/nonexistent/file.yaml', {})).toThrow(/cannot read/);
  });

  it('never echoes secrets in errors', () => {
    try { loadConfig(undefined, { GENIEACS_NBI_URL: 'http://user:topsecret@h:1' }); expect.unreachable(); } catch (e) { expect((e as Error).message).not.toContain('topsecret'); }
  });

  it('warns about basic auth over plain http to a public host', () => {
    const c = loadConfig(undefined, { GENIEACS_NBI_URL: 'http://acs.example.net:7557', GENIEACS_NBI_USER: 'u', GENIEACS_NBI_PASS: 'p' });
    expect(c.warnings.join(' ')).toMatch(/plain http/);
    expect(loadConfig(undefined, { GENIEACS_NBI_URL: 'http://192.168.1.2:7557', GENIEACS_NBI_USER: 'u', GENIEACS_NBI_PASS: 'p' }).warnings).toEqual([]);
  });
});

describe('normalizeBaseUrl', () => {
  it.each(['ftp://h/', 'not a url', 'http://u:p@h/', 'http://h/?a=1', 'http://h/#x'])('rejects %s', (u) => {
    expect(() => normalizeBaseUrl(u)).toThrow(ConfigError);
  });
  it('strips trailing slashes', () => { expect(normalizeBaseUrl('http://h:7557///')).toBe('http://h:7557'); });
});

describe('checkPrivateFile', () => {
  it.skipIf(process.platform === 'win32')('rejects group/world readable files', () => {
    expect(() => checkPrivateFile(write('t', 'x', 0o644), 'T')).toThrow(/chmod 600/);
    expect(() => checkPrivateFile(write('t', 'x', 0o600), 'T')).not.toThrow();
    expect(() => checkPrivateFile('/nonexistent', 'T')).toThrow(/not found/);
  });
});
