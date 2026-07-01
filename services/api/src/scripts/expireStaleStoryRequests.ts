import '../scripts/loadEnvForScripts';
import { expireStaleStoryRequests } from '../services/staleStoryRequestService';

function getArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const ttlMs = Number.parseInt(getArg('ttl-ms', '600000'), 10);
  const limit = Number.parseInt(getArg('limit', '100'), 10);
  const dryRun = hasFlag('dry-run');
  const result = await expireStaleStoryRequests({ ttlMs, limit, dryRun });
  console.log(JSON.stringify(result));

  if (result.errors > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
