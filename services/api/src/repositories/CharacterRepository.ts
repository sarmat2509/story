import { eq, and, inArray, count } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class CharacterRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findByUserId(userId: string, type?: string): Promise<schema.Character[]> {
    const conditions = [
      eq(schema.characters.userId, userId),
      eq(schema.characters.isActive, true),
    ];
    if (type) {
      conditions.push(eq(schema.characters.type, type));
    }
    return this.db
      .select()
      .from(schema.characters)
      .where(and(...conditions));
  }

  async findById(id: string, userId: string): Promise<schema.Character | null> {
    const [character] = await this.db
      .select()
      .from(schema.characters)
      .where(and(
        eq(schema.characters.id, id),
        eq(schema.characters.userId, userId),
        eq(schema.characters.isActive, true)
      ))
      .limit(1);
    return character || null;
  }

  async findByIds(userId: string, ids: string[]): Promise<schema.Character[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(schema.characters)
      .where(and(
        eq(schema.characters.userId, userId),
        eq(schema.characters.isActive, true),
        inArray(schema.characters.id, ids)
      ));
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

  async updateAnalysis(
    id: string,
    data: {
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
    turnaroundSheet: { url: string; frontUrl?: string; generatedAt: string; sourcePhotoUrl: string },
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
}
