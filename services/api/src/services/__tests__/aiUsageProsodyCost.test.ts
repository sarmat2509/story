import assert from 'node:assert';
import {
  estimateStoredUsageCostUsd,
  estimateUsageCostUsd,
  USAGE_OP_GRAPHIC_NOVEL_PAGE_EDIT,
  USAGE_OP_GRAPHIC_NOVEL_PANEL_ART_GENERATE,
  USAGE_OP_GRAPHIC_NOVEL_PANEL_CROP_VALIDATION_EDIT,
  USAGE_OP_GRAPHIC_NOVEL_PANEL_CROP_VALIDATION_REGENERATE,
  USAGE_OP_GRAPHIC_NOVEL_PANEL_MANUAL_EDIT,
  USAGE_OP_GRAPHIC_NOVEL_TEMPLATE_PANEL_GENERATE,
  USAGE_OP_GRAPHIC_NOVEL_TEMPLATE_PANEL_REGENERATE,
  USAGE_OP_IMAGE_ENVIRONMENT,
  USAGE_OP_TTS_PROSODY_TAGS,
} from '../aiUsageService';

function testProsodyTagsPricedLikeTextGemini() {
  const cost = estimateUsageCostUsd({
    provider: 'gemini',
    operation: USAGE_OP_TTS_PROSODY_TAGS,
    model: 'gemini-3-flash-preview',
    inputUnits: 1_000_000,
    outputUnits: 100_000,
  });
  assert.ok(cost != null && cost > 0, `expected positive cost, got ${cost}`);
  // 0.5 + 0.3 = 0.8 USD at list config for this snapshot
  assert.ok(Math.abs(cost! - 0.8) < 0.001, String(cost));
}

function testProsodyTagsUnknownModelFallsBackLikeText() {
  const cost = estimateUsageCostUsd({
    provider: 'gemini',
    operation: USAGE_OP_TTS_PROSODY_TAGS,
    model: 'gemini-3-flash-preview-typo',
    inputUnits: 0,
    outputUnits: 0,
  });
  assert.strictEqual(cost, 0);
}

function testHistoricalUnpricedOperationsArePriced() {
  const cases = [
    {
      provider: 'gemini',
      operation: 'validateScene',
      model: 'gemini-2.5-flash',
      inputUnits: 25_541,
      outputUnits: 39_814,
    },
    {
      provider: 'gemini',
      operation: 'regenerateScene',
      model: 'gemini-2.5-flash',
      inputUnits: 11_272,
      outputUnits: 48_285,
    },
    {
      provider: 'gemini',
      operation: 'director',
      model: 'gemini-2.5-flash',
      inputUnits: 78_344,
      outputUnits: 55_980,
    },
    {
      provider: 'gemini',
      operation: 'graphic_novel_script',
      model: 'gemini-3-flash-preview',
      inputUnits: 25_460,
      outputUnits: 134_077,
    },
    {
      provider: 'gemini',
      operation: 'graphic_novel_bubble_vision',
      model: 'gemini-3.1-flash-lite',
      inputUnits: 3_921,
      outputUnits: 3_050,
    },
    {
      provider: 'gemini',
      operation: 'graphic_novel_bubble_vision_panel_crop',
      model: 'gemini-3.1-flash-lite',
      inputUnits: 25_304,
      outputUnits: 8_869,
    },
    {
      provider: 'gemini',
      operation: 'graphic_novel_bubble_vision_panel_image',
      model: 'gemini-3.1-flash-lite',
      inputUnits: 3_502,
      outputUnits: 226,
    },
    {
      provider: 'gemini',
      operation: 'graphic_novel_page_repair',
      model: 'gemini-3-flash-preview',
      inputUnits: 4_836,
      outputUnits: 1_447,
    },
    {
      provider: 'openai',
      operation: 'mixed_story_script',
      model: 'gpt-5.2',
      inputUnits: 15_000,
      outputUnits: 5_000,
    },
    {
      provider: 'gemini',
      operation: 'mixed_story_script_retry',
      model: 'gemini-3-flash-preview',
      inputUnits: 15_000,
      outputUnits: 5_000,
    },
    {
      provider: 'gemini',
      operation: USAGE_OP_GRAPHIC_NOVEL_PAGE_EDIT,
      model: 'gemini-3.1-flash-image',
      inputUnits: 83_335,
      outputUnits: 0,
      metadata: { imageTokens: 1120, thoughtTokens: 0 },
    },
    {
      provider: 'gemini',
      operation: USAGE_OP_GRAPHIC_NOVEL_PANEL_ART_GENERATE,
      model: 'gemini-3.1-flash-image',
      inputUnits: 21_630,
      outputUnits: 0,
      metadata: { imageTokens: 1120 },
    },
    {
      provider: 'gemini',
      operation: USAGE_OP_GRAPHIC_NOVEL_TEMPLATE_PANEL_GENERATE,
      model: 'gemini-3.1-flash-lite-image',
      inputUnits: 4_000,
      outputUnits: 0,
      metadata: { imageTokens: 1120, thoughtTokens: 0 },
    },
    {
      provider: 'gemini',
      operation: USAGE_OP_GRAPHIC_NOVEL_TEMPLATE_PANEL_REGENERATE,
      model: 'gemini-3.1-flash-lite-image',
      inputUnits: 4_000,
      outputUnits: 0,
      metadata: { imageTokens: 1120, thoughtTokens: 0 },
    },
    {
      provider: 'gemini',
      operation: USAGE_OP_GRAPHIC_NOVEL_PANEL_CROP_VALIDATION_REGENERATE,
      model: 'gemini-3.1-flash-image',
      inputUnits: 2_000,
      outputUnits: 0,
      metadata: { imageTokens: 1120, thoughtTokens: 0 },
    },
    {
      provider: 'gemini',
      operation: USAGE_OP_GRAPHIC_NOVEL_PANEL_CROP_VALIDATION_EDIT,
      model: 'gemini-3.1-flash-lite-image',
      inputUnits: 4_000,
      outputUnits: 0,
      metadata: { imageTokens: 1120, thoughtTokens: 0 },
    },
    {
      provider: 'gemini',
      operation: USAGE_OP_GRAPHIC_NOVEL_PANEL_MANUAL_EDIT,
      model: 'gemini-3.1-flash-image',
      inputUnits: 1_000,
      outputUnits: 0,
      metadata: { imageTokens: 1120, thoughtTokens: 0 },
    },
    {
      provider: 'gemini',
      operation: 'graphic_novel_panel_manual_regenerate_cleanup_edit',
      model: 'gemini-3.1-flash-image',
      inputUnits: 1_000,
      outputUnits: 0,
      metadata: { imageTokens: 1120, thoughtTokens: 0 },
    },
    {
      provider: 'gemini',
      operation: 'map_tile_brief',
      model: 'gemini-3.1-flash-lite',
      inputUnits: 1_000,
      outputUnits: 1_000,
    },
    {
      provider: 'gemini',
      operation: 'image_validation_problem_recheck',
      model: 'gemini-3.1-flash-lite',
      inputUnits: 1_000,
      outputUnits: 1_000,
    },
    {
      provider: 'google-tts',
      operation: 'audio_synthesize',
      model: 'gemini-3.1-flash-tts-preview',
      inputUnits: 1_000,
      outputUnits: 2_500,
      metadata: { durationSeconds: 100 },
    },
  ];

  for (const sample of cases) {
    const cost = estimateStoredUsageCostUsd(sample);
    assert.ok(
      cost != null && cost > 0,
      `expected positive cost for ${sample.operation}, got ${cost}`
    );
  }
}

function testStoredUsageUsesEffectiveUnitsAndImageMetadata() {
  const cost = estimateStoredUsageCostUsd({
    provider: 'gemini',
    operation: USAGE_OP_GRAPHIC_NOVEL_PAGE_EDIT,
    model: 'gemini-3.1-flash-image',
    inputUnits: 1_000_000,
    outputUnits: 0,
    metadata: {
      effectiveInputUnits: 500_000,
      imageTokens: 2_000,
      thoughtTokens: 1_000,
    },
  });

  assert.ok(cost != null, 'expected stored image usage cost');
  // 0.25 input + 0.12 image + 0.003 thinking for gemini-3.1-flash-image.
  assert.ok(Math.abs(cost! - 0.373) < 0.0001, String(cost));
}

function testEnvironmentImageUsesFlashLiteImagePricing() {
  const cost = estimateStoredUsageCostUsd({
    provider: 'gemini',
    operation: USAGE_OP_IMAGE_ENVIRONMENT,
    model: 'gemini-3.1-flash-lite-image',
    inputUnits: 1_000,
    outputUnits: 0,
    metadata: { imageTokens: 1120, thoughtTokens: 0 },
  });

  assert.ok(cost != null, 'expected environment image usage cost');
  // 0.00025 input + 0.0336 image output.
  assert.ok(Math.abs(cost! - 0.03385) < 0.00001, String(cost));
}

function testSeedreamFlatPerOutputImagePricing() {
  for (const model of ['seedream-5-0-lite-260128', 'seedream-5-0-260128']) {
    for (const operation of ['image_generate', 'image_edit', 'image_character_reference']) {
      const cost = estimateUsageCostUsd({
        provider: 'seedream',
        operation,
        model,
        inputUnits: 1,
        outputUnits: 14_400,
        imageTokens: 1,
      });
      assert.ok(cost != null && Math.abs(cost - 0.035) < 1e-10, `${model}: ${cost}`);
    }
  }

  const batchCost = estimateStoredUsageCostUsd({
    provider: 'seedream',
    operation: 'image_generate',
    model: 'seedream-5-0-lite-260128',
    inputUnits: 1,
    outputUnits: 14_400,
    metadata: { imageTokens: 3 },
  });
  assert.ok(batchCost != null && Math.abs(batchCost - 0.105) < 1e-10, String(batchCost));

  assert.strictEqual(
    estimateUsageCostUsd({
      provider: 'seedream',
      operation: 'image_generate',
      model: 'unpriced-seedream-model',
      inputUnits: 1,
      imageTokens: 1,
    }),
    null,
    'Unknown Seedream models must not silently use the generic $0.04 fallback'
  );
}

void (async () => {
  testProsodyTagsPricedLikeTextGemini();
  testProsodyTagsUnknownModelFallsBackLikeText();
  testHistoricalUnpricedOperationsArePriced();
  testStoredUsageUsesEffectiveUnitsAndImageMetadata();
  testEnvironmentImageUsesFlashLiteImagePricing();
  testSeedreamFlatPerOutputImagePricing();
  console.log('aiUsageProsodyCost tests OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
