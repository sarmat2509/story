export function normalizeCompositionPosition(value?: string | null): string | null {
  const normalized = String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  return normalized || null;
}

export function formatCharacterLocationLine(params: {
  label: string;
  description?: string | null;
  position?: string | null;
  indent?: string;
  fallbackLocation?: string;
}): string {
  const position = normalizeCompositionPosition(params.position);
  const description = String(params.description || '').trim();
  const location = [
    position ? `in the ${position}` : null,
    description,
  ]
    .filter(Boolean)
    .join(', ');

  return `${params.indent || ''}Character ${params.label} is located ${
    location || params.fallbackLocation || 'in the scene'
  }`;
}
