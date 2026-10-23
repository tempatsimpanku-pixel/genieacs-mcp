import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ServerConfig } from '../../src/config.js';
import { NbiClient } from '../../src/nbi-client.js';
import { createMcpServer } from '../../src/server.js';

export function testConfig(baseUrl: string, over: Partial<ServerConfig> = {}): ServerConfig {
  return { baseUrl, timeoutMs: 3000, defaultLimit: 50, maxLimit: 500, maxOutputBytes: 200_000, redact: true, warnings: [], ...over };
}

export async function connect(baseUrl: string, over: Partial<ServerConfig> = {}): Promise<Client> {
  const config = testConfig(baseUrl, over);
  const server = createMcpServer({ client: new NbiClient({ baseUrl, auth: config.auth, timeoutMs: config.timeoutMs }), config }, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
  return client;
}

export interface Called { text: string; isError: boolean; structured: Record<string, unknown> }
export async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Called> {
  const r = await client.callTool({ name, arguments: args });
  const content = r.content as Array<{ type: string; text: string }>;
  return { text: content.map((c) => c.text).join('\n'), isError: !!r.isError, structured: (r.structuredContent ?? {}) as Record<string, unknown> };
}
