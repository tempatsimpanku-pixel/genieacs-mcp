import { z } from 'zod';
import type { ServerConfig } from '../config.js';
import { NbiError, PolicyError } from '../errors.js';
import type { NbiClient } from '../nbi-client.js';
import { redactData, redactText } from '../redact.js';

export interface ToolContext {
  client: NbiClient;
  config: ServerConfig;
}

export interface ToolOutput {
  text: string;
  isError?: boolean;
  data?: unknown;
  errorKind?: string;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolOutput>;
}

/** Define a tool with typed arguments. */
export function tool<S extends z.ZodRawShape>(def: Omit<ToolDef, 'run' | 'inputSchema'> & { inputSchema: S; run: (ctx: ToolContext, args: z.infer<z.ZodObject<S>>) => Promise<ToolOutput> }): ToolDef {
  return def as unknown as ToolDef;
}

const SAFE_PROJECTION = /^[A-Za-z0-9_.,*:\-[\]{} ]+$/;

export const limitField = z.number().int().min(1).max(10_000).optional().describe('Rows to return (default and maximum come from the server configuration).');
export const skipField = z.number().int().min(0).max(1_000_000).optional().describe('Rows to skip, for paging. Use `total` in the result to know how many exist.');
export const projectionField = z.union([z.string().max(2000), z.array(z.string().max(300)).max(100)]).optional()
  .describe('Comma separated parameter paths to return, e.g. "_id,_lastInform,InternetGatewayDevice.DeviceInfo.SerialNumber". Strongly recommended: a full device document can be hundreds of KB.');
export const queryField = z.union([z.string().max(4000), z.record(z.string(), z.unknown())]).optional()
  .describe('GenieACS query as a JSON object (or JSON string), e.g. {"_id":{"$regex":"ZTE"}} or {"_lastInform":{"$gt":"2026-10-15T00:00:00Z"}}. Operators: $eq $ne $in $nin $gt $gte $lt $lte $exists $and $or $regex.');
export const sortField = z.union([z.string().max(500), z.record(z.string(), z.number())]).optional().describe('Sort as JSON, e.g. {"_lastInform":-1}.');

export function clampLimit(ctx: ToolContext, limit: number | undefined): number {
  return Math.min(limit ?? ctx.config.defaultLimit, ctx.config.maxLimit);
}

export function projectionParam(p: string | string[] | undefined): string | undefined {
  if (p === undefined) return undefined;
  const s = (Array.isArray(p) ? p.join(',') : p).replace(/\s+/g, '');
  if (!s) return undefined;
  if (!SAFE_PROJECTION.test(s)) throw new PolicyError('Refused: projection may only contain letters, digits and . , * : - _ [ ] { }.');
  return s;
}

const BAD_OPERATORS = /\$(where|function|accumulator|expr|jsonSchema|merge|out)\b/;

/** Query/sort arrive as an object or JSON text; return canonical JSON text or throw. */
export function jsonParam(value: string | Record<string, unknown> | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  let obj: unknown = value;
  if (typeof value === 'string') {
    if (!value.trim()) return undefined;
    try { obj = JSON.parse(value); } catch { throw new PolicyError(`Refused: ${label} is not valid JSON.`); }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new PolicyError(`Refused: ${label} must be a JSON object.`);
  const text = JSON.stringify(obj);
  if (text.length > 4000) throw new PolicyError(`Refused: ${label} is too long.`);
  if (BAD_OPERATORS.test(text)) throw new PolicyError(`Refused: ${label} uses an operator that is not allowed.`);
  return text;
}

/** Page of rows → tool output. Items are dropped from the tail until the JSON fits `maxOutputBytes`. */
export function listOutput(ctx: ToolContext, what: string, items: unknown[], total: number | undefined, extra: Record<string, unknown> = {}): ToolOutput {
  const secrets = ctx.client.secrets();
  const shaped = ctx.config.redact ? redactData(items, secrets) : items;
  let kept = shaped;
  const build = (rows: unknown[]) => ({ ...extra, ...(total !== undefined ? { total } : {}), count: rows.length, items: rows });
  let text = JSON.stringify(build(kept), null, 1);
  while (text.length > ctx.config.maxOutputBytes && kept.length > 1) {
    kept = kept.slice(0, Math.max(1, Math.floor(kept.length / 2)));
    text = JSON.stringify({ ...build(kept), truncated: true, note: 'Output trimmed to fit max_output_bytes; use skip/limit or a projection.' }, null, 1);
  }
  if (text.length > ctx.config.maxOutputBytes) text = `${text.slice(0, ctx.config.maxOutputBytes)}\n… [truncated]`;
  const header = `${what}: ${kept.length} row(s)${total !== undefined ? ` of ${total}` : ''}`;
  return { text: `${header}\n${text}`, data: { ...build(kept) } };
}

export function errorOutput(ctx: ToolContext, e: unknown): ToolOutput {
  const secrets = ctx.client.secrets();
  if (e instanceof PolicyError) return { text: e.message, isError: true, errorKind: 'policy' };
  if (e instanceof NbiError) return { text: redactText(e.message, secrets), isError: true, errorKind: e.kind };
  return { text: 'Unexpected internal error.', isError: true, errorKind: 'internal' };
}

/** Run a tool body, converting every failure to a tool error result. */
export async function guarded(ctx: ToolContext, fn: () => Promise<ToolOutput>): Promise<ToolOutput> {
  try { return await fn(); } catch (e) { return errorOutput(ctx, e); }
}

/** Rows come back as an array; tolerate a single object or null. */
export function asRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  return data === null || data === undefined ? [] : [data];
}
