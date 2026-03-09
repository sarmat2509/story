/**
 * Strip scene delimiter (---) from scene text before render.
 * LLM may output stray --- at start/end of scene blocks.
 */
function stripSceneDelimiter(text: string): string {
  return text
    .replace(/^\s*---\s*\n?/g, '')
    .replace(/\n?\s*---\s*$/g, '')
    .trim();
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
  const lines = rawText.split('\n');
  let title = '';
  let description = '';
  let rest = rawText;

  // Extract title
  const titleMatch = rawText.match(/^title:\s*(.+?)(?:\n|$)/im);
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

  // Split by --- (delimiter on its own line)
  const sceneBlocks = rest.split(/\n---\n/).map(s => stripSceneDelimiter(s.trim())).filter(Boolean);

  const scenes = sceneBlocks.map((text, i) => ({
    sceneId: i + 1,
    text,
  }));

  const fullText = scenes.map(s => s.text).join('\n\n');

  return {
    title: title || 'Untitled',
    description,
    fullText,
    scenes,
  };
}
