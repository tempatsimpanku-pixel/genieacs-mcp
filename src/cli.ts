#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, checkPrivateFile, loadConfig } from './config.js';
import { NbiError } from './errors.js';
import { MIN_TOKEN_LENGTH, startHttpServer } from './http.js';
import { NbiClient } from './nbi-client.js';
import { createMcpServer } from './server.js';

// Single source of truth: the published package.json (dist/cli.js -> ../package.json).
const VERSION: string = (createRequire(import.meta.url)('../package.json') as { version: string }).version;
const USAGE = `genieacs-nbi-mcp ${VERSION} — read-only MCP server for the GenieACS NBI

Usage: genieacs-nbi-mcp [--config genieacs.yaml] [options]

  --config <file>        configuration file (see genieacs.example.yaml); optional when GENIEACS_NBI_URL is set
  --http <host:port>     serve Streamable HTTP at /mcp instead of stdio (e.g. 127.0.0.1:8080)
  --allow-remote         allow binding a non-loopback address (put a TLS proxy in front)
  --allowed-host <h>     extra accepted Host header value (repeatable)
  --allowed-origin <o>   accepted Origin value (repeatable; browsers are refused by default)
  --check                validate the configuration, ping the NBI and exit
  -h, --help | -v, --version

Environment: GENIEACS_NBI_URL, GENIEACS_NBI_USER, GENIEACS_NBI_PASS.
HTTP mode needs a bearer token of at least ${MIN_TOKEN_LENGTH} characters in GENIEACS_MCP_TOKEN
or in the file named by GENIEACS_MCP_TOKEN_FILE (mode 0600).
`;

const log = (line: string) => process.stderr.write(`${line}\n`);

function readToken(env: NodeJS.ProcessEnv): string {
  if (env.GENIEACS_MCP_TOKEN) return env.GENIEACS_MCP_TOKEN;
  if (env.GENIEACS_MCP_TOKEN_FILE) { checkPrivateFile(env.GENIEACS_MCP_TOKEN_FILE, 'GENIEACS_MCP_TOKEN_FILE'); return fs.readFileSync(env.GENIEACS_MCP_TOKEN_FILE, 'utf8').trim(); }
  throw new ConfigError('HTTP mode needs GENIEACS_MCP_TOKEN or GENIEACS_MCP_TOKEN_FILE.');
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' }, http: { type: 'string' }, 'allow-remote': { type: 'boolean' }, 'allowed-host': { type: 'string', multiple: true }, 'allowed-origin': { type: 'string', multiple: true },
      check: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
    },
    strict: true,
  });
  if (values.help) { process.stdout.write(USAGE); return; }
  if (values.version) { process.stdout.write(`${VERSION}\n`); return; }

  const config = loadConfig(values.config);
  for (const w of config.warnings) log(`[warn] ${w}`);
  const client = new NbiClient({ baseUrl: config.baseUrl, auth: config.auth, timeoutMs: config.timeoutMs });
  const ctx = { client, config };

  if (values.check) {
    log(`configuration OK: ${config.baseUrl} (auth ${config.auth ? 'basic' : 'none'}, redact=${config.redact}).`);
    try {
      const r = await client.get('/devices', { projection: '_id', limit: 1 });
      log(`NBI reachable: ${r.total ?? (Array.isArray(r.data) ? r.data.length : 0)} device(s) reported.`);
    } catch (e) {
      log(`NBI check FAILED: ${e instanceof NbiError ? e.message : 'unexpected error'}`);
      process.exitCode = 1;
    }
    return;
  }

  if (values.http) {
    const m = /^(.*):(\d{1,5})$/.exec(values.http);
    if (!m) throw new ConfigError('--http expects host:port, e.g. 127.0.0.1:8080.');
    const host = m[1]!.replace(/^\[|\]$/g, '') || '127.0.0.1';
    const running = await startHttpServer({
      createServer: () => createMcpServer(ctx, VERSION), token: readToken(process.env), host, port: Number(m[2]),
      allowRemote: !!values['allow-remote'], allowedHosts: values['allowed-host'] ?? [], allowedOrigins: values['allowed-origin'] ?? [], log,
    });
    log(`[http] listening on http://${running.host}:${running.port}/mcp (bearer token required)`);
    const stop = () => { void running.close().then(() => process.exit(0)); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    return;
  }
  await createMcpServer(ctx, VERSION).connect(new StdioServerTransport());
  log(`[genieacs-nbi-mcp] ${VERSION} ready on stdio (${config.baseUrl}, redact=${config.redact})`);
}

main().catch((e: unknown) => {
  if (e instanceof ConfigError) log(`configuration error: ${e.message}`);
  else log(`fatal: ${e instanceof Error ? e.message.split('\n')[0] : 'unknown error'}`);
  process.exit(1);
});
