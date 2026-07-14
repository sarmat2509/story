#!/usr/bin/env node

'use strict';

const DEFAULT_APP_URL = 'https://wondertales.art';
const DEFAULT_HEALTH_URL = `${DEFAULT_APP_URL}/health`;
const DEFAULT_PRODUCTION_TITLE = 'WonderTales · Production';
const DEFAULT_ADMIN_TITLE = 'WonderTales · Admin';
const RICH_MESSAGE_LIMIT = 32_000;
const PLAIN_MESSAGE_LIMIT = 3_900;

function text(value) {
  return value == null ? '' : String(value);
}

function escapeHtml(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function compactLine(line) {
  return text(line)
    .replace(/^(?:PASS|WARN|FAIL) /, '')
    .trim();
}

function truncatePlain(value, limit = PLAIN_MESSAGE_LIMIT) {
  const input = text(value);
  if (input.length <= limit) return input;
  return `${input.slice(0, Math.max(0, limit - 15))}\n… truncated`;
}

function tableHtml(rows, options = {}) {
  const attributes = [
    options.bordered === false ? '' : 'bordered',
    options.striped === false ? '' : 'striped',
  ]
    .filter(Boolean)
    .join(' ');
  const body = rows
    .filter((row) => row && row[1] != null && text(row[1]).length > 0)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  return `<table${attributes ? ` ${attributes}` : ''}>${body}</table>`;
}

function listHtml(items, { checked = false } = {}) {
  if (!items.length) return '';
  return `<ul>${items
    .map(
      (item) => `<li>${checked ? '<input type="checkbox" checked>' : ''}${escapeHtml(item)}</li>`
    )
    .join('')}</ul>`;
}

function createReplyMarkup(buttons) {
  const visibleButtons = buttons.filter(Boolean);
  if (!visibleButtons.length) return undefined;
  return { inline_keyboard: [visibleButtons] };
}

function statusPresentation(severity) {
  switch (severity) {
    case 'critical':
    case 'failure':
      return { icon: '🚨', label: 'CRITICAL', buttonStyle: 'danger' };
    case 'warning':
      return { icon: '⚠️', label: 'WARNING', buttonStyle: 'danger' };
    case 'success':
      return { icon: '✅', label: 'COMPLETED', buttonStyle: 'success' };
    case 'progress':
      return { icon: '🚀', label: 'IN PROGRESS', buttonStyle: 'primary' };
    default:
      return { icon: 'ℹ️', label: 'INFO', buttonStyle: 'primary' };
  }
}

function alertTitle(value, fallback, legacyTitles = []) {
  const candidate = text(value).trim();
  if (!candidate || legacyTitles.includes(candidate)) return fallback;
  return candidate;
}

function opsEventTitle(severity) {
  if (severity === 'critical' || severity === 'failure') return 'Operations check failed';
  if (severity === 'warning') return 'Operations check needs attention';
  if (severity === 'success') return 'Operations check passed';
  return 'Operations status update';
}

function adminEventTitle(severity, findingCount) {
  if (severity === 'critical') return 'Admin dashboard requires action';
  if (severity === 'warning') return 'Admin dashboard needs attention';
  return findingCount > 0 ? 'Admin dashboard update' : 'Admin dashboard is clear';
}

function alertIntroHtml(presentation, title, eventTitle) {
  return [
    `<h2>${presentation.icon} ${escapeHtml(title)}</h2>`,
    `<p><mark>${presentation.label}</mark> <b>${escapeHtml(eventTitle)}</b></p>`,
  ];
}

function alertIntroLines(presentation, title, eventTitle) {
  return [`${presentation.icon} ${title}`, `${presentation.label} — ${eventTitle}`];
}

function selectedDeployComponents(components = {}) {
  const labels = [
    ['api', 'API'],
    ['web', 'Web'],
    ['migrations', 'Migrations'],
    ['artifacts', 'Story artifacts'],
    ['outfits', 'Outfits'],
    ['nginx', 'Nginx'],
  ];
  const selected = labels.filter(([key]) => components[key] === true).map(([, label]) => label);
  return selected.length ? selected : ['No components selected'];
}

function buildDeployAlert(options = {}) {
  const phase = options.phase || 'start';
  const presentation = statusPresentation(
    phase === 'success' ? 'success' : phase === 'failure' ? 'failure' : 'progress'
  );
  const phaseTitle =
    phase === 'success'
      ? 'Deploy completed'
      : phase === 'failure'
        ? 'Deploy failed'
        : 'Deploy started';
  const components = selectedDeployComponents(options.components);
  const appUrl = options.appUrl || DEFAULT_APP_URL;
  const healthUrl = options.healthUrl || DEFAULT_HEALTH_URL;

  const summaryRows = [
    ['Environment', 'Production'],
    ['Deploy', options.deployId],
    ['Source', options.sourceSummary],
    ['Components', components.join(' · ')],
    phase !== 'start' ? ['Duration', options.duration] : null,
  ].filter(Boolean);

  const detailRows = [
    ['Target', options.target || 'wondertales.art'],
    ['Drain', options.drainMode || 'not applicable'],
    phase === 'failure' ? ['Failed step', options.failedStep] : null,
    phase === 'failure' ? ['Exit code', options.exitCode] : null,
  ].filter(Boolean);

  const richHtml = [
    ...alertIntroHtml(presentation, DEFAULT_PRODUCTION_TITLE, phaseTitle),
    tableHtml(summaryRows),
    '<hr/>',
    `<h3>${phase === 'failure' ? 'Failed deployment scope' : 'Deployment scope'}</h3>`,
    listHtml(components, { checked: phase === 'success' }),
    `<details><summary>Technical details</summary>${tableHtml(detailRows, { striped: false })}</details>`,
    `<footer>${escapeHtml(phase === 'start' ? `Started ${options.startedAt || ''}` : `Finished ${options.finishedAt || ''}`)}</footer>`,
  ].join('');

  const fallbackLines = [
    ...alertIntroLines(presentation, DEFAULT_PRODUCTION_TITLE, phaseTitle),
    '',
    `Deploy: ${options.deployId || '-'}`,
    `Source: ${options.sourceSummary || '-'}`,
    `Components: ${components.join(', ')}`,
    `Drain: ${options.drainMode || 'not applicable'}`,
  ];
  if (phase !== 'start') fallbackLines.push(`Duration: ${options.duration || '-'}`);
  if (phase === 'failure') {
    fallbackLines.push(
      `Failed step: ${options.failedStep || '-'}`,
      `Exit code: ${options.exitCode || '-'}`
    );
  }
  fallbackLines.push(
    `${phase === 'start' ? 'Started' : 'Finished'}: ${phase === 'start' ? options.startedAt || '-' : options.finishedAt || '-'}`
  );

  return {
    kind: 'deploy',
    phase,
    richHtml,
    fallbackText: fallbackLines.join('\n'),
    text: fallbackLines.join('\n'),
    replyMarkup: createReplyMarkup([
      { text: 'Open WonderTales', url: appUrl, style: 'primary' },
      { text: 'Health check', url: healthUrl, style: presentation.buttonStyle },
      options.deployId
        ? { text: 'Copy deploy ID', copy_text: { text: text(options.deployId) } }
        : null,
    ]),
  };
}

function summarizeService(line) {
  const match = text(line).match(
    /^PASS ((?:wondertales|shared)-[a-z-]+(?:-prod)?) is running \(health=([^,]+), restarts=([^)]+)\)/
  );
  if (!match) return null;
  const name = match[1]
    .replace(/^wondertales-/, '')
    .replace(/^shared-/, 'shared ')
    .replace(/-prod$/, '');
  return `${name}: ${match[2] === 'none' ? 'up' : match[2]}, restarts ${match[3]}`;
}

function buildOpsAlert(options = {}) {
  const report = text(options.report);
  const lines = report.split(/\r?\n/).filter(Boolean);
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || '';
  const severity = options.severity || 'info';
  const presentation = statusPresentation(severity);
  const failures = text(options.failures || '0');
  const warnings = text(options.warnings || '0');
  const checkStatus = text(options.checkStatus || '0');
  const appUrl = options.appUrl || DEFAULT_APP_URL;
  const healthUrl = options.healthUrl || DEFAULT_HEALTH_URL;
  const title = alertTitle(options.titlePrefix, DEFAULT_PRODUCTION_TITLE, [
    'WonderTales production ops',
  ]);
  const eventTitle = opsEventTitle(severity);

  const problems = lines
    .filter((line) => /^(FAIL|WARN) /.test(line))
    .map((line) => ({
      icon: line.startsWith('FAIL ') ? '❌' : '⚠️',
      text: compactLine(line),
    }));

  const services = lines.map(summarizeService).filter(Boolean);
  const stateRows = [
    services.length ? ['Services', services.join(' · ')] : null,
    compactLine(findLine(/^PASS root filesystem has /))
      ? ['Disk', compactLine(findLine(/^PASS root filesystem has /))]
      : null,
    compactLine(findLine(/^PASS recent database backup file exists /))
      ? ['Database backups', compactLine(findLine(/^PASS recent database backup file exists /))]
      : null,
    compactLine(findLine(/^PASS recent upload-volume backup archive exists /))
      ? [
          'Upload backups',
          compactLine(findLine(/^PASS recent upload-volume backup archive exists /)),
        ]
      : null,
    compactLine(findLine(/^PASS api Stripe secret key mode /))
      ? ['Payments', compactLine(findLine(/^PASS api Stripe secret key mode /))]
      : null,
    compactLine(findLine(/^PASS recent api webapp logs /))
      ? ['Logs', compactLine(findLine(/^PASS recent api webapp logs /))]
      : null,
    compactLine(findLine(/^PASS recent shared-nginx-proxy logs /))
      ? ['Ingress logs', compactLine(findLine(/^PASS recent shared-nginx-proxy logs /))]
      : null,
  ].filter(Boolean);

  const richSections = [
    ...alertIntroHtml(presentation, title, eventTitle),
    tableHtml([
      ['Environment', 'Production'],
      ['Failures', failures],
      ['Warnings', warnings],
      ['Exit code', checkStatus],
    ]),
  ];

  if (problems.length) {
    richSections.push(
      '<hr/>',
      '<h3>Needs attention</h3>',
      `<ul>${problems.map((problem) => `<li>${problem.icon} ${escapeHtml(problem.text)}</li>`).join('')}</ul>`
    );
  }

  if (stateRows.length) {
    richSections.push(
      `<details><summary>Current state</summary>${tableHtml(stateRows, { striped: false })}</details>`
    );
  }

  if (options.includeFullReport) {
    const tailLines = Number.parseInt(text(options.tailLines || '80'), 10);
    const tail = lines
      .slice(Math.max(0, lines.length - tailLines))
      .join('\n')
      .slice(0, 20_000);
    richSections.push(
      `<details><summary>Full technical report</summary><pre>${escapeHtml(tail)}</pre></details>`
    );
  }
  if (options.fullReportHint)
    richSections.push(`<footer>${escapeHtml(options.fullReportHint)}</footer>`);

  const fallbackLines = [
    ...alertIntroLines(presentation, title, eventTitle),
    `Failures ${failures} · Warnings ${warnings} · Exit ${checkStatus}`,
    '',
    'Needs attention',
    ...(problems.length
      ? problems.map((problem) => `${problem.icon} ${problem.text}`)
      : ['✅ None']),
  ];
  if (stateRows.length) {
    fallbackLines.push(
      '',
      'Current state',
      ...stateRows.map(([label, value]) => `${label}: ${value}`)
    );
  }
  if (options.fullReportHint) fallbackLines.push('', text(options.fullReportHint));

  const fallbackText = truncatePlain(fallbackLines.join('\n'));
  return {
    kind: 'ops',
    severity,
    richHtml: richSections.join(''),
    fallbackText,
    text: fallbackText,
    replyMarkup: createReplyMarkup([
      { text: 'Open WonderTales', url: appUrl, style: 'primary' },
      { text: 'Health check', url: healthUrl, style: presentation.buttonStyle },
    ]),
  };
}

function buildAdminAlert(options = {}) {
  const findings = Array.isArray(options.findings) ? options.findings : [];
  const severity = options.severity || 'info';
  const presentation = statusPresentation(severity);
  const appUrl = options.appUrl || DEFAULT_APP_URL;
  const dashboardUrl = `${appUrl.replace(/\/$/, '')}/admin/dashboard`;
  const areaIcons = { cost: '💳', queue: '⚙️', quality: '🖼️', test: '🧪' };
  const title = alertTitle(options.titlePrefix, DEFAULT_ADMIN_TITLE, [
    'WonderTales admin dashboard',
  ]);
  const eventTitle = adminEventTitle(severity, findings.length);

  const richSections = [
    ...alertIntroHtml(presentation, title, eventTitle),
    tableHtml([
      ['Environment', 'Production'],
      ['Findings', findings.length],
      ['Window', options.days ? `${options.days} days` : 'Current'],
    ]),
  ];

  if (findings.length) {
    richSections.push(
      '<hr/>',
      '<h3>Needs attention</h3>',
      `<ul>${findings
        .map((finding) => {
          const icon = areaIcons[finding.area] || '•';
          const detail = finding.detail ? ` — ${escapeHtml(finding.detail)}` : '';
          return `<li>${icon} <b>${escapeHtml(finding.title || finding.area || 'Alert')}</b>${detail}</li>`;
        })
        .join('')}</ul>`
    );
  } else {
    richSections.push('<p>✅ No active admin dashboard alerts.</p>');
  }

  if (options.source) {
    richSections.push(
      `<details><summary>Technical details</summary>${tableHtml([['Source', options.source]], { striped: false })}</details>`
    );
  }

  const fallbackLines = [
    ...alertIntroLines(presentation, title, eventTitle),
    `Findings: ${findings.length}`,
    '',
    ...(findings.length
      ? findings.map((finding) => {
          const icon = areaIcons[finding.area] || '•';
          return `${icon} [${finding.severity || severity}] ${finding.area || 'alert'}: ${finding.title || 'Alert'}${finding.detail ? ` — ${finding.detail}` : ''}`;
        })
      : ['✅ No active admin dashboard alerts.']),
  ];
  if (options.source) fallbackLines.push('', `Source: ${options.source}`);

  const fallbackText = truncatePlain(fallbackLines.join('\n'));
  return {
    kind: 'admin',
    severity,
    richHtml: richSections.join(''),
    fallbackText,
    text: fallbackText,
    replyMarkup: createReplyMarkup([
      {
        text: 'Open admin dashboard',
        url: dashboardUrl,
        style: severity === 'critical' || severity === 'warning' ? 'danger' : 'primary',
      },
    ]),
  };
}

function isRichEligible(alert, richMessagesEnabled) {
  return (
    richMessagesEnabled &&
    typeof alert?.richHtml === 'string' &&
    alert.richHtml.length > 0 &&
    alert.richHtml.length <= RICH_MESSAGE_LIMIT
  );
}

async function telegramRequest({ token, method, payload, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`${method} request failed: ${error?.message || error}`);
  } finally {
    clearTimeout(timeout);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${method} returned invalid JSON (HTTP ${response.status})`);
  }
  if (!response.ok || body?.ok !== true) {
    throw new Error(`${method} failed: ${body?.description || `HTTP ${response.status}`}`);
  }
  return body.result;
}

function withReplyMarkup(payload, replyMarkup) {
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return payload;
}

function legacyReplyMarkup(replyMarkup) {
  if (!replyMarkup?.inline_keyboard) return replyMarkup;
  const inlineKeyboard = replyMarkup.inline_keyboard
    .map((row) =>
      row
        .filter((button) => !button.copy_text)
        .map(({ style: _style, icon_custom_emoji_id: _icon, ...button }) => button)
    )
    .filter((row) => row.length > 0);
  return inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : undefined;
}

async function deliverTelegramAlert(alert, config = {}, fetchImpl = globalThis.fetch) {
  const token = text(config.token);
  const chatId = text(config.chatId);
  const timeoutMs = Number.parseInt(text(config.timeoutMs || '15000'), 10);
  const richMessagesEnabled = config.richMessagesEnabled !== false;
  const existingMessageId = text(config.messageId);

  if (!token) throw new Error('Telegram bot token is required');
  if (!chatId) throw new Error('Telegram chat id is required');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required');

  const fallbackText = truncatePlain(alert?.fallbackText || alert?.text || 'WonderTales alert');
  const fallbackReplyMarkup = legacyReplyMarkup(alert?.replyMarkup);
  const attempts = [];
  const request = async (method, payload, mode, action) => {
    try {
      const result = await telegramRequest({ token, method, payload, fetchImpl, timeoutMs });
      return {
        ok: true,
        mode,
        action,
        messageId: text(result?.message_id || existingMessageId),
        attempts,
      };
    } catch (error) {
      attempts.push({ method, error: error?.message || text(error) });
      return null;
    }
  };

  if (existingMessageId) {
    if (isRichEligible(alert, richMessagesEnabled)) {
      const result = await request(
        'editMessageText',
        withReplyMarkup(
          {
            chat_id: chatId,
            message_id: existingMessageId,
            rich_message: { html: alert.richHtml },
          },
          alert.replyMarkup
        ),
        'rich',
        'edited'
      );
      if (result) return result;
    }

    const plainEdit = await request(
      'editMessageText',
      withReplyMarkup(
        {
          chat_id: chatId,
          message_id: existingMessageId,
          text: fallbackText,
          link_preview_options: { is_disabled: true },
        },
        fallbackReplyMarkup
      ),
      'plain',
      'edited'
    );
    if (plainEdit) return plainEdit;
  }

  if (isRichEligible(alert, richMessagesEnabled)) {
    const richSend = await request(
      'sendRichMessage',
      withReplyMarkup(
        {
          chat_id: chatId,
          rich_message: { html: alert.richHtml },
        },
        alert.replyMarkup
      ),
      'rich',
      'sent'
    );
    if (richSend) return richSend;
  }

  const plainSend = await request(
    'sendMessage',
    withReplyMarkup(
      {
        chat_id: chatId,
        text: fallbackText,
        link_preview_options: { is_disabled: true },
      },
      fallbackReplyMarkup
    ),
    'plain',
    'sent'
  );
  if (plainSend) return plainSend;

  throw new Error(
    `Telegram alert delivery failed: ${attempts.map((attempt) => attempt.error).join('; ')}`
  );
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readAlertInput() {
  if (process.env.TELEGRAM_ALERT_PAYLOAD_BASE64) {
    return JSON.parse(
      Buffer.from(process.env.TELEGRAM_ALERT_PAYLOAD_BASE64, 'base64').toString('utf8')
    );
  }
  const input = await readStdin();
  if (!input.trim()) throw new Error('Telegram alert payload is required on stdin');
  return JSON.parse(input);
}

async function runCli() {
  const command = process.argv[2] || 'deliver';
  const alert = await readAlertInput();

  if (command === 'preview') {
    console.log('Rich message HTML');
    console.log(alert.richHtml || '(not available)');
    console.log('\nFallback text');
    console.log(alert.fallbackText || alert.text || '(not available)');
    console.log('\nReply markup');
    console.log(JSON.stringify(alert.replyMarkup || {}, null, 2));
    return;
  }

  if (command !== 'deliver') throw new Error(`Unknown command: ${command}`);

  const result = await deliverTelegramAlert(alert, {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    messageId: process.env.TELEGRAM_ALERT_MESSAGE_ID,
    timeoutMs: process.env.TELEGRAM_ALERT_TIMEOUT_MS,
    richMessagesEnabled: process.env.TELEGRAM_RICH_MESSAGES_ENABLED !== 'false',
  });
  console.log(JSON.stringify(result));
}

module.exports = {
  buildAdminAlert,
  buildDeployAlert,
  buildOpsAlert,
  deliverTelegramAlert,
  escapeHtml,
  truncatePlain,
};

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
