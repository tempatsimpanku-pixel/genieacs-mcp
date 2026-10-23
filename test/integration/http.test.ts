import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHttpServer, type RunningHttp } from '../../src/http.js';
import { NbiClient } from '../../src/nbi-client.js';
import { createMcpServer } from '../../src/server.js';
import { testConfig } from '../helpers/harness.js';
import { startMockNbi, type MockNbi } from '../helpers/mock-nbi.js';

const TOKEN = 't'.repeat(40);
let mock: MockNbi;
let http: RunningHttp;
beforeAll(async () => {
  mock = await startMockNbi();
  const config = testConfig(mock.url);
  http = await startHttpServer({ createServer: () => createMcpServer({ client: new NbiClient({ baseUrl: mock.url, timeoutMs: 3000 }), config }, '0.0.0-test'), token: TOKEN, port: 0, ratePerMinute: 1000 });
});
afterAll(async () => { await http.close(); await mock.close(); });

const url = () => `http://127.0.0.1:${http.port}/mcp`;
const rpc = (method: string, params: unknown = {}, headers: Record<string, string> = {}) => fetch(url(), {
  method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
});
const auth = { authorization: `Bearer ${TOKEN}` };

describe('streamable HTTP', () => {
  it('rejects requests without a token (401) or with a wrong one', async () => {
    const none = await rpc('tools/list');
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toBe('Bearer');
    expect((await rpc('tools/list', {}, { authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await rpc('tools/list', {}, { authorization: `Basic ${TOKEN}` })).status).toBe(401);
  });

  it('serves tools/list with a valid token', async () => {
    const r = await rpc('tools/list', {}, auth);
    expect(r.status).toBe(200);
    const body = await r.json() as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((t) => t.name)).toContain('acs_devices');
  });

  it('calls a tool end to end', async () => {
    const r = await rpc('tools/call', { name: 'acs_devices', arguments: { limit: 1, projection: '_id' } }, auth);
    const body = await r.json() as { result: { structuredContent: { ok: boolean; data: { total: number } } } };
    expect(body.result.structuredContent).toMatchObject({ ok: true, data: { total: 3 } });
  });

  it('refuses GET/DELETE, foreign hosts, browser origins and wrong paths', async () => {
    expect((await fetch(url(), { headers: auth })).status).toBe(405);
    expect((await fetch(url(), { method: 'DELETE', headers: auth })).status).toBe(405);
    expect((await rpc('tools/list', {}, { ...auth, origin: 'https://evil.example' })).status).toBe(403);
    expect((await fetch(`http://127.0.0.1:${http.port}/other`, { method: 'POST', headers: auth, body: '{}' })).status).toBe(404);
  });

  it('refuses a foreign Host header (DNS rebinding)', async () => {
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: http.port, path: '/mcp', method: 'POST', headers: { ...auth, host: 'evil.example', 'content-type': 'application/json' } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on('error', reject); req.end('{}');
    });
    expect(status).toBe(403);
  });

  it('rejects malformed JSON, oversized bodies, short tokens and remote binding', async () => {
    const bad = await fetch(url(), { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{nope' });
    expect(bad.status).toBe(400);
    const small = await startHttpServer({ createServer: () => createMcpServer({ client: new NbiClient({ baseUrl: mock.url, timeoutMs: 1000 }), config: testConfig(mock.url) }, 'x'), token: TOKEN, port: 0, maxBodyBytes: 64 });
    const big = await fetch(`http://127.0.0.1:${small.port}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ pad: 'x'.repeat(500) }) });
    expect(big.status).toBe(413);
    await small.close();
    await expect(startHttpServer({ createServer: () => { throw new Error('unused'); }, token: 'short', port: 0 })).rejects.toThrow(/at least 32/);
    await expect(startHttpServer({ createServer: () => { throw new Error('unused'); }, token: TOKEN, host: '0.0.0.0', port: 0 })).rejects.toThrow(/allow-remote/);
  });

  it('rate limits', async () => {
    const lim = await startHttpServer({ createServer: () => createMcpServer({ client: new NbiClient({ baseUrl: mock.url, timeoutMs: 1000 }), config: testConfig(mock.url) }, 'x'), token: TOKEN, port: 0, ratePerMinute: 2 });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await fetch(`http://127.0.0.1:${lim.port}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{}' })).status);
    expect(codes.at(-1)).toBe(429);
    await lim.close();
  });
});
