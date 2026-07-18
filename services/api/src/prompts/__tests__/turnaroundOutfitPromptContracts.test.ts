import assert from 'node:assert/strict';
import {
  buildOutfitPlatePrompt,
  buildTurnaroundPrompt,
  buildTextOnlyTurnaroundPrompt,
} from '../image';

function testReferenceTurnaroundPromptIncludesLayoutAndIdentityRules(): void {
  const prompt = buildTurnaroundPrompt({
    characterName: 'Maple Fox',
    characterDescription: 'A small fox with a red scarf and freckles.',
  });

  assert.match(prompt, /character turnaround model sheet/);
  assert.match(prompt, /"Maple Fox"/);
  assert.match(prompt, /FRONT view/);
  assert.match(prompt, /THREE-QUARTER view/);
  assert.match(prompt, /SIDE PROFILE view/);
  assert.match(prompt, /BACK view/);
  assert.match(prompt, /CLEAN WHITE background/);
  assert.match(prompt, /Preserve EXACTLY the silhouette/);
  assert.match(prompt, /CHARACTER DESCRIPTION/);
  assert.match(prompt, /red scarf and freckles/);
  assert.doesNotMatch(prompt, /mannequin/i);
}

function testReferenceTurnaroundPromptOmitsDescriptionWhenAbsent(): void {
  const prompt = buildTurnaroundPrompt({ characterName: 'Nora' });
  assert.match(prompt, /"Nora"/);
  assert.doesNotMatch(prompt, /CHARACTER DESCRIPTION/);
}

function testTextOnlyTurnaroundPromptUsesDescriptionAndStyle(): void {
  const prompt = buildTextOnlyTurnaroundPrompt({
    characterName: 'Cloud Sprite',
    characterDescription: 'A tiny glowing sprite with silver hair.',
    imageStyle: 'soft_watercolor',
  });

  assert.match(prompt, /character called "Cloud Sprite"/);
  assert.match(prompt, /CHARACTER DESCRIPTION/);
  assert.match(prompt, /tiny glowing sprite/);
  assert.match(prompt, /Art style: soft_watercolor/);
  assert.match(prompt, /Faithfully interpret every detail/);
  assert.doesNotMatch(prompt, /attached character drawing/);
}

function testOutfitPlatePromptIsWardrobeOnlyMannequin(): void {
  const prompt = buildOutfitPlatePrompt({
    outfitDescription: 'A bright yellow raincoat and matching rubber boots.',
    imageStyle: 'soft_3d',
    ageGroup: '6-8',
  });

  assert.match(prompt, /display mannequin/);
  assert.match(prompt, /bright yellow raincoat and matching rubber boots/i);
  assert.match(prompt, /soft_3d/);
  assert.match(prompt, /wardrobe reference only/i);
  assert.match(prompt, /No letters or words/i);
  assert.doesNotMatch(prompt, /turnaround/i);
  assert.doesNotMatch(prompt, /character face/i);
}

function main(): void {
  testReferenceTurnaroundPromptIncludesLayoutAndIdentityRules();
  testReferenceTurnaroundPromptOmitsDescriptionWhenAbsent();
  testTextOnlyTurnaroundPromptUsesDescriptionAndStyle();
  testOutfitPlatePromptIsWardrobeOnlyMannequin();
  console.log('turnaround and outfit plate prompt contracts passed (4 cases)');
}

main();
