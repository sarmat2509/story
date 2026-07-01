import type { NextFunction, Request, Response } from 'express';
import {
  MaintenanceModeError,
  assertGenerationAllowedByOpsMode,
} from '../services/opsRuntimeService';
import { logger } from '../utils/logger';

export async function requireGenerationAvailable(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await assertGenerationAllowedByOpsMode();
    next();
  } catch (error) {
    if (error instanceof MaintenanceModeError) {
      const retryAfter = error.runtimeStatus.retryAfterSeconds;
      if (retryAfter) {
        res.setHeader('Retry-After', String(retryAfter));
      }
      return res.status(error.statusCode).json({
        status: 'error',
        code: error.code,
        message: error.message,
        maintenance: error.runtimeStatus,
      });
    }

    logger.error({ err: error }, 'Failed to check generation maintenance mode');
    return res.status(503).json({
      status: 'error',
      code: 'MAINTENANCE_STATUS_UNAVAILABLE',
      message: 'Generation is temporarily unavailable. Please try again shortly.',
    });
  }
}
