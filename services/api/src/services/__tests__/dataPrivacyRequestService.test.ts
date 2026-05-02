import assert from 'node:assert';
import {
  buildDataExportDownloadFilename,
  createDataPrivacyRequest,
  listAdminDataPrivacyRequests,
  normalizeDataPrivacyRequestMessage,
  updateAdminDataPrivacyRequest,
} from '../dataPrivacyRequestService';

const now = new Date('2026-05-01T10:00:00.000Z');

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    requesterEmail: 'parent@example.com',
    requestType: 'export',
    status: 'open',
    message: null,
    adminNotes: null,
    reviewedByUserId: null,
    reviewedAt: null,
    fulfilledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as any;
}

void (async function main() {
  assert.strictEqual(normalizeDataPrivacyRequestMessage('  export my data  '), 'export my data');
  assert.strictEqual(normalizeDataPrivacyRequestMessage('   '), null);
  assert.strictEqual(normalizeDataPrivacyRequestMessage(undefined), null);
  assert.strictEqual(normalizeDataPrivacyRequestMessage('a'.repeat(2105))?.length, 2000);
  assert.strictEqual(
    buildDataExportDownloadFilename(
      '11111111-1111-4111-8111-111111111111',
      new Date('2026-05-02T15:00:00.000Z')
    ),
    'wondertales-user-export-11111111-1111-4111-8111-111111111111-2026-05-02.json'
  );
  assert.strictEqual(
    buildDataExportDownloadFilename('../bad/request', new Date('2026-05-02T15:00:00.000Z')),
    'wondertales-user-export-badrequest-2026-05-02.json'
  );

  const createdPayloads: any[] = [];
  const listPayloads: any[] = [];
  const updatePayloads: any[] = [];

  const repository = {
    async create(data: any) {
      createdPayloads.push(data);
      return makeRow({
        userId: data.userId,
        requesterEmail: data.requesterEmail,
        requestType: data.requestType,
        message: data.message,
        status: 'open',
      });
    },
    async findById(id: string) {
      return makeRow({ id });
    },
    async listForUser() {
      return [];
    },
    async listAllPaginated(options: any) {
      listPayloads.push(options);
      return [makeRow({ requestType: 'deletion', status: 'in_review' })];
    },
    async countAll() {
      return 1;
    },
    async updateReview(data: any) {
      updatePayloads.push(data);
      return makeRow({
        id: data.id,
        status: data.status,
        adminNotes: data.adminNotes,
        reviewedByUserId: data.reviewedByUserId,
        reviewedAt: now,
        fulfilledAt: data.status === 'fulfilled' ? now : null,
      });
    },
  };

  const created = await createDataPrivacyRequest(
    {
      userId: '22222222-2222-4222-8222-222222222222',
      requesterEmail: 'parent@example.com',
      requestType: 'deletion',
      message: '  please delete my account data  ',
    },
    repository
  );

  assert.strictEqual(created.status, 'open');
  assert.strictEqual(created.requestType, 'deletion');
  assert.strictEqual(created.message, 'please delete my account data');
  assert.deepStrictEqual(createdPayloads[0], {
    userId: '22222222-2222-4222-8222-222222222222',
    requesterEmail: 'parent@example.com',
    requestType: 'deletion',
    message: 'please delete my account data',
  });

  const adminList = await listAdminDataPrivacyRequests(
    {
      limit: 10,
      offset: 0,
      requestType: 'deletion',
      status: 'in_review',
      search: 'parent@example.com',
    },
    repository
  );

  assert.strictEqual(adminList.meta.total, 1);
  assert.strictEqual(adminList.items[0].requestType, 'deletion');
  assert.deepStrictEqual(listPayloads[0], {
    limit: 10,
    offset: 0,
    requestType: 'deletion',
    status: 'in_review',
    search: 'parent@example.com',
  });

  const updated = await updateAdminDataPrivacyRequest(
    {
      requestId: '11111111-1111-4111-8111-111111111111',
      status: 'fulfilled',
      adminNotes: '  exported and sent securely  ',
      actorUserId: '33333333-3333-4333-8333-333333333333',
    },
    repository
  );

  assert.strictEqual(updated?.status, 'fulfilled');
  assert.strictEqual(updated?.adminNotes, 'exported and sent securely');
  assert.strictEqual(updated?.fulfilledAt, now.toISOString());
  assert.deepStrictEqual(updatePayloads[0], {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'fulfilled',
    adminNotes: 'exported and sent securely',
    reviewedByUserId: '33333333-3333-4333-8333-333333333333',
  });

  const missingRepository = {
    ...repository,
    async findById() {
      return null;
    },
    async updateReview() {
      throw new Error('updateReview should not be called for missing requests');
    },
  };

  assert.strictEqual(
    await updateAdminDataPrivacyRequest(
      {
        requestId: '44444444-4444-4444-8444-444444444444',
        status: 'rejected',
        actorUserId: '33333333-3333-4333-8333-333333333333',
      },
      missingRepository
    ),
    null
  );

  console.log('dataPrivacyRequestService tests passed');
})();
