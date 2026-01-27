/**
 * Prompt Helper Functions
 * Reusable utilities for building prompts
 * 
 * These are pure functions that format story parameters, child profiles,
 * safety policies, etc. They are used by all prompt builders.
 */

import type { StorySpec, PolicyProfile } from '../ai/types';
import { getLanguageFullDisplay } from '@kazka/shared';

/**
 * Get full language display name from code
 * @param code - Language code (uk, ru, en, es, de, fr)
 * @returns Full language name (e.g., "Ukrainian (Українська)")
 */
export function getLanguageName(code: string): string {
  return getLanguageFullDisplay(code as any);
}

/**
 * Format child profile section for prompts
 * @param spec - Story specification
 * @returns Formatted child profile text
 */
export function formatChildProfile(spec: StorySpec): string {
  const parts = [
    `- Name: ${spec.childName}`,
    `- Age group: ${spec.ageGroup}`,
    `- Interests: ${spec.characters.map(c => c.name).join(', ') || 'none specified'}`
  ];

  if (spec.userNotes) {
    parts.push(`- Parent notes: ${spec.userNotes}`);
  }

  return parts.join('\n');
}

/**
 * Format story requirements section for prompts
 * @param params - Story parameters
 * @returns Formatted requirements text
 */
export function formatStoryRequirements(params: {
  spec: StorySpec;
  sceneCount?: number;
  targetWordCount?: [number, number];
}): string {
  const parts = [
    `- Goal/Moral: ${params.spec.goal || 'general positive message'}`,
    `- Tone: ${params.spec.tone || 'calm'}`
  ];

  if (params.sceneCount) {
    parts.push(`- Number of scenes: ${params.sceneCount}`);
  }

  if (params.targetWordCount) {
    parts.push(`- Target word count: ${params.targetWordCount[0]}-${params.targetWordCount[1]} words`);
  } else if (params.spec.policyProfile?.readability?.targetWordsRange) {
    const range = params.spec.policyProfile.readability.targetWordsRange;
    parts.push(`- Target word count: ${range[0]}-${range[1]} words`);
  }

  return parts.join('\n');
}

/**
 * Format content safety policy section for prompts
 * @param policy - Policy profile
 * @returns Formatted safety policy text
 */
export function formatSafetyPolicy(policy: PolicyProfile): string {
  const sections = [
    'CONTENT SAFETY POLICY - STRICTLY FOLLOW:',
    policy.promptGuidelines,
    '',
    'POSITIVE REQUIREMENTS:',
    '- MUST have happy, safe ending',
    '- Show problem-solving through: communication, kindness, asking for help',
    '- Include emotional validation (feelings are real and OK)',
    '- Characters learn and grow from experiences',
    '- Family/friends provide support when needed'
  ];

  return sections.join('\n');
}

/**
 * Format writing style guidelines for text generation
 * @param spec - Story specification
 * @param vocabLevel - Vocabulary level (simple, basic, intermediate, advanced)
 * @returns Formatted writing style text
 */
export function formatWritingStyle(spec: StorySpec, vocabLevel: string): string {
  const sections = [
    'WRITING STYLE:',
    `- Use ${vocabLevel} vocabulary appropriate for age ${spec.ageGroup}`,
    '- Include sensory details (sounds, colors, feelings)',
    '- Show don\'t tell emotions',
    '- Use rhythm and repetition for younger ages',
    '- Include dialog for character connection',
    '- Build to satisfying, safe conclusion'
  ];

  return sections.join('\n');
}

/**
 * Format readability requirements for text generation
 * @param policy - Policy profile
 * @returns Formatted readability requirements
 */
export function formatReadabilityRequirements(policy: PolicyProfile): string {
  if (!policy.readability) {
    return '';
  }

  const parts = [
    'READABILITY REQUIREMENTS:',
    `- Max sentence length: ${policy.readability.maxSentenceLen} words`,
    `- Dialog ratio: ~${policy.readability.dialogRatio * 100}% of text`,
    `- Target word count: ${policy.readability.targetWordsRange[0]}-${policy.readability.targetWordsRange[1]} words`
  ];

  return parts.join('\n');
}

/**
 * Template literal helper for clean multiline prompts
 * Removes leading/trailing whitespace and normalizes line breaks
 * @param strings - Template strings
 * @param values - Template values
 * @returns Clean prompt string
 */
export function cleanTemplate(strings: TemplateStringsArray, ...values: any[]): string {
  let result = '';
  
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += values[i];
    }
  }

  // Trim leading/trailing whitespace from each line
  // Remove empty lines at start/end
  const lines = result.split('\n');
  const trimmedLines = lines.map(line => line.trimEnd());
  
  // Remove leading empty lines
  while (trimmedLines.length > 0 && trimmedLines[0] === '') {
    trimmedLines.shift();
  }
  
  // Remove trailing empty lines
  while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1] === '') {
    trimmedLines.pop();
  }

  return trimmedLines.join('\n');
}
