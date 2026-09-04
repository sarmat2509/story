import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function main(): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'wt-writer-diagnostics-'));
  process.env.WRITER_RESPONSE_DIAGNOSTICS_DIR = directory;
  const { pruneWriterResponseDiagnostics, writeWriterResponseDiagnostic } =
    await import('../writerResponseDiagnosticsService');

  try {
    const fileName = await writeWriterResponseDiagnostic({
      requestId: 'c1111111-1111-4111-8111-111111111111',
      initialResponse: 'title: Broken\n\nNo delimiter was provided.',
      repairedResponse: 'title: Fixed\n\ndescription: A story.\n\n---\nScene one.',
      initialDiagnostics: { looseDelimiterCount: 0 },
      repairDiagnostics: { looseDelimiterCount: 1 },
      provider: 'gemini',
      model: 'gemini-test',
    });

    assert.ok(fileName?.endsWith('.log'), 'writes a timestamped .log artifact');
    assert.match(fileName!, /writer-format\.log$/);
    const filePath = path.join(directory, fileName!);
    assert.ok(
      (await readdir(directory)).includes(fileName!),
      'writing does not wait for retention cleanup to finish'
    );
    await utimes(filePath, new Date(0), new Date(0));
    assert.equal(
      await pruneWriterResponseDiagnostics(Date.now()),
      1,
      'deletes diagnostics after 7 days'
    );
    assert.deepEqual(await readdir(directory), [], 'expired artifact is gone');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log('writer response diagnostics tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
