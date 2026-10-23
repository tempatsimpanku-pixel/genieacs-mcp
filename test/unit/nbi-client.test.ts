import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NbiError, PolicyError } from '../../src/errors.js';
import { NbiClient } from '../../src/nbi-client.js';
import { startMockNbi, type MockNbi } from '../helpers/mock-nbi.js';

let mock: MockNbi;
let authed: MockNbi;
let slow: MockNbi;
beforeAll(async () => {
  mock = await startMockNbi();
  authed = await startMockNbi({ user: 'noc', pass: 'dummy-pass' });
  slow = await startMockNbi({ delayMs: 400 });
});
afterAll(async () => { await Promise.all([mock.close(), authed.close(), slow.close()]); });

const client = (url: string, extra: Partial<ConstructorParameters<typeof NbiClient>[0]> = {}) => new NbiClient({ baseUrl: url, timeoutMs: 3000, ...extra });

describe('NbiClient', () => {
  it('GETs with encoded params and reads X-Total-Count', async () => {
    const r = await client(mock.url).get<unknown[]>('/devices', { query: JSON.stringify({ _id: { $regex: 'ZTE' } }), limit: 1, projection: '_id' });
    expect(r.total).toBe(0); // regex on _id: ids do not contain "ZTE"; mock matches strings only
    const all = await client(mock.url).get<unknown[]>('/devices', { limit: 2 });
    expect(all.total).toBe(3);
    expect(all.data).toHaveLength(2);
    const last = mock.seen.at(-1)!;
    expect(last.method).toBe('GET');
    expect(last.url).toBe('/devices?limit=2');
  });

  it('merges a query string in the path with params', async () => {
    await client(mock.url).get('/devices?projection=_id', { limit: 1 });
    expect(mock.seen.at(-1)!.url).toBe('/devices?projection=_id&limit=1');
  });

  it('sends basic auth only when configured', async () => {
    await expect(client(authed.url).get('/devices')).rejects.toMatchObject({ kind: 'auth' });
    const ok = await client(authed.url, { auth: { user: 'noc', pass: 'dummy-pass' } }).get<unknown[]>('/devices');
    expect(ok.data).toHaveLength(3);
    await expect(client(authed.url, { auth: { user: 'noc', pass: 'wrong' } }).get('/devices')).rejects.toBeInstanceOf(NbiError);
  });

  it('exposes the credential only as a secret to scrub, never in errors', async () => {
    const c = client(authed.url, { auth: { user: 'noc', pass: 'wrong-pass-9' } });
    expect(c.secrets()).toHaveLength(1);
    try { await c.get('/devices'); expect.unreachable(); } catch (e) { expect((e as Error).message).not.toContain('wrong-pass-9'); }
  });

  it('maps 404, redirects, bad JSON, timeouts and connection failures', async () => {
    await expect(client(mock.url).get('/presets/none/x')).rejects.toBeInstanceOf(PolicyError);
    await expect(client(mock.url).get('/objects')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(client(mock.url + '/redirect').get('/devices')).rejects.toMatchObject({ kind: 'http', status: 302 });
    await expect(client(mock.url).get('/devices', {})).resolves.toBeDefined();
    await expect(client(slow.url, { timeoutMs: 100 }).get('/devices')).rejects.toMatchObject({ kind: 'timeout' });
    await expect(client('http://127.0.0.1:1').get('/devices')).rejects.toMatchObject({ kind: 'network' });
  });

  it('does not follow redirects and rejects non-JSON bodies', async () => {
    // /redirect and /garbage are mounted at the mock root; reach them through a base URL trick is not possible,
    // so call the fetch layer with a stub that returns those shapes.
    const redirect = new NbiClient({ baseUrl: 'http://h', timeoutMs: 1000, fetchImpl: (async () => new Response(null, { status: 302, headers: { location: 'http://evil' } })) as typeof fetch });
    await expect(redirect.get('/devices')).rejects.toMatchObject({ kind: 'http', status: 302 });
    const garbage = new NbiClient({ baseUrl: 'http://h', timeoutMs: 1000, fetchImpl: (async () => new Response('<html>', { status: 200 })) as typeof fetch });
    await expect(garbage.get('/devices')).rejects.toMatchObject({ kind: 'parse' });
    const server500 = new NbiClient({ baseUrl: 'http://h', timeoutMs: 1000, fetchImpl: (async () => new Response('boom', { status: 500 })) as typeof fetch });
    await expect(server500.get('/devices')).rejects.toMatchObject({ kind: 'http', status: 500 });
  });

  it('refuses write paths before any request leaves the process', async () => {
    const before = mock.seen.length;
    for (const p of ['/devices/x/tasks', '/devices/x/tags/t', '//evil/devices', 'http://evil/devices', '/devices?connection_request'])
      await expect(client(mock.url).get(p)).rejects.toBeInstanceOf(PolicyError);
    expect(mock.seen.length).toBe(before);
  });

  it('caps oversized bodies', async () => {
    const huge = new NbiClient({ baseUrl: 'http://h', timeoutMs: 1000, fetchImpl: (async () => new Response('x'.repeat(9 * 1024 * 1024), { status: 200 })) as typeof fetch });
    await expect(huge.get('/devices')).rejects.toMatchObject({ kind: 'too_large' });
  });

  it('has no write-capable method', () => {
    const c = client(mock.url) as unknown as Record<string, unknown>;
    for (const m of ['post', 'put', 'patch', 'delete', 'request']) expect(c[m]).toBeUndefined();
  });
});
