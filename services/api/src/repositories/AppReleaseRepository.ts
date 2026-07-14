import { and, desc, eq, max, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  AppReleaseChange,
  AppReleaseEmailBlock,
  AppReleaseInput,
  AppReleaseStatus,
} from '@wondertales/shared';
import * as schema from '../db/schema';

export interface PublishedAppRelease {
  id: string;
  version: string | null;
  releaseDate: string;
  publishedAt: Date | null;
  updatedAt: Date;
  contentRevision: number;
  locale: string;
  title: string;
  changes: AppReleaseChange[];
}

export interface AdminAppReleaseLocalization {
  locale: string;
  title: string;
  changes: AppReleaseChange[];
  emailSubject: string;
  emailPreheader: string;
  emailBody: AppReleaseEmailBlock[];
}

export interface AdminAppReleaseDetail {
  id: string;
  version: string | null;
  releaseDate: string;
  status: AppReleaseStatus;
  publishedAt: Date | null;
  contentRevision: number;
  createdAt: Date;
  updatedAt: Date;
  translations: AdminAppReleaseLocalization[];
  media: schema.AppReleaseMedia[];
}

export class AppReleaseRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async listPublished(locale: string): Promise<PublishedAppRelease[]> {
    const rows = await this.db
      .select({
        id: schema.appReleases.id,
        version: schema.appReleases.version,
        releaseDate: schema.appReleases.releaseDate,
        publishedAt: schema.appReleases.publishedAt,
        updatedAt: schema.appReleases.updatedAt,
        contentRevision: schema.appReleases.contentRevision,
        locale: schema.appReleaseLocalizations.locale,
        title: schema.appReleaseLocalizations.title,
        changes: schema.appReleaseLocalizations.changes,
      })
      .from(schema.appReleases)
      .innerJoin(
        schema.appReleaseLocalizations,
        eq(schema.appReleaseLocalizations.releaseId, schema.appReleases.id)
      )
      .where(
        and(
          eq(schema.appReleases.status, 'published'),
          eq(schema.appReleaseLocalizations.locale, locale)
        )
      )
      .orderBy(desc(schema.appReleases.releaseDate), desc(schema.appReleases.createdAt));

    return rows.map((row) => ({
      ...row,
      changes: row.changes as AppReleaseChange[],
    }));
  }

  async latestPublishedModifiedAt(): Promise<Date | null> {
    const [row] = await this.db
      .select({ latest: max(schema.appReleases.updatedAt) })
      .from(schema.appReleases)
      .where(eq(schema.appReleases.status, 'published'));
    return row?.latest ?? null;
  }

  async listAdmin(): Promise<Array<schema.AppRelease & { translationCount: number }>> {
    const rows = await this.db
      .select({
        release: schema.appReleases,
        translationCount: sql<number>`count(${schema.appReleaseLocalizations.id})`,
      })
      .from(schema.appReleases)
      .leftJoin(
        schema.appReleaseLocalizations,
        eq(schema.appReleaseLocalizations.releaseId, schema.appReleases.id)
      )
      .groupBy(schema.appReleases.id)
      .orderBy(desc(schema.appReleases.releaseDate), desc(schema.appReleases.createdAt));

    return rows.map(({ release, translationCount }) => ({
      ...release,
      translationCount: Number(translationCount),
    }));
  }

  async findAdminById(id: string): Promise<AdminAppReleaseDetail | null> {
    const [release] = await this.db
      .select()
      .from(schema.appReleases)
      .where(eq(schema.appReleases.id, id))
      .limit(1);
    if (!release) return null;

    const [translationRows, media] = await Promise.all([
      this.db
        .select()
        .from(schema.appReleaseLocalizations)
        .where(eq(schema.appReleaseLocalizations.releaseId, id))
        .orderBy(schema.appReleaseLocalizations.locale),
      this.db
        .select()
        .from(schema.appReleaseMedia)
        .where(eq(schema.appReleaseMedia.releaseId, id))
        .orderBy(desc(schema.appReleaseMedia.createdAt)),
    ]);

    return {
      ...release,
      status: release.status as AppReleaseStatus,
      translations: translationRows.map((translation) => ({
        locale: translation.locale,
        title: translation.title,
        changes: translation.changes as AppReleaseChange[],
        emailSubject: translation.emailSubject,
        emailPreheader: translation.emailPreheader,
        emailBody: translation.emailBody as AppReleaseEmailBlock[],
      })),
      media,
    };
  }

  async create(input: AppReleaseInput, actorUserId: string): Promise<AdminAppReleaseDetail> {
    const id = await this.db.transaction(async (tx) => {
      const now = new Date();
      const [release] = await tx
        .insert(schema.appReleases)
        .values({
          version: input.version ?? null,
          releaseDate: input.releaseDate,
          status: input.status,
          publishedAt: input.status === 'published' ? now : null,
          createdByUserId: actorUserId,
          publishedByUserId: input.status === 'published' ? actorUserId : null,
        })
        .returning({ id: schema.appReleases.id });

      await tx.insert(schema.appReleaseLocalizations).values(
        input.translations.map((translation) => ({
          releaseId: release.id,
          locale: translation.locale,
          title: translation.title,
          changes: translation.changes,
          emailSubject: translation.emailSubject,
          emailPreheader: translation.emailPreheader,
          emailBody: translation.emailBody,
        }))
      );
      return release.id;
    });

    return (await this.findAdminById(id))!;
  }

  async update(
    id: string,
    input: AppReleaseInput,
    actorUserId: string
  ): Promise<AdminAppReleaseDetail | null> {
    const exists = await this.findAdminById(id);
    if (!exists) return null;

    await this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(schema.appReleases)
        .set({
          version: input.version ?? null,
          releaseDate: input.releaseDate,
          status: input.status,
          publishedAt:
            input.status === 'published' ? (exists.publishedAt ?? now) : exists.publishedAt,
          publishedByUserId:
            input.status === 'published'
              ? exists.publishedAt
                ? undefined
                : actorUserId
              : undefined,
          contentRevision: exists.contentRevision + 1,
          updatedAt: now,
        })
        .where(eq(schema.appReleases.id, id));

      for (const translation of input.translations) {
        await tx
          .insert(schema.appReleaseLocalizations)
          .values({
            releaseId: id,
            locale: translation.locale,
            title: translation.title,
            changes: translation.changes,
            emailSubject: translation.emailSubject,
            emailPreheader: translation.emailPreheader,
            emailBody: translation.emailBody,
          })
          .onConflictDoUpdate({
            target: [
              schema.appReleaseLocalizations.releaseId,
              schema.appReleaseLocalizations.locale,
            ],
            set: {
              title: translation.title,
              changes: translation.changes,
              emailSubject: translation.emailSubject,
              emailPreheader: translation.emailPreheader,
              emailBody: translation.emailBody,
              updatedAt: now,
            },
          });
      }
    });

    return this.findAdminById(id);
  }

  async createMedia(
    data: Omit<schema.NewAppReleaseMedia, 'id' | 'createdAt'>
  ): Promise<schema.AppReleaseMedia> {
    const [media] = await this.db.insert(schema.appReleaseMedia).values(data).returning();
    return media;
  }

  async findMediaById(id: string): Promise<schema.AppReleaseMedia | null> {
    const [media] = await this.db
      .select()
      .from(schema.appReleaseMedia)
      .where(eq(schema.appReleaseMedia.id, id))
      .limit(1);
    return media ?? null;
  }

  async deleteMedia(id: string): Promise<schema.AppReleaseMedia | null> {
    const [media] = await this.db
      .delete(schema.appReleaseMedia)
      .where(eq(schema.appReleaseMedia.id, id))
      .returning();
    return media ?? null;
  }
}
