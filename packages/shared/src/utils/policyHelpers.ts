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

/**
 * Filter content policy rules by minimum severity level
 * Useful for applying stricter rules to younger age groups
 */
export function filterRulesBySeverity(
  rules: ContentPolicyRule[], 
  minSeverity: 'medium' | 'high' | 'critical'
): ContentPolicyRule[] {
  const severityOrder = { medium: 1, high: 2, critical: 3 };
  const minLevel = severityOrder[minSeverity];
  return rules.filter(r => severityOrder[r.severity] >= minLevel);
}
