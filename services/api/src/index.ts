import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import config from './config';
import healthRoutes from './routes/health';
import indexRoutes from './routes/index';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import plansRoutes from './routes/plans';
import entitlementsRoutes from './routes/entitlements';
import dictionariesRoutes from './routes/dictionaries';
import childrenRoutes from './routes/children';
import charactersRoutes from './routes/characters';
import storiesRoutes from './routes/stories';
import publicStoriesRoutes from './routes/publicStories';
import publicUnlistedRoutes from './routes/publicUnlisted';
import meStoriesRoutes from './routes/meStories';
import ssrStoriesRoutes from './routes/ssrStories';
import ssrUnlistedRoutes from './routes/ssrUnlisted';
import shareCardRoutes from './routes/shareCard';
import assetsRoutes from './routes/assets';
import voicesRoutes from './routes/voices';
import uploadRoutes from './routes/upload';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter, authLimiter, apiLimiter } from './middleware/rateLimiter';
import { caseTransformMiddleware } from './middleware/caseTransform';
import { startSessionCleanupJob } from './services/sessionService';
import { startAllQueues } from './jobs/storyJobProcessor';
import { checkDatabaseHealth } from './db';
import { logger } from './utils/logger';

const app: Application = express();

// Security middleware
// CSP is configured to allow SSR hydration:
// - 'unsafe-inline' for window.__INITIAL_STORY__ injection
// - webAppUrl for the Metro/SPA bundle script src
const webAppOrigin = (config.web?.webAppUrl || '').replace(/\/$/, '');
// In local development nginx runs on port 80 (mapped to 8081 on the host).
// Metro generates source-map and HMR URLs relative to the Host header it receives.
// To avoid CSP violations for http://localhost (port 80) requests we allow the
// full localhost origin space when WEB_APP_URL points to localhost.
const isLocalDev = webAppOrigin.includes('localhost') || webAppOrigin.includes('127.0.0.1');
const localhostSources = isLocalDev
  ? ['http://localhost', 'http://localhost:*', 'ws://localhost', 'ws://localhost:*']
  : [];
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", ...(webAppOrigin ? [webAppOrigin] : [])],
      scriptSrcElem: ["'self'", "'unsafe-inline'", ...(webAppOrigin ? [webAppOrigin] : [])],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:', ...(isLocalDev ? ['http://localhost', 'http://localhost:*'] : [])],
      connectSrc: ["'self'", 'https:', 'wss:', ...localhostSources],
      fontSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:', ...(isLocalDev ? ['http://localhost', 'http://localhost:*'] : [])],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(cors({
  origin: true,
  credentials: true,
}));

// Trust proxy - required for rate limiting behind Nginx reverse proxy
// Trust only the first proxy (Nginx) to prevent X-Forwarded-For spoofing
app.set('trust proxy', 1);

// Rate limiting
app.use(globalLimiter); // Apply global rate limit to all requests

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Case transformation (snake_case ↔ camelCase)
app.use(caseTransformMiddleware);

// Initialize passport
app.use(passport.initialize());

// Routes
// Health checks - no versioning (infrastructure)
app.use('/health', healthRoutes);

// API v1 routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/me', apiLimiter, userRoutes);
app.use('/api/v1/me/stories', apiLimiter, meStoriesRoutes);
app.use('/api/v1/plans', plansRoutes); // Public
app.use('/api/v1/entitlements', apiLimiter, entitlementsRoutes);
app.use('/api/v1/dictionaries', dictionariesRoutes); // Public
app.use('/api/v1/children', apiLimiter, childrenRoutes);
app.use('/api/v1/characters', apiLimiter, charactersRoutes);
app.use('/api/v1/stories', apiLimiter, storiesRoutes); // M3: story generation
app.use('/api/v1/public/stories', apiLimiter, publicStoriesRoutes); // Public catalog + single story
app.use('/api/v1/public/u', apiLimiter, publicUnlistedRoutes); // Unlisted by token
app.use('/ssr/stories', ssrStoriesRoutes); // SSR HTML (no auth, cached)
app.use('/ssr/u', ssrUnlistedRoutes); // SSR for unlisted
app.use('/share-card', apiLimiter, shareCardRoutes); // og:image 1200×630
app.use('/api/v1/assets', apiLimiter, assetsRoutes); // M4: asset serving (local dev)
app.use('/api/v1/voices', apiLimiter, voicesRoutes); // M5: TTS voices
app.use('/api/v1/upload', apiLimiter, uploadRoutes); // M6: photo upload
app.use('/api/v1', indexRoutes);

// Root redirect to API
app.get('/', (req, res) => {
  res.redirect('/api/v1');
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = config.port;

const server = app.listen(PORT, async () => {
  logger.info({ port: PORT, env: config.nodeEnv }, 'WonderTales API server started');
  logger.info({ url: `http://localhost:${PORT}/health` }, 'Health check available');
  
  // Check database connection
  const dbHealthy = await checkDatabaseHealth();
  if (dbHealthy) {
    logger.info('Database connection established');
  } else {
    logger.error('Database connection failed');
  }
  
  // Start session cleanup job
  startSessionCleanupJob();
  
  // Start all job queues (text, image, audio + legacy)
  startAllQueues();
  logger.info('All job queues started');
});

/**
 * Close the HTTP server gracefully (stops accepting new connections).
 * Called during graceful shutdown before closing the DB pool.
 */
export function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error closing HTTP server');
        reject(err);
      } else {
        logger.info('HTTP server closed');
        resolve();
      }
    });
  });
}

export default app;
