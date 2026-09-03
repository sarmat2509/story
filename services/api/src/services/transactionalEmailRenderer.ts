export interface TransactionalEmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface TransactionalEmailAction {
  label: string;
  url: string;
}

export interface TransactionalEmailSection {
  title: string;
  body?: string;
  items?: string[];
  tone?: 'warm' | 'security' | 'neutral';
}

export interface TransactionalEmailNotice {
  text: string;
  tone?: 'info' | 'warning' | 'quiet';
}

export interface TransactionalEmailRenderInput {
  subject: string;
  preview: string;
  title: string;
  intro: string;
  action?: TransactionalEmailAction;
  sections?: TransactionalEmailSection[];
  notices?: TransactionalEmailNotice[];
  footer: string;
  supportEmail: string;
  brandName?: string;
  brandLogoUrl: string;
}

const BRAND_NAME = 'WonderTales';
const pageBackground = '#f5f1e9';
const cardBackground = '#ffffff';
const ink = '#1f2937';
const muted = '#6b7280';
const border = '#eadfcd';
const amber = '#f4b35f';
const blue = '#2563eb';
const green = '#0f766e';

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPreheader(preview: string): string {
  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
      ${escapeEmailHtml(preview)}
    </div>
  `;
}

function renderButton(action: TransactionalEmailAction): string {
  const label = escapeEmailHtml(action.label);
  const url = escapeEmailHtml(action.url);

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px;">
      <tr>
        <td bgcolor="${ink}" style="border-radius:10px;">
          <a href="${url}" style="display:inline-block;padding:14px 22px;font-family:Arial,sans-serif;font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:10px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:${muted};word-break:break-all;">
      ${url}
    </p>
  `;
}

function sectionAccent(tone: TransactionalEmailSection['tone']): string {
  if (tone === 'security') return blue;
  if (tone === 'neutral') return green;
  return amber;
}

function renderSection(section: TransactionalEmailSection): string {
  const items = section.items ?? [];
  const itemHtml = items
    .map(
      (item) => `
        <li style="margin:0 0 10px;padding-left:2px;">
          ${escapeEmailHtml(item)}
        </li>
      `
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 0;border:1px solid #eef0f3;border-left:4px solid ${sectionAccent(section.tone)};border-radius:10px;background:#fbfcfe;">
      <tr>
        <td style="padding:18px 18px 16px;">
          <h2 style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:17px;line-height:23px;color:${ink};">
            ${escapeEmailHtml(section.title)}
          </h2>
          ${
            section.body
              ? `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:22px;color:#4b5563;">${escapeEmailHtml(section.body)}</p>`
              : ''
          }
          ${
            itemHtml
              ? `<ul style="margin:0;padding:0 0 0 20px;font-family:Arial,sans-serif;font-size:14px;line-height:22px;color:#4b5563;">${itemHtml}</ul>`
              : ''
          }
        </td>
      </tr>
    </table>
  `;
}

function noticeStyle(tone: TransactionalEmailNotice['tone']): { bg: string; border: string } {
  if (tone === 'warning') return { bg: '#fff7ed', border: '#fed7aa' };
  if (tone === 'quiet') return { bg: '#f9fafb', border: '#e5e7eb' };
  return { bg: '#eff6ff', border: '#bfdbfe' };
}

function renderNotice(notice: TransactionalEmailNotice): string {
  const style = noticeStyle(notice.tone);
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0 0;background:${style.bg};border:1px solid ${style.border};border-radius:10px;">
      <tr>
        <td style="padding:15px 16px;font-family:Arial,sans-serif;font-size:14px;line-height:22px;color:#374151;">
          ${escapeEmailHtml(notice.text)}
        </td>
      </tr>
    </table>
  `;
}

function buildText(input: TransactionalEmailRenderInput): string {
  const lines: string[] = [
    input.title,
    '',
    input.intro,
  ];

  if (input.action) {
    lines.push('', `${input.action.label}: ${input.action.url}`);
  }

  for (const section of input.sections ?? []) {
    lines.push('', section.title);
    if (section.body) lines.push(section.body);
    for (const item of section.items ?? []) {
      lines.push(`- ${item}`);
    }
  }

  for (const notice of input.notices ?? []) {
    lines.push('', notice.text);
  }

  lines.push('', input.footer, `Support: ${input.supportEmail}`);

  return lines.join('\n');
}

export function renderTransactionalEmail(input: TransactionalEmailRenderInput): TransactionalEmailContent {
  const brandName = input.brandName ?? BRAND_NAME;
  const sections = (input.sections ?? []).map(renderSection).join('');
  const notices = (input.notices ?? []).map(renderNotice).join('');
  const action = input.action ? renderButton(input.action) : '';
  const supportEmail = escapeEmailHtml(input.supportEmail);
  const brandLogoUrl = escapeEmailHtml(input.brandLogoUrl);

  const html = `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeEmailHtml(input.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${pageBackground};">
    ${renderPreheader(input.preview)}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${pageBackground};margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:${cardBackground};border:1px solid ${border};border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:30px 32px;background:#fff8ed;border-bottom:1px solid ${border};">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="font-family:Arial,sans-serif;font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;color:#8a5a16;">
                        ${escapeEmailHtml(brandName)}
                      </div>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <img src="${brandLogoUrl}" width="44" height="44" alt="${escapeEmailHtml(brandName)}" style="display:block;width:44px;height:44px;border:0;border-radius:12px;object-fit:cover;">
                    </td>
                  </tr>
                </table>
                <h1 style="margin:20px 0 0;font-family:Arial,sans-serif;font-size:28px;line-height:34px;color:${ink};font-weight:800;">
                  ${escapeEmailHtml(input.title)}
                </h1>
                <p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:25px;color:#374151;">
                  ${escapeEmailHtml(input.intro)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px;">
                ${action}
                ${sections}
                ${notices}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eef0f3;font-family:Arial,sans-serif;font-size:12px;line-height:19px;color:${muted};">
                <p style="margin:0 0 8px;">${escapeEmailHtml(input.footer)}</p>
                <p style="margin:0;">
                  Need help? Reply to this email or contact
                  <a href="mailto:${supportEmail}" style="color:${blue};text-decoration:none;">${supportEmail}</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: input.subject,
    html,
    text: buildText(input),
  };
}
