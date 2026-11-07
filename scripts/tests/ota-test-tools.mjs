import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findHdiffz } from '../ota-delta.mjs';

export const hdiffSkip = 'Optional HDiff integration: set VALDI_HDIFFZ to an executable hdiffz, install ota/tools/hdiffz(.exe), or add hdiffz to PATH. No tool is downloaded.';

export function optionalHdiffz({ root = path.resolve(import.meta.dirname, '../..'), env = process.env } = {}) {
  try { return findHdiffz({ root, env }); }
  catch (error) {
    if (env.VALDI_HDIFFZ || !error.message.startsWith('Delta base requires hdiffz:')) throw error;
    return undefined;
  }
}

// Discovery/copy-only fixtures never execute this tool. Fail if they start doing so.
export function discoveryHdiffz(directory) {
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, process.platform === 'win32' ? 'hdiffz.exe' : 'hdiffz');
  writeFileSync(file, '#!/bin/sh\nexit 97\n');
  chmodSync(file, 0o755);
  return file;
}
