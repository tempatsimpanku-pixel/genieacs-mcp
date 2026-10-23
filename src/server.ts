import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TOOLS, type ToolContext, type ToolOutput } from './tools/index.js';

export const SERVER_NAME = 'genieacs-nbi-mcp';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function toResult(r: ToolOutput): CallToolResult {
  return {
    content: [{ type: 'text', text: r.text }],
    structuredContent: { ok: !r.isError, ...(r.errorKind ? { error: r.errorKind } : {}), ...(r.data !== undefined ? { data: r.data } : {}) },
    ...(r.isError ? { isError: true } : {}),
  };
}

/** One MCP server exposing the read-only GenieACS tools. Cheap enough to build per request (stateless HTTP). */
export function createMcpServer(ctx: ToolContext, version: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version }, {
    instructions: 'Read-only visibility into a GenieACS (TR-069) ACS for ISP/NOC operators. Every tool only sends HTTP GET to the NBI; writes (tasks, tags, reboot, refreshObject, delete) are refused by policy. '
      + 'Start with acs_devices (always give a projection and a limit), then acs_device for one CPE, acs_faults / acs_tasks to see why a device does not provision. '
      + 'Passwords, Wi-Fi keys and communities in device data are masked. acs_read is a raw GET escape hatch for paths without a dedicated tool.',
  });
  for (const t of TOOLS) {
    server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.inputSchema as z.ZodRawShape, annotations: READ_ONLY },
      async (args: Record<string, unknown>) => toResult(await t.run(ctx, args)));
  }
  return server;
}
