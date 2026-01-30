#!/usr/bin/env node
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 8081;
const API_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const METRO_PORT = process.env.METRO_PORT || 8082;

console.log('🔧 Starting development proxy server...');

// ВАЖЛИВО: Використовуємо умовну логіку через Express middleware
// щоб правильно маршрутизувати запити

// 1. Proxy для API запитів
// Express видаляє /api з req.url, тому додаємо його назад через pathRewrite
app.use('/api', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/(.*)': '/api/$1' // Додаємо /api назад: /v1/stories -> /api/v1/stories
  },
  logLevel: 'info',
  onProxyReq: (proxyReq, req) => {
    console.log(`[API] ${req.method} /api${req.url} → ${API_URL}/api${req.url}`);
  }
}));

// 2. Proxy для uploads (перетворює /uploads -> /api/v1/assets)
// Express видаляє /uploads з req.url, тому додаємо /api/v1/assets до всього шляху
app.use('/uploads', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: function (path, req) {
    // req.url вже без /uploads, наприклад: /development/userId/photos/...
    // Додаємо /api/v1/assets на початок
    return `/api/v1/assets${path}`;
  },
  logLevel: 'debug',
  onProxyReq: (proxyReq, req) => {
    const newPath = `/api/v1/assets${req.url}`;
    console.log(`[UPLOADS] GET /uploads${req.url} → ${API_URL}${newPath}`);
  },
  onProxyRes: (proxyRes, req) => {
    console.log(`[UPLOADS] GET /uploads${req.url} ← ${proxyRes.statusCode}`);
  }
}));

// 3. ВСЕ ІНШЕ -> Metro bundler (JS bundles, HTML, static assets)
app.use(createProxyMiddleware({
  target: `http://localhost:${METRO_PORT}`,
  changeOrigin: true,
  ws: true,
  logLevel: 'info',
  onProxyReq: (proxyReq, req) => {
    console.log(`[METRO] ${req.url} → localhost:${METRO_PORT}${req.url}`);
  },
  onError: (err, req, res) => {
    console.error(`[METRO ERROR] ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.status(502).send(`Metro bundler unavailable on port ${METRO_PORT}: ${err.message}`);
    }
  }
}));

// Перевірка чи порт вільний перед запуском
const server = app.listen(PORT, 'localhost', () => {
  console.log(`\n✅ Proxy server running on http://localhost:${PORT}`);
  console.log(`📡 API requests: /api/* → ${API_URL}/api/*`);
  console.log(`📷 Images: /uploads/* → ${API_URL}/api/v1/assets/*`);
  console.log(`📦 Metro bundler: /* → localhost:${METRO_PORT}/*\n`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' || err.code === 'EPERM') {
    console.error(`\n❌ Помилка: Порт ${PORT} зайнятий або недоступний`);
    console.error(`   Спробуйте:`);
    console.error(`   1. Зупинити інший процес на порту ${PORT}`);
    console.error(`   2. Або змінити PORT в proxy.js\n`);
    process.exit(1);
  }
  throw err;
});
