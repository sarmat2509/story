import {
  buildAbsoluteRouteUrl,
  buildPublicSupportPath,
  normalizePublicSeoLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';
import { config } from '../config';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import { renderSimplePageStructuredData } from './publicStructuredData';
import {
  PUBLIC_FOOTER_STYLES,
  PUBLIC_HEADER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageHeader,
  renderPublicPageFooter,
} from './publicPageFooter';

const SUPPORT_STYLES = `
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.6}
.support-page{min-height:100vh;display:flex;flex-direction:column}
.support-wrap{width:100%;max-width:820px;margin:0 auto;padding:32px 24px 56px;flex:1}
.support-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;box-shadow:0 18px 40px rgba(15,23,42,.06)}
.support-card h1{margin:0 0 12px;font-size:36px;line-height:1.1;color:#0f172a}
.support-card p{margin:0 0 18px;color:#475569}
.support-card h2{margin:32px 0 12px;font-size:20px;color:#0f172a}
.support-list{margin:0 0 24px;padding-left:22px;color:#475569}
.support-list li{margin-bottom:8px}
.support-email{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;background:#111827;color:#fff;text-decoration:none;font-weight:700;box-shadow:0 10px 24px rgba(15,23,42,.16);transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease}
.support-email:hover{opacity:.92;transform:translateY(-1px);box-shadow:0 14px 30px rgba(15,23,42,.20)}
.support-small{font-size:14px;color:#64748b}
${PUBLIC_HEADER_STYLES}
${PUBLIC_FOOTER_STYLES}
`;

interface SupportCopy {
  title: string;
  description: string;
  pricingLabel: string;
  h1: string;
  intro: string;
  parentManagedTitle: string;
  parentManagedBodyA: string;
  parentManagedBodyB: string;
  aiImageTitle: string;
  aiImageBody: string;
  includeTitle: string;
  includeItems: [string, string, string];
  smallPrint: string;
}

const SUPPORT_COPY: Record<PublicSeoLocale, SupportCopy> = {
  uk: {
    title: 'Підтримка — WonderTales',
    description: 'Зв’яжіться з підтримкою WonderTales щодо акаунта, оплати, безпеки, приватності та запитів на видалення даних.',
    pricingLabel: 'Тарифи',
    h1: 'Підтримка',
    intro: 'Ми допомагаємо з доступом до акаунта, оплатою, приватністю дітей, безпекою історій, публікацією, поверненнями, скасуванням і запитами на видалення даних.',
    parentManagedTitle: 'Акаунти під контролем батьків',
    parentManagedBodyA: 'WonderTales створено як сімейний застосунок із керуванням дорослими. Профілі дітей створює та налаштовує один із батьків або законний опікун. Саме дорослі контролюють вік, персоналізацію, ліміти, покупки, завантажені зображення, генерацію історій, поширення та видалення.',
    parentManagedBodyB: 'Діти можуть читати або слухати згенеровані історії, але налаштування акаунта, платежі, завантаження фото, публікація й дії, що стосуються приватності, залишаються під контролем батьків.',
    aiImageTitle: 'Використання AI-зображень',
    aiImageBody: 'WonderTales не змінює обличчя на наявних фото чи відео та не створює оманливі реалістичні медіа. Завантажені зображення використовуються лише як необов’язкові референси для створення безпечних ілюстрованих персонажів у вигаданих історіях.',
    includeTitle: 'Що варто додати у звернення',
    includeItems: [
      'Email вашого акаунта, якщо він у вас є.',
      'URL або назву історії, якщо звернення стосується конкретної історії.',
      'Короткий опис того, що сталося і що саме потрібно змінити.',
    ],
    smallPrint: 'Будь ласка, не надсилайте паролі, номери платіжних карток або чутливі документи, що посвідчують особу, електронною поштою.',
  },
  en: {
    title: 'Support — WonderTales',
    description: 'Contact WonderTales support for account, billing, safety, privacy, and data requests.',
    pricingLabel: 'Pricing',
    h1: 'Support',
    intro: 'We can help with account access, billing, child privacy, story safety, public sharing, refunds, cancellation, and data deletion requests.',
    parentManagedTitle: 'Parent-managed accounts',
    parentManagedBodyA: 'WonderTales is designed as a parent-managed family storytelling app. Child profiles are created and configured by a parent or legal guardian. Parents control age settings, personalization options, content limits, purchases, uploaded images, story generation, sharing, and deletion.',
    parentManagedBodyB: 'Children may read or listen to generated stories, but account setup, payments, image uploads, publication or sharing, and privacy-related actions are controlled by the parent.',
    aiImageTitle: 'AI image use',
    aiImageBody: 'WonderTales does not replace faces in existing photos or videos and does not create deceptive realistic media. Uploaded images are used only as optional references to generate safe, fictional, illustrated story characters.',
    includeTitle: 'What to include',
    includeItems: [
      'Your account email, if you have one.',
      'The story URL or title, if the request is about a story.',
      'A short description of what happened and what you need changed.',
    ],
    smallPrint: 'Please do not send passwords, payment card numbers, or sensitive identity documents by email.',
  },
  ru: {
    title: 'Поддержка — WonderTales',
    description: 'Свяжитесь с поддержкой WonderTales по вопросам аккаунта, оплаты, безопасности, приватности и удаления данных.',
    pricingLabel: 'Тарифы',
    h1: 'Поддержка',
    intro: 'Мы помогаем с доступом к аккаунту, оплатой, приватностью детей, безопасностью историй, публикацией, возвратами, отменой подписки и запросами на удаление данных.',
    parentManagedTitle: 'Аккаунты под контролем родителей',
    parentManagedBodyA: 'WonderTales создан как семейное приложение с управлением взрослыми. Профили детей создает и настраивает родитель или законный опекун. Именно взрослые управляют возрастом, персонализацией, лимитами, покупками, загруженными изображениями, генерацией историй, публикацией и удалением.',
    parentManagedBodyB: 'Дети могут читать или слушать сгенерированные истории, но настройки аккаунта, платежи, загрузка фото, публикация и действия, связанные с приватностью, остаются под контролем родителей.',
    aiImageTitle: 'Использование AI-изображений',
    aiImageBody: 'WonderTales не заменяет лица на существующих фото или видео и не создает вводящие в заблуждение реалистичные медиа. Загруженные изображения используются только как необязательные референсы для создания безопасных иллюстрированных персонажей в вымышленных историях.',
    includeTitle: 'Что добавить в обращение',
    includeItems: [
      'Email вашего аккаунта, если он у вас есть.',
      'URL или название истории, если запрос касается конкретной истории.',
      'Короткое описание того, что произошло и что именно нужно изменить.',
    ],
    smallPrint: 'Пожалуйста, не отправляйте по email пароли, номера банковских карт или чувствительные документы, удостоверяющие личность.',
  },
  es: {
    title: 'Soporte — WonderTales',
    description: 'Contacta con el soporte de WonderTales para temas de cuenta, pagos, seguridad, privacidad y solicitudes de datos.',
    pricingLabel: 'Precios',
    h1: 'Soporte',
    intro: 'Podemos ayudarte con acceso a la cuenta, facturación, privacidad infantil, seguridad de historias, publicación pública, reembolsos, cancelaciones y solicitudes de eliminación de datos.',
    parentManagedTitle: 'Cuentas gestionadas por adultos',
    parentManagedBodyA: 'WonderTales está diseñado como una app familiar gestionada por adultos. Los perfiles infantiles son creados y configurados por un padre, madre o tutor legal. Los adultos controlan la edad, la personalización, los límites, las compras, las imágenes subidas, la generación de historias, el uso compartido y la eliminación.',
    parentManagedBodyB: 'Los niños pueden leer o escuchar historias generadas, pero la configuración de la cuenta, los pagos, la subida de fotos, la publicación o compartición y las acciones relacionadas con la privacidad están controladas por el adulto.',
    aiImageTitle: 'Uso de imágenes con IA',
    aiImageBody: 'WonderTales no sustituye rostros en fotos o vídeos existentes ni crea medios realistas engañosos. Las imágenes subidas se usan solo como referencias opcionales para generar personajes ilustrados, ficticios y seguros.',
    includeTitle: 'Qué incluir',
    includeItems: [
      'El email de tu cuenta, si lo tienes.',
      'La URL o el título de la historia, si la solicitud trata sobre una historia concreta.',
      'Una breve descripción de lo ocurrido y de lo que necesitas cambiar.',
    ],
    smallPrint: 'Por favor, no envíes contraseñas, números de tarjeta ni documentos de identidad sensibles por correo electrónico.',
  },
  de: {
    title: 'Support — WonderTales',
    description: 'Kontaktiere den WonderTales-Support zu Konto, Abrechnung, Sicherheit, Datenschutz und Datenanfragen.',
    pricingLabel: 'Preise',
    h1: 'Support',
    intro: 'Wir helfen bei Kontozugang, Abrechnung, Datenschutz von Kindern, Story-Sicherheit, öffentlichem Teilen, Erstattungen, Kündigungen und Anfragen zur Datenlöschung.',
    parentManagedTitle: 'Von Eltern verwaltete Konten',
    parentManagedBodyA: 'WonderTales ist als Familien-App mit Elternverwaltung konzipiert. Kinderprofile werden von einem Elternteil oder einer erziehungsberechtigten Person erstellt und konfiguriert. Erwachsene steuern Alterseinstellungen, Personalisierung, Limits, Käufe, hochgeladene Bilder, Story-Erstellung, Teilen und Löschen.',
    parentManagedBodyB: 'Kinder können generierte Geschichten lesen oder anhören, aber Kontoeinrichtung, Zahlungen, Foto-Uploads, Veröffentlichung oder Teilen sowie datenschutzbezogene Aktionen bleiben unter elterlicher Kontrolle.',
    aiImageTitle: 'Einsatz von KI-Bildern',
    aiImageBody: 'WonderTales ersetzt keine Gesichter in bestehenden Fotos oder Videos und erstellt keine täuschend echten Medien. Hochgeladene Bilder werden nur als optionale Referenzen verwendet, um sichere, fiktive, illustrierte Figuren zu erzeugen.',
    includeTitle: 'Was enthalten sein sollte',
    includeItems: [
      'Die E-Mail-Adresse deines Kontos, falls vorhanden.',
      'Die URL oder der Titel der Geschichte, wenn sich die Anfrage auf eine konkrete Geschichte bezieht.',
      'Eine kurze Beschreibung dessen, was passiert ist, und was geändert werden soll.',
    ],
    smallPrint: 'Bitte sende keine Passwörter, Kartennummern oder sensible Ausweisdokumente per E-Mail.',
  },
  fr: {
    title: 'Assistance — WonderTales',
    description: 'Contactez l’assistance WonderTales pour le compte, la facturation, la sécurité, la confidentialité et les demandes de données.',
    pricingLabel: 'Tarifs',
    h1: 'Assistance',
    intro: 'Nous pouvons aider pour l’accès au compte, la facturation, la confidentialité des enfants, la sécurité des histoires, le partage public, les remboursements, la résiliation et les demandes de suppression de données.',
    parentManagedTitle: 'Comptes gérés par les parents',
    parentManagedBodyA: 'WonderTales est conçu comme une application familiale gérée par un adulte. Les profils enfants sont créés et configurés par un parent ou un représentant légal. Les adultes contrôlent l’âge, la personnalisation, les limites, les achats, les images envoyées, la génération d’histoires, le partage et la suppression.',
    parentManagedBodyB: 'Les enfants peuvent lire ou écouter des histoires générées, mais la configuration du compte, les paiements, l’envoi de photos, la publication ou le partage et les actions liées à la confidentialité restent sous contrôle parental.',
    aiImageTitle: 'Utilisation des images IA',
    aiImageBody: 'WonderTales ne remplace pas des visages dans des photos ou vidéos existantes et ne crée pas de médias réalistes trompeurs. Les images envoyées servent uniquement de références facultatives pour générer des personnages illustrés, fictifs et sûrs.',
    includeTitle: 'Que joindre',
    includeItems: [
      'L’email de votre compte, si vous en avez un.',
      'L’URL ou le titre de l’histoire, si la demande concerne une histoire précise.',
      'Une brève description de ce qui s’est passé et de ce que vous souhaitez modifier.',
    ],
    smallPrint: 'Merci de ne pas envoyer par email de mot de passe, numéro de carte bancaire ou document d’identité sensible.',
  },
  pl: {
    title: 'Wsparcie — WonderTales',
    description: 'Skontaktuj się ze wsparciem WonderTales w sprawach konta, płatności, bezpieczeństwa, prywatności i danych.',
    pricingLabel: 'Cennik',
    h1: 'Wsparcie',
    intro: 'Pomagamy w sprawach dostępu do konta, płatności, prywatności dzieci, bezpieczeństwa historii, publicznego udostępniania, zwrotów, anulowania oraz usuwania danych.',
    parentManagedTitle: 'Konta zarządzane przez rodziców',
    parentManagedBodyA: 'WonderTales zostało zaprojektowane jako rodzinna aplikacja zarządzana przez dorosłych. Profile dzieci tworzy i konfiguruje rodzic lub opiekun prawny. Dorośli kontrolują wiek, personalizację, limity, zakupy, przesłane obrazy, generowanie historii, udostępnianie i usuwanie.',
    parentManagedBodyB: 'Dzieci mogą czytać lub słuchać wygenerowanych historii, ale konfiguracja konta, płatności, przesyłanie zdjęć, publikacja lub udostępnianie oraz działania związane z prywatnością pozostają pod kontrolą rodzica.',
    aiImageTitle: 'Wykorzystanie obrazów AI',
    aiImageBody: 'WonderTales nie podmienia twarzy na istniejących zdjęciach ani filmach i nie tworzy mylących realistycznych mediów. Przesłane obrazy służą wyłącznie jako opcjonalne referencje do tworzenia bezpiecznych, fikcyjnych, ilustrowanych postaci.',
    includeTitle: 'Co warto dodać',
    includeItems: [
      'Adres email konta, jeśli go posiadasz.',
      'URL lub tytuł historii, jeśli zgłoszenie dotyczy konkretnej historii.',
      'Krótki opis tego, co się wydarzyło i co należy zmienić.',
    ],
    smallPrint: 'Prosimy nie wysyłać mailem haseł, numerów kart płatniczych ani wrażliwych dokumentów tożsamości.',
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface RenderSupportHtmlOptions {
  locale?: string | null;
}

function buildSupportAlternateLinks(webAppUrl: string): string {
  return buildPublicFooterLanguageLinks(webAppUrl, buildPublicSupportPath)
    .map((link) => `<link rel="alternate" hreflang="${link.locale}" href="${escapeHtml(link.href)}">`)
    .concat(
      `<link rel="alternate" hreflang="x-default" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicSupportPath()))}">`
    )
    .join('\n  ');
}

export function renderSupportHtml(options: RenderSupportHtmlOptions = {}): string {
  const resolvedLocale = normalizePublicSeoLocale(options.locale);
  const copy = SUPPORT_COPY[resolvedLocale];
  const webAppUrl = (config.web?.webAppUrl || '').replace(/\/$/, '');
  const supportEmail = config.web?.supportEmail || 'support@wondertales.art';
  const supportUrl = buildAbsoluteRouteUrl(webAppUrl, buildPublicSupportPath(resolvedLocale));
  const languageLinks = buildPublicFooterLanguageLinks(webAppUrl, buildPublicSupportPath);
  const contactPointId = `${supportUrl}#contact-point`;
  const structuredData = renderSimplePageStructuredData({
    webAppUrl,
    pageUrl: supportUrl,
    pageType: 'ContactPage',
    name: copy.title,
    description: copy.description,
    locale: resolvedLocale,
    mainEntityId: contactPointId,
    breadcrumbs: [
      { name: 'WonderTales', url: `${webAppUrl}/` },
      { name: copy.h1, url: supportUrl },
    ],
    extraNodes: [{
      '@type': 'ContactPoint',
      '@id': contactPointId,
      contactType: 'customer support',
      email: supportEmail,
      url: supportUrl,
      availableLanguage: resolvedLocale,
    }],
  });

  return `<!DOCTYPE html>
<html lang="${escapeHtml(resolvedLocale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(copy.title)}</title>
  <meta name="description" content="${escapeHtml(copy.description)}">
  ${PUBLIC_HEAD_ASSET_LINKS}
  <link rel="canonical" href="${escapeHtml(supportUrl)}">
  ${buildSupportAlternateLinks(webAppUrl)}
  ${structuredData}
  <style>${SUPPORT_STYLES}</style>
</head>
<body>
  <div class="support-page">
    ${renderPublicPageHeader(webAppUrl, resolvedLocale, 'support')}
    <main class="support-wrap">
      <section class="support-card">
        <h1>${escapeHtml(copy.h1)}</h1>
        <p>${escapeHtml(copy.intro)}</p>
        <a class="support-email" href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>

        <h2>${escapeHtml(copy.parentManagedTitle)}</h2>
        <p>${escapeHtml(copy.parentManagedBodyA)}</p>
        <p>${escapeHtml(copy.parentManagedBodyB)}</p>

        <h2>${escapeHtml(copy.aiImageTitle)}</h2>
        <p>${escapeHtml(copy.aiImageBody)}</p>

        <h2>${escapeHtml(copy.includeTitle)}</h2>
        <ul class="support-list">
          <li>${escapeHtml(copy.includeItems[0])}</li>
          <li>${escapeHtml(copy.includeItems[1])}</li>
          <li>${escapeHtml(copy.includeItems[2])}</li>
        </ul>

        <p class="support-small">${escapeHtml(copy.smallPrint)}</p>
      </section>
    </main>
    ${renderPublicPageFooter(
      webAppUrl,
      resolvedLocale,
      languageLinks,
      'support'
    )}
  </div>
</body>
</html>`;
}
