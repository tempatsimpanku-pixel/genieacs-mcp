import { acsFaults, acsFiles, acsPresets, acsProvisions, acsTasks } from './collections.js';
import type { ToolDef } from './common.js';
import { acsDevice, acsDevices } from './devices.js';
import { acsRead } from './read.js';

export const TOOLS: ToolDef[] = [acsDevices, acsDevice, acsTasks, acsFaults, acsFiles, acsPresets, acsProvisions, acsRead];
export type { ToolContext, ToolDef, ToolOutput } from './common.js';
