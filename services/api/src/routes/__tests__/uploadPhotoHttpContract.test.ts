import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'f1111111-1111-4111-8111-111111111111';
const otherUserId = 'f1111111-1111-4111-8111-111111111112';
const sessionId = 'f2222222-2222-4222-8222-222222222222';

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
  const { clearAssetStorageServiceTestOverride, installAssetStorageServiceTestOverride } =
    await import('../../services/assetStorageService');

  const now = new Date();
  const user = {
    id: userId,
    email: 'upload-photo@example.test',
    displayName: 'Upload Photo',
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
    token: 'upload-photo-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  const deletedPaths: string[] = [];
  const uploaded: Array<{ photoType: string; userId: string }> = [];

  installAssetStorageServiceTestOverride({
    preprocessImage: async (buffer: Buffer) => buffer,
    uploadUserPhoto: async (input: { userId: string; photoType: string }) => {
      uploaded.push({ userId: input.userId, photoType: input.photoType });
      const storagePath = `development/${input.userId}/photos/${input.photoType}/mock.jpg`;
      return {
        storagePath,
        storageUrl: `/api/v1/assets/${storagePath}`,
        signedUrl: `/api/v1/assets/${storagePath}?signed=1`,
      };
    },
    deleteAsset: async (storagePath: string) => {
      deletedPaths.push(storagePath);
    },
  } as any);

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
      revokeById: async () => undefined,
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
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const postPhoto = async (fields: Record<string, string>, fileName = 'photo.jpg') => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    form.append('photo', new Blob([Buffer.from('fake-image-bytes')], { type: 'image/jpeg' }), fileName);
    return fetch(`${origin}/api/v1/upload/photo`, {
      method: 'POST',
      headers: { authorization },
      body: form,
    });
  };

  const deletePhoto = (body: unknown) =>
    fetch(`${origin}/api/v1/upload/photo`, {
      method: 'DELETE',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  try {
    const rightsMissing = await postPhoto({
      photoType: 'character',
    });
    assert.equal(rightsMissing.status, 403, 'missing image rights returns 403');
    const rightsMissingBody = (await rightsMissing.json()) as any;
    assert.equal(rightsMissingBody.code, 'IMAGE_RIGHTS_CONFIRMATION_REQUIRED');

    const uploadOk = await postPhoto({
      photoType: 'character',
      imageRightsAccepted: 'true',
      noPublicFiguresAccepted: 'true',
    });
    assert.equal(uploadOk.status, 200, 'character photo upload returns 200');
    const uploadOkBody = (await uploadOk.json()) as any;
    assert.equal(uploadOkBody.status, 'success');
    assert.ok(uploadOkBody.photo.url);
    assert.ok(String(uploadOkBody.photo.storagePath).includes(userId));
    assert.equal(uploaded.length, 1);
    assert.equal(uploaded[0].photoType, 'character');

    const ownUrl = `/api/v1/assets/development/${userId}/photos/character/mock.jpg`;
    const deleteOwn = await deletePhoto({ url: ownUrl });
    assert.equal(deleteOwn.status, 200, 'delete own photo returns 200');
    assert.deepEqual(deletedPaths, [`development/${userId}/photos/character/mock.jpg`]);

    const deleteOther = await deletePhoto({
      url: `/api/v1/assets/development/${otherUserId}/photos/character/mock.jpg`,
    });
    assert.equal(deleteOther.status, 403, 'delete other user photo returns 403');

    const deleteBadUrl = await deletePhoto({ url: 'https://example.com/not-an-asset.jpg' });
    assert.equal(deleteBadUrl.status, 400, 'invalid photo URL returns 400');
  } finally {
    clearRepositoryTestOverrides();
    clearAssetStorageServiceTestOverride();
    await close(server);
  }

  console.log('upload photo HTTP contract passed (5 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
