import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../utils/logger';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const diagnosticsDirectory = path.resolve(
  process.env.WRITER_RESPONSE_DIAGNOSTICS_DIR ||
    path.join(process.cwd(), 'logs', 'writer-response-diagnostics')
);

export type WriterResponseDiagnosticInput = {
  requestId?: string;
  initialResponse: string;
  repairedResponse?: string;
  initialDiagnostics: Record<string, unknown>;
  repairDiagnostics?: Record<string, unknown>;
  provider?: string;
  model?: string;
  finishReason?: string | null;
  repairError?: string;
};

function timestampForFilename(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace('.', '_');
}

function safeRequestId(value?: string): string {
  return value && /^[a-zA-Z0-9-]+$/.test(value) ? value : 'unknown-request';
}

/** Delete full Writer diagnostics after their short forensic retention period. */
export async function pruneWriterResponseDiagnostics(now = Date.now()): Promise<number> {
  try {
    const entries = await readdir(diagnosticsDirectory, { withFileTypes: true });
    let deleted = 0;
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile() || !entry.name.endsWith('.log')) return;
        const filePath = path.join(diagnosticsDirectory, entry.name);
        const details = await stat(filePath);
        if (now - details.mtimeMs <= RETENTION_MS) return;
        await unlink(filePath);
        deleted += 1;
      })
    );
    if (deleted > 0) logger.info({ deleted }, 'Pruned expired Writer response diagnostics');
    return deleted;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return 0;
    logger.warn({ err: error }, 'Failed to prune Writer response diagnostics');
    return 0;
  }
}

/**
 * Store complete malformed Writer output outside ordinary logs for a narrowly-scoped,
 * time-bounded forensic review. This is intentionally called only after a format failure.
 */
export async function writeWriterResponseDiagnostic(
  input: WriterResponseDiagnosticInput
): Promise<string | null> {
  try {
    await mkdir(diagnosticsDirectory, { recursive: true });
    // Retention is deliberately decoupled from the story request path.
    // A slow filesystem or a large old diagnostic set must never delay generation.
    void pruneWriterResponseDiagnostics();
    const fileName = `${timestampForFilename()}-${safeRequestId(input.requestId)}-writer-format.log`;
    const filePath = path.join(diagnosticsDirectory, fileName);
    const header = {
      capturedAt: new Date().toISOString(),
      retention: '7 days',
      requestId: input.requestId ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      finishReason: input.finishReason ?? null,
      initialDiagnostics: input.initialDiagnostics,
      repairDiagnostics: input.repairDiagnostics ?? null,
      repairError: input.repairError ?? null,
    };
    const content = [
      JSON.stringify(header, null, 2),
      '',
      '===== RAW_WRITER_RESPONSE =====',
      input.initialResponse,
      '',
      '===== RAW_FORMAT_REPAIR_RESPONSE =====',
      input.repairedResponse ?? '(repair did not return a response)',
      '',
    ].join('\n');
    await writeFile(filePath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return fileName;
  } catch (error) {
    logger.error({ err: error }, 'Failed to write Writer response diagnostic');
    return null;
  }
}

void pruneWriterResponseDiagnostics();
const retentionTimer = setInterval(() => void pruneWriterResponseDiagnostics(), PRUNE_INTERVAL_MS);
retentionTimer.unref();
