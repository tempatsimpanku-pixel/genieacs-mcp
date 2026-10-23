import { describe, expect, it } from 'vitest';
import { PolicyError } from '../../src/errors.js';
import { assertGet, parseReadPath } from '../../src/guard.js';

describe('assertGet', () => {
  it('allows GET in any case', () => {
    expect(() => assertGet('GET')).not.toThrow();
    expect(() => assertGet(' get ')).not.toThrow();
  });
  it.each(['POST', 'put', 'PATCH', 'DELETE'])('refuses %s with a read-only policy message', (m) => {
    expect(() => assertGet(m)).toThrow(PolicyError);
    expect(() => assertGet(m)).toThrow(/Refused by policy: genieacs-nbi-mcp is read-only/);
  });
  it.each(['HEAD', 'OPTIONS', 'TRACE', '', 'GET\r\nX: y'])('refuses odd verb %j', (m) => {
    expect(() => assertGet(m)).toThrow(PolicyError);
  });
});

describe('parseReadPath', () => {
  it.each([
    ['/devices', 'devices'], ['/devices?limit=5&projection=_id', 'devices'], ['/devices/202BC1-BM632w-000001', 'devices'],
    ['/devices/a%2Fb', 'devices'], ['/tasks', 'tasks'], ['/faults?query=%7B%7D', 'faults'], ['/files', 'files'], ['/presets', 'presets'],
    ['/provisions', 'provisions'], ['/virtualparameters', 'virtualparameters'], ['/objects', 'objects'], ['/devices/', 'devices'], ['/Devices', 'devices'],
  ])('accepts %s', (p, root) => {
    expect(parseReadPath(p).root).toBe(root);
  });

  it('returns the normalised path and raw query', () => {
    expect(parseReadPath('/devices/x/?limit=1')).toMatchObject({ path: '/devices/x', query: 'limit=1' });
  });

  it.each([
    '/devices/abc/tasks', '/devices/abc/tasks?connection_request', '/devices/abc/tags/foo', '/devices/abc/%74asks', '/devices/abc/%2574asks',
    '/devices/abc/anything', '/tasks/abc/retry', '/files/a/b',
  ])('refuses write/sub-resource path %s', (p) => {
    expect(() => parseReadPath(p)).toThrow(PolicyError);
  });

  it.each([
    '/devices?connection_request', '/devices?x=1&connection_request=1', '/devices?%63onnection_request',
  ])('refuses the connection_request flag in %s', (p) => {
    expect(() => parseReadPath(p)).toThrow(/connection_request/);
  });

  it.each([
    '', 'devices', '//evil.example/devices', 'http://evil.example/devices', '/', '/admin', '/ui/api', '/devices/../files', '/devices/%2e%2e/x',
    '/devices/%252e%252e/x', '/devices\\x', '/devices#frag', '/devices\n', '/devices/%zz', '/..', '/devices//x',
  ])('refuses unsafe or unknown path %j', (p) => {
    expect(() => parseReadPath(p)).toThrow(PolicyError);
  });
});
