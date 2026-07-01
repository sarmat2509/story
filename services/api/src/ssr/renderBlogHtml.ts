import {
  DEFAULT_PUBLIC_SEO_LOCALE,
  PUBLIC_SEO_LOCALES,
  APP_ROUTE_PATHS,
  buildAbsoluteRouteUrl,
  buildPublicAppEntryPath,
  buildPublicBlogArticlePath,
  buildPublicBlogIndexPath,
  buildPublicLandingPath,
  escapeHtml,
  normalizePublicSeoLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';
import { config } from '../config';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import {
  PUBLIC_FOOTER_STYLES,
  PUBLIC_HEADER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageHeader,
  renderPublicPageFooter,
} from './publicPageFooter';
import {
  getBlogArticle,
  listBlogArticles,
  type BlogArticleSummary,
  type BlogInlineImage,
  type BlogSection,
  type BlogArticleView,
} from './blogContent';

const BLOG_STRUCTURED_DATA_LOGO_PATH = '/icon-512.png';

const BLOG_INDEX_COPY: Record<PublicSeoLocale, {
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  navStories: string;
  navPricing: string;
  readMore: string;
  updated: string;
}> = {
  uk: {
    title: 'Блог для батьків — WonderTales',
    description: 'Доказові та практичні матеріали для батьків про персоналізовані історії, аудіоісторії, читання, увагу, сон і дитячі історії.',
    eyebrow: 'WonderTales Blog',
    h1: 'Ідеї для історій, які справді допомагають родині',
    intro: 'Пишемо про дитячу увагу, мову, сон, персоналізацію й безпечну творчість без порожнього маркетингу.',
    navStories: 'Історії',
    navPricing: 'Тарифи',
    readMore: 'Читати',
    updated: 'Оновлено',
  },
  en: {
    title: 'Parent blog — WonderTales',
    description: 'Evidence-informed and practical articles for parents about personalized stories, audio stories, reading, attention, sleep, and child-safe creativity.',
    eyebrow: 'WonderTales Blog',
    h1: 'Story ideas that genuinely help family life',
    intro: 'Practical, research-aware notes on attention, language, sleep, personalization, and safe creativity for children.',
    navStories: 'Stories',
    navPricing: 'Pricing',
    readMore: 'Read',
    updated: 'Updated',
  },
  ru: {
    title: 'Блог для родителей — WonderTales',
    description: 'Практические материалы для родителей о персонализированных историях, аудиоисториях, чтении, внимании, сне и детской безопасности.',
    eyebrow: 'WonderTales Blog',
    h1: 'Идеи для историй, которые действительно помогают семье',
    intro: 'Пишем о внимании, языке, сне, персонализации и безопасном творчестве для детей без пустого маркетинга.',
    navStories: 'Истории',
    navPricing: 'Тарифы',
    readMore: 'Читать',
    updated: 'Обновлено',
  },
  es: {
    title: 'Blog para familias — WonderTales',
    description: 'Artículos prácticos para padres sobre historias personalizadas, historias de audio, lectura, atención, sueño y creatividad segura.',
    eyebrow: 'WonderTales Blog',
    h1: 'Ideas de historias que ayudan de verdad a la familia',
    intro: 'Notas prácticas sobre atención, lenguaje, sueño, personalización y creatividad segura para niños.',
    navStories: 'Historias',
    navPricing: 'Precios',
    readMore: 'Leer',
    updated: 'Actualizado',
  },
  de: {
    title: 'Elternblog — WonderTales',
    description: 'Praxisnahe Artikel für Eltern über personalisierte Geschichten, Hörgeschichten, Lesen, Aufmerksamkeit, Schlaf und sichere Kreativität.',
    eyebrow: 'WonderTales Blog',
    h1: 'Geschichtenideen, die Familien wirklich helfen',
    intro: 'Praktische, forschungsnahe Texte über Aufmerksamkeit, Sprache, Schlaf, Personalisierung und sichere Kreativität.',
    navStories: 'Geschichten',
    navPricing: 'Preise',
    readMore: 'Lesen',
    updated: 'Aktualisiert',
  },
  fr: {
    title: 'Blog parents — WonderTales',
    description: 'Articles pratiques pour parents sur histoires personnalisées, audio, lecture, attention, sommeil et créativité sûre.',
    eyebrow: 'WonderTales Blog',
    h1: 'Des idées d’histoires utiles pour la vie familiale',
    intro: 'Des notes pratiques sur l’attention, le langage, le sommeil, la personnalisation et la créativité sûre.',
    navStories: 'Histoires',
    navPricing: 'Tarifs',
    readMore: 'Lire',
    updated: 'Mis à jour',
  },
  pl: {
    title: 'Blog dla rodziców — WonderTales',
    description: 'Praktyczne artykuły dla rodziców o personalizowanych historiach, audio, czytaniu, uwadze, śnie i bezpiecznej kreatywności.',
    eyebrow: 'WonderTales Blog',
    h1: 'Pomysły na historie, które naprawdę pomagają rodzinie',
    intro: 'Praktyczne teksty o uwadze, języku, śnie, personalizacji i bezpiecznej kreatywności dla dzieci.',
    navStories: 'Historie',
    navPricing: 'Cennik',
    readMore: 'Czytaj',
    updated: 'Zaktualizowano',
  },
};

const BLOG_ARTICLE_COPY: Record<PublicSeoLocale, {
  backToBlog: string;
  visualBrief: string;
  checklistCta: string;
  relatedTitle: string;
  relatedCta: string;
  navStories: string;
  navPricing: string;
}> = {
  uk: {
    backToBlog: 'Усі статті',
    visualBrief: 'Візуальна ідея для ілюстрації',
    checklistCta: 'Створити історію',
    relatedTitle: 'Читайте також',
    relatedCta: 'Відкрити',
    navStories: 'Історії',
    navPricing: 'Тарифи',
  },
  en: {
    backToBlog: 'All articles',
    visualBrief: 'Visual direction',
    checklistCta: 'Create a story',
    relatedTitle: 'Related reading',
    relatedCta: 'Open',
    navStories: 'Stories',
    navPricing: 'Pricing',
  },
  ru: {
    backToBlog: 'Все статьи',
    visualBrief: 'Идея для иллюстрации',
    checklistCta: 'Создать историю',
    relatedTitle: 'Читайте также',
    relatedCta: 'Открыть',
    navStories: 'Истории',
    navPricing: 'Тарифы',
  },
  es: {
    backToBlog: 'Todos los artículos',
    visualBrief: 'Dirección visual',
    checklistCta: 'Crear una historia',
    relatedTitle: 'Lecturas relacionadas',
    relatedCta: 'Abrir',
    navStories: 'Historias',
    navPricing: 'Precios',
  },
  de: {
    backToBlog: 'Alle Artikel',
    visualBrief: 'Visuelle Richtung',
    checklistCta: 'Geschichte erstellen',
    relatedTitle: 'Weiterlesen',
    relatedCta: 'Öffnen',
    navStories: 'Geschichten',
    navPricing: 'Preise',
  },
  fr: {
    backToBlog: 'Tous les articles',
    visualBrief: 'Direction visuelle',
    checklistCta: 'Créer une histoire',
    relatedTitle: 'À lire aussi',
    relatedCta: 'Ouvrir',
    navStories: 'Histoires',
    navPricing: 'Tarifs',
  },
  pl: {
    backToBlog: 'Wszystkie artykuły',
    visualBrief: 'Kierunek wizualny',
    checklistCta: 'Stwórz historię',
    relatedTitle: 'Czytaj także',
    relatedCta: 'Otwórz',
    navStories: 'Historie',
    navPricing: 'Cennik',
  },
};

const QUOTE_AUTHOR_BIOS: Partial<Record<string, Record<PublicSeoLocale, string>>> = {
  'Russell A. Barkley': {
    uk: 'клінічний психолог, дослідник СДВГ і автор праць про виконавчі функції',
    en: 'clinical psychologist, ADHD researcher, and author on executive functioning',
    ru: 'клинический психолог, исследователь СДВГ и автор работ об исполнительных функциях',
    es: 'psicólogo clínico, investigador del TDAH y autor sobre funciones ejecutivas',
    de: 'klinischer Psychologe, ADHS-Forscher und Autor zu exekutiven Funktionen',
    fr: 'psychologue clinicien, chercheur sur le TDAH et auteur sur les fonctions exécutives',
    pl: 'psycholog kliniczny, badacz ADHD i autor prac o funkcjach wykonawczych',
  },
  'Jerome Bruner': {
    uk: 'психолог, дослідник когнітивного розвитку й ролі наративу в мисленні',
    en: 'psychologist who studied cognitive development and narrative thinking',
    ru: 'психолог, исследователь когнитивного развития и роли нарратива в мышлении',
    es: 'psicólogo que estudió el desarrollo cognitivo y el pensamiento narrativo',
    de: 'Psychologe, der kognitive Entwicklung und narratives Denken erforschte',
    fr: 'psychologue ayant étudié le développement cognitif et la pensée narrative',
    pl: 'psycholog badający rozwój poznawczy i myślenie narracyjne',
  },
  'Lev Vygotsky': {
    uk: 'психолог розвитку, відомий ідеєю зони найближчого розвитку',
    en: 'developmental psychologist known for the zone of proximal development',
    ru: 'психолог развития, известный идеей зоны ближайшего развития',
    es: 'psicólogo del desarrollo conocido por la zona de desarrollo próximo',
    de: 'Entwicklungspsychologe, bekannt für die Zone der nächsten Entwicklung',
    fr: 'psychologue du développement, connu pour la zone proximale de développement',
    pl: 'psycholog rozwojowy znany z pojęcia strefy najbliższego rozwoju',
  },
  'Mindell et al.': {
    uk: 'дослідники дитячого сну та вечірніх рутин',
    en: 'researchers studying children’s sleep and bedtime routines',
    ru: 'исследователи детского сна и вечерних рутин',
    es: 'investigadores del sueño infantil y las rutinas nocturnas',
    de: 'Forschende zu Kinderschlaf und Abendroutinen',
    fr: 'chercheurs sur le sommeil de l’enfant et les routines du soir',
    pl: 'badacze snu dzieci i wieczornych rytuałów',
  },
  'Maryanne Wolf': {
    uk: 'дослідниця читання, когнітивна нейронауковиця й авторка про мозок читача',
    en: 'reading researcher, cognitive neuroscientist, and author on the reading brain',
    ru: 'исследовательница чтения, когнитивный нейробиолог и автор о мозге читателя',
    es: 'investigadora de la lectura, neurocientífica cognitiva y autora sobre el cerebro lector',
    de: 'Leseforscherin, kognitive Neurowissenschaftlerin und Autorin zum lesenden Gehirn',
    fr: 'chercheuse en lecture, neuroscientifique cognitive et autrice sur le cerveau lecteur',
    pl: 'badaczka czytania, neurokognitywistka i autorka o mózgu czytającym',
  },
  'Linda B. Gambrell': {
    uk: 'дослідниця мотивації читання, професорка грамотності й авторка про залучення читачів',
    en: 'reading motivation researcher, literacy professor, and author on reader engagement',
    ru: 'исследовательница мотивации чтения, профессор грамотности и автор о вовлечении читателей',
    es: 'investigadora de motivación lectora, profesora de alfabetización y autora sobre implicación lectora',
    de: 'Lesemotivationsforscherin, Professorin für Literacy und Autorin zu Lesebeteiligung',
    fr: 'chercheuse sur la motivation en lecture, professeure de littératie et autrice sur l’engagement lecteur',
    pl: 'badaczka motywacji czytelniczej, profesorka alfabetyzacji i autorka o zaangażowaniu czytelników',
  },
  'British Dyslexia Association': {
    uk: 'британська професійна організація, що публікує поради з доступної подачі тексту',
    en: 'UK professional organization publishing guidance on accessible text presentation',
    ru: 'британская профессиональная организация, публикующая рекомендации по доступной подаче текста',
    es: 'organización profesional británica que publica guías sobre presentación accesible del texto',
    de: 'britische Fachorganisation mit Leitlinien zu zugänglicher Textgestaltung',
    fr: 'organisation professionnelle britannique publiant des conseils sur la présentation accessible du texte',
    pl: 'brytyjska organizacja specjalistyczna publikująca wskazówki o dostępnej prezentacji tekstu',
  },
  'Roediger & Karpicke': {
    uk: 'Henry L. Roediger III — Вашингтонський університет у Сент-Луїсі; Jeffrey D. Karpicke — Університет Пердью; дослідники пам’яті та ефекту перевірки',
    en: 'Henry L. Roediger III, Washington University in St. Louis; Jeffrey D. Karpicke, Purdue University; memory researchers known for the testing effect',
    ru: 'Henry L. Roediger III — Вашингтонский университет в Сент-Луисе; Jeffrey D. Karpicke — Университет Пердью; исследователи памяти и эффекта проверки',
    es: 'Henry L. Roediger III, Universidad Washington en San Luis; Jeffrey D. Karpicke, Universidad Purdue; investigadores de memoria y efecto de prueba',
    de: 'Henry L. Roediger III, Washington-Universität in St. Louis; Jeffrey D. Karpicke, Purdue-Universität; Gedächtnisforscher zum Prüfeffekt',
    fr: 'Henry L. Roediger III, Université Washington à Saint-Louis; Jeffrey D. Karpicke, Université Purdue; chercheurs en mémoire et effet de test',
    pl: 'Henry L. Roediger III, Uniwersytet Waszyngtona w St. Louis; Jeffrey D. Karpicke, Uniwersytet Purdue; badacze pamięci i efektu sprawdzania',
  },
  'IES Practice Guide Panel': {
    uk: 'група експертів What Works Clearinghouse при Institute of Education Sciences, що готує практичні освітні рекомендації',
    en: 'What Works Clearinghouse expert panel at the Institute of Education Sciences, publishing education practice recommendations',
    ru: 'экспертная группа What Works Clearinghouse при Institute of Education Sciences, публикующая практические образовательные рекомендации',
    es: 'panel experto de What Works Clearinghouse en el Institute of Education Sciences, con recomendaciones prácticas de educación',
    de: 'Expertengremium des What Works Clearinghouse am Institute of Education Sciences mit praxisnahen Bildungsempfehlungen',
    fr: 'groupe d’experts What Works Clearinghouse de l’Institute of Education Sciences, auteur de recommandations éducatives pratiques',
    pl: 'panel ekspertów What Works Clearinghouse przy Institute of Education Sciences, publikujący praktyczne zalecenia edukacyjne',
  },
  'Richard E. Mayer': {
    uk: 'заслужений професор психології Каліфорнійського університету в Санта-Барбарі; автор когнітивної теорії мультимедійного навчання',
    en: 'Distinguished Professor of Psychology, University of California, Santa Barbara; author of cognitive theory of multimedia learning',
    ru: 'заслуженный профессор психологии Калифорнийского университета в Санта-Барбаре; автор когнитивной теории мультимедийного обучения',
    es: 'profesor distinguido de Psicología, Universidad de California en Santa Bárbara; autor de la teoría cognitiva del aprendizaje multimedia',
    de: 'renommierter Psychologieprofessor an der Universität von Kalifornien in Santa Barbara; Autor der kognitiven Theorie multimedialen Lernens',
    fr: 'professeur distingué de psychologie à l’Université de Californie à Santa Barbara; auteur de la théorie cognitive de l’apprentissage multimédia',
    pl: 'wyróżniony profesor psychologii na Uniwersytecie Kalifornijskim w Santa Barbara; autor poznawczej teorii uczenia multimedialnego',
  },
  'Marc Brackett': {
    uk: 'психолог і засновник Yale Center for Emotional Intelligence',
    en: 'psychologist and founding director of the Yale Center for Emotional Intelligence',
    ru: 'психолог и основатель Yale Center for Emotional Intelligence',
    es: 'psicólogo y director fundador del Yale Center for Emotional Intelligence',
    de: 'Psychologe und Gründungsdirektor des Yale Center for Emotional Intelligence',
    fr: 'psychologue et directeur fondateur du Yale Center for Emotional Intelligence',
    pl: 'psycholog i dyrektor założyciel Yale Center for Emotional Intelligence',
  },
  'Corinn Cross, MD, FAAP': {
    uk: 'педіатрка, членкиня American Academy of Pediatrics і експертка з дитячого медіаконтенту',
    en: 'pediatrician, American Academy of Pediatrics fellow, and children’s media expert',
    ru: 'педиатр, член American Academy of Pediatrics и эксперт по детскому медиаконтенту',
    es: 'pediatra, miembro de la American Academy of Pediatrics y experta en medios infantiles',
    de: 'Kinderärztin, Fellow der American Academy of Pediatrics und Expertin für Kindermedien',
    fr: 'pédiatre, membre de l’American Academy of Pediatrics et experte des médias pour enfants',
    pl: 'pediatra, członkini American Academy of Pediatrics i ekspertka od mediów dziecięcych',
  },
  'Patricia Kuhl': {
    uk: 'нейронауковиця, яка досліджує ранній розвиток мовлення й навчання',
    en: 'neuroscientist studying early language development and learning',
    ru: 'нейробиолог, исследующая раннее развитие речи и обучение',
    es: 'neurocientífica que estudia el desarrollo temprano del lenguaje y el aprendizaje',
    de: 'Neurowissenschaftlerin für frühe Sprachentwicklung und Lernen',
    fr: 'neuroscientifique spécialiste du développement précoce du langage et de l’apprentissage',
    pl: 'neurobadaczka zajmująca się wczesnym rozwojem języka i uczeniem się',
  },
  'Alison Gopnik': {
    uk: 'психологиня розвитку, яка досліджує навчання, гру й мислення дітей',
    en: 'developmental psychologist studying children’s learning, play, and thinking',
    ru: 'психолог развития, изучающая обучение, игру и мышление детей',
    es: 'psicóloga del desarrollo que estudia aprendizaje, juego y pensamiento infantil',
    de: 'Entwicklungspsychologin zu Lernen, Spiel und Denken von Kindern',
    fr: 'psychologue du développement, spécialiste de l’apprentissage, du jeu et de la pensée des enfants',
    pl: 'psycholożka rozwojowa badająca uczenie się, zabawę i myślenie dzieci',
  },
  'Harvard Center on the Developing Child': {
    uk: 'дослідницький центр Гарварду про розвиток дитини, стрес і стійкість',
    en: 'Harvard research center on child development, stress, and resilience',
    ru: 'исследовательский центр Гарварда о развитии ребенка, стрессе и устойчивости',
    es: 'centro de investigación de Harvard sobre desarrollo infantil, estrés y resiliencia',
    de: 'Harvard-Forschungszentrum zu kindlicher Entwicklung, Stress und Resilienz',
    fr: 'centre de recherche de Harvard sur le développement de l’enfant, le stress et la résilience',
    pl: 'centrum badawcze Harvardu o rozwoju dziecka, stresie i odporności',
  },
  'European Data Protection Board': {
    uk: 'європейський орган, який координує застосування правил захисту даних',
    en: 'European body coordinating guidance on data protection rules',
    ru: 'европейский орган, координирующий применение правил защиты данных',
    es: 'organismo europeo que coordina la orientación sobre protección de datos',
    de: 'europäisches Gremium zur Koordination von Datenschutzleitlinien',
    fr: 'organisme européen qui coordonne les règles de protection des données',
    pl: 'europejski organ koordynujący zasady ochrony danych',
  },
};

const BLOG_STYLES = `
*{box-sizing:border-box}
html,body{min-height:100%}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#17122d;line-height:1.55}
a{color:inherit}
.blog-page{min-height:100vh;display:flex;flex-direction:column;background-color:#fbf8ff;background-image:radial-gradient(circle at 8% 12%,rgba(255,121,82,.10),transparent 26%),radial-gradient(circle at 92% 8%,rgba(126,103,210,.13),transparent 28%),linear-gradient(180deg,#fffdfa 0%,#fbf8ff 100%);background-position:top center,top center,top center;background-size:100% 100vh,100% 100vh,100% 100vh;background-repeat:no-repeat,no-repeat,no-repeat}
.blog-wrap{width:100%;max-width:1180px;margin:0 auto;padding:28px 24px 72px;flex:1}
.blog-hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:34px;align-items:center;margin:12px 0 44px}
.blog-hero-copy{padding:34px 0}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 16px;padding:8px 12px;border-radius:999px;background:#f3eefc;color:#6c57c7;font-size:13px;font-weight:850}
h1{margin:0 0 18px;font-size:58px;line-height:1.02;letter-spacing:0;color:#17122d}
.lead{margin:0;max-width:670px;color:#5e577a;font-size:20px;line-height:1.7}
.hero-image-card{border-radius:34px;overflow:hidden;min-height:380px;box-shadow:0 34px 80px rgba(31,24,67,.16);position:relative;background:#f1edf8}
.hero-image-card img{width:100%;height:100%;min-height:380px;object-fit:cover;display:block}
.hero-image-card:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(23,18,45,0) 35%,rgba(23,18,45,.32) 100%)}
.article-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
.article-card{display:flex;flex-direction:column;min-height:100%;border-radius:28px;background:#fff;overflow:hidden;text-decoration:none;box-shadow:0 18px 48px rgba(31,24,67,.08);border:1px solid rgba(125,103,210,.12);transition:transform .18s ease,box-shadow .18s ease}
.article-card:hover{transform:translateY(-3px);box-shadow:0 28px 60px rgba(31,24,67,.14)}
.article-thumb{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:#eee8f7}
.article-card-body{padding:22px;display:flex;flex-direction:column;gap:12px;flex:1}
.article-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;color:#7d67d2;font-weight:850;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.article-read-time{display:inline-flex;align-items:center;gap:5px;text-transform:none;letter-spacing:0;color:#7d67d2}
.article-read-time svg{width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.article-card h2{margin:0;color:#17122d;font-size:24px;line-height:1.16;letter-spacing:0}
.article-card p{margin:0;color:#655f7d;font-size:15px;line-height:1.6}
.article-read{display:inline-flex;margin-top:auto;color:#d96445;font-weight:850;transition:transform .18s ease,color .18s ease}
.article-card:hover .article-read{transform:translateY(-1px);color:#c55338}
.post-shell{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:36px;align-items:start}
.post-main{min-width:0}
.post-card{background:#fff;border-radius:34px;padding:38px;box-shadow:0 26px 70px rgba(31,24,67,.10);border:1px solid rgba(125,103,210,.12)}
.post-topline{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin-bottom:20px;color:#7d67d2;font-size:13px;font-weight:850;text-transform:uppercase;letter-spacing:.04em}
.post-hero{margin:30px -18px 34px;border-radius:30px;overflow:hidden;box-shadow:0 24px 50px rgba(31,24,67,.13)}
.post-hero img{display:block;width:100%;aspect-ratio:16/8;object-fit:cover}
.post-section{padding:20px 0;border-top:1px solid rgba(125,103,210,.14)}
.post-section h2{margin:0 0 12px;color:#17122d;font-size:30px;line-height:1.16;letter-spacing:0}
.post-section p,.post-card li{color:#4f486b;font-size:18px;line-height:1.8}
.post-section p{margin:0}
.post-section p+p{margin-top:14px}
.post-inline-image{margin:40px -18px 34px}
.post-inline-image img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:28px;box-shadow:0 24px 52px rgba(31,24,67,.12)}
.post-inline-image figcaption{margin:18px 18px 0;color:#7a718f;font-size:14px;line-height:1.55;font-weight:650}
.insight-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:30px 0}
.insight-card{padding:24px;border-radius:26px;background:#fffdfa;border:1px solid rgba(217,100,69,.14);box-shadow:0 16px 36px rgba(217,100,69,.08)}
.insight-card .mini-eyebrow,.step-block .mini-eyebrow{display:block;margin-bottom:10px;color:#d96445;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
.insight-card h3{margin:0 0 10px;color:#17122d;font-size:22px;line-height:1.16}
.insight-card p{margin:0;color:#5e577a;font-size:16px;line-height:1.65}
.decision-card{margin:30px 0;padding:28px;border-radius:30px;background:#f7fbef;border:1px solid rgba(126,153,68,.18);box-shadow:0 18px 44px rgba(99,124,48,.09)}
.decision-card h2{margin:0 0 10px;font-size:28px;line-height:1.16}
.decision-card>p{margin:0 0 20px;color:#566047;font-size:17px;line-height:1.7}
.decision-table-wrap{overflow-x:auto;border-radius:20px;background:#fff}
.decision-table{width:100%;border-collapse:collapse;min-width:680px}
.decision-table th,.decision-table td{padding:16px 18px;text-align:left;vertical-align:top;border-bottom:1px solid rgba(126,153,68,.14);font-size:15px;line-height:1.55}
.decision-table th{color:#3e482f;background:#eef6df;font-weight:900}
.decision-table td{color:#4f486b}
.decision-table tr:last-child td{border-bottom:0}
.step-block{margin:30px 0;padding:30px;border-radius:34px;background:linear-gradient(135deg,#7d67d2 0%,#d96445 115%);color:#fff;box-shadow:0 30px 70px rgba(125,103,210,.22)}
.step-block .mini-eyebrow{color:rgba(255,255,255,.8)}
.step-block h2{margin:0 0 12px;font-size:34px;line-height:1.08;color:#fff}
.step-block>p{max-width:720px;margin:0 0 22px;color:rgba(255,255,255,.86);font-size:18px;line-height:1.7}
.step-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.step-item{padding:18px;border-radius:22px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.18)}
.step-item h3{margin:0 0 8px;color:#fff;font-size:18px}
.step-item p{margin:0;color:rgba(255,255,255,.84);font-size:15px;line-height:1.55}
.quote-card{position:relative;margin:44px -38px;padding:42px 56px 42px 104px;background:linear-gradient(135deg,#fff4ec 0%,#fffaf6 58%,#f7f2ff 100%);overflow:hidden}
.quote-card:before{content:'“';position:absolute;left:34px;top:8px;color:rgba(217,100,69,.22);font-size:118px;line-height:1;font-weight:900;font-family:Georgia,serif}
.quote-card blockquote{position:relative;margin:0;color:#17122d;font-size:30px;line-height:1.24;font-weight:850}
.quote-card figcaption{position:relative;margin-top:18px;color:#7a5b4d;font-weight:750}
.quote-card figcaption strong{display:block;color:#7a5b4d}
.quote-card figcaption span{display:block;margin-top:4px;font-weight:650;color:#8a6d5f}
.checklist{margin:28px 0;padding:26px;border-radius:28px;background:#f6f2ff;border:1px solid rgba(125,103,210,.14)}
.checklist h2{margin:0 0 12px;font-size:24px}
.checklist h2 a{color:inherit;text-decoration:none}
.checklist h2 a:hover{color:#6c57c7}
.checklist ul{margin:0;padding-left:22px}
.checklist-cta{display:inline-flex;align-items:center;justify-content:center;margin-top:20px;padding:12px 18px;border-radius:999px;background:#7d67d2;color:#fff;text-decoration:none;font-weight:850;box-shadow:0 16px 32px rgba(125,103,210,.22);transition:transform .18s ease,background .18s ease,box-shadow .18s ease}
.checklist-cta:hover{background:#6c57c7;transform:translateY(-1px);box-shadow:0 20px 38px rgba(125,103,210,.26)}
.post-aside{position:sticky;top:28px;background:#fff;border-radius:30px;padding:24px;box-shadow:0 22px 56px rgba(31,24,67,.10);border:1px solid rgba(125,103,210,.14)}
.post-aside h2{margin:0 0 14px;font-size:22px}
.post-aside p{margin:0 0 18px;color:#5e577a}
.aside-link{display:flex;gap:12px;padding:12px;border-radius:18px;text-decoration:none;background:#fbf8ff;margin-top:10px}
.aside-link img{width:72px;height:64px;object-fit:cover;border-radius:14px}
.aside-link strong{display:block;font-size:14px;line-height:1.25}
.back-link{display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;text-decoration:none;color:#6c57c7;font-weight:850}
@media(max-width:980px){h1{font-size:44px}.blog-hero,.post-shell{grid-template-columns:1fr}.post-aside{position:static}.article-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.insight-grid{grid-template-columns:1fr}.step-list{grid-template-columns:1fr}}
@media(max-width:620px){.blog-wrap{padding:22px 16px 52px}h1{font-size:36px}.lead{font-size:18px}.article-grid{grid-template-columns:1fr}.post-card{padding:24px;border-radius:26px}.post-hero{margin:24px 0;border-radius:24px}.post-inline-image{margin:32px 0 28px}.post-inline-image img{border-radius:22px}.post-inline-image figcaption{margin:14px 0 0}.post-section h2,.decision-card h2{font-size:25px}.post-section p,.post-card li{font-size:16px}.quote-card{margin:30px -24px;padding:28px 24px 28px 72px}.quote-card:before{left:18px;top:10px;font-size:78px}.quote-card blockquote{font-size:23px}.step-block{padding:24px;border-radius:26px}.step-block h2{font-size:28px}.decision-card{padding:22px}}
${PUBLIC_HEADER_STYLES}
${PUBLIC_FOOTER_STYLES}
`;

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getWebAppUrl(): string {
  return (config.web?.webAppUrl || 'https://wondertales.art').replace(/\/$/, '');
}

function absoluteAssetUrl(path: string, webAppUrl: string): string {
  return buildAbsoluteRouteUrl(webAppUrl, path);
}

function buildOrganizationLd(webAppUrl: string): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': `${webAppUrl}/#organization`,
    name: 'WonderTales',
    url: webAppUrl,
    logo: {
      '@type': 'ImageObject',
      '@id': `${webAppUrl}/#logo`,
      url: buildAbsoluteRouteUrl(webAppUrl, BLOG_STRUCTURED_DATA_LOGO_PATH),
      contentUrl: buildAbsoluteRouteUrl(webAppUrl, BLOG_STRUCTURED_DATA_LOGO_PATH),
      caption: 'WonderTales',
    },
  };
}

function buildWebSiteLd(webAppUrl: string, locale: PublicSeoLocale): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': `${webAppUrl}/#website`,
    name: 'WonderTales',
    url: webAppUrl,
    inLanguage: locale,
    publisher: {
      '@id': `${webAppUrl}/#organization`,
    },
  };
}

function estimateWordCount(article: BlogArticleView): number {
  const text = [
    article.title,
    article.description,
    article.lead,
    ...article.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
    ...article.insightCards.flatMap((card) => [card.eyebrow, card.title, card.body]),
    ...(article.decisionTable
      ? [
        article.decisionTable.heading,
        article.decisionTable.intro,
        ...article.decisionTable.columns,
        ...article.decisionTable.rows.flat(),
      ]
      : []),
    ...(article.stepBlock
      ? [
        article.stepBlock.eyebrow,
        article.stepBlock.heading,
        article.stepBlock.intro,
        ...article.stepBlock.steps.flatMap((step) => [step.title, step.body]),
      ]
      : []),
    article.checklistTitle,
    ...article.checklistItems,
    article.quote.text,
  ].join(' ');
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function renderAlternateLinks(webAppUrl: string, currentLocale: PublicSeoLocale, buildPath: (locale: PublicSeoLocale) => string): string {
  const canonical = buildAbsoluteRouteUrl(webAppUrl, buildPath(currentLocale));
  const alternates = PUBLIC_SEO_LOCALES.map((locale) =>
    `<link rel="alternate" hreflang="${locale}" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPath(locale)))}">`
  );
  return [
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    ...alternates,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPath(DEFAULT_PUBLIC_SEO_LOCALE)))}">`,
  ].join('\n  ');
}

function renderArticleCard(article: BlogArticleSummary, webAppUrl: string, readMore: string): string {
  const href = buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogArticlePath(article.slug, article.locale));
  return `<a class="article-card" href="${escapeHtml(href)}">
    <img class="article-thumb" src="${escapeHtml(article.heroImage)}" alt="${escapeHtml(article.heroAlt)}" loading="lazy">
    <div class="article-card-body">
      <div class="article-meta"><span>${escapeHtml(article.category)}</span><span class="article-read-time" aria-label="${escapeHtml(article.readingTime)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg><span>7 min</span></span></div>
      <h2>${escapeHtml(article.title)}</h2>
      <p>${escapeHtml(article.description)}</p>
      <span class="article-read">${escapeHtml(readMore)} →</span>
    </div>
  </a>`;
}

function renderInsightCards(article: BlogArticleView): string {
  if (article.insightCards.length === 0) return '';

  return `<div class="insight-grid">
    ${article.insightCards.map((card) => `<section class="insight-card">
      <span class="mini-eyebrow">${escapeHtml(card.eyebrow)}</span>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.body)}</p>
    </section>`).join('')}
  </div>`;
}

function renderDecisionTable(article: BlogArticleView): string {
  if (!article.decisionTable) return '';

  const table = article.decisionTable;
  return `<section class="decision-card">
    <h2>${escapeHtml(table.heading)}</h2>
    <p>${escapeHtml(table.intro)}</p>
    <div class="decision-table-wrap">
      <table class="decision-table">
        <thead>
          <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

function renderStepBlock(article: BlogArticleView): string {
  if (!article.stepBlock) return '';

  const block = article.stepBlock;
  return `<section class="step-block">
    <span class="mini-eyebrow">${escapeHtml(block.eyebrow)}</span>
    <h2>${escapeHtml(block.heading)}</h2>
    <p>${escapeHtml(block.intro)}</p>
    <div class="step-list">
      ${block.steps.map((step) => `<div class="step-item">
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.body)}</p>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderQuoteCard(article: BlogArticleView): string {
  const authorBio = QUOTE_AUTHOR_BIOS[article.quote.attribution]?.[article.locale];

  return `<figure class="quote-card">
    <blockquote>${escapeHtml(article.quote.text)}</blockquote>
    <figcaption><strong>${escapeHtml(article.quote.attribution)}</strong>${authorBio ? `<span>${escapeHtml(authorBio)}</span>` : ''}</figcaption>
  </figure>`;
}

function renderInlineImage(image: BlogInlineImage): string {
  return `<figure class="post-inline-image">
    <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy">
    <figcaption>${escapeHtml(image.caption)}</figcaption>
  </figure>`;
}

function renderPostSection(section: BlogSection, insertions: Record<number, string[]> = {}): string {
  const paragraphs = section.paragraphs
    .map((paragraph, index) => `<p>${escapeHtml(paragraph)}</p>${(insertions[index] ?? []).join('')}`)
    .join('');

  return `<section class="post-section">
    <h2>${escapeHtml(section.heading)}</h2>
    ${paragraphs}
  </section>`;
}

function renderArticleContent(article: BlogArticleView): string {
  const quoteHtml = renderQuoteCard(article);
  const sections = article.sections.map((section, sectionIndex) => {
    const insertions: Record<number, string[]> = {};
    if (sectionIndex === 1) {
      insertions[0] = [quoteHtml];
    }
    article.inlineImages
      .filter((image) => image.sectionIndex === sectionIndex)
      .forEach((image) => {
        insertions[image.afterParagraphIndex] = [
          ...(insertions[image.afterParagraphIndex] ?? []),
          renderInlineImage(image),
        ];
      });

    return renderPostSection(section, insertions);
  });

  if (!article.insightCards.length && !article.decisionTable && !article.stepBlock) {
    return [
      sections[0],
      sections[1],
      sections[2],
      sections[3],
    ].filter(Boolean).join('');
  }

  return [
    sections[0],
    renderInsightCards(article),
    sections[1],
    renderDecisionTable(article),
    sections[2],
    renderStepBlock(article),
    sections[3],
  ].filter(Boolean).join('');
}

export function renderBlogIndexHtml(options: { locale?: string | null } = {}): string {
  const locale = normalizePublicSeoLocale(options.locale);
  const copy = BLOG_INDEX_COPY[locale];
  const webAppUrl = getWebAppUrl();
  const url = buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogIndexPath(locale));
  const articles = listBlogArticles(locale);
  const heroArticle = articles[0];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      buildOrganizationLd(webAppUrl),
      buildWebSiteLd(webAppUrl, locale),
      {
        '@type': 'CollectionPage',
        '@id': `${url}#webpage`,
        url,
        name: copy.title,
        description: copy.description,
        inLanguage: locale,
        isPartOf: { '@id': `${webAppUrl}/#website` },
        publisher: { '@id': `${webAppUrl}/#organization` },
        mainEntity: { '@id': `${url}#blog` },
      },
      {
        '@type': 'Blog',
        '@id': `${url}#blog`,
        name: copy.h1,
        description: copy.description,
        url,
        inLanguage: locale,
        publisher: { '@id': `${webAppUrl}/#organization` },
        blogPost: articles.map((article) => ({
          '@type': 'BlogPosting',
          '@id': `${buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogArticlePath(article.slug, locale))}#article`,
          headline: article.title,
          description: article.description,
          url: buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogArticlePath(article.slug, locale)),
          dateModified: article.updatedAt,
          image: absoluteAssetUrl(article.heroImage, webAppUrl),
        })),
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#itemlist`,
        name: copy.h1,
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        numberOfItems: articles.length,
        itemListElement: articles.map((article, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: article.title,
          url: buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogArticlePath(article.slug, locale)),
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'WonderTales',
            item: buildAbsoluteRouteUrl(webAppUrl, buildPublicLandingPath(locale)),
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Blog',
            item: url,
          },
        ],
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(copy.title)}</title>
  <meta name="description" content="${escapeHtml(copy.description)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(copy.title)}">
  <meta property="og:description" content="${escapeHtml(copy.description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(absoluteAssetUrl(heroArticle.heroImage, webAppUrl))}">
  ${PUBLIC_HEAD_ASSET_LINKS}
  ${renderAlternateLinks(webAppUrl, locale, buildPublicBlogIndexPath)}
  <script type="application/ld+json">${safeJson(jsonLd)}</script>
  <style>${BLOG_STYLES}</style>
</head>
<body>
  <div class="blog-page">
    ${renderPublicPageHeader(webAppUrl, locale, 'blog')}
    <main class="blog-wrap">
      <section class="blog-hero">
        <div class="blog-hero-copy">
          <p class="eyebrow">${escapeHtml(copy.eyebrow)}</p>
          <h1>${escapeHtml(copy.h1)}</h1>
          <p class="lead">${escapeHtml(copy.intro)}</p>
        </div>
        <div class="hero-image-card" aria-hidden="true">
          <img src="${escapeHtml(heroArticle.heroImage)}" alt="">
        </div>
      </section>
      <section class="article-grid" aria-label="${escapeHtml(copy.h1)}">
        ${articles.map((article) => renderArticleCard(article, webAppUrl, copy.readMore)).join('')}
      </section>
    </main>
    ${renderPublicPageFooter(webAppUrl, locale, buildPublicFooterLanguageLinks(webAppUrl, buildPublicBlogIndexPath), 'blog')}
  </div>
</body>
</html>`;
}

function renderRelatedArticles(article: BlogArticleView, webAppUrl: string, copy: typeof BLOG_ARTICLE_COPY[PublicSeoLocale]): string {
  const related = article.relatedSlugs
    .map((slug) => listBlogArticles(article.locale).find((summary) => summary.slug === slug))
    .filter((summary): summary is BlogArticleSummary => !!summary);

  if (related.length === 0) return '';

  return `<aside class="post-aside">
    <h2>${escapeHtml(copy.relatedTitle)}</h2>
    <p>${escapeHtml(article.category)}</p>
    ${related.map((summary) => {
      const href = buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogArticlePath(summary.slug, article.locale));
      return `<a class="aside-link" href="${escapeHtml(href)}">
        <img src="${escapeHtml(summary.heroImage)}" alt="">
        <span><strong>${escapeHtml(summary.title)}</strong><small>${escapeHtml(copy.relatedCta)} →</small></span>
      </a>`;
    }).join('')}
  </aside>`;
}

function appendQueryParams(path: string, params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, value]) => value.trim().length > 0);
  if (entries.length === 0) return path;

  const query = new URLSearchParams(entries).toString();
  return query ? `${path}?${query}` : path;
}

export function renderBlogArticleHtml(options: { slug: string; locale?: string | null }): string | null {
  const locale = normalizePublicSeoLocale(options.locale);
  const article = getBlogArticle(options.slug, locale);
  if (!article) return null;

  const copy = BLOG_ARTICLE_COPY[locale];
  const webAppUrl = getWebAppUrl();
  const url = buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogArticlePath(article.slug, locale));
  const createStoryPath = appendQueryParams(
    buildPublicAppEntryPath(APP_ROUTE_PATHS.wizard, locale),
    article.createStoryParams
  );
  const createStoryUrl = buildAbsoluteRouteUrl(webAppUrl, createStoryPath);
  const checklistCtaLabel = article.checklistCtaLabel ?? copy.checklistCta;
  const imageUrl = absoluteAssetUrl(article.heroImage, webAppUrl);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      buildOrganizationLd(webAppUrl),
      buildWebSiteLd(webAppUrl, locale),
      {
        '@type': 'ImageObject',
        '@id': `${url}#primaryimage`,
        url: imageUrl,
        contentUrl: imageUrl,
        caption: article.heroAlt,
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: article.seoTitle,
        description: article.description,
        inLanguage: locale,
        isPartOf: { '@id': `${webAppUrl}/#website` },
        primaryImageOfPage: { '@id': `${url}#primaryimage` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        mainEntity: { '@id': `${url}#article` },
      },
      {
        '@type': 'BlogPosting',
        '@id': `${url}#article`,
        headline: article.title,
        description: article.description,
        image: { '@id': `${url}#primaryimage` },
        thumbnailUrl: imageUrl,
        dateModified: article.updatedAt,
        datePublished: article.updatedAt,
        inLanguage: locale,
        url,
        isAccessibleForFree: true,
        articleSection: article.category,
        keywords: [
          article.category,
          ...article.sections.map((section) => section.heading),
        ],
        wordCount: estimateWordCount(article),
        author: { '@id': `${webAppUrl}/#organization` },
        publisher: { '@id': `${webAppUrl}/#organization` },
        mainEntityOfPage: { '@id': `${url}#webpage` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'WonderTales',
            item: buildAbsoluteRouteUrl(webAppUrl, buildPublicLandingPath(locale)),
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Blog',
            item: buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogIndexPath(locale)),
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: article.title,
            item: url,
          },
        ],
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(article.seoTitle)}</title>
  <meta name="description" content="${escapeHtml(article.description)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(article.title)}">
  <meta property="og:description" content="${escapeHtml(article.description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="article:modified_time" content="${escapeHtml(article.updatedAt)}">
  ${PUBLIC_HEAD_ASSET_LINKS}
  ${renderAlternateLinks(webAppUrl, locale, (altLocale) => buildPublicBlogArticlePath(article.slug, altLocale))}
  <script type="application/ld+json">${safeJson(jsonLd)}</script>
  <style>${BLOG_STYLES}</style>
</head>
<body>
  <div class="blog-page">
    ${renderPublicPageHeader(webAppUrl, locale, 'blog')}
    <main class="blog-wrap">
      <a class="back-link" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogIndexPath(locale)))}">← ${escapeHtml(copy.backToBlog)}</a>
      <div class="post-shell">
        <article class="post-main post-card">
          <div class="post-topline">
            <span>${escapeHtml(article.category)}</span>
            <span>${escapeHtml(article.readingTime)}</span>
            <span>${escapeHtml(article.updatedAt)}</span>
          </div>
          <h1>${escapeHtml(article.title)}</h1>
          <p class="lead">${escapeHtml(article.lead)}</p>
          <figure class="post-hero">
            <img src="${escapeHtml(article.heroImage)}" alt="${escapeHtml(article.heroAlt)}">
          </figure>
          ${renderArticleContent(article)}
          <section class="checklist">
            <h2><a href="${escapeHtml(createStoryUrl)}">${escapeHtml(article.checklistTitle)}</a></h2>
            <ul>
              ${article.checklistItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
            <a class="checklist-cta" href="${escapeHtml(createStoryUrl)}">${escapeHtml(checklistCtaLabel)} →</a>
          </section>
        </article>
        ${renderRelatedArticles(article, webAppUrl, copy)}
      </div>
    </main>
    ${renderPublicPageFooter(webAppUrl, locale, buildPublicFooterLanguageLinks(webAppUrl, (altLocale) => buildPublicBlogArticlePath(article.slug, altLocale)), 'blog')}
  </div>
</body>
</html>`;
}
