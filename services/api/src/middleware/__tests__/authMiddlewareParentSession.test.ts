import assert from 'node:assert';
import type { NextFunction, Request, Response } from 'express';
import { requireChildSession, requireParentSession, requireSessionScope } from '../authMiddleware';

function runGuard(
  req: Partial<Request>,
  middleware: (req: Request, res: Response, next: NextFunction) => void
): {
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

  middleware(req as Request, res, next);
  return result;
}

function runParentGuard(req: Partial<Request>) {
  return runGuard(req, requireParentSession);
}

function runChildGuard(req: Partial<Request>) {
  return runGuard(req, requireChildSession);
}

function runScopeGuard(req: Partial<Request>, scope: string) {
  return runGuard(req, requireSessionScope(scope));
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

  assert.deepStrictEqual(
    runChildGuard({ user: { id: 'user-1' } as Request['user'], sessionMode: 'parent' }),
    {
      nextCalled: false,
      statusCode: 403,
      body: {
        status: 'error',
        message: 'Child session required',
        code: 'CHILD_SESSION_REQUIRED',
      },
    },
    'parent sessions cannot pass child-only guard'
  );

  assert.deepStrictEqual(
    runChildGuard({ user: { id: 'user-1' } as Request['user'], sessionMode: 'child' }),
    {
      nextCalled: false,
      statusCode: 403,
      body: {
        status: 'error',
        message: 'Child profile context required',
        code: 'CHILD_PROFILE_CONTEXT_REQUIRED',
      },
    },
    'child sessions require child profile context'
  );

  assert.deepStrictEqual(
    runChildGuard({
      user: { id: 'user-1' } as Request['user'],
      sessionMode: 'child',
      childProfileId: 'child-1',
    }),
    { nextCalled: true },
    'child sessions with child context pass child-only guard'
  );

  assert.deepStrictEqual(
    runScopeGuard({ user: { id: 'user-1' } as Request['user'], sessionScopes: ['child_mode'] }, 'story:audio'),
    {
      nextCalled: false,
      statusCode: 403,
      body: {
        status: 'error',
        message: 'Required session scope missing',
        code: 'SESSION_SCOPE_REQUIRED',
        requiredScope: 'story:audio',
      },
    },
    'scope guard rejects sessions missing the required scope'
  );

  assert.deepStrictEqual(
    runScopeGuard({ user: { id: 'user-1' } as Request['user'], sessionScopes: ['child_mode', 'story:audio'] }, 'story:audio'),
    { nextCalled: true },
    'scope guard allows sessions with the required scope'
  );

  console.log('authMiddlewareParentSession tests passed');
})();
