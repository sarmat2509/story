import assert from 'node:assert/strict';

const userId = 'p1000000-0000-4000-8000-000000000001';
const requestId = 'p2000000-0000-4000-8000-000000000001';
const storyId = 'p3000000-0000-4000-8000-000000000001';
const projectId = 'p4000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const {
    clearGraphicNovelPageRenderTestOverride,
    installGraphicNovelPageRenderTestOverride,
    processGraphicNovelPages,
  } = await import('../../services/graphicNovelOrchestrationService');

  function makePages() {
    return [
      {
        id: 'page-1',
        pageNumber: 1,
        status: 'pending',
        layoutJson: { pageNumber: 1, panels: [] },
        generationParams: {},
      },
      {
        id: 'page-2',
        pageNumber: 2,
        status: 'pending',
        layoutJson: { pageNumber: 2, panels: [] },
        generationParams: {},
      },
      {
        id: 'page-3',
        pageNumber: 3,
        status: 'pending',
        layoutJson: { pageNumber: 3, panels: [] },
        generationParams: {},
      },
    ];
  }

  // --- stopAfterFirstPage: request completed + firstPageReady, later pages untouched ---
  {
    const pages = makePages();
    const request = {
      id: requestId,
      userId,
      status: 'processing',
      createdAt: new Date(),
      intermediateData: { generationKind: 'graphic_novel' },
      progressData: null,
      progress: 0,
    } as any;
    const story = {
      id: storyId,
      userId,
      coverAssetId: null,
      ageGroup: '6-8',
      metadata: { imageStyle: 'comic_watercolor', storyFormat: 'graphic_novel' },
    } as any;
    const project = {
      id: projectId,
      storyId,
      storyRequestId: requestId,
      ageGroup: '6-8',
      language: 'en',
      scriptJson: { environments: [], characters: [], pages: [] },
      layoutManifest: { characters: [] },
      status: 'generating',
    } as any;
    const projectUpdates: unknown[] = [];
    const requestUpdates: Array<Record<string, unknown>> = [];
    const renderedPages: number[] = [];

    installRepositoryTestOverrides({
      story: {
        findRequestById: async () => request,
        findRequestForUpdate: async () => request,
        findById: async () => story,
        updateRequest: async (_id: string, patch: Record<string, unknown>) => {
          Object.assign(request, patch);
          requestUpdates.push(patch);
        },
        updateStory: async (_id: string, patch: Record<string, unknown>) => {
          if (patch.metadata) {
            story.metadata = { ...story.metadata, ...(patch.metadata as object) };
          }
          Object.assign(story, patch);
          return story;
        },
        transaction: async (callback: (tx: any) => Promise<unknown>) => callback({}),
      } as any,
      graphicNovel: {
        findProjectByRequestId: async () => project,
        findPagesByProjectId: async () => pages,
        updatePage: async (id: string, patch: Record<string, unknown>) => {
          const page = pages.find((row) => row.id === id);
          if (page) Object.assign(page, patch);
        },
        updateProject: async (_id: string, patch: Record<string, unknown>) => {
          Object.assign(project, patch);
          projectUpdates.push(patch);
        },
      } as any,
      storyGenerationStageEvent: {
        create: async (row: unknown) => ({ id: 'stage-1', ...(row as object) }),
      } as any,
      asset: {
        findById: async () => null,
      } as any,
    });

    installGraphicNovelPageRenderTestOverride(async (params) => {
      renderedPages.push(params.page.pageNumber);
      const page = pages.find((row) => row.id === params.page.id)!;
      page.status = 'completed';
      page.imageAssetId = `asset-page-${params.page.pageNumber}`;
      return { pageAssetId: `asset-page-${params.page.pageNumber}` };
    });

    try {
      await processGraphicNovelPages(requestId, { stopAfterFirstPage: true });
      assert.deepEqual(renderedPages, [1]);
      assert.equal(request.status, 'completed');
      assert.equal(story.metadata.firstPageReady, true);
      assert.equal(story.metadata.graphicNovelGenerationComplete, false);
      assert.equal(pages[0].status, 'completed');
      assert.equal(pages[1].status, 'pending');
      assert.equal(project.status, 'generating');
      assert.ok(requestUpdates.some((patch) => patch.status === 'completed'));
    } finally {
      clearGraphicNovelPageRenderTestOverride();
      clearRepositoryTestOverrides();
    }
  }

  // --- page 2 fails after first page ready; generationComplete false with failedPages ---
  {
    const pages = makePages();
    const request = {
      id: requestId,
      userId,
      status: 'processing',
      createdAt: new Date(),
      intermediateData: { generationKind: 'graphic_novel' },
      progressData: null,
      progress: 0,
    } as any;
    const story = {
      id: storyId,
      userId,
      coverAssetId: null,
      ageGroup: '6-8',
      metadata: { imageStyle: 'comic_watercolor', storyFormat: 'graphic_novel' },
    } as any;
    const project = {
      id: projectId,
      storyId,
      storyRequestId: requestId,
      ageGroup: '6-8',
      language: 'en',
      scriptJson: { environments: [], characters: [], pages: [] },
      layoutManifest: { characters: [] },
      status: 'generating',
    } as any;

    installRepositoryTestOverrides({
      story: {
        findRequestById: async () => request,
        findRequestForUpdate: async () => request,
        findById: async () => story,
        updateRequest: async (_id: string, patch: Record<string, unknown>) => {
          Object.assign(request, patch);
        },
        updateStory: async (_id: string, patch: Record<string, unknown>) => {
          if (patch.metadata) {
            story.metadata = { ...story.metadata, ...(patch.metadata as object) };
          }
          Object.assign(story, patch);
          return story;
        },
        transaction: async (callback: (tx: any) => Promise<unknown>) => callback({}),
      } as any,
      graphicNovel: {
        findProjectByRequestId: async () => project,
        findPagesByProjectId: async () => pages,
        updatePage: async (id: string, patch: Record<string, unknown>) => {
          const page = pages.find((row) => row.id === id);
          if (page) Object.assign(page, patch);
        },
        updateProject: async (_id: string, patch: Record<string, unknown>) => {
          Object.assign(project, patch);
        },
      } as any,
      storyGenerationStageEvent: {
        create: async (row: unknown) => ({ id: 'stage-2', ...(row as object) }),
      } as any,
      asset: {
        findById: async () => null,
      } as any,
    });

    installGraphicNovelPageRenderTestOverride(async (params) => {
      if (params.page.pageNumber === 2) {
        throw new Error('panel render failed');
      }
      const page = pages.find((row) => row.id === params.page.id)!;
      page.status = 'completed';
      return { pageAssetId: `asset-page-${params.page.pageNumber}` };
    });

    try {
      await processGraphicNovelPages(requestId);
      assert.equal(request.status, 'completed');
      assert.equal(story.metadata.firstPageReady, true);
      assert.equal(story.metadata.graphicNovelGenerationComplete, true);
      assert.equal(project.status, 'completed_with_errors');
      assert.equal(pages[0].status, 'completed');
      assert.equal(pages[1].status, 'failed');
      assert.equal(pages[2].status, 'completed');
      assert.ok(
        Array.isArray(story.metadata.failedGraphicNovelPages) &&
          story.metadata.failedGraphicNovelPages.some((row: any) => row.pageNumber === 2)
      );
    } finally {
      clearGraphicNovelPageRenderTestOverride();
      clearRepositoryTestOverrides();
    }
  }

  console.log('graphic novel multi-page worker contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
