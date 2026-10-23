import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, connect } from '../helpers/harness.js';
import { startMockNbi, type MockNbi } from '../helpers/mock-nbi.js';

let mock: MockNbi;
let client: Client;
beforeAll(async () => { mock = await startMockNbi(); client = await connect(mock.url); });
afterAll(async () => { await client.close(); await mock.close(); });

describe('tool catalogue', () => {
  it('lists exactly the read-only tools, all annotated read-only', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['acs_device', 'acs_devices', 'acs_faults', 'acs_files', 'acs_presets', 'acs_provisions', 'acs_read', 'acs_tasks']);
    for (const t of tools) expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.some((t) => /create|reboot|write|delete|tag|refresh/i.test(t.name))).toBe(false);
  });
});

describe('acs_devices', () => {
  it('lists with total and respects limit/skip', async () => {
    const r = await call(client, 'acs_devices', { limit: 2, skip: 1, projection: ['_id', '_lastInform'] });
    expect(r.isError).toBe(false);
    expect(r.structured).toMatchObject({ ok: true, data: { total: 3, count: 2 } });
    expect(mock.seen.at(-1)!.url).toContain('limit=2');
    expect(mock.seen.at(-1)!.url).toContain('skip=1');
    expect(mock.seen.at(-1)!.url).toContain('projection=_id%2C_lastInform');
  });

  it('filters by query given as object or JSON string', async () => {
    const a = await call(client, 'acs_devices', { query: { _lastInform: { $lt: '2026-10-01T00:00:00Z' } }, projection: '_id,_lastInform' });
    expect((a.structured.data as { items: Array<{ _id: string }> }).items.map((d) => d._id)).toEqual(['00E0FC-HG8245H-000002']);
    const b = await call(client, 'acs_devices', { query: '{"_id":"FC1263-F670L-000003"}', projection: '_id' });
    expect((b.structured.data as { count: number }).count).toBe(1);
  });

  it('caps limit at max_limit and applies default_limit', async () => {
    const small = await connect(mock.url, { maxLimit: 2, defaultLimit: 1 });
    await call(small, 'acs_devices', { limit: 100 });
    expect(mock.seen.at(-1)!.url).toContain('limit=2');
    await call(small, 'acs_devices', {});
    expect(mock.seen.at(-1)!.url).toContain('limit=1');
    await small.close();
  });

  it('masks secrets in device data', async () => {
    const r = await call(client, 'acs_devices', { projection: 'InternetGatewayDevice', limit: 1 });
    for (const leak of ['super-secret-wifi', 'pppoe-pass-123', 'psk-should-hide']) expect(r.text).not.toContain(leak);
    expect(r.text).toContain('Rumah-Budi');
  });

  it('leaves data untouched when redact is off', async () => {
    const raw = await connect(mock.url, { redact: false });
    const r = await call(raw, 'acs_devices', { projection: 'InternetGatewayDevice', limit: 1 });
    expect(r.text).toContain('super-secret-wifi');
    await raw.close();
  });

  it('refuses dangerous operators, bad projections and non-object queries', async () => {
    for (const args of [{ query: { $where: 'sleep(1)' } }, { query: '[1]' }, { query: 'not json' }, { projection: '_id; DROP' }, { projection: '../x' }]) {
      const r = await call(client, 'acs_devices', args);
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect(r.structured).toMatchObject({ ok: false, error: 'policy' });
    }
  });

  it('trims output to max_output_bytes by dropping whole items', async () => {
    const tiny = await connect(mock.url, { maxOutputBytes: 2000, redact: false });
    const r = await call(tiny, 'acs_devices', {});
    expect(r.text.length).toBeLessThan(3000);
    expect(r.structured).toMatchObject({ ok: true });
    await tiny.close();
  });
});

describe('acs_device', () => {
  it('returns one device by exact id', async () => {
    const r = await call(client, 'acs_device', { id: '202BC1-BM632w-000001', projection: '_id,InternetGatewayDevice.DeviceInfo' });
    expect(r.isError).toBe(false);
    expect((r.structured.data as { device: { _id: string } }).device._id).toBe('202BC1-BM632w-000001');
  });
  it('reports not_found', async () => {
    const r = await call(client, 'acs_device', { id: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.structured).toMatchObject({ error: 'not_found' });
  });
});

describe('collection tools', () => {
  it('acs_faults filters by device', async () => {
    const r = await call(client, 'acs_faults', { device_id: '202BC1-BM632w-000001' });
    expect(r.structured).toMatchObject({ ok: true, data: { count: 1, total: 1 } });
    expect(decodeURIComponent(mock.seen.at(-1)!.url)).toContain('{"device":"202BC1-BM632w-000001"}');
  });
  it('acs_tasks lists the queue', async () => {
    expect((await call(client, 'acs_tasks')).structured).toMatchObject({ data: { count: 1 } });
  });
  it('acs_files returns metadata', async () => {
    const r = await call(client, 'acs_files', { filename: 'F670L-v1.2.bin' });
    expect(r.text).toContain('Firmware Upgrade Image');
  });
  it('acs_presets works', async () => {
    expect((await call(client, 'acs_presets')).structured).toMatchObject({ data: { count: 1 } });
  });
  it('acs_provisions masks passwords in scripts', async () => {
    const r = await call(client, 'acs_provisions');
    expect(r.text).not.toContain('hunter2-provision');
    expect(r.text).toContain('hello');
  });
  it('merges a user query with the device filter', async () => {
    await call(client, 'acs_tasks', { device_id: 'd1', query: { name: 'reboot' } });
    expect(decodeURIComponent(mock.seen.at(-1)!.url)).toContain('{"name":"reboot","device":"d1"}');
  });
});

describe('acs_read and write refusal', () => {
  it('GETs allowed paths', async () => {
    const r = await call(client, 'acs_read', { path: '/virtualparameters' });
    expect(r.isError).toBe(false);
    expect(r.structured).toMatchObject({ data: { path: '/virtualparameters', count: 1 } });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])('refuses method %s without contacting the NBI', async (method) => {
    const before = mock.seen.length;
    const r = await call(client, 'acs_read', { path: '/devices', method });
    expect(r.isError).toBe(true);
    expect(r.structured).toMatchObject({ ok: false, error: 'policy' });
    expect(r.text).toMatch(/read-only/);
    expect(mock.seen.length).toBe(before);
  });

  it.each([
    '/devices/202BC1-BM632w-000001/tasks', '/devices/x/tasks?connection_request', '/devices/x/tags/vip', '/tasks/abc/retry', '/files/a/b', '/ui', '//evil.example/x', 'http://evil.example/', '/devices/../files',
  ])('refuses path %s', async (path) => {
    const before = mock.seen.length;
    const r = await call(client, 'acs_read', { path });
    expect(r.isError).toBe(true);
    expect(r.structured).toMatchObject({ error: 'policy' });
    expect(mock.seen.length).toBe(before);
  });

  it('never sent anything but GET during the whole suite', () => {
    expect(new Set(mock.seen.map((s) => s.method))).toEqual(new Set(['GET']));
  });

  it('turns NBI failures into tool errors', async () => {
    const r = await call(client, 'acs_read', { path: '/objects' });
    expect(r.isError).toBe(true);
    expect(r.structured).toMatchObject({ error: 'not_found' });
    const dead = await connect('http://127.0.0.1:1');
    expect((await call(dead, 'acs_devices')).structured).toMatchObject({ error: 'network' });
    await dead.close();
  });
});
