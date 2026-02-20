import { eq, and, inArray, sql, desc, isNotNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class AssetRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findById(id: string): Promise<schema.Asset | null> {
    const [asset] = await this.db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, id))
      .limit(1);
    return asset || null;
  }

  // Image/general assets
  async findByStoryId(storyId: string, assetType?: string): Promise<schema.Asset[]> {
    const conditions = [eq(schema.assets.storyId, storyId)];
    if (assetType) {
      conditions.push(eq(schema.assets.assetType, assetType));
    }
    return this.db
      .select()
      .from(schema.assets)
      .where(and(...conditions));
  }

  async findCompletedImagesByStoryIds(storyIds: string[]): Promise<Array<{
    id: string;
    storyId: string;
    sceneNumber: number | null;
    url: string | null;
    signedUrl: string | null;
    signedUrlExpiresAt: Date | null;
    storagePath: string;
    generationParams: unknown;
    visualPrompt: string | null;
  }>> {
    if (storyIds.length === 0) return [];
    return this.db
      .select({
        id: schema.assets.id,
        storyId: schema.assets.storyId,
        sceneNumber: schema.scenes.sceneId,
        url: schema.assets.storageUrl,
        signedUrl: schema.assets.signedUrl,
        signedUrlExpiresAt: schema.assets.signedUrlExpiresAt,
        storagePath: schema.assets.storagePath,
        generationParams: schema.assets.generationParams,
        visualPrompt: sql<string | null>`${schema.assets.generationParams}->>'visualPrompt'`,
      })
      .from(schema.assets)
      .leftJoin(schema.scenes, eq(schema.assets.sceneId, schema.scenes.id))
      .where(and(
        inArray(schema.assets.storyId, storyIds),
        eq(schema.assets.assetType, 'image'),
        eq(schema.assets.status, 'completed')
      ));
  }

  async findByStoragePath(storagePath: string): Promise<schema.Asset | null> {
    const [asset] = await this.db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.storagePath, storagePath))
      .limit(1);
    return asset || null;
  }

  async create(data: schema.NewAsset): Promise<schema.Asset> {
    const [asset] = await this.db
      .insert(schema.assets)
      .values(data)
      .returning();
    return asset;
  }

  async update(id: string, data: Partial<schema.NewAsset>): Promise<void> {
    await this.db
      .update(schema.assets)
      .set(data)
      .where(eq(schema.assets.id, id));
  }

  async deleteByStoryId(storyId: string): Promise<void> {
    await this.db
      .delete(schema.assets)
      .where(eq(schema.assets.storyId, storyId));
  }

  async deleteById(id: string): Promise<void> {
    await this.db
      .delete(schema.assets)
      .where(eq(schema.assets.id, id));
  }

  async findBySceneId(sceneId: string, assetType?: string): Promise<schema.Asset[]> {
    const conditions = [eq(schema.assets.sceneId, sceneId)];
    if (assetType) {
      conditions.push(eq(schema.assets.assetType, assetType));
    }
    return this.db
      .select()
      .from(schema.assets)
      .where(and(...conditions));
  }

  // Audio assets
  async findAudioAssetsByStoryId(storyId: string): Promise<schema.AudioAsset[]> {
    return this.db
      .select()
      .from(schema.audioAssets)
      .where(eq(schema.audioAssets.storyId, storyId));
  }

  async findCachedAudio(
    textHash: string,
    voiceId: string,
    speed: string
  ): Promise<schema.AudioAsset | null> {
    const [cached] = await this.db
      .select()
      .from(schema.audioAssets)
      .where(and(
        eq(schema.audioAssets.textHash, textHash),
        eq(schema.audioAssets.voiceId, voiceId),
        eq(schema.audioAssets.speed, speed as any),
        eq(schema.audioAssets.status, 'completed')
      ))
      .limit(1);
    return cached || null;
  }

  async createAudioAsset(data: schema.NewAudioAsset): Promise<schema.AudioAsset> {
    const [audioAsset] = await this.db
      .insert(schema.audioAssets)
      .values(data)
      .returning();
    return audioAsset;
  }

  /** Insert audio asset, silently skipping if a conflict occurs */
  async createAudioAssetIgnoreConflict(data: schema.NewAudioAsset): Promise<void> {
    await this.db
      .insert(schema.audioAssets)
      .values(data)
      .onConflictDoNothing();
  }

  async updateAudioAsset(id: string, data: Partial<schema.NewAudioAsset>): Promise<void> {
    await this.db
      .update(schema.audioAssets)
      .set(data)
      .where(eq(schema.audioAssets.id, id));
  }

  async findFinalAudioAssetWithAsset(
    audioAssetId: string
  ): Promise<{ audioAsset: schema.AudioAsset; asset: schema.Asset } | null> {
    const [result] = await this.db
      .select({
        audioAsset: schema.audioAssets,
        asset: schema.assets,
      })
      .from(schema.audioAssets)
      .innerJoin(schema.assets, eq(schema.audioAssets.assetId, schema.assets.id))
      .where(
        and(
          eq(schema.audioAssets.id, audioAssetId),
          eq(schema.audioAssets.isFinal, true)
        )
      )
      .limit(1);
    return result || null;
  }

  // Generated references
  async createGeneratedReference(data: schema.NewGeneratedReference): Promise<schema.GeneratedReference> {
    const [ref] = await this.db
      .insert(schema.generatedReferences)
      .values(data)
      .returning();
    return ref;
  }

  async findGeneratedReferencesByStoryId(storyId: string): Promise<schema.GeneratedReference[]> {
    return this.db
      .select()
      .from(schema.generatedReferences)
      .where(eq(schema.generatedReferences.storyId, storyId));
  }

  // ── Analytics queries ──

  /** Fetch recent image generation times for coefficient calculation */
  async findRecentImageGenerationTimes(limit: number): Promise<Array<{ generationTimeMs: number | null }>> {
    return this.db
      .select({
        generationTimeMs: schema.assets.generationTimeMs,
      })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.assetType, 'image'),
          isNotNull(schema.assets.generationTimeMs),
          sql`${schema.assets.generationTimeMs} > 0`
        )
      )
      .orderBy(desc(schema.assets.createdAt))
      .limit(limit);
  }
}
