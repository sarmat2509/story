# Age Group Refactoring TODO (Future Milestone)

## Overview

Currently, age groups are hardcoded as strings ('1y', '2-3', '4-5', '6-8', '9-12') in 37+ places throughout the codebase. After migration 0008, we have:
- `age_groups` table with UUID primary keys
- `stories.age_group_id` and `age_engine_rules.age_group_id` as UUID references
- BUT: old string columns remain for backward compatibility

## Files with Hardcoded Age Group Strings

### High Priority (Business Logic)

1. **`services/api/src/services/storyOrchestrationService.ts`** (lines 61-65, 379)
   - `calculateAgeGroup()` function returns string instead of UUID
   - Default age group: `'4-5'`
   - **Action**: Refactor to return UUID, load from `age_groups` table

2. **`services/api/src/services/childProfileService.ts`** (lines 57-61)
   - `calculateAgeGroup()` function returns string
   - **Action**: Same as above

3. **`services/api/src/domain/story/StoryDomainService.ts`** (lines 164-188)
   - `getSceneCount()` - hardcoded mapping
   - `getVocabularyLevel()` - hardcoded mapping
   - **Action**: Load rules from `age_engine_rules` by `age_group_id`

### Medium Priority (Style/UI Logic)

4. **`services/api/src/domain/image/ImageDomainService.ts`** (lines 217-271)
   - `calculateImageDimensions()` - switch on string
   - `buildImageStyle()` - switch on string
   - **Action**: Replace with DB lookups or slug-based queries

5. **`services/api/src/prompts/image/ImagePrompts.ts`** (lines 90-140)
   - `getStylePrefix()` - string comparisons
   - **Action**: Create helper service for age-group-based prompt building (safety/negative prompts now in `contentPolicy.ts`)

### Low Priority (Already using string references)

6. **`services/api/src/routes/children.ts`** (lines 29, 79, 135)
   - Passes `ageGroup` string from `calculateAgeGroup()`
   - **Action**: Will be fixed when calculateAgeGroup() returns UUID

7. **`services/api/src/routes/dictionaries.ts`** (line 134)
   - JSON parsing of `ageGroups`
   - **Action**: Already using appropriate format

## Recommended Refactoring Strategy

### Phase 1: Helper Service (Priority: High)

Create `services/api/src/services/ageGroupService.ts`:

```typescript
import { db } from '../db';
import { ageGroups } from '../db/schema';
import { eq } from 'drizzle-orm';

export class AgeGroupService {
  private cache: Map<string, any> = new Map();
  
  /**
   * Calculate age group ID from birth date
   */
  async calculateAgeGroupId(birthDate: Date): Promise<string> {
    const ageMonths = this.calculateAgeInMonths(birthDate);
    
    // Load age groups if not cached
    if (this.cache.size === 0) {
      await this.loadAgeGroups();
    }
    
    for (const [id, group] of this.cache) {
      if (ageMonths >= group.minMonths && 
          (group.maxMonths === null || ageMonths < group.maxMonths)) {
        return id;
      }
    }
    
    throw new Error('Age group not found for age: ' + ageMonths);
  }
  
  /**
   * Get age group by slug (for backward compatibility)
   */
  async getAgeGroupBySlug(slug: string): Promise<AgeGroup | null> {
    const [group] = await db
      .select()
      .from(ageGroups)
      .where(eq(ageGroups.slug, slug))
      .limit(1);
    
    return group || null;
  }
  
  /**
   * Get all active age groups
   */
  async getAllAgeGroups(): Promise<AgeGroup[]> {
    return await db
      .select()
      .from(ageGroups)
      .where(eq(ageGroups.isActive, true))
      .orderBy(ageGroups.sortOrder);
  }
  
  private async loadAgeGroups() {
    const groups = await this.getAllAgeGroups();
    for (const group of groups) {
      this.cache.set(group.id, group);
    }
  }
  
  private calculateAgeInMonths(birthDate: Date): number {
    const now = new Date();
    const months = (now.getFullYear() - birthDate.getFullYear()) * 12 +
                   (now.getMonth() - birthDate.getMonth());
    return months;
  }
}

// Singleton instance
let instance: AgeGroupService | null = null;

export function getAgeGroupService(): AgeGroupService {
  if (!instance) {
    instance = new AgeGroupService();
  }
  return instance;
}
```

### Phase 2: Update calculateAgeGroup() functions

Replace in `storyOrchestrationService.ts` and `childProfileService.ts`:

```typescript
// OLD
function calculateAgeGroup(birthDate: Date): string {
  const ageMonths = calculateAgeInMonths(birthDate);
  if (ageMonths < 24) return '1y';
  if (ageMonths < 48) return '2-3';
  // ...
}

// NEW
async function calculateAgeGroupId(birthDate: Date): Promise<string> {
  const ageGroupService = getAgeGroupService();
  return await ageGroupService.calculateAgeGroupId(birthDate);
}
```

### Phase 3: Update Domain Services

Replace switch statements with DB queries:

```typescript
// OLD
private getSceneCount(ageGroup: string): number {
  const counts: Record<string, number> = {
    '1y': 3, '2-3': 4, '4-5': 5, '6-8': 6, '9-12': 7
  };
  return counts[ageGroup] || 4;
}

// NEW
private async getSceneCount(ageGroupId: string): Promise<number> {
  const [rules] = await db
    .select({ sceneCount: ageEngineRules.sceneCount })
    .from(ageEngineRules)
    .where(eq(ageEngineRules.ageGroupId, ageGroupId))
    .limit(1);
  
  return rules?.sceneCount || 4;
}
```

### Phase 4: Remove old string columns (Final Migration)

After all code is updated:

```sql
-- Migration 0009 (future)
ALTER TABLE stories DROP COLUMN age_group;
ALTER TABLE age_engine_rules DROP COLUMN age_group;
-- Keep age_group_id as the only reference
```

## Estimated Effort

- **Phase 1 (Helper Service)**: 2 hours
- **Phase 2 (calculateAgeGroup)**: 1 hour
- **Phase 3 (Domain Services)**: 3 hours
- **Phase 4 (Cleanup Migration)**: 30 min
- **Testing**: 2 hours

**Total**: ~8-9 hours (separate milestone)

## Why Defer This?

1. **Current MVP works**: String columns still functional
2. **No blocking issues**: Voice catalog works with UUIDs
3. **Significant refactoring**: 37+ locations, requires careful testing
4. **Safe migration**: Can be done incrementally in future release

## Notes

- Keep both columns during transition period
- Add deprecation warnings in code comments
- Monitor for any string-based queries after refactoring
- Consider caching age groups in memory for performance
