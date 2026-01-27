import { Router, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import config from '../config';
import { handleGoogleCallback, handleAppleCallback } from '../services/oauthService';
import { createSession, deleteSession, deleteAllUserSessions } from '../services/sessionService';
import { generateToken } from '../services/jwtService';
import { requireAuth } from '../middleware/authMiddleware';
import { logger } from '../utils/logger';

const router = Router();

// Configure Google OAuth strategy
if (config.oauth.google.clientId && config.oauth.google.clientSecret) {
  logger.info('Configuring Google OAuth strategy');
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.oauth.google.clientId,
        clientSecret: config.oauth.google.clientSecret,
        callbackURL: config.oauth.google.callbackUrl,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Validate profile data - using inline validation since shared schemas may not be set up yet
          const googleProfile = {
            id: profile.id,
            email: profile.emails?.[0]?.value || '',
            name: profile.displayName,
            picture: profile.photos?.[0]?.value,
          };
          
          if (!googleProfile.email) {
            return done(new Error('Email is required from Google profile'));
          }
          
          done(null, { profile: googleProfile, accessToken, refreshToken });
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
} else {
  logger.warn('Google OAuth not configured - missing clientId or clientSecret', {
    hasClientId: !!config.oauth.google.clientId,
    hasClientSecret: !!config.oauth.google.clientSecret,
  });
}

// Helper to extract device info from request
function extractDeviceInfo(req: Request) {
  const userAgent = req.headers['user-agent'] || '';
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '';
  
  // Simple device detection
  let deviceType: 'ios' | 'android' | 'web' = 'web';
  let deviceName = 'Web Browser';
  
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    deviceType = 'ios';
    deviceName = userAgent.includes('iPad') ? 'iPad' : 'iPhone';
  } else if (userAgent.includes('Android')) {
    deviceType = 'android';
    deviceName = 'Android Device';
  }
  
  return { deviceType, deviceName, ipAddress, userAgent };
}

// Google OAuth - Start
router.get('/google/start', (req: Request, res: Response, next) => {
  // Preserve redirect_uri in state for callback
  const redirectUri = req.query.redirect_uri as string;
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state: redirectUri ? JSON.stringify({ redirect_uri: redirectUri }) : undefined,
  })(req, res, next);
});

// Google OAuth - Callback
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/error' }),
  async (req: Request, res: Response) => {
    try {
      const { profile, accessToken, refreshToken } = req.user as any;
      
      // Handle OAuth callback
      const result = await handleGoogleCallback(profile, accessToken, refreshToken);
      
      // Extract device info
      const deviceInfo = extractDeviceInfo(req);
      
      // Create session
      const session = await createSession({
        userId: result.user.id,
        ...deviceInfo,
      });
      
      // Generate JWT
      const token = generateToken({
        userId: result.user.id,
        sessionId: session.id, // Use session.id (UUID), not session.token
      });
      
      // Parse state for redirect_uri
      const state = req.query.state ? JSON.parse(req.query.state as string) : {};
      const redirectUri = state.redirect_uri || 'kazka://auth/google/callback';
      
      // For web flow: redirect with token in URL
      const callbackUrl = new URL(redirectUri);
      callbackUrl.searchParams.set('token', token);
      callbackUrl.searchParams.set('isNewUser', result.isNewUser.toString());
      
      logger.info({ userId: result.user.id, redirectUri }, 'OAuth callback - redirecting with token');
      res.redirect(callbackUrl.toString());
    } catch (error) {
      logger.error({ err: error }, 'Google OAuth callback failed');
      const errorUrl = new URL('kazka://auth/error');
      errorUrl.searchParams.set('message', 'Authentication failed');
      res.redirect(errorUrl.toString());
    }
  }
);

// Google OAuth - Mobile token exchange
// For React Native apps using @react-native-google-signin/google-signin
// Mobile app gets idToken from Google SDK and sends it here for verification
router.post('/google/token', async (req: Request, res: Response) => {
  try {
    const { idToken, deviceName, deviceType } = req.body;
    
    if (!idToken) {
      return res.status(400).json({
        status: 'error',
        message: 'idToken is required',
      });
    }
    
    // Verify ID token using google-auth-library
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client();
    
    // Verify token against all client IDs (web, iOS, Android)
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [
        config.oauth.google.clientId,           // Web client ID
        config.oauth.google.iosClientId,        // iOS client ID
        config.oauth.google.androidClientId,    // Android client ID
      ].filter(Boolean), // Remove undefined values
    });
    
    const payload = ticket.getPayload();
    
    if (!payload || !payload.email) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid token payload',
      });
    }
    
    // Normalize to GoogleProfile format
    const profile = {
      id: payload.sub!,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture,
    };
    
    // Use same OAuth callback logic as web flow
    const result = await handleGoogleCallback(profile, idToken, undefined);
    
    // Extract device info
    const deviceInfo = extractDeviceInfo(req);
    
    // Override device info with client-provided values if available
    const finalDeviceInfo = {
      deviceType: (deviceType as 'ios' | 'android' | 'web') || deviceInfo.deviceType,
      deviceName: deviceName || deviceInfo.deviceName,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    };
    
    // Create session
    const session = await createSession({
      userId: result.user.id,
      ...finalDeviceInfo,
    });
    
    // Generate JWT
    const token = generateToken({
      userId: result.user.id,
      sessionId: session.id, // Use session.id (UUID), not session.token
    });
    
    logger.info({ 
      userId: result.user.id, 
      deviceType: finalDeviceInfo.deviceType 
    }, 'Mobile Google OAuth successful');
    
    // Return token and user info (JSON response for mobile)
    res.json({
      token,
      user: result.user,
      expiresAt: session.expiresAt.getTime(),
      isNewUser: result.isNewUser,
    });
  } catch (error) {
    logger.error({ err: error }, 'Google token exchange failed');
    res.status(500).json({
      status: 'error',
      message: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
    });
  }
});

// Apple OAuth - Start
router.get('/apple/start', (req: Request, res: Response) => {
  const redirectUri = req.query.redirect_uri as string;
  
  // Generate Apple OAuth URL
  const params = new URLSearchParams({
    client_id: config.oauth.apple.clientId,
    redirect_uri: config.oauth.apple.callbackUrl,
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope: 'name email',
    state: redirectUri ? JSON.stringify({ redirect_uri: redirectUri }) : '',
  });
  
  const authUrl = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  
  logger.info({ redirectUri }, 'Redirecting to Apple OAuth');
  res.redirect(authUrl);
});

// Apple OAuth - Callback (Web)
router.post('/apple/callback', async (req: Request, res: Response) => {
  try {
    const { code, id_token, user, state } = req.body;
    
    if (!id_token) {
      return res.status(400).json({
        status: 'error',
        message: 'id_token is required',
      });
    }
    
    // Verify Apple ID token using apple-signin-auth
    const appleSignin = require('apple-signin-auth');
    
    const payload = await appleSignin.verifyIdToken(id_token, {
      audience: config.oauth.apple.clientId,
      ignoreExpiration: false,
    });
    
    // Extract profile
    let displayName: string | undefined;
    let email = payload.email;
    
    // Apple only sends name on FIRST authorization (user object only sent once)
    if (user) {
      const userData = typeof user === 'string' ? JSON.parse(user) : user;
      if (userData.name) {
        displayName = `${userData.name.firstName || ''} ${userData.name.lastName || ''}`.trim();
      }
    }
    
    const profile = {
      sub: payload.sub,
      email: email,
      name: displayName ? { 
        firstName: displayName.split(' ')[0], 
        lastName: displayName.split(' ').slice(1).join(' ') 
      } : undefined,
    };
    
    // Use OAuth callback logic
    const result = await handleAppleCallback(profile, id_token);
    
    // Create session
    const deviceInfo = extractDeviceInfo(req);
    const session = await createSession({
      userId: result.user.id,
      ...deviceInfo,
    });
    
    // Generate JWT
    const token = generateToken({
      userId: result.user.id,
      sessionId: session.id, // Use session.id (UUID), not session.token
    });
    
    logger.info({ userId: result.user.id }, 'Apple OAuth callback successful');
    
    // Parse state for redirect_uri
    const stateObj = state ? JSON.parse(state) : {};
    const redirectUri = stateObj.redirect_uri || 'kazka://auth/apple/callback';
    
    // Redirect with token
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('token', token);
    callbackUrl.searchParams.set('isNewUser', result.isNewUser.toString());
    
    res.redirect(callbackUrl.toString());
  } catch (error) {
    logger.error({ err: error }, 'Apple OAuth callback failed');
    const errorUrl = new URL('kazka://auth/error');
    errorUrl.searchParams.set('message', 'Apple authentication failed');
    res.redirect(errorUrl.toString());
  }
});

// Apple OAuth - Mobile token exchange
// For React Native apps using @invertase/react-native-apple-authentication
router.post('/apple/token', async (req: Request, res: Response) => {
  try {
    const { identityToken, authorizationCode, user, deviceName, deviceType } = req.body;
    
    if (!identityToken) {
      return res.status(400).json({
        status: 'error',
        message: 'identityToken is required',
      });
    }
    
    // Verify Apple identity token
    const appleSignin = require('apple-signin-auth');
    
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: config.oauth.apple.clientId,
      ignoreExpiration: false,
    });
    
    if (!payload) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid identity token',
      });
    }
    
    // Extract profile
    let displayName: string | undefined;
    let email = payload.email;
    
    // Handle first-time user data (only sent once by Apple)
    if (user) {
      const userData = typeof user === 'string' ? JSON.parse(user) : user;
      if (userData.name) {
        displayName = `${userData.name.firstName || ''} ${userData.name.lastName || ''}`.trim();
      }
      if (userData.email) {
        email = userData.email;
      }
    }
    
    const profile = {
      sub: payload.sub,
      email: email,
      name: displayName ? { 
        firstName: displayName.split(' ')[0], 
        lastName: displayName.split(' ').slice(1).join(' ') 
      } : undefined,
    };
    
    // Use same OAuth callback logic
    const result = await handleAppleCallback(profile, identityToken);
    
    // Extract device info
    const deviceInfo = extractDeviceInfo(req);
    const finalDeviceInfo = {
      deviceType: (deviceType as 'ios' | 'android' | 'web') || deviceInfo.deviceType,
      deviceName: deviceName || deviceInfo.deviceName,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    };
    
    // Create session
    const session = await createSession({
      userId: result.user.id,
      ...finalDeviceInfo,
    });
    
    // Generate JWT
    const token = generateToken({
      userId: result.user.id,
      sessionId: session.id, // Use session.id (UUID), not session.token
    });
    
    logger.info({ 
      userId: result.user.id, 
      deviceType: finalDeviceInfo.deviceType 
    }, 'Mobile Apple OAuth successful');
    
    // Return token and user info
    res.json({
      token,
      user: result.user,
      expiresAt: session.expiresAt.getTime(),
      isNewUser: result.isNewUser,
    });
  } catch (error) {
    logger.error({ err: error }, 'Apple token exchange failed');
    res.status(500).json({
      status: 'error',
      message: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
    });
  }
});

// Delete all sessions (logout from all devices)
router.delete('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
      });
      return;
    }
    
    const deletedCount = await deleteAllUserSessions(req.user.id);
    
    logger.info({ userId: req.user.id, deletedCount }, 'User logged out from all devices');
    
    res.json({
      status: 'success',
      message: `Logged out from ${deletedCount} device(s)`,
      deletedCount,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Logout all failed');
    res.status(500).json({
      status: 'error',
      message: 'Logout failed',
    });
  }
});

// Delete current session (logout from current device)
router.delete('/sessions/current', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.sessionId) {
      res.status(400).json({
        status: 'error',
        message: 'No active session',
      });
      return;
    }
    
    await deleteSession(req.sessionId);
    
    logger.info({ userId: req.user?.id, sessionId: req.sessionId }, 'User logged out from current device');
    
    res.json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error({ err: error, sessionId: req.sessionId }, 'Logout failed');
    res.status(500).json({
      status: 'error',
      message: 'Logout failed',
    });
  }
});

// Legacy endpoint (deprecated)
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.sessionId) {
      res.status(400).json({
        status: 'error',
        message: 'No active session',
      });
      return;
    }
    
    await deleteSession(req.sessionId);
    
    logger.warn({ userId: req.user?.id }, 'Used deprecated POST /logout endpoint');
    
    res.json({
      status: 'success',
      message: 'Logged out successfully',
      deprecated: 'This endpoint is deprecated. Use DELETE /api/v1/auth/sessions/current instead',
    });
  } catch (error) {
    logger.error({ err: error }, 'Logout failed');
    res.status(500).json({
      status: 'error',
      message: 'Logout failed',
    });
  }
});

// Refresh current session token
router.put('/sessions/current', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.sessionId) {
      res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
      });
      return;
    }
    
    // Generate new JWT with same session
    const token = generateToken({
      userId: req.user.id,
      sessionId: req.sessionId,
    });
    
    logger.info({ userId: req.user.id, sessionId: req.sessionId }, 'Session token refreshed');
    
    res.json({
      token,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Token refresh failed');
    res.status(500).json({
      status: 'error',
      message: 'Token refresh failed',
    });
  }
});

// Legacy endpoint (deprecated)
router.post('/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.sessionId) {
      res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
      });
      return;
    }
    
    const token = generateToken({
      userId: req.user.id,
      sessionId: req.sessionId,
    });
    
    logger.warn({ userId: req.user.id }, 'Used deprecated POST /refresh endpoint');
    
    res.json({
      token,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      deprecated: 'This endpoint is deprecated. Use PUT /api/v1/auth/sessions/current instead',
    });
  } catch (error) {
    logger.error({ err: error }, 'Token refresh failed');
    res.status(500).json({
      status: 'error',
      message: 'Token refresh failed',
    });
  }
});

export default router;
