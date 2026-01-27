import pino from 'pino';

// Create logger instance
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  
  // Pretty print in development
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
  
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
});

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
