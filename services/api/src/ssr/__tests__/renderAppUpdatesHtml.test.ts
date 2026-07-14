import assert from 'node:assert/strict';
import {
  AppReleaseInputSchema,
  LOCALE_IDS,
  PUBLIC_SEO_LOCALES,
  buildPublicUpdatesPath,
} from '@wondertales/shared';
import { renderAppUpdatesHtml } from '../renderAppUpdatesHtml';
import type { PublishedAppRelease } from '../../repositories/AppReleaseRepository';

const validInput = {
  version: null,
  releaseDate: '2026-07-14',
  status: 'published',
  translations: LOCALE_IDS.map((locale) => ({
    locale,
    title: `Title ${locale}`,
    changes: [
      { id: 'change-1', kind: 'new', title: `Public ${locale}`, description: 'Public summary' },
    ],
    emailSubject: `PRIVATE SUBJECT ${locale}`,
    emailPreheader: `PRIVATE PREHEADER ${locale}`,
    emailBody: [{ id: 'email-1', type: 'paragraph', text: `PRIVATE EMAIL BODY ${locale}` }],
  })),
};

assert.equal(AppReleaseInputSchema.safeParse(validInput).success, true);
assert.equal(
  AppReleaseInputSchema.safeParse({ ...validInput, translations: validInput.translations.slice(1) })
    .success,
  false,
  'all system locales are required'
);
assert.equal(
  AppReleaseInputSchema.safeParse({
    ...validInput,
    translations: [...validInput.translations.slice(0, -1), validInput.translations[0]],
  }).success,
  false,
  'duplicate locales cannot replace a missing locale'
);

const release: PublishedAppRelease = {
  id: 'a0000000-0000-4000-8000-000000000714',
  version: null,
  releaseDate: '2026-07-14',
  publishedAt: new Date('2026-07-14T12:00:00Z'),
  updatedAt: new Date('2026-07-14T12:00:00Z'),
  contentRevision: 1,
  locale: 'en',
  title: 'Public release title',
  changes: [
    { id: 'one', kind: 'new', title: 'Public feature', description: 'Visible public summary' },
  ],
};

for (const locale of PUBLIC_SEO_LOCALES) {
  const html = renderAppUpdatesHtml({ locale, releases: [release] });
  assert.match(html, new RegExp(`<html lang="${locale}">`));
  assert.match(html, /Public release title/);
  assert.match(html, /Visible public summary/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /"@type":"CollectionPage"/);
  for (const alternate of PUBLIC_SEO_LOCALES) {
    assert.match(
      html,
      new RegExp(
        `hreflang="${alternate}"[^>]+${buildPublicUpdatesPath(alternate).replace(/\//g, '\\/')}`
      )
    );
  }
  assert.doesNotMatch(html, /PRIVATE SUBJECT|PRIVATE PREHEADER|PRIVATE EMAIL BODY/);
}

console.log('renderAppUpdatesHtml tests passed');
