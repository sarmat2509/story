import '../scripts/loadEnvForScripts';
import { setOpsRuntimeMode, type OpsRuntimeMode } from '../services/opsRuntimeService';

function parseMode(raw: string | undefined): OpsRuntimeMode {
  if (raw === 'normal' || raw === 'draining' || raw === 'maintenance') return raw;
  throw new Error('Usage: tsx src/scripts/setOpsMode.ts <normal|draining|maintenance> [message] [endsAtIso]');
}

async function main() {
  const mode = parseMode(process.argv[2]);
  const message = process.argv[3]?.trim() || null;
  const endsAtRaw = process.argv[4]?.trim();
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    throw new Error(`Invalid endsAt ISO date: ${endsAtRaw}`);
  }

  const status = await setOpsRuntimeMode({
    mode,
    message,
    startsAt: mode === 'normal' ? null : new Date(),
    endsAt: mode === 'normal' ? null : endsAt,
    updatedByUserId: null,
  });

  console.log(JSON.stringify(status, null, 2));
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
