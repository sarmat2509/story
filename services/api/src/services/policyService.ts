import { db } from '../db';
import { contentPolicyRules, ageEngineRules } from '../db/schema';
import { buildPolicyPromptSection } from '@kazka/shared';
import type { EpisodeOutline, EpisodeText, PolicyProfile } from '../ai/types';
import { eq } from 'drizzle-orm';
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
    
    // Fetch age engine rules
    const [ageRules] = await db
      .select()
      .from(ageEngineRules)
      .where(eq(ageEngineRules.ageGroup, ageGroup))
      .limit(1);
    
    if (!ageRules) {
      throw new Error(`Age group ${ageGroup} not found in age_engine_rules`);
    }
    
    // Fetch all content policy rules
    const policyRulesData = await db
      .select()
      .from(contentPolicyRules)
      .orderBy(contentPolicyRules.sortOrder);
    
    // Transform DB rows to PolicyProfile format
    const disallowedRules = policyRulesData.map(row => ({
      id: row.id,
      category: row.category,
      prohibitedElements: JSON.parse(row.prohibitedElements) as string[],
      examples: JSON.parse(row.examples) as { forbidden: string[]; allowed: string[] },
      severity: row.severity
    }));
    
    // Parse JSON fields from age rules
    const allowedConflicts = JSON.parse(ageRules.allowedConflicts) as string[];
    
    // Build comprehensive prompt guidelines using shared helper
    const promptGuidelines = buildPolicyPromptSection(policyRulesData.map(row => ({
      id: row.id,
      category: row.category,
      description: row.description,
      prohibitedElements: JSON.parse(row.prohibitedElements) as string[],
      examples: JSON.parse(row.examples) as { forbidden: string[]; allowed: string[] },
      promptGuidance: row.promptGuidance,
      severity: row.severity as 'critical' | 'high' | 'medium',
      sortOrder: row.sortOrder
    }))) + `\n\nAGE-SPECIFIC (${ageGroup}): ${ageRules.additionalRules}`;
    
    const profile: PolicyProfile = {
      ageGroup,
      language,
      disallowedRules,
      fearLevelMax: ageRules.fearLevel,
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
      rulesCount: disallowedRules.length,
      wordRange: profile.readability.targetWordsRange 
    }, 'Policy profile built successfully');
    
    return profile;
  } catch (error) {
    logger.error({ error, ageGroup }, 'Failed to build policy profile');
    throw new Error(`Failed to build policy profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get age engine rules from database
 */
export async function getAgeEngineRules(ageGroup: string) {
  const [rules] = await db
    .select()
    .from(ageEngineRules)
    .where(eq(ageEngineRules.ageGroup, ageGroup))
    .limit(1);
    
  if (!rules) {
    throw new Error(`Age group ${ageGroup} not found`);
  }
  
  return {
    ...rules,
    themes: JSON.parse(rules.themes) as string[],
    allowedConflicts: JSON.parse(rules.allowedConflicts) as string[],
    wordRange: [rules.wordRangeMin, rules.wordRangeMax] as [number, number]
  };
}
