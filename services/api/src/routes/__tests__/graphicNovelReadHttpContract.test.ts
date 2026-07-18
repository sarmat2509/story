import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'c1111111-1111-4111-8111-111111111111';
const sessionId = 'c2222222-2222-4222-8222-222222222222';
const graphicStoryId = 'c3333333-3333-4333-8333-333333333333';
const projectId = 'c4444444-4444-4444-8444-444444444444';
const pageId = 'c5555555-5555-4555-8555-555555555555';
const unknownStoryId = 'c9999999-9999-4999-8999-999999999999';

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

  const now = new Date();
  const user = {
    id: userId,
    email: 'graphic-read-contract@example.test',
    displayName: 'Graphic Read Contract',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
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
    token: 'graphic-read-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const story = {
    id: graphicStoryId,
    userId,
    title: 'The Comic Grove',
    language: 'en',
    ageGroup: '6-8',
    createdAt: now,
  } as any;
  const project = {
    id: projectId,
    storyId: graphicStoryId,
    status: 'generating',
    createdAt: now,
  } as any;
  const pages = [
    {
      id: pageId,
      projectId,
      pageNumber: 1,
      status: 'completed',
      imageUrl: 'graphic-novels/page-1.png',
      imageAssetId: 'c6666666-6666-4666-8666-666666666666',
      errorMessage: null,
      textOverlayJson: null,
    },
    {
      id: 'c5555555-5555-4555-8555-555555555556',
      projectId,
      pageNumber: 2,
      status: 'generating',
      imageUrl: null,
      imageAssetId: null,
      errorMessage: null,
      textOverlayJson: null,
    },
  ] as any[];
  const panels = [
    {
      id: 'c7777777-7777-4777-8777-777777777771',
      pageId,
      projectId,
      panelIndex: 0,
    },
  ] as any[];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    opsRuntime: {
      getGlobalState: async () => ({
        mode: 'normal',
        message: null,
        startsAt: null,
        endsAt: null,
        updatedAt: now,
      }),
    } as any,
    story: {
      findByIdAndUser: async (id: string, requestedUserId: string) =>
        id === graphicStoryId && requestedUserId === userId ? story : null,
    } as any,
    graphicNovel: {
      findProjectByStoryId: async (storyId: string) =>
        storyId === graphicStoryId ? project : null,
      findPagesByProjectId: async (id: string) => (id === projectId ? pages : []),
      findPanelsByProjectId: async (id: string) => (id === projectId ? panels : []),
    } as any,
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;

  const get = (path: string) =>
    fetch(`${origin}${path}`, { headers: { authorization } });

  try {
    const graphicOk = await get(`/api/v1/graphic-novels/${graphicStoryId}`);
    assert.equal(graphicOk.status, 200, 'known graphic novel returns 200');
    const graphicOkBody = (await graphicOk.json()) as any;
    assert.equal(graphicOkBody.status, 'success');
    assert.equal(graphicOkBody.graphicNovel.story.id, graphicStoryId);
    assert.equal(graphicOkBody.graphicNovel.project.id, projectId);
    assert.equal(graphicOkBody.graphicNovel.pages.length, 2);
    assert.equal(graphicOkBody.graphicNovel.pages[0].panels.length, 1);

    const graphicMissing = await get(`/api/v1/graphic-novels/${unknownStoryId}`);
    assert.equal(graphicMissing.status, 404, 'unknown graphic novel returns 404');

    const statusOk = await get(`/api/v1/graphic-novels/${graphicStoryId}/generation-status`);
    assert.equal(statusOk.status, 200, 'generation status returns 200');
    const statusOkBody = (await statusOk.json()) as any;
    assert.equal(statusOkBody.generationStatus.storyId, graphicStoryId);
    assert.equal(statusOkBody.generationStatus.projectId, projectId);
    assert.equal(statusOkBody.generationStatus.firstPageReady, true);
    assert.equal(statusOkBody.generationStatus.generationComplete, false);
    assert.deepEqual(statusOkBody.generationStatus.readyPageNumbers, [1]);

    const statusMissing = await get(`/api/v1/graphic-novels/${unknownStoryId}/generation-status`);
    assert.equal(statusMissing.status, 404, 'unknown status returns 404');
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('graphic novel read HTTP contract passed (4 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
