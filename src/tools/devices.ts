import { z } from 'zod';
import { asRows, clampLimit, guarded, jsonParam, limitField, listOutput, projectionField, projectionParam, queryField, skipField, sortField, tool } from './common.js';

export const acsDevices = tool({
  name: 'acs_devices',
  title: 'List / search devices',
  description: 'List or search CPE/ONT devices known to the ACS (GET /devices). Use `query` to filter and ALWAYS pass a `projection` to keep rows small. '
    + 'Examples: {"_id":{"$regex":"ZTE"}} · {"_lastInform":{"$lt":"2026-10-01T00:00:00Z"}} (stale devices) · {"VirtualParameters.pppoeUsername":"user@isp"}. `total` is the number of matches.',
  inputSchema: { query: queryField, projection: projectionField, limit: limitField, skip: skipField, sort: sortField },
  run: (ctx, a) => guarded(ctx, async () => {
    const res = await ctx.client.get('/devices', {
      query: jsonParam(a.query, 'query'), projection: projectionParam(a.projection),
      limit: clampLimit(ctx, a.limit), skip: a.skip, sort: jsonParam(a.sort, 'sort'),
    });
    return listOutput(ctx, 'devices', asRows(res.data), res.total);
  }),
});

export const acsDevice = tool({
  name: 'acs_device',
  title: 'Device detail',
  description: 'Read one device by its exact `_id` (e.g. "202BC1-BM632w-000001"; GET /devices?query={"_id":…}). Pass `projection` (comma separated parameter paths) unless you really need the full parameter tree. Secrets (Wi-Fi keys, passwords, communities) are masked.',
  inputSchema: { id: z.string().min(1).max(256).describe('Exact device _id as shown by acs_devices.'), projection: projectionField },
  run: (ctx, a) => guarded(ctx, async () => {
    const res = await ctx.client.get('/devices', { query: JSON.stringify({ _id: a.id }), projection: projectionParam(a.projection), limit: 1 });
    const rows = asRows(res.data);
    if (rows.length === 0) return { text: `No device with _id "${a.id}".`, isError: true, errorKind: 'not_found' };
    const out = listOutput(ctx, 'device', rows.slice(0, 1), undefined);
    return { ...out, data: { device: (out.data as { items: unknown[] }).items[0] } };
  }),
});
