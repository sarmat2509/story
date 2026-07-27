import assert from 'node:assert/strict';
import type { ImageValidationAnalyticsRow } from '../imageValidationAnalyticsService';
import { buildImageValidationCharacterRegenerationAnalytics } from '../imageValidationAnalyticsService';

const storyId = '11111111-1111-4111-8111-111111111111';
const createdAt = new Date('2026-07-26T10:00:00.000Z');

function row(
  overrides: Partial<ImageValidationAnalyticsRow> & Pick<ImageValidationAnalyticsRow, 'attempt'>
): ImageValidationAnalyticsRow {
  return {
    storyId,
    sceneIndex: 1,
    subjectType: 'scene_image',
    pageNumber: null,
    panelIndex: null,
    panelId: null,
    requestManifest: null,
    result: { expectedCharacterCount: 1 },
    createdAt,
    ...overrides,
  };
}

const rows: ImageValidationAnalyticsRow[] = [
  row({ attempt: 1 }),
  // The same attempt may have both rejected and final storage rows; count it once.
  row({ attempt: 1, createdAt: new Date(createdAt.getTime() + 1) }),
  row({ sceneIndex: 2, attempt: 1, result: { expectedCharacterCount: 2 } }),
  row({ sceneIndex: 2, attempt: 2, result: { expectedCharacterCount: 2 } }),
  row({
    subjectType: 'graphic_novel_panel',
    sceneIndex: 3,
    pageNumber: 3,
    panelIndex: 1,
    panelId: 'p3-1',
    attempt: 4,
    result: { characters: [{}, {}, {}] },
  }),
  row({
    subjectType: 'graphic_novel_panel',
    sceneIndex: 3,
    pageNumber: 3,
    panelIndex: 1,
    panelId: 'p3-1',
    attempt: 5,
    result: { characters: [{}, {}, {}] },
  }),
  row({
    subjectType: 'graphic_novel_panel',
    sceneIndex: 3,
    pageNumber: 3,
    panelIndex: 2,
    panelId: 'p3-2',
    attempt: 1,
    requestManifest: { expectedCharacters: [{}, {}, {}] },
    result: {},
  }),
  row({
    subjectType: 'graphic_novel_panel',
    sceneIndex: 3,
    pageNumber: 3,
    panelIndex: 2,
    panelId: 'p3-2',
    attempt: 2,
    requestManifest: { expectedCharacters: [{}, {}, {}] },
    result: {},
  }),
  row({
    subjectType: 'graphic_novel_panel',
    sceneIndex: 3,
    pageNumber: 3,
    panelIndex: 2,
    panelId: 'p3-2',
    attempt: 3,
    requestManifest: { expectedCharacters: [{}, {}, {}] },
    result: {},
  }),
  row({
    sceneIndex: 4,
    attempt: 1,
    requestManifest: null,
    result: {},
  }),
];

const analytics = buildImageValidationCharacterRegenerationAnalytics(rows);

assert.deepEqual(analytics.totals, {
  validationRows: 10,
  imageTargets: 4,
  excludedImageTargets: 1,
  totalGenerations: 8,
  totalRegenerations: 4,
  retriedImageTargets: 3,
  retryRate: 0.75,
  pearsonCorrelation: 0.8528,
});
assert.deepEqual(analytics.buckets, [
  {
    characterCount: 1,
    imageTargets: 1,
    totalGenerations: 1,
    totalRegenerations: 0,
    averageRegenerations: 0,
    retryRate: 0,
  },
  {
    characterCount: 2,
    imageTargets: 1,
    totalGenerations: 2,
    totalRegenerations: 1,
    averageRegenerations: 1,
    retryRate: 1,
  },
  {
    characterCount: 3,
    imageTargets: 2,
    totalGenerations: 5,
    totalRegenerations: 3,
    averageRegenerations: 1.5,
    retryRate: 1,
  },
]);
assert.deepEqual(analytics.distribution, [
  { characterCount: 1, regenerations: 0, imageTargets: 1 },
  { characterCount: 2, regenerations: 1, imageTargets: 1 },
  { characterCount: 3, regenerations: 1, imageTargets: 1 },
  { characterCount: 3, regenerations: 2, imageTargets: 1 },
]);

const repeatedComicCharacters = buildImageValidationCharacterRegenerationAnalytics([
  row({
    sceneIndex: 10,
    attempt: 1,
    result: {
      expectedCharacterCount: 6,
      characters: [
        { name: 'Dogihunt', panelId: 'p1' },
        { name: 'Tick', panelId: 'p1' },
        { name: 'Dogihunt', panelId: 'p2' },
        { name: 'Tick', panelId: 'p2' },
        { name: 'Dogihunt', panelId: 'p3' },
        { name: 'Tick', panelId: 'p3' },
      ],
    },
    requestManifest: {
      panels: [
        {
          panelId: 'p1',
          expectedCharacters: [{ name: 'Dogihunt' }, { name: 'Tick' }],
        },
        {
          panelId: 'p2',
          expectedCharacters: [{ name: 'Dogihunt' }, { name: 'Tick' }],
        },
        {
          panelId: 'p3',
          expectedCharacters: [{ name: 'Dogihunt' }, { name: 'Tick' }],
        },
      ],
    },
  }),
  row({
    sceneIndex: 11,
    attempt: 1,
    result: { expectedCharacterCount: 3 },
    requestManifest: {
      expectedCharacters: [
        { characterRef: 'character-emilia', name: 'Emilia' },
        { characterRef: 'character-emilia', name: 'Емілія' },
        { characterRef: 'character-sparky', name: 'Sparky' },
      ],
    },
  }),
]);

assert.deepEqual(repeatedComicCharacters.buckets, [
  {
    characterCount: 2,
    imageTargets: 2,
    totalGenerations: 2,
    totalRegenerations: 0,
    averageRegenerations: 0,
    retryRate: 0,
  },
]);

console.log('image validation character/regeneration analytics tests passed');
