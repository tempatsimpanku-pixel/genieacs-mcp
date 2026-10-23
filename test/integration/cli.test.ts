import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockNbi, type MockNbi } from '../helpers/mock-nbi.js';

const CLI = path.resolve(import.meta.dirname, '..', '..', 'dist', 'cli.js');
const EXAMPLE = path.resolve(import.meta.dirname, '..', '..', 'genieacs.example.yaml');
let mock: MockNbi;
let authed: MockNbi;
beforeAll(async () => { mock = await startMockNbi(); authed = await startMockNbi({ user: 'noc', pass: 'dummy-pass' }); });
afterAll(async () => { await mock.close(); await authed.close(); });

const clean = (extra: Record<string, string>): Record<string, string> => {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '' };
  return Object.assign(env, extra);
};
/** Async on purpose: the mock NBI lives in this process, so the event loop must stay free. */
const run = (args: string[], env: Record<string, string>) => new Promise<{ status: number | null; stderr: string }>((resolve) => {
  execFile(process.execPath, [CLI, ...args], { env: clean(env), encoding: 'utf8', timeout: 15_000 }, (err, _out, stderr) => {
    resolve({ status: err ? ((err as { code?: number }).code ?? null) : 0, stderr });
  });
});

describe('cli', () => {
  it('prints version and help', async () => {
    expect(execFileSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' }).trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(execFileSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' })).toContain('GENIEACS_NBI_URL');
  });

  it('--check validates the example config and pings the NBI (env dummy)', async () => {
    const r = await run(['--config', EXAMPLE, '--check'], { GENIEACS_NBI_URL: mock.url });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('configuration OK');
    expect(r.stderr).toContain('NBI reachable: 3 device(s)');
  });

  it('--check sends the basic credentials and does not print them', async () => {
    const ok = await run(['--check'], { GENIEACS_NBI_URL: authed.url, GENIEACS_NBI_USER: 'noc', GENIEACS_NBI_PASS: 'dummy-pass' });
    expect(ok.status).toBe(0);
    expect(ok.stderr).not.toContain('dummy-pass');
    const bad = await run(['--check'], { GENIEACS_NBI_URL: authed.url, GENIEACS_NBI_USER: 'noc', GENIEACS_NBI_PASS: 'wrong-pass' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('NBI check FAILED');
    expect(bad.stderr).not.toContain('wrong-pass');
  });

  it('--check fails clearly when the NBI is down or config is missing', async () => {
    expect((await run(['--check'], { GENIEACS_NBI_URL: 'http://127.0.0.1:1' })).status).toBe(1);
    const none = await run(['--check'], {});
    expect(none.status).toBe(1);
    expect(none.stderr).toContain('configuration error');
  });

  it('HTTP mode refuses to start without a token', async () => {
    const r = await run(['--http', '127.0.0.1:0'], { GENIEACS_NBI_URL: mock.url });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('GENIEACS_MCP_TOKEN');
  });

  it('serves initialize + tools/list + a call over stdio (SDK client)', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [CLI], env: clean({ GENIEACS_NBI_URL: mock.url }), stderr: 'pipe' });
    const client = new Client({ name: 'it', version: '0' });
    await client.connect(transport);
    try {
      expect(client.getServerVersion()?.name).toBe('genieacs-nbi-mcp');
      expect(client.getInstructions()).toMatch(/Read-only/);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(8);
      const r = await client.callTool({ name: 'acs_devices', arguments: { limit: 1, projection: '_id' } });
      expect(r.isError).toBeFalsy();
      const w = await client.callTool({ name: 'acs_read', arguments: { path: '/devices/x/tasks', method: 'POST' } });
      expect(w.isError).toBe(true);
    } finally { await client.close(); }
  });

  it('serves HTTP with a bearer token as a child process', async () => {
    const child = spawn(process.execPath, [CLI, '--http', '127.0.0.1:0'], { env: clean({ GENIEACS_NBI_URL: mock.url, GENIEACS_MCP_TOKEN: 'z'.repeat(40) }), stdio: ['ignore', 'ignore', 'pipe'] });
    try {
      const port = await new Promise<number>((resolve, reject) => {
        let buf = '';
        child.stderr.on('data', (d: Buffer) => { buf += d.toString(); const m = /127\.0\.0\.1:(\d+)\/mcp/.exec(buf); if (m) resolve(Number(m[1])); });
        child.once('exit', () => reject(new Error(`exited: ${buf}`)));
        setTimeout(() => reject(new Error('timeout')), 10_000);
      });
      const noAuth = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(noAuth.status).toBe(401);
    } finally { child.kill('SIGTERM'); }
  });
});

describe('token file', () => {
  it.skipIf(process.platform === 'win32')('rejects a world-readable token file', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gmcp-tok-'));
    const f = path.join(d, 'token');
    fs.writeFileSync(f, 'q'.repeat(40), { mode: 0o644 });
    const r = await run(['--http', '127.0.0.1:0'], { GENIEACS_NBI_URL: mock.url, GENIEACS_MCP_TOKEN_FILE: f });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('chmod 600');
    fs.rmSync(d, { recursive: true, force: true });
  });
});
