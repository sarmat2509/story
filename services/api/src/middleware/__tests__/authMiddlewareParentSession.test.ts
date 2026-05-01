import assert from 'node:assert';
import type { NextFunction, Request, Response } from 'express';
import { requireParentSession } from '../authMiddleware';

function runParentGuard(req: Partial<Request>): {
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

  requireParentSession(req as Request, res, next);
  return result;
}

void (async function main() {
  assert.deepStrictEqual(
    runParentGuard({}),
    {
      nextCalled: false,
      statusCode: 401,
      body: {
        status: 'error',
        message: 'Not authenticated',
        code: 'AUTHENTICATION_REQUIRED',
      },
    },
    'parent guard requires authentication'
  );

  assert.deepStrictEqual(
    runParentGuard({ user: { id: 'user-1' } as Request['user'], sessionMode: 'child' }),
    {
      nextCalled: false,
      statusCode: 403,
      body: {
        status: 'error',
        message: 'Parent session required',
        code: 'PARENT_SESSION_REQUIRED',
      },
    },
    'child sessions cannot pass parent-only guard'
  );

  assert.deepStrictEqual(
    runParentGuard({ user: { id: 'user-1' } as Request['user'], sessionMode: 'parent' }),
    { nextCalled: true },
    'parent sessions can pass parent-only guard'
  );

  assert.deepStrictEqual(
    runParentGuard({ user: { id: 'user-1' } as Request['user'] }),
    { nextCalled: true },
    'legacy authenticated requests without explicit mode are treated as parent sessions'
  );

  console.log('authMiddlewareParentSession tests passed');
})();
