import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface MapTileCollectionOwner {
  userId: string;
  childProfileId?: string | null;
}

export interface CollectedMapTileDetails {
  collection: schema.CollectedMapTile;
  asset: schema.Asset;
  story: {
    id: string;
    title: string;
    language: string;
    coverAssetId: string | null;
    createdAt: Date;
  };
}

export interface CollectedMapTilePlacement {
  id: string;
  location: 'board' | 'inventory';
  boardX?: number | null;
  boardY?: number | null;
  inventoryOrder?: number | null;
}

function ownerConditions(owner: MapTileCollectionOwner) {
  return [
    eq(schema.collectedMapTiles.userId, owner.userId),
    owner.childProfileId
      ? eq(schema.collectedMapTiles.childProfileId, owner.childProfileId)
      : isNull(schema.collectedMapTiles.childProfileId),
  ];
}

export class CollectedMapTileRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findByIdForOwner(
    id: string,
    owner: MapTileCollectionOwner
  ): Promise<CollectedMapTileDetails | null> {
    const [row] = await this.db
      .select({
        collection: schema.collectedMapTiles,
        asset: schema.assets,
        story: {
          id: schema.stories.id,
          title: schema.stories.title,
          language: schema.stories.language,
          coverAssetId: schema.stories.coverAssetId,
          createdAt: schema.stories.createdAt,
        },
      })
      .from(schema.collectedMapTiles)
      .innerJoin(schema.assets, eq(schema.collectedMapTiles.assetId, schema.assets.id))
      .innerJoin(schema.stories, eq(schema.collectedMapTiles.storyId, schema.stories.id))
      .where(and(...ownerConditions(owner), eq(schema.collectedMapTiles.id, id)))
      .limit(1);

    return row || null;
  }

  async findForOwnerStory(
    owner: MapTileCollectionOwner,
    storyId: string
  ): Promise<CollectedMapTileDetails | null> {
    const [row] = await this.db
      .select({
        collection: schema.collectedMapTiles,
        asset: schema.assets,
        story: {
          id: schema.stories.id,
          title: schema.stories.title,
          language: schema.stories.language,
          coverAssetId: schema.stories.coverAssetId,
          createdAt: schema.stories.createdAt,
        },
      })
      .from(schema.collectedMapTiles)
      .innerJoin(schema.assets, eq(schema.collectedMapTiles.assetId, schema.assets.id))
      .innerJoin(schema.stories, eq(schema.collectedMapTiles.storyId, schema.stories.id))
      .where(and(...ownerConditions(owner), eq(schema.collectedMapTiles.storyId, storyId)))
      .limit(1);

    return row || null;
  }

  async listByStoryId(storyId: string): Promise<CollectedMapTileDetails[]> {
    return this.db
      .select({
        collection: schema.collectedMapTiles,
        asset: schema.assets,
        story: {
          id: schema.stories.id,
          title: schema.stories.title,
          language: schema.stories.language,
          coverAssetId: schema.stories.coverAssetId,
          createdAt: schema.stories.createdAt,
        },
      })
      .from(schema.collectedMapTiles)
      .innerJoin(schema.assets, eq(schema.collectedMapTiles.assetId, schema.assets.id))
      .innerJoin(schema.stories, eq(schema.collectedMapTiles.storyId, schema.stories.id))
      .where(eq(schema.collectedMapTiles.storyId, storyId))
      .orderBy(desc(schema.collectedMapTiles.acquiredAt));
  }

  async replaceStoryAssetReference(params: {
    storyId: string;
    assetId: string;
    maskId: string;
    connectors: Record<string, string>;
  }): Promise<number> {
    const rows = await this.db
      .update(schema.collectedMapTiles)
      .set({
        assetId: params.assetId,
        maskId: params.maskId,
        connectors: params.connectors,
        updatedAt: new Date(),
      })
      .where(eq(schema.collectedMapTiles.storyId, params.storyId))
      .returning({ id: schema.collectedMapTiles.id });

    return rows.length;
  }

  async listForOwner(owner: MapTileCollectionOwner): Promise<CollectedMapTileDetails[]> {
    return this.db
      .select({
        collection: schema.collectedMapTiles,
        asset: schema.assets,
        story: {
          id: schema.stories.id,
          title: schema.stories.title,
          language: schema.stories.language,
          coverAssetId: schema.stories.coverAssetId,
          createdAt: schema.stories.createdAt,
        },
      })
      .from(schema.collectedMapTiles)
      .innerJoin(schema.assets, eq(schema.collectedMapTiles.assetId, schema.assets.id))
      .innerJoin(schema.stories, eq(schema.collectedMapTiles.storyId, schema.stories.id))
      .where(and(...ownerConditions(owner)))
      .orderBy(
        asc(schema.collectedMapTiles.location),
        asc(schema.collectedMapTiles.inventoryOrder),
        desc(schema.collectedMapTiles.acquiredAt)
      );
  }

  async nextInventoryOrder(owner: MapTileCollectionOwner): Promise<number> {
    const [row] = await this.db
      .select({
        maxOrder: sql<number | null>`max(${schema.collectedMapTiles.inventoryOrder})`,
      })
      .from(schema.collectedMapTiles)
      .where(and(...ownerConditions(owner), eq(schema.collectedMapTiles.location, 'inventory')));

    const rawMaxOrder = row?.maxOrder;
    const maxOrder =
      rawMaxOrder === null || rawMaxOrder === undefined
        ? -1
        : typeof rawMaxOrder === 'number'
          ? rawMaxOrder
          : Number.isFinite(Number(rawMaxOrder))
            ? Number(rawMaxOrder)
            : -1;
    return maxOrder + 1;
  }

  async create(data: schema.NewCollectedMapTile): Promise<CollectedMapTileDetails> {
    const [collection] = await this.db.insert(schema.collectedMapTiles).values(data).returning();
    const details = await this.findByIdForOwner(collection.id, {
      userId: collection.userId,
      childProfileId: collection.childProfileId,
    });
    if (!details) {
      throw new Error('Collected map tile was inserted but could not be loaded');
    }
    return details;
  }

  async updatePlacementsForOwner(
    owner: MapTileCollectionOwner,
    placements: CollectedMapTilePlacement[]
  ): Promise<CollectedMapTileDetails[]> {
    await this.db.transaction(async (tx) => {
      for (const placement of placements) {
        await tx
          .update(schema.collectedMapTiles)
          .set({
            location: placement.location,
            boardX: placement.location === 'board' ? placement.boardX ?? 0 : null,
            boardY: placement.location === 'board' ? placement.boardY ?? 0 : null,
            inventoryOrder:
              placement.location === 'inventory' ? placement.inventoryOrder ?? 0 : 0,
            updatedAt: new Date(),
          })
          .where(and(...ownerConditions(owner), eq(schema.collectedMapTiles.id, placement.id)));
      }
    });

    return this.listForOwner(owner);
  }
}
