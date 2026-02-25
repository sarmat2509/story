import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import assetsRoutes from './routes/assets';
import voicesRoutes from './routes/voices';
import uploadRoutes from './routes/upload';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter, authLimiter, apiLimiter } from './middleware/rateLimiter';
import { startSessionCleanupJob } from './services/sessionService';
import { startAllQueues } from './jobs/storyJobProcessor';
import { checkDatabaseHealth } from './db';
import { logger } from './utils/logger';

const app: Application = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Trust proxy - required for rate limiting behind Nginx reverse proxy
// Express will trust X-Forwarded-For headers from Nginx
app.set('trust proxy', true);

// Rate limiting
app.use(globalLimiter); // Apply global rate limit to all requests

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize passport
app.use(passport.initialize());

// Routes
// Health checks - no versioning (infrastructure)
app.use('/health', healthRoutes);

// API v1 routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/me', apiLimiter, userRoutes);
app.use('/api/v1/plans', plansRoutes); // Public
app.use('/api/v1/entitlements', apiLimiter, entitlementsRoutes);
app.use('/api/v1/dictionaries', dictionariesRoutes); // Public
app.use('/api/v1/children', apiLimiter, childrenRoutes);
app.use('/api/v1/characters', apiLimiter, charactersRoutes);
app.use('/api/v1/stories', apiLimiter, storiesRoutes); // M3: story generation
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
  logger.info({ port: PORT, env: config.nodeEnv }, 'Kazka+ API server started');
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
