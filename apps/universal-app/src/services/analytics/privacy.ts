const SENSITIVE_ANALYTICS_PROPERTY_NAMES = new Set([
  'audiouri',
  'audiourl',
  'childname',
  'childnames',
  'childprofile',
  'displayname',
  'email',
  'errormessage',
  'imageuri',
  'imageurl',
  'message',
  'narration',
  'photo',
  'photos',
  'photouri',
  'photourl',
  'prompt',
  'rawprompt',
  'storytext',
  'storytitle',
  'text',
  'transcript',
]);

function normalizePropertyName(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function scrubAnalyticsProperties<T extends Record<string, unknown> | undefined>(
  properties: T,
): T {
  if (!properties) return properties;

  const scrubbed = { ...properties };
  for (const key of Object.keys(scrubbed)) {
    if (SENSITIVE_ANALYTICS_PROPERTY_NAMES.has(normalizePropertyName(key))) {
      delete scrubbed[key];
    }
  }

  return scrubbed as T;
}
