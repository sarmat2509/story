import assert from 'node:assert/strict';
import {
  buildPlaceholderReferenceNameMap,
  isPlaceholderReferenceName,
} from '../referenceImageBuckets';

function testPlaceholderReferenceNameDetection() {
  assert.equal(isPlaceholderReferenceName('unknown'), true);
  assert.equal(isPlaceholderReferenceName('Unnamed'), true);
  assert.equal(isPlaceholderReferenceName('Old Researcher'), false);
}

function testSinglePlaceholderResolvesToSingleUnmatchedSceneCharacter() {
  const result = buildPlaceholderReferenceNameMap(
    ['Емілія', 'Кролик', 'unknown'],
    ['Емілія', 'Кролик', 'Old Researcher (Traveler)'],
  );

  assert.equal(result.get('unknown'), 'Old Researcher (Traveler)');
}

function testPlaceholderDoesNotResolveWhenAmbiguous() {
  const result = buildPlaceholderReferenceNameMap(
    ['Емілія', 'unknown'],
    ['Емілія', 'Traveler', 'Merchant'],
  );

  assert.equal(result.size, 0);
}

testPlaceholderReferenceNameDetection();
testSinglePlaceholderResolvesToSingleUnmatchedSceneCharacter();
testPlaceholderDoesNotResolveWhenAmbiguous();

console.log('referenceImageBuckets tests passed');
