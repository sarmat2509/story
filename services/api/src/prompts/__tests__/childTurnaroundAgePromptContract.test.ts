import assert from 'node:assert/strict';
import { buildTextOnlyTurnaroundPrompt, buildTurnaroundPrompt } from '../image';

function testReferenceTurnaroundIncludesCurrentAge(): void {
  const prompt = buildTurnaroundPrompt({
    characterName: 'Lina',
    characterDescription: 'A girl with a blonde bob and round red glasses.',
    currentAgeMonths: 39,
  });

  assert.match(prompt, /CURRENT AGE: 3 years and 3 months\./);
  assert.match(prompt, /server-calculated age as authoritative/);
}

function testTextOnlyTurnaroundIncludesCurrentAge(): void {
  const prompt = buildTextOnlyTurnaroundPrompt({
    characterName: 'Noa',
    characterDescription: 'A boy with copper-red curls and a yellow romper.',
    currentAgeMonths: 14,
  });

  assert.match(prompt, /CURRENT AGE: 1 year and 2 months\./);
  assert.match(prompt, /server-calculated age as authoritative/);
}

function testNonChildTurnaroundCanOmitAge(): void {
  const prompt = buildTurnaroundPrompt({
    characterName: 'Luma',
    characterDescription: 'A small turquoise dragon with gold fins.',
  });

  assert.doesNotMatch(prompt, /CURRENT AGE/);
}

testReferenceTurnaroundIncludesCurrentAge();
testTextOnlyTurnaroundIncludesCurrentAge();
testNonChildTurnaroundCanOmitAge();

console.log('child turnaround age prompt contract passed (3 cases)');
