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
import graphicNovelsRoutes from './routes/graphicNovels';
import mixedStoriesRoutes from './routes/mixedStories';
import imageValidationsRoutes from './routes/imageValidations';
import adminRoutes from './routes/admin';
import publicStoriesRoutes from './routes/publicStories';
import publicAuthorsRoutes from './routes/publicAuthors';
import publicUnlistedRoutes from './routes/publicUnlisted';
import meStoriesRoutes from './routes/meStories';
import meArtifactsRoutes from './routes/meArtifacts';
import meMapTilesRoutes from './routes/meMapTiles';
import ssrStoriesRoutes from './routes/ssrStories';
import ssrUnlistedRoutes from './routes/ssrUnlisted';
import ssrAuthorsRoutes from './routes/ssrAuthors';
import ssrLandingRoutes from './routes/ssrLanding';
import ssrPricingRoutes from './routes/ssrPricing';
import ssrLegalRoutes from './routes/ssrLegal';
import ssrSupportRoutes from './routes/ssrSupport';
import ssrBlogRoutes from './routes/ssrBlog';
import shareCardRoutes from './routes/shareCard';
import sitemapRoute from './routes/sitemap';
import billingRoutes from './routes/billing';
import bundlesRoutes from './routes/bundles';
import billingWebhookRoutes from './routes/billingWebhook';
import assetsRoutes from './routes/assets';
import voicesRoutes from './routes/voices';
import uploadRoutes from './routes/upload';
import feedbackRoutes from './routes/feedback';
import opsRoutes from './routes/ops';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import {
  globalLimiter,
  authLimiter,
  apiLimiter,
  billingLimiter,
  storyWriteLimiter,
  uploadLimiter,
} from './middleware/rateLimiter';
import { caseTransformMiddleware } from './middleware/caseTransform';
import { startSessionCleanupJob } from './services/sessionService';
import { startAllQueues } from './jobs/storyJobProcessor';
import { startBatchImageWorker } from './jobs/batchImageWorkerJob';
import { startScheduledContinuationScheduler } from './jobs/scheduledContinuationSchedulerJob';
import { startOrphanStorageCleanupScheduler } from './jobs/orphanStorageCleanupSchedulerJob';
import { startBillingReminderScheduler } from './jobs/billingReminderSchedulerJob';
import { checkDatabaseHealth } from './db';
import { logger } from './utils/logger';

const app: Application = express();

function normalizeOrigin(value: string | undefined | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function splitCorsAllowedOrigins(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map(normalizeOrigin)
    .filter((origin): origin is string => !!origin);
}

const allowedCorsOrigins = new Set([
  ...splitCorsAllowedOrigins(config.web.corsAllowedOrigins),
  ...splitCorsAllowedOrigins(config.web.webAppUrl),
]);

function isLocalDevelopmentOrigin(origin: string): boolean {
  if (config.nodeEnv === 'production') return false;
  try {
    const { protocol, hostname } = new URL(origin);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname === '::1')
    );
  } catch {
    return false;
  }
}

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  // No Origin header: server-to-server, mobile runtimes, curl, and health probes.
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  return allowedCorsOrigins.has(normalizedOrigin) || isLocalDevelopmentOrigin(normalizedOrigin);
}

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
const posthogSources = ['https://*.i.posthog.com', 'https://*.posthog.com'];
const turnstileSources = ['https://challenges.cloudflare.com'];
const apiConnectSources = [
  "'self'",
  ...localhostSources,
  ...posthogSources,
  ...turnstileSources,
  ...(isLocalDev ? ['https:', 'wss:'] : []),
];
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", ...(webAppOrigin ? [webAppOrigin] : []), ...posthogSources, ...turnstileSources],
      scriptSrcElem: ["'self'", "'unsafe-inline'", ...(webAppOrigin ? [webAppOrigin] : []), ...posthogSources, ...turnstileSources],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:', ...(isLocalDev ? ['http://localhost', 'http://localhost:*'] : [])],
      connectSrc: apiConnectSources,
      fontSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:', ...(isLocalDev ? ['http://localhost', 'http://localhost:*'] : [])],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", ...turnstileSources],
    },
  },
}));
app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedCorsOrigin(origin));
  },
  credentials: true,
}));

// Trust proxy - required for rate limiting behind Nginx reverse proxy
// Trust only the first proxy (Nginx) to prevent X-Forwarded-For spoofing
app.set('trust proxy', 1);

// Rate limiting
app.use(globalLimiter); // Apply global rate limit to all requests

// Stripe webhook needs raw body for signature verification (before json parser)
app.use('/api/v1/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookRoutes);

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

// Sitemap - public, no auth, no rate limit
app.use('/sitemap.xml', sitemapRoute);

app.get(['/.well-known/security.txt', '/security.txt'], (_req, res) => {
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const expires = new Date(Date.now() + oneYearMs)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  res
    .type('text/plain; charset=utf-8')
    .set('Cache-Control', 'public, max-age=3600')
    .send([
      `Contact: mailto:${config.web.supportEmail}`,
      `Expires: ${expires}`,
      'Preferred-Languages: en, uk, ru',
      'Canonical: https://wondertales.art/.well-known/security.txt',
      '',
    ].join('\n'));
});

// API v1 routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/me', apiLimiter, userRoutes);
app.use('/api/v1/me/stories', apiLimiter, meStoriesRoutes);
app.use('/api/v1/me/artifacts', apiLimiter, meArtifactsRoutes);
app.use('/api/v1/me/map-tiles', apiLimiter, meMapTilesRoutes);
app.use('/api/v1/plans', plansRoutes); // Public
app.use('/api/v1/ops', apiLimiter, opsRoutes); // Public operational status
app.use('/api/v1/entitlements', apiLimiter, entitlementsRoutes);
app.use('/api/v1/dictionaries', dictionariesRoutes); // Public
app.use('/api/v1/children', apiLimiter, childrenRoutes);
app.use('/api/v1/characters', apiLimiter, charactersRoutes);
app.use('/api/v1/stories', storyWriteLimiter, apiLimiter, storiesRoutes); // M3: story generation
app.use('/api/v1/graphic-novels', storyWriteLimiter, apiLimiter, graphicNovelsRoutes);
app.use('/api/v1/mixed-stories', storyWriteLimiter, apiLimiter, mixedStoriesRoutes);
app.use('/api/v1/image-validations', apiLimiter, imageValidationsRoutes);
app.use('/api/v1/admin', apiLimiter, adminRoutes);
app.use('/api/v1/public/stories', apiLimiter, publicStoriesRoutes); // Public catalog + single story
app.use('/api/v1/public/authors', apiLimiter, publicAuthorsRoutes); // Public author pages
app.use('/api/v1/public/u', apiLimiter, publicUnlistedRoutes); // Unlisted by token
app.use('/ssr/stories', ssrStoriesRoutes); // SSR HTML (no auth, cached)
app.use('/ssr/u', ssrUnlistedRoutes); // SSR for unlisted
app.use('/ssr/authors', ssrAuthorsRoutes); // SSR for public author pages
app.use('/ssr/landing', ssrLandingRoutes); // Static landing page for SEO
app.use('/ssr/pricing', ssrPricingRoutes); // Static pricing page for SEO
app.use('/ssr/legal', ssrLegalRoutes); // Terms of Service, Privacy Policy
app.use('/ssr/support', ssrSupportRoutes); // Support/contact page
app.use('/ssr/blog', ssrBlogRoutes); // Static blog pages for SEO
app.use('/share-card', apiLimiter, shareCardRoutes); // og:image 1200×630
app.use('/api/v1/assets', apiLimiter, assetsRoutes); // M4: asset serving (local dev)
app.use('/api/v1/voices', apiLimiter, voicesRoutes); // M5: TTS voices
app.use('/api/v1/upload', uploadLimiter, apiLimiter, uploadRoutes); // M6: photo upload
app.use('/api/v1/feedback', feedbackRoutes); // Feedback has its own rate limiter
app.use('/api/v1/billing', billingLimiter, apiLimiter, billingRoutes); // M1: Stripe checkout, portal, bundle checkout
app.use('/api/v1/bundles', apiLimiter, bundlesRoutes);
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

const server = config.queue.runHttpServer
  ? app.listen(PORT, async () => {
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

      if (config.queue.runWorkers) {
        // Start all job queues (text, image, audio + legacy)
        startAllQueues();
        logger.info('All job queues started');
      } else {
        logger.info('API job workers disabled by RUN_JOB_WORKERS=false');
      }

      if (config.queue.runWorkers) {
        // Start batch image worker for scheduled continuations
        startBatchImageWorker();

        // Start scheduled continuation scheduler (hourly)
        startScheduledContinuationScheduler();

        // Start orphan storage cleanup scheduler when explicitly enabled
        startOrphanStorageCleanupScheduler();

        // Send two-day renewal reminders and retry discount assignment emails.
        startBillingReminderScheduler();
      }
    })
  : null;

if (!config.queue.runHttpServer) {
  logger.info('HTTP server disabled by RUN_HTTP_SERVER=false');
}

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
