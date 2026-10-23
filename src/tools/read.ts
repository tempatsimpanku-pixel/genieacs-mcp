import { z } from 'zod';
import { assertGet } from '../guard.js';
import { guarded, listOutput, tool } from './common.js';

export const acsRead = tool({
  name: 'acs_read',
  title: 'Raw GET on the NBI',
  description: 'Escape hatch: GET any readable NBI path, e.g. "/devices?limit=3&projection=_id" or "/virtualparameters". Allowed collections: /devices /tasks /faults /files /presets /provisions /virtualparameters /objects. '
    + 'Only GET is sent; POST/PUT/PATCH/DELETE, /devices/{id}/tasks, tag changes and the connection_request flag are refused by policy. Prefer the dedicated acs_* tools.',
  inputSchema: {
    path: z.string().min(1).max(4000).describe('NBI path with optional query string, starting with "/".'),
    method: z.string().max(16).optional().describe('Must be GET (default). Anything else is refused.'),
  },
  run: (ctx, a) => guarded(ctx, async () => {
    assertGet(a.method ?? 'GET');
    const res = await ctx.client.get(a.path);
    const rows = Array.isArray(res.data) ? res.data : [res.data];
    return listOutput(ctx, `GET ${a.path.split('?')[0]}`, rows, res.total, { path: a.path.split('?')[0] });
  }),
});
