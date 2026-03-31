import { getPolicyRepository } from '../repositories';
import { buildPolicyPromptSection, DEFAULT_LOCALE, isValidLocale, type Locale } from '@wondertales/shared';
import type { EpisodeOutline, EpisodeText, PolicyProfile } from '../ai/types';
import { logger } from '../utils/logger';

/**
 * Policy Service for Content Safety (Milestone 3)
 * Loads policy rules from database and provides validation functions
 */

/**
 * Build comprehensive policy profile for story generation
 * Loads all rules from database and constructs prompt guidelines
 */
export async function buildPolicyProfile(ageGroup: string, language: string): Promise<PolicyProfile> {
  try {
    logger.info({ ageGroup, language }, 'Building policy profile');
    const normalizedLanguage = normalizeLocale(language);
    
    const policyRepo = getPolicyRepository();

    // Fetch age engine rules
    const ageRules = await policyRepo.findAgeEngineRules(ageGroup);
    
    if (!ageRules) {
      throw new Error(`Age group ${ageGroup} not found in age_engine_rules`);
    }
    
    // Fetch all content policy rules
    const policyRulesData = await policyRepo.findContentPolicyRules();
    
    // Parse JSON fields from age rules
    const allowedConflicts = JSON.parse(ageRules.allowedConflicts) as string[];
    
    // Build comprehensive prompt guidelines using shared helper
    const promptGuidelines = buildPolicyPromptSection(policyRulesData.map(row => ({
      id: row.id,
      category: row.category,
      promptGuidance: row.promptGuidance,
      sortOrder: row.sortOrder
    }))) + `\n\nAGE-SPECIFIC (${ageGroup}): ${ageRules.additionalRules}`;
    
    const profile: PolicyProfile = {
      ageGroup,
      language: normalizedLanguage,
      allowedConflicts,
      constraints: {
        mustHaveHappyEnding: true,
        noShamingLanguage: true
      },
      readability: {
        maxSentenceLen: ageRules.maxSentenceLength,
        targetWordsRange: [ageRules.wordRangeMin, ageRules.wordRangeMax],
        dialogRatio: Number(ageRules.dialogRatio)
      },
      promptGuidelines
    };
    
    logger.info({ 
      ageGroup, 
      rulesCount: policyRulesData.length,
      wordRange: profile.readability.targetWordsRange 
    }, 'Policy profile built successfully');
    
    return profile;
  } catch (error) {
    logger.error({ error, ageGroup }, 'Failed to build policy profile');
    throw new Error(`Failed to build policy profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function normalizeLocale(language?: string | null): Locale {
  const normalized = language?.slice(0, 2).toLowerCase() || DEFAULT_LOCALE;
  return isValidLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

/**
 * Get age engine rules from database
 */
export async function getAgeEngineRules(ageGroup: string) {
  const rules = await getPolicyRepository().findAgeEngineRules(ageGroup);
    
  if (!rules) {
    throw new Error(`Age group ${ageGroup} not found`);
  }
  
  return {
    ...rules,
    allowedConflicts: JSON.parse(rules.allowedConflicts) as string[],
    wordRange: [rules.wordRangeMin, rules.wordRangeMax] as [number, number]
  };
}
