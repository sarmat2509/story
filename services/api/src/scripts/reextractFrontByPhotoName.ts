/**
 * Re-run turnaround → front extraction when you only know the character_front filename.
 * Picks the newest character_turnaround/*.png in the same user photos tree whose numeric
 * basename is still ≤ the front timestamp (typical: sheet saved, then front with newer id).
 *
 * Usage (from services/api):
 *   pnpm exec tsx src/scripts/reextractFrontByPhotoName.ts 1776082425614.png
 *   pnpm exec tsx src/scripts/reextractFrontByPhotoName.ts 1776082425614.png --sheet ../character_turnaround/1773309017106.png
 *
 * Logs right-edge debug to stdout (JSON lines). Writes:
 *   .../character_turnaround/diagnose_reextract_<frontBasename>/extracted_front.png
 */
import * as fs from 'fs';
import * as path from 'path';
import { extractFrontFromTurnaround, type RightEdgeDebug } from '../services/turnaroundFrontExtractor';

function parseFrontTs(basename: string): number | null {
  const m = /^(\d+)\.png$/i.exec(basename);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

function findFrontFile(frontBasename: string): string | null {
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsRoot)) return null;
  const stack = [uploadsRoot];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name === frontBasename && full.includes(`${path.sep}character_front${path.sep}`)) {
        return full;
      }
    }
  }
  return null;
}

function findBestTurnaroundSheet(frontPath: string, frontTs: number, explicitSheet: string | null): string | null {
  if (explicitSheet) {
    const abs = path.isAbsolute(explicitSheet)
      ? explicitSheet
      : path.resolve(path.dirname(frontPath), explicitSheet);
    return fs.existsSync(abs) ? abs : null;
  }
  const photosDir = path.dirname(path.dirname(frontPath));
  const turnaroundDir = path.join(photosDir, 'character_turnaround');
  if (!fs.existsSync(turnaroundDir)) return null;
  let best: { ts: number; file: string } | null = null;
  for (const name of fs.readdirSync(turnaroundDir)) {
    if (!/^\d+\.png$/i.test(name)) continue;
    const ts = Number.parseInt(name.replace(/\.png$/i, ''), 10);
    if (!Number.isFinite(ts) || ts > frontTs) continue;
    const file = path.join(turnaroundDir, name);
    if (!best || ts > best.ts) best = { ts, file };
  }
  return best?.file ?? null;
}

async function main() {
  const argv = process.argv.slice(2);
  let explicitSheet: string | null = null;
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sheet' && argv[i + 1]) {
      explicitSheet = argv[i + 1]!;
      i++;
      continue;
    }
    args.push(argv[i]!);
  }
  const frontBasename = args[0];
  if (!frontBasename) {
    console.error('Usage: pnpm exec tsx src/scripts/reextractFrontByPhotoName.ts <frontBasename.png> [--sheet path/to/turnaround.png]');
    process.exit(1);
  }
  const frontTs = parseFrontTs(frontBasename);
  if (frontTs == null) {
    console.error('Expected basename like 1776082425614.png');
    process.exit(1);
  }

  const frontPath = findFrontFile(frontBasename);
  if (!frontPath) {
    console.error(`character_front file not found under uploads/: ${frontBasename}`);
    process.exit(1);
  }
  console.log(`Front: ${frontPath} (ts=${frontTs})`);

  const sheetPath = findBestTurnaroundSheet(frontPath, frontTs, explicitSheet);
  if (!sheetPath) {
    console.error(
      'No character_turnaround sheet found (same user photos dir, numeric name ≤ front ts). Copy the turnaround PNG into character_turnaround/ or pass --sheet relative/absolute path.',
    );
    process.exit(1);
  }
  console.log(`Sheet: ${sheetPath}`);
  const sheetTs = Number.parseInt(path.basename(sheetPath, '.png'), 10);
  if (Number.isFinite(sheetTs) && Number.isFinite(frontTs) && !explicitSheet && frontTs - sheetTs > 86_400_000) {
    console.warn(
      `\n⚠️  Turnaround is ${Math.round((frontTs - sheetTs) / 86_400_000)}+ days older than the front filename — likely NOT the same character. Re-run with:\n` +
        `  pnpm exec tsx src/scripts/reextractFrontByPhotoName.ts ${frontBasename} --sheet path/to/correct_turnaround.png\n`,
    );
  }

  const buffer = fs.readFileSync(sheetPath);
  const outDir = path.join(path.dirname(sheetPath), `diagnose_reextract_${path.basename(frontBasename, '.png')}`);
  fs.mkdirSync(outDir, { recursive: true });

  const frontBuffer = await extractFrontFromTurnaround(buffer, {
    onRightEdge: (d: RightEdgeDebug) => {
      console.log(
        JSON.stringify({
          msg: 'right_edge',
          chosenMethod: d.chosenMethod,
          delta: d.delta,
          edgePure: d.edgePure,
          edgeSoft: d.edgeSoft,
          rightEdge: d.rightEdge,
          maskCcLargeComponents: d.maskCcLargeComponents ?? null,
          maskCcLeftBlobMinX: d.maskCcLeftBlobMinX ?? null,
          maskCcLeftBlobMaxX: d.maskCcLeftBlobMaxX ?? null,
          maskCcLeftBlobMaxY: d.maskCcLeftBlobMaxY ?? null,
          maskCcBgDelta: d.maskCcBgDelta ?? null,
        }),
      );
    },
  });

  if (!frontBuffer) {
    console.error('extractFrontFromTurnaround returned null');
    process.exit(1);
  }
  const outPng = path.join(outDir, 'extracted_front.png');
  fs.writeFileSync(outPng, frontBuffer);
  console.log(`Wrote ${outPng} (${frontBuffer.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
