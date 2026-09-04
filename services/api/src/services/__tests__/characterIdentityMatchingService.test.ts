import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MOCK_CHARACTER_IDENTITY_MATCH } from '../../testing/ai';
import {
  scoreIdentityValidation,
  type CharacterIdentitySignal,
  type CharacterIdentityValidation,
} from '../characterIdentityMatchingService';

function validation(overrides: Partial<CharacterIdentityValidation> = {}): CharacterIdentityValidation {
  return {
    ...MOCK_CHARACTER_IDENTITY_MATCH,
    stableFeatureMatches: [...MOCK_CHARACTER_IDENTITY_MATCH.stableFeatureMatches],
    differences: [...MOCK_CHARACTER_IDENTITY_MATCH.differences],
    ...overrides,
  };
}

function assertRejectedFor(signal: CharacterIdentitySignal, field: 'colorMatch' | 'shapeMatch' | 'recognizability') {
  const score = scoreIdentityValidation(validation({ [field]: signal }));
  assert.equal(score.accepted, false, `${field}=${signal} should reject the identity match`);
}

const strongScore = scoreIdentityValidation(validation());
assert.equal(strongScore.accepted, true, 'strong visual evidence should accept the identity match');
assert.ok(strongScore.score >= 0.8, 'accepted match should meet the combined score threshold');

const lightingVariantScore = scoreIdentityValidation(validation({ colorMatch: 'partial' }));
assert.equal(
  lightingVariantScore.accepted,
  true,
  'partial color agreement should still pass when shape and recognizability are strong'
);

assertRejectedFor('mismatch', 'colorMatch');
assertRejectedFor('mismatch', 'shapeMatch');
assertRejectedFor('mismatch', 'recognizability');

const unclearShapeScore = scoreIdentityValidation(validation({ shapeMatch: 'unclear' }));
assert.equal(unclearShapeScore.accepted, false, 'unclear shape should not be enough to reuse identity');
assert.ok(unclearShapeScore.blockingReasons.includes('shape_unclear'));

const declinedScore = scoreIdentityValidation(validation({ sameCharacter: false, confidence: 0.99 }));
assert.equal(declinedScore.accepted, false, 'vision-declined match must stay rejected');
assert.ok(declinedScore.blockingReasons.includes('vision_declined_same_character'));

const lowConfidenceScore = scoreIdentityValidation(validation({ confidence: 0.78 }));
assert.equal(lowConfidenceScore.accepted, false, 'low confidence should reject even if signals are strong');
assert.ok(lowConfidenceScore.blockingReasons.includes('confidence_below_threshold'));

const faceDeduplicationSource = readFileSync(
  path.join(__dirname, '../faceDeduplicationService.ts'),
  'utf8'
);
assert.doesNotMatch(
  faceDeduplicationSource,
  /photoUrls\.length\s*===\s*1[\s\S]{0,500}characterType:\s*'person'/,
  'single-photo instant input must go through Vision classification instead of defaulting to person'
);

const storyJobProcessorSource = readFileSync(
  path.join(__dirname, '../../jobs/storyJobProcessor.ts'),
  'utf8'
);
assert.match(
  storyJobProcessorSource,
  /getCharacterIdentityMatchingService/,
  'instant setup should invoke character identity matching before creating a character'
);
assert.match(
  storyJobProcessorSource,
  /recordInstantCharacterQuotaUsage/,
  'instant-created characters should be tracked in character usage without quota enforcement'
);
assert.match(
  storyJobProcessorSource,
  /characterIdentityDiagnostics/,
  'instant identity decisions should be persisted on the story request for later debugging'
);
assert.match(
  storyJobProcessorSource,
  /operation:\s*'character_identity_match'/,
  'instant identity decisions should emit a durable generation-stage event'
);
assert.match(
  storyJobProcessorSource,
  /Object\.assign\(intermediateData,\s*\{\s*storyId\s*\}\)/,
  'instant setup should preserve the story stub id in later checkpoint updates'
);

const identityMatchingSource = readFileSync(
  path.join(__dirname, '../characterIdentityMatchingService.ts'),
  'utf8'
);
assert.match(
  identityMatchingSource,
  /Character identity visual validation returned an empty provider response; retrying/,
  'identity validation should retry a transient empty provider response before treating a candidate as unmatched'
);

console.log('characterIdentityMatchingService tests passed');
