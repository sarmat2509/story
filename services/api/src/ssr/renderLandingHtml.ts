/**
 * Render landing page as static HTML for SEO
 * Served at /ssr/landing, proxied by nginx at / (homepage)
 */

import { config } from '../config';

/** Plan with stories/audio/images limits for landing display */
interface PlanWithLimits {
  slug: string;
  name: string;
  priceMonthly: number;
  pricingCurrency: string;
  storiesPerMonth: number;
  audioStoriesPerMonth: number;
  imagesPerStory: number;
}

/** Inline SVG icons for trust chips (currentColor = inherits white from .trust-chip) */
const TRUST_CHIP_ICONS = {
  safe: '<svg width="20" height="20" class="trust-chip-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 17.2C22 18.1 21.75 18.95 21.3 19.67C20.47 21.06 18.95 22 17.2 22C15.45 22 13.92 21.06 13.1 19.67C12.66 18.95 12.4 18.1 12.4 17.2C12.4 14.55 14.55 12.4 17.2 12.4C19.85 12.4 22 14.55 22 17.2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.33 17.2l1.18 1.18 3.56-2.36" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 8.69C22 10.66 21.49 12.4 20.69 13.91c-.88-.93-2.12-1.51-3.49-1.51-2.65 0-4.8 2.15-4.8 4.8 0 .9.25 1.75.69 2.47-.37.17-.71.31-1.01.41-.34.12-.9.12-1.24 0-2.9-.99-9.36-5.12-9.36-12.12 0-3.09 2.49-5.59 5.56-5.59 1.81 0 3.43.88 4.44 2.23 1.01-1.35 2.63-2.23 4.44-2.23 3.07 0 5.56 2.5 5.56 5.59z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  audio: '<svg width="20" height="20" class="trust-chip-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 1C9.79 1 8 2.79 8 5v7c0 2.21 1.79 4 4 4s4-1.79 4-4V5c0-2.21-1.79-4-4-4zm-2 4c0-1.1.9-2 2-2s2 .9 2 2v7c0 1.1-.9 2-2 2s-2-.9-2-2V5z" fill="currentColor"/><path d="M5 9c.55 0 1 .45 1 1v2c0 1.59.63 3.12 1.76 4.24 1.12 1.12 2.65 1.76 4.24 1.76s3.12-.64 4.24-1.76c1.12-1.12 1.76-2.65 1.76-4.24v-2c0-.55.45-1 1-1s1 .45 1 1v2c0 2.12-.84 4.16-2.34 5.66-1.5 1.5-3.54 2.34-5.66 2.34s-4.16-.84-5.66-2.34C4.84 16.16 4 14.12 4 12v-2c0-.55.45-1 1-1z" fill="currentColor"/></svg>',
  personalized: '<svg width="20" height="20" class="trust-chip-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="m15 5 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  languages: '<svg width="20" height="20" class="trust-chip-icon-svg" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M478.33 433.6l-90-218a22 22 0 0 0-40.67 0l-90 218a22 22 0 1 0 40.67 16.79L316.66 406H419.33l18.33 44.39A22 22 0 0 0 458 464a22 22 0 0 0 20.32-30.4zM334.83 362 368 281.65 401.17 362z"/><path fill="currentColor" d="M267.84 342.92a22 22 0 0 0-4.89-30.7c-.2-.15-15-11.13-36.49-34.73 39.65-53.68 62.11-114.75 71.27-143.49H330a22 22 0 0 0 0-44H214V70a22 22 0 0 0-44 0V90H54a22 22 0 0 0 0 44h197.25c-9.52 26.95-27.05 69.5-53.79 108.36-31.41-41.68-43.08-68.65-43.17-68.87a22 22 0 0 0-40.58 17c.58 1.38 14.55 34.23 52.86 83.93.92 1.19 1.83 2.35 2.74 3.51-39.24 44.35-77.74 71.86-93.85 80.74a22 22 0 1 0 21.07 38.63c2.16-1.18 48.6-26.89 101.63-85.59 22.52 24.08 38 35.44 38.93 36.1a22 22 0 0 0 30.75-4.9z"/></svg>',
  ready: '<svg width="20" height="20" class="trust-chip-icon-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M15.75 2.66c.16-.18.25-.41.25-.66V1c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v1c0 .25.09.48.25.66C4.02 4.19 1 8.24 1 13c0 6.08 4.92 11 11 11s11-4.92 11-11c0-4.76-3.02-8.81-7.25-10.34zM12 22c-4.96 0-9-4.04-9-9s4.04-9 9-9 9 4.04 9 9-4.04 9-9 9z"/><path fill="currentColor" d="M19 14c0 .55-.45 1-1 1h-6c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v5h5c.55 0 1 .45 1 1z"/></svg>',
};

const LANDING_STYLES = `
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:0;line-height:1.6;color:#1e293b}
.landing-wrapper{min-height:100vh;background-color:#f5e6f0;background-image:url('/sparkles-overlay.webp');background-repeat:repeat;background-size:contain;}
.landing{max-width:1200px;margin:0 auto;padding:0 24px 80px}
.brand{display:flex;align-items:center;justify-content:center;margin-bottom:20px;}
.brand img{height:60px;width:auto;display:block}
.hero{text-align:center;padding:20px 24px 64px; }
.hero-content{display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;position:relative;}
.hero h1{font-size:42px;font-weight:700;color:#1e293b;line-height:1.2;max-width:680px;margin:0 auto 16px;}
.hero h1 span{color:#8b7cb8;}
.hero .subheadline{font-size:18px;color:#222;max-width:660px;margin:0 auto 32px;line-height:1.6;}
.cta-purple{background:#8b7cb8;color:#fff;border:none;border-radius:9999px;padding:12px 24px;font-size:16px;font-weight:600;text-decoration:none;display:inline-block}
.cta-purple:hover{background:#7a6ba8}
.cta-purple-outline{background:transparent;color:#8b7cb8;border:2px solid #8b7cb8;border-radius:9999px;padding:12px 24px;font-size:16px;font-weight:600;text-decoration:none;display:inline-block}
.cta-purple-outline:hover{background:rgba(139,124,184,0.1)}
.actions{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;z-index:10;position:relative;}
.hero .microcopy{font-size:14px;color:#64748b;margin-top:16px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap}
.trust-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:32px}
.trust-chip{position:absolute;display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:rgba(0,0,0,0.25);border:3px solid rgba(255,255,255,0.8);border-radius:9999px;font-size:18px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.06);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);}
.trust-chip .trust-chip-icon{display:inline-flex;align-items:center;flex-shrink:0}
.trust-chip .trust-chip-icon-svg{width:20px;height:20px;color:inherit}
.trust-chip--safe{top:35%;left:15%;}
.trust-chip--audio{top:30%;right:10%;}
.trust-chip--personalized{bottom:12%;left:7%;}
.trust-chip--languages{bottom:15%;right:5%;}
.trust-chip--ready{bottom:18%;left:50%;transform:translateX(-50%);}
.hero-mockup{margin:-260px -200px -30px;position:relative;}
.hero-mockup img{display:block;width:100%;height:auto;}
.section{margin-bottom:64px;padding-top:16px}
.section h2{font-size:32px;font-weight:700;color:#1e293b;margin:0 0 12px;text-align:center}
.section .section-subtitle{text-wrap:balance;font-size:18px;color:#64748b;text-align:center;max-width:640px;margin:0 auto 32px;line-height:1.6}
.value-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-bottom:32px}
.value-card{background:rgba(255,255,255,0.15);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);border-radius:16px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden}
.value-card .value-card-image{height:180px;margin:-24px -24px 16px -24px;overflow:hidden;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}
.value-card .value-card-image img{width:100%;height:100%;object-fit:cover;display:block}
.value-card h3{font-size:18px;font-weight:600;color:#1e293b;margin:0 0 12px;text-wrap:balance;}
.value-card p{font-size:14px;color:#64748b;margin:0;line-height:1.6}
.flow-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start;margin-bottom:32px}
.flow-step{background:rgba(255,255,255,0.9);border-radius:12px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,0.05);text-align:center;position:relative}
.flow-step .flow-step-num{display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:#8b7cb8;color:#fff;border-radius:50%;font-size:18px;font-weight:600;margin:0 auto 12px}
.flow-step h3{font-size:16px;font-weight:600;color:#1e293b;margin:0 0 8px}
.flow-step p{font-size:14px;color:#64748b;margin:0}
.flow-step .flow-placeholder{background:#e8e4f3;height:100px;border-radius:8px;margin-bottom:12px;display:flex;align-items:center;justify-content:center;color:#8b7cb8;font-size:12px}
.filter-pills{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:24px}
.filter-pill{padding:8px 16px;border-radius:9999px;font-size:14px;font-weight:500;text-decoration:none;border:1px solid #e2e8f0;background:#fff;color:#1e293b;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
.filter-pill.active{background:#8b7cb8;color:#fff;border-color:#8b7cb8}
.story-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-bottom:32px}
.story-card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
.story-card .story-illustration{height:200px;background:linear-gradient(135deg,#e8e4f3,#f5e6f0);display:flex;align-items:center;justify-content:center;color:#8b7cb8;font-size:14px;overflow:hidden}
.story-card .story-illustration img{width:100%;height:100%;object-fit:cover;display:block}
.story-card .story-info{padding:20px}
.story-card .story-title{font-size:16px;font-weight:600;color:#1e293b;margin-bottom:12px;line-height:1.4}
.story-card .story-meta-badges{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.story-card .story-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#475569;padding:6px 10px;border-radius:999px;background:#f8fafc}
.story-card .story-badge-icon{font-size:13px;line-height:1}
.story-card .story-badge-label{font-weight:600}
.story-card .story-badge-value{color:#0f172a}
.story-card .story-card-cta{display:inline-flex;align-items:center;justify-content:center;padding:8px 14px;border-radius:999px;border:1.5px solid #8b7cb8;background:transparent;color:#8b7cb8;font-size:13px;font-weight:600;text-decoration:none}
.story-card .story-card-cta:hover{background:rgba(139,124,184,0.08)}
.benefit-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-bottom:32px}
.benefit-card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden}
.benefit-card .benefit-card-image{height:180px;margin:-24px -24px 16px -24px;overflow:hidden;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}
.benefit-card .benefit-card-image img{width:100%;height:100%;object-fit:cover;display:block}
.benefit-card h3{font-size:18px;font-weight:600;color:#1e293b;margin:0 0 12px}
.benefit-card p{font-size:14px;color:#64748b;margin:0;line-height:1.6}
.benefit-card .benefit-placeholder{height:120px;background:linear-gradient(135deg,#e8e4f3,#f5e6f0);border-radius:8px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;color:#8b7cb8;font-size:12px}
.feature-sticky{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:48px;align-items:start;margin-bottom:32px}
.feature-sticky-titles{position:sticky;top:24px}
.feature-sticky-title-item{padding:20px 0;border-bottom:1px solid #cdcdcd;cursor:pointer;transition:color 0.2s}
.feature-sticky-title-item:first-child{padding-top:0}
.feature-sticky-title-item:hover{color:#8b7cb8}
.feature-sticky-title-item.active{color:#8b7cb8;font-weight:600}
.feature-sticky-title-item h3{font-size:18px;font-weight:600;color:inherit;margin:0}
.feature-sticky-cards{display:flex;flex-direction:column;gap:32px}
.feature-sticky-card{scroll-margin-top:24px}
.feature-sticky-card-inner{background:rgba(255,255,255,0.9);backdrop-filter:blur(8px);border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.05);overflow:hidden}
.feature-sticky-card-inner .feature-item-image{width:100%;aspect-ratio:4/3;overflow:hidden;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}
.feature-sticky-card-inner .feature-item-image img{width:100%;height:100%;object-fit:cover;display:block}
.feature-sticky-card-inner .feature-item-content{padding:20px 24px}
.feature-sticky-card-inner p{font-size:15px;color:#64748b;margin:0;line-height:1.6}
.safety-container{max-width: 800px;margin: 0 auto;background:rgba(255,255,255,0.85);backdrop-filter:blur(12px);border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.06);margin-bottom:32px}
.safety-points{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.safety-point{display:flex;align-items:center;gap:12px;color:#475569;font-size:15px}
.safety-point::before{content:"✓";color:#10b981;font-weight:700;font-size:18px}
.multilingual-bullets{max-width:360px;margin:0 auto 32px;list-style:none;padding:0}
.multilingual-bullets li{display:flex;align-items:center;gap:12px;margin-bottom:16px;color:#64748b;font-size:16px}
.multilingual-bullets li::before{content:"🌐";font-size:20px}
.voice-cards{position:relative;width:100%;max-width:1000px;margin:0 auto 48px;min-height:480px;padding:0 20px}
.voice-card{position:absolute;width:280px;background:#fff;border-radius:16px;padding:16px 20px;box-shadow:0 4px 24px rgba(0,0,0,0.08);display:flex;align-items:center;gap:14px}
.voice-card .voice-avatar{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#e8e4f3,#f5e6f0);flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.voice-card .voice-avatar-img{width:100%;height:100%;object-fit:cover}
.voice-card .voice-avatar-fallback{color:#8b7cb8;font-size:20px;font-weight:600}
.voice-card .voice-info{flex:1;min-width:0}
.voice-card .voice-name{font-size:16px;font-weight:600;color:#1e293b;margin:0 0 4px}
.voice-card .voice-play{width:44px;height:44px;border-radius:50%;background:#8b7cb8;color:#fff;border:none;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;transition:background 0.2s}
.voice-card .voice-play.playing{background:#7a6ba8}
.voice-card .voice-play:hover{background:#7a6ba8}
.voice-card .voice-play:disabled{opacity:0.5;cursor:not-allowed}
.testimonial-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-bottom:32px}
.testimonial-card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
.testimonial-card .quote{font-size:16px;line-height:1.6;color:#475569;margin:0 0 12px;font-style:italic}
.testimonial-card .author{font-size:14px;color:#64748b;margin:0}
.plans-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-bottom:24px}
.plan-card{background:#fff;border-radius:16px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center;position:relative;display:flex;flex-direction:column}
.plan-card.featured{border:2px solid #8b7cb8;box-shadow:0 4px 24px rgba(139,124,184,0.2)}
.plan-card .plan-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#8b7cb8;color:#fff;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600}
.plan-card .plan-name{font-size:20px;font-weight:600;color:#1e293b;margin-bottom:8px}
.plan-card .plan-price{font-size:32px;font-weight:700;color:#1e293b;margin-bottom:12px}
.plan-card .plan-desc{font-size:14px;color:#64748b;margin-bottom:20px;line-height:1.5;flex:1}
.plan-card .plan-cta{margin-top:auto;padding-top:16px}
.pricing-reassurance{text-align:center;font-size:14px;color:#64748b;margin-bottom:24px}
.faq-list{max-width:720px;margin:0 auto 32px}
.faq-accordion-item{border-radius:12px;margin-bottom:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);background:#fff}
.faq-accordion-item summary{display:flex;align-items:center;gap:12px;padding:20px;font-weight:600;color:#1e293b;background:#f8fafc;font-size:16px;cursor:pointer;list-style:none}
.faq-accordion-item summary::-webkit-details-marker{display:none}
.faq-accordion-item summary::before{content:"";flex-shrink:0;width:20px;height:20px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat center;transition:transform 0.2s}
.faq-accordion-item[open] summary::before{transform:rotate(180deg)}
.faq-accordion-item[open] summary{border-bottom:1px solid #e2e8f0}
.faq-accordion-item .faq-a{padding:20px;color:#64748b;font-size:14px;line-height:1.6}
.faq-accordion-item .faq-a a{color:#0ea5e9;text-decoration:underline}
.faq-accordion-item .faq-a a:hover{color:#0284c7}
.final-cta{text-align:center;padding:64px 24px}
.final-cta h2{font-size:36px;font-weight:700;color:#1e293b;margin:0 0 16px;line-height:1.3}
.final-cta .final-subheadline{font-size:18px;color:#64748b;max-width:560px;margin:0 auto 32px;line-height:1.6}
.final-cta .trust-line{font-size:14px;color:#94a3b8;margin-top:24px}
.cta-block{text-align:center;margin-top:32px}
@media(max-width:900px){.value-cards,.benefit-cards{grid-template-columns:repeat(2,1fr)}.flow-steps{grid-template-columns:repeat(2,1fr)}.plans-grid{grid-template-columns:repeat(2,1fr)}.story-cards,.testimonial-cards{grid-template-columns:1fr}.voice-cards{position:static;min-height:0;display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.voice-card{position:static;width:100%;left:auto;top:auto;margin:0}.feature-sticky{grid-template-columns:1fr}.feature-sticky-titles{position:static}}
@media(max-width:600px){.hero h2{font-size:28px}.value-cards,.benefit-cards,.flow-steps,.safety-points{grid-template-columns:1fr}.plans-grid,.story-cards,.testimonial-cards{grid-template-columns:1fr}.voice-cards{grid-template-columns:1fr}.announcement-bar{flex-direction:column;gap:12px}.feature-sticky-card-inner .feature-item-image{aspect-ratio:4/3}}
@media(prefers-reduced-motion:reduce){.faq-accordion-item summary::before{transition:none}}
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderAnnouncementBar(webAppUrl: string): string {
  return `
  <div class="announcement-bar">
    
    <div class="nav-links">
      <a href="${escapeHtml(webAppUrl)}/stories">Приклади історій</a>
      <a href="${escapeHtml(webAppUrl)}/pricing">Тарифи</a>
      <a href="${escapeHtml(webAppUrl)}/welcome" class="cta-purple">Реєстрація →</a>
    </div>
  </div>`;
}

function renderHero(webAppUrl: string): string {
  return `
  <section class="hero">
    <div class="brand">
      <img src="/logo.webp" alt="Wonder Tales" width="180" height="36" />
    </div>
    <div class="hero-content">
      <h1>Перетворіть малюнок дитини на <span>чарівного героя казки</span></h1>
      <p class="subheadline">Створюйте персоналізовані історії з красивими ілюстраціями, озвученням і текстом для читання — за хвилини, безпечно, з урахуванням віку.</p>
    </div>
    
    <div class="hero-mockup">
      <img src="/hero-mockup.webp" alt="Малюнок дитини перетворюється на ілюстрацію до казки" width="1200" height="600" loading="eager" />
      <div class="trust-chips">
        <span class="trust-chip trust-chip--safe"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.safe}</span> Безпечно для дітей</span>
        <span class="trust-chip trust-chip--audio"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.audio}</span> Озвучення включено</span>
        <span class="trust-chip trust-chip--personalized"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.personalized}</span> Персоналізація за малюнками</span>
        <span class="trust-chip trust-chip--languages"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.languages}</span> Багато мов</span>
        <span class="trust-chip trust-chip--ready"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.ready}</span> Готово за хвилини</span>
      </div>
    </div>
    <div class="actions">
      <a href="${escapeHtml(webAppUrl)}/welcome" class="cta-purple">Створити першу історію →</a>
    </div>
  </section>`;
}

function renderWhyFamiliesLove(webAppUrl: string): string {
  const cards = [
    { title: "Їхній малюнок оживає", desc: "Дитина бачить свій світ у казці — її ідеї, улюблені герої стають справжніми персонажами.", image: "/landing/draw-to-hero.png" },
    { title: "Історії, які хочеться вмикати знову", desc: "Яскраві сцени, виразне озвучення й текст, що підсвічується під голос, роблять кожну історію захоплюючою від початку до кінця.", image: "/landing/listen-again.png" },
    { title: "Казки, які легко зрозуміти й полюбити", desc: "Історії звучать природно, цікаво й по віку — дитині легко стежити за сюжетом і занурюватися в пригоду.", image: "/landing/safe-by-age.png" },
    { title: "Чарівна історія з'являється дуже швидко", desc: "Достатньо обрати героя, тему й настрій — або завантажте кілька фото, і WonderTales сам створить персонажів. За кілька хвилин дитина вже може слухати, читати й роздивлятися свою казку.", image: "/landing/create-in-minutes.png" },
  ];
  return `
  <section class="section">
    <h2>Чому діти люблять WonderTales</h2>
    <p class="section-subtitle">Більше ніж генератор історій — чарівний досвід, до якого діти хочуть повертатися, а батьки відчувають спокій.</p>
    <div class="value-cards">
      ${cards.map((c) => `
      <div class="value-card">
        <div class="value-card-image">
          <img src="${escapeHtml(c.image)}" alt="" loading="lazy" />
        </div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.desc)}</p>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderFromSketchToStory(webAppUrl: string): string {
  const steps = [
    { title: "Додайте малюнки, фото або ідеї героїв", desc: "Завантажте дитячі малюнки, фото чи просто опишіть персонажів словами — WonderTales перетворить ваші ідеї на живих героїв, яких дитина впізнає, полюбить і захоче бачити знову." },
    { title: "Налаштуйте казку саме під вашу дитину", desc: "Оберіть мову й тему: магія, космос, детективи, страшилки та інші. Можна обрати мораль історії, стиль ілюстрацій і додати особливі побажання. WonderTales врахує все й створить історію, яка відчувається по-справжньому особливою." },
    { title: "Отримайте готову казку з ілюстраціями", desc: "За кілька хвилин WonderTales створить повноцінну історію з красивими сценами, продуманим сюжетом і персонажами — щоб читати було цікаво, легко й захопливо." },
    { title: "Слухайте, читайте й діліться разом", desc: "Увімкніть озвучення, читайте текст у зручному темпі або діліться історією з рідними. Казка стає не просто контентом, а теплим сімейним моментом, до якого хочеться повертатися знову і знову." },
  ];
  return `
  <section class="section">
    <h2>Від малюнка до казки — один чарівний процес</h2>
    <p class="section-subtitle">Побачте, як простий малюнок стає опрацьованим персонажем і повною персоналізованою історією.</p>
    <div class="flow-steps">
      ${steps.map((s, i) => `
      <div class="flow-step">
        <div class="flow-step-num">${i + 1}</div>
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.desc)}</p>
      </div>`).join('')}
    </div>
  </section>`;
}

interface ExampleStory {
  age: string;
  title: string;
  time: string;
  slug: string;
  thumbnailUrl: string | null;
}

const FALLBACK_EXAMPLE_STORIES: ExampleStory[] = [
  { age: "3–5 років", title: "Малий будівник ракет", time: "5 хв", slug: "", thumbnailUrl: null },
  { age: "6–8 років", title: "Міла та місячний сад", time: "6 хв", slug: "", thumbnailUrl: null },
  { age: "4–7 років", title: "Бруно — відважний паперовий дракон", time: "7 хв", slug: "", thumbnailUrl: null },
];

function renderExampleStories(webAppUrl: string, exampleStories: ExampleStory[]): string {
  const stories = exampleStories.length > 0 ? exampleStories : FALLBACK_EXAMPLE_STORIES;
  return `
  <section class="section">
    <h2>Приклади чарівних історій</h2>
    <p class="section-subtitle">Перегляньте зразки історій, щоб побачити якість, тон і різноманіття, які можуть створювати сім'ї.</p>
    <div class="story-cards">
      ${stories.map((s) => {
        const href = s.slug ? `${escapeHtml(webAppUrl)}/stories/${escapeHtml(s.slug)}` : `${escapeHtml(webAppUrl)}/stories`;
        const thumb = s.thumbnailUrl
          ? `<img src="${escapeHtml(s.thumbnailUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" />`
          : '<span>Перегляд</span>';
        return `
      <a href="${href}" class="story-card" style="text-decoration:none;color:inherit">
        <div class="story-illustration">${thumb}</div>
        <div class="story-info">
          <div class="story-title">${escapeHtml(s.title)}</div>
          <div class="story-meta-badges">
            <div class="story-badge">
              <span class="story-badge-icon" aria-hidden="true">📚</span>
              <span class="story-badge-label">Вік:</span>
              <span class="story-badge-value">${escapeHtml(s.age)}</span>
            </div>
            <div class="story-badge">
              <span class="story-badge-icon" aria-hidden="true">⏱️</span>
              <span class="story-badge-label">Читання:</span>
              <span class="story-badge-value">${escapeHtml(s.time)}</span>
            </div>
          </div>
          <span class="story-card-cta">Переглянути історію</span>
        </div>
      </a>`;
      }).join('')}
    </div>
    <div class="cta-block">
      <a href="${escapeHtml(webAppUrl)}/stories" class="cta-purple">Всі історії</a>
    </div>
  </section>`;
}

function renderMadeForChildren(webAppUrl: string): string {
  const cards = [
    { title: "Особиста пам'ятка, а не одноразовий контент", desc: "Кожна історія особлива, бо починається з уяви вашої дитини.", image: "/landing/personal-keepsake.png" },
    { title: "Підтримка читання та мовного розвитку", desc: "Діти слухають, читають за текстом і насолоджуються історіями різними мовами.", image: "/landing/reading-and-language.png" },
    { title: "Ідеально перед сном і для спокійних моментів", desc: "Готова казка для щоденних сімейних ритуалів.", image: "/landing/bedtime-moments.png" },
    { title: "Легко ділитися з родиною", desc: "Надсилайте посилання на історії бабусям, дідусям і рідним. Опублікуйте в каталозі — отримайте оцінки від читачів.", image: "/landing/share-with-family.png" },
  ];
  return `
  <section class="section">
    <h2>Створено для дітей. Цінно для батьків.</h2>
    <p class="section-subtitle">Більш змістовний час перед екраном — творчий, особистий і до нього хочеться повертатися.</p>
    <div class="benefit-cards">
      ${cards.map((c) => `
      <div class="benefit-card">
        <div class="benefit-card-image">
          <img src="${escapeHtml(c.image)}" alt="" loading="lazy" />
        </div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.desc)}</p>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderFeatureGrid(webAppUrl: string): string {
  const features = [
    { title: "Голосове озвучення", desc: "Виразна аудіоверсія: обирайте голос під настрій — жіночий чи чоловічий, дзвінкий чи м'який. Слухайте в дорозі, перед сном або коли зручно.", image: "/landing/voice-narration.png" },
    { title: "Текст для читання разом", desc: "Слово за словом підсвічується під озвучення — дитина слідкує оком і природно зв'язує звук з текстом. Як караоке для казок.", image: "/landing/read-along-text.png" },
    { title: "Адаптація за віком", desc: "Складність тексту, довжина речень і абзаців узгоджені з Lexile (MetaMetrics) — стандартом, яким користуються школи й освітні програми. Тон і лексика підлаштовуються під вік дитини.", image: "/landing/age-adaptation.png" },
    { title: "Серії з улюбленими героями", desc: "Улюблені персонажі легко та зручно повертаються в нових історіях — дитина чекає на продовження пригод свого героя.", image: "/landing/favorite-hero-series.png" },
    { title: "Своя історія від малюнка до казки", desc: "Дитина стає автором власної казки — придумує героя, обирає пригоду, ділиться з сім'єю чи друзями. Опублікуйте в каталозі — отримайте оцінки від читачів.", image: "/landing/draw-to-story.png" },
    { title: "Кілька профілів дітей", desc: "Окремий профіль для кожної дитини — вік, ім'я, вподобання та настрій. Історії підлаштовуються під конкретну дитину.", image: "/landing/multiple-child-profiles.png" },
    { title: "Ілюстрації різних стилів", desc: "Оберіть стиль під настрій — акварель, пластелін, 3D-анімація, комікс чи нічна казка. Кожна історія виглядає по-своєму.", image: "/landing/illustration-styles.png" },
  ];
  const titlesHtml = features
    .map(
      (f, i) => `
      <div class="feature-sticky-title-item${i === 0 ? ' active' : ''}" data-index="${i}" role="button" tabindex="0">
        <h3>${escapeHtml(f.title)}</h3>
      </div>`
    )
    .join('');
  const cardsHtml = features
    .map(
      (f, i) => `
      <div class="feature-sticky-card" id="feature-card-${i}" data-index="${i}">
        <div class="feature-sticky-card-inner">
          <div class="feature-item-image">
            <img src="${escapeHtml(f.image)}" alt="" loading="lazy" />
          </div>
          <div class="feature-item-content">
            <p>${escapeHtml(f.desc)}</p>
          </div>
        </div>
      </div>`
    )
    .join('');
  return `
  <section class="section">
    <h2>Все необхідне для чарівного часу з казками</h2>
    <p class="section-subtitle">Створено для красивої, простої й багаторазової персоналізованої казки.</p>
    <div class="feature-sticky" data-feature-sticky>
      <div class="feature-sticky-titles">${titlesHtml}</div>
      <div class="feature-sticky-cards">${cardsHtml}</div>
    </div>
    <script>
(function(){
  var m=document.querySelector('[data-feature-sticky]');
  if(!m)return;
  var titles=m.querySelectorAll('.feature-sticky-title-item');
  var cards=m.querySelectorAll('.feature-sticky-card');
  titles.forEach(function(t,i){
    t.addEventListener('click',function(){
      var card=document.getElementById('feature-card-'+i);
      if(card)card.scrollIntoView({behavior:'smooth',block:'start'});
    });
    t.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();t.click();}});
  });
  function updateActive(){
    var vp=window.innerHeight;var best=0,bestRatio=0;
    cards.forEach(function(c,i){
      var r=c.getBoundingClientRect();
      var visible=Math.min(r.bottom,vp)-Math.max(r.top,0);
      var ratio=visible/Math.min(r.height,vp);
      if(ratio>bestRatio){bestRatio=ratio;best=i;}
    });
    titles.forEach(function(t,i){t.classList.toggle('active',i===best);});
  }
  var raf=null;
  window.addEventListener('scroll',function(){if(!raf)raf=requestAnimationFrame(function(){updateActive();raf=null;});},{passive:true});
  updateActive();
})();
    </script>
  </section>`;
}

function renderSafetyTrust(webAppUrl: string): string {
  const points = [
    "Щасливі кінцівки",
    "Без насильства й тривожного контенту",
    "Адаптація під вік дитини",
    "Лише дружній, позитивний тон",
    "Сімейні, безпечні теми",
  ];
  return `
  <section class="section">
    <h2>Безпечно для дітей</h2>
    <p class="section-subtitle">Кожна історія відповідає правилам безпеки і задумана бути радісною, м'якою та відповідною віку дитини.</p>
    <div class="safety-container">
      <div class="safety-points">
        ${points.map((p) => `<div class="safety-point">${escapeHtml(p)}</div>`).join('')}
      </div>
    </div>
  </section>`;
}

/** Voice for landing display (from DB or fallback) */
interface LandingVoice {
  id: string;
  name: string;
  displayName: string;
  sampleAudioUrl: string | null;
}

/** Voice name -> avatar index (fair skin, by gender). See apps/universal-app/scripts/slice-voice-avatars.js */
const VOICE_AVATAR_MAP: Record<string, number> = {
  lyra: 0, hydra: 2, andromeda: 6, cassiopeia: 10, marin: 7, coral: 1, ballad: 11,
  phoenix: 8, centaurus: 9, perseus: 14, orion: 13, cedar: 9,
};

function getVoiceAvatarPath(voiceName: string): string {
  const idx = VOICE_AVATAR_MAP[voiceName.toLowerCase()];
  if (idx == null) return '';
  return `/landing/voice-avatars/avatar-${String(idx).padStart(2, '0')}.png`;
}

function buildVoiceSampleUrl(sampleAudioUrl: string | null): string {
  if (!sampleAudioUrl) return '';
  if (sampleAudioUrl.startsWith('http')) return sampleAudioUrl;
  return `/api/v1/assets/${sampleAudioUrl}`;
}

/** Ellipse layout: card 0 at center, cards 1..N-1 on ellipse. Returns { left, top } in px. */
function getVoiceCardPosition(index: number, total: number): { left: number; top: number } {
  const cx = 480;
  const cy = 240;
  const cardW = 280;
  const cardH = 92;
  const halfW = cardW / 2;
  const halfH = cardH / 2;

  if (total <= 1 || index === 0) {
    return { left: cx - halfW, top: cy - halfH };
  }

  const a = 400;
  const b = 195;
  const angle = (2 * Math.PI * (index - 1)) / (total - 1);
  const x = cx + a * Math.cos(angle);
  const y = cy + b * Math.sin(angle);
  return { left: Math.round(x - halfW), top: Math.round(y - halfH) };
}

function renderVoicesSection(webAppUrl: string, voices: LandingVoice[]): string {
  const items = voices.length > 0 ? voices : [
    { id: 'lyra', name: 'lyra', displayName: 'Ліра', sampleAudioUrl: null },
    { id: 'hydra', name: 'hydra', displayName: 'Гідра', sampleAudioUrl: null },
    { id: 'phoenix', name: 'phoenix', displayName: 'Феникс', sampleAudioUrl: null },
    { id: 'centaurus', name: 'centaurus', displayName: 'Кентавр', sampleAudioUrl: null },
  ];
  const playIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const pauseIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';
  return `
  <section class="section">
    <h2>Голоси для озвучення</h2>
    <p class="section-subtitle">Обирайте голос для казки — жіночий чи чоловічий. Передслухайте перед створенням історії. Безкоштовні голоси для всіх. Преміум-голоси (Оріон, Андромеда, Кассіопея) — для тарифу Казковий світ.</p>
    <div class="voice-cards">
      ${items.map((v, i) => {
        const sampleUrl = buildVoiceSampleUrl(v.sampleAudioUrl);
        const hasSample = !!sampleUrl;
        const avatarPath = getVoiceAvatarPath(v.name);
        const avatarHtml = avatarPath
          ? `<img src="${escapeHtml(avatarPath)}" alt="" class="voice-avatar-img" loading="lazy" />`
          : `<span class="voice-avatar-fallback">${v.displayName.charAt(0)}</span>`;
        const pos = getVoiceCardPosition(i, items.length);
        return `
      <div class="voice-card" style="left:${pos.left}px;top:${pos.top}px">
        <div class="voice-avatar">${avatarHtml}</div>
        <div class="voice-info">
          <div class="voice-name">${escapeHtml(v.displayName)}</div>
        </div>
        ${hasSample ? `<button class="voice-play" type="button" data-audio-url="${escapeHtml(sampleUrl)}" aria-label="Передслухати">${playIcon}</button>` : `<button class="voice-play" disabled aria-label="Немає зразка">${playIcon}</button>`}
      </div>`;
      }).join('')}
    </div>
    <script>
(function(){
  var curAudio=null,curBtn=null;
  var playSvg='<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var pauseSvg='<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';
  function setPlay(btn){if(btn&&!btn.disabled){btn.classList.remove('playing');btn.innerHTML=playSvg;}}
  function setPause(btn){if(btn){btn.classList.add('playing');btn.innerHTML=pauseSvg;}}
  document.querySelectorAll('.voice-play:not([disabled])').forEach(function(btn){
    btn.addEventListener('click',function(){
      var url=this.dataset.audioUrl;
      if(!url)return;
      if(curBtn===this&&curAudio&&!curAudio.paused){
        curAudio.pause();
        setPlay(this);
        return;
      }
      if(curAudio){curAudio.pause();curAudio=null;}
      setPlay(curBtn);
      curBtn=this;
      var a=new Audio(url);
      a.addEventListener('ended',function(){setPlay(curBtn);curAudio=null;curBtn=null;});
      a.play();
      curAudio=a;
      setPause(this);
    });
  });
})();
    </script>
  </section>`;
}

function renderMultilingual(webAppUrl: string): string {
  const bullets = [
    "Створюйте історії різними мовами",
    "Читайте та слухайте природно",
    "Ідеально для дво- та багатомовних сімей",
    "Чудово для ігрового вивчення мови",
  ];
  return `
  <section class="section">
    <h2>Читай однією мовою, вчися іншій</h2>
    <p class="section-subtitle">WonderTales — багатомовні історії для сімей, де важливі й уява, й занурення в мову.</p>
    <ul class="multilingual-bullets">
      ${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
    </ul>
  </section>`;
}

function pluralStories(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'історія';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'історії';
  return 'історій';
}
function pluralAudio(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'аудіоісторія';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'аудіоісторії';
  return 'аудіоісторій';
}

function pluralImages(n: number): string {
  if (n === 1) return 'ілюстрація';
  if (n >= 2 && n <= 4) return 'ілюстрації';
  return 'ілюстрацій';
}

function buildPlanDesc(
  slug: string,
  storiesPerMonth: number,
  audioStoriesPerMonth: number,
  imagesPerStory: number
): string {
  const term = slug == 'free' ? '' : ' на місяць';
  const limits = `${storiesPerMonth} ${pluralStories(storiesPerMonth)}, ${audioStoriesPerMonth} аудіо${term}`;
  const images = `${imagesPerStory} ${pluralImages(imagesPerStory)} на історію`;
  switch (slug) {
    case 'free':
      return `${limits}. ${images}. Створіть кілька чарівних історій і подивіться, як працює WonderTales.`;
    case 'silver':
      return `${limits}. ${images}. Ідеально для однієї дитини.`;
    case 'golden':
      return `${limits}. ${images}. Щоденні історії, кілька профілів дітей.`;
    case 'fairyworld':
      return `${limits}. ${images}. Преміум-озвучення, більше профілів, розширений експорт.`;
    default:
      return `${limits}. ${images}.`;
  }
}

function formatPlanPrice(priceMonthly: number, currency: string): string {
  const amount = (currency === 'UAH' || currency === 'USD' || currency === 'EUR') ? priceMonthly / 100 : priceMonthly;
  if (currency === 'UAH') return `${Math.round(amount)} грн`;
  if (currency === 'USD') return `$${amount.toFixed(2)}`;
  if (currency === 'EUR') return `€${amount ? amount.toFixed(2) : amount}`;
  return `${amount} ${currency}`;
}

function renderPricing(webAppUrl: string, dbPlans: PlanWithLimits[]): string {
  const plans =
    dbPlans.length > 0
      ? dbPlans.map((p) => ({
          slug: p.slug,
          name: p.name,
          price: formatPlanPrice(p.priceMonthly, 'EUR'),
          desc: buildPlanDesc(p.slug, p.storiesPerMonth, p.audioStoriesPerMonth, p.imagesPerStory),
          featured: p.slug === 'golden',
        }))
      : [
          { slug: 'free', name: 'Безкоштовний', price: '0', desc: buildPlanDesc('free', 3, 1, 1), featured: false },
          { slug: 'silver', name: 'Срібні мрії', price: '—', desc: buildPlanDesc('silver', 15, 5, 3), featured: false },
          { slug: 'golden', name: 'Золоті зорі', price: '—', desc: buildPlanDesc('golden', 30, 10, 5), featured: true },
          { slug: 'fairyworld', name: 'Казковий світ', price: '—', desc: buildPlanDesc('fairyworld', 50, 15, 8), featured: false },
        ];
  return `
  <section class="section">
    <h2>Оберіть тариф для вашої сім'ї</h2>
    <p class="section-subtitle">Почніть безкоштовно, потім відкрийте більше історій, озвучення, ілюстрацій і способи поділитися.</p>
    <div class="plans-grid">
      ${plans.map((p) => `
      <div class="plan-card${p.featured ? ' featured' : ''}">
        ${p.featured ? '<span class="plan-badge">Найпопулярніший</span>' : ''}
        <div class="plan-name">${escapeHtml(p.name)}</div>
        <div class="plan-price">${escapeHtml(p.price)}${p.slug !== 'free' ? '<span style="font-size:14px;font-weight:400;color:#64748b">/міс</span>' : ''}</div>
        <div class="plan-desc">${escapeHtml(p.desc)}</div>
      </div>`).join('')}
    </div>
    <p class="pricing-reassurance">Підвищуйте тариф будь-коли, коли сім'я більше читає, слухає і створює.</p>
    <div class="cta-block">
      <a href="${escapeHtml(webAppUrl)}/pricing" class="cta-purple">Тарифи та можливості</a>
    </div>
  </section>`;
}

function renderFaq(webAppUrl: string): string {
  const faqItems = [
    {
      q: 'Чому WonderTales це безпечно для дітей?',
      a: 'Текст кожної сцени перевіряється окремо: WonderTales аналізує зміст на відповідність віку, безпечні теми й щасливе закінчення. Якщо сцена не проходить перевірку — WonderTales автоматично переписує її з урахуванням зауважень. Ілюстрації теж проходять валідацію: WonderTales перевіряє кожне зображення на наявність забороненого контенту (насильство, текст на картинці, небажані елементи) — і при потребі генерує заміну. У WonderTales закладено чіткі обмеження: без насильства, горе, травмуючих сцен; лише дружній, позитивний тон. Складність речень узгоджена з Lexile (стандарт шкіл і освітніх програм), тому казка завжди зрозуміла саме для вашого віку.',
    },
    {
      q: 'Чи можу використовувати малюнок дитини в історії?',
      a: 'Так. Завантажте малюнок, фото дитини чи улюбленої тваринки — або опишіть героя словами: WonderTales намалює персонажа за вашими нотатками. Є швидкий режим: кілька фото, і WonderTales сам розпізнає особи, створить персонажів і вплете їх у сюжет. Можна додати дракона, єдинорога, робота або уявного друга — історія будується навколо тих, кого ваша дитина впізнає і полюбить.',
    },
    {
      q: 'Чи потрібно самому писати історію?',
      a: 'Ні. Ви обираєте вік дитини, тему (магія і чарівники, космічна одіссея, технології тощо), персонажів і мову. Можна обрати моральну мету — дружба, сміливість, допомога, безпека на дорозі — і додати короткі примітки. WonderTales створює повноцінну історію: з сенсорними деталями, діалогами, місією та задовольняючою кульмінацією. Ви лише натискаєте — і отримуєте текст, ілюстрації та опційно озвучення.',
    },
    {
      q: 'Скільки часу потрібно для створення історії?',
      a: 'Зазвичай 1–2 хвилини. Ви бачите прогрес у реальному часі: аналіз фото (якщо швидкий режим), генерація тексту, перевірка безпеки, створення ілюстрацій. Озвучення можна додати пізніше окремо. Це час для чашки чаю — і дитина вже отримує свою історію.',
    },
    {
      q: 'Чи можна слухати історію в аудіо?',
      a: 'Так. Після створення історії можна згенерувати озвучення — виразне, з емоціями: радість, цікавість, шепіт, сміх. Голоси жіночі й чоловічі, різні тембри. Є режим читання разом: слово підсвічується синхронно з озвученням, як караоке для казок — дитина легко співвідносить звук і текст. Преміум-голоси (Оріон, Андромеда, Кассіопея) доступні для тарифу Казковий світ. Ліміт аудіоісторій на місяць залежить від тарифу.',
    },
    {
      q: 'Чи можна створювати історії різними мовами?',
      a: 'Так. Ми розуміємо, як важко дитині опановувати нову мову — тому й створили WonderTales: історії, де ваша дитина є героєм, допомагають зануритися в мову без стресу, через уяву й емоційний зв\'язок. WonderTales підтримує українську, англійську, німецьку, французьку, іспанську та російську мови. Текст і озвучення генеруються тією ж мовою, яку ви обрали. Ідеально для сімей, які хочуть підтримати дитину в освоєнні мови через знайомих персонажів і захоплюючі сюжети.',
    },
    {
      q: 'Чи є безкоштовний тариф?',
      a: `Так. Можна почати безкоштовно: кілька історій на місяць, одна аудіоісторія, один профіль дитини. Платні тарифи відкривають більше історій, більше озвучення, кілька профілів дітей і більше ілюстрацій — майже до кожної сцени. <a href="${escapeHtml(webAppUrl)}/pricing">Деталі — на сторінці тарифів</a>.`,
      allowHtml: true,
    },
    {
      q: 'Чи можна ділитися історіями з родиною?',
      a: 'Так. Опублікуйте історію публічно (в каталозі) або приватним посиланням — і надішліть бабусям, дідусям, друзям. Опубліковані історії можуть отримувати оцінки від читачів і з\'являтися в загальному каталозі прикладів. Вищі тарифи дають більше можливостей публікації.',
    },
    {
      q: 'Які стилі ілюстрацій?',
      a: 'Акварель — м\'які переливи, прозорі шари фарби, класичний вінтидж-казковий настрій. Олівець — видимі штрихи, хрестування, текстура паперу, тепла ностальгійна замальовка. Комікс — чіткі контури, плоскі кольори, графічні тіні, як сторінка з дитячого коміксу. 3D-анімація — округлі форми, кінематографічне світло, полірований вигляд сучасного мультфільму. Нічна казка — глибокі індиго й фіолет, тепле золотисте світло свічок і ліхтариків, затишна вечірня атмосфера. Фетр — видимі шви, пухнаста вовна, ручна робота, мініатюрний діорамний вигляд. Пластелін — тактильна пластилінова анімація, видимі відбитки пальців, іграшкові пропорції. Аніме — чітке cel-shading, виразні обличчя, рукописні фони. Оберіть стиль під настрій — і кожна історія виглядатиме по-своєму.',
    },
    {
      q: 'Який обсяг історії?',
      a: '5–11 сцен залежно від віку: для молодших — коротші історії, для старших — більше сцен і глибший сюжет. WonderTales автоматично підлаштовує довжину під обраний вік дитини.',
    },
  ];
  return `
  <section class="section">
    <h2>Часті питання</h2>
    <p class="section-subtitle">Усе, що батьки зазвичай хочуть знати перед стартом.</p>
    <div class="faq-list">
      ${faqItems.map(
        (item) => `
      <details class="faq-accordion-item">
        <summary class="faq-q">${escapeHtml(item.q)}</summary>
        <div class="faq-a">${(item as { allowHtml?: boolean }).allowHtml ? item.a : escapeHtml(item.a)}</div>
      </details>`
      ).join('')}
    </div>
    <div class="cta-block">
      <a href="${escapeHtml(webAppUrl)}/welcome" class="cta-purple">Створити першу історію зараз</a>
    </div>
  </section>`;
}

function renderFinalCta(webAppUrl: string): string {
  return `
  <section class="final-cta">
    <h2>Подаруйте дитині радість стати героєм власної історії</h2>
    <p class="final-subheadline">Малюнок, фото або опис — WonderTales створить персоналізовану історію за хвилини.</p>
    <div class="actions">
      <a href="${escapeHtml(webAppUrl)}/welcome" class="cta-purple">Створити історію безкоштовно</a>
      <a href="${escapeHtml(webAppUrl)}/pricing" class="cta-purple-outline">Переглянути тарифи</a>
    </div>
  </section>`;
}

export function renderLandingHtml(params?: {
  locale?: string;
  exampleStories?: ExampleStory[];
  plans?: PlanWithLimits[];
  voices?: Array<{ id: string; name: string; displayName: string; sampleAudioUrl: string | null }>;
}): string {
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || '';
  const landingUrl = webAppUrl || '/';
  const ogImageUrl = `${webAppUrl}/og-landing.png`;
  const exampleStories = params?.exampleStories ?? [];
  const plans = params?.plans ?? [];
  const voices = params?.voices ?? [];

  const title = "WonderTales — Перетворіть малюнок дитини на героя казки";
  const description =
    'Створюйте персоналізовані історії з ілюстраціями, озвученням і текстом для читання. Безпечно, з урахуванням віку, для сімей.';

  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description.slice(0, 200));
  const safeUrl = escapeHtml(landingUrl);
  const safeImage = escapeHtml(ogImageUrl);

  const meta = `
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:image" content="${safeImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="uk_UA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeImage}">
  <link rel="canonical" href="${safeUrl}">`.trim();

  const bodyHtml = `
  <div class="landing-wrapper" id="landing-wrapper">
    <div class="landing">
      ${renderHero(webAppUrl)}
      ${renderWhyFamiliesLove(webAppUrl)}
      ${renderFromSketchToStory(webAppUrl)}
      ${renderExampleStories(webAppUrl, exampleStories)}
      ${renderMadeForChildren(webAppUrl)}
      ${renderFeatureGrid(webAppUrl)}
      ${renderSafetyTrust(webAppUrl)}
      ${renderVoicesSection(webAppUrl, voices)}
      ${renderMultilingual(webAppUrl)}
      ${renderPricing(webAppUrl, plans)}
      ${renderFaq(webAppUrl)}
      ${renderFinalCta(webAppUrl)}
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  ${meta}
  <style>${LANDING_STYLES}</style>
</head>
<body>
  ${bodyHtml}
  <script>
(function(){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var w=document.getElementById('landing-wrapper');
  if(!w)return;
  var raf=null;
  function update(){
    var y=window.scrollY||window.pageYOffset;
    w.style.backgroundPosition='0 '+(y*0.15)+'px';
  }
  window.addEventListener('scroll',function(){
    if(!raf)raf=requestAnimationFrame(function(){update();raf=null;});
  },{passive:true});
  update();
})();
  </script>
</body>
</html>`;
}
