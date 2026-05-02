import assert from 'node:assert/strict';
import { APP_UI_LOCALES } from '@wondertales/shared';
import uk from '@wondertales/shared/i18n/uk.json';
import en from '@wondertales/shared/i18n/en.json';
import ru from '@wondertales/shared/i18n/ru.json';
import pl from '@wondertales/shared/i18n/pl.json';

type TranslationTree = Record<string, unknown>;

const resources: Record<string, TranslationTree> = { uk, en, ru, pl };

function flattenKeys(value: unknown, prefix = '', output = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) output.add(prefix);
    return output;
  }

  for (const [key, child] of Object.entries(value as TranslationTree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenKeys(child, path, output);
    } else {
      output.add(path);
    }
  }

  return output;
}

function valueAtPath(value: TranslationTree, keyPath: string): unknown {
  return keyPath.split('.').reduce<unknown>((cursor, key) => {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return undefined;
    }
    return (cursor as TranslationTree)[key];
  }, value);
}

assert.deepEqual(
  [...APP_UI_LOCALES],
  ['uk', 'en', 'ru', 'pl'],
  'launch app UI locales should stay limited to locales with complete app translation coverage'
);

const allKeys = new Set<string>();
for (const locale of APP_UI_LOCALES) {
  const keys = flattenKeys(resources[locale]);
  for (const key of keys) allKeys.add(key);
}

for (const locale of APP_UI_LOCALES) {
  const resource = resources[locale];
  const keys = flattenKeys(resource);
  const missing = [...allKeys].filter((key) => !keys.has(key));
  assert.deepEqual(missing, [], `${locale} app UI translations should cover every launch UI key`);

  const empty = [...keys].filter((key) => {
    const value = valueAtPath(resource, key);
    return typeof value === 'string' && value.trim().length === 0;
  });
  assert.deepEqual(empty, [], `${locale} app UI translations should not contain empty strings`);
}

console.log('appUiI18nCoverage tests passed');
