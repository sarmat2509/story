import { escapeHtml, getReadingTimeMinutes } from '@wondertales/shared';
import {
  PUBLIC_SEO_LOCALES,
  STORY_COMPLEXITY_AGE_GROUPS,
  buildAbsoluteRouteUrl,
  buildPublicStoriesPath,
  normalizePublicSeoLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';
import type { PublicStoryFormat, PublicStoryListItem } from '@wondertales/shared';
import { config } from '../config';
import { formatLandingAgeGroup, formatLandingDuration } from './landingContent';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import {
  PUBLIC_FOOTER_STYLES,
  PUBLIC_HEADER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageHeader,
  renderPublicPageFooter,
} from './publicPageFooter';

export type PublicStoriesReadingTimeFilter = 'short' | 'medium' | 'long';

export interface PublicStoriesCatalogFilters {
  language?: PublicSeoLocale;
  ageGroup?: string;
  readingTime?: PublicStoriesReadingTimeFilter;
  hasAudio?: boolean;
}

const CATALOG_COPY: Record<PublicSeoLocale, {
  title: string;
  description: string;
  navStories: string;
  navPricing: string;
  eyebrow: string;
  h1: string;
  intro: string;
  storyCount: (count: number) => string;
  readStory: string;
  authorLabel: string;
  emptyTitle: string;
  emptyBody: string;
  fallbackTitle: string;
  fallbackBody: string;
}> = {
  uk: {
    title: 'Опубліковані історії для дітей - WonderTales',
    description: 'Публічний каталог дитячих історій WonderTales з ілюстраціями, читанням і безпечним сімейним контекстом.',
    navStories: 'Історії',
    navPricing: 'Тарифи',
    eyebrow: 'Публічна бібліотека',
    h1: 'Опубліковані історії WonderTales',
    intro: 'Добірка історій, які родини відкрили для публічного перегляду.',
    storyCount: (count) => `${count} історій у каталозі`,
    readStory: 'Читати історію',
    authorLabel: 'Автор',
    emptyTitle: 'Публічних історій поки немає',
    emptyBody: 'Коли родини опублікують історії для каталогу, вони зʼявляться тут.',
    fallbackTitle: 'Більше історій іншими мовами',
    fallbackBody: 'Спершу показуємо історії українською. Нижче — свіжі публічні історії іншими мовами.',
  },
  en: {
    title: 'Published children stories - WonderTales',
    description: 'A public catalog of WonderTales children stories with illustrations, reading time, and family-safe sharing controls.',
    navStories: 'Stories',
    navPricing: 'Pricing',
    eyebrow: 'Public library',
    h1: 'Published WonderTales stories',
    intro: 'A catalog of stories families have intentionally made public.',
    storyCount: (count) => `${count} stories in the catalog`,
    readStory: 'Read story',
    authorLabel: 'Author',
    emptyTitle: 'No public stories yet',
    emptyBody: 'Stories will appear here after families publish them to the public catalog.',
    fallbackTitle: 'More stories in other languages',
    fallbackBody: 'Stories in English appear first. Below are recent public stories in other languages.',
  },
  ru: {
    title: 'Опубликованные детские истории - WonderTales',
    description: 'Публичный каталог детских историй WonderTales с иллюстрациями, временем чтения и безопасным семейным контекстом.',
    navStories: 'Истории',
    navPricing: 'Тарифы',
    eyebrow: 'Публичная библиотека',
    h1: 'Опубликованные истории WonderTales',
    intro: 'Подборка историй, которые семьи открыли для публичного просмотра.',
    storyCount: (count) => `${count} историй в каталоге`,
    readStory: 'Читать историю',
    authorLabel: 'Автор',
    emptyTitle: 'Публичных историй пока нет',
    emptyBody: 'Истории появятся здесь, когда семьи опубликуют их в публичном каталоге.',
    fallbackTitle: 'Еще истории на других языках',
    fallbackBody: 'Сначала показаны истории на русском. Ниже — свежие публичные истории на других языках.',
  },
  es: {
    title: 'Historias infantiles publicados - WonderTales',
    description: 'Un catálogo público de historias infantiles de WonderTales con ilustraciones, tiempo de lectura y controles seguros para familias.',
    navStories: 'Historias',
    navPricing: 'Precios',
    eyebrow: 'Biblioteca pública',
    h1: 'Historias publicados de WonderTales',
    intro: 'Una selección de historias que las familias han decidido compartir públicamente.',
    storyCount: (count) => `${count} historias en el catálogo`,
    readStory: 'Leer historia',
    authorLabel: 'Autor',
    emptyTitle: 'Aún no hay historias públicos',
    emptyBody: 'Las historias aparecerán aquí cuando las familias las publiquen en el catálogo público.',
    fallbackTitle: 'Más historias en otros idiomas',
    fallbackBody: 'Primero mostramos historias en español. Abajo encontrarás historias públicos recientes en otros idiomas.',
  },
  de: {
    title: 'Veröffentlichte Kindergeschichten - WonderTales',
    description: 'Ein öffentlicher Katalog von WonderTales-Kindergeschichten mit Illustrationen, Lesezeit und sicheren Familienfreigaben.',
    navStories: 'Geschichten',
    navPricing: 'Preise',
    eyebrow: 'Öffentliche Bibliothek',
    h1: 'Veröffentlichte WonderTales-Geschichten',
    intro: 'Eine Sammlung von Geschichten, die Familien bewusst öffentlich freigegeben haben.',
    storyCount: (count) => `${count} Geschichten im Katalog`,
    readStory: 'Geschichte lesen',
    authorLabel: 'Autor',
    emptyTitle: 'Noch keine öffentlichen Geschichten',
    emptyBody: 'Geschichten erscheinen hier, sobald Familien sie im öffentlichen Katalog veröffentlichen.',
    fallbackTitle: 'Mehr Geschichten in anderen Sprachen',
    fallbackBody: 'Zuerst zeigen wir deutsche Geschichten. Danach folgen aktuelle öffentliche Geschichten in anderen Sprachen.',
  },
  fr: {
    title: 'Histoires pour enfants publiées - WonderTales',
    description: 'Un catalogue public d’histoires WonderTales pour enfants avec illustrations, temps de lecture et partage familial sécurisé.',
    navStories: 'Histoires',
    navPricing: 'Tarifs',
    eyebrow: 'Bibliothèque publique',
    h1: 'Histoires WonderTales publiées',
    intro: 'Une sélection d’histoires que les familles ont choisi de rendre publiques.',
    storyCount: (count) => `${count} histoires dans le catalogue`,
    readStory: 'Lire l’histoire',
    authorLabel: 'Auteur',
    emptyTitle: 'Aucune histoire publique pour le moment',
    emptyBody: 'Les histoires apparaîtront ici lorsque les familles les publieront dans le catalogue public.',
    fallbackTitle: 'Plus d’histoires dans d’autres langues',
    fallbackBody: 'Les histoires en français apparaissent d’abord. Ensuite, vous trouverez des histoires publiques récentes dans d’autres langues.',
  },
  pl: {
    title: 'Opublikowane historie dla dzieci - WonderTales',
    description: 'Publiczny katalog historii WonderTales dla dzieci z ilustracjami, czasem czytania i bezpiecznym udostępnianiem rodzinnym.',
    navStories: 'Historie',
    navPricing: 'Cennik',
    eyebrow: 'Biblioteka publiczna',
    h1: 'Opublikowane historie WonderTales',
    intro: 'Zbiór historii, które rodziny świadomie udostępniły publicznie.',
    storyCount: (count) => `${count} historii w katalogu`,
    readStory: 'Czytaj historię',
    authorLabel: 'Autor',
    emptyTitle: 'Nie ma jeszcze publicznych historii',
    emptyBody: 'Historie pojawią się tutaj, gdy rodziny opublikują je w publicznym katalogu.',
    fallbackTitle: 'Więcej historii w innych językach',
    fallbackBody: 'Najpierw pokazujemy historie po polsku. Niżej znajdziesz najnowsze publiczne historie w innych językach.',
  },
};

const CATALOG_FILTER_COPY: Record<PublicSeoLocale, {
  title: string;
  language: string;
  allLanguages: string;
  age: string;
  allAges: string;
  readingTime: string;
  allReadingTimes: string;
  audioOnly: string;
  apply: string;
  reset: string;
  previous: string;
  next: string;
  pageLabel: (page: number, totalPages: number) => string;
  noResultsTitle: string;
  noResultsBody: string;
  invalidPageTitle: string;
  invalidPageBody: string;
  backToFirst: string;
}> = {
  uk: {
    title: 'Підібрати історії', language: 'Мова', allLanguages: 'Усі мови', age: 'Вік',
    allAges: 'Для будь-якого віку', readingTime: 'Час читання', allReadingTimes: 'Будь-яка тривалість',
    audioOnly: 'Лише з аудіо', apply: 'Застосувати', reset: 'Скинути', previous: 'Попередня', next: 'Наступна',
    pageLabel: (page, totalPages) => `Сторінка ${page} з ${totalPages}`,
    noResultsTitle: 'Історій за цими фільтрами не знайдено', noResultsBody: 'Спробуйте змінити або скинути фільтри.',
    invalidPageTitle: 'Такої сторінки немає', invalidPageBody: 'Поверніться на початок каталогу й оберіть доступну сторінку.',
    backToFirst: 'До першої сторінки',
  },
  en: {
    title: 'Find stories', language: 'Language', allLanguages: 'All languages', age: 'Age',
    allAges: 'All ages', readingTime: 'Reading time', allReadingTimes: 'Any length',
    audioOnly: 'Audio only', apply: 'Apply', reset: 'Reset', previous: 'Previous', next: 'Next',
    pageLabel: (page, totalPages) => `Page ${page} of ${totalPages}`,
    noResultsTitle: 'No stories match these filters', noResultsBody: 'Try changing or resetting the filters.',
    invalidPageTitle: 'This page does not exist', invalidPageBody: 'Return to the start of the catalog and choose an available page.',
    backToFirst: 'Go to the first page',
  },
  ru: {
    title: 'Подобрать истории', language: 'Язык', allLanguages: 'Все языки', age: 'Возраст',
    allAges: 'Для любого возраста', readingTime: 'Время чтения', allReadingTimes: 'Любая длительность',
    audioOnly: 'Только с аудио', apply: 'Применить', reset: 'Сбросить', previous: 'Предыдущая', next: 'Следующая',
    pageLabel: (page, totalPages) => `Страница ${page} из ${totalPages}`,
    noResultsTitle: 'Историй с такими фильтрами не найдено', noResultsBody: 'Попробуйте изменить или сбросить фильтры.',
    invalidPageTitle: 'Такой страницы нет', invalidPageBody: 'Вернитесь в начало каталога и выберите доступную страницу.',
    backToFirst: 'На первую страницу',
  },
  es: {
    title: 'Buscar historias', language: 'Idioma', allLanguages: 'Todos los idiomas', age: 'Edad',
    allAges: 'Todas las edades', readingTime: 'Tiempo de lectura', allReadingTimes: 'Cualquier duración',
    audioOnly: 'Solo con audio', apply: 'Aplicar', reset: 'Restablecer', previous: 'Anterior', next: 'Siguiente',
    pageLabel: (page, totalPages) => `Página ${page} de ${totalPages}`,
    noResultsTitle: 'No hay historias con estos filtros', noResultsBody: 'Prueba a cambiar o restablecer los filtros.',
    invalidPageTitle: 'Esta página no existe', invalidPageBody: 'Vuelve al inicio del catálogo y elige una página disponible.',
    backToFirst: 'Ir a la primera página',
  },
  de: {
    title: 'Geschichten finden', language: 'Sprache', allLanguages: 'Alle Sprachen', age: 'Alter',
    allAges: 'Alle Altersgruppen', readingTime: 'Lesezeit', allReadingTimes: 'Beliebige Länge',
    audioOnly: 'Nur mit Audio', apply: 'Anwenden', reset: 'Zurücksetzen', previous: 'Zurück', next: 'Weiter',
    pageLabel: (page, totalPages) => `Seite ${page} von ${totalPages}`,
    noResultsTitle: 'Keine Geschichten für diese Filter', noResultsBody: 'Ändere die Filter oder setze sie zurück.',
    invalidPageTitle: 'Diese Seite existiert nicht', invalidPageBody: 'Kehre zum Anfang des Katalogs zurück und wähle eine verfügbare Seite.',
    backToFirst: 'Zur ersten Seite',
  },
  fr: {
    title: 'Trouver des histoires', language: 'Langue', allLanguages: 'Toutes les langues', age: 'Âge',
    allAges: 'Tous les âges', readingTime: 'Temps de lecture', allReadingTimes: 'Toute durée',
    audioOnly: 'Avec audio uniquement', apply: 'Appliquer', reset: 'Réinitialiser', previous: 'Précédente', next: 'Suivante',
    pageLabel: (page, totalPages) => `Page ${page} sur ${totalPages}`,
    noResultsTitle: 'Aucune histoire ne correspond à ces filtres', noResultsBody: 'Essayez de modifier ou de réinitialiser les filtres.',
    invalidPageTitle: 'Cette page n’existe pas', invalidPageBody: 'Revenez au début du catalogue et choisissez une page disponible.',
    backToFirst: 'Aller à la première page',
  },
  pl: {
    title: 'Znajdź historie', language: 'Język', allLanguages: 'Wszystkie języki', age: 'Wiek',
    allAges: 'Każdy wiek', readingTime: 'Czas czytania', allReadingTimes: 'Dowolna długość',
    audioOnly: 'Tylko z audio', apply: 'Zastosuj', reset: 'Wyczyść', previous: 'Poprzednia', next: 'Następna',
    pageLabel: (page, totalPages) => `Strona ${page} z ${totalPages}`,
    noResultsTitle: 'Brak historii dla tych filtrów', noResultsBody: 'Zmień lub wyczyść filtry.',
    invalidPageTitle: 'Ta strona nie istnieje', invalidPageBody: 'Wróć na początek katalogu i wybierz dostępną stronę.',
    backToFirst: 'Do pierwszej strony',
  },
};

const FORMAT_LABELS: Record<PublicSeoLocale, Record<PublicStoryFormat, string>> = {
  uk: { story: 'Історія', graphic_novel: 'Комікс', mixed_story: 'Історія + комікс' },
  en: { story: 'Story', graphic_novel: 'Comic', mixed_story: 'Story + comic' },
  ru: { story: 'История', graphic_novel: 'Комикс', mixed_story: 'История + комикс' },
  es: { story: 'Historia', graphic_novel: 'Cómic', mixed_story: 'Historia + cómic' },
  de: { story: 'Geschichte', graphic_novel: 'Comic', mixed_story: 'Geschichte + Comic' },
  fr: { story: 'Histoire', graphic_novel: 'BD', mixed_story: 'Histoire + BD' },
  pl: { story: 'Historia', graphic_novel: 'Komiks', mixed_story: 'Historia + komiks' },
};

const CATALOG_STYLES = `
*{box-sizing:border-box}
html,body{min-height:100%}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f8fafc;color:#172033}
#root{min-height:100vh;display:flex;flex-direction:column}
a{color:inherit;text-decoration:none}
.page{width:100%;max-width:1180px;margin:0 auto;padding:28px 20px 56px;flex:1 0 auto}
.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;margin-bottom:28px}
.eyebrow{margin:0 0 8px;color:#6d5bd0;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
h1{font-size:42px;line-height:1.08;margin:0 0 14px;letter-spacing:0}
.intro{max-width:720px;margin:0;color:#475569;font-size:17px;line-height:1.65}
.count{margin:0;padding:10px 14px;border:1px solid #dbe3ef;border-radius:999px;background:#fff;color:#334155;font-size:14px;font-weight:700;white-space:nowrap}
.filters{margin:0 0 28px;padding:20px;border:1px solid #dbe3ef;border-radius:12px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.04)}
.filters fieldset{margin:0;padding:0;border:0;min-width:0}
.filters legend{margin:0 0 14px;padding:0;color:#172033;font-size:17px;font-weight:800}
.filter-grid{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr)) auto auto;gap:14px;align-items:end}
.filter-field{display:flex;flex-direction:column;gap:6px;color:#334155;font-size:13px;font-weight:700}
.filter-field select{width:100%;min-height:48px;padding:0 42px 0 16px;border:1px solid #d8c7f2;border-radius:9999px;background:#f4eefb;color:#1b1340;font:inherit;font-size:14px;font-weight:500;transition:background-color .18s ease,border-color .18s ease,box-shadow .18s ease}
.filter-field select:hover{border-color:#c7b6ec;background:#f6f1fc;box-shadow:0 2px 10px rgba(27,19,64,.12)}
.filter-field select:focus-visible{outline:2px solid #7b66c7;outline-offset:2px}
.audio-filter{min-height:48px;display:flex;align-items:center;gap:8px;padding:0 16px;border:1px solid #d8c7f2;border-radius:9999px;background:#f4eefb;color:#1b1340;font-size:14px;font-weight:700;white-space:nowrap;transition:background-color .18s ease,border-color .18s ease,box-shadow .18s ease}
.audio-filter:hover{border-color:#c7b6ec;background:#f6f1fc;box-shadow:0 2px 10px rgba(27,19,64,.12)}
.audio-filter input{width:17px;height:17px;accent-color:#6d5bd0}
.filter-actions{display:flex;align-items:center;gap:12px;margin-top:12px}
.filter-submit{min-height:48px;padding:10px 20px;border:0;border-radius:9999px;background:#7b66c7;color:#fff;font:inherit;font-weight:800;cursor:pointer;transition:background-color .18s ease,box-shadow .18s ease}
.filter-submit:hover{background:#5a45a3;box-shadow:0 2px 10px rgba(27,19,64,.16)}
.filter-reset{color:#5b4bc4;font-size:14px;font-weight:800;text-decoration:underline;text-underline-offset:3px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.fallback-note{grid-column:1/-1;padding:24px;border:0;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,0) 62%),radial-gradient(circle at 12% 18%,rgba(255,227,210,.34),transparent 30%),linear-gradient(135deg,#8068d8 0%,#a86aa6 48%,#d86559 100%);color:rgba(255,255,255,.88);box-shadow:0 14px 32px rgba(91,75,196,.18)}
.fallback-note h2{margin:0 0 6px;font-size:22px;line-height:1.25;color:#fff}
.fallback-note p{margin:0;font-size:14px;line-height:1.6}
.card{background:#fff;border:1px solid #dbe3ef;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;min-height:100%;box-shadow:0 10px 24px rgba(15,23,42,.06)}
.thumb{aspect-ratio:16/9;width:100%;object-fit:cover;background:#e2e8f0;display:block}
.thumb-placeholder{aspect-ratio:16/9;background:linear-gradient(135deg,#e0f2fe,#fef3c7);display:flex;align-items:center;justify-content:center;color:#334155;font-weight:800}
.card-body{padding:16px;display:flex;flex-direction:column;gap:10px;flex:1}
.badges{display:flex;flex-wrap:wrap;gap:6px}
.format-badge{display:inline-flex;align-items:center;width:max-content;padding:5px 9px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:12px;font-weight:800}
.card h2{font-size:19px;line-height:1.25;margin:0;color:#172033}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:0;color:#64748b;font-size:13px}
.meta span{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:#f1f5f9}
.author{margin:0;color:#475569;font-size:14px}
.author a{text-decoration:underline;text-underline-offset:3px}
.excerpt{margin:0;color:#475569;font-size:14px;line-height:1.6}
.read{display:inline-flex;margin-top:auto;color:#5b4bc4;font-weight:800;font-size:14px;transition:transform .18s ease,color .18s ease}
.read:hover{color:#463bb1;transform:translateY(-1px)}
.empty{background:#fff;border:1px solid #dbe3ef;border-radius:8px;padding:30px;text-align:center;color:#475569}
.empty h2{margin:0 0 8px;color:#172033}
.empty a{display:inline-flex;margin-top:10px;color:#5b4bc4;font-weight:800;text-decoration:underline;text-underline-offset:3px}
.pagination{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;margin-top:30px}
.pagination a,.pagination span{min-width:40px;min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:8px 11px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-size:14px;font-weight:800}
.pagination a:hover{border-color:#8b7ee0;color:#5b4bc4;transform:translateY(-1px)}
.pagination [aria-current="page"]{border-color:#5b4bc4;background:#5b4bc4;color:#fff}
.pagination .page-step{padding-inline:14px}
.pagination .page-gap{min-width:auto;border:0;background:transparent;padding-inline:2px}
.page-status{margin:12px 0 0;text-align:center;color:#64748b;font-size:13px}
@media(max-width:1050px){.filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.audio-filter,.filter-submit{justify-content:center}}
@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:34px}.hero{grid-template-columns:1fr}.count{justify-self:start}}
@media(max-width:560px){.page{padding:22px 16px 44px}.grid,.filter-grid{grid-template-columns:1fr}h1{font-size:30px}.filters{padding:16px}.filter-submit{width:100%}.pagination .page-number,.pagination .page-gap{display:none}.pagination .page-step{flex:1}.fallback-note{padding:20px}}
${PUBLIC_HEADER_STYLES}
${PUBLIC_FOOTER_STYLES}
`;

function absoluteUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = baseUrl.replace(/\/$/, '');
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
}

function trimExcerpt(value: string | null | undefined, maxLength = 150): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function getStoryImage(story: PublicStoryListItem, apiBase: string): string | null {
  return absoluteUrl(
    story.coverImageUrl ?? story.scenes.find((scene) => scene.imageUrl)?.imageUrl,
    apiBase
  );
}

function getLanguageName(language: string, locale: PublicSeoLocale): string {
  const names: Record<string, Record<PublicSeoLocale, string>> = {
    uk: { uk: 'Українська', en: 'Ukrainian', ru: 'Украинский', es: 'Ucraniano', de: 'Ukrainisch', fr: 'Ukrainien', pl: 'Ukraiński' },
    en: { uk: 'Англійська', en: 'English', ru: 'Английский', es: 'Inglés', de: 'Englisch', fr: 'Anglais', pl: 'Angielski' },
    es: { uk: 'Іспанська', en: 'Spanish', ru: 'Испанский', es: 'Español', de: 'Spanisch', fr: 'Espagnol', pl: 'Hiszpański' },
    ru: { uk: 'Російська', en: 'Russian', ru: 'Русский', es: 'Ruso', de: 'Russisch', fr: 'Russe', pl: 'Rosyjski' },
    de: { uk: 'Німецька', en: 'German', ru: 'Немецкий', es: 'Alemán', de: 'Deutsch', fr: 'Allemand', pl: 'Niemiecki' },
    fr: { uk: 'Французька', en: 'French', ru: 'Французский', es: 'Francés', de: 'Französisch', fr: 'Français', pl: 'Francuski' },
    pl: { uk: 'Польська', en: 'Polish', ru: 'Польский', es: 'Polaco', de: 'Polnisch', fr: 'Polonais', pl: 'Polski' },
  };
  return names[language]?.[locale] ?? language.toUpperCase();
}

function hasCatalogFilters(filters: PublicStoriesCatalogFilters): boolean {
  return !!(
    filters.language ||
    filters.ageGroup ||
    filters.readingTime ||
    filters.hasAudio
  );
}

export function buildPublicStoriesCatalogPath(
  locale: PublicSeoLocale,
  filters: PublicStoriesCatalogFilters,
  page = 1
): string {
  const searchParams = new URLSearchParams();
  if (filters.language) searchParams.set('language', filters.language);
  if (filters.ageGroup) searchParams.set('age', filters.ageGroup);
  if (filters.readingTime) searchParams.set('reading', filters.readingTime);
  if (filters.hasAudio) searchParams.set('audio', '1');
  if (page > 1) searchParams.set('page', String(page));
  const query = searchParams.toString();
  return `${buildPublicStoriesPath(locale)}${query ? `?${query}` : ''}`;
}

function renderAlternateLinks(
  webAppUrl: string,
  locale: PublicSeoLocale,
  filters: PublicStoriesCatalogFilters,
  page: number
): string {
  const canonical = buildAbsoluteRouteUrl(
    webAppUrl,
    buildPublicStoriesCatalogPath(locale, filters, page)
  );
  if (hasCatalogFilters(filters)) {
    return `<link rel="canonical" href="${escapeHtml(canonical)}">`;
  }
  const alternates = PUBLIC_SEO_LOCALES.map((altLocale) => {
    const href = buildAbsoluteRouteUrl(
      webAppUrl,
      buildPublicStoriesCatalogPath(altLocale, {}, page)
    );
    return `<link rel="alternate" hreflang="${altLocale}" href="${escapeHtml(href)}">`;
  });
  const xDefault = buildAbsoluteRouteUrl(
    webAppUrl,
    buildPublicStoriesCatalogPath(normalizePublicSeoLocale(), {}, page)
  );
  return [
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    ...alternates,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(xDefault)}">`,
  ].join('\n  ');
}

function renderPaginationHeadLinks(
  webAppUrl: string,
  locale: PublicSeoLocale,
  filters: PublicStoriesCatalogFilters,
  page: number,
  totalPages: number
): string {
  const links: string[] = [];
  if (page > 1) {
    links.push(
      `<link rel="prev" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesCatalogPath(locale, filters, page - 1)))}">`
    );
  }
  if (page < totalPages) {
    links.push(
      `<link rel="next" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesCatalogPath(locale, filters, page + 1)))}">`
    );
  }
  return links.join('\n  ');
}

function selected(value: string | undefined, candidate: string): string {
  return value === candidate ? ' selected' : '';
}

function renderCatalogFilters(
  locale: PublicSeoLocale,
  filters: PublicStoriesCatalogFilters,
  webAppUrl: string
): string {
  const copy = CATALOG_FILTER_COPY[locale];
  const action = buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(locale));
  const languageOptions = PUBLIC_SEO_LOCALES.map(
    (language) =>
      `<option value="${language}"${selected(filters.language, language)}>${escapeHtml(getLanguageName(language, locale))}</option>`
  ).join('');
  const ageOptions = STORY_COMPLEXITY_AGE_GROUPS.map(
    (ageGroup) =>
      `<option value="${escapeHtml(ageGroup)}"${selected(filters.ageGroup, ageGroup)}>${escapeHtml(formatLandingAgeGroup(locale, ageGroup))}</option>`
  ).join('');

  return `<form class="filters" method="get" action="${escapeHtml(action)}">
    <fieldset>
      <legend>${escapeHtml(copy.title)}</legend>
      <div class="filter-grid">
        <label class="filter-field" for="catalog-language">${escapeHtml(copy.language)}
          <select id="catalog-language" name="language">
            <option value="">${escapeHtml(copy.allLanguages)}</option>${languageOptions}
          </select>
        </label>
        <label class="filter-field" for="catalog-age">${escapeHtml(copy.age)}
          <select id="catalog-age" name="age">
            <option value="">${escapeHtml(copy.allAges)}</option>${ageOptions}
          </select>
        </label>
        <label class="filter-field" for="catalog-reading">${escapeHtml(copy.readingTime)}
          <select id="catalog-reading" name="reading">
            <option value="">${escapeHtml(copy.allReadingTimes)}</option>
            <option value="short"${selected(filters.readingTime, 'short')}>≤ 5 min</option>
            <option value="medium"${selected(filters.readingTime, 'medium')}>6–10 min</option>
            <option value="long"${selected(filters.readingTime, 'long')}>11+ min</option>
          </select>
        </label>
        <label class="audio-filter"><input type="checkbox" name="audio" value="1"${filters.hasAudio ? ' checked' : ''}> ${escapeHtml(copy.audioOnly)}</label>
        <button class="filter-submit" type="submit">${escapeHtml(copy.apply)}</button>
      </div>
      ${hasCatalogFilters(filters) ? `<div class="filter-actions"><a class="filter-reset" href="${escapeHtml(action)}">${escapeHtml(copy.reset)}</a></div>` : ''}
    </fieldset>
  </form>`;
}

function paginationPages(currentPage: number, totalPages: number): Array<number | 'gap'> {
  const visible = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const pages = [...visible]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) result.push('gap');
    result.push(page);
  });
  return result;
}

function renderCatalogPagination(
  locale: PublicSeoLocale,
  filters: PublicStoriesCatalogFilters,
  page: number,
  totalPages: number,
  webAppUrl: string
): string {
  if (totalPages <= 1) return '';
  const copy = CATALOG_FILTER_COPY[locale];
  const link = (targetPage: number, label: string, className: string) =>
    `<a class="${className}" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesCatalogPath(locale, filters, targetPage)))}" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</a>`;
  const pageLinks = paginationPages(page, totalPages).map((entry) => {
    if (entry === 'gap') return '<span class="page-gap" aria-hidden="true">…</span>';
    const label = String(entry);
    return entry === page
      ? `<span class="page-number" aria-current="page" aria-label="${escapeHtml(copy.pageLabel(entry, totalPages))}">${label}</span>`
      : link(entry, label, 'page-number');
  }).join('');

  return `<nav class="pagination" aria-label="${escapeHtml(copy.pageLabel(page, totalPages))}">
    ${page > 1 ? link(page - 1, copy.previous, 'page-step') : ''}
    ${pageLinks}
    ${page < totalPages ? link(page + 1, copy.next, 'page-step') : ''}
  </nav><p class="page-status">${escapeHtml(copy.pageLabel(page, totalPages))}</p>`;
}

function renderStoryCard(
  story: PublicStoryListItem,
  locale: PublicSeoLocale,
  webAppUrl: string,
  apiBase: string,
  copy: typeof CATALOG_COPY[PublicSeoLocale]
): string {
  const storyUrl = buildAbsoluteRouteUrl(webAppUrl, `/stories/${encodeURIComponent(story.publishedSlug)}`);
  const authorUrl = buildAbsoluteRouteUrl(webAppUrl, `/authors/${encodeURIComponent(story.authorId)}`);
  const imageUrl = getStoryImage(story, apiBase);
  const readingTime = formatLandingDuration(locale, getReadingTimeMinutes(story.scenes));
  const age = formatLandingAgeGroup(locale, story.ageGroup);
  const language = getLanguageName(story.language, locale);
  const excerpt = trimExcerpt(story.scenes[0]?.text || '');

  return `<article class="card">
    <a href="${escapeHtml(storyUrl)}" aria-label="${escapeHtml(story.title)}">
      ${
        imageUrl
          ? `<img class="thumb" src="${escapeHtml(imageUrl)}" alt="" loading="lazy">`
          : '<div class="thumb-placeholder">WonderTales</div>'
      }
    </a>
    <div class="card-body">
      <div class="badges"><span class="format-badge">${escapeHtml(FORMAT_LABELS[locale][story.storyFormat ?? 'story'])}</span></div>
      <h2><a href="${escapeHtml(storyUrl)}">${escapeHtml(story.title)}</a></h2>
      <p class="meta">
        <span>${escapeHtml(age)}</span>
        <span>${escapeHtml(readingTime)}</span>
        <span>${escapeHtml(language)}</span>
      </p>
      <p class="author">${escapeHtml(copy.authorLabel)} <a href="${escapeHtml(authorUrl)}">${escapeHtml(story.authorDisplayName)}</a></p>
      ${excerpt ? `<p class="excerpt">${escapeHtml(excerpt)}</p>` : ''}
      <a class="read" href="${escapeHtml(storyUrl)}">${escapeHtml(copy.readStory)}</a>
    </div>
  </article>`;
}

export function renderPublicStoriesCatalogHtml(params: {
  locale?: string | null;
  stories: PublicStoryListItem[];
  total: number;
  fallbackStartIndex?: number | null;
  page?: number;
  pageSize?: number;
  filters?: PublicStoriesCatalogFilters;
  invalidPage?: boolean;
}): string {
  const locale = normalizePublicSeoLocale(params.locale);
  const copy = CATALOG_COPY[locale];
  const filterCopy = CATALOG_FILTER_COPY[locale];
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || 'https://wondertales.art';
  const apiBase = config.web?.apiPublicUrl?.replace(/\/$/, '') || webAppUrl;
  const filters = params.filters ?? {};
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 24);
  const totalPages = Math.max(1, Math.ceil(params.total / pageSize));
  const invalidPage = params.invalidPage === true;
  const isFiltered = hasCatalogFilters(filters);
  const robots = invalidPage || isFiltered ? 'noindex,follow' : 'index,follow';
  const pageSuffix = page > 1 ? ` — ${filterCopy.pageLabel(page, totalPages)}` : '';
  const documentTitle = `${copy.title}${pageSuffix}`;
  const canonicalUrl = buildAbsoluteRouteUrl(
    webAppUrl,
    buildPublicStoriesCatalogPath(locale, filters, page)
  );
  const fallbackStartIndex =
    typeof params.fallbackStartIndex === 'number' &&
    params.fallbackStartIndex >= 0 &&
    params.fallbackStartIndex < params.stories.length
      ? params.fallbackStartIndex
      : null;
  const storyCards = params.stories.map((story, index) => {
    const fallbackNote = fallbackStartIndex === index
      ? `<div class="fallback-note"><h2>${escapeHtml(copy.fallbackTitle)}</h2><p>${escapeHtml(copy.fallbackBody)}</p></div>`
      : '';
    return `${fallbackNote}${renderStoryCard(story, locale, webAppUrl, apiBase, copy)}`;
  }).join('\n');
  const emptyContent = invalidPage
    ? `<section class="empty"><h2>${escapeHtml(filterCopy.invalidPageTitle)}</h2><p>${escapeHtml(filterCopy.invalidPageBody)}</p><a href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesCatalogPath(locale, filters)))}">${escapeHtml(filterCopy.backToFirst)}</a></section>`
    : isFiltered
      ? `<section class="empty"><h2>${escapeHtml(filterCopy.noResultsTitle)}</h2><p>${escapeHtml(filterCopy.noResultsBody)}</p><a href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(locale)))}">${escapeHtml(filterCopy.reset)}</a></section>`
      : `<section class="empty"><h2>${escapeHtml(copy.emptyTitle)}</h2><p>${escapeHtml(copy.emptyBody)}</p></section>`;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(documentTitle)}</title>
  <meta name="description" content="${escapeHtml(copy.description)}">
  <meta name="robots" content="${robots}">
  ${renderAlternateLinks(webAppUrl, locale, filters, page)}
  ${renderPaginationHeadLinks(webAppUrl, locale, filters, page, totalPages)}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(documentTitle)}">
  <meta property="og:description" content="${escapeHtml(copy.description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  ${PUBLIC_HEAD_ASSET_LINKS}
  <style>${CATALOG_STYLES}</style>
</head>
<body>
  <div id="root">
    ${renderPublicPageHeader(webAppUrl, locale, 'stories')}
    <main class="page">
      <section class="hero">
        <div>
          <p class="eyebrow">${escapeHtml(copy.eyebrow)}</p>
          <h1>${escapeHtml(copy.h1)}</h1>
          <p class="intro">${escapeHtml(copy.intro)}</p>
        </div>
        <p class="count">${escapeHtml(copy.storyCount(params.total))}</p>
      </section>
      ${renderCatalogFilters(locale, filters, webAppUrl)}
      ${
        params.stories.length > 0
          ? `<section class="grid">${storyCards}</section>${renderCatalogPagination(locale, filters, page, totalPages, webAppUrl)}`
          : emptyContent
      }
    </main>
    ${renderPublicPageFooter(webAppUrl, locale, buildPublicFooterLanguageLinks(webAppUrl, buildPublicStoriesPath), 'stories')}
  </div>
</body>
</html>`;
}
