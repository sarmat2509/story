import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = '20111111-1111-4111-8111-111111111111';
const sessionId = '20222222-2222-4222-8222-222222222222';
const graphicNovelStoryId = '20333333-3333-4333-8333-333333333333';
const graphicNovelProjectId = '20444444-4444-4444-8444-444444444444';
const graphicNovelCharacterId = '20666666-6666-4666-8666-666666666666';

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Test HTTP server did not expose a TCP port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main(): Promise<void> {
  process.env.RUN_HTTP_SERVER = 'false';
  process.env.RUN_JOB_WORKERS = 'false';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const { clearStoryJobQueueAddJobTestOverride, installStoryJobQueueAddJobTestOverride } =
    await import('../../jobs/storyJobProcessor');

  const now = new Date();
  let characterRegenerationAnalyticsSince: Date | undefined;
  const user = {
    id: userId,
    email: 'admin-functional@example.test',
    displayName: 'Admin Functional',
    role: 'admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  } as any;
  const session = {
    id: sessionId,
    userId,
    mode: 'parent',
    parentUserId: userId,
    childProfileId: null,
    scopes: [],
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const opsState = {
    mode: 'normal',
    message: null as string | null,
    startsAt: null as Date | null,
    endsAt: null as Date | null,
    updatedAt: now,
  };
  let queuedJob: unknown = null;

  installStoryJobQueueAddJobTestOverride(async (input) => {
    queuedJob = input;
    return 'repair-panels-job-1';
  });

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    user: { findById: async () => user } as any,
    story: {
      findById: async (id: string) =>
        id === graphicNovelStoryId
          ? {
              id: graphicNovelStoryId,
              userId,
              metadata: { storyFormat: 'graphic_novel' },
            }
          : null,
    } as any,
    graphicNovel: {
      findProjectByStoryId: async (storyId: string) =>
        storyId === graphicNovelStoryId ? { id: graphicNovelProjectId, storyId } : null,
      findPageByProjectAndNumber: async (projectId: string, pageNumber: number) =>
        projectId === graphicNovelProjectId && pageNumber === 2
          ? {
              id: '20555555-5555-4555-8555-555555555555',
              projectId,
              pageNumber,
              status: 'completed',
              generationParams: { artOnlyImageStoragePath: 'graphic-novels/page-2-art.png' },
              layoutJson: {
                panels: [{ script: { panelId: 'page-2-panel-1' } }],
              },
            }
          : null,
    } as any,
    opsRuntime: {
      getGlobalState: async () => ({ ...opsState }),
      updateGlobalState: async (patch: Record<string, unknown>) => {
        Object.assign(opsState, patch, { updatedAt: new Date() });
        return { ...opsState };
      },
    } as any,
    plan: { findActivePlans: async () => [] } as any,
    bundle: { findActiveBundles: async () => [] } as any,
    discount: { listAdminCodes: async () => [] } as any,
    appRelease: { listAdmin: async () => [] } as any,
    imageValidation: {
      listForCharacterRegenerationAnalytics: async (createdSince?: Date) => {
        characterRegenerationAnalyticsSince = createdSince;
        return [
          {
            storyId: graphicNovelStoryId,
            sceneIndex: 1,
            subjectType: 'scene_image',
            pageNumber: null,
            panelIndex: null,
            panelId: null,
            attempt: 1,
            requestManifest: null,
            result: { expectedCharacterCount: 1 },
            createdAt: now,
          },
          {
            storyId: graphicNovelStoryId,
            sceneIndex: 2,
            subjectType: 'scene_image',
            pageNumber: null,
            panelIndex: null,
            panelId: null,
            attempt: 1,
            requestManifest: null,
            result: { expectedCharacterCount: 2 },
            createdAt: now,
          },
          {
            storyId: graphicNovelStoryId,
            sceneIndex: 2,
            subjectType: 'scene_image',
            pageNumber: null,
            panelIndex: null,
            panelId: null,
            attempt: 2,
            requestManifest: null,
            result: { expectedCharacterCount: 2 },
            createdAt: new Date(now.getTime() + 1),
          },
        ];
      },
    } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const request = (method: string, path: string, body?: unknown) =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        authorization,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  try {
    const ops = await request('GET', '/api/v1/admin/ops/runtime');
    assert.equal(ops.status, 200);
    assert.equal(((await ops.json()) as any).ops.mode, 'normal');

    const updateOps = await request('PATCH', '/api/v1/admin/ops/runtime', {
      mode: 'maintenance',
      message: 'Contract maintenance',
    });
    assert.equal(updateOps.status, 200);
    const updateOpsBody = (await updateOps.json()) as any;
    assert.equal(updateOpsBody.ops.mode, 'maintenance');
    assert.equal(updateOpsBody.ops.active, true);

    const discountOptions = await request('GET', '/api/v1/admin/discount-codes/options');
    assert.equal(discountOptions.status, 200);
    assert.deepEqual(((await discountOptions.json()) as any).data, { plans: [], bundles: [] });

    const discountCodes = await request('GET', '/api/v1/admin/discount-codes');
    assert.equal(discountCodes.status, 200);
    assert.deepEqual(((await discountCodes.json()) as any).data, []);

    const releases = await request('GET', '/api/v1/admin/app-releases');
    assert.equal(releases.status, 200);
    assert.deepEqual(((await releases.json()) as any).data, []);

    const validationAnalytics = await request(
      'GET',
      '/api/v1/admin/image-validations/analytics/character-regenerations?days=7'
    );
    assert.equal(validationAnalytics.status, 200);
    assert.ok(characterRegenerationAnalyticsSince instanceof Date);
    assert.ok(
      Math.abs(Date.now() - characterRegenerationAnalyticsSince.getTime() - 7 * 24 * 60 * 60 * 1000) <
        1000,
      'analytics query uses the requested dashboard time range'
    );
    assert.deepEqual(((await validationAnalytics.json()) as any).data.totals, {
      validationRows: 3,
      imageTargets: 2,
      excludedImageTargets: 0,
      totalGenerations: 3,
      totalRegenerations: 1,
      retriedImageTargets: 1,
      retryRate: 0.5,
      pearsonCorrelation: 1,
    });

    const repairPanels = await request(
      'POST',
      `/api/v1/admin/stories/${graphicNovelStoryId}/graphic-novel-pages/2/repair-panels`,
      {
        panels: [
          {
            panelNumber: 1,
            panelId: 'page-2-panel-1',
            mode: 'regenerate',
            issues: [
              {
                kind: 'hair',
                comment: 'Restore the exact hairstyle from the turnaround.',
                characterId: graphicNovelCharacterId,
              },
              { kind: 'text', comment: 'Remove the baked-in caption.' },
            ],
          },
        ],
        refreshTurnaroundCharacterIds: [graphicNovelCharacterId],
      }
    );
    assert.equal(repairPanels.status, 200);
    assert.deepEqual((await repairPanels.json()) as any, {
      status: 'success',
      data: {
        jobId: 'repair-panels-job-1',
        storyId: graphicNovelStoryId,
        pageNumber: 2,
        panelNumbers: [1],
      },
      message: 'Graphic novel panel repair started',
    });
    assert.deepEqual(queuedJob, {
      type: 'repair_graphic_novel_panels',
      storyId: graphicNovelStoryId,
      pageNumber: 2,
      panels: [
        {
          panelNumber: 1,
          panelId: 'page-2-panel-1',
          mode: 'regenerate',
          issues: [
            {
              kind: 'hair',
              comment: 'Restore the exact hairstyle from the turnaround.',
              characterId: graphicNovelCharacterId,
            },
            { kind: 'text', comment: 'Remove the baked-in caption.' },
          ],
        },
      ],
      refreshTurnaroundCharacterIds: [graphicNovelCharacterId],
    });

    const validationCases: Array<{
      method: string;
      path: string;
      body?: unknown;
      status?: number;
    }> = [
      { method: 'GET', path: '/api/v1/admin/dashboard?days=-1' },
      { method: 'PATCH', path: '/api/v1/admin/ops/runtime', body: { mode: 'broken' } },
      { method: 'GET', path: '/api/v1/admin/jobs/bad!' },
      { method: 'GET', path: '/api/v1/admin/stories?limit=0' },
      { method: 'PATCH', path: '/api/v1/admin/stories/not-a-uuid', body: {} },
      { method: 'GET', path: '/api/v1/admin/users?limit=0' },
      { method: 'POST', path: '/api/v1/admin/discount-codes', body: {} },
      { method: 'PATCH', path: '/api/v1/admin/discount-codes/not-a-uuid', body: {} },
      { method: 'GET', path: '/api/v1/admin/outfits?limit=0' },
      { method: 'POST', path: '/api/v1/admin/outfits/search', body: {} },
      { method: 'GET', path: '/api/v1/admin/environments?limit=0' },
      { method: 'POST', path: '/api/v1/admin/environments/search', body: {} },
      { method: 'GET', path: '/api/v1/admin/voices?limit=0' },
      { method: 'PATCH', path: '/api/v1/admin/voices/not-a-uuid', body: {} },
      { method: 'GET', path: '/api/v1/admin/feedback?limit=0' },
      { method: 'GET', path: '/api/v1/admin/moderation-decisions?limit=0' },
      { method: 'GET', path: '/api/v1/admin/privacy-requests?limit=0' },
      { method: 'GET', path: '/api/v1/admin/privacy-requests/not-a-uuid/export' },
      { method: 'PATCH', path: '/api/v1/admin/privacy-requests/not-a-uuid', body: {} },
      { method: 'PATCH', path: '/api/v1/admin/users/not-a-uuid', body: {} },
      { method: 'GET', path: '/api/v1/admin/image-validations?limit=0' },
      { method: 'GET', path: '/api/v1/admin/image-validations/not-a-uuid/image' },
      { method: 'GET', path: '/api/v1/admin/image-validations/not-a-uuid' },
      {
        method: 'POST',
        path: '/api/v1/admin/image-validations/not-a-uuid/apply-best-scene-image',
      },
      { method: 'POST', path: '/api/v1/admin/stories/not-a-uuid/audio/reset', body: {} },
      { method: 'GET', path: '/api/v1/admin/assets/not-a-uuid/image' },
      { method: 'GET', path: '/api/v1/admin/map-tile-masks/INVALID!/image' },
      { method: 'GET', path: '/api/v1/admin/stories/not-a-uuid/director-scenes' },
      {
        method: 'POST',
        path: '/api/v1/admin/stories/not-a-uuid/scenes/0/regenerate-image',
        body: {},
      },
      {
        method: 'POST',
        path: '/api/v1/admin/stories/not-a-uuid/graphic-novel-pages/0/regenerate-image',
        body: {},
      },
      {
        method: 'POST',
        path: '/api/v1/admin/stories/not-a-uuid/graphic-novel-pages/0/repair-panels',
        body: {},
      },
      {
        method: 'POST',
        path: `/api/v1/admin/stories/${graphicNovelStoryId}/graphic-novel-pages/2/repair-panels`,
        body: {
          panels: [
            {
              panelNumber: 1,
              issues: [{ kind: 'hair', comment: 'Hair does not match.' }],
            },
          ],
        },
      },
      { method: 'GET', path: '/api/v1/admin/content-config/not-a-resource' },
      { method: 'POST', path: '/api/v1/admin/content-config/not-a-resource', body: {} },
      { method: 'PATCH', path: '/api/v1/admin/content-config/not-a-resource/id', body: {} },
      { method: 'DELETE', path: '/api/v1/admin/content-config/not-a-resource/id' },
      { method: 'GET', path: '/api/v1/admin/app-releases/not-a-uuid' },
      { method: 'POST', path: '/api/v1/admin/app-releases', body: {} },
      { method: 'PUT', path: '/api/v1/admin/app-releases/not-a-uuid', body: {} },
      { method: 'GET', path: '/api/v1/admin/app-releases/not-a-uuid/email-preview/en' },
      { method: 'POST', path: '/api/v1/admin/app-releases/not-a-uuid/media' },
      {
        method: 'DELETE',
        path: '/api/v1/admin/app-releases/not-a-uuid/media/not-a-uuid',
      },
    ];

    for (const testCase of validationCases) {
      const response = await request(testCase.method, testCase.path, testCase.body);
      assert.equal(
        response.status,
        testCase.status ?? 400,
        `${testCase.method} ${testCase.path} rejects invalid input at the route boundary`
      );
      await response.arrayBuffer();
    }
  } finally {
    clearStoryJobQueueAddJobTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('admin functional HTTP contract passed (43 routes owned)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
