import pino from 'pino';
import path from 'path';
import fs from 'fs';

// Create logs directory
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define streams
const streams: pino.StreamEntry[] = [];

// Stream 1: Console output
if (process.env.NODE_ENV === 'development') {
  // Pretty print in development
  streams.push({
    level: 'debug',
    stream: pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    }),
  });
} else {
  // JSON to stdout in production (for docker logs)
  streams.push({
    level: (process.env.LOG_LEVEL || 'info') as pino.Level,
    stream: process.stdout,
  });
}

// Stream 2: JSON file with rotation (always)
streams.push({
  level: (process.env.LOG_LEVEL || 'debug') as pino.Level,
  stream: pino.destination({
    dest: path.join(logsDir, 'app.log'),
    sync: false, // Async for performance
    mkdir: true,
  }),
});

// Create logger instance
export const logger = pino(
  {
    level: 'debug',
    
    // Base configuration
    base: {
      env: process.env.NODE_ENV || 'development',
    },
    
    // Serializers for common objects
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },
    
    // Redact sensitive information
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
      ],
      censor: '[REDACTED]',
    },
  },
  pino.multistream(streams)
);

// Create child logger with context
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

// Helper functions for common log patterns
export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error({ err: error, ...context }, error.message);
};

export const logAuth = (action: string, userId?: string, context?: Record<string, any>) => {
  logger.info({ action, userId, ...context }, `Auth: ${action}`);
};

export const logDatabase = (query: string, duration: number, context?: Record<string, any>) => {
  logger.debug({ query, duration, ...context }, 'Database query executed');
};

export const logOAuth = (provider: string, action: string, context?: Record<string, any>) => {
  logger.info({ provider, action, ...context }, `OAuth ${provider}: ${action}`);
};

export default logger;
