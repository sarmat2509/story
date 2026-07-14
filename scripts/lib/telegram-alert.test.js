'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildAdminAlert,
  buildDeployAlert,
  buildOpsAlert,
  deliverTelegramAlert,
  escapeHtml,
} = require('./telegram-alert');

function telegramResponse({ ok = true, status = 200, messageId = 42, description } = {}) {
  return {
    ok,
    status,
    async json() {
      return ok
        ? { ok: true, result: { message_id: messageId } }
        : { ok: false, description: description || 'unsupported method' };
    },
  };
}

test('escapeHtml protects dynamic alert values', () => {
  assert.equal(escapeHtml('<main & "dirty">'), '&lt;main &amp; &quot;dirty&quot;&gt;');
});

test('buildDeployAlert creates a structured success card and controls', () => {
  const alert = buildDeployAlert({
    phase: 'success',
    deployId: 'deploy-123',
    sourceSummary: 'main@abc123 (clean)',
    components: { api: true, web: true, migrations: true },
    drainMode: 'enabled',
    duration: '8m 42s',
    finishedAt: '2026-07-14 11:30:00 UTC',
  });

  assert.match(alert.richHtml, /<h2>✅ WonderTales · Production<\/h2>/);
  assert.match(alert.richHtml, /<table bordered striped>/);
  assert.match(alert.richHtml, /<details><summary>Technical details<\/summary>/);
  assert.match(alert.richHtml, /type="checkbox" checked/);
  assert.equal(alert.replyMarkup.inline_keyboard[0][1].style, 'success');
  assert.deepEqual(alert.replyMarkup.inline_keyboard[0][2].copy_text, { text: 'deploy-123' });
});

test('buildOpsAlert formats a polished production warning and groups details', () => {
  const alert = buildOpsAlert({
    severity: 'critical',
    failures: '1',
    warnings: '1',
    checkStatus: '1',
    titlePrefix: 'WonderTales production ops',
    report: [
      'FAIL public health endpoint is unavailable',
      'WARN backup smoke skipped',
      'PASS wondertales-api-prod is running (health=healthy, restarts=0)',
      'PASS root filesystem has 30000MB free (40% used)',
    ].join('\n'),
    fullReportHint: '/var/www/kazka/logs/production-ops-monitor.log',
  });

  assert.match(alert.richHtml, /<h2>🚨 WonderTales · Production<\/h2>/);
  assert.match(alert.richHtml, /<mark>CRITICAL<\/mark> <b>Operations check failed<\/b>/);
  assert.match(alert.richHtml, /❌ public health endpoint is unavailable/);
  assert.match(alert.richHtml, /<details><summary>Current state<\/summary>/);
  assert.match(alert.fallbackText, /^🚨 WonderTales · Production\nCRITICAL — Operations check failed/);
  assert.match(alert.fallbackText, /⚠️ backup smoke skipped/);
});

test('buildOpsAlert gives warnings an actionable subtitle', () => {
  const alert = buildOpsAlert({
    severity: 'warning',
    failures: '0',
    warnings: '1',
    checkStatus: '0',
    report: 'WARN backup smoke skipped',
  });

  assert.match(alert.richHtml, /<h2>⚠️ WonderTales · Production<\/h2>/);
  assert.match(
    alert.richHtml,
    /<mark>WARNING<\/mark> <b>Operations check needs attention<\/b>/
  );
  assert.match(
    alert.fallbackText,
    /^⚠️ WonderTales · Production\nWARNING — Operations check needs attention/
  );
});

test('buildAdminAlert produces an actionable dashboard card', () => {
  const alert = buildAdminAlert({
    severity: 'critical',
    titlePrefix: 'WonderTales admin dashboard',
    days: 7,
    source: 'test',
    findings: [
      {
        severity: 'critical',
        area: 'queue',
        title: 'Queue health is critical',
        detail: '3 failed jobs',
      },
    ],
  });

  assert.match(alert.richHtml, /⚙️ <b>Queue health is critical<\/b>/);
  assert.match(alert.richHtml, /<h2>🚨 WonderTales · Admin<\/h2>/);
  assert.match(alert.richHtml, /<mark>CRITICAL<\/mark> <b>Admin dashboard requires action<\/b>/);
  assert.match(alert.fallbackText, /^🚨 WonderTales · Admin\nCRITICAL — Admin dashboard requires action/);
  assert.equal(alert.replyMarkup.inline_keyboard[0][0].style, 'danger');
  assert.equal(
    alert.replyMarkup.inline_keyboard[0][0].url,
    'https://wondertales.art/admin/dashboard'
  );
});

test('deliverTelegramAlert sends rich messages first', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, payload: JSON.parse(init.body) });
    return telegramResponse({ messageId: 77 });
  };

  const result = await deliverTelegramAlert(
    {
      richHtml: '<h2>Healthy</h2>',
      fallbackText: 'Healthy',
      replyMarkup: {
        inline_keyboard: [
          [
            { text: 'Health', url: 'https://wondertales.art/health', style: 'success' },
            { text: 'Copy', copy_text: { text: 'deploy-123' } },
          ],
        ],
      },
    },
    { token: 'token', chatId: 'chat' },
    fetchImpl
  );

  assert.equal(result.mode, 'rich');
  assert.equal(result.action, 'sent');
  assert.equal(result.messageId, '77');
  assert.match(calls[0].url, /sendRichMessage$/);
  assert.equal(calls[0].payload.rich_message.html, '<h2>Healthy</h2>');
});

test('deliverTelegramAlert falls back to plain sendMessage', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, payload: JSON.parse(init.body) });
    if (url.endsWith('/sendRichMessage')) {
      return telegramResponse({ ok: false, status: 404 });
    }
    return telegramResponse({ messageId: 88 });
  };

  const result = await deliverTelegramAlert(
    {
      richHtml: '<h2>Healthy</h2>',
      fallbackText: 'Healthy',
      replyMarkup: {
        inline_keyboard: [
          [
            { text: 'Health', url: 'https://wondertales.art/health', style: 'success' },
            { text: 'Copy', copy_text: { text: 'deploy-123' } },
          ],
        ],
      },
    },
    { token: 'token', chatId: 'chat' },
    fetchImpl
  );

  assert.equal(result.mode, 'plain');
  assert.equal(result.messageId, '88');
  assert.match(calls[1].url, /sendMessage$/);
  assert.equal(calls[1].payload.text, 'Healthy');
  assert.deepEqual(calls[1].payload.reply_markup, {
    inline_keyboard: [[{ text: 'Health', url: 'https://wondertales.art/health' }]],
  });
});

test('deliverTelegramAlert edits the existing deploy message', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, payload: JSON.parse(init.body) });
    return telegramResponse({ messageId: 99 });
  };

  const result = await deliverTelegramAlert(
    { richHtml: '<h2>Completed</h2>', fallbackText: 'Completed' },
    { token: 'token', chatId: 'chat', messageId: '99' },
    fetchImpl
  );

  assert.equal(result.action, 'edited');
  assert.match(calls[0].url, /editMessageText$/);
  assert.equal(calls[0].payload.message_id, '99');
  assert.equal(calls[0].payload.rich_message.html, '<h2>Completed</h2>');
});

test('deliverTelegramAlert sends a new card if both edit formats fail', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, payload: JSON.parse(init.body) });
    if (calls.length <= 2) return telegramResponse({ ok: false, status: 400 });
    return telegramResponse({ messageId: 100 });
  };

  const result = await deliverTelegramAlert(
    { richHtml: '<h2>Failed</h2>', fallbackText: 'Failed' },
    { token: 'token', chatId: 'chat', messageId: '99' },
    fetchImpl
  );

  assert.equal(result.action, 'sent');
  assert.equal(result.mode, 'rich');
  assert.equal(result.messageId, '100');
  assert.match(calls[2].url, /sendRichMessage$/);
});
