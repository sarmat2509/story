import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/jwtService';
import { getSessionWithUser, updateLastActive } from '../services/sessionService';
import { logger } from '../utils/logger';
import type { User } from '../db/schema';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
    }
  }
}

// Extract JWT from Authorization header
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }
  
  const parts = authHeader.split(' ');
  
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

// Require authentication middleware
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token
    const token = extractToken(req);
    
    if (!token) {
      res.status(401).json({
        status: 'error',
        message: 'No authentication token provided',
      });
      return;
    }
    
    // Verify JWT
    const decoded = verifyToken(token);
    
    if (!decoded) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid or expired token',
      });
      return;
    }
    
    // Get session with user (single service call)
    const result = await getSessionWithUser(decoded.sessionId);
    
    if (!result) {
      res.status(401).json({
        status: 'error',
        message: 'Session expired or invalid',
      });
      return;
    }
    
    // Update last active timestamp (async, don't await)
    updateLastActive(decoded.sessionId).catch((err) => {
      logger.error({ err, sessionId: decoded.sessionId }, 'Failed to update last active');
    });
    
    // Attach user and session to request
    req.user = result.user;
    req.sessionId = decoded.sessionId;
    
    logger.debug({ userId: req.user.id, sessionId: req.sessionId }, 'User authenticated');
    
    next();
  } catch (error) {
    logger.error({ err: error }, 'Auth middleware error');
    res.status(500).json({
      status: 'error',
      message: 'Internal authentication error',
    });
  }
}

// Optional authentication middleware
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);
    
    if (!token) {
      next();
      return;
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      next();
      return;
    }
    
    // Get session with user (single service call)
    const result = await getSessionWithUser(decoded.sessionId);
    
    if (result) {
      req.user = result.user;
      req.sessionId = decoded.sessionId;
      
      // Update last active (async)
      updateLastActive(decoded.sessionId).catch((err) => {
        logger.error({ err, sessionId: decoded.sessionId }, 'Failed to update last active');
      });
    }
    
    next();
  } catch (error) {
    logger.error({ err: error }, 'Optional auth middleware error');
    next();
  }
}
