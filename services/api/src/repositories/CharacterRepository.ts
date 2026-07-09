import { and, count, eq, inArray, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface CharacterScopeOptions {
  childProfileId?: string;
  accessibleByChildProfileId?: string;
}

export class CharacterRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async transaction<T>(fn: (tx: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async findByUserId(userId: string, type?: string, options: CharacterScopeOptions = {}): Promise<schema.Character[]> {
    const conditions = [
      eq(schema.characters.userId, userId),
      eq(schema.characters.isActive, true),
    ];
    if (options.childProfileId) {
      conditions.push(eq(schema.characters.childProfileId, options.childProfileId));
    }
    if (options.accessibleByChildProfileId) {
      const accessibleCondition = or(
        eq(schema.characters.createdByMode, 'parent'),
        eq(schema.characters.createdByChildProfileId, options.accessibleByChildProfileId)
      );
      if (accessibleCondition) conditions.push(accessibleCondition);
    }
    if (type) {
      conditions.push(eq(schema.characters.type, type));
    }
    return this.db
      .select()
      .from(schema.characters)
      .where(and(...conditions));
  }

  async findAllByUserId(userId: string): Promise<schema.Character[]> {
    return this.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.userId, userId));
  }

  async findAll(): Promise<schema.Character[]> {
    return this.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.isActive, true));
  }

  async findById(id: string, userId: string, options: CharacterScopeOptions = {}): Promise<schema.Character | null> {
    const conditions = [
      eq(schema.characters.id, id),
      eq(schema.characters.userId, userId),
      eq(schema.characters.isActive, true),
    ];
    if (options.childProfileId) {
      conditions.push(eq(schema.characters.childProfileId, options.childProfileId));
    }
    if (options.accessibleByChildProfileId) {
      const accessibleCondition = or(
        eq(schema.characters.createdByMode, 'parent'),
        eq(schema.characters.createdByChildProfileId, options.accessibleByChildProfileId)
      );
      if (accessibleCondition) conditions.push(accessibleCondition);
    }
    const [character] = await this.db
      .select()
      .from(schema.characters)
      .where(and(...conditions))
      .limit(1);
    return character || null;
  }

  async findByChildProfileId(
    userId: string,
    childProfileId: string,
    options: { includeInactive?: boolean } = {}
  ): Promise<schema.Character | null> {
    const conditions = [
      eq(schema.characters.userId, userId),
      eq(schema.characters.childProfileId, childProfileId),
      eq(schema.characters.type, 'person'),
      eq(schema.characters.subtype, 'child'),
    ];
    if (!options.includeInactive) {
      conditions.push(eq(schema.characters.isActive, true));
    }
    const [character] = await this.db
      .select()
      .from(schema.characters)
      .where(and(...conditions))
      .limit(1);
    return character || null;
  }

  async findByIds(userId: string, ids: string[], options: CharacterScopeOptions = {}): Promise<schema.Character[]> {
    if (ids.length === 0) return [];
    const conditions = [
      eq(schema.characters.userId, userId),
      eq(schema.characters.isActive, true),
      inArray(schema.characters.id, ids),
    ];
    if (options.childProfileId) {
      conditions.push(eq(schema.characters.childProfileId, options.childProfileId));
    }
    if (options.accessibleByChildProfileId) {
      const accessibleCondition = or(
        eq(schema.characters.createdByMode, 'parent'),
        eq(schema.characters.createdByChildProfileId, options.accessibleByChildProfileId)
      );
      if (accessibleCondition) conditions.push(accessibleCondition);
    }
    return this.db
      .select()
      .from(schema.characters)
      .where(and(...conditions));
  }

  async create(data: schema.NewCharacter): Promise<schema.Character> {
    const [character] = await this.db
      .insert(schema.characters)
      .values(data)
      .returning();
    return character;
  }

  async update(
    id: string,
    userId: string,
    data: Partial<Omit<schema.NewCharacter, 'userId'>>
  ): Promise<schema.Character> {
    const [updated] = await this.db
      .update(schema.characters)
      .set(data)
      .where(and(
        eq(schema.characters.id, id),
        eq(schema.characters.userId, userId)
      ))
      .returning();
    return updated;
  }

  async softDelete(id: string, userId: string): Promise<void> {
    await this.db
      .update(schema.characters)
      .set({ isActive: false })
      .where(and(
        eq(schema.characters.id, id),
        eq(schema.characters.userId, userId)
      ));
  }

  async hardDelete(id: string, userId: string): Promise<void> {
    await this.db
      .delete(schema.characters)
      .where(and(
        eq(schema.characters.id, id),
        eq(schema.characters.userId, userId)
      ));
  }

  async updateAnalysis(
    id: string,
    data: Partial<schema.NewCharacter> & {
      aiGeneratedDescription?: string;
      clothing?: unknown;
      distinctiveFeatures?: unknown;
      appearanceTraits?: unknown;
    }
  ): Promise<void> {
    await this.db
      .update(schema.characters)
      .set(data as any)
      .where(eq(schema.characters.id, id));
  }

  async updateTurnaroundSheet(
    characterId: string,
    turnaroundSheet: {
      url: string;
      frontUrl?: string;
      frontThumbnailUrl?: string;
      generatedAt: string;
      sourcePhotoUrl: string;
    },
  ): Promise<void> {
    await this.db
      .update(schema.characters)
      .set({ turnaroundSheet } as any)
      .where(eq(schema.characters.id, characterId));
  }

  async updateDescriptionEn(
    characterId: string,
    descriptionEn: string,
  ): Promise<void> {
    await this.db
      .update(schema.characters)
      .set({ descriptionEn } as any)
      .where(eq(schema.characters.id, characterId));
  }

  async updateDescriptionEnByChildProfileId(
    childProfileId: string,
    descriptionEn: string,
  ): Promise<void> {
    await this.db
      .update(schema.characters)
      .set({ descriptionEn } as any)
      .where(and(
        eq(schema.characters.childProfileId, childProfileId),
        eq(schema.characters.type, 'person'),
        eq(schema.characters.subtype, 'child')
      ));
  }

  async updateTurnaroundSheetByChildProfileId(
    childProfileId: string,
    turnaroundSheet: {
      url: string;
      frontUrl?: string;
      frontThumbnailUrl?: string;
      generatedAt: string;
      sourcePhotoUrl: string;
    },
  ): Promise<void> {
    await this.db
      .update(schema.characters)
      .set({ turnaroundSheet } as any)
      .where(and(
        eq(schema.characters.childProfileId, childProfileId),
        eq(schema.characters.type, 'person'),
        eq(schema.characters.subtype, 'child')
      ));
  }

  async findHiddenByUser(userId: string): Promise<schema.Character[]> {
    return this.db
      .select()
      .from(schema.characters)
      .where(and(
        eq(schema.characters.userId, userId),
        eq(schema.characters.isHidden, true),
        eq(schema.characters.isActive, true),
      ));
  }

  /**
   * Count how many stories use this character via storyCharacters junction table
   */
  async countStoriesUsingCharacter(characterId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.storyCharacters)
      .where(eq(schema.storyCharacters.characterId, characterId));
    
    return Number(result[0]?.count) || 0;
  }

  async countStoryRequestsUsingCharacter(characterId: string, userId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.storyRequests)
      .where(and(
        eq(schema.storyRequests.userId, userId),
        sql`${schema.storyRequests.selectedCharacters} @> ${JSON.stringify([characterId])}::jsonb`,
      ));

    return Number(result[0]?.count) || 0;
  }
}
