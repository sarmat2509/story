import { getDataPrivacyRequestRepository } from '../repositories';
import type { DataPrivacyRequest } from '../db/schema';

export const DATA_PRIVACY_REQUEST_TYPES = ['export', 'deletion'] as const;
export const DATA_PRIVACY_REQUEST_STATUSES = [
  'open',
  'in_review',
  'fulfilled',
  'rejected',
  'canceled',
] as const;

export type DataPrivacyRequestType = typeof DATA_PRIVACY_REQUEST_TYPES[number];
export type DataPrivacyRequestStatus = typeof DATA_PRIVACY_REQUEST_STATUSES[number];

export interface DataPrivacyRequestItem {
  id: string;
  userId: string | null;
  requesterEmail: string | null;
  requestType: string;
  status: string;
  message: string | null;
  adminNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DataPrivacyRequestRepositoryLike {
  create(data: {
    userId: string;
    requesterEmail?: string | null;
    requestType: string;
    message?: string | null;
  }): Promise<DataPrivacyRequest>;
  findById(id: string): Promise<DataPrivacyRequest | null>;
  listForUser(userId: string): Promise<DataPrivacyRequest[]>;
  listAllPaginated(options: {
    limit: number;
    offset: number;
    requestType?: string;
    status?: string;
    search?: string;
  }): Promise<DataPrivacyRequest[]>;
  countAll(options: {
    requestType?: string;
    status?: string;
    search?: string;
  }): Promise<number>;
  updateReview(data: {
    id: string;
    status: string;
    adminNotes?: string | null;
    reviewedByUserId: string;
  }): Promise<DataPrivacyRequest | null>;
}

function getRepository(repository?: DataPrivacyRequestRepositoryLike): DataPrivacyRequestRepositoryLike {
  return repository ?? getDataPrivacyRequestRepository();
}

export function normalizeDataPrivacyRequestMessage(message: unknown): string | null {
  if (typeof message !== 'string') {
    return null;
  }
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 2000);
}

export function isDataPrivacyRequestType(value: string): value is DataPrivacyRequestType {
  return (DATA_PRIVACY_REQUEST_TYPES as readonly string[]).includes(value);
}

export function isDataPrivacyRequestStatus(value: string): value is DataPrivacyRequestStatus {
  return (DATA_PRIVACY_REQUEST_STATUSES as readonly string[]).includes(value);
}

export function formatDataPrivacyRequest(row: DataPrivacyRequest): DataPrivacyRequestItem {
  return {
    id: row.id,
    userId: row.userId,
    requesterEmail: row.requesterEmail,
    requestType: row.requestType,
    status: row.status,
    message: row.message,
    adminNotes: row.adminNotes,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createDataPrivacyRequest(
  params: {
    userId: string;
    requesterEmail?: string | null;
    requestType: DataPrivacyRequestType;
    message?: string | null;
  },
  repository?: DataPrivacyRequestRepositoryLike
): Promise<DataPrivacyRequestItem> {
  const row = await getRepository(repository).create({
    userId: params.userId,
    requesterEmail: params.requesterEmail ?? null,
    requestType: params.requestType,
    message: normalizeDataPrivacyRequestMessage(params.message),
  });
  return formatDataPrivacyRequest(row);
}

export async function listUserDataPrivacyRequests(
  userId: string,
  repository?: DataPrivacyRequestRepositoryLike
): Promise<DataPrivacyRequestItem[]> {
  const rows = await getRepository(repository).listForUser(userId);
  return rows.map(formatDataPrivacyRequest);
}

export async function listAdminDataPrivacyRequests(
  params: {
    limit: number;
    offset: number;
    requestType?: DataPrivacyRequestType;
    status?: DataPrivacyRequestStatus;
    search?: string;
  },
  repository?: DataPrivacyRequestRepositoryLike
): Promise<{ items: DataPrivacyRequestItem[]; meta: { limit: number; offset: number; total: number } }> {
  const repo = getRepository(repository);
  const [items, total] = await Promise.all([
    repo.listAllPaginated(params),
    repo.countAll({
      requestType: params.requestType,
      status: params.status,
      search: params.search,
    }),
  ]);

  return {
    items: items.map(formatDataPrivacyRequest),
    meta: {
      limit: params.limit,
      offset: params.offset,
      total,
    },
  };
}

export async function updateAdminDataPrivacyRequest(
  params: {
    requestId: string;
    status: DataPrivacyRequestStatus;
    adminNotes?: string | null;
    actorUserId: string;
  },
  repository?: DataPrivacyRequestRepositoryLike
): Promise<DataPrivacyRequestItem | null> {
  const repo = getRepository(repository);
  const existing = await repo.findById(params.requestId);
  if (!existing) {
    return null;
  }

  const updated = await repo.updateReview({
    id: params.requestId,
    status: params.status,
    adminNotes: normalizeDataPrivacyRequestMessage(params.adminNotes),
    reviewedByUserId: params.actorUserId,
  });

  return updated ? formatDataPrivacyRequest(updated) : null;
}
