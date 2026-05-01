import assert from 'node:assert';
import type { NextFunction, Request, Response } from 'express';
import { requireAdmin } from '../authMiddleware';
import { USER_ROLE_ADMIN } from '../../constants/userRoles';

function runAdminGuard(req: Partial<Request>): {
  nextCalled: boolean;
  statusCode?: number;
  body?: unknown;
} {
  const result: {
    nextCalled: boolean;
    statusCode?: number;
    body?: unknown;
  } = { nextCalled: false };

  const res = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as Response;

  const next: NextFunction = () => {
    result.nextCalled = true;
  };

  requireAdmin(req as Request, res, next);
  return result;
}

void (async function main() {
  assert.deepStrictEqual(
    runAdminGuard({}),
    {
      nextCalled: false,
      statusCode: 401,
      body: {
        status: 'error',
        message: 'Not authenticated',
      },
    },
    'admin guard requires authentication'
  );

  assert.deepStrictEqual(
    runAdminGuard({ user: { id: 'user-1', role: 'user' } as Request['user'] }),
    {
      nextCalled: false,
      statusCode: 403,
      body: {
        status: 'error',
        message: 'Forbidden',
      },
    },
    'non-admin users cannot pass admin guard'
  );

  assert.deepStrictEqual(
    runAdminGuard({ user: { id: 'admin-1', role: USER_ROLE_ADMIN } as Request['user'] }),
    { nextCalled: true },
    'admin users can pass admin guard'
  );

  console.log('authMiddlewareAdmin tests passed');
})();
