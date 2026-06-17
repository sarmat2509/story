/**
 * Render landing page as static HTML for SEO
 * Served at /ssr/landing, proxied by nginx at / (homepage)
 */

import { config } from '../config';
import {
  buildAbsoluteRouteUrl,
  buildPublicLegalPath,
  buildPublicPricingPath,
  buildPublicStoriesPath,
  normalizePublicSeoLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';
import {
  buildLandingAlternateLinks,
  buildPlanDescription,
  formatPlanPrice,
  getLandingContent,
  getLandingPath,
  getLandingUrl,
  getPlanDisplayName,
  normalizeLandingLocale,
  type LandingContent,
  type LandingExampleStory,
  type LandingLocale,
} from './landingContent';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import {
  PUBLIC_FOOTER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageFooter,
} from './publicPageFooter';
import { renderLandingStructuredData } from './publicStructuredData';

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

interface ParentTrustCard {
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
}

const PARENT_TRUST_COPY: Record<PublicSeoLocale, {
  title: string;
  subtitle: string;
  cards: ParentTrustCard[];
}> = {
  uk: {
    title: 'Батьківський контроль і приватність з першої історії',
    subtitle:
      'WonderTales створений для сімей: дорослий керує акаунтом, дані дитини залишаються приватними, а підтримка допомагає з приватністю чи видаленням.',
    cards: [
      {
        title: 'Акаунт належить дорослому',
        body:
          'Діти користуються профілями всередині батьківського акаунта. Оплата, налаштування, публікація та видалення залишаються за батьками.',
      },
      {
        title: 'Приватно за замовчуванням',
        body:
          'Профілі дітей, завантаження, створені казки, аудіо та ілюстрації не публікуються, доки батьки самі не оберуть публікацію або приватне посилання.',
        linkLabel: 'Політика приватності',
      },
      {
        title: 'Дитячий режим з межами',
        body:
          'Дитина може створювати лише в межах налаштувань батьків: вік, дозволені теми, ліміт історій і перегляд батьками перед поширенням.',
      },
      {
        title: 'Видалення даних і підтримка',
        body:
          'Батьки можуть звернутися до підтримки щодо акаунта, експорту, видалення або приватності будь-коли.',
        linkLabel: 'Написати в підтримку',
      },
    ],
  },
  en: {
    title: 'Parent control and privacy from the first story',
    subtitle:
      'WonderTales is built for families: adults own the account, child data stays private, and support can help with privacy or deletion requests.',
    cards: [
      {
        title: 'Parent-owned accounts',
        body:
          'Children use profiles inside an adult account. Billing, settings, publishing, and destructive actions stay behind parent access.',
      },
      {
        title: 'Private by default',
        body:
          'Child profiles, uploads, generated stories, audio, and images are not public unless a parent chooses to publish or share an unlisted link.',
        linkLabel: 'Privacy policy',
      },
      {
        title: 'Child Mode with boundaries',
        body:
          'Child Mode lets a child create inside parent settings. Requests are limited by age, allowed themes, quota, and parent review before sharing.',
      },
      {
        title: 'Deletion and support',
        body:
          'Parents can ask support for account help, export, deletion, or privacy questions at any time.',
        linkLabel: 'Contact support',
      },
    ],
  },
  ru: {
    title: 'Родительский контроль и приватность с первой истории',
    subtitle:
      'WonderTales создан для семей: взрослый владеет аккаунтом, данные ребёнка остаются приватными, а поддержка помогает с вопросами приватности и удаления.',
    cards: [
      {
        title: 'Аккаунт принадлежит взрослому',
        body:
          'Дети пользуются профилями внутри взрослого аккаунта. Оплата, настройки, публикация и удаление остаются под контролем родителей.',
      },
      {
        title: 'Приватно по умолчанию',
        body:
          'Профили детей, загрузки, созданные истории, аудио и изображения не становятся публичными, пока родитель сам не выберет публикацию или приватную ссылку.',
        linkLabel: 'Политика конфиденциальности',
      },
      {
        title: 'Детский режим с границами',
        body:
          'Детский режим позволяет создавать истории только в рамках родительских настроек: возраст, разрешённые темы, лимиты и проверка перед публикацией.',
      },
      {
        title: 'Удаление данных и поддержка',
        body:
          'Родители могут в любой момент обратиться в поддержку по вопросам аккаунта, экспорта, удаления или приватности.',
        linkLabel: 'Связаться с поддержкой',
      },
    ],
  },
  es: {
    title: 'Control parental y privacidad desde la primera historia',
    subtitle:
      'WonderTales está pensado para familias: los adultos controlan la cuenta, los datos del niño permanecen privados y soporte puede ayudar con privacidad o eliminación.',
    cards: [
      {
        title: 'Cuentas gestionadas por adultos',
        body:
          'Los niños usan perfiles dentro de la cuenta de un adulto. La facturación, la configuración, la publicación y las acciones sensibles quedan bajo acceso parental.',
      },
      {
        title: 'Privado por defecto',
        body:
          'Los perfiles infantiles, las subidas, las historias, el audio y las imágenes no son públicos salvo que un padre decida publicarlos o compartir un enlace privado.',
        linkLabel: 'Política de privacidad',
      },
      {
        title: 'Modo infantil con límites',
        body:
          'El modo infantil permite crear historias dentro de los límites definidos por los padres: edad, temas permitidos, cupos y revisión antes de compartir.',
      },
      {
        title: 'Eliminación de datos y soporte',
        body:
          'Los padres pueden contactar con soporte en cualquier momento para ayuda con la cuenta, exportación, eliminación o privacidad.',
        linkLabel: 'Contactar soporte',
      },
    ],
  },
  de: {
    title: 'Elternkontrolle und Datenschutz ab der ersten Geschichte',
    subtitle:
      'WonderTales ist für Familien gebaut: Erwachsene verwalten das Konto, Kinderdaten bleiben privat und der Support hilft bei Datenschutz- oder Löschanfragen.',
    cards: [
      {
        title: 'Konten unter Elternaufsicht',
        body:
          'Kinder nutzen Profile innerhalb eines Erwachsenenkontos. Abrechnung, Einstellungen, Veröffentlichung und sensible Aktionen bleiben hinter dem Elternzugang.',
      },
      {
        title: 'Standardmäßig privat',
        body:
          'Kinderprofile, Uploads, erstellte Geschichten, Audio und Bilder sind nicht öffentlich, solange Eltern sie nicht bewusst veröffentlichen oder per privatem Link teilen.',
        linkLabel: 'Datenschutz',
      },
      {
        title: 'Kindermodus mit Grenzen',
        body:
          'Der Kindermodus erlaubt Geschichten nur innerhalb der elterlichen Regeln: Alter, erlaubte Themen, Limits und Freigabe vor dem Teilen.',
      },
      {
        title: 'Löschung und Support',
        body:
          'Eltern können sich jederzeit an den Support wenden, wenn es um Konto, Export, Löschung oder Datenschutz geht.',
        linkLabel: 'Support kontaktieren',
      },
    ],
  },
  fr: {
    title: 'Contrôle parental et confidentialité dès la première histoire',
    subtitle:
      'WonderTales est conçu pour les familles : les adultes gardent le contrôle du compte, les données de l’enfant restent privées et le support aide pour la confidentialité ou la suppression.',
    cards: [
      {
        title: 'Des comptes pilotés par les parents',
        body:
          'Les enfants utilisent des profils dans le compte d’un adulte. Paiement, réglages, publication et actions sensibles restent derrière l’accès parent.',
      },
      {
        title: 'Privé par défaut',
        body:
          'Les profils enfants, les uploads, les histoires générées, l’audio et les images ne deviennent pas publics tant qu’un parent ne choisit pas de les publier ou partager.',
        linkLabel: 'Politique de confidentialité',
      },
      {
        title: 'Mode enfant avec limites',
        body:
          'Le mode enfant permet de créer des histoires dans les limites définies par les parents : âge, thèmes autorisés, quotas et validation avant partage.',
      },
      {
        title: 'Suppression des données et support',
        body:
          'Les parents peuvent contacter le support à tout moment pour le compte, l’export, la suppression ou les questions de confidentialité.',
        linkLabel: 'Contacter le support',
      },
    ],
  },
  pl: {
    title: 'Kontrola rodzicielska i prywatność od pierwszej historii',
    subtitle:
      'WonderTales powstało z myślą o rodzinach: dorośli zarządzają kontem, dane dziecka pozostają prywatne, a wsparcie pomaga w sprawach prywatności i usuwania danych.',
    cards: [
      {
        title: 'Konto pod kontrolą dorosłego',
        body:
          'Dzieci korzystają z profili wewnątrz konta dorosłego. Płatności, ustawienia, publikacja i działania wrażliwe pozostają po stronie rodzica.',
      },
      {
        title: 'Prywatność domyślnie',
        body:
          'Profile dzieci, przesłane materiały, wygenerowane historie, audio i obrazy nie są publiczne, dopóki rodzic sam nie zdecyduje o publikacji lub prywatnym linku.',
        linkLabel: 'Polityka prywatności',
      },
      {
        title: 'Tryb dziecięcy z granicami',
        body:
          'Tryb dziecięcy pozwala tworzyć historie w granicach ustawionych przez rodziców: wiek, dozwolone tematy, limity i akceptacja przed udostępnieniem.',
      },
      {
        title: 'Usuwanie danych i wsparcie',
        body:
          'Rodzice mogą w każdej chwili skontaktować się ze wsparciem w sprawie konta, eksportu, usuwania lub prywatności.',
        linkLabel: 'Skontaktuj się ze wsparciem',
      },
    ],
  },
};

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
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:0;line-height:1.6;color:#1e293b;overflow-x:hidden}
.landing-wrapper{min-height:100vh;background-color:#f5e6f0;background-image:url('/sparkles-overlay.webp');background-repeat:repeat;background-size:contain;overflow:visible}
.landing{width:min(100%,1200px);margin:0 auto;padding:0 clamp(16px,4vw,24px) 80px}
.brand{display:flex;align-items:center;justify-content:center;margin-bottom:20px;}
.brand img{width:clamp(170px,24vw,260px);height:auto;display:block}
.hero{text-align:center;padding:20px clamp(12px,3vw,24px) clamp(44px,7vw,64px)}
.hero-content{display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;position:relative;}
.hero h1{font-size:clamp(32px,4.2vw,42px);font-weight:700;color:#1e293b;line-height:1.16;max-width:760px;margin:0 auto 16px;text-wrap:balance;}
.hero h1 span{color:#8b7cb8;}
.hero .subheadline{font-size:clamp(16px,2.1vw,18px);color:#222;max-width:680px;margin:0 auto 28px;line-height:1.6;text-wrap:balance;}
.cta-purple{background:#8b7cb8;color:#fff;border:none;border-radius:9999px;padding:12px 24px;font-size:16px;font-weight:600;text-decoration:none;display:inline-block;max-width:100%;text-align:center;line-height:1.25}
.cta-purple:hover{background:#7a6ba8}
.cta-purple-outline{background:transparent;color:#8b7cb8;border:2px solid #8b7cb8;border-radius:9999px;padding:12px 24px;font-size:16px;font-weight:600;text-decoration:none;display:inline-block;max-width:100%;text-align:center;line-height:1.25}
.cta-purple-outline:hover{background:rgba(139,124,184,0.1)}
.actions{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;z-index:10;position:relative;}
.hero .microcopy{font-size:14px;color:#64748b;margin-top:16px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap}
.trust-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:32px}
.trust-chip{position:absolute;display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:rgba(0,0,0,0.25);border:3px solid rgba(255,255,255,0.8);border-radius:9999px;font-size:18px;line-height:1.2;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.06);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);white-space:nowrap;max-width:calc(100vw - 32px);}
.trust-chip .trust-chip-icon{display:inline-flex;align-items:center;flex-shrink:0}
.trust-chip .trust-chip-icon-svg{width:20px;height:20px;color:inherit}
.trust-chip--safe{top:35%;left:15%;}
.trust-chip--audio{top:30%;right:10%;}
.trust-chip--personalized{bottom:12%;left:8%;}
.trust-chip--languages{bottom:15%;right:8%;}
.trust-chip--ready{bottom:18%;left:50%;transform:translateX(-50%);}
.hero-mockup{margin:clamp(-260px,-16vw,-150px) clamp(-200px,-12vw,-72px) -30px;position:relative;}
.hero-mockup picture{display:block;width:100%}
.hero-mockup img{display:block;width:100%;height:auto;}
.section{margin-bottom:clamp(48px,7vw,64px);padding-top:16px}
.section h2{font-size:clamp(26px,4vw,32px);font-weight:700;color:#1e293b;margin:0 0 12px;text-align:center;line-height:1.2;text-wrap:balance}
.section .section-subtitle{text-wrap:balance;font-size:clamp(15px,2.1vw,18px);color:#64748b;text-align:center;max-width:640px;margin:0 auto 32px;line-height:1.6}
.value-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin-bottom:32px}
.value-card{background:rgba(255,255,255,0.15);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);border-radius:16px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden}
.value-card .value-card-image{height:180px;margin:-24px -24px 16px -24px;overflow:hidden;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}
.value-card .value-card-image picture{display:block;width:100%;height:100%}
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
.story-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-bottom:32px}
.story-card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
.story-card .story-illustration{height:200px;background:linear-gradient(135deg,#e8e4f3,#f5e6f0);display:flex;align-items:center;justify-content:center;color:#8b7cb8;font-size:14px;overflow:hidden}
.story-card .story-illustration img{width:100%;height:100%;object-fit:cover;display:block}
.story-card .story-info{padding:20px}
.story-card .story-title{font-size:16px;font-weight:600;color:#1e293b;margin-bottom:12px;line-height:1.4}
.story-card .story-meta-badges{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.story-card .story-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#475569;padding:6px 10px;border-radius:999px;background:#f8fafc;min-width:0}
.story-card .story-badge-icon{font-size:13px;line-height:1}
.story-card .story-badge-label{font-weight:600}
.story-card .story-badge-value{color:#0f172a}
.story-card .story-card-cta{display:inline-flex;align-items:center;justify-content:center;padding:8px 14px;border-radius:999px;border:1.5px solid #8b7cb8;background:transparent;color:#8b7cb8;font-size:13px;font-weight:600;text-decoration:none}
.story-card .story-card-cta:hover{background:rgba(139,124,184,0.08)}
.story-empty-state{max-width:720px;margin:0 auto 32px;padding:32px 28px;border-radius:24px;background:rgba(255,255,255,0.92);box-shadow:0 10px 30px rgba(15,23,42,0.08);text-align:center}
.story-empty-state-icon{font-size:36px;line-height:1;margin-bottom:12px}
.story-empty-state h3{margin:0 0 10px;font-size:24px;color:#1e293b}
.story-empty-state p{margin:0 auto 20px;max-width:560px;font-size:16px;line-height:1.7;color:#64748b}
.benefit-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin-bottom:32px}
.benefit-card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden}
.benefit-card .benefit-card-image{height:180px;margin:-24px -24px 16px -24px;overflow:hidden;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}
.benefit-card .benefit-card-image picture{display:block;width:100%;height:100%}
.benefit-card .benefit-card-image img{width:100%;height:100%;object-fit:cover;display:block}
.benefit-card h3{font-size:18px;font-weight:600;color:#1e293b;margin:0 0 12px}
.benefit-card p{font-size:14px;color:#64748b;margin:0;line-height:1.6}
.benefit-card .benefit-placeholder{height:120px;background:linear-gradient(135deg,#e8e4f3,#f5e6f0);border-radius:8px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;color:#8b7cb8;font-size:12px}
.feature-sticky{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:48px;align-items:start;margin-bottom:32px}
.feature-sticky-titles{position:sticky;top:24px;align-self:start}
.feature-sticky-title-item{padding:20px 0;border-bottom:1px solid #cdcdcd;cursor:pointer;transition:color 0.2s}
.feature-sticky-title-item:first-child{padding-top:0}
.feature-sticky-title-item:hover{color:#8b7cb8}
.feature-sticky-title-item.active{color:#8b7cb8;font-weight:600}
.feature-sticky-title-item h3{font-size:18px;font-weight:600;color:inherit;margin:0}
.feature-sticky-cards{display:flex;flex-direction:column;gap:32px}
.feature-sticky-card{scroll-margin-top:24px}
.feature-sticky-card-inner{background:rgba(255,255,255,0.9);backdrop-filter:blur(8px);border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.05);overflow:hidden}
.feature-sticky-card-inner .feature-item-image{width:100%;aspect-ratio:4/3;max-height:420px;overflow:hidden;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}
.feature-sticky-card-inner .feature-item-image picture{display:block;width:100%;height:100%}
.feature-sticky-card-inner .feature-item-image img{width:100%;height:100%;object-fit:cover;display:block}
.feature-sticky-card-inner .feature-item-content{padding:20px 24px}
.feature-sticky-card-inner p{font-size:15px;color:#64748b;margin:0;line-height:1.6}
.safety-container{max-width: 800px;margin: 0 auto;background:rgba(255,255,255,0.85);backdrop-filter:blur(12px);border-radius:16px;padding:clamp(20px,4vw,32px);box-shadow:0 4px 24px rgba(0,0,0,0.06);margin-bottom:32px}
.safety-points{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.safety-point{display:flex;align-items:center;gap:12px;color:#475569;font-size:15px}
.safety-point::before{content:"✓";color:#10b981;font-weight:700;font-size:18px}
.parent-trust-grid{max-width:1000px;margin:0 auto 32px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.parent-trust-card{background:rgba(255,255,255,0.92);border:1px solid rgba(139,124,184,0.22);border-radius:8px;padding:20px;box-shadow:0 4px 18px rgba(15,23,42,0.06)}
.parent-trust-card h3{font-size:17px;line-height:1.35;color:#1e293b;margin:0 0 10px}
.parent-trust-card p{font-size:14px;line-height:1.6;color:#475569;margin:0}
.parent-trust-card a{display:inline-flex;margin-top:12px;color:#7a6ba8;font-weight:700;text-decoration:underline;text-underline-offset:3px}
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
.plans-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin-bottom:24px}
.plan-card{background:#fff;border-radius:16px;padding:clamp(20px,3vw,28px);box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center;position:relative;display:flex;flex-direction:column}
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
.final-cta h2{font-size:clamp(28px,4vw,36px);font-weight:700;color:#1e293b;margin:0 0 16px;line-height:1.25;text-wrap:balance}
.final-cta .final-subheadline{font-size:18px;color:#64748b;max-width:560px;margin:0 auto 32px;line-height:1.6}
.final-cta .trust-line{font-size:14px;color:#94a3b8;margin-top:24px}
.cta-block{text-align:center;margin-top:32px}
@media(max-width:1100px){.hero-mockup{margin:-150px -96px -10px}.trust-chip{font-size:15px;padding:7px 12px;border-width:2px}.trust-chip--safe{top:37%;left:8%}.trust-chip--audio{top:34%;right:6%}.trust-chip--personalized{bottom:14%;left:6%}.trust-chip--languages{bottom:16%;right:6%}.trust-chip--ready{bottom:11%}}
@media(min-width:701px) and (max-width:1100px){.hero{--tablet-page-pad:clamp(16px,4vw,24px);margin-left:calc(-1 * var(--tablet-page-pad));margin-right:calc(-1 * var(--tablet-page-pad));padding-left:var(--tablet-page-pad);padding-right:var(--tablet-page-pad)}.hero-mockup{margin:-86px calc(-1 * var(--tablet-page-pad)) 2px}.trust-chip--personalized{left:7%}.trust-chip--languages{right:7%}}
@media(min-width:701px) and (max-width:1100px) and (max-height:820px){.brand{margin-bottom:12px}.brand img{width:220px}.hero{padding-top:12px;padding-bottom:20px}.hero h1{font-size:34px;line-height:1.14;margin-bottom:10px}.hero .subheadline{font-size:16px;line-height:1.45;margin-bottom:14px}.hero-mockup{margin:-128px calc(-1 * var(--tablet-page-pad)) -18px}.trust-chip{font-size:12px;padding:5px 9px;gap:5px}.trust-chip .trust-chip-icon-svg{width:15px;height:15px}.trust-chip--safe{top:37%;left:5%}.trust-chip--audio{top:35%;right:5%}.trust-chip--personalized{bottom:16%;left:5%}.trust-chip--languages{bottom:17%;right:5%}.trust-chip--ready{bottom:8%}}
@media(max-width:900px){.landing{padding-bottom:72px}.hero{padding-top:16px;padding-bottom:52px}.hero h1{max-width:640px}.hero .subheadline{max-width:600px;margin-bottom:22px}.trust-chip{font-size:14px;padding:6px 10px;gap:6px}.trust-chip .trust-chip-icon-svg{width:17px;height:17px}.value-cards,.benefit-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.flow-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.plans-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.parent-trust-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.story-cards,.testimonial-cards{grid-template-columns:1fr}.voice-cards{position:static;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:0}.voice-card{position:static;width:100%;left:auto;top:auto;margin:0}.feature-sticky{grid-template-columns:1fr;gap:24px}.feature-sticky-titles{position:static;display:flex;gap:10px;overflow-x:auto;padding:0 2px 10px;scroll-snap-type:x proximity}.feature-sticky-title-item{flex:0 0 min(260px,80vw);padding:12px 14px;border:1px solid rgba(139,124,184,0.24);border-radius:9999px;background:rgba(255,255,255,0.55);scroll-snap-align:start}.feature-sticky-title-item:first-child{padding-top:12px}.feature-sticky-title-item.active{background:#fff;box-shadow:0 2px 10px rgba(15,23,42,0.08)}.feature-sticky-title-item h3{font-size:15px}.feature-sticky-card-inner .feature-item-image{aspect-ratio:16/9;max-height:360px}}
@media(max-width:700px){.landing{padding:0 16px 64px}.brand{margin-bottom:14px}.hero{--mobile-page-pad:16px;margin-left:calc(-1 * var(--mobile-page-pad));margin-right:calc(-1 * var(--mobile-page-pad));padding:14px var(--mobile-page-pad) 48px}.hero h1{font-size:clamp(29px,8vw,36px);line-height:1.14;margin-bottom:12px}.hero .subheadline{font-size:16px;line-height:1.55;margin-bottom:18px}.hero-mockup{margin:-12px calc(-1 * var(--mobile-page-pad)) 12px}.hero-mockup img{min-height:210px}.trust-chips{display:grid;grid-template-columns:1fr;gap:8px;width:min(360px,calc(100% - 32px));margin:12px auto 0;padding:0;position:relative}.trust-chip{position:static;transform:none;justify-content:flex-start;width:100%;max-width:none;min-width:0;min-height:0;padding:3px 0;font-size:14px;line-height:1.35;border:0;white-space:normal;text-align:left;background:transparent;color:#1e293b;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}.trust-chip--ready{grid-column:auto}.trust-chip .trust-chip-icon-svg{width:18px;height:18px;color:#8b7cb8}.actions{gap:10px}.cta-purple,.cta-purple-outline{padding:11px 18px;font-size:15px}.section{padding-top:8px;margin-bottom:48px}.section h2{font-size:26px}.section .section-subtitle{font-size:15px;margin-bottom:24px}.value-cards,.benefit-cards,.flow-steps,.safety-points,.parent-trust-grid,.plans-grid,.story-cards,.testimonial-cards{grid-template-columns:1fr;gap:16px}.value-card,.benefit-card,.plan-card,.testimonial-card{padding:18px;border-radius:12px}.value-card .value-card-image,.benefit-card .benefit-card-image{height:170px;margin:-18px -18px 14px}.story-card{border-radius:12px}.story-card .story-illustration{height:190px}.story-card .story-info{padding:18px}.story-card .story-meta-badges{gap:6px}.story-card .story-badge{padding:5px 8px;font-size:11px}.feature-sticky-cards{gap:20px}.feature-sticky-card-inner .feature-item-image{aspect-ratio:16/10;max-height:260px}.feature-sticky-card-inner .feature-item-content{padding:16px 18px}.safety-point{align-items:flex-start}.voice-cards{grid-template-columns:1fr;gap:12px}.voice-card{padding:14px 16px;border-radius:12px}.final-cta{padding:48px 0}.final-cta .final-subheadline{font-size:16px}.announcement-bar{flex-direction:column;gap:12px}}
@media(max-width:420px){.landing{padding-left:14px;padding-right:14px}.hero{--mobile-page-pad:14px}.hero-mockup{margin-top:-10px}.hero-mockup img{min-height:190px}.trust-chips{width:min(340px,calc(100% - 28px))}.hero .microcopy{gap:8px;font-size:12px}.story-card .story-meta-badges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.story-card .story-badge{justify-content:center}}
@media(prefers-reduced-motion:reduce){.faq-accordion-item summary::before{transition:none}}
${PUBLIC_FOOTER_STYLES}
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const HERO_IMAGE_WIDTHS = [720, 1080, 1440, 1800] as const;
const LANDING_IMAGE_WIDTHS = [480, 720, 960] as const;

type ResponsiveImageFormat = 'avif' | 'webp';

interface ResponsiveImageOptions {
  width: number;
  height: number;
  sizes: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  widths?: readonly number[];
}

function getOptimizedImagePath(src: string, width: number, format: ResponsiveImageFormat): string | null {
  if (src === '/hero-mockup.webp') {
    return `/landing/optimized/hero-mockup-${width}.${format}`;
  }

  const match = src.match(/^\/landing\/([^/?#]+)\.(?:png|jpe?g|webp)$/i);
  if (!match) {
    return null;
  }

  return `/landing/optimized/${match[1]}-${width}.${format}`;
}

function buildSrcSet(src: string, widths: readonly number[], format: ResponsiveImageFormat): string {
  return widths
    .map((width) => {
      const optimizedPath = getOptimizedImagePath(src, width, format);
      return optimizedPath ? `${escapeHtml(optimizedPath)} ${width}w` : '';
    })
    .filter(Boolean)
    .join(', ');
}

function renderResponsiveImage(src: string, alt: string, options: ResponsiveImageOptions): string {
  const widths = options.widths || LANDING_IMAGE_WIDTHS;
  const avifSrcSet = buildSrcSet(src, widths, 'avif');
  const webpSrcSet = buildSrcSet(src, widths, 'webp');
  const loading = options.loading || 'lazy';
  const fetchPriority = options.fetchPriority ? ` fetchpriority="${options.fetchPriority}"` : '';

  if (!avifSrcSet || !webpSrcSet) {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${options.width}" height="${options.height}" loading="${loading}" decoding="async"${fetchPriority} />`;
  }

  return `<picture>
            <source type="image/avif" srcset="${avifSrcSet}" sizes="${escapeHtml(options.sizes)}" />
            <source type="image/webp" srcset="${webpSrcSet}" sizes="${escapeHtml(options.sizes)}" />
            <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${options.width}" height="${options.height}" loading="${loading}" decoding="async"${fetchPriority} />
          </picture>`;
}

function getLocalizedWelcomeUrl(webAppUrl: string, locale?: string): string {
  return `${webAppUrl}${locale && locale !== 'uk' ? `/${locale}/welcome` : '/welcome'}`;
}

function getLocalizedPricingUrl(webAppUrl: string, locale?: string | null): string {
  return buildAbsoluteRouteUrl(webAppUrl, buildPublicPricingPath(locale));
}

function getLocalizedStoriesUrl(webAppUrl: string, locale?: string | null): string {
  return buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(locale));
}

function renderAnnouncementBar(webAppUrl: string, locale?: string): string {
  return `
  <div class="announcement-bar">
    
    <div class="nav-links">
      <a href="${escapeHtml(webAppUrl)}/stories">Приклади історій</a>
      <a href="${escapeHtml(getLocalizedPricingUrl(webAppUrl, locale))}">Тарифи</a>
      <a href="${escapeHtml(getLocalizedWelcomeUrl(webAppUrl, locale))}" class="cta-purple">Реєстрація →</a>
    </div>
  </div>`;
}

function renderHero(webAppUrl: string, content: LandingContent, locale?: string): string {
  return `
  <section class="hero">
    <div class="brand">
      <img src="/logo.webp" alt="Wonder Tales" width="180" height="36" />
    </div>
    <div class="hero-content">
      <h1>${escapeHtml(content.hero.title)} <span>${escapeHtml(content.hero.highlight)}</span></h1>
      <p class="subheadline">${escapeHtml(content.hero.subheadline)}</p>
    </div>
    
    <div class="hero-mockup">
      ${renderResponsiveImage('/hero-mockup.webp', content.hero.imageAlt, {
        width: 1600,
        height: 893,
        widths: HERO_IMAGE_WIDTHS,
        sizes: '(max-width: 900px) 100vw, 1600px',
        loading: 'eager',
        fetchPriority: 'high',
      })}
      <div class="trust-chips">
        <span class="trust-chip trust-chip--safe"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.safe}</span> ${escapeHtml(content.trustChips.safe)}</span>
        <span class="trust-chip trust-chip--audio"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.audio}</span> ${escapeHtml(content.trustChips.audio)}</span>
        <span class="trust-chip trust-chip--personalized"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.personalized}</span> ${escapeHtml(content.trustChips.personalized)}</span>
        <span class="trust-chip trust-chip--languages"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.languages}</span> ${escapeHtml(content.trustChips.languages)}</span>
        <span class="trust-chip trust-chip--ready"><span class="trust-chip-icon">${TRUST_CHIP_ICONS.ready}</span> ${escapeHtml(content.trustChips.ready)}</span>
      </div>
    </div>
    <div class="actions">
      <a href="${escapeHtml(getLocalizedWelcomeUrl(webAppUrl, locale))}" class="cta-purple">${escapeHtml(content.hero.cta)}</a>
    </div>
  </section>`;
}

function renderWhyFamiliesLove(_webAppUrl: string, content: LandingContent): string {
  const cards = content.whyFamiliesLove.cards;
  return `
  <section class="section">
    <h2>${escapeHtml(content.whyFamiliesLove.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.whyFamiliesLove.subtitle)}</p>
    <div class="value-cards">
      ${cards.map((c) => `
      <div class="value-card">
        <div class="value-card-image">
          ${renderResponsiveImage(c.image, '', {
            width: 960,
            height: 644,
            sizes: '(max-width: 600px) calc(100vw - 96px), (max-width: 900px) calc((100vw - 120px) / 2), 276px',
          })}
        </div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.desc)}</p>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderFromSketchToStory(_webAppUrl: string, content: LandingContent): string {
  const steps = content.fromSketchToStory.steps;
  return `
  <section class="section">
    <h2>${escapeHtml(content.fromSketchToStory.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.fromSketchToStory.subtitle)}</p>
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

const EMPTY_EXAMPLE_STORIES_COPY: Record<LandingLocale, { title: string; description: string; cta: string }> = {
  uk: {
    title: 'Історій цією мовою поки що немає',
    description: 'Ми скоро додамо сюди чарівні приклади. А поки що саме ваша історія може стати першою на цій мовній сторінці.',
    cta: 'Створити свою історію',
  },
  ru: {
    title: 'Историй на этом языке пока нет',
    description: 'Скоро здесь появятся волшебные примеры. А пока именно ваша история может стать первой на этой языковой странице.',
    cta: 'Создать свою историю',
  },
  en: {
    title: 'No stories in this language yet',
    description: 'Magical examples will appear here soon. Until then, your story could become the very first one on this language page.',
    cta: 'Create your story',
  },
  es: {
    title: 'Todavia no hay historias en este idioma',
    description: 'Pronto apareceran aqui ejemplos magicos. Mientras tanto, tu historia puede convertirse en la primera de esta version por idioma.',
    cta: 'Crear mi historia',
  },
  de: {
    title: 'In dieser Sprache gibt es noch keine Geschichten',
    description: 'Hier erscheinen bald magische Beispiele. Bis dahin kann deine Geschichte die erste auf dieser Sprachversion werden.',
    cta: 'Meine Geschichte erstellen',
  },
  fr: {
    title: 'Il n y a pas encore d histoires dans cette langue',
    description: 'De beaux exemples apparaitront bientot ici. En attendant, votre histoire peut devenir la toute premiere de cette version linguistique.',
    cta: 'Creer mon histoire',
  },
  pl: {
    title: 'Jeszcze nie ma historii w tym jezyku',
    description: 'Wkrotce pojawia sie tu magiczne przyklady. Na razie to twoja historia moze byc pierwsza na tej wersji jezykowej.',
    cta: 'Stworz swoja historie',
  },
};

function renderExampleStories(
  webAppUrl: string,
  exampleStories: LandingExampleStory[],
  content: LandingContent,
  locale?: string
): string {
  const stories = exampleStories;
  const normalizedLocale = normalizeLandingLocale(locale);

  if (stories.length === 0) {
    if (normalizedLocale === 'en') {
      return '';
    }

    const emptyState = EMPTY_EXAMPLE_STORIES_COPY[normalizedLocale];
    return `
  <section class="section">
    <h2>${escapeHtml(content.exampleStories.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.exampleStories.subtitle)}</p>
    <div class="story-empty-state">
      <div class="story-empty-state-icon" aria-hidden="true">✨</div>
      <h3>${escapeHtml(emptyState.title)}</h3>
      <p>${escapeHtml(emptyState.description)}</p>
      <a href="${escapeHtml(getLocalizedWelcomeUrl(webAppUrl, normalizedLocale))}" class="cta-purple">${escapeHtml(emptyState.cta)}</a>
    </div>
  </section>`;
  }

  return `
  <section class="section">
    <h2>${escapeHtml(content.exampleStories.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.exampleStories.subtitle)}</p>
    <div class="story-cards">
      ${stories.map((s) => {
        const href = s.slug ? `${escapeHtml(webAppUrl)}/stories/${escapeHtml(s.slug)}` : `${escapeHtml(webAppUrl)}/stories`;
        const thumb = s.thumbnailUrl
          ? `<img src="${escapeHtml(s.thumbnailUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" />`
          : `<span>${escapeHtml(content.exampleStories.previewFallback)}</span>`;
        return `
      <a href="${href}" class="story-card" style="text-decoration:none;color:inherit">
        <div class="story-illustration">${thumb}</div>
        <div class="story-info">
          <div class="story-title">${escapeHtml(s.title)}</div>
          <div class="story-meta-badges">
            <div class="story-badge">
              <span class="story-badge-icon" aria-hidden="true">📚</span>
              <span class="story-badge-label">${escapeHtml(content.exampleStories.ageLabel)}</span>
              <span class="story-badge-value">${escapeHtml(s.age)}</span>
            </div>
            <div class="story-badge">
              <span class="story-badge-icon" aria-hidden="true">⏱️</span>
              <span class="story-badge-label">${escapeHtml(content.exampleStories.readingLabel)}</span>
              <span class="story-badge-value">${escapeHtml(s.time)}</span>
            </div>
          </div>
          <span class="story-card-cta">${escapeHtml(content.exampleStories.viewStoryCta)}</span>
        </div>
      </a>`;
      }).join('')}
    </div>
    <div class="cta-block">
      <a href="${escapeHtml(getLocalizedStoriesUrl(webAppUrl, normalizedLocale))}" class="cta-purple">${escapeHtml(content.exampleStories.allStoriesCta)}</a>
    </div>
  </section>`;
}

function renderMadeForChildren(_webAppUrl: string, content: LandingContent): string {
  const cards = content.madeForChildren.cards;
  return `
  <section class="section">
    <h2>${escapeHtml(content.madeForChildren.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.madeForChildren.subtitle)}</p>
    <div class="benefit-cards">
      ${cards.map((c) => `
      <div class="benefit-card">
        <div class="benefit-card-image">
          ${renderResponsiveImage(c.image, '', {
            width: 960,
            height: 644,
            sizes: '(max-width: 600px) calc(100vw - 96px), (max-width: 900px) calc((100vw - 120px) / 2), 276px',
          })}
        </div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.desc)}</p>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderFeatureGrid(_webAppUrl: string, content: LandingContent): string {
  const features = content.featureGrid.features;
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
            ${renderResponsiveImage(f.image, '', {
              width: 960,
              height: 717,
              sizes: '(max-width: 900px) calc(100vw - 48px), 711px',
            })}
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
    <h2>${escapeHtml(content.featureGrid.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.featureGrid.subtitle)}</p>
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

function renderSafetyTrust(_webAppUrl: string, content: LandingContent): string {
  const points = content.safety.points;
  return `
  <section class="section">
    <h2>${escapeHtml(content.safety.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.safety.subtitle)}</p>
    <div class="safety-container">
      <div class="safety-points">
        ${points.map((p) => `<div class="safety-point">${escapeHtml(p)}</div>`).join('')}
      </div>
    </div>
  </section>`;
}

function renderParentTrust(webAppUrl: string, locale?: string): string {
  const seoLocale = normalizePublicSeoLocale(locale);
  const copy = PARENT_TRUST_COPY[seoLocale];
  const legalLocale = seoLocale === 'uk' ? 'uk' : 'en';
  const privacyUrl = buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath('privacy', legalLocale));
  const supportUrl = buildAbsoluteRouteUrl(webAppUrl, '/support');
  const cards = copy.cards.map((card, index) => {
    const href = card.href || (index === 1 ? privacyUrl : index === 3 ? supportUrl : undefined);
    return `
      <article class="parent-trust-card">
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.body)}</p>
        ${href && card.linkLabel ? `<a href="${escapeHtml(href)}">${escapeHtml(card.linkLabel)}</a>` : ''}
      </article>`;
  }).join('');

  return `
  <section class="section" aria-labelledby="parent-trust-title">
    <h2 id="parent-trust-title">${escapeHtml(copy.title)}</h2>
    <p class="section-subtitle">${escapeHtml(copy.subtitle)}</p>
    <div class="parent-trust-grid">
      ${cards}
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

function renderVoicesSection(_webAppUrl: string, voices: LandingVoice[], content: LandingContent): string {
  const items = voices.length > 0 ? voices : content.voices.fallbackVoices;
  const playIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  return `
  <section class="section">
    <h2>${escapeHtml(content.voices.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.voices.subtitle)}</p>
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
        ${hasSample ? `<button class="voice-play" type="button" data-audio-url="${escapeHtml(sampleUrl)}" aria-label="${escapeHtml(content.voices.previewAria)}">${playIcon}</button>` : `<button class="voice-play" disabled aria-label="${escapeHtml(content.voices.noSampleAria)}">${playIcon}</button>`}
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

function renderMultilingual(_webAppUrl: string, content: LandingContent): string {
  const bullets = content.multilingual.bullets;
  return `
  <section class="section">
    <h2>${escapeHtml(content.multilingual.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.multilingual.subtitle)}</p>
    <ul class="multilingual-bullets">
      ${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
    </ul>
  </section>`;
}

function renderPricing(webAppUrl: string, dbPlans: PlanWithLimits[], content: LandingContent, locale: string): string {
  const plans =
    dbPlans.length > 0
      ? dbPlans.map((p) => ({
          slug: p.slug,
          name: getPlanDisplayName(locale, p.slug, p.name),
          price: formatPlanPrice(locale, p.priceMonthly, p.pricingCurrency),
          desc: buildPlanDescription(locale, p.slug, p.storiesPerMonth, p.audioStoriesPerMonth, p.imagesPerStory),
          featured: p.slug === 'golden',
        }))
      : [
          { slug: 'free', name: content.pricing.fallbackPlans.free.name, price: content.pricing.fallbackPlans.free.price, desc: buildPlanDescription(locale, 'free', 3, 1, 1), featured: false },
          { slug: 'silver', name: content.pricing.fallbackPlans.silver.name, price: content.pricing.fallbackPlans.silver.price, desc: buildPlanDescription(locale, 'silver', 15, 5, 3), featured: false },
          { slug: 'golden', name: content.pricing.fallbackPlans.golden.name, price: content.pricing.fallbackPlans.golden.price, desc: buildPlanDescription(locale, 'golden', 30, 10, 5), featured: true },
          { slug: 'fairyworld', name: content.pricing.fallbackPlans.fairyworld.name, price: content.pricing.fallbackPlans.fairyworld.price, desc: buildPlanDescription(locale, 'fairyworld', 50, 15, 8), featured: false },
        ];
  return `
  <section class="section">
    <h2>${escapeHtml(content.pricing.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.pricing.subtitle)}</p>
    <div class="plans-grid">
      ${plans.map((p) => `
      <div class="plan-card${p.featured ? ' featured' : ''}">
        ${p.featured ? `<span class="plan-badge">${escapeHtml(content.pricing.popularBadge)}</span>` : ''}
        <div class="plan-name">${escapeHtml(p.name)}</div>
        <div class="plan-price">${escapeHtml(p.price)}${p.slug !== 'free' ? `<span style="font-size:14px;font-weight:400;color:#64748b">${escapeHtml(content.pricing.perMonthSuffix)}</span>` : ''}</div>
        <div class="plan-desc">${escapeHtml(p.desc)}</div>
      </div>`).join('')}
    </div>
    <p class="pricing-reassurance">${escapeHtml(content.pricing.reassurance)}</p>
    <div class="cta-block">
      <a href="${escapeHtml(getLocalizedPricingUrl(webAppUrl, locale))}" class="cta-purple">${escapeHtml(content.pricing.cta)}</a>
    </div>
  </section>`;
}

function renderFaq(webAppUrl: string, content: LandingContent, locale?: string): string {
  const pricingUrl = getLocalizedPricingUrl(webAppUrl, locale);
  const faqItems = content.faq.items.map((item) => ({
    ...item,
    a: item.allowHtml ? item.a.split('/pricing').join(escapeHtml(pricingUrl)) : item.a,
  }));
  return `
  <section class="section">
    <h2>${escapeHtml(content.faq.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.faq.subtitle)}</p>
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
      <a href="${escapeHtml(getLocalizedWelcomeUrl(webAppUrl, locale))}" class="cta-purple">${escapeHtml(content.faq.cta)}</a>
    </div>
  </section>`;
}

function renderFinalCta(webAppUrl: string, content: LandingContent, locale?: string): string {
  return `
  <section class="final-cta">
    <h2>${escapeHtml(content.finalCta.title)}</h2>
    <p class="final-subheadline">${escapeHtml(content.finalCta.subtitle)}</p>
    <div class="actions">
      <a href="${escapeHtml(getLocalizedWelcomeUrl(webAppUrl, locale))}" class="cta-purple">${escapeHtml(content.finalCta.primaryCta)}</a>
      <a href="${escapeHtml(getLocalizedPricingUrl(webAppUrl, locale))}" class="cta-purple-outline">${escapeHtml(content.finalCta.secondaryCta)}</a>
    </div>
  </section>`;
}

export function renderLandingHtml(params?: {
  locale?: string;
  exampleStories?: LandingExampleStory[];
  plans?: PlanWithLimits[];
  voices?: Array<{ id: string; name: string; displayName: string; sampleAudioUrl: string | null }>;
}): string {
  const locale = params?.locale;
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || '';
  const landingUrl = getLandingUrl(webAppUrl, locale);
  const ogImageUrl = `${webAppUrl}/og-landing.png`;
  const exampleStories = params?.exampleStories ?? [];
  const plans = params?.plans ?? [];
  const voices = params?.voices ?? [];
  const content = getLandingContent(locale);

  const safeTitle = escapeHtml(content.metaTitle);
  const safeDesc = escapeHtml(content.metaDescription.slice(0, 200));
  const safeUrl = escapeHtml(landingUrl);
  const safeImage = escapeHtml(ogImageUrl);
  const alternateLinks = buildLandingAlternateLinks(webAppUrl);
  const pricingUrl = getLocalizedPricingUrl(webAppUrl, locale);
  const structuredData = renderLandingStructuredData({
    content,
    landingUrl,
    pricingUrl,
    ogImageUrl,
  });

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
  <meta property="og:locale" content="${escapeHtml(content.ogLocale)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeImage}">
  ${PUBLIC_HEAD_ASSET_LINKS}
  <link rel="canonical" href="${safeUrl}">
  ${alternateLinks}
  ${structuredData}`.trim();

  const bodyHtml = `
  <div class="landing-wrapper" id="landing-wrapper">
    <div class="landing">
      ${renderHero(webAppUrl, content, locale)}
      ${renderWhyFamiliesLove(webAppUrl, content)}
      ${renderFromSketchToStory(webAppUrl, content)}
      ${renderExampleStories(webAppUrl, exampleStories, content, locale)}
      ${renderMadeForChildren(webAppUrl, content)}
      ${renderFeatureGrid(webAppUrl, content)}
      ${renderSafetyTrust(webAppUrl, content)}
      ${renderParentTrust(webAppUrl, locale)}
      ${renderVoicesSection(webAppUrl, voices, content)}
      ${renderMultilingual(webAppUrl, content)}
      ${renderPricing(webAppUrl, plans, content, locale || 'uk')}
      ${renderFaq(webAppUrl, content, locale)}
      ${renderFinalCta(webAppUrl, content, locale)}
    </div>
    ${renderPublicPageFooter(webAppUrl, locale, buildPublicFooterLanguageLinks(webAppUrl, getLandingPath))}
  </div>`;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(content.htmlLang)}">
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
