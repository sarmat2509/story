/**
 * Extend Express.User with our schema User type so req.user has correct types.
 * @types/passport declares User as empty interface; we augment it with our DB user shape.
 */
import type { User as DbUser } from '../db/schema';

declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}

export {};
