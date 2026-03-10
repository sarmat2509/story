import { Request, Response, NextFunction } from 'express';
import { camelizeKeys } from 'humps';

/**
 * Middleware for automatic case transformation:
 * - Request body/query: snake_case → camelCase (from API clients for validation/services)
 * - Response: No transformation (services already return camelCase, client handles it)
 */
export function caseTransformMiddleware(req: Request, res: Response, next: NextFunction) {
  // Transform incoming request body: snake_case → camelCase
  if (req.body && Object.keys(req.body).length > 0) {
    req.body = camelizeKeys(req.body, { separator: '_' });
  }

  // Transform query params: snake_case → camelCase
  if (req.query && Object.keys(req.query).length > 0) {
    req.query = camelizeKeys(req.query, { separator: '_' }) as typeof req.query;
  }

  // Don't transform responses - services return camelCase, frontend client handles it
  next();
}
