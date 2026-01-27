import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({
    err,
    statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
  }, 'Request error');

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  logger.warn({
    method: req.method,
    path: req.path,
    ip: req.ip,
  }, 'Route not found');
  
  res.status(404).json({
    status: 'error',
    statusCode: 404,
    message: `Route ${req.method} ${req.path} not found`,
  });
};
