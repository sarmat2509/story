import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class CharacterOutfitTurnaroundCacheRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findByCharacterAndOutfit(params: {
    characterId: string;
    outfitHash: string;
    imageStyle: string;
    ageGroup: string;
  }): Promise<schema.CharacterOutfitTurnaroundCache | null> {
    const [row] = await this.db
      .select()
      .from(schema.characterOutfitTurnaroundCache)
      .where(
        and(
          eq(schema.characterOutfitTurnaroundCache.characterId, params.characterId),
          eq(schema.characterOutfitTurnaroundCache.outfitHash, params.outfitHash),
          eq(schema.characterOutfitTurnaroundCache.imageStyle, params.imageStyle),
          eq(schema.characterOutfitTurnaroundCache.ageGroup, params.ageGroup),
        ),
      )
      .limit(1);
    return row || null;
  }

  async create(
    data: schema.NewCharacterOutfitTurnaroundCache,
  ): Promise<schema.CharacterOutfitTurnaroundCache> {
    const [row] = await this.db
      .insert(schema.characterOutfitTurnaroundCache)
      .values(data)
      .returning();
    return row;
  }
}
