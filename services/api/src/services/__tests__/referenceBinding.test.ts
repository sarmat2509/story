import assert from 'node:assert/strict';
import {
  buildReferenceBindingRegistry,
  formatReferenceBindingInstruction,
  referenceBindingIdFor,
  referenceBindingLabel,
} from '../referenceBinding';

function testBindingIdDoesNotDependOnImageIndex(): void {
  const baseRef = {
    characterName: 'Емілія',
    referenceKind: 'character' as const,
    source: 'character_reference',
    type: 'character_reference',
    storagePath: 'photos/child_turnaround/emilia.jpg',
  };

  const first = referenceBindingIdFor({ ...baseRef, imageIndex: 1 });
  const second = referenceBindingIdFor({ ...baseRef, imageIndex: 5 });

  assert.equal(first, second);
  assert.equal(referenceBindingLabel({ ...baseRef, imageIndex: 1 }), first);
  assert.equal(referenceBindingLabel({ ...baseRef, imageIndex: 5 }), first);
}

function testBindingIdUsesStoragePathForUniqueness(): void {
  const first = referenceBindingIdFor({
    characterName: 'Емілія',
    referenceKind: 'character',
    source: 'character_reference',
    type: 'character_reference',
    storagePath: 'photos/child_turnaround/emilia-a.jpg',
  });
  const second = referenceBindingIdFor({
    characterName: 'Емілія',
    referenceKind: 'character',
    source: 'character_reference',
    type: 'character_reference',
    storagePath: 'photos/child_turnaround/emilia-b.jpg',
  });

  assert.notEqual(first, second);
}

function testPromptReferenceInstructionsUseRefOnly(): void {
  const ref = {
    characterName: 'Емілія',
    referenceKind: 'character' as const,
    source: 'character_reference',
    type: 'character_reference',
    storagePath: 'photos/child_turnaround/emilia.jpg',
    imageIndex: 5,
  };
  const id = referenceBindingIdFor(ref);
  const instruction = formatReferenceBindingInstruction(ref, 5);
  const registry = buildReferenceBindingRegistry([ref]);

  assert.match(instruction, new RegExp(`^${id}: character identity reference\\.`));
  assert.doesNotMatch(instruction, /Image 5/);
  assert.doesNotMatch(instruction, /Емілія/);
  assert.doesNotMatch(instruction, /for "/);
  assert.match(registry, new RegExp(`${id} = character identity reference\\.`));
  assert.doesNotMatch(registry, /Image 5/);
  assert.doesNotMatch(registry, /Емілія/);
}

function main(): void {
  testBindingIdDoesNotDependOnImageIndex();
  testBindingIdUsesStoragePathForUniqueness();
  testPromptReferenceInstructionsUseRefOnly();
  console.log('referenceBinding tests passed');
}

main();
