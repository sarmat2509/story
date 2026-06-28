/**
 * Render landing page as static HTML for SEO
 * Served at /ssr/landing, proxied by nginx at / (homepage)
 */

import { config } from '../config';
import {
  buildAbsoluteRouteUrl,
  buildLocalizedAppPath,
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
import {
  DEFAULT_BILLING_CURRENCY,
  SUPPORTED_BILLING_CURRENCIES,
  normalizeBillingCurrency,
  type BillingCurrency,
  type PresentedPlan,
} from '../services/planPresentationService';
import { buildFallbackPricingPlans } from './renderPricingHtml';

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

const STORY_META_ICONS = {
  age: '<svg class="story-badge-icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M5 5.6c0-1.1.9-2 2-2h11.2c.44 0 .8.36.8.8v13.2c0 .44-.36.8-.8.8H7a2 2 0 0 1-2-2V5.6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 16.4c0-1.1.9-2 2-2h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 7.4h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  reading: '<svg class="story-badge-icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" stroke-width="1.6"/><path d="M12 8.2v4.4l2.8 1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 2h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

const MULTILINGUAL_BULLET_ICONS = [
  '<svg class="multilingual-bullet-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M3.6 5.2h8.8v7.2H7.7l-4.1 3.2V5.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M11.6 9.2h8.8v7.2h-3.1l-3.7 2.8v-2.8h-2V9.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M6.2 8.2h3.6M14.2 12.2h3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  '<svg class="multilingual-bullet-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M4.6 5.3h5.1c1.3 0 2.3 1 2.3 2.3v10.9c0-1.2-1-2.2-2.2-2.2H4.6v-11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M19.4 5.3h-5.1c-1.3 0-2.3 1-2.3 2.3v10.9c0-1.2 1-2.2 2.2-2.2h5.2v-11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M16.9 8.7v4.2M18.9 9.8v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  '<svg class="multilingual-bullet-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M8.1 11.3a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM15.9 11.3a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" stroke="currentColor" stroke-width="1.7"/><path d="M3.9 18.9c.6-2.6 2.1-4.1 4.2-4.1s3.6 1.5 4.2 4.1M11.7 18.9c.6-2.6 2.1-4.1 4.2-4.1s3.6 1.5 4.2 4.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 14.7c.7-1.2 2.4-1.2 3.1 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  '<svg class="multilingual-bullet-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 4.8h2.8v3h2.8V5h3.4v4.8h2.7v3.4h-2.7V18h-4.1v-2.8h-2.8V18H5.5v-4.8h2.7V9.8H5.5V6.4h2V4.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M17.9 3.7l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5.5-1.2Z" fill="currentColor"/></svg>',
] as const;

const VALUE_CARD_IMAGE = {
  drawing: '/landing/draw-to-hero.png',
  easy: '/landing/safe-by-age.png',
  quick: '/landing/create-in-minutes.png',
} as const;

const LANDING_STYLES = `
*{box-sizing:border-box}
:root{--wt-ink:#121b2c;--wt-text:#354154;--wt-muted:#687386;--wt-lavender:#7466a6;--wt-lavender-dark:#554a82;--wt-lavender-soft:#eeeaf8;--wt-gold:#c4933f;--wt-page-bg:#fbfcff;--wt-surface:#ffffff;--wt-border:rgba(18,27,44,0.1);--wt-card-shadow:0 18px 42px rgba(18,27,44,0.08);--wt-radius-card:32px;--wt-radius-soft:26px}
body{font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:0;line-height:1.6;color:var(--wt-ink);overflow-x:hidden;background:var(--wt-page-bg);font-synthesis-weight:none;text-rendering:optimizeLegibility}
.landing-wrapper{min-height:100vh;background-color:var(--wt-page-bg);background-image:none;overflow:visible}
.landing{width:min(100%,1200px);margin:0 auto;padding:0 clamp(16px,4vw,24px) 80px}
.brand{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:14px;color:var(--wt-ink);font-size:20px;font-weight:900;line-height:1;letter-spacing:0}
.brand .brand-mark{width:44px;height:44px;border-radius:14px;display:block;object-fit:cover;box-shadow:0 14px 30px rgba(18,27,44,0.16)}
.brand .brand-name{display:block}
.hero{margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);text-align:center;padding:18px max(16px,calc((100vw - 1200px) / 2 + 24px)) clamp(34px,6vw,54px);background:linear-gradient(180deg,#f1f0f8 0%,#f7f7fc 46%,var(--wt-page-bg) 100%);overflow:visible}
.hero-content{display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;position:relative;}
.hero h1{font-size:50px;font-weight:800;color:var(--wt-ink);line-height:1.08;max-width:860px;margin:0 auto 14px;text-wrap:balance;letter-spacing:0}
.hero h1 span{background:linear-gradient(135deg,#8068d8 0%,#a86aa6 48%,#d86559 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.hero .subheadline{font-size:18px;color:var(--wt-text);max-width:660px;margin:0 auto 28px;line-height:1.52;text-wrap:balance;}
.cta-purple{background:var(--wt-lavender-dark);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:9999px;padding:16px 28px;font-size:16px;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;max-width:100%;text-align:center;line-height:1.2;box-shadow:0 12px 24px rgba(85,74,130,0.2)}
.cta-purple:hover{background:#4b4077;transform:translateY(-1px)}
.cta-purple-outline{background:rgba(255,255,255,0.65);color:var(--wt-lavender-dark);border:1px solid rgba(116,102,166,0.38);border-radius:9999px;padding:15px 27px;font-size:16px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;max-width:100%;text-align:center;line-height:1.25}
.cta-purple-outline:hover{background:rgba(238,234,248,0.78)}
.actions{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;z-index:10;position:relative;}
.hero .cta-purple{position:relative;border:0;background:transparent;color:var(--wt-lavender-dark);-webkit-text-fill-color:currentColor;box-shadow:none}
.hero .cta-purple::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:2px;background:linear-gradient(135deg,#8068d8 0%,#a86aa6 48%,#d86559 100%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask-composite:exclude;pointer-events:none}
.hero .cta-purple:hover{background:transparent;color:var(--wt-lavender-dark);-webkit-text-fill-color:currentColor;box-shadow:none}
.hero .microcopy{font-size:14px;color:#64748b;margin-top:16px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap}
.hero-mockup{margin:-210px clamp(-200px,-12vw,-72px) -28px;position:relative;z-index:1}
.hero-mockup picture{display:block;width:100%}
.hero-mockup img{display:block;width:100%;height:auto;transform:none;filter:none;-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 15%,#000 100%);mask-image:linear-gradient(180deg,transparent 0%,#000 15%,#000 100%)}
.section{margin-bottom:clamp(48px,7vw,64px);padding-top:16px}
.section h2{font-size:clamp(26px,4vw,32px);font-weight:740;color:var(--wt-ink);margin:0 0 12px;text-align:center;line-height:1.2;text-wrap:balance}
.section .section-subtitle{text-wrap:balance;font-size:clamp(15px,2.1vw,18px);color:var(--wt-muted);text-align:center;max-width:640px;margin:0 auto 32px;line-height:1.6}
.value-cards{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(0,0.92fr) minmax(0,0.92fr);grid-auto-rows:minmax(250px,auto);gap:24px;margin-bottom:32px;align-items:stretch}
.value-card{background:rgba(255,255,255,0.9);border:0;border-radius:var(--wt-radius-card);padding:24px;box-shadow:var(--wt-card-shadow);overflow:hidden;display:flex;flex-direction:column;min-height:0}
.value-card .value-card-image{height:180px;margin:-24px -24px 16px -24px;overflow:hidden;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}
.value-card .value-card-image picture{display:block;width:100%;height:100%}
.value-card .value-card-image img{width:100%;height:100%;object-fit:cover;display:block}
.value-card h3{font-size:18px;font-weight:800;color:var(--wt-ink);margin:0 0 12px;text-wrap:balance;line-height:1.36}
.value-card p{font-size:14px;color:var(--wt-muted);margin:0;line-height:1.6}
.value-card--featured{grid-column:1;grid-row:1 / span 2;min-height:552px;position:relative;justify-content:flex-end;padding:28px;background:var(--wt-ink);box-shadow:0 24px 62px rgba(18,27,44,0.14)}
.value-card--featured .value-card-image{position:absolute;inset:0;height:auto;margin:0;background:var(--wt-ink)}
.value-card--featured .value-card-image::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,27,44,0.02) 34%,rgba(18,27,44,0.78) 100%)}
.value-card--featured .value-card-image img{object-position:50% 50%}
.value-card--featured h3{position:relative;z-index:1;font-size:25px;line-height:1.22;margin-bottom:14px;color:#fff;max-width:360px;text-shadow:0 1px 18px rgba(18,27,44,0.28)}
.value-card--featured p{position:relative;z-index:1;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.86);max-width:360px}
.value-card--wide{grid-column:2 / span 2;grid-row:2;display:grid;grid-template-columns:minmax(348px,0.98fr) minmax(0,1fr);column-gap:24px;align-items:center;min-height:246px}
.value-card--wide .value-card-image{grid-column:1;grid-row:1 / span 2;aspect-ratio:960 / 644;height:calc(100% + 48px);min-height:0;margin:-24px 0 -24px -24px;align-self:stretch;justify-self:start;border-radius:0}
.value-card--wide .value-card-image img{object-fit:contain}
.value-card--wide h3,.value-card--wide p{grid-column:2}
.value-card--wide h3{align-self:end;font-size:21px}
.value-card--wide p{align-self:start}
.flow-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;align-items:stretch;margin-bottom:32px}
.flow-step{background:rgba(255,255,255,0.92);border:0;border-radius:var(--wt-radius-soft);padding:24px 22px;box-shadow:0 14px 34px rgba(23,32,51,0.075);text-align:center;position:relative;display:flex;flex-direction:column;height:100%;min-height:342px}
.flow-step .flow-step-num{display:flex;align-items:center;justify-content:center;width:48px;height:48px;background:var(--wt-lavender);color:#fff;border-radius:50%;font-size:18px;font-weight:800;margin:0 auto 18px;box-shadow:0 0 0 7px rgba(196,147,63,0.13)}
.flow-step h3{font-size:16px;font-weight:800;color:var(--wt-ink);margin:0 0 12px;line-height:1.34;min-height:64px;display:flex;align-items:center;justify-content:center;text-wrap:balance}
.flow-step p{font-size:14px;color:var(--wt-muted);margin:0;line-height:1.62}
.flow-step .flow-placeholder{background:#e8e4f3;height:100px;border-radius:8px;margin-bottom:12px;display:flex;align-items:center;justify-content:center;color:#8b7cb8;font-size:12px}
.filter-pills{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:24px}
.filter-pill{padding:8px 16px;border-radius:9999px;font-size:14px;font-weight:600;text-decoration:none;border:1px solid var(--wt-border);background:#fff;color:var(--wt-ink);box-shadow:0 6px 18px rgba(23,32,51,0.06)}
.filter-pill.active{background:var(--wt-lavender);color:#fff;border-color:var(--wt-lavender)}
.story-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-bottom:32px}
.story-card{background:#fff;border:0;border-radius:var(--wt-radius-card);overflow:hidden;box-shadow:var(--wt-card-shadow)}
.story-card .story-illustration{height:200px;background:linear-gradient(135deg,#e8e4f3,#f5e6f0);display:flex;align-items:center;justify-content:center;color:#8b7cb8;font-size:14px;overflow:hidden}
.story-card .story-illustration img{width:100%;height:100%;object-fit:cover;display:block}
.story-card .story-info{padding:20px}
.story-card .story-title{font-size:16px;font-weight:700;color:var(--wt-ink);margin-bottom:12px;line-height:1.4}
.story-card .story-meta-badges{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.story-card .story-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--wt-text);padding:6px 10px;border-radius:999px;background:#f8fafc;border:1px solid rgba(23,32,51,0.06);min-width:0}
.story-card .story-badge-icon{display:inline-flex;align-items:center;color:var(--wt-lavender);line-height:1}
.story-card .story-badge-icon-svg{width:14px;height:14px}
.story-card .story-badge-label{font-weight:600}
.story-card .story-badge-value{color:var(--wt-ink)}
.story-card .story-card-cta{display:inline-flex;align-items:center;justify-content:center;padding:8px 14px;border-radius:999px;border:1px solid rgba(116,102,166,0.42);background:rgba(238,234,248,0.42);color:var(--wt-lavender-dark);font-size:13px;font-weight:700;text-decoration:none}
.story-card .story-card-cta:hover{background:rgba(238,234,248,0.78)}
.story-empty-state{max-width:720px;margin:0 auto 32px;padding:32px 28px;border-radius:24px;background:rgba(255,255,255,0.92);box-shadow:0 10px 30px rgba(15,23,42,0.08);text-align:center}
.story-empty-state-icon{font-size:36px;line-height:1;margin-bottom:12px}
.story-empty-state h3{margin:0 0 10px;font-size:24px;color:#1e293b}
.story-empty-state p{margin:0 auto 20px;max-width:560px;font-size:16px;line-height:1.7;color:#64748b}
.benefit-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin-bottom:32px}
.benefit-card{background:#fff;border:0;border-radius:var(--wt-radius-card);padding:24px;box-shadow:var(--wt-card-shadow);overflow:hidden}
.benefit-card .benefit-card-image{height:180px;margin:-24px -24px 16px -24px;overflow:hidden;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}
.benefit-card .benefit-card-image picture{display:block;width:100%;height:100%}
.benefit-card .benefit-card-image img{width:100%;height:100%;object-fit:cover;display:block}
.benefit-card h3{font-size:18px;font-weight:700;color:var(--wt-ink);margin:0 0 12px}
.benefit-card p{font-size:14px;color:var(--wt-muted);margin:0;line-height:1.6}
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
.feature-sticky-card-inner{background:rgba(255,255,255,0.9);backdrop-filter:blur(8px);border-radius:var(--wt-radius-card);box-shadow:0 2px 12px rgba(0,0,0,0.05);overflow:hidden}
.feature-sticky-card-inner .feature-item-image{width:100%;aspect-ratio:4/3;max-height:420px;overflow:hidden;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}
.feature-sticky-card-inner .feature-item-image picture{display:block;width:100%;height:100%}
.feature-sticky-card-inner .feature-item-image img{width:100%;height:100%;object-fit:cover;display:block}
.feature-sticky-card-inner .feature-item-content{padding:20px 24px}
.feature-sticky-card-inner p{font-size:15px;color:#64748b;margin:0;line-height:1.6}
.safety-container{max-width: 800px;margin: 0 auto;background:rgba(255,255,255,0.85);backdrop-filter:blur(12px);border-radius:var(--wt-radius-card);padding:clamp(20px,4vw,32px);box-shadow:0 4px 24px rgba(0,0,0,0.06);margin-bottom:32px}
.safety-points{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.safety-point{display:flex;align-items:center;gap:12px;color:#475569;font-size:15px}
.safety-point::before{content:"✓";color:#10b981;font-weight:700;font-size:18px}
.parent-trust-grid{max-width:1000px;margin:0 auto 32px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.parent-trust-card{background:rgba(255,255,255,0.92);border:0;border-radius:var(--wt-radius-soft);padding:20px;box-shadow:0 4px 18px rgba(15,23,42,0.06)}
.parent-trust-card h3{font-size:17px;line-height:1.35;color:#1e293b;margin:0 0 10px}
.parent-trust-card p{font-size:14px;line-height:1.6;color:#475569;margin:0}
.parent-trust-card a{display:inline-flex;margin-top:12px;color:#7a6ba8;font-weight:700;text-decoration:underline;text-underline-offset:3px}
.multilingual-bullets{width:fit-content;max-width:620px;margin:0 auto 32px;list-style:none;padding:0}
.multilingual-bullets li{display:flex;align-items:flex-start;gap:16px;margin-bottom:18px;color:var(--wt-muted);font-size:18px;line-height:1.45}
.multilingual-bullet-icon{width:36px;height:36px;flex:0 0 36px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,0.74);box-shadow:0 10px 24px rgba(18,27,44,0.07);color:var(--wt-lavender)}
.multilingual-bullet-icon-svg{width:24px;height:24px;display:block}
.multilingual-bullets li:nth-child(2) .multilingual-bullet-icon{color:#5d75ad}
.multilingual-bullets li:nth-child(3) .multilingual-bullet-icon{color:var(--wt-gold)}
.multilingual-bullets li:nth-child(4) .multilingual-bullet-icon{color:#bf675f}
.multilingual-bullet-text{padding-top:4px}
.voice-cards{position:relative;width:100%;max-width:1000px;margin:0 auto 48px;min-height:480px;padding:0 20px}
.voice-card{position:absolute;width:280px;background:#fff;border-radius:var(--wt-radius-soft);padding:16px 20px;box-shadow:0 4px 24px rgba(0,0,0,0.08);display:flex;align-items:center;gap:14px}
.voice-card .voice-avatar{position:relative;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#e8e4f3,#f5e6f0);flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:visible}
.voice-card .voice-avatar-img{width:100%;height:100%;object-fit:cover;border-radius:50%}
.voice-card .voice-avatar-fallback{color:#8b7cb8;font-size:20px;font-weight:600}
.voice-card .voice-info{flex:1;min-width:0}
.voice-card .voice-name{font-size:16px;font-weight:600;color:#1e293b;margin:0 0 4px;min-width:0}
.voice-card .voice-name-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.voice-card .voice-premium-crown{position:absolute;left:-4px;top:-4px;z-index:2;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:#fff;color:var(--wt-gold);box-shadow:0 8px 18px rgba(196,147,63,0.22)}
.voice-card .voice-premium-crown-svg{width:16px;height:16px;display:block}
.voice-card .voice-play{width:44px;height:44px;border-radius:50%;background:#8b7cb8;color:#fff;border:none;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;transition:background 0.2s}
.voice-card .voice-play.playing{background:#7a6ba8}
.voice-card .voice-play:hover{background:#7a6ba8}
.voice-card .voice-play:disabled{opacity:0.5;cursor:not-allowed}
.testimonial-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-bottom:32px}
.testimonial-card{background:#fff;border-radius:var(--wt-radius-card);padding:24px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
.testimonial-card .quote{font-size:16px;line-height:1.6;color:#475569;margin:0 0 12px;font-style:italic}
.testimonial-card .author{font-size:14px;color:#64748b;margin:0}
.plans-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin-bottom:24px}
.plan-card{background:#fff;border-radius:var(--wt-radius-card);padding:clamp(20px,3vw,28px);box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center;position:relative;display:flex;flex-direction:column}
.plan-card.featured{border:2px solid #8b7cb8;box-shadow:0 4px 24px rgba(139,124,184,0.2)}
.plan-card .plan-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#8b7cb8;color:#fff;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600}
.plan-card .plan-name{font-size:20px;font-weight:600;color:#1e293b;margin-bottom:8px}
.plan-card .plan-price{font-size:32px;font-weight:700;color:#1e293b;margin-bottom:12px}
.plan-card .plan-desc{font-size:14px;color:#64748b;margin-bottom:20px;line-height:1.5;flex:1}
.plan-card .plan-cta{margin-top:auto;padding-top:16px}
.landing-currency-toggle-wrap{display:flex;justify-content:center;margin:-8px 0 26px}
.landing-currency-toggle{display:inline-flex;align-items:center;gap:4px;margin:0;padding:4px;border-radius:12px;border:1px solid rgba(139,124,184,.24);background:rgba(255,255,255,.76);box-shadow:0 8px 22px rgba(18,27,44,.06)}
.landing-currency-toggle a{display:inline-flex;align-items:center;justify-content:center;min-width:84px;min-height:38px;padding:0 14px;border-radius:9px;color:#475569;font-size:14px;font-weight:800}
.landing-currency-toggle a.active{background:#8b7cb8;color:#fff;box-shadow:0 8px 20px rgba(139,124,184,.18)}
.pricing-reassurance{text-align:center;font-size:14px;color:#64748b;margin-bottom:24px}
.faq-list{max-width:720px;margin:0 auto 32px}
.faq-accordion-item{border-radius:24px;margin-bottom:14px;overflow:hidden;box-shadow:0 14px 34px rgba(18,27,44,0.08),0 1px 0 rgba(18,27,44,0.05);background:#fff}
.faq-accordion-item summary{display:flex;align-items:center;gap:14px;padding:22px 24px;font-weight:800;color:var(--wt-ink);background:#fff;font-size:17px;cursor:pointer;list-style:none}
.faq-accordion-item summary::-webkit-details-marker{display:none}
.faq-accordion-item summary::before{content:"";flex-shrink:0;width:22px;height:22px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat center;transition:transform 0.2s}
.faq-accordion-item[open] summary::before{transform:rotate(180deg)}
.faq-accordion-item[open]{box-shadow:0 18px 44px rgba(18,27,44,0.1),0 1px 0 rgba(18,27,44,0.06)}
.faq-accordion-item[open] summary{background:#f7f6fc;border-bottom:1px solid rgba(18,27,44,0.08)}
.faq-accordion-item .faq-a{padding:22px 24px 24px;color:#465469;background:#fff;font-size:15px;line-height:1.72}
.faq-accordion-item .faq-a a{color:var(--wt-lavender-dark);text-decoration:underline;text-underline-offset:3px}
.faq-accordion-item .faq-a a:hover{color:#463a70}
.final-cta{margin:clamp(56px,8vw,84px) calc(50% - 50vw) -80px;text-align:center;padding:clamp(76px,9vw,108px) max(20px,calc((100vw - 1200px) / 2 + 24px)) clamp(84px,10vw,116px);background:linear-gradient(180deg,rgba(255,255,255,0.14) 0%,rgba(255,255,255,0) 58%),linear-gradient(135deg,#8068d8 0%,#a86aa6 48%,#d86559 100%);box-shadow:none}
.final-cta h2{font-size:clamp(30px,4.4vw,44px);font-weight:800;color:#fff;max-width:940px;margin:0 auto 16px;line-height:1.14;text-wrap:balance}
.final-cta .final-subheadline{font-size:18px;color:rgba(255,255,255,0.86);max-width:560px;margin:0 auto 32px;line-height:1.6}
.final-cta .actions{margin-top:2px}
.final-cta .cta-purple{background:#fff;color:var(--wt-lavender-dark);border:0;box-shadow:0 18px 38px rgba(39,28,74,0.24)}
.final-cta .cta-purple:hover{background:#fbfaff}
.final-cta .cta-purple-outline{background:rgba(255,255,255,0.18);color:#fff;border:0;box-shadow:0 14px 30px rgba(39,28,74,0.14);backdrop-filter:blur(8px)}
.final-cta .cta-purple-outline:hover{background:rgba(255,255,255,0.28)}
.final-cta .trust-line{font-size:14px;color:rgba(255,255,255,0.72);margin-top:24px}
.cta-block{text-align:center;margin-top:32px}
@media(max-width:1100px){.hero h1{font-size:42px;max-width:760px}.hero .subheadline{font-size:17px}.hero-mockup{margin:-168px -96px -12px}.hero-mockup img{transform:none}}
@media(min-width:701px) and (max-width:1100px){.hero{--tablet-page-pad:clamp(16px,4vw,24px);margin-left:calc(-1 * var(--tablet-page-pad));margin-right:calc(-1 * var(--tablet-page-pad));padding-left:var(--tablet-page-pad);padding-right:var(--tablet-page-pad)}}
@media(min-width:701px) and (max-width:1100px) and (max-height:820px){.brand{margin-bottom:10px}.brand .brand-mark{width:40px;height:40px}.hero{padding-top:12px}.hero h1{font-size:36px;line-height:1.1;margin-bottom:10px}.hero .subheadline{font-size:16px;line-height:1.45;margin-bottom:18px}.hero-mockup{margin:-154px calc(-1 * var(--tablet-page-pad)) -12px}.hero-mockup img{transform:none}}
@media(max-width:900px){.landing{padding-bottom:72px}.hero{padding-top:16px}.hero h1{font-size:40px;max-width:660px}.hero .subheadline{max-width:600px;margin-bottom:24px}.value-cards,.benefit-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.flow-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.plans-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.parent-trust-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.story-cards,.testimonial-cards{grid-template-columns:1fr}.voice-cards{position:static;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:0}.voice-card{position:static;width:100%;left:auto;top:auto;margin:0}.feature-sticky{grid-template-columns:1fr;gap:24px}.feature-sticky-titles{position:static;display:flex;gap:10px;overflow-x:auto;padding:0 2px 10px;scroll-snap-type:x proximity}.feature-sticky-title-item{flex:0 0 min(260px,80vw);padding:12px 14px;border:1px solid rgba(116,102,166,0.24);border-radius:9999px;background:rgba(255,255,255,0.72);scroll-snap-align:start}.feature-sticky-title-item:first-child{padding-top:12px}.feature-sticky-title-item.active{background:#fff;box-shadow:0 2px 10px rgba(15,23,42,0.08)}.feature-sticky-title-item h3{font-size:15px}.feature-sticky-card-inner .feature-item-image{aspect-ratio:16/9;max-height:360px}}
@media(min-width:701px) and (max-width:900px){.value-cards{grid-auto-rows:auto}.value-card--featured{grid-column:1 / -1;grid-row:auto;min-height:0;position:relative;justify-content:flex-start;padding:24px;background:rgba(255,255,255,0.94);color:var(--wt-ink)}.value-card--featured .value-card-image{position:relative;inset:auto;height:260px;margin:-24px -24px 22px;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}.value-card--featured .value-card-image::after{content:none}.value-card--featured h3{position:static;z-index:auto;font-size:22px;color:var(--wt-ink);max-width:none;text-shadow:none}.value-card--featured p{position:static;z-index:auto;color:var(--wt-muted);max-width:none}.value-card--wide{grid-column:auto;grid-row:auto;display:flex;min-height:0}.value-card--wide .value-card-image{grid-column:auto;grid-row:auto;height:auto;aspect-ratio:960 / 644;min-height:0;margin:-24px -24px 16px;align-self:auto;border-radius:0}.value-card--wide .value-card-image img{object-fit:contain}.value-card--wide h3,.value-card--wide p{grid-column:auto;align-self:auto}.flow-step{min-height:304px}}
@media(max-width:700px){.landing{padding:0 16px 64px}.brand{margin-bottom:12px}.hero{--mobile-page-pad:16px;margin-left:calc(-1 * var(--mobile-page-pad));margin-right:calc(-1 * var(--mobile-page-pad));padding:14px var(--mobile-page-pad) 44px}.hero h1{font-size:31px;line-height:1.12;max-width:362px;margin-bottom:12px}.hero .subheadline{font-size:16px;line-height:1.48;margin-bottom:22px}.hero-mockup{margin:-10px calc(-1 * var(--mobile-page-pad)) 10px;width:auto;overflow:visible}.hero-mockup picture{height:auto}.hero-mockup img{width:100%;height:auto;min-height:0;transform:none;filter:none}.actions{gap:10px}.cta-purple,.cta-purple-outline{padding:13px 20px;font-size:15px}.section{padding-top:8px;margin-bottom:48px}.section h2{font-size:26px}.section .section-subtitle{font-size:15px;margin-bottom:24px}.landing-currency-toggle-wrap{margin-top:-6px}.landing-currency-toggle{width:100%;max-width:280px}.landing-currency-toggle a{flex:1;min-width:0}.value-cards,.benefit-cards,.flow-steps,.safety-points,.parent-trust-grid,.plans-grid,.story-cards,.testimonial-cards{grid-template-columns:1fr;gap:16px}.value-card,.benefit-card,.plan-card,.testimonial-card{padding:18px;border-radius:8px}.value-card .value-card-image,.benefit-card .benefit-card-image{height:170px;margin:-18px -18px 14px}.story-card{border-radius:8px}.story-card .story-illustration{height:190px}.story-card .story-info{padding:18px}.story-card .story-meta-badges{gap:6px}.story-card .story-badge{padding:5px 8px;font-size:11px}.feature-sticky-cards{gap:20px}.feature-sticky-card-inner .feature-item-image{aspect-ratio:16/10;max-height:260px}.feature-sticky-card-inner .feature-item-content{padding:16px 18px}.safety-point{align-items:flex-start}.voice-cards{grid-template-columns:1fr;gap:12px}.voice-card{padding:14px 16px;border-radius:8px}.final-cta{margin-top:40px;margin-bottom:-64px;padding:58px 16px 66px}.final-cta h2{font-size:28px}.final-cta .final-subheadline{font-size:16px}.announcement-bar{flex-direction:column;gap:12px}}
@media(max-width:420px){.landing{padding-left:14px;padding-right:14px}.hero{--mobile-page-pad:14px}.hero h1{font-size:30px}.hero-mockup{margin-top:-4px;width:calc(100% + 28px)}.hero .microcopy{gap:8px;font-size:12px}.story-card .story-meta-badges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.story-card .story-badge{justify-content:center}}
@media(max-width:700px){.hero-mockup img{-webkit-mask-image:none;mask-image:none}.value-cards{grid-auto-rows:auto}.value-card,.benefit-card,.flow-step,.story-card,.plan-card,.testimonial-card{border-radius:24px}.value-card--featured,.value-card--wide{grid-column:auto;grid-row:auto;min-height:0;display:flex;position:relative;justify-content:flex-start;background:rgba(255,255,255,0.92);color:var(--wt-ink)}.value-card--featured .value-card-image,.value-card--wide .value-card-image{position:relative;inset:auto;grid-column:auto;grid-row:auto;height:170px;aspect-ratio:auto;min-height:0;margin:-18px -18px 14px;align-self:auto;border-radius:0;background:linear-gradient(135deg,#e8e4f3,#f5e6f0)}.value-card--featured .value-card-image::after{content:none}.value-card--wide .value-card-image{height:auto;aspect-ratio:960 / 644}.value-card--wide .value-card-image img{object-fit:contain}.value-card--featured h3,.value-card--wide h3{position:static;z-index:auto;grid-column:auto;align-self:auto;font-size:19px;line-height:1.32;color:var(--wt-ink);max-width:none;text-shadow:none}.value-card--featured p,.value-card--wide p{position:static;z-index:auto;grid-column:auto;align-self:auto;color:var(--wt-muted);max-width:none}.flow-step{min-height:0;padding:22px 18px}.flow-step h3{min-height:0}.voice-card{border-radius:24px}}
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
const FEATURED_VALUE_IMAGE_WIDTHS = [480, 720, 960, 1264] as const;

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
  if (src === '/skeleton-light-alpha-clean.png') {
    return `/landing/optimized/skeleton-light-alpha-clean-${width}.${format}`;
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

function getLocalizedWizardUrl(webAppUrl: string, locale?: string | null): string {
  return buildAbsoluteRouteUrl(webAppUrl, buildLocalizedAppPath('/wizard', locale));
}

function getLocalizedPricingUrl(webAppUrl: string, locale?: string | null): string {
  return buildAbsoluteRouteUrl(webAppUrl, buildPublicPricingPath(locale));
}

function getLocalizedLandingCurrencyPath(locale: string, currency: BillingCurrency): string {
  return `${getLandingPath(locale)}?currency=${currency}`;
}

function readPlanFeatureLimit(plan: PresentedPlan, slug: string, fallback: number): number {
  const value = plan.features[slug]?.value;
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof value === 'object' && 'limit' in value) {
    const limit = (value as { limit?: unknown }).limit;
    return typeof limit === 'number' ? limit : fallback;
  }
  return fallback;
}

function getPlanPriceForCurrency(plan: PresentedPlan, billingCurrency: BillingCurrency): {
  priceMonthly: number;
  pricingCurrency: BillingCurrency;
} {
  const price = plan.prices[billingCurrency];
  if (price) {
    return {
      priceMonthly: price.priceMonthly,
      pricingCurrency: price.pricingCurrency,
    };
  }

  return {
    priceMonthly: plan.priceMonthly,
    pricingCurrency: normalizeBillingCurrency(plan.pricingCurrency),
  };
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
      <a href="${escapeHtml(getLocalizedWizardUrl(webAppUrl, locale))}" class="cta-purple">Реєстрація →</a>
    </div>
  </div>`;
}

function renderHero(webAppUrl: string, content: LandingContent, locale?: string): string {
  return `
  <section class="hero">
    <div class="brand">
      <img class="brand-mark" src="/icon-192.png" alt="" width="44" height="44" />
      <span class="brand-name">WonderTales</span>
    </div>
    <div class="hero-content">
      <h1>${escapeHtml(content.hero.title)} <span>${escapeHtml(content.hero.highlight)}</span></h1>
      <p class="subheadline">${escapeHtml(content.hero.subheadline)}</p>
      <div class="actions">
        <a href="${escapeHtml(getLocalizedWizardUrl(webAppUrl, locale))}" class="cta-purple">${escapeHtml(content.hero.cta)}</a>
      </div>
    </div>
    
    <div class="hero-mockup">
      ${renderResponsiveImage('/skeleton-light-alpha-clean.png', content.hero.imageAlt, {
        width: 1600,
        height: 893,
        widths: HERO_IMAGE_WIDTHS,
        sizes: '(max-width: 900px) 100vw, 1600px',
        loading: 'eager',
        fetchPriority: 'high',
      })}
    </div>
  </section>`;
}

function orderValueCards(cards: LandingContent['whyFamiliesLove']['cards']) {
  const ordered = [...cards];
  const drawingIndex = ordered.findIndex((card) => card.image === VALUE_CARD_IMAGE.drawing);
  const easyIndex = ordered.findIndex((card) => card.image === VALUE_CARD_IMAGE.easy);

  if (drawingIndex !== -1 && easyIndex !== -1) {
    [ordered[drawingIndex], ordered[easyIndex]] = [ordered[easyIndex], ordered[drawingIndex]];
  }

  return ordered;
}

function getValueCardClass(card: LandingContent['whyFamiliesLove']['cards'][number]): string {
  const classes = ['value-card'];

  if (card.image === VALUE_CARD_IMAGE.easy) {
    classes.push('value-card--featured');
  }

  if (card.image === VALUE_CARD_IMAGE.quick) {
    classes.push('value-card--wide');
  }

  return classes.join(' ');
}

function renderWhyFamiliesLove(_webAppUrl: string, content: LandingContent): string {
  const cards = orderValueCards(content.whyFamiliesLove.cards);
  return `
  <section class="section">
    <h2>${escapeHtml(content.whyFamiliesLove.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.whyFamiliesLove.subtitle)}</p>
    <div class="value-cards">
      ${cards.map((c) => {
        const isFeatured = c.image === VALUE_CARD_IMAGE.easy;
        return `
      <div class="${getValueCardClass(c)}">
        <div class="value-card-image">
          ${renderResponsiveImage(c.image, '', {
            width: 960,
            height: 644,
            widths: isFeatured ? FEATURED_VALUE_IMAGE_WIDTHS : LANDING_IMAGE_WIDTHS,
            sizes: isFeatured
              ? '(max-width: 600px) calc(100vw - 96px), (max-width: 900px) calc((100vw - 120px) / 2), 960px'
              : '(max-width: 600px) calc(100vw - 96px), (max-width: 900px) calc((100vw - 120px) / 2), (max-width: 1200px) 42vw, 460px',
          })}
        </div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.desc)}</p>
      </div>`;
      }).join('')}
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
      <a href="${escapeHtml(getLocalizedWizardUrl(webAppUrl, normalizedLocale))}" class="cta-purple">${escapeHtml(emptyState.cta)}</a>
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
              <span class="story-badge-icon" aria-hidden="true">${STORY_META_ICONS.age}</span>
              <span class="story-badge-label">${escapeHtml(content.exampleStories.ageLabel)}</span>
              <span class="story-badge-value">${escapeHtml(s.age)}</span>
            </div>
            <div class="story-badge">
              <span class="story-badge-icon" aria-hidden="true">${STORY_META_ICONS.reading}</span>
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
  const privacyUrl = buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath('privacy', seoLocale));
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

const PREMIUM_VOICE_NAMES = new Set([
  'orion',
  'andromeda',
  'cassiopeia',
  'оріон',
  'андромеда',
  'кассіопея',
  'орион',
  'кассиопея',
]);

const PREMIUM_VOICE_CROWN_ICON = '<svg class="voice-premium-crown-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M4.2 8.1 8.9 12l3.1-6.2 3.1 6.2 4.7-3.9-1.5 9.3H5.7L4.2 8.1Z" fill="currentColor" opacity="0.18"/><path d="M4.2 8.1 8.9 12l3.1-6.2 3.1 6.2 4.7-3.9-1.5 9.3H5.7L4.2 8.1Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M6.2 20h11.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

function getVoiceAvatarPath(voiceName: string): string {
  const idx = VOICE_AVATAR_MAP[voiceName.toLowerCase()];
  if (idx == null) return '';
  return `/landing/voice-avatars/avatar-${String(idx).padStart(2, '0')}.png`;
}

function isPremiumVoice(voice: LandingVoice): boolean {
  return [voice.name, voice.displayName]
    .map((value) => value.trim().toLowerCase())
    .some((value) => PREMIUM_VOICE_NAMES.has(value));
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
        const isPremium = isPremiumVoice(v);
        const premiumCrown = isPremium ? `<span class="voice-premium-crown" aria-hidden="true">${PREMIUM_VOICE_CROWN_ICON}</span>` : '';
        return `
      <div class="voice-card${isPremium ? ' voice-card--premium' : ''}" style="left:${pos.left}px;top:${pos.top}px">
        <div class="voice-avatar">${avatarHtml}${premiumCrown}</div>
        <div class="voice-info">
          <div class="voice-name"><span class="voice-name-label">${escapeHtml(v.displayName)}</span></div>
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
      ${bullets.map((b, index) => `<li><span class="multilingual-bullet-icon">${MULTILINGUAL_BULLET_ICONS[index % MULTILINGUAL_BULLET_ICONS.length]}</span><span class="multilingual-bullet-text">${escapeHtml(b)}</span></li>`).join('')}
    </ul>
  </section>`;
}

function renderPricing(
  webAppUrl: string,
  dbPlans: PresentedPlan[],
  content: LandingContent,
  locale: string,
  billingCurrency: BillingCurrency
): string {
  const plans =
    dbPlans.length > 0
      ? dbPlans
      : buildFallbackPricingPlans(normalizeLandingLocale(locale), billingCurrency);

  const presentedPlans = plans.map((p) => {
    const selectedPrice = getPlanPriceForCurrency(p, billingCurrency);
    return {
      slug: p.slug,
      name: getPlanDisplayName(locale, p.slug, p.name),
      price: formatPlanPrice(locale, selectedPrice.priceMonthly, selectedPrice.pricingCurrency),
      desc: buildPlanDescription(
        locale,
        p.slug,
        readPlanFeatureLimit(p, 'stories_per_month', 3),
        readPlanFeatureLimit(p, 'audio_stories_per_month', 1),
        readPlanFeatureLimit(p, 'images_per_story', 1)
      ),
      featured: p.slug === 'golden',
    };
  });

  return `
  <section class="section">
    <h2>${escapeHtml(content.pricing.title)}</h2>
    <p class="section-subtitle">${escapeHtml(content.pricing.subtitle)}</p>
    <div class="landing-currency-toggle-wrap">
      <div class="landing-currency-toggle" aria-label="Billing currency">
        ${SUPPORTED_BILLING_CURRENCIES.map((currency) => {
          const href = getLocalizedLandingCurrencyPath(locale, currency);
          return `<a href="${escapeHtml(href)}" class="${billingCurrency === currency ? 'active' : ''}" aria-current="${billingCurrency === currency ? 'true' : 'false'}">${currency === 'EUR' ? '€ EUR' : '$ USD'}</a>`;
        }).join('')}
      </div>
    </div>
    <div class="plans-grid">
      ${presentedPlans.map((p) => `
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
      <a href="${escapeHtml(getLocalizedWizardUrl(webAppUrl, locale))}" class="cta-purple">${escapeHtml(content.faq.cta)}</a>
    </div>
  </section>`;
}

function renderFinalCta(webAppUrl: string, content: LandingContent, locale?: string): string {
  return `
  <section class="final-cta">
    <h2>${escapeHtml(content.finalCta.title)}</h2>
    <p class="final-subheadline">${escapeHtml(content.finalCta.subtitle)}</p>
    <div class="actions">
      <a href="${escapeHtml(getLocalizedWizardUrl(webAppUrl, locale))}" class="cta-purple">${escapeHtml(content.finalCta.primaryCta)}</a>
      <a href="${escapeHtml(getLocalizedPricingUrl(webAppUrl, locale))}" class="cta-purple-outline">${escapeHtml(content.finalCta.secondaryCta)}</a>
    </div>
  </section>`;
}

export function renderLandingHtml(params?: {
  locale?: string;
  exampleStories?: LandingExampleStory[];
  plans?: PresentedPlan[];
  voices?: Array<{ id: string; name: string; displayName: string; sampleAudioUrl: string | null }>;
  billingCurrency?: string | null;
}): string {
  const locale = params?.locale;
  const billingCurrency = normalizeBillingCurrency(params?.billingCurrency ?? DEFAULT_BILLING_CURRENCY);
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
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
      ${renderPricing(webAppUrl, plans, content, locale || 'uk', billingCurrency)}
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
