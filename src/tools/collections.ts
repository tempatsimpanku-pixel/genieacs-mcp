import { z } from 'zod';
import { asRows, clampLimit, guarded, jsonParam, limitField, listOutput, projectionField, projectionParam, queryField, skipField, sortField, tool, type ToolContext } from './common.js';

const deviceId = z.string().min(1).max(256).optional().describe('Only entries of this device `_id`.');

async function list(ctx: ToolContext, path: string, what: string, a: { query?: string | Record<string, unknown>; projection?: string | string[]; limit?: number; skip?: number; sort?: string | Record<string, number> }, extra?: Record<string, unknown>) {
  const base = a.query === undefined ? {} : (JSON.parse(jsonParam(a.query, 'query') ?? '{}') as Record<string, unknown>);
  const merged = { ...base, ...extra };
  const query = Object.keys(merged).length ? jsonParam(merged, 'query') : undefined;
  const res = await ctx.client.get(path, {
    query, projection: projectionParam(a.projection), limit: clampLimit(ctx, a.limit), skip: a.skip, sort: jsonParam(a.sort, 'sort'),
  });
  return listOutput(ctx, what, asRows(res.data), res.total);
}

const common = { query: queryField, projection: projectionField, limit: limitField, skip: skipField, sort: sortField };

export const acsTasks = tool({
  name: 'acs_tasks',
  title: 'Pending tasks',
  description: 'List queued ACS tasks (GET /tasks): operations waiting for a device to connect. A growing backlog on one device often means it is offline or unreachable. Read-only: tasks can not be created or deleted here.',
  inputSchema: { device_id: deviceId, ...common },
  run: (ctx, a) => guarded(ctx, () => list(ctx, '/tasks', 'tasks', a, a.device_id ? { device: a.device_id } : undefined)),
});

export const acsFaults = tool({
  name: 'acs_faults',
  title: 'Faults',
  description: 'List ACS faults (GET /faults): failed sessions or provisions per device/channel, with code, message, retry count and timestamps. Start here for "why does this ONT not provision".',
  inputSchema: { device_id: deviceId, ...common },
  run: (ctx, a) => guarded(ctx, () => list(ctx, '/faults', 'faults', a, a.device_id ? { device: a.device_id } : undefined)),
});

export const acsFiles = tool({
  name: 'acs_files',
  title: 'Firmware / config files',
  description: 'List files stored in the ACS (GET /files): firmware images and vendor config files with filename, fileType, OUI, productClass and version. Metadata only; file contents are not downloadable here.',
  inputSchema: { filename: z.string().max(256).optional().describe('Exact filename (matches `_id`).'), ...common },
  run: (ctx, a) => guarded(ctx, () => list(ctx, '/files', 'files', a, a.filename ? { _id: a.filename } : undefined)),
});

export const acsPresets = tool({
  name: 'acs_presets',
  title: 'Presets',
  description: 'List presets (GET /presets): which provisions run for which devices (channel, weight, precondition, events).',
  inputSchema: common,
  run: (ctx, a) => guarded(ctx, () => list(ctx, '/presets', 'presets', a)),
});

export const acsProvisions = tool({
  name: 'acs_provisions',
  title: 'Provisions',
  description: 'List provision scripts (GET /provisions). Script bodies are returned as stored, with password-like assignments masked.',
  inputSchema: common,
  run: (ctx, a) => guarded(ctx, () => list(ctx, '/provisions', 'provisions', a)),
});
