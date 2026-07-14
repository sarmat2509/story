import { buildAbsoluteRouteUrl, escapeHtml, normalizePublicSeoLocale } from '@wondertales/shared';
import { config } from '../config';
import type { AdminAppReleaseDetail } from '../repositories/AppReleaseRepository';

function resolveUrl(value: string, baseUrl: string): string {
  return value.startsWith('https://') ? value : buildAbsoluteRouteUrl(baseUrl, value);
}

export function renderAppReleaseEmailPreview(
  release: AdminAppReleaseDetail,
  requestedLocale?: string | null
): string {
  const locale = normalizePublicSeoLocale(requestedLocale);
  const translation = release.translations.find((item) => item.locale === locale);
  if (!translation) throw new Error(`Missing ${locale} release localization`);
  const mediaById = new Map(release.media.map((media) => [media.id, media]));
  const baseUrl = (config.web?.webAppUrl || 'https://wondertales.art').replace(/\/$/, '');

  const body = translation.emailBody
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h2 style="margin:30px 0 12px;color:#221a3d;font-size:25px;line-height:1.2">${escapeHtml(block.text)}</h2>`;
        case 'paragraph':
          return `<p style="margin:0 0 18px;color:#514968;font-size:17px;line-height:1.7">${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>`;
        case 'list':
          return `<ul style="margin:0 0 22px;padding-left:24px;color:#514968;font-size:17px;line-height:1.7">${block.items.map((item) => `<li style="margin:7px 0">${escapeHtml(item)}</li>`).join('')}</ul>`;
        case 'button':
          return `<p style="margin:28px 0"><a href="${escapeHtml(resolveUrl(block.url, baseUrl))}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#7d67d2;color:#fff;text-decoration:none;font-weight:800">${escapeHtml(block.label)}</a></p>`;
        case 'image': {
          const media = mediaById.get(block.mediaId);
          if (!media) return '';
          const caption = block.caption
            ? `<figcaption style="padding:10px 6px 0;color:#776e8b;font-size:13px;line-height:1.5">${escapeHtml(block.caption)}</figcaption>`
            : '';
          return `<figure style="margin:26px 0"><img src="${escapeHtml(resolveUrl(media.publicUrl, baseUrl))}" alt="${escapeHtml(block.alt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:20px">${caption}</figure>`;
        }
      }
    })
    .join('');

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(translation.emailSubject)}</title></head><body style="margin:0;background:#f5f1fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(translation.emailPreheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1fb"><tr><td align="center" style="padding:30px 12px"><table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border-radius:26px"><tr><td style="padding:38px 34px"><p style="margin:0 0 18px;color:#7d67d2;font-weight:900">WonderTales</p><h1 style="margin:0 0 24px;color:#17122d;font-size:34px;line-height:1.12">${escapeHtml(translation.title)}</h1>${body}<p style="margin:34px 0 0;color:#958da5;font-size:12px">WonderTales · ${escapeHtml(release.releaseDate)}</p></td></tr></table></td></tr></table></body></html>`;
}
