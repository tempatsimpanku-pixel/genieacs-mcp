import http from 'node:http';
import type { AddressInfo } from 'node:net';

/** Local stand-in for the GenieACS NBI. All data is dummy. */
export const DEVICES = [
  {
    _id: '202BC1-BM632w-000001', _lastInform: '2026-10-22T08:00:00.000Z',
    InternetGatewayDevice: {
      DeviceInfo: { SerialNumber: { _value: 'ZTEGC0000001', _type: 'xsd:string' } },
      LANDevice: { 1: { WLANConfiguration: { 1: { SSID: { _value: 'Rumah-Budi', _type: 'xsd:string' }, KeyPassphrase: { _value: 'super-secret-wifi', _type: 'xsd:string' }, PreSharedKey: { 1: { PreSharedKey: { _value: 'psk-should-hide' } } } } } } },
      WANDevice: { 1: { WANConnectionDevice: { 1: { WANPPPConnection: { 1: { Username: { _value: 'budi.s@isp.example', _type: 'xsd:string' }, Password: { _value: 'pppoe-pass-123', _type: 'xsd:string' } } } } } } },
    },
  },
  { _id: '00E0FC-HG8245H-000002', _lastInform: '2026-09-01T00:00:00.000Z', InternetGatewayDevice: { DeviceInfo: { SerialNumber: { _value: 'HWTC0000002' } } } },
  { _id: 'FC1263-F670L-000003', _lastInform: '2026-10-22T09:30:00.000Z', InternetGatewayDevice: { DeviceInfo: { SerialNumber: { _value: 'ZTEGC0000003' } } } },
];
export const FAULTS = [{ _id: '202BC1-BM632w-000001:default', device: '202BC1-BM632w-000001', channel: 'default', code: 'cwmp.9002', message: 'Internal error', retries: 3, timestamp: '2026-10-22T07:59:00.000Z' }];
export const TASKS = [{ _id: 'task-0001', device: '00E0FC-HG8245H-000002', name: 'reboot', timestamp: '2026-10-22T07:00:00.000Z' }];
export const FILES = [{ _id: 'F670L-v1.2.bin', length: 1048576, metadata: { fileType: '1 Firmware Upgrade Image', oui: 'FC1263', productClass: 'F670L', version: '1.2' } }];
export const PRESETS = [{ _id: 'inform', channel: 'default', weight: 0, events: { '2 PERIODIC': true }, configurations: [{ type: 'provision', name: 'default' }] }];
export const PROVISIONS = [{ _id: 'default', script: 'const user = "admin"; password = "hunter2-provision";\nlog("hello");' }];

export interface SeenRequest { method: string; url: string; authorization: string | undefined }

export interface MockNbi {
  url: string;
  seen: SeenRequest[];
  close: () => Promise<void>;
}

export interface MockOptions {
  user?: string;
  pass?: string;
  /** Delay (ms) before answering, to test timeouts. */
  delayMs?: number;
}

function matches(doc: Record<string, unknown>, q: Record<string, unknown>): boolean {
  return Object.entries(q).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === 'object') {
      const c = cond as Record<string, unknown>;
      if ('$regex' in c) return typeof v === 'string' && new RegExp(String(c.$regex)).test(v);
      if ('$lt' in c) return typeof v === 'string' && v < String(c.$lt);
      if ('$gt' in c) return typeof v === 'string' && v > String(c.$gt);
      return true;
    }
    return v === cond;
  });
}

function project(doc: Record<string, unknown>, projection: string | null): Record<string, unknown> {
  if (!projection) return doc;
  const keep = projection.split(',');
  const out: Record<string, unknown> = {};
  for (const k of keep) {
    const top = k.split('.')[0]!;
    if (k === top && top in doc) out[top] = doc[top];
    else if (top in doc) out[top] = doc[top]; // coarse: whole subtree (enough for the tests)
  }
  return out;
}

export async function startMockNbi(opts: MockOptions = {}): Promise<MockNbi> {
  const seen: SeenRequest[] = [];
  const collections: Record<string, Record<string, unknown>[]> = {
    devices: DEVICES as unknown as Record<string, unknown>[], faults: FAULTS, tasks: TASKS, files: FILES, presets: PRESETS, provisions: PROVISIONS, virtualparameters: [{ _id: 'pppoeUsername' }],
  };
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization });
    const reply = () => {
      if (opts.user !== undefined) {
        const want = `Basic ${Buffer.from(`${opts.user}:${opts.pass ?? ''}`).toString('base64')}`;
        if (req.headers.authorization !== want) { res.writeHead(401, { 'www-authenticate': 'Basic realm="nbi"' }); return res.end('Unauthorized'); }
      }
      if (req.method !== 'GET') { res.writeHead(405); return res.end('write attempt reached the mock'); }
      const u = new URL(req.url ?? '/', 'http://x');
      const parts = u.pathname.split('/').filter(Boolean);
      const rows = collections[parts[0] ?? ''];
      if (parts[0] === 'redirect') { res.writeHead(302, { location: 'http://127.0.0.1:1/evil' }); return res.end(); }
      if (parts[0] === 'garbage') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('<html>nope</html>'); }
      if (!rows) { res.writeHead(404); return res.end('not found'); }
      let out = rows;
      const query = u.searchParams.get('query');
      if (query) out = out.filter((d) => matches(d, JSON.parse(query) as Record<string, unknown>));
      if (parts[1]) out = out.filter((d) => d._id === decodeURIComponent(parts[1]!));
      const total = out.length;
      const skip = Number(u.searchParams.get('skip') ?? 0);
      const limit = u.searchParams.get('limit');
      out = out.slice(skip, limit ? skip + Number(limit) : undefined).map((d) => project(d, u.searchParams.get('projection')));
      res.writeHead(200, { 'content-type': 'application/json', 'x-total-count': String(total) });
      res.end(JSON.stringify(out));
    };
    if (opts.delayMs) setTimeout(reply, opts.delayMs); else reply();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`, seen,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
