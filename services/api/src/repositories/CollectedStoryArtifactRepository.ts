import { and, desc, eq, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface CollectedStoryArtifactDetails {
  collection: schema.CollectedStoryArtifact;
  artifact: schema.StoryArtifact;
  story: {
    id: string;
    title: string;
    language: string;
    createdAt: Date;
  };
}

export interface ArtifactCollectionOwner {
  userId: string;
  childProfileId?: string | null;
}

function ownerConditions(owner: ArtifactCollectionOwner) {
  return [
    eq(schema.collectedStoryArtifacts.userId, owner.userId),
    owner.childProfileId
      ? eq(schema.collectedStoryArtifacts.childProfileId, owner.childProfileId)
      : isNull(schema.collectedStoryArtifacts.childProfileId),
  ];
}

export class CollectedStoryArtifactRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findByIdWithDetails(id: string): Promise<CollectedStoryArtifactDetails | null> {
    const [row] = await this.db
      .select({
        collection: schema.collectedStoryArtifacts,
        artifact: schema.storyArtifacts,
        story: {
          id: schema.stories.id,
          title: schema.stories.title,
          language: schema.stories.language,
          createdAt: schema.stories.createdAt,
        },
      })
      .from(schema.collectedStoryArtifacts)
      .innerJoin(
        schema.storyArtifacts,
        eq(schema.collectedStoryArtifacts.artifactId, schema.storyArtifacts.id)
      )
      .innerJoin(schema.stories, eq(schema.collectedStoryArtifacts.storyId, schema.stories.id))
      .where(eq(schema.collectedStoryArtifacts.id, id))
      .limit(1);

    return row || null;
  }

  async findForOwnerStoryArtifact(params: ArtifactCollectionOwner & {
    artifactId: string;
    storyId: string;
  }): Promise<CollectedStoryArtifactDetails | null> {
    const [row] = await this.db
      .select({
        collection: schema.collectedStoryArtifacts,
        artifact: schema.storyArtifacts,
        story: {
          id: schema.stories.id,
          title: schema.stories.title,
          language: schema.stories.language,
          createdAt: schema.stories.createdAt,
        },
      })
      .from(schema.collectedStoryArtifacts)
      .innerJoin(
        schema.storyArtifacts,
        eq(schema.collectedStoryArtifacts.artifactId, schema.storyArtifacts.id)
      )
      .innerJoin(schema.stories, eq(schema.collectedStoryArtifacts.storyId, schema.stories.id))
      .where(
        and(
          ...ownerConditions(params),
          eq(schema.collectedStoryArtifacts.artifactId, params.artifactId),
          eq(schema.collectedStoryArtifacts.storyId, params.storyId)
        )
      )
      .limit(1);

    return row || null;
  }

  async create(data: schema.NewCollectedStoryArtifact): Promise<CollectedStoryArtifactDetails> {
    const [collection] = await this.db
      .insert(schema.collectedStoryArtifacts)
      .values(data)
      .returning();

    const details = await this.findByIdWithDetails(collection.id);
    if (!details) {
      throw new Error('Collected story artifact was inserted but could not be loaded');
    }
    return details;
  }

  async listForOwner(owner: ArtifactCollectionOwner): Promise<CollectedStoryArtifactDetails[]> {
    return this.db
      .select({
        collection: schema.collectedStoryArtifacts,
        artifact: schema.storyArtifacts,
        story: {
          id: schema.stories.id,
          title: schema.stories.title,
          language: schema.stories.language,
          createdAt: schema.stories.createdAt,
        },
      })
      .from(schema.collectedStoryArtifacts)
      .innerJoin(
        schema.storyArtifacts,
        eq(schema.collectedStoryArtifacts.artifactId, schema.storyArtifacts.id)
      )
      .innerJoin(schema.stories, eq(schema.collectedStoryArtifacts.storyId, schema.stories.id))
      .where(and(...ownerConditions(owner)))
      .orderBy(desc(schema.collectedStoryArtifacts.acquiredAt));
  }
}
