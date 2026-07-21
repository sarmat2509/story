import { and, asc, eq, gte, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

type DbType = NodePgDatabase<typeof schema>;

export class GraphicNovelRepository {
  constructor(private db: DbType) {}

  async countRequestsInPeriod(params: {
    userId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.storyRequests)
      .where(and(
        eq(schema.storyRequests.userId, params.userId),
        gte(schema.storyRequests.createdAt, params.periodStart),
        lt(schema.storyRequests.createdAt, params.periodEnd),
        ne(schema.storyRequests.status, 'failed'),
        sql`${schema.storyRequests.intermediateData}->>'generationKind' = 'graphic_novel'`
      ));

    return Number(row?.count ?? 0);
  }

  async createProject(data: schema.NewGraphicNovelProject, tx?: DbType): Promise<schema.GraphicNovelProject> {
    const conn = tx || this.db;
    const [project] = await conn
      .insert(schema.graphicNovelProjects)
      .values(data)
      .returning();
    return project;
  }

  async updateProject(id: string, data: Partial<schema.NewGraphicNovelProject>): Promise<void> {
    await this.db
      .update(schema.graphicNovelProjects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.graphicNovelProjects.id, id));
  }

  async findProjectByStoryId(storyId: string): Promise<schema.GraphicNovelProject | null> {
    const [project] = await this.db
      .select()
      .from(schema.graphicNovelProjects)
      .where(eq(schema.graphicNovelProjects.storyId, storyId))
      .limit(1);
    return project || null;
  }

  async findProjectByRequestId(requestId: string): Promise<schema.GraphicNovelProject | null> {
    const [project] = await this.db
      .select()
      .from(schema.graphicNovelProjects)
      .where(eq(schema.graphicNovelProjects.storyRequestId, requestId))
      .limit(1);
    return project || null;
  }

  async createPage(data: schema.NewGraphicNovelPage, tx?: DbType): Promise<schema.GraphicNovelPage> {
    const conn = tx || this.db;
    const [page] = await conn
      .insert(schema.graphicNovelPages)
      .values(data)
      .returning();
    return page;
  }

  async updatePage(id: string, data: Partial<schema.NewGraphicNovelPage>): Promise<void> {
    await this.db
      .update(schema.graphicNovelPages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.graphicNovelPages.id, id));
  }

  async findPageByProjectAndNumber(
    projectId: string,
    pageNumber: number
  ): Promise<schema.GraphicNovelPage | null> {
    const [page] = await this.db
      .select()
      .from(schema.graphicNovelPages)
      .where(and(
        eq(schema.graphicNovelPages.projectId, projectId),
        eq(schema.graphicNovelPages.pageNumber, pageNumber)
      ))
      .limit(1);
    return page || null;
  }

  async findPagesByProjectId(projectId: string): Promise<schema.GraphicNovelPage[]> {
    return this.db
      .select()
      .from(schema.graphicNovelPages)
      .where(eq(schema.graphicNovelPages.projectId, projectId))
      .orderBy(asc(schema.graphicNovelPages.pageNumber));
  }

  async findPagesByProjectAndNumbers(
    projectId: string,
    pageNumbers: number[]
  ): Promise<schema.GraphicNovelPage[]> {
    if (pageNumbers.length === 0) return [];
    return this.db
      .select()
      .from(schema.graphicNovelPages)
      .where(and(
        eq(schema.graphicNovelPages.projectId, projectId),
        inArray(schema.graphicNovelPages.pageNumber, pageNumbers)
      ))
      .orderBy(asc(schema.graphicNovelPages.pageNumber));
  }

  async findCompletedPagesWithImages(): Promise<Array<{
    page: schema.GraphicNovelPage;
    storyId: string;
    userId: string;
  }>> {
    const rows = await this.db
      .select({
        page: schema.graphicNovelPages,
        storyId: schema.stories.id,
        userId: schema.stories.userId,
      })
      .from(schema.graphicNovelPages)
      .innerJoin(
        schema.graphicNovelProjects,
        eq(schema.graphicNovelPages.projectId, schema.graphicNovelProjects.id)
      )
      .innerJoin(schema.stories, eq(schema.graphicNovelProjects.storyId, schema.stories.id))
      .where(
        and(
          eq(schema.graphicNovelPages.status, 'completed'),
          isNotNull(schema.graphicNovelPages.imageAssetId)
        )
      )
      .orderBy(asc(schema.graphicNovelPages.createdAt));

    return rows;
  }

  async createPanels(
    data: schema.NewGraphicNovelPanel[],
    tx?: DbType
  ): Promise<schema.GraphicNovelPanel[]> {
    if (data.length === 0) return [];
    const conn = tx || this.db;
    return conn
      .insert(schema.graphicNovelPanels)
      .values(data)
      .returning();
  }

  async updatePanel(id: string, data: Partial<schema.NewGraphicNovelPanel>): Promise<void> {
    await this.db
      .update(schema.graphicNovelPanels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.graphicNovelPanels.id, id));
  }

  async findPanelsByPageId(pageId: string): Promise<schema.GraphicNovelPanel[]> {
    return this.db
      .select()
      .from(schema.graphicNovelPanels)
      .where(eq(schema.graphicNovelPanels.pageId, pageId))
      .orderBy(asc(schema.graphicNovelPanels.panelIndex));
  }

  async findPanelsByProjectId(projectId: string): Promise<schema.GraphicNovelPanel[]> {
    return this.db
      .select()
      .from(schema.graphicNovelPanels)
      .where(eq(schema.graphicNovelPanels.projectId, projectId))
      .orderBy(
        asc(schema.graphicNovelPanels.pageNumber),
        asc(schema.graphicNovelPanels.panelIndex)
      );
  }
}
