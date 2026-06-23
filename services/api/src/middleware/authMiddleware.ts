import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/jwtService';
import { getSessionWithUser, updateLastActive } from '../services/sessionService';
import { logger } from '../utils/logger';
import type { Session, User } from '../db/schema';
import { USER_ROLE_ADMIN } from '../constants/userRoles';
import type { SessionMode } from '../services/sessionService';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
      sessionMode?: SessionMode;
      parentUserId?: string;
      childProfileId?: string;
      sessionScopes?: string[];
    }
  }
}

function normalizeSessionMode(mode: Session['mode']): SessionMode {
  return mode === 'child' ? 'child' : 'parent';
}

function normalizeSessionScopes(scopes: Session['scopes']): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  return scopes.filter((scope): scope is string => typeof scope === 'string');
}

function attachAuthenticatedSession(
  req: Request,
  result: { session: Session; user: User },
  sessionId: string
): void {
  req.user = result.user;
  req.sessionId = sessionId;
  req.sessionMode = normalizeSessionMode(result.session.mode);
  req.parentUserId = result.session.parentUserId || result.user.id;
  req.childProfileId = result.session.childProfileId || undefined;
  req.sessionScopes = normalizeSessionScopes(result.session.scopes);
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

    if (result.user.status && result.user.status !== 'active') {
      res.status(403).json({
        status: 'error',
        message: 'Account access is suspended',
        code: 'ACCOUNT_SUSPENDED',
      });
      return;
    }
    
    // Update last active timestamp (async, don't await)
    updateLastActive(decoded.sessionId).catch((err) => {
      logger.error({ err, sessionId: decoded.sessionId }, 'Failed to update last active');
    });
    
    // Attach user and session context to request
    attachAuthenticatedSession(req, result, decoded.sessionId);
    
    logger.debug({
      userId: req.user.id,
      sessionId: req.sessionId,
      sessionMode: req.sessionMode,
      childProfileId: req.childProfileId,
    }, 'User authenticated');
    
    next();
  } catch (error) {
    logger.error({ err: error }, 'Auth middleware error');
    res.status(500).json({
      status: 'error',
      message: 'Internal authentication error',
    });
  }
}

/** Use after requireAuth. Blocks child sessions from parent-only account operations. */
export function requireParentSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      status: 'error',
      message: 'Not authenticated',
      code: 'AUTHENTICATION_REQUIRED',
    });
    return;
  }

  if (req.sessionMode === 'child') {
    res.status(403).json({
      status: 'error',
      message: 'Parent session required',
      code: 'PARENT_SESSION_REQUIRED',
    });
    return;
  }

  next();
}

/** Use after requireAuth. Allows only scoped child sessions attached to one child profile. */
export function requireChildSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      status: 'error',
      message: 'Not authenticated',
      code: 'AUTHENTICATION_REQUIRED',
    });
    return;
  }

  if (req.sessionMode !== 'child') {
    res.status(403).json({
      status: 'error',
      message: 'Child session required',
      code: 'CHILD_SESSION_REQUIRED',
    });
    return;
  }

  if (!req.childProfileId) {
    res.status(403).json({
      status: 'error',
      message: 'Child profile context required',
      code: 'CHILD_PROFILE_CONTEXT_REQUIRED',
    });
    return;
  }

  next();
}

/** Use after requireAuth. Verifies an explicit scope on the authenticated session. */
export function requireSessionScope(scope: string) {
  return function requireSessionScopeMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    if (!req.sessionScopes?.includes(scope)) {
      res.status(403).json({
        status: 'error',
        message: 'Required session scope missing',
        code: 'SESSION_SCOPE_REQUIRED',
        requiredScope: scope,
      });
      return;
    }

    next();
  };
}

/** Use after requireAuth. Returns 403 unless this is a parent admin session. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      status: 'error',
      message: 'Not authenticated',
    });
    return;
  }
  if (req.user.role !== USER_ROLE_ADMIN) {
    res.status(403).json({
      status: 'error',
      message: 'Forbidden',
    });
    return;
  }
  if (req.sessionMode === 'child') {
    res.status(403).json({
      status: 'error',
      message: 'Parent session required',
      code: 'PARENT_SESSION_REQUIRED',
    });
    return;
  }
  next();
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
      if (result.user.status && result.user.status !== 'active') {
        next();
        return;
      }
      attachAuthenticatedSession(req, result, decoded.sessionId);
      
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
