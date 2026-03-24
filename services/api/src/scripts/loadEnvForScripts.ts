/**
 * Load .env / .env.local into process.env before importing ../config in CLI scripts.
 * Order: repo .env → repo .env.local → services/api/.env → services/api/.env.local
 * - `*.env`: only sets keys that are not already in process.env (shell wins).
 * - `*.env.local`: overrides (typical local secrets).
 */

import fs from 'fs';
import path from 'path';

function applyEnvLines(content: string, override: boolean): void {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

const scriptDir = __dirname;
const apiRoot = path.resolve(scriptDir, '../..');
const repoRoot = path.resolve(apiRoot, '..');

const files: Array<{ file: string; override: boolean }> = [
  { file: path.join(repoRoot, '.env'), override: false },
  { file: path.join(repoRoot, '.env.local'), override: true },
  { file: path.join(apiRoot, '.env'), override: false },
  { file: path.join(apiRoot, '.env.local'), override: true },
];

for (const { file, override } of files) {
  if (!fs.existsSync(file)) continue;
  try {
    applyEnvLines(fs.readFileSync(file, 'utf8'), override);
  } catch {
    /* ignore */
  }
}
