/**
 * Strip scene delimiter (---) from scene text before render.
 * LLM may output stray --- at start/end of scene blocks.
 */
function stripSceneDelimiter(text: string): string {
  return text
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*\n?/g, '')
    .replace(/\n?\s*(?:-{3,}|\*{3,}|_{3,})\s*$/g, '')
    .trim();
}

const SCENE_DELIMITER_LINE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Non-sensitive diagnostics for malformed Writer output. Never includes story text. */
export function getPlainTextFormatDiagnostics(rawText: string): {
  responseLength: number;
  lineEnding: 'crlf' | 'cr' | 'lf' | 'none';
  nonEmptyLineCount: number;
  exactDelimiterCount: number;
  looseDelimiterCount: number;
  hasTitleHeader: boolean;
  hasDescriptionHeader: boolean;
  startsWithJson: boolean;
} {
  const lines = rawText.split(/\r\n?|\n/);
  const exactDelimiterCount = lines.filter((line) => line === '---').length;
  const looseDelimiterCount = lines.filter((line) => SCENE_DELIMITER_LINE.test(line)).length;
  return {
    responseLength: rawText.length,
    lineEnding: rawText.includes('\r\n')
      ? 'crlf'
      : rawText.includes('\r')
        ? 'cr'
        : rawText.includes('\n')
          ? 'lf'
          : 'none',
    nonEmptyLineCount: lines.filter((line) => line.trim().length > 0).length,
    exactDelimiterCount,
    looseDelimiterCount,
    hasTitleHeader: /^title:\s*\S/im.test(rawText),
    hasDescriptionHeader: /^description:\s*\S/im.test(rawText),
    startsWithJson: rawText.trimStart().startsWith('{'),
  };
}

/**
 * Parse plain text story format into structured scenes.
 * Format: title: X\n\ndescription: Y\n\n---\nScene1...\n---\nScene2...
 */
export function parsePlainTextToScenes(rawText: string): {
  title: string;
  description: string;
  fullText: string;
  scenes: Array<{ sceneId: number; text: string }>;
} {
  const normalizedText = normalizeLineEndings(rawText);
  let title = '';
  let description = '';
  let rest = normalizedText;

  // Extract title
  const titleMatch = normalizedText.match(/^title:\s*(.+?)(?:\n|$)/im);
  if (titleMatch) {
    title = titleMatch[1].trim();
    rest = rest.replace(/^title:\s*.+?(?:\n|$)/im, '').trim();
  }

  // Extract description (until double newline or ---)
  const descMatch = rest.match(/^description:\s*([\s\S]+?)(?:\n\n|(?:\n---\n)|$)/im);
  if (descMatch) {
    description = descMatch[1].trim();
    rest = rest.replace(/^description:\s*[\s\S]+?(?:\n\n|(?:\n---\n)|$)/im, '').trim();
  }

  // Accept common Markdown horizontal-rule variants and whitespace around the delimiter.
  // Writer output is still required to contain at least one readable scene by the caller.
  const sceneBlocks = rest
    .split(/\n\s*(?:-{3,}|\*{3,}|_{3,})\s*\n/)
    .map((scene) => stripSceneDelimiter(scene.trim()))
    .filter(Boolean);

  const scenes = sceneBlocks.map((text, i) => ({
    sceneId: i + 1,
    text,
  }));

  const fullText = scenes.map((s) => s.text).join('\n\n');

  return {
    title: title || 'Untitled',
    description,
    fullText,
    scenes,
  };
}
