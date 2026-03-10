import jwt from 'jsonwebtoken';
import config from '../config';

export interface TokenPayload {
  userId: string;
  sessionId: string;
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

// Generate JWT token
export function generateToken(payload: TokenPayload): string {
  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
  
  return token;
}

// Verify JWT token
export function verifyToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as DecodedToken;
    return decoded;
  } catch (error) {
    // Token is invalid or expired
    return null;
  }
}

// Decode JWT without verification (for debugging)
export function decodeToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.decode(token) as DecodedToken;
    return decoded;
  } catch (error) {
    return null;
  }
}

// Get token expiration timestamp
export function getTokenExpiration(payload: TokenPayload): number {
  const token = generateToken(payload);
  const decoded = verifyToken(token);
  return decoded?.exp || 0;
}
