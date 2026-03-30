import type { ContentPolicyRule } from '../types/story';

/**
 * Build comprehensive policy prompt section for AI generation
 * Transforms database policy rules into formatted text for Gemini prompts
 * 
 * IMPORTANT: Uses positive framing to avoid triggering AI safety filters
 * Instead of listing forbidden content, focuses on what TO INCLUDE
 */
export function buildPolicyPromptSection(rules: ContentPolicyRule[]): string {
  return rules.map(rule => 
    `${rule.category}: ${rule.promptGuidance}`
  ).join('\n\n');
}
