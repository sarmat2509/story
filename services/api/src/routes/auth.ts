import { Router, Request, Response } from 'express';
import { z } from 'zod';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import config from '../config';
import {
  handleGoogleCallback,
  handleAppleCallback,
  handleGoogleParentGateCallback,
  handleAppleParentGateCallback,
  OAuthParentGateError,
  type GoogleProfile,
  type AppleProfile,
} from '../services/oauthService';
import { createSession, deleteSession, deleteAllUserSessions } from '../services/sessionService';
import { generateToken } from '../services/jwtService';
import { requireAuth, requireChildSession, requireParentSession } from '../middleware/authMiddleware';
import { logger } from '../utils/logger';
import { setSessionCookie, clearSessionCookie } from '../utils/sessionCookie';
import {
  loginWithPassword,
  register,
  requestPasswordReset,
  resetPassword,
} from '../services/authCredentialsService';
import { getUserByEmail } from '../services/userService';
import {
  recordRegistrationConsents,
  validateRegistrationConsents,
  type ConsentAuditContext,
} from '../services/consentService';
import { oauthLimiter, passwordResetLimiter } from '../middleware/rateLimiter';
import { CaptchaVerificationError, requireCaptcha } from '../services/captchaService';
import {
  parseParentGateOAuthState,
  ParentGateOAuthStateError,
} from '../services/oauthParentGateStateService';
import {
  ChildModePasscodeError,
  verifyChildModePasscode,
} from '../services/childModeControlsService';
import { toUserResponse } from '../utils/userResponse';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  captchaToken: z.string().max(4096).optional(),
});

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  termsAccepted: z.union([z.boolean(), z.string()]).optional(),
  privacyAccepted: z.union([z.boolean(), z.string()]).optional(),
  isAdultGuardian: z.union([z.boolean(), z.string()]).optional(),
  captchaToken: z.string().max(4096).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
  captchaToken: z.string().max(4096).optional(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

const parentGateSchema = z.object({
  password: z.string().min(4).max(128),
});

function sendCaptchaError(res: Response, error: unknown): boolean {
  if (!(error instanceof CaptchaVerificationError)) return false;
  res.status(error.statusCode).json({
    status: 'error',
    message: error.message,
    code: error.code,
  });
  return true;
}

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
          
          done(null, { profile: googleProfile, accessToken, refreshToken } as unknown as Express.User);
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

function buildConsentAuditContext(req: Request, source: string): ConsentAuditContext {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ipAddress =
    (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : null) ||
    req.socket.remoteAddress ||
    null;
  return {
    ipAddress,
    userAgent: req.headers['user-agent'] || null,
    context: { source },
  };
}

function hasConfiguredOAuthValue(value: string | undefined): boolean {
  const normalized = (value || '').trim().toLowerCase();
  return (
    normalized.length > 0 &&
    !normalized.startsWith('your_') &&
    !normalized.startsWith('your-') &&
    !normalized.includes('placeholder')
  );
}

function isAppleOAuthConfigured(): boolean {
  return hasConfiguredOAuthValue(config.oauth.apple.clientId);
}

function buildWebOAuthCallbackUrl(provider: 'google' | 'apple', token: string, options: {
  isNewUser?: boolean;
  parentGate?: boolean;
} = {}): URL {
  const callbackConfig =
    provider === 'google' ? config.oauth.google.callbackUrl : config.oauth.apple.callbackUrl;
  const cbUrl = new URL(callbackConfig);
  const callbackUrl = new URL(`${cbUrl.origin}/auth/${provider}/callback`);
  callbackUrl.searchParams.set('token', token);
  callbackUrl.searchParams.set('isNewUser', (options.isNewUser ?? false).toString());
  if (options.parentGate) {
    callbackUrl.searchParams.set('parentGate', 'true');
  }
  return callbackUrl;
}

function buildSafeOAuthCallbackLogContext(provider: 'google' | 'apple', callbackUrl: URL) {
  return {
    provider,
    callbackPath: callbackUrl.pathname,
    isNewUser: callbackUrl.searchParams.get('isNewUser') === 'true',
    parentGate: callbackUrl.searchParams.get('parentGate') === 'true',
  };
}

function buildWebAuthErrorUrl(provider: 'google' | 'apple', message: string, code?: string): URL {
  const callbackConfig =
    provider === 'google' ? config.oauth.google.callbackUrl : config.oauth.apple.callbackUrl;
  const cbUrl = new URL(callbackConfig);
  const errorUrl = new URL(`${cbUrl.origin}/auth/error`);
  errorUrl.searchParams.set('message', message);
  if (code) {
    errorUrl.searchParams.set('code', code);
  }
  return errorUrl;
}

function buildFinalDeviceInfo(req: Request, input?: { deviceName?: string; deviceType?: 'ios' | 'android' | 'web' }) {
  const deviceInfo = extractDeviceInfo(req);
  return {
    deviceType: input?.deviceType || deviceInfo.deviceType,
    deviceName: input?.deviceName || deviceInfo.deviceName,
    ipAddress: deviceInfo.ipAddress,
    userAgent: deviceInfo.userAgent,
  };
}

async function createParentGateSession(
  req: Request,
  parentUser: NonNullable<Request['user']>,
  previousChildSessionId: string,
  input?: { deviceName?: string; deviceType?: 'ios' | 'android' | 'web' }
) {
  const finalDeviceInfo = buildFinalDeviceInfo(req, input);
  const parentSession = await createSession({
    userId: parentUser.id,
    mode: 'parent',
    parentUserId: parentUser.id,
    ...finalDeviceInfo,
  });
  const token = generateToken({
    userId: parentUser.id,
    sessionId: parentSession.id,
  });

  await deleteSession(previousChildSessionId);

  logger.info({
    userId: parentUser.id,
    previousChildSessionId,
    parentSessionId: parentSession.id,
    childProfileId: req.childProfileId,
    deviceType: finalDeviceInfo.deviceType,
  }, 'Parent gate completed from child session');

  return {
    token,
    user: toUserResponse(parentUser),
    expiresAt: parentSession.expiresAt.getTime(),
    sessionMode: 'parent' as const,
  };
}

async function verifyGoogleIdTokenProfile(idToken: string): Promise<GoogleProfile> {
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client();

  const ticket = await client.verifyIdToken({
    idToken,
    audience: [
      config.oauth.google.clientId,
      config.oauth.google.iosClientId,
      config.oauth.google.androidClientId,
    ].filter(Boolean),
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email) {
    throw new Error('Invalid token payload');
  }

  return {
    id: payload.sub!,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture,
  };
}

async function verifyAppleIdentityTokenProfile(identityToken: string, user: unknown): Promise<AppleProfile> {
  const appleSignin = require('apple-signin-auth');

  const payload = await appleSignin.verifyIdToken(identityToken, {
    audience: config.oauth.apple.clientId,
    ignoreExpiration: false,
  });

  if (!payload) {
    throw new Error('Invalid identity token');
  }

  let displayName: string | undefined;
  let email = payload.email;

  if (user) {
    const userData = typeof user === 'string' ? JSON.parse(user) : user as any;
    if (userData.name) {
      displayName = `${userData.name.firstName || ''} ${userData.name.lastName || ''}`.trim();
    }
    if (userData.email) {
      email = userData.email;
    }
  }

  return {
    sub: payload.sub,
    email,
    name: displayName
      ? {
          firstName: displayName.split(' ')[0],
          lastName: displayName.split(' ').slice(1).join(' '),
        }
      : undefined,
  };
}

function getParentGateErrorCode(error: unknown): string | undefined {
  if (error instanceof OAuthParentGateError || error instanceof ParentGateOAuthStateError) {
    return error.code;
  }
  return undefined;
}

// Google OAuth - Start
router.get('/google/start', oauthLimiter, (req: Request, res: Response, next) => {
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })(req, res, next);
});

// Google OAuth - Callback
router.get(
  '/google/callback',
  oauthLimiter,
  passport.authenticate('google', { session: false, failureRedirect: '/auth/error' }),
  async (req: Request, res: Response) => {
    try {
      const { profile, accessToken, refreshToken } = req.user as any;

      const parentGateState = parseParentGateOAuthState(req.query.state, 'google');
      if (parentGateState) {
        const parentUser = await handleGoogleParentGateCallback(
          parentGateState.parentUserId,
          profile,
          accessToken,
          refreshToken
        );
        const gateResult = await createParentGateSession(
          req,
          parentUser,
          parentGateState.childSessionId
        );
        const callbackUrl = buildWebOAuthCallbackUrl('google', gateResult.token, {
          parentGate: true,
        });

        logger.info({
          userId: parentUser.id,
          ...buildSafeOAuthCallbackLogContext('google', callbackUrl),
        }, 'Google parent gate callback - redirecting to app callback');
        setSessionCookie(res, gateResult.token);
        res.redirect(callbackUrl.toString());
        return;
      }

      const result = await handleGoogleCallback(profile, accessToken, refreshToken);
      const deviceInfo = extractDeviceInfo(req);
      const session = await createSession({
        userId: result.user.id,
        ...deviceInfo,
      });
      const token = generateToken({
        userId: result.user.id,
        sessionId: session.id,
      });
      const callbackUrl = buildWebOAuthCallbackUrl('google', token, {
        isNewUser: result.isNewUser,
      });

      logger.info({
        userId: result.user.id,
        ...buildSafeOAuthCallbackLogContext('google', callbackUrl),
      }, 'OAuth callback - redirecting to app callback');
      setSessionCookie(res, token);
      res.redirect(callbackUrl.toString());
    } catch (error) {
      logger.error({ err: error }, 'Google OAuth callback failed');
      const errorUrl = buildWebAuthErrorUrl(
        'google',
        'Authentication failed',
        getParentGateErrorCode(error)
      );
      res.redirect(errorUrl.toString());
    }
  }
);

// Google OAuth - Mobile token exchange
// For React Native apps using @react-native-google-signin/google-signin
// Mobile app gets idToken from Google SDK and sends it here for verification
router.post('/google/token', oauthLimiter, async (req: Request, res: Response) => {
  try {
    const { idToken, deviceName, deviceType } = req.body;
    
    if (!idToken) {
      return res.status(400).json({
        status: 'error',
        message: 'idToken is required',
      });
    }
    
    const profile = await verifyGoogleIdTokenProfile(idToken);
    
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
    setSessionCookie(res, token);
    res.json({
      token,
      user: toUserResponse(result.user),
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
router.get('/apple/start', oauthLimiter, (req: Request, res: Response) => {
  if (!isAppleOAuthConfigured()) {
    return res.status(404).json({
      status: 'error',
      code: 'APPLE_OAUTH_NOT_CONFIGURED',
      message: 'Apple sign in is not configured',
    });
  }

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
router.post('/apple/callback', oauthLimiter, async (req: Request, res: Response) => {
  try {
    if (!isAppleOAuthConfigured()) {
      return res.status(404).json({
        status: 'error',
        code: 'APPLE_OAUTH_NOT_CONFIGURED',
        message: 'Apple sign in is not configured',
      });
    }

    const { code, id_token, user, state } = req.body;
    
    if (!id_token) {
      return res.status(400).json({
        status: 'error',
        message: 'id_token is required',
      });
    }
    
    const profile = await verifyAppleIdentityTokenProfile(id_token, user);

    const parentGateState = parseParentGateOAuthState(state, 'apple');
    if (parentGateState) {
      const parentUser = await handleAppleParentGateCallback(
        parentGateState.parentUserId,
        profile,
        id_token
      );
      const gateResult = await createParentGateSession(
        req,
        parentUser,
        parentGateState.childSessionId
      );
      const callbackUrl = parentGateState.redirectUri
        ? new URL(parentGateState.redirectUri)
        : buildWebOAuthCallbackUrl('apple', gateResult.token, { parentGate: true });
      callbackUrl.searchParams.set('token', gateResult.token);
      callbackUrl.searchParams.set('isNewUser', 'false');
      callbackUrl.searchParams.set('parentGate', 'true');

      logger.info({ userId: parentUser.id }, 'Apple parent gate callback successful');
      setSessionCookie(res, gateResult.token);
      res.redirect(callbackUrl.toString());
      return;
    }

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
    const redirectUri = stateObj.redirect_uri || 'wondertales://auth/apple/callback';
    
    // Redirect with token
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('token', token);
    callbackUrl.searchParams.set('isNewUser', result.isNewUser.toString());
    
    setSessionCookie(res, token);
    res.redirect(callbackUrl.toString());
  } catch (error) {
    logger.error({ err: error }, 'Apple OAuth callback failed');
    const errorUrl = new URL('wondertales://auth/error');
    errorUrl.searchParams.set('message', 'Apple authentication failed');
    const code = getParentGateErrorCode(error);
    if (code) {
      errorUrl.searchParams.set('code', code);
    }
    res.redirect(errorUrl.toString());
  }
});

// Apple OAuth - Mobile token exchange
// For React Native apps using @invertase/react-native-apple-authentication
router.post('/apple/token', oauthLimiter, async (req: Request, res: Response) => {
  try {
    if (!isAppleOAuthConfigured()) {
      return res.status(404).json({
        status: 'error',
        code: 'APPLE_OAUTH_NOT_CONFIGURED',
        message: 'Apple sign in is not configured',
      });
    }

    const { identityToken, authorizationCode, user, deviceName, deviceType } = req.body;
    
    if (!identityToken) {
      return res.status(400).json({
        status: 'error',
        message: 'identityToken is required',
      });
    }
    
    const profile = await verifyAppleIdentityTokenProfile(identityToken, user);
    
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
    setSessionCookie(res, token);
    res.json({
      token,
      user: toUserResponse(result.user),
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

// Create session (email/password login)
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }
    const { email, password, captchaToken } = validationResult.data;

    await requireCaptcha('login', captchaToken, req);

    const user = await loginWithPassword(email, password);
    if (!user) {
      const existing = await getUserByEmail(email);
      if (existing && !existing.passwordHash) {
        return res.status(400).json({
          status: 'error',
          message: 'Sign in with Google or Apple',
          code: 'OAUTH_ONLY',
        });
      }
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
    }

    const deviceInfo = extractDeviceInfo(req);
    const session = await createSession({
      userId: user.id,
      ...deviceInfo,
    });
    const token = generateToken({
      userId: user.id,
      sessionId: session.id,
    });

    logger.info({ userId: user.id }, 'Email login successful');
    setSessionCookie(res, token);
    res.json({
      token,
      user: toUserResponse(user),
      expiresAt: session.expiresAt.getTime(),
      isNewUser: false,
    });
  } catch (error) {
    if (sendCaptchaError(res, error)) return;
    logger.error({ err: error }, 'Email login failed');
    res.status(500).json({
      status: 'error',
      message: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
    });
  }
});

// Register (email/password)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validationResult = registerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }
    const { email, password, termsAccepted, privacyAccepted, isAdultGuardian, captchaToken } = validationResult.data;

    const missingConsents = validateRegistrationConsents({
      termsAccepted,
      privacyAccepted,
      isAdultGuardian,
    });
    if (missingConsents.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Required legal consent is missing',
        code: 'CONSENT_REQUIRED',
        missingConsents,
      });
    }

    await requireCaptcha('register', captchaToken, req);

    const { user, isNewUser } = await register(email, password);
    await recordRegistrationConsents(user.id, buildConsentAuditContext(req, 'email_register'));

    const deviceInfo = extractDeviceInfo(req);
    const session = await createSession({
      userId: user.id,
      ...deviceInfo,
    });
    const token = generateToken({
      userId: user.id,
      sessionId: session.id,
    });

    logger.info({ userId: user.id, isNewUser }, 'Registration successful');
    setSessionCookie(res, token);
    res.json({
      token,
      user: toUserResponse(user),
      expiresAt: session.expiresAt.getTime(),
      isNewUser,
    });
  } catch (error) {
    if (sendCaptchaError(res, error)) return;
    const err = error as Error;
    if (err.message === 'EMAIL_ALREADY_REGISTERED') {
      return res.status(409).json({
        status: 'error',
        message: 'Email already registered',
        code: 'EMAIL_ALREADY_REGISTERED',
      });
    }
    logger.error({ err: error }, 'Registration failed');
    res.status(500).json({
      status: 'error',
      message: 'Registration failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// Forgot password
router.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const validationResult = forgotPasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }
    const { email, captchaToken } = validationResult.data;

    await requireCaptcha('password_reset', captchaToken, req);

    await requestPasswordReset(email);

    res.json({
      status: 'success',
      message: 'If the email exists, you will receive a reset link',
    });
  } catch (error) {
    if (sendCaptchaError(res, error)) return;
    logger.error({ err: error }, 'Forgot password failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to process request',
    });
  }
});

// Reset password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const validationResult = resetPasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }
    const { token, password } = validationResult.data;

    const user = await resetPassword(token, password);

    logger.info({ userId: user.id }, 'Password reset successful');
    res.json({
      status: 'success',
      message: 'Password reset successfully',
    });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'INVALID_OR_EXPIRED_TOKEN') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset link',
        code: 'INVALID_OR_EXPIRED_TOKEN',
      });
    }
    logger.error({ err: error }, 'Reset password failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset password',
    });
  }
});

function sendPasscodeParentGateRequired(res: Response) {
  return res.status(410).json({
    status: 'error',
    message: 'Use the Child Mode exit passcode to return to the parent session',
    code: 'PARENT_GATE_PASSCODE_REQUIRED',
  });
}

router.post('/parent-gate/google/start', requireAuth, requireChildSession, (_req: Request, res: Response) => {
  return sendPasscodeParentGateRequired(res);
});

router.post('/parent-gate/apple/start', requireAuth, requireChildSession, (_req: Request, res: Response) => {
  return sendPasscodeParentGateRequired(res);
});

router.post('/parent-gate/google-token', requireAuth, requireChildSession, (_req: Request, res: Response) => {
  return sendPasscodeParentGateRequired(res);
});

router.post('/parent-gate/apple-token', requireAuth, requireChildSession, (_req: Request, res: Response) => {
  return sendPasscodeParentGateRequired(res);
});

// Parent gate: child session -> parent session via the per-child Child Mode exit passcode.
router.post('/parent-gate', requireAuth, requireChildSession, async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.sessionId || !req.childProfileId) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }

    const validationResult = parentGateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }

    await verifyChildModePasscode(
      req.user.id,
      req.childProfileId,
      validationResult.data.password
    );

    const gateResult = await createParentGateSession(req, req.user, req.sessionId);

    setSessionCookie(res, gateResult.token);
    res.json(gateResult);
  } catch (error) {
    if (error instanceof ChildModePasscodeError) {
      return res.status(error.statusCode).json({
        status: 'error',
        message: error.message,
        code: error.code,
      });
    }
    logger.error({ err: error, userId: req.user?.id, sessionId: req.sessionId }, 'Parent gate failed');
    res.status(500).json({
      status: 'error',
      message: 'Parent gate failed',
    });
  }
});

// Delete all sessions (logout from all devices)
router.delete('/sessions', requireAuth, requireParentSession, async (req: Request, res: Response) => {
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
    
    clearSessionCookie(res);
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
    
    clearSessionCookie(res);
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
    
    clearSessionCookie(res);
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
    
    setSessionCookie(res, token);
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
    
    setSessionCookie(res, token);
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
