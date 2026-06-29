import {
  PUBLIC_SEO_LOCALES,
  buildPublicBlogArticlePath,
  type PublicSeoLocale,
} from '@wondertales/shared';

type LocalizedString = Record<PublicSeoLocale, string>;
type LocalizedStringList = Record<PublicSeoLocale, string[]>;
type MaybeLocalizedString = string | LocalizedString;
type MaybeLocalizedParagraphs = LocalizedString | LocalizedStringList;

export interface BlogSource {
  label: string;
  url: string;
}

export interface BlogQuote {
  text: MaybeLocalizedString;
  attribution: string;
  sourceLabel: MaybeLocalizedString;
  sourceUrl: string;
}

export interface BlogInsightCard {
  eyebrow: string;
  title: string;
  body: string;
}

export interface BlogDecisionTable {
  heading: string;
  intro: string;
  columns: [string, string, string];
  rows: [string, string, string][];
}

export interface BlogStepBlock {
  eyebrow: string;
  heading: string;
  intro: string;
  steps: Array<{
    title: string;
    body: string;
  }>;
}

export interface BlogInlineImage {
  src: string;
  alt: string;
  caption: string;
  sectionIndex: number;
  afterParagraphIndex: number;
}

export interface BlogSection {
  heading: string;
  paragraphs: string[];
}

export interface BlogArticleView {
  slug: string;
  locale: PublicSeoLocale;
  category: string;
  title: string;
  seoTitle: string;
  description: string;
  lead: string;
  heroImage: string;
  heroAlt: string;
  updatedAt: string;
  readingTime: string;
  sections: BlogSection[];
  checklistTitle: string;
  checklistItems: string[];
  checklistCtaLabel: string | null;
  createStoryParams: Record<string, string>;
  quote: {
    text: string;
    attribution: string;
    sourceLabel: string;
    sourceUrl: string;
  };
  sources: BlogSource[];
  relatedSlugs: string[];
  insightCards: BlogInsightCard[];
  decisionTable: BlogDecisionTable | null;
  stepBlock: BlogStepBlock | null;
  inlineImages: BlogInlineImage[];
}

export interface BlogArticleSummary {
  slug: string;
  locale: PublicSeoLocale;
  category: string;
  title: string;
  description: string;
  heroImage: string;
  heroAlt: string;
  updatedAt: string;
  readingTime: string;
}

interface BlogArticleDefinition {
  slug: string;
  heroImage: string;
  updatedAt: string;
  category: LocalizedString;
  title: LocalizedString;
  description: LocalizedString;
  lead: LocalizedString;
  focus: MaybeLocalizedParagraphs;
  research: MaybeLocalizedParagraphs;
  storyUse: MaybeLocalizedParagraphs;
  adjustment: MaybeLocalizedParagraphs;
  checklist: LocalizedStringList;
  checklistCtaLabel?: LocalizedString;
  createStoryParams?: Record<string, string>;
  quote: BlogQuote;
  sources: BlogSource[];
  visualDirection: string;
  relatedSlugs: string[];
  inlineImages?: Array<{
    src: string;
    alt: LocalizedString;
    caption: LocalizedString;
    sectionIndex: number;
    afterParagraphIndex: number;
  }>;
  insightCards?: Partial<Record<PublicSeoLocale, BlogInsightCard[]>>;
  decisionTable?: Partial<Record<PublicSeoLocale, BlogDecisionTable>>;
  stepBlock?: Partial<Record<PublicSeoLocale, BlogStepBlock>>;
}

function localizeText(value: MaybeLocalizedString, locale: PublicSeoLocale): string {
  return typeof value === 'string' ? value : value[locale];
}

function localizeParagraphs(value: MaybeLocalizedParagraphs, locale: PublicSeoLocale): string[] {
  const localized = value[locale];
  return Array.isArray(localized) ? localized : [localized];
}

function l10n(
  uk: string,
  en: string,
  ru: string,
  es: string,
  de: string,
  fr: string,
  pl: string
): LocalizedString {
  return { uk, en, ru, es, de, fr, pl };
}

function articleInlineImages(
  slug: string,
  scene2Alt: LocalizedString,
  scene2Caption: LocalizedString,
  scene3Alt: LocalizedString,
  scene3Caption: LocalizedString
): NonNullable<BlogArticleDefinition['inlineImages']> {
  return [
    {
      src: `/landing/blog/${slug}-scene-02.webp`,
      sectionIndex: 2,
      afterParagraphIndex: 0,
      alt: scene2Alt,
      caption: scene2Caption,
    },
    {
      src: `/landing/blog/${slug}-scene-03.webp`,
      sectionIndex: 3,
      afterParagraphIndex: 0,
      alt: scene3Alt,
      caption: scene3Caption,
    },
  ];
}

const UI_COPY: Record<PublicSeoLocale, {
  readingTime: string;
  checklistTitle: string;
  sections: [string, string, string, string];
  heroAltPrefix: string;
}> = {
  uk: {
    readingTime: '7 хв читання',
    checklistTitle: 'Спробуйте сьогодні',
    sections: ['Чому це важливо', 'Що каже досвід і дослідження', 'Як застосувати в історії', 'Коли змінити підхід'],
    heroAltPrefix: 'Ілюстрація WonderTales до теми',
  },
  en: {
    readingTime: '7 min read',
    checklistTitle: 'Try tonight',
    sections: ['Why it matters', 'What research and practice suggest', 'How to use it in a story', 'When to adjust'],
    heroAltPrefix: 'WonderTales illustration for',
  },
  ru: {
    readingTime: '7 мин чтения',
    checklistTitle: 'Попробуйте сегодня',
    sections: ['Почему это важно', 'Что говорят практика и исследования', 'Как применить в истории', 'Когда изменить подход'],
    heroAltPrefix: 'Иллюстрация WonderTales к теме',
  },
  es: {
    readingTime: '7 min de lectura',
    checklistTitle: 'Prueba esta noche',
    sections: ['Por qué importa', 'Qué sugieren la investigación y la práctica', 'Cómo usarlo en una historia', 'Cuándo ajustar'],
    heroAltPrefix: 'Ilustración de WonderTales sobre',
  },
  de: {
    readingTime: '7 Min. Lesezeit',
    checklistTitle: 'Heute ausprobieren',
    sections: ['Warum es wichtig ist', 'Was Forschung und Praxis nahelegen', 'So nutzt du es in einer Geschichte', 'Wann du anpassen solltest'],
    heroAltPrefix: 'WonderTales-Illustration zu',
  },
  fr: {
    readingTime: '7 min de lecture',
    checklistTitle: 'À essayer ce soir',
    sections: ['Pourquoi c’est important', 'Ce que suggèrent la recherche et la pratique', 'Comment l’utiliser dans une histoire', 'Quand ajuster'],
    heroAltPrefix: 'Illustration WonderTales sur',
  },
  pl: {
    readingTime: '7 min czytania',
    checklistTitle: 'Wypróbuj dziś wieczorem',
    sections: ['Dlaczego to ważne', 'Co sugerują badania i praktyka', 'Jak użyć tego w historii', 'Kiedy zmienić podejście'],
    heroAltPrefix: 'Ilustracja WonderTales do tematu',
  },
};

const ARTICLES: BlogArticleDefinition[] = [
  {
    slug: 'adhd-story-attention',
    heroImage: '/landing/blog/adhd-story-attention-tablet-attention-hero.webp',
    updatedAt: '2026-06-17',
    category: {
      uk: 'Увага та СДВГ',
      en: 'Attention and ADHD',
      ru: 'Внимание и СДВГ',
      es: 'Atención y TDAH',
      de: 'Aufmerksamkeit und ADHS',
      fr: 'Attention et TDAH',
      pl: 'Uwaga i ADHD',
    },
    title: {
      uk: 'Як утримати увагу дитини з СДВГ під час історії',
      en: 'How to hold attention for children with ADHD during stories',
      ru: 'Как удержать внимание ребенка с СДВГ во время истории',
      es: 'Cómo mantener la atención de niños con TDAH durante una historia',
      de: 'Wie Geschichten Kindern mit ADHS helfen, dranzubleiben',
      fr: 'Comment garder l’attention d’un enfant avec TDAH pendant une histoire',
      pl: 'Jak utrzymać uwagę dziecka z ADHD podczas historii',
    },
    description: {
      uk: 'Практичний розбір: короткі сцени, передбачуваний ритм, персональні деталі й активне слухання для дітей, яким важко довго тримати увагу.',
      en: 'A practical guide to short scenes, predictable rhythm, personal details, and active listening for children who struggle to sustain attention.',
      ru: 'Практический разбор: короткие сцены, понятный ритм, личные детали и активное слушание для детей, которым трудно долго удерживать внимание.',
      es: 'Una guía práctica sobre escenas cortas, ritmo predecible, detalles personales y escucha activa para niños a quienes les cuesta sostener la atención.',
      de: 'Ein praktischer Leitfaden zu kurzen Szenen, vorhersehbarem Rhythmus, persönlichen Details und aktivem Zuhören.',
      fr: 'Un guide pratique sur les scènes courtes, le rythme prévisible, les détails personnels et l’écoute active.',
      pl: 'Praktyczny przewodnik po krótkich scenach, przewidywalnym rytmie, osobistych detalach i aktywnym słuchaniu.',
    },
    lead: {
      uk: 'Для дитини з СДВГ “слухати історію” часто означає не сидіти нерухомо, а мати достатньо зачіпок, щоб мозок повертався до сюжету знову і знову.',
      en: 'For a child with ADHD, listening to a story often does not mean sitting perfectly still. It means having enough hooks to return to the plot again and again.',
      ru: 'Для ребенка с СДВГ “слушать историю” часто не значит сидеть неподвижно. Важно дать достаточно крючков, чтобы внимание снова возвращалось к сюжету.',
      es: 'Para un niño con TDAH, escuchar una historia no siempre significa quedarse quieto. Significa tener suficientes anclas para volver a la trama una y otra vez.',
      de: 'Für ein Kind mit ADHS bedeutet Zuhören oft nicht stillsitzen. Es braucht genügend Anker, um immer wieder zur Handlung zurückzufinden.',
      fr: 'Pour un enfant avec TDAH, écouter une histoire ne veut pas toujours dire rester immobile. Il faut assez de repères pour revenir au récit.',
      pl: 'Dla dziecka z ADHD słuchanie historii nie zawsze oznacza siedzenie bez ruchu. Potrzebne są haczyki, które pomagają wracać do fabuły.',
    },
    focus: {
      uk: [
        'Увага тримається краще, коли епізоди короткі, герой близький дитині, а кожна сцена має чітку дію: знайти, обрати, врятувати, спробувати ще раз.',
        'Для дитини з СДВГ рух, питання або раптовий коментар не завжди означають, що вона “не слухає”. Часто це спосіб залишатися в контакті з історією. Тому корисніше не вимагати нерухомості, а дати тілу маленьку роль: тримати м’яку іграшку героя, показувати жест сигналу, шукати на ілюстрації важливу деталь.',
        'Добра історія для такої дитини працює серіями. Одна серія має одну ціль, один вибір і швидкий результат. Якщо сцена тягнеться занадто довго, мозок втрачає нитку не через байдужість, а через перевантаження робочої пам’яті.',
      ],
      en: [
        'Attention is easier to sustain when episodes are short, the hero feels familiar, and every scene has a clear action: find, choose, rescue, try again.',
        'For a child with ADHD, movement, questions, or sudden comments do not always mean “not listening.” They can be ways to stay connected to the story. Instead of demanding stillness, give the body a small job: hold the hero toy, make the signal gesture, or find an important detail in the illustration.',
        'A helpful story works in short episodes. One episode has one goal, one choice, and quick feedback. When a scene runs too long, the child may lose the thread because working memory is overloaded, not because the story is unimportant.',
      ],
      ru: [
        'Внимание держится лучше, когда эпизоды короткие, герой похож на ребенка, а у каждой сцены есть понятное действие: найти, выбрать, спасти, попробовать снова.',
        'Для ребенка с СДВГ движение, вопросы или внезапные комментарии не всегда означают “не слушает”. Часто это способ оставаться в контакте с историей. Вместо требования сидеть неподвижно полезнее дать телу маленькую роль: держать игрушку героя, показывать жест-сигнал, искать важную деталь на иллюстрации.',
        'Хорошая история для такого ребенка работает сериями. В одной серии есть одна цель, один выбор и быстрый результат. Если сцена слишком длинная, ребенок теряет нить не из-за равнодушия, а из-за перегрузки рабочей памяти.',
      ],
      es: [
        'La atención se sostiene mejor cuando los episodios son breves, el héroe resulta cercano y cada escena tiene una acción clara: buscar, elegir, ayudar, intentar otra vez.',
        'Para un niño con TDAH, moverse, preguntar o comentar de repente no siempre significa “no escuchar”. A veces es su forma de seguir conectado con la historia. En vez de exigir quietud, dale al cuerpo una pequeña tarea: sostener el objeto del héroe, hacer una señal o buscar un detalle en la ilustración.',
        'Una historia útil funciona por episodios cortos. Cada episodio tiene una meta, una elección y una respuesta rápida. Si la escena dura demasiado, el niño puede perder el hilo por sobrecarga de memoria de trabajo, no por falta de interés.',
      ],
      de: [
        'Aufmerksamkeit bleibt leichter, wenn Episoden kurz sind, die Figur vertraut wirkt und jede Szene eine klare Handlung hat: suchen, wählen, helfen, neu versuchen.',
        'Bei einem Kind mit ADHS bedeuten Bewegung, Fragen oder plötzliche Kommentare nicht immer, dass es nicht zuhört. Oft sind sie ein Weg, mit der Geschichte verbunden zu bleiben. Statt Stillsitzen zu verlangen, gib dem Körper eine kleine Aufgabe: die Heldenfigur halten, ein Signal zeigen oder ein Detail im Bild finden.',
        'Eine hilfreiche Geschichte funktioniert in kurzen Episoden. Eine Episode hat ein Ziel, eine Entscheidung und schnelles Feedback. Wird eine Szene zu lang, verliert das Kind den Faden oft wegen überlastetem Arbeitsgedächtnis, nicht wegen Desinteresse.',
      ],
      fr: [
        'L’attention tient mieux quand les scènes sont courtes, le héros familier et chaque moment porte une action claire : chercher, choisir, aider, recommencer.',
        'Chez un enfant avec TDAH, bouger, poser des questions ou interrompre ne veut pas toujours dire “ne pas écouter”. Cela peut être une manière de rester relié à l’histoire. Au lieu d’exiger l’immobilité, donnez au corps un petit rôle : tenir l’objet du héros, faire un geste-signal ou repérer un détail dans l’image.',
        'Une histoire aidante fonctionne par épisodes courts. Un épisode porte un objectif, un choix et un retour rapide. Quand la scène dure trop longtemps, l’enfant peut perdre le fil à cause d’une mémoire de travail surchargée, pas par désintérêt.',
      ],
      pl: [
        'Uwagę łatwiej utrzymać, gdy epizody są krótkie, bohater bliski dziecku, a każda scena ma prostą akcję: znaleźć, wybrać, pomóc, spróbować ponownie.',
        'U dziecka z ADHD ruch, pytania albo nagłe komentarze nie zawsze oznaczają, że “nie słucha”. Często pomagają pozostać w kontakcie z historią. Zamiast wymagać bezruchu, daj ciału małe zadanie: trzymać przedmiot bohatera, pokazać gest-sygnał albo znaleźć szczegół na ilustracji.',
        'Pomocna historia działa w krótkich odcinkach. Jeden odcinek ma jeden cel, jeden wybór i szybką informację zwrotną. Jeśli scena trwa zbyt długo, dziecko może zgubić wątek przez przeciążenie pamięci roboczej, a nie z braku zainteresowania.',
      ],
    },
    research: {
      uk: [
        'Поведінкові підходи до СДВГ часто працюють через структуру, зовнішні підказки й швидкий зворотний зв’язок. В історії це означає видимі цілі, повторювані маркери й маленькі перемоги.',
        'CDC і педіатричні рекомендації описують поведінкову підтримку як систему коротких інструкцій, передбачуваних правил, підкріплення бажаної поведінки й допомоги дорослого. Для читання це перекладається дуже просто: менше “слухай уважно”, більше “зараз знайдемо ключ, потім оберемо двері”.',
        'Важливо також пам’ятати про перетин СДВГ і труднощів читання. Якщо дитина стабільно уникає тексту, швидко злиться, губить рядок або не розуміє прочитане, справа може бути не лише в увазі. Тоді історія має бути ще м’якшою, а оцінювання варто відкласти.',
      ],
      en: [
        'Behavioral support for ADHD often relies on structure, external prompts, and quick feedback. In a story, that becomes visible goals, repeating cues, and small wins.',
        'CDC and pediatric guidance describe behavioral support through short instructions, predictable rules, reinforcement, and adult scaffolding. In reading, that means less “pay attention” and more “now we find the key, then we choose a door.”',
        'It is also worth remembering that ADHD and reading difficulty can overlap. If a child consistently avoids text, gets angry quickly, loses the line, or does not understand what was read, the issue may not be attention alone. The story should become gentler, and testing should wait.',
      ],
      ru: [
        'Поведенческая поддержка при СДВГ часто строится на структуре, внешних подсказках и быстром отклике. В истории это видимые цели, повторяющиеся сигналы и маленькие победы.',
        'CDC и педиатрические рекомендации описывают поддержку через короткие инструкции, предсказуемые правила, подкрепление желаемого поведения и помощь взрослого. В чтении это значит меньше “слушай внимательно” и больше “сейчас ищем ключ, потом выбираем дверь”.',
        'Важно помнить, что СДВГ и трудности чтения могут пересекаться. Если ребенок постоянно избегает текста, быстро злится, теряет строку или не понимает прочитанное, дело может быть не только во внимании. Тогда история должна стать мягче, а проверки лучше отложить.',
      ],
      es: [
        'El apoyo conductual para el TDAH suele usar estructura, señales externas y respuesta rápida. En una historia eso se traduce en objetivos visibles, pistas repetidas y pequeños logros.',
        'Las guías de CDC y pediatría describen el apoyo conductual con instrucciones breves, reglas predecibles, refuerzo y acompañamiento adulto. En lectura significa menos “presta atención” y más “ahora buscamos la llave, luego elegimos una puerta”.',
        'También conviene recordar que el TDAH y las dificultades lectoras pueden solaparse. Si el niño evita el texto, se enfada rápido, pierde la línea o no comprende, puede no ser solo atención. La historia debe hacerse más suave y la evaluación puede esperar.',
      ],
      de: [
        'Verhaltensnahe Unterstützung bei ADHS nutzt oft Struktur, äußere Hinweise und schnelles Feedback. In Geschichten heißt das: sichtbare Ziele, wiederkehrende Signale, kleine Erfolge.',
        'CDC- und pädiatrische Empfehlungen beschreiben Unterstützung durch kurze Anweisungen, vorhersehbare Regeln, Verstärkung und Begleitung. Beim Lesen heißt das weniger “pass auf” und mehr “jetzt finden wir den Schlüssel, dann wählen wir eine Tür”.',
        'ADHS und Leseschwierigkeiten können sich überschneiden. Wenn ein Kind Text vermeidet, schnell wütend wird, die Zeile verliert oder wenig versteht, geht es vielleicht nicht nur um Aufmerksamkeit. Dann braucht die Geschichte mehr Entlastung, nicht mehr Prüfung.',
      ],
      fr: [
        'L’accompagnement du TDAH s’appuie souvent sur la structure, les repères externes et un retour rapide. Dans une histoire, cela devient des objectifs visibles et de petites victoires.',
        'Les recommandations du CDC et de la pédiatrie décrivent un soutien fait de consignes courtes, règles prévisibles, renforcement et étayage adulte. En lecture, cela veut dire moins “concentre-toi” et plus “cherchons la clé, puis choisissons une porte”.',
        'Le TDAH et les difficultés de lecture peuvent aussi se croiser. Si l’enfant évite le texte, s’énerve vite, perd la ligne ou comprend peu, ce n’est peut-être pas seulement l’attention. L’histoire doit devenir plus douce, et l’évaluation peut attendre.',
      ],
      pl: [
        'Wsparcie behawioralne przy ADHD często opiera się na strukturze, zewnętrznych wskazówkach i szybkiej informacji zwrotnej. W bajce oznacza to widoczne cele i małe zwycięstwa.',
        'CDC i zalecenia pediatryczne opisują wsparcie przez krótkie instrukcje, przewidywalne zasady, wzmacnianie i pomoc dorosłego. W czytaniu oznacza to mniej “skup się”, a więcej “teraz szukamy klucza, potem wybieramy drzwi”.',
        'Warto pamiętać, że ADHD i trudności w czytaniu mogą się nakładać. Jeśli dziecko unika tekstu, szybko się złości, gubi linijkę albo nie rozumie treści, problemem może być nie tylko uwaga. Wtedy historia powinna być łagodniejsza, a sprawdzanie może poczekać.',
      ],
    },
    storyUse: {
      uk: [
        'У WonderTales дитина може почати з вибору героя, предмета й місії. Далі історія тримає компактний маршрут: одна проблема, один крок, одна емоція. Після сцени легко м’яко запитати: “Що герой зробить далі?”',
        'Перед стартом домовтеся про формат. Наприклад: “Сьогодні це коротка серія. Ти можеш бути детективом емоцій або звукооператором. Коли герой злякається, покажи це обличчям; коли знайде підказку, скажи наше слово-сигнал”. Так дитина отримує активну участь без хаосу.',
        'Персоналізація тут має бути дозованою. Достатньо однієї знайомої деталі: рюкзак як у дитини, домашній пес у ролі помічника, улюблена планета або місто. Якщо додати все одразу, історія стане шумною і втратить маршрут.',
      ],
      en: [
        'In WonderTales, a child can start by choosing a hero, object, and mission. The story then keeps a compact route: one problem, one move, one feeling. After a scene, it is easy to ask gently: “What should the hero do next?”',
        'Before starting, agree on a format: “Today is a short episode. You can be the emotion detective or the sound designer. When the hero feels scared, show it with your face; when they find a clue, say our signal word.” This gives active participation without chaos.',
        'Personalization should be measured. One familiar detail is enough: a backpack like the child’s, a family dog as helper, a favorite planet or city. Too many details make the story noisy and harder to follow.',
      ],
      ru: [
        'В WonderTales ребенок может начать с выбора героя, предмета и миссии. Дальше история держит компактный маршрут: одна проблема, один шаг, одно чувство. После сцены легко мягко спросить: “Что герой сделает дальше?”',
        'Перед стартом договоритесь о формате: “Сегодня короткая серия. Ты можешь быть детективом эмоций или звукорежиссером. Когда герой испугается, покажи лицом; когда найдет подсказку, скажи наше слово-сигнал”. Так ребенок участвует активно, но без хаоса.',
        'Персонализацию лучше дозировать. Достаточно одной знакомой детали: рюкзак как у ребенка, домашний пес в роли помощника, любимая планета или город. Если добавить всё сразу, история станет шумной и потеряет маршрут.',
      ],
      es: [
        'En WonderTales, el niño puede empezar eligiendo héroe, objeto y misión. Después la historia mantiene una ruta compacta: un problema, un paso, una emoción. Tras una escena, es fácil preguntar con suavidad: “¿Qué hará ahora el héroe?”',
        'Antes de empezar, acuerden el formato: “Hoy será un episodio corto. Puedes ser detective de emociones o diseñador de sonidos. Cuando el héroe tenga miedo, muéstralo con la cara; cuando encuentre una pista, di nuestra palabra señal”. Así participa sin caos.',
        'La personalización debe ser medida. Basta un detalle conocido: una mochila parecida, el perro de casa como ayudante, un planeta o ciudad favorita. Demasiados detalles vuelven la historia ruidosa.',
      ],
      de: [
        'In WonderTales kann das Kind mit Held, Gegenstand und Mission beginnen. Danach hält die Geschichte eine kompakte Route: ein Problem, ein Schritt, ein Gefühl. Nach einer Szene lässt sich sanft fragen: „Was macht die Figur als Nächstes?“',
        'Vereinbare vor dem Start ein Format: „Heute ist es eine kurze Folge. Du bist Emotionsdetektiv oder Geräuschemacher. Wenn die Figur Angst hat, zeig es mit dem Gesicht; wenn sie einen Hinweis findet, sag unser Signalwort.“ So entsteht Beteiligung ohne Chaos.',
        'Personalisierung sollte dosiert sein. Ein vertrautes Detail reicht: ein ähnlicher Rucksack, der Familienhund als Helfer, ein Lieblingsplanet oder eine Stadt. Zu viele Details machen die Geschichte unruhig.',
      ],
      fr: [
        'Dans WonderTales, l’enfant peut commencer en choisissant le héros, l’objet et la mission. L’histoire garde ensuite un chemin compact : un problème, une action, une émotion. Après une scène, on peut demander doucement : « Que fait le héros maintenant ? »',
        'Avant de commencer, fixez le cadre : « Aujourd’hui, c’est un court épisode. Tu peux être détective des émotions ou responsable des sons. Quand le héros a peur, montre-le avec ton visage ; quand il trouve un indice, dis notre mot-signal. »',
        'La personnalisation doit rester légère. Un détail familier suffit : un sac comme celui de l’enfant, le chien de la famille comme aide, une planète ou une ville aimée. Trop de détails brouillent le fil.',
      ],
      pl: [
        'W WonderTales dziecko może zacząć od wyboru bohatera, przedmiotu i misji. Potem historia trzyma zwartą ścieżkę: jeden problem, jeden krok, jedna emocja. Po scenie łatwo łagodnie zapytać: „Co bohater zrobi dalej?”',
        'Przed startem ustal format: „Dziś krótki odcinek. Możesz być detektywem emocji albo specjalistą od dźwięków. Gdy bohater się przestraszy, pokaż to miną; gdy znajdzie wskazówkę, powiedz nasze hasło.”',
        'Personalizacja powinna być oszczędna. Wystarczy jeden znajomy detal: plecak jak u dziecka, domowy pies jako pomocnik, ulubiona planeta albo miasto. Zbyt wiele szczegółów robi szum.',
      ],
    },
    adjustment: {
      uk: [
        'Якщо дитина починає перебивати або рухатися, це не провал історії. Скоротіть сцену, додайте вибір або перетворіть слухання на міні-гру з повторюваним словом-сигналом.',
        'Коли дитина просить ту саму історію знову, це теж не проблема. Повтор може бути опорою: сюжет уже знайомий, тому легше передбачати, брати участь і помічати нові слова. Можна змінити лише одну деталь, щоб зберегти безпеку й додати інтерес.',
        'Якщо після читання дитина збуджена, важливо не “дочитати будь-що”, а завершити на маленькій перемозі. Для вечора підійде фраза-якір: “Серія завершена, герой у безпеці, ми продовжимо завтра”.',
      ],
      en: [
        'If the child interrupts or moves around, the story has not failed. Shorten the scene, add a choice, or turn listening into a tiny game with a repeated signal word.',
        'If the child asks for the same story again, that is not a problem either. Repetition can be a support: the plot is familiar, so it is easier to predict, participate, and notice new words. Change just one detail to keep safety and add interest.',
        'If the child feels activated after reading, do not push to finish everything. End on a small success. For bedtime, use an anchor phrase: “The episode is done, the hero is safe, we continue tomorrow.”',
      ],
      ru: [
        'Если ребенок перебивает или двигается, это не провал. Сократите сцену, добавьте выбор или превратите слушание в мини-игру с повторяющимся словом-сигналом.',
        'Если ребенок просит ту же историю снова, это тоже нормально. Повтор может быть опорой: сюжет знаком, легче предсказывать, участвовать и замечать новые слова. Можно изменить одну деталь, чтобы сохранить безопасность и добавить интерес.',
        'Если после чтения ребенок перевозбужден, не нужно “дочитывать любой ценой”. Лучше закончить на маленькой победе. Для вечера подойдет фраза-якорь: “Серия закончена, герой в безопасности, продолжим завтра”.',
      ],
      es: [
        'Si el niño interrumpe o se mueve, la historia no falló. Acorta la escena, añade una elección o convierte la escucha en un pequeño juego con una palabra señal.',
        'Si pide repetir la misma historia, tampoco es un problema. La repetición puede sostener: la trama ya es conocida, así que es más fácil predecir, participar y notar palabras nuevas. Cambia solo un detalle.',
        'Si después de leer queda muy activado, no hace falta terminar todo. Cierra en una pequeña victoria. Para la noche: “El episodio terminó, el héroe está a salvo, seguimos mañana”.',
      ],
      de: [
        'Wenn das Kind unterbricht oder herumläuft, ist die Geschichte nicht gescheitert. Kürze die Szene, füge eine Wahl ein oder nutze ein Signalwort als Spiel.',
        'Wenn das Kind dieselbe Geschichte wieder hören will, ist das ebenfalls in Ordnung. Wiederholung stützt: Die Handlung ist bekannt, Vorhersagen und Mitmachen fallen leichter. Verändere nur ein Detail.',
        'Wenn das Kind danach sehr aktiviert ist, muss man nicht um jeden Preis fertiglesen. Beende auf einem kleinen Erfolg. Abends hilft ein Ankersatz: „Die Folge ist fertig, die Figur ist sicher, morgen geht es weiter.“',
      ],
      fr: [
        'Si l’enfant interrompt ou bouge, l’histoire n’a pas échoué. Raccourcissez la scène, ajoutez un choix ou utilisez un mot-signal comme mini-jeu.',
        'S’il demande la même histoire encore une fois, ce n’est pas un problème. La répétition soutient : l’intrigue connue aide à prévoir, participer et entendre de nouveaux mots. Changez seulement un détail.',
        'Si l’enfant est très stimulé après la lecture, inutile de finir à tout prix. Terminez sur une petite réussite. Le soir : « L’épisode est terminé, le héros est en sécurité, on continue demain. »',
      ],
      pl: [
        'Jeśli dziecko przerywa albo się rusza, historia nie jest porażką. Skróć scenę, dodaj wybór albo użyj powtarzanego słowa-sygnału.',
        'Jeśli prosi o tę samą historię jeszcze raz, to też jest w porządku. Powtórzenie wspiera: fabuła jest znana, łatwiej przewidywać, uczestniczyć i zauważać nowe słowa. Zmień tylko jeden detal.',
        'Jeśli po czytaniu dziecko jest pobudzone, nie trzeba kończyć wszystkiego za wszelką cenę. Zakończ małym sukcesem. Wieczorem pomaga zdanie-kotwica: „Odcinek skończony, bohater jest bezpieczny, jutro ciąg dalszy.”',
      ],
    },
    checklist: {
      uk: ['Обрати одну коротку місію.', 'Додати знайому деталь з життя дитини.', 'Після кожної сцени ставити одне просте питання.'],
      en: ['Choose one short mission.', 'Add one familiar detail from the child’s life.', 'Ask one simple question after each scene.'],
      ru: ['Выберите одну короткую миссию.', 'Добавьте знакомую деталь из жизни ребенка.', 'После каждой сцены задавайте один простой вопрос.'],
      es: ['Elige una misión breve.', 'Añade un detalle familiar de la vida del niño.', 'Haz una pregunta sencilla después de cada escena.'],
      de: ['Wähle eine kurze Mission.', 'Baue ein vertrautes Detail ein.', 'Stelle nach jeder Szene eine einfache Frage.'],
      fr: ['Choisissez une mission courte.', 'Ajoutez un détail familier.', 'Posez une question simple après chaque scène.'],
      pl: ['Wybierz krótką misję.', 'Dodaj znajomy detal z życia dziecka.', 'Po każdej scenie zadaj jedno proste pytanie.'],
    },
    quote: {
      text: {
        uk: 'СДВГ — це не розлад знання того, що робити, а труднощі з виконанням того, що вже знаєш.',
        en: 'ADHD is not a disorder of knowing what to do, but of doing what you know.',
        ru: 'СДВГ — это не расстройство знания о том, что делать, а трудность с выполнением того, что уже знаешь.',
        es: 'El TDAH no es un trastorno de saber qué hacer, sino de hacer lo que ya sabes.',
        de: 'ADHS ist nicht eine Störung des Wissens, was zu tun ist, sondern des Umsetzens dessen, was man weiß.',
        fr: 'Le TDAH n’est pas un trouble du fait de savoir quoi faire, mais de réussir à faire ce que l’on sait déjà.',
        pl: 'ADHD nie polega na braku wiedzy, co zrobić, lecz na trudności z wykonaniem tego, co już się wie.',
      },
      attribution: 'Russell A. Barkley',
      sourceLabel: {
        uk: 'Ресурси Рассела Барклі про СДВГ',
        en: 'Barkley ADHD resources',
        ru: 'Ресурсы Рассела Баркли о СДВГ',
        es: 'Recursos de Barkley sobre TDAH',
        de: 'Barkley-Ressourcen zu ADHS',
        fr: 'Ressources de Barkley sur le TDAH',
        pl: 'Materiały Barkleya o ADHD',
      },
      sourceUrl: 'https://www.russellbarkley.org/',
    },
    sources: [
      { label: 'CDC: ADHD in children', url: 'https://www.cdc.gov/adhd/index.html' },
      { label: 'Russell A. Barkley resources', url: 'https://www.russellbarkley.org/' },
      { label: 'American Academy of Pediatrics ADHD guideline', url: 'https://publications.aap.org/pediatrics/article/144/4/e20192528/81590/Clinical-Practice-Guideline-for-the-Diagnosis' },
    ],
    visualDirection: 'A child following glowing story breadcrumbs through illustrated scenes; high contrast focus points, gentle motion cues.',
    relatedSlugs: ['five-minute-stories', 'audio-bedtime-stories'],
    inlineImages: [
      {
        src: '/landing/blog/adhd-story-attention-short-choice.webp',
        sectionIndex: 2,
        afterParagraphIndex: 0,
        alt: {
          uk: 'Дитина обирає двері для героя в короткому сюжетному епізоді на столі',
          en: 'A child chooses a door for a story hero in a short tabletop episode',
          ru: 'Ребенок выбирает дверь для героя в коротком сюжетном эпизоде на столе',
          es: 'Un niño elige una puerta para el héroe en una escena breve sobre la mesa',
          de: 'Ein Kind wählt auf dem Tisch eine Tür für die Figur der Geschichte',
          fr: 'Un enfant choisit une porte pour le héros dans une courte scène sur la table',
          pl: 'Dziecko wybiera drzwi dla bohatera w krótkiej scenie na stole',
        },
        caption: {
          uk: 'Одна сцена, один вибір і швидкий результат роблять історію легшою для стеження.',
          en: 'One scene, one choice, and quick feedback make the story easier to follow.',
          ru: 'Одна сцена, один выбор и быстрый результат помогают удерживать нить истории.',
          es: 'Una escena, una elección y una respuesta rápida hacen que la historia sea más fácil de seguir.',
          de: 'Eine Szene, eine Wahl und schnelles Feedback machen die Geschichte leichter nachvollziehbar.',
          fr: 'Une scène, un choix et un retour rapide rendent l’histoire plus facile à suivre.',
          pl: 'Jedna scena, jeden wybór i szybki efekt ułatwiają śledzenie historii.',
        },
      },
      {
        src: '/landing/blog/adhd-story-attention-audio-movement.webp',
        sectionIndex: 3,
        afterParagraphIndex: 0,
        alt: {
          uk: 'Дитина слухає історію поруч із дорослим і м’яко рухається на килимку',
          en: 'A child listens to a story beside a parent while gently moving on a rug',
          ru: 'Ребенок слушает историю рядом с родителем и мягко двигается на коврике',
          es: 'Un niño escucha una historia junto a un adulto mientras se mueve suavemente en una alfombra',
          de: 'Ein Kind hört neben einem Elternteil eine Geschichte und bewegt sich ruhig auf dem Teppich',
          fr: 'Un enfant écoute une histoire près d’un parent en bougeant doucement sur un tapis',
          pl: 'Dziecko słucha historii obok rodzica i spokojnie porusza się na dywanie',
        },
        caption: {
          uk: 'Рух може бути частиною слухання, якщо він не забирає дитину з історії.',
          en: 'Movement can be part of listening when it helps the child stay with the story.',
          ru: 'Движение может быть частью слушания, если помогает ребенку оставаться в истории.',
          es: 'El movimiento puede ser parte de la escucha cuando ayuda al niño a seguir en la historia.',
          de: 'Bewegung kann Teil des Zuhörens sein, wenn sie das Kind bei der Geschichte hält.',
          fr: 'Le mouvement peut faire partie de l’écoute quand il aide l’enfant à rester dans l’histoire.',
          pl: 'Ruch może być częścią słuchania, jeśli pomaga dziecku zostać z historią.',
        },
      },
    ],
    insightCards: {
      uk: [
        { eyebrow: 'Ритм', title: 'Серії по 2-3 хвилини', body: 'Краще кілька коротких сцен з маленькими перемогами, ніж одна довга сцена, де дитина втрачає нитку.' },
        { eyebrow: 'Участь', title: 'Роль для тіла', body: 'Дайте жест, звук, предмет або пошук деталі на картинці. Рух може підтримувати увагу, якщо він має форму.' },
        { eyebrow: 'Підтримка', title: 'Похвала за повернення', body: 'Помічайте не “ідеальне сидіння”, а момент, коли дитина повернулася до історії після паузи.' },
      ],
      en: [
        { eyebrow: 'Rhythm', title: '2-3 minute episodes', body: 'Several short scenes with small wins work better than one long scene where the thread is easy to lose.' },
        { eyebrow: 'Participation', title: 'A job for the body', body: 'Give a gesture, sound, object, or detail-finding task. Movement can support attention when it has a shape.' },
        { eyebrow: 'Support', title: 'Praise returning', body: 'Notice not perfect sitting, but the moment when the child comes back to the story after a pause.' },
      ],
      ru: [
        { eyebrow: 'Ритм', title: 'Серии по 2-3 минуты', body: 'Лучше несколько коротких сцен с маленькими победами, чем одна длинная сцена, где легко потерять нить.' },
        { eyebrow: 'Участие', title: 'Роль для тела', body: 'Дайте жест, звук, предмет или поиск детали на картинке. Движение помогает вниманию, если у него есть форма.' },
        { eyebrow: 'Поддержка', title: 'Хвалите возвращение', body: 'Замечайте не идеальное сидение, а момент, когда ребенок вернулся к истории после паузы.' },
      ],
      es: [
        { eyebrow: 'Ritmo', title: 'Episodios de 2-3 minutos', body: 'Varias escenas breves con pequeños logros funcionan mejor que una escena larga donde se pierde el hilo.' },
        { eyebrow: 'Participación', title: 'Una tarea para el cuerpo', body: 'Usa un gesto, sonido, objeto o búsqueda de detalles. El movimiento ayuda si tiene forma.' },
        { eyebrow: 'Apoyo', title: 'Elogia el regreso', body: 'Valora no estar quieto perfecto, sino volver a la historia después de una pausa.' },
      ],
      de: [
        { eyebrow: 'Rhythmus', title: 'Episoden von 2-3 Minuten', body: 'Mehrere kurze Szenen mit kleinen Erfolgen tragen besser als eine lange Szene, in der der Faden verloren geht.' },
        { eyebrow: 'Mitmachen', title: 'Eine Aufgabe für den Körper', body: 'Nutze Geste, Geräusch, Gegenstand oder Detailsuche. Bewegung hilft, wenn sie eine Form hat.' },
        { eyebrow: 'Unterstützung', title: 'Rückkehr loben', body: 'Lobe nicht perfektes Stillsitzen, sondern den Moment, in dem das Kind zur Geschichte zurückfindet.' },
      ],
      fr: [
        { eyebrow: 'Rythme', title: 'Épisodes de 2-3 minutes', body: 'Plusieurs scènes courtes avec de petites réussites valent mieux qu’une longue scène où l’on perd le fil.' },
        { eyebrow: 'Participation', title: 'Un rôle pour le corps', body: 'Proposez un geste, un son, un objet ou un détail à chercher. Le mouvement aide quand il a une forme.' },
        { eyebrow: 'Soutien', title: 'Valoriser le retour', body: 'Remarquez moins l’immobilité parfaite que le moment où l’enfant revient à l’histoire.' },
      ],
      pl: [
        { eyebrow: 'Rytm', title: 'Odcinki po 2-3 minuty', body: 'Kilka krótkich scen z małymi sukcesami działa lepiej niż jedna długa scena, w której łatwo zgubić wątek.' },
        { eyebrow: 'Udział', title: 'Zadanie dla ciała', body: 'Daj gest, dźwięk, przedmiot albo szukanie szczegółu. Ruch pomaga, gdy ma ramę.' },
        { eyebrow: 'Wsparcie', title: 'Chwal powrót', body: 'Zauważ nie idealne siedzenie, ale moment, gdy dziecko wraca do historii po przerwie.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Як реагувати прямо під час історії',
        intro: 'Ці реакції не замінюють діагностику чи терапію. Це домашні способи зробити читання м’якшим і зрозумілішим.',
        columns: ['Як виглядає', 'Що це може означати', 'Що спробувати'],
        rows: [
          ['Дитина встає або крутиться', 'Тілу потрібна участь, а не пауза у контакті', 'Дати роль: показувати сигнал, тримати предмет, робити звук героя'],
          ['Перебиває питаннями', 'Мозок ловить асоціації швидше, ніж рухається текст', 'Записати питання як “підказку детектива” і повернутися до сцени'],
          ['Просить ту саму історію', 'Повтор дає безпеку і передбачуваність', 'Повторити сюжет, але змінити одну маленьку деталь'],
          ['Злиться на текст', 'Може бути занадто важко або занадто довго', 'Скоротити сцену, читати по ролях або перейти на аудіо'],
        ],
      },
      en: {
        heading: 'How to respond during the story',
        intro: 'These ideas do not replace diagnosis or therapy. They are home tools for making reading softer and easier to follow.',
        columns: ['What you see', 'What it may mean', 'What to try'],
        rows: [
          ['The child stands up or fidgets', 'The body needs a role, not a break from connection', 'Give a job: signal gesture, object, or hero sound'],
          ['They interrupt with questions', 'Associations arrive faster than the text moves', 'Save the question as a detective clue and return to the scene'],
          ['They ask for the same story', 'Repetition gives safety and predictability', 'Repeat the plot, changing one small detail'],
          ['They get angry at the text', 'It may be too hard or too long', 'Shorten the scene, read roles, or switch to audio'],
        ],
      },
      ru: {
        heading: 'Как реагировать прямо во время истории',
        intro: 'Это не замена диагностике или терапии. Это домашние способы сделать чтение мягче и понятнее.',
        columns: ['Как выглядит', 'Что это может значить', 'Что попробовать'],
        rows: [
          ['Ребенок встает или крутится', 'Телу нужна роль, а не разрыв контакта', 'Дать задачу: жест-сигнал, предмет или звук героя'],
          ['Перебивает вопросами', 'Ассоциации приходят быстрее, чем движется текст', 'Записать вопрос как “улику детектива” и вернуться к сцене'],
          ['Просит ту же историю', 'Повтор дает безопасность и предсказуемость', 'Повторить сюжет, изменив одну маленькую деталь'],
          ['Злится на текст', 'Может быть слишком трудно или долго', 'Сократить сцену, читать по ролям или перейти на аудио'],
        ],
      },
      es: {
        heading: 'Cómo responder durante la historia',
        intro: 'Estas ideas no reemplazan diagnóstico ni terapia. Son herramientas caseras para que la lectura sea más suave y clara.',
        columns: ['Qué ves', 'Qué puede significar', 'Qué probar'],
        rows: [
          ['Se levanta o se mueve mucho', 'El cuerpo necesita un papel, no cortar el contacto', 'Dar una tarea: gesto señal, objeto o sonido del héroe'],
          ['Interrumpe con preguntas', 'Las asociaciones llegan antes que el texto', 'Guardar la pregunta como pista de detective y volver a la escena'],
          ['Pide la misma historia', 'La repetición da seguridad y previsibilidad', 'Repetir la trama cambiando un detalle pequeño'],
          ['Se enfada con el texto', 'Puede ser demasiado difícil o largo', 'Acortar la escena, leer por roles o pasar a audio'],
        ],
      },
      de: {
        heading: 'Wie du während der Geschichte reagieren kannst',
        intro: 'Diese Ideen ersetzen keine Diagnose oder Therapie. Sie helfen zuhause, Lesen weicher und klarer zu machen.',
        columns: ['Was du siehst', 'Was es bedeuten kann', 'Was du versuchen kannst'],
        rows: [
          ['Das Kind steht auf oder zappelt', 'Der Körper braucht eine Rolle, keinen Kontaktabbruch', 'Eine Aufgabe geben: Signal, Gegenstand oder Heldengeräusch'],
          ['Es unterbricht mit Fragen', 'Assoziationen kommen schneller als der Text', 'Die Frage als Detektivhinweis sichern und zurück zur Szene gehen'],
          ['Es will dieselbe Geschichte', 'Wiederholung gibt Sicherheit und Vorhersagbarkeit', 'Die Handlung wiederholen, ein Detail ändern'],
          ['Es wird wütend auf den Text', 'Er ist vielleicht zu schwer oder zu lang', 'Szene kürzen, Rollen lesen oder Audio nutzen'],
        ],
      },
      fr: {
        heading: 'Comment réagir pendant l’histoire',
        intro: 'Ces idées ne remplacent ni diagnostic ni thérapie. Elles aident à rendre la lecture plus douce et plus lisible à la maison.',
        columns: ['Ce que vous voyez', 'Ce que cela peut dire', 'Quoi essayer'],
        rows: [
          ['L’enfant se lève ou bouge', 'Le corps a besoin d’un rôle, pas de couper le lien', 'Donner une tâche : geste-signal, objet ou son du héros'],
          ['Il interrompt avec des questions', 'Les associations arrivent plus vite que le texte', 'Garder la question comme indice puis revenir à la scène'],
          ['Il demande la même histoire', 'La répétition donne sécurité et prévisibilité', 'Répéter l’intrigue en changeant un petit détail'],
          ['Il se fâche contre le texte', 'C’est peut-être trop difficile ou trop long', 'Raccourcir, lire par rôles ou passer à l’audio'],
        ],
      },
      pl: {
        heading: 'Jak reagować w trakcie historii',
        intro: 'To nie zastępuje diagnozy ani terapii. To domowe sposoby, aby czytanie było łagodniejsze i łatwiejsze.',
        columns: ['Co widać', 'Co to może znaczyć', 'Co spróbować'],
        rows: [
          ['Dziecko wstaje albo się kręci', 'Ciało potrzebuje roli, nie zerwania kontaktu', 'Daj zadanie: gest, przedmiot albo dźwięk bohatera'],
          ['Przerywa pytaniami', 'Skojarzenia przychodzą szybciej niż tekst', 'Zapisz pytanie jako wskazówkę detektywa i wróć do sceny'],
          ['Prosi o tę samą historię', 'Powtórka daje bezpieczeństwo i przewidywalność', 'Powtórz fabułę, zmieniając jeden detal'],
          ['Złości się na tekst', 'Może być za trudno albo za długo', 'Skróć scenę, czytaj role albo użyj audio'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Міні-сценарій',
        heading: '10 хвилин історії без боротьби',
        intro: 'Коли увага швидко виснажується, допомагає не довший контроль, а короткий маршрут.',
        steps: [
          { title: '1 хвилина: вибір ролі', body: 'Дитина обирає: детектив емоцій, шукач підказок або звукооператор.' },
          { title: '6 хвилин: дві короткі сцени', body: 'Кожна сцена має одну дію і одну паузу для вибору.' },
          { title: '1 хвилина: рух', body: 'Потягнутися, показати жест героя або знайти предмет у кімнаті.' },
          { title: '2 хвилини: м’який фінал', body: 'Назвати улюблений момент і завершити на маленькій перемозі.' },
        ],
      },
      en: {
        eyebrow: 'Mini script',
        heading: '10 minutes of story without a fight',
        intro: 'When attention tires quickly, the answer is not more control, but a shorter route.',
        steps: [
          { title: '1 minute: choose a role', body: 'The child chooses: emotion detective, clue finder, or sound designer.' },
          { title: '6 minutes: two short scenes', body: 'Each scene has one action and one pause for a choice.' },
          { title: '1 minute: movement', body: 'Stretch, show the hero gesture, or find an object in the room.' },
          { title: '2 minutes: soft ending', body: 'Name a favorite moment and end on a small win.' },
        ],
      },
      ru: {
        eyebrow: 'Мини-сценарий',
        heading: '10 минут истории без борьбы',
        intro: 'Когда внимание быстро устает, помогает не больше контроля, а более короткий маршрут.',
        steps: [
          { title: '1 минута: выбор роли', body: 'Ребенок выбирает: детектив эмоций, искатель подсказок или звукорежиссер.' },
          { title: '6 минут: две короткие сцены', body: 'В каждой сцене одно действие и одна пауза для выбора.' },
          { title: '1 минута: движение', body: 'Потянуться, показать жест героя или найти предмет в комнате.' },
          { title: '2 минуты: мягкий финал', body: 'Назвать любимый момент и закончить на маленькой победе.' },
        ],
      },
      es: {
        eyebrow: 'Mini guion',
        heading: '10 minutos de historia sin pelea',
        intro: 'Cuando la atención se cansa rápido, ayuda una ruta más corta, no más control.',
        steps: [
          { title: '1 minuto: elegir rol', body: 'El niño elige: detective de emociones, buscador de pistas o diseñador de sonidos.' },
          { title: '6 minutos: dos escenas breves', body: 'Cada escena tiene una acción y una pausa para elegir.' },
          { title: '1 minuto: movimiento', body: 'Estirarse, hacer el gesto del héroe o buscar un objeto.' },
          { title: '2 minutos: final suave', body: 'Nombrar el momento favorito y cerrar con un pequeño logro.' },
        ],
      },
      de: {
        eyebrow: 'Mini-Skript',
        heading: '10 Minuten Geschichte ohne Kampf',
        intro: 'Wenn Aufmerksamkeit schnell müde wird, hilft ein kürzerer Weg, nicht mehr Kontrolle.',
        steps: [
          { title: '1 Minute: Rolle wählen', body: 'Das Kind wählt: Emotionsdetektiv, Hinweissucher oder Geräuschemacher.' },
          { title: '6 Minuten: zwei kurze Szenen', body: 'Jede Szene hat eine Handlung und eine Wahlpause.' },
          { title: '1 Minute: Bewegung', body: 'Strecken, Heldengeste zeigen oder einen Gegenstand suchen.' },
          { title: '2 Minuten: sanfter Schluss', body: 'Lieblingsmoment nennen und mit einem kleinen Erfolg enden.' },
        ],
      },
      fr: {
        eyebrow: 'Mini-scénario',
        heading: '10 minutes d’histoire sans lutte',
        intro: 'Quand l’attention fatigue vite, un chemin plus court aide mieux qu’un contrôle plus fort.',
        steps: [
          { title: '1 minute : choisir un rôle', body: 'L’enfant choisit : détective des émotions, chercheur d’indices ou responsable des sons.' },
          { title: '6 minutes : deux scènes courtes', body: 'Chaque scène a une action et une pause pour choisir.' },
          { title: '1 minute : mouvement', body: 'S’étirer, faire le geste du héros ou trouver un objet.' },
          { title: '2 minutes : fin douce', body: 'Nommer le moment préféré et finir sur une petite réussite.' },
        ],
      },
      pl: {
        eyebrow: 'Mini-scenariusz',
        heading: '10 minut historii bez walki',
        intro: 'Gdy uwaga szybko się męczy, pomaga krótsza droga, nie większa kontrola.',
        steps: [
          { title: '1 minuta: wybór roli', body: 'Dziecko wybiera: detektyw emocji, poszukiwacz wskazówek albo specjalista od dźwięków.' },
          { title: '6 minut: dwie krótkie sceny', body: 'Każda scena ma jedną akcję i jedną pauzę na wybór.' },
          { title: '1 minuta: ruch', body: 'Przeciągnąć się, pokazać gest bohatera albo znaleźć przedmiot.' },
          { title: '2 minuty: miękki finał', body: 'Nazwać ulubiony moment i skończyć małym sukcesem.' },
        ],
      },
    },
  },
  {
    slug: 'personalized-childrens-stories',
    heroImage: '/landing/blog/personalized-childrens-stories-scene-01.webp',
    updatedAt: '2026-06-17',
    category: {
      uk: 'Персоналізація',
      en: 'Personalization',
      ru: 'Персонализация',
      es: 'Personalización',
      de: 'Personalisierung',
      fr: 'Personnalisation',
      pl: 'Personalizacja',
    },
    title: {
      uk: 'Персоналізовані історії: коли “про мене” справді допомагає',
      en: 'Personalized children’s stories: when “about me” really helps',
      ru: 'Персонализированные истории: когда “про меня” действительно помогает',
      es: 'Historias personalizados: cuándo “sobre mí” realmente ayuda',
      de: 'Personalisierte Kindergeschichten: wann „über mich“ wirklich hilft',
      fr: 'Histoires personnalisées : quand “sur moi” aide vraiment',
      pl: 'Personalizowane historie: kiedy „o mnie” naprawdę pomaga',
    },
    description: {
      uk: 'Як персоналізація може підсилювати залучення, мову й пам’ять, якщо не перетворювати історію на набір випадкових імен.',
      en: 'How personalization can support engagement, language, and memory when it is more than dropping a child’s name into a random plot.',
      ru: 'Как персонализация помогает вовлечению, языку и памяти, если это не просто имя ребенка в случайном сюжете.',
      es: 'Cómo la personalización puede apoyar atención, lenguaje y memoria cuando es más que insertar un nombre en una trama cualquiera.',
      de: 'Wie Personalisierung Aufmerksamkeit, Sprache und Erinnerung stärken kann, wenn sie mehr ist als ein Name in einer beliebigen Handlung.',
      fr: 'Comment la personnalisation peut soutenir l’attention, le langage et la mémoire quand elle ne se limite pas à ajouter un prénom.',
      pl: 'Jak personalizacja wspiera uwagę, język i pamięć, gdy nie polega tylko na wstawieniu imienia do przypadkowej fabuły.',
    },
    lead: {
      uk: 'Дитина швидше входить у текст, коли впізнає себе, близьких, місце або улюблену тему. Але добра персоналізація має служити сюжету, а не шуміти поверх нього.',
      en: 'A child enters a text faster when they recognize themselves, familiar people, places, or favorite themes. Good personalization serves the plot instead of decorating it.',
      ru: 'Ребенок быстрее входит в текст, когда узнает себя, близких, место или любимую тему. Но хорошая персонализация служит сюжету, а не украшает его.',
      es: 'Un niño entra antes en el texto cuando reconoce personas, lugares o temas favoritos. La buena personalización sirve a la trama, no la adorna.',
      de: 'Ein Kind findet schneller in einen Text, wenn es sich, vertraute Menschen oder Lieblingsthemen erkennt. Gute Personalisierung dient der Handlung.',
      fr: 'Un enfant entre plus vite dans un texte quand il reconnaît des personnes, des lieux ou des thèmes aimés. La bonne personnalisation sert le récit.',
      pl: 'Dziecko szybciej wchodzi w tekst, gdy rozpoznaje siebie, bliskich, miejsce lub ulubiony temat. Dobra personalizacja służy fabule.',
    },
    focus: {
      uk: 'Найсильніше працюють не всі факти одразу, а кілька точних деталей: ім’я, роль, маленька звичка, улюблена тема або предмет, який повертається у ключові моменти.',
      en: 'The strongest personalization is not every fact at once. It is a few precise details: name, role, small habit, favorite theme, or an object that returns at key moments.',
      ru: 'Лучше всего работают не все факты сразу, а несколько точных деталей: имя, роль, привычка, любимая тема или предмет, который возвращается в ключевые моменты.',
      es: 'Lo más útil no es incluir todos los datos, sino pocos detalles precisos: nombre, rol, hábito, tema favorito u objeto que vuelve en momentos clave.',
      de: 'Am stärksten wirkt nicht jedes Detail zugleich, sondern wenige präzise Details: Name, Rolle, Gewohnheit, Lieblingsthema oder ein wiederkehrender Gegenstand.',
      fr: 'Le plus fort n’est pas d’ajouter tous les détails, mais quelques repères précis : prénom, rôle, habitude, thème préféré ou objet récurrent.',
      pl: 'Najlepiej działają nie wszystkie fakty naraz, lecz kilka trafnych detali: imię, rola, nawyk, ulubiony temat albo powracający przedmiot.',
    },
    research: {
      uk: 'Дослідження персоналізованих книжок показують потенціал для залучення, але якість дизайну важлива: дитині потрібні змістовні зв’язки, а не випадкова вставка імені.',
      en: 'Research on personalized books suggests a promise for engagement, but design quality matters: children need meaningful connections, not random name insertion.',
      ru: 'Исследования персонализированных книг показывают потенциал для вовлечения, но важен дизайн: нужны смысловые связи, а не случайная вставка имени.',
      es: 'La investigación sobre libros personalizados muestra potencial para la atención, pero importa el diseño: se necesitan vínculos significativos, no nombres pegados al azar.',
      de: 'Forschung zu personalisierten Büchern zeigt Potenzial für Beteiligung, aber das Design zählt: Kinder brauchen sinnvolle Bezüge, keine zufällige Namensnennung.',
      fr: 'La recherche sur les livres personnalisés montre un potentiel d’engagement, mais la conception compte : il faut des liens signifiants, pas un prénom collé.',
      pl: 'Badania nad książkami personalizowanymi pokazują potencjał zaangażowania, ale liczy się projekt: potrzebne są sensowne powiązania, nie przypadkowe imię.',
    },
    storyUse: {
      uk: [
        'У WonderTales персоналізація починається з однієї впізнаваної опори: герой має звичку дитини або використовує знайомий предмет. Далі застосунок залишає місце для сюрпризу, щоб історія не стала анкетою.',
        'У WonderTales це можна зробити практично: створіть профіль дитини й додайте фото, малюнок дитини або фото улюбленої іграшки. Якщо це окремий герой, створіть персонажа, завантажте його фото й уточніть риси: як виглядає, що любить, чого боїться, які має здібності.',
        'Під час створення історії виберіть дитину або персонажа. WonderTales побудує сюжет і персоналізовані ілюстрації з урахуванням цього героя: він може літати, світити в темряві, допомагати сильним хвостом або застосовувати іншу здатність саме тоді, коли вона потрібна сцені.',
      ],
      en: [
        'In WonderTales, personalization starts with one recognizable anchor: the hero shares a habit or uses a familiar object. Then the app leaves room for surprise, so the story does not become a questionnaire.',
        'In WonderTales, this becomes concrete: create a child profile and add a photo, the child’s drawing, or a photo of a favorite toy. If it is a separate hero, create a character, upload its photo, and describe what it looks like, loves, fears, and can do.',
        'When creating a story, choose the child or character. WonderTales builds the plot and personalized illustrations around that hero: they may fly, glow in the dark, help with a strong tail, or use another ability exactly when the scene needs it.',
      ],
      ru: [
        'В WonderTales персонализация начинается с одной узнаваемой опоры: герой похож привычкой или использует знакомый предмет. Затем приложение оставляет место для сюрприза, чтобы история не стала анкетой.',
        'В WonderTales это можно сделать практически: создайте профиль ребенка и добавьте фото, рисунок ребенка или фото любимой игрушки. Если это отдельный герой, создайте персонажа, загрузите его фото и уточните черты: как выглядит, что любит, чего боится, какие у него способности.',
        'При создании истории выберите ребенка или персонажа. WonderTales построит сюжет и персонализированные иллюстрации с учетом этого героя: он может летать, светить в темноте, помогать сильным хвостом или использовать другую способность именно тогда, когда она нужна сцене.',
      ],
      es: [
        'En WonderTales, la personalización empieza con un ancla reconocible: el héroe comparte un hábito o usa un objeto conocido. Después la app deja espacio para la sorpresa, para que la historia no se vuelva un cuestionario.',
        'En WonderTales, esto se vuelve concreto: crea un perfil del niño y añade una foto, un dibujo del niño o una foto de su juguete favorito. Si es un héroe separado, crea un personaje, sube su foto y define cómo se ve, qué le gusta, qué le da miedo y qué puede hacer.',
        'Al crear la historia, elige al niño o al personaje. WonderTales construye la trama y las ilustraciones personalizadas alrededor de ese héroe: puede volar, brillar en la oscuridad, ayudar con una cola fuerte o usar otra habilidad justo cuando la escena lo necesita.',
      ],
      de: [
        'In WonderTales beginnt Personalisierung mit einem erkennbaren Anker: Die Figur teilt eine Gewohnheit oder nutzt ein vertrautes Objekt. Danach lässt die App Raum für Überraschung, damit die Geschichte kein Fragebogen wird.',
        'In WonderTales wird das konkret: Lege ein Kinderprofil an und füge ein Foto, eine Zeichnung des Kindes oder ein Foto des Lieblingsspielzeugs hinzu. Wenn es eine eigene Figur ist, erstelle einen Charakter, lade sein Foto hoch und beschreibe Aussehen, Vorlieben, Ängste und Fähigkeiten.',
        'Beim Erstellen der Geschichte wählst du das Kind oder die Figur aus. WonderTales baut Handlung und personalisierte Illustrationen um diesen Helden herum: Er kann fliegen, im Dunkeln leuchten, mit einem starken Schwanz helfen oder eine andere Fähigkeit genau dann einsetzen, wenn die Szene sie braucht.',
      ],
      fr: [
        'Dans WonderTales, la personnalisation commence par un repère reconnaissable : le héros partage une habitude ou utilise un objet familier. Ensuite, l’application garde de la place pour la surprise, afin que l’histoire ne devienne pas un questionnaire.',
        'Dans WonderTales, cela devient concret : créez un profil enfant et ajoutez une photo, un dessin de l’enfant ou une photo de son jouet préféré. Si c’est un héros séparé, créez un personnage, téléversez sa photo et précisez son apparence, ce qu’il aime, ce qui lui fait peur et ce qu’il sait faire.',
        'Au moment de créer l’histoire, choisissez l’enfant ou le personnage. WonderTales construit l’intrigue et les illustrations personnalisées autour de ce héros : il peut voler, briller dans le noir, aider avec une queue puissante ou utiliser une autre capacité exactement quand la scène en a besoin.',
      ],
      pl: [
        'W WonderTales personalizacja zaczyna się od jednego rozpoznawalnego punktu: bohater ma podobny nawyk albo używa znajomego przedmiotu. Potem aplikacja zostawia miejsce na niespodziankę, aby historia nie stała się ankietą.',
        'W WonderTales można zrobić to bardzo konkretnie: utwórz profil dziecka i dodaj zdjęcie, rysunek dziecka albo zdjęcie ulubionej zabawki. Jeśli to osobny bohater, stwórz postać, prześlij jej zdjęcie i opisz wygląd, upodobania, lęki oraz umiejętności.',
        'Podczas tworzenia historii wybierz dziecko albo postać. WonderTales buduje fabułę i personalizowane ilustracje wokół tego bohatera: może latać, świecić w ciemności, pomagać silnym ogonem albo użyć innej zdolności dokładnie wtedy, gdy scena tego potrzebuje.',
      ],
    },
    adjustment: {
      uk: [
        'Якщо дитина просить “ще про мене”, додайте одну деталь у наступну сцену. Якщо ніяковіє, залиште впізнаваний аватар, але перенесіть акцент на роль героя в пригоді.',
        'Якщо герой став улюбленим, не починайте щоразу з нуля. Серії історій добре працюють для продовження пригод уже знайомих персонажів: дитина швидше входить у новий епізод, бо знає, хто поруч і на що герой здатен.',
      ],
      en: [
        'If the child asks for “more about me,” add one detail in the next scene. If they feel embarrassed, keep the recognizable avatar but shift the focus to the hero’s role in the adventure.',
        'If a hero becomes beloved, do not start from scratch every time. Story series work well for continuing adventures with familiar characters: the child enters the next episode faster because they already know who is there and what the hero can do.',
      ],
      ru: [
        'Если ребенок просит “еще про меня”, добавьте одну деталь в следующую сцену. Если смущается, оставьте узнаваемый аватар, но перенесите фокус на роль героя в приключении.',
        'Если герой стал любимым, не начинайте каждый раз с нуля. Серии историй хорошо подходят для продолжения приключений уже знакомых персонажей: ребенок быстрее входит в новый эпизод, потому что знает, кто рядом и что герой умеет.',
      ],
      es: [
        'Si pide “más sobre mí”, añade un detalle en la siguiente escena. Si se incomoda, conserva el avatar reconocible, pero centra la atención en el papel del héroe en la aventura.',
        'Si un héroe se vuelve querido, no empieces desde cero cada vez. Las series de historias funcionan bien para continuar aventuras con personajes familiares: el niño entra antes en el nuevo episodio porque ya sabe quién está allí y qué puede hacer el héroe.',
      ],
      de: [
        'Wenn das Kind „mehr über mich“ möchte, füge ein Detail hinzu. Wenn es verlegen wird, behalte den wiedererkennbaren Avatar, aber lenke den Fokus auf die Rolle der Figur im Abenteuer.',
        'Wenn eine Figur liebgewonnen ist, beginne nicht jedes Mal bei null. Geschichtenserien eignen sich gut, um Abenteuer mit vertrauten Figuren fortzusetzen: Das Kind findet schneller in die neue Episode, weil es schon weiß, wer dabei ist und was die Figur kann.',
      ],
      fr: [
        'Si l’enfant demande “plus sur moi”, ajoutez un détail. S’il est gêné, gardez l’avatar reconnaissable, mais mettez l’accent sur le rôle du héros dans l’aventure.',
        'Si un héros devient aimé, ne repartez pas de zéro à chaque fois. Les séries d’histoires aident à poursuivre les aventures avec des personnages familiers : l’enfant entre plus vite dans le nouvel épisode, car il sait déjà qui est là et ce que le héros sait faire.',
      ],
      pl: [
        'Jeśli dziecko prosi „więcej o mnie”, dodaj jeden detal. Jeśli czuje skrępowanie, zostaw rozpoznawalny avatar, ale przenieś akcent na rolę bohatera w przygodzie.',
        'Jeśli bohater stał się ulubiony, nie zaczynaj za każdym razem od zera. Serie historii dobrze sprawdzają się w kontynuowaniu przygód znanych postaci: dziecko szybciej wchodzi w nowy odcinek, bo wie już, kto jest obok i co bohater potrafi.',
      ],
    },
    checklist: {
      uk: ['Обрати одну особисту деталь.', 'Пов’язати її з дією сюжету.', 'Залишити простір для магії й несподіванки.'],
      en: ['Choose one personal detail.', 'Tie it to a plot action.', 'Leave room for magic and surprise.'],
      ru: ['Выберите одну личную деталь.', 'Свяжите ее с действием сюжета.', 'Оставьте место для магии и неожиданности.'],
      es: ['Elige un detalle personal.', 'Conéctalo con una acción de la trama.', 'Deja espacio para magia y sorpresa.'],
      de: ['Wähle ein persönliches Detail.', 'Verbinde es mit einer Handlung.', 'Lass Raum für Magie und Überraschung.'],
      fr: ['Choisissez un détail personnel.', 'Reliez-le à une action.', 'Gardez de la place pour la magie.'],
      pl: ['Wybierz jeden osobisty detal.', 'Połącz go z akcją.', 'Zostaw miejsce na magię i zaskoczenie.'],
    },
    quote: {
      text: {
        uk: 'Історії — фундаментальний інструмент мислення.',
        en: 'Stories are a fundamental instrument of thought.',
        ru: 'Истории — фундаментальный инструмент мышления.',
        es: 'Las historias son un instrumento fundamental del pensamiento.',
        de: 'Geschichten sind ein grundlegendes Instrument des Denkens.',
        fr: 'Les histoires sont un instrument fondamental de la pensée.',
        pl: 'Historie są podstawowym narzędziem myślenia.',
      },
      attribution: 'Jerome Bruner',
      sourceLabel: 'Jerome Bruner, Harvard Psychology',
      sourceUrl: 'https://psychology.fas.harvard.edu/people/jerome-bruner',
    },
    sources: [
      { label: 'Kucirkova: Digital Personalization in Early Childhood', url: 'https://ucldigitalpress.co.uk/Book/Article/69/93/5183/' },
      { label: 'Jerome Bruner profile', url: 'https://psychology.fas.harvard.edu/people/jerome-bruner' },
    ],
    visualDirection: 'A keepsake book opening into a child’s room with tiny recognizable family details hidden in the illustration.',
    relatedSlugs: ['child-created-characters', 'story-morals-without-lecturing'],
    inlineImages: articleInlineImages(
      'personalized-childrens-stories',
      l10n(
        'Дитина обирає іграшкову ракету поруч із планшетом, щоб задати одну деталь історії',
        'A child chooses a toy rocket beside a tablet to anchor one story detail',
        'Ребенок выбирает игрушечную ракету рядом с планшетом как одну деталь истории',
        'Un niño elige un cohete de juguete junto a una tableta como detalle de la historia',
        'Ein Kind wählt neben einem Tablet eine Spielzeugrakete als Detail der Geschichte',
        'Un enfant choisit une fusée jouet près d’une tablette comme détail de l’histoire',
        'Dziecko wybiera zabawkową rakietę obok tabletu jako szczegół historii'
      ),
      l10n(
        'Одна впізнавана деталь допомагає персоналізації працювати на сюжет, а не шуміти.',
        'One recognizable detail helps personalization serve the plot instead of making noise.',
        'Одна узнаваемая деталь помогает персонализации работать на сюжет, а не шуметь.',
        'Un detalle reconocible ayuda a que la personalización sirva a la trama, no al ruido.',
        'Ein erkennbares Detail hilft der Personalisierung, der Handlung zu dienen statt zu stören.',
        'Un détail reconnaissable aide la personnalisation à servir le récit sans le brouiller.',
        'Jeden rozpoznawalny szczegół pomaga personalizacji wspierać fabułę, a nie robić szum.'
      ),
      l10n(
        'Знайомий плюшевий дракон продовжує пригоду біля планшета у подушковому будиночку',
        'A familiar plush dragon continues an adventure near a tablet in a pillow fort',
        'Знакомый плюшевый дракон продолжает приключение рядом с планшетом в домике из подушек',
        'Un dragón de peluche conocido continúa la aventura junto a una tableta en un fuerte de cojines',
        'Ein vertrauter Plüschdrache setzt neben einem Tablet im Kissenlager das Abenteuer fort',
        'Un dragon en peluche familier poursuit l’aventure près d’une tablette dans une cabane de coussins',
        'Znany pluszowy smok kontynuuje przygodę obok tabletu w bazie z poduszek'
      ),
      l10n(
        'Знайомий герой робить наступний епізод легшим для входу і залишає місце для магії.',
        'A familiar hero makes the next episode easier to enter while leaving room for magic.',
        'Знакомый герой помогает легче войти в следующий эпизод и оставляет место для магии.',
        'Un héroe familiar facilita entrar en el siguiente episodio y deja espacio para la magia.',
        'Eine vertraute Figur erleichtert den Einstieg in die nächste Folge und lässt Raum für Magie.',
        'Un héros familier aide à entrer dans l’épisode suivant tout en gardant la place pour la magie.',
        'Znany bohater ułatwia wejście w kolejny odcinek i zostawia miejsce na magię.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Опора', title: 'Одна деталь працює краще за десять', body: 'Ім’я, улюблений предмет або знайоме місце мають допомагати сцені рухатися, а не просто доводити, що історія “про дитину”.' },
        { eyebrow: 'Пам’ять', title: 'Повторюваний предмет тримає нитку', body: 'Якщо особиста деталь повертається в ключові моменти, дитині легше пригадати, де вона в сюжеті.' },
        { eyebrow: 'Схожість', title: 'Впізнаваний аватар має вести пригоду', body: 'Коли герой схожий на дитину обличчям, ім’ям чи деталями, це працює найкраще, якщо схожість допомагає діяти: шукати, обирати, рятувати, дивуватися.' },
      ],
      en: [
        { eyebrow: 'Anchor', title: 'One detail works better than ten', body: 'A name, favorite object, or familiar place should move the scene forward, not simply prove that the story is “about the child”.' },
        { eyebrow: 'Memory', title: 'A repeated object holds the thread', body: 'When a personal detail returns at key moments, the child has an easier way to remember where they are in the plot.' },
        { eyebrow: 'Likeness', title: 'A familiar avatar still needs an adventure', body: 'When the hero looks like the child through face, name, or details, the likeness works best when it helps the action: searching, choosing, helping, wondering.' },
      ],
      ru: [
        { eyebrow: 'Опора', title: 'Одна деталь лучше десяти', body: 'Имя, любимый предмет или знакомое место должны двигать сцену, а не просто доказывать, что история “про ребенка”.' },
        { eyebrow: 'Память', title: 'Повторяющийся предмет держит нить', body: 'Когда личная деталь возвращается в ключевые моменты, ребенку легче вспомнить, где он находится в сюжете.' },
        { eyebrow: 'Сходство', title: 'Узнаваемый аватар должен вести приключение', body: 'Когда герой похож на ребенка лицом, именем или деталями, сходство работает лучше всего, если помогает действию: искать, выбирать, помогать, удивляться.' },
      ],
      es: [
        { eyebrow: 'Ancla', title: 'Un detalle funciona mejor que diez', body: 'Un nombre, objeto favorito o lugar conocido debe mover la escena, no solo demostrar que la historia “va sobre el niño”.' },
        { eyebrow: 'Memoria', title: 'Un objeto repetido sostiene el hilo', body: 'Cuando un detalle personal vuelve en momentos clave, el niño recuerda mejor dónde está en la trama.' },
        { eyebrow: 'Parecido', title: 'Un avatar reconocible aún necesita aventura', body: 'Cuando el héroe se parece al niño por cara, nombre o detalles, funciona mejor si ese parecido impulsa la acción: buscar, elegir, ayudar, asombrarse.' },
      ],
      de: [
        { eyebrow: 'Anker', title: 'Ein Detail wirkt besser als zehn', body: 'Name, Lieblingsgegenstand oder vertrauter Ort sollten die Szene tragen, nicht nur beweisen, dass die Geschichte “über das Kind” ist.' },
        { eyebrow: 'Erinnerung', title: 'Ein wiederkehrendes Objekt hält den Faden', body: 'Kehrt ein persönliches Detail an Schlüsselstellen zurück, findet das Kind leichter in die Handlung zurück.' },
        { eyebrow: 'Ähnlichkeit', title: 'Ein erkennbarer Avatar braucht ein Abenteuer', body: 'Wenn die Figur dem Kind durch Gesicht, Namen oder Details ähnelt, wirkt es am besten, wenn diese Nähe Handlung trägt: suchen, wählen, helfen, staunen.' },
      ],
      fr: [
        { eyebrow: 'Repère', title: 'Un détail vaut mieux que dix', body: 'Un prénom, un objet aimé ou un lieu familier doit faire avancer la scène, pas seulement prouver que l’histoire parle de l’enfant.' },
        { eyebrow: 'Mémoire', title: 'Un objet récurrent garde le fil', body: 'Quand un détail personnel revient aux moments clés, l’enfant retrouve plus facilement sa place dans l’intrigue.' },
        { eyebrow: 'Ressemblance', title: 'Un avatar reconnaissable a besoin d’une aventure', body: 'Quand le héros ressemble à l’enfant par le visage, le prénom ou des détails, cela fonctionne mieux si la ressemblance sert l’action : chercher, choisir, aider, s’étonner.' },
      ],
      pl: [
        { eyebrow: 'Kotwica', title: 'Jeden detal działa lepiej niż dziesięć', body: 'Imię, ulubiony przedmiot lub znajome miejsce mają prowadzić scenę, a nie tylko udowadniać, że historia jest “o dziecku”.' },
        { eyebrow: 'Pamięć', title: 'Powracający przedmiot trzyma wątek', body: 'Gdy osobisty detal wraca w ważnych chwilach, dziecku łatwiej pamiętać, gdzie jest w fabule.' },
        { eyebrow: 'Podobieństwo', title: 'Rozpoznawalny avatar potrzebuje przygody', body: 'Gdy bohater przypomina dziecko twarzą, imieniem lub detalami, działa najlepiej wtedy, gdy podobieństwo wspiera akcję: szukanie, wybór, pomoc, zachwyt.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Що персоналізувати, а що залишити вигадкою',
        intro: 'Корисна персоналізація не заповнює всю історію фактами. Вона вибирає кілька опор, які допомагають дитині триматися сюжету.',
        columns: ['Елемент', 'Коли допомагає', 'Коли краще обережно'],
        rows: [
          ['Ім’я дитини', 'На старті, щоб швидко увійти в історію', 'Якщо дитина соромиться бути в центрі сюжету'],
          ['Улюблений предмет', 'Коли предмет стає інструментом героя', 'Якщо він просто згадується без ролі'],
          ['Реальне місце', 'Для м’якого початку або повернення додому', 'Якщо тема потребує більшої фантазійної дистанції'],
          ['Риси характеру', 'Коли герой вчиться через знайому сильну сторону', 'Якщо історія починає оцінювати дитину'],
        ],
      },
      en: {
        heading: 'What to personalize and what to leave imagined',
        intro: 'Helpful personalization does not fill the whole story with facts. It chooses a few anchors that help the child stay with the plot.',
        columns: ['Element', 'When it helps', 'When to be careful'],
        rows: [
          ['Child’s name', 'At the start, to enter the story quickly', 'If the child dislikes being the center of the plot'],
          ['Favorite object', 'When it becomes a tool for the hero', 'If it is only mentioned without a role'],
          ['Real place', 'For a gentle opening or return home', 'If the topic needs more imaginative distance'],
          ['Character traits', 'When the hero learns through a familiar strength', 'If the story starts judging the child'],
        ],
      },
      ru: {
        heading: 'Что персонализировать, а что оставить выдумкой',
        intro: 'Полезная персонализация не набивает историю фактами. Она выбирает несколько опор, которые помогают ребенку держаться сюжета.',
        columns: ['Элемент', 'Когда помогает', 'Когда осторожнее'],
        rows: [
          ['Имя ребенка', 'В начале, чтобы быстрее войти в историю', 'Если ребенку неловко быть в центре сюжета'],
          ['Любимый предмет', 'Когда предмет становится инструментом героя', 'Если он просто упоминается без роли'],
          ['Реальное место', 'Для мягкого старта или возвращения домой', 'Если теме нужна большая фантазийная дистанция'],
          ['Черты характера', 'Когда герой учится через знакомую сильную сторону', 'Если история начинает оценивать ребенка'],
        ],
      },
      es: {
        heading: 'Qué personalizar y qué dejar imaginado',
        intro: 'La personalización útil no llena toda la historia de datos. Elige unos pocos anclajes que ayudan al niño a seguir la trama.',
        columns: ['Elemento', 'Cuándo ayuda', 'Cuándo conviene cuidado'],
        rows: [
          ['Nombre del niño', 'Al inicio, para entrar rápido en la historia', 'Si le incomoda ser el centro de la trama'],
          ['Objeto favorito', 'Cuando se vuelve herramienta del héroe', 'Si solo aparece mencionado sin función'],
          ['Lugar real', 'Para una entrada suave o vuelta a casa', 'Si el tema necesita más distancia imaginativa'],
          ['Rasgos personales', 'Cuando el héroe aprende desde una fortaleza familiar', 'Si la historia empieza a evaluar al niño'],
        ],
      },
      de: {
        heading: 'Was personalisieren und was erfunden lassen',
        intro: 'Hilfreiche Personalisierung füllt die Geschichte nicht mit Fakten. Sie wählt wenige Anker, die das Kind in der Handlung halten.',
        columns: ['Element', 'Wann es hilft', 'Wann Vorsicht gut ist'],
        rows: [
          ['Name des Kindes', 'Am Anfang, um schnell einzusteigen', 'Wenn das Kind nicht im Mittelpunkt stehen möchte'],
          ['Lieblingsgegenstand', 'Wenn er ein Werkzeug der Figur wird', 'Wenn er nur erwähnt wird'],
          ['Realer Ort', 'Für einen sanften Anfang oder die Rückkehr nach Hause', 'Wenn mehr Fantasiedistanz besser ist'],
          ['Eigenschaften', 'Wenn die Figur durch eine vertraute Stärke lernt', 'Wenn die Geschichte das Kind bewertet'],
        ],
      },
      fr: {
        heading: 'Que personnaliser et que garder imaginaire',
        intro: 'Une bonne personnalisation ne remplit pas toute l’histoire de faits. Elle choisit quelques repères qui aident l’enfant à suivre.',
        columns: ['Élément', 'Quand cela aide', 'Quand rester prudent'],
        rows: [
          ['Prénom de l’enfant', 'Au début, pour entrer vite dans l’histoire', 'Si l’enfant n’aime pas être au centre'],
          ['Objet préféré', 'Quand il devient un outil du héros', 'S’il est seulement mentionné'],
          ['Lieu réel', 'Pour une entrée douce ou un retour à la maison', 'Si le thème demande plus de distance'],
          ['Traits personnels', 'Quand le héros apprend grâce à une force familière', 'Si l’histoire commence à évaluer l’enfant'],
        ],
      },
      pl: {
        heading: 'Co personalizować, a co zostawić wyobraźni',
        intro: 'Dobra personalizacja nie wypełnia historii faktami. Wybiera kilka kotwic, które pomagają dziecku śledzić fabułę.',
        columns: ['Element', 'Kiedy pomaga', 'Kiedy uważać'],
        rows: [
          ['Imię dziecka', 'Na początku, aby szybko wejść w historię', 'Gdy dziecko nie lubi być w centrum fabuły'],
          ['Ulubiony przedmiot', 'Gdy staje się narzędziem bohatera', 'Gdy jest tylko wspomniany'],
          ['Prawdziwe miejsce', 'Dla łagodnego startu lub powrotu do domu', 'Gdy temat potrzebuje większego dystansu'],
          ['Cechy charakteru', 'Gdy bohater uczy się przez znaną siłę', 'Gdy historia zaczyna oceniać dziecko'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'У WonderTales',
        heading: 'Як WonderTales персоналізує історію',
        intro: 'Застосунок уже веде персоналізацію так, щоб історія стала ближчою, але не втратила магію.',
        steps: [
          { title: 'Бере одну впізнавану опору', body: 'Профіль дитини або персонаж дає історії ім’я, фото, предмет, звичку чи іншу точну деталь.' },
          { title: 'Перетворює опору на дію', body: 'Знайомий предмет може відкрити двері, звичка допомогти герою, а місце стати стартом пригоди.' },
          { title: 'Додає новизну', body: 'Поруч із знайомим з’являється щось несподіване, щоб історія не стала простим переказом реальності.' },
          { title: 'Зберігає казкову дистанцію', body: 'Аватар може бути схожим на дитину, але отримує роль у пригоді, здібності й простір для магії.' },
        ],
      },
      en: {
        eyebrow: 'In WonderTales',
        heading: 'How WonderTales personalizes a story',
        intro: 'The app already guides personalization so the story feels close without losing its magic.',
        steps: [
          { title: 'Uses one recognizable anchor', body: 'A child profile or character gives the story a name, photo, object, habit, or another precise detail.' },
          { title: 'Turns the anchor into action', body: 'A familiar object can open a door, a habit can help the hero, and a place can start the adventure.' },
          { title: 'Adds novelty', body: 'Something unexpected appears beside the familiar detail, so the story does not become a simple retelling of real life.' },
          { title: 'Keeps fairytale distance', body: 'The avatar can look like the child, but it receives an adventure role, abilities, and room for magic.' },
        ],
      },
      ru: {
        eyebrow: 'В WonderTales',
        heading: 'Как WonderTales персонализирует историю',
        intro: 'Приложение уже ведет персонализацию так, чтобы история стала ближе, но не потеряла магию.',
        steps: [
          { title: 'Берет одну узнаваемую опору', body: 'Профиль ребенка или персонаж дает истории имя, фото, предмет, привычку или другую точную деталь.' },
          { title: 'Превращает опору в действие', body: 'Знакомый предмет может открыть дверь, привычка помочь герою, а место запустить приключение.' },
          { title: 'Добавляет новизну', body: 'Рядом со знакомым появляется что-то неожиданное, чтобы история не стала простым пересказом реальности.' },
          { title: 'Сохраняет сказочную дистанцию', body: 'Аватар может быть похож на ребенка, но получает роль в приключении, способности и пространство для магии.' },
        ],
      },
      es: {
        eyebrow: 'En WonderTales',
        heading: 'Cómo WonderTales personaliza una historia',
        intro: 'La app ya guía la personalización para que la historia se sienta cercana sin perder la magia.',
        steps: [
          { title: 'Usa un ancla reconocible', body: 'Un perfil infantil o personaje aporta nombre, foto, objeto, hábito u otro detalle preciso.' },
          { title: 'Convierte el ancla en acción', body: 'Un objeto familiar puede abrir una puerta, un hábito ayudar al héroe y un lugar iniciar la aventura.' },
          { title: 'Añade novedad', body: 'Junto al detalle familiar aparece algo inesperado para que la historia no sea una simple copia de la realidad.' },
          { title: 'Mantiene distancia de cuento', body: 'El avatar puede parecerse al niño, pero recibe un papel de aventura, habilidades y espacio para la magia.' },
        ],
      },
      de: {
        eyebrow: 'In WonderTales',
        heading: 'Wie WonderTales eine Geschichte personalisiert',
        intro: 'Die App führt Personalisierung bereits so, dass die Geschichte nah wirkt, aber magisch bleibt.',
        steps: [
          { title: 'Nutzt einen erkennbaren Anker', body: 'Ein Kinderprofil oder Charakter bringt Name, Foto, Gegenstand, Gewohnheit oder ein anderes präzises Detail ein.' },
          { title: 'Macht daraus Handlung', body: 'Ein vertrauter Gegenstand kann eine Tür öffnen, eine Gewohnheit helfen und ein Ort das Abenteuer starten.' },
          { title: 'Fügt Neues hinzu', body: 'Neben dem Vertrauten erscheint etwas Überraschendes, damit die Geschichte keine bloße Kopie des Alltags wird.' },
          { title: 'Hält märchenhafte Distanz', body: 'Der Avatar kann dem Kind ähnlich sehen, bekommt aber eine Abenteuerrolle, Fähigkeiten und Raum für Magie.' },
        ],
      },
      fr: {
        eyebrow: 'Dans WonderTales',
        heading: 'Comment WonderTales personnalise une histoire',
        intro: 'L’application guide déjà la personnalisation pour rendre l’histoire proche sans enlever la magie.',
        steps: [
          { title: 'Utilise un repère reconnaissable', body: 'Un profil enfant ou un personnage apporte un prénom, une photo, un objet, une habitude ou un autre détail précis.' },
          { title: 'Transforme le repère en action', body: 'Un objet familier peut ouvrir une porte, une habitude aider le héros et un lieu lancer l’aventure.' },
          { title: 'Ajoute du nouveau', body: 'Une surprise apparaît à côté du détail familier, pour que l’histoire ne devienne pas une simple copie du réel.' },
          { title: 'Garde une distance merveilleuse', body: 'L’avatar peut ressembler à l’enfant, mais il reçoit un rôle d’aventure, des capacités et de la place pour la magie.' },
        ],
      },
      pl: {
        eyebrow: 'W WonderTales',
        heading: 'Jak WonderTales personalizuje historię',
        intro: 'Aplikacja już prowadzi personalizację tak, aby historia była bliska, ale nadal magiczna.',
        steps: [
          { title: 'Używa jednej rozpoznawalnej kotwicy', body: 'Profil dziecka albo postać wnosi imię, zdjęcie, przedmiot, nawyk lub inny precyzyjny detal.' },
          { title: 'Zamienia kotwicę w działanie', body: 'Znany przedmiot może otworzyć drzwi, nawyk pomóc bohaterowi, a miejsce rozpocząć przygodę.' },
          { title: 'Dodaje nowość', body: 'Obok znanego detalu pojawia się coś zaskakującego, aby historia nie była zwykłą kopią rzeczywistości.' },
          { title: 'Zachowuje baśniowy dystans', body: 'Awatar może przypominać dziecko, ale dostaje rolę w przygodzie, umiejętności i miejsce na magię.' },
        ],
      },
    },
  },
  {
    slug: 'age-appropriate-story-complexity',
    heroImage: '/landing/blog/age-appropriate-story-complexity-scene-01.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Вік і мова', en: 'Age and language', ru: 'Возраст и язык', es: 'Edad y lenguaje', de: 'Alter und Sprache', fr: 'Âge et langage', pl: 'Wiek i język' },
    title: {
      uk: 'Якого розміру має бути дитяча історія за віком',
      en: 'How long should a children’s story be by age?',
      ru: 'Какого размера должна быть детская история по возрасту',
      es: 'Qué extensión debe tener una historia infantil según la edad',
      de: 'Welche Länge passt für Kindergeschichten je nach Alter?',
      fr: 'Quelle longueur pour une histoire selon l’âge ?',
      pl: 'Jak długa powinna być historia zależnie od wieku?',
    },
    description: {
      uk: 'Розмір історії, довжина сцен, словник і повтори: практичні правила, щоб текст був не занадто простим і не занадто важким.',
      en: 'Story length, scene size, vocabulary, and repetition: practical rules so the text is neither too simple nor too hard.',
      ru: 'Размер истории, длина сцен, словарь и повторы: практические правила, чтобы текст не был слишком простым или тяжелым.',
      es: 'Extensión de la historia, tamaño de escenas, vocabulario y repetición: reglas para que el texto no sea demasiado simple ni difícil.',
      de: 'Geschichtenlänge, Szenengröße, Wortschatz und Wiederholung: praktische Regeln, damit der Text weder zu leicht noch zu schwer ist.',
      fr: 'Longueur de l’histoire, taille des scènes, vocabulaire et répétition : des repères pour un texte bien ajusté.',
      pl: 'Długość historii, rozmiar scen, słownictwo i powtórzenia: praktyczne zasady, by tekst nie był zbyt prosty ani zbyt trudny.',
    },
    lead: {
      uk: 'Добра історія трохи тягне дитину вперед, але не змушує боротися з кожним реченням. Саме тут потрібне вікове налаштування.',
      en: 'A good story pulls a child a little forward without making every sentence a struggle. That is where age adaptation matters.',
      ru: 'Хорошая история чуть тянет ребенка вперед, но не заставляет бороться с каждым предложением. Для этого и нужна адаптация по возрасту.',
      es: 'Una buena historia empuja un poco hacia adelante sin convertir cada frase en una pelea. Ahí importa la adaptación por edad.',
      de: 'Eine gute Geschichte fordert ein Kind leicht heraus, ohne jeden Satz schwer zu machen. Dafür ist Altersanpassung wichtig.',
      fr: 'Une bonne histoire tire un peu l’enfant vers l’avant sans rendre chaque phrase difficile. C’est le rôle de l’adaptation à l’âge.',
      pl: 'Dobra historia trochę popycha dziecko naprzód, ale nie każe walczyć z każdym zdaniem. Tu pomaga dopasowanie do wieku.',
    },
    focus: {
      uk: 'Для молодших дітей краще коротші сцени, повтори й конкретні слова. Старші можуть тримати довші причинно-наслідкові ланцюжки, внутрішні мотиви й гумор.',
      en: 'Younger children benefit from shorter scenes, repetition, and concrete words. Older children can carry longer cause-and-effect chains, motives, and humor.',
      ru: 'Младшим детям полезны короткие сцены, повторы и конкретные слова. Старшие уже держат причинно-следственные связи, мотивы и юмор.',
      es: 'Los niños pequeños aprovechan escenas cortas, repetición y palabras concretas. Los mayores sostienen causas, motivos y humor más largo.',
      de: 'Jüngere Kinder profitieren von kurzen Szenen, Wiederholung und konkreten Wörtern. Ältere folgen längeren Ursachenketten, Motiven und Humor.',
      fr: 'Les plus jeunes ont besoin de scènes courtes, répétitions et mots concrets. Les plus grands suivent causes, motivations et humour.',
      pl: 'Młodszym pomagają krótkie sceny, powtórzenia i konkretne słowa. Starsze dzieci śledzą przyczyny, motywy i humor.',
    },
    research: {
      uk: 'Підхід “трохи вище поточного рівня” перегукується із зоною найближчого розвитку: текст має бути доступним з невеликою підтримкою.',
      en: 'The “slightly above current level” approach echoes the zone of proximal development: text should be reachable with a little support.',
      ru: 'Идея “чуть выше текущего уровня” близка зоне ближайшего развития: текст должен быть доступен с небольшой поддержкой.',
      es: 'La idea de “un poco por encima del nivel actual” conecta con la zona de desarrollo próximo: el texto debe ser alcanzable con apoyo.',
      de: '„Leicht über dem aktuellen Niveau“ passt zur Zone der nächsten Entwicklung: Text sollte mit etwas Unterstützung erreichbar sein.',
      fr: 'L’idée “un peu au-dessus du niveau actuel” rejoint la zone proximale de développement : le texte doit rester accessible avec soutien.',
      pl: 'Podejście „trochę ponad obecny poziom” odpowiada strefie najbliższego rozwoju: tekst ma być osiągalny z małym wsparciem.',
    },
    storyUse: {
      uk: 'Дивіться не лише на кількість слів, а й на вагу абзаців. Для вечора краще коротші сцени й один конфлікт; для денного читання можна додати більше опису.',
      en: 'Look beyond word count to paragraph weight. At bedtime, use shorter scenes and one conflict; daytime reading can handle more description.',
      ru: 'Смотрите не только на количество слов, но и на “вес” абзацев. На ночь лучше короткие сцены и один конфликт; днем можно больше описаний.',
      es: 'No mires solo el conteo de palabras, sino el peso de los párrafos. De noche convienen escenas más cortas y un conflicto.',
      de: 'Achte nicht nur auf Wortzahl, sondern auf Absatzgewicht. Abends kurze Szenen und ein Konflikt; tagsüber mehr Beschreibung.',
      fr: 'Ne regardez pas seulement le nombre de mots, mais le poids des paragraphes. Le soir : scènes plus courtes et un conflit.',
      pl: 'Patrz nie tylko na liczbę słów, ale też ciężar akapitów. Na noc lepsze są krótsze sceny i jeden konflikt.',
    },
    adjustment: {
      uk: 'Якщо дитина часто питає “що це значить?”, залиште складне слово, але додайте контекст або повтор. Якщо нудьгує, збільшіть вибір і наслідки.',
      en: 'If the child often asks “what does that mean?”, keep the new word but add context or repetition. If bored, increase choices and consequences.',
      ru: 'Если ребенок часто спрашивает “что это значит?”, оставьте новое слово, но добавьте контекст или повтор. Если скучно, добавьте выбор и последствия.',
      es: 'Si pregunta “¿qué significa?”, conserva la palabra nueva pero añade contexto. Si se aburre, aumenta decisiones y consecuencias.',
      de: 'Wenn das Kind oft fragt, was ein Wort bedeutet, behalte es bei und gib Kontext. Wenn es sich langweilt, erhöhe Wahl und Folgen.',
      fr: 'Si l’enfant demande souvent le sens d’un mot, gardez-le et ajoutez du contexte. S’il s’ennuie, ajoutez choix et conséquences.',
      pl: 'Jeśli dziecko pyta o znaczenie, zostaw nowe słowo i dodaj kontekst. Jeśli się nudzi, dodaj wybory i konsekwencje.',
    },
    checklist: {
      uk: ['Одна головна подія на сцену.', 'Нове слово поруч із зрозумілим контекстом.', 'Повтор ключової фрази у важливих моментах.'],
      en: ['One main event per scene.', 'A new word beside clear context.', 'Repeat a key phrase at important moments.'],
      ru: ['Одно главное событие на сцену.', 'Новое слово рядом с понятным контекстом.', 'Повтор ключевой фразы в важных местах.'],
      es: ['Un evento principal por escena.', 'Una palabra nueva con contexto claro.', 'Repite una frase clave.'],
      de: ['Ein Hauptereignis pro Szene.', 'Ein neues Wort mit klarem Kontext.', 'Eine Schlüsselformulierung wiederholen.'],
      fr: ['Un événement principal par scène.', 'Un mot nouveau avec contexte clair.', 'Répéter une phrase clé.'],
      pl: ['Jedno główne wydarzenie na scenę.', 'Nowe słowo w jasnym kontekście.', 'Powtarzaj ważną frazę.'],
    },
    quote: {
      text: {
        uk: 'Те, що дитина може зробити сьогодні з допомогою, завтра вона зможе зробити самостійно.',
        en: 'What a child can do with assistance today she will be able to do by herself tomorrow.',
        ru: 'То, что ребенок может сделать сегодня с помощью, завтра он сможет сделать самостоятельно.',
        es: 'Lo que un niño puede hacer hoy con ayuda, mañana podrá hacerlo por sí mismo.',
        de: 'Was ein Kind heute mit Hilfe tun kann, wird es morgen allein tun können.',
        fr: 'Ce qu’un enfant peut faire aujourd’hui avec de l’aide, il pourra le faire seul demain.',
        pl: 'To, co dziecko potrafi dziś zrobić z pomocą, jutro będzie mogło zrobić samodzielnie.',
      },
      attribution: 'Lev Vygotsky',
      sourceLabel: 'Mind in Society',
      sourceUrl: 'https://home.fau.edu/musgrove/web/vygotsky1978.pdf',
    },
    sources: [
      { label: 'Vygotsky: Mind in Society', url: 'https://home.fau.edu/musgrove/web/vygotsky1978.pdf' },
      { label: 'Reading Rockets: reading aloud', url: 'https://www.readingrockets.org/topics/early-literacy-development/articles/reading-aloud-build-comprehension' },
    ],
    visualDirection: 'A gentle growth ladder of story pages, with scenes becoming richer as the child climbs.',
    relatedSlugs: ['reading-without-pressure', 'five-minute-stories'],
    inlineImages: articleInlineImages(
      'age-appropriate-story-complexity',
      l10n(
        'Місячні підказки повторюються поруч із планшетом і допомагають зрозуміти нову ідею',
        'Repeated moon clues beside a tablet help a child understand a new idea',
        'Повторяющиеся лунные подсказки рядом с планшетом помогают понять новую идею',
        'Pistas de luna repetidas junto a una tableta ayudan a entender una idea nueva',
        'Wiederholte Mondhinweise neben einem Tablet helfen, eine neue Idee zu verstehen',
        'Des indices de lune répétés près d’une tablette aident à comprendre une idée nouvelle',
        'Powtarzające się księżycowe wskazówki obok tabletu pomagają zrozumieć nowy pomysł'
      ),
      l10n(
        'Нове слово легше втримати, коли поруч є дія, образ і повтор.',
        'A new word is easier to hold when action, image, and repetition stay nearby.',
        'Новое слово легче удержать, когда рядом есть действие, образ и повтор.',
        'Una palabra nueva se sostiene mejor con acción, imagen y repetición cerca.',
        'Ein neues Wort bleibt leichter, wenn Handlung, Bild und Wiederholung nah sind.',
        'Un mot nouveau se retient mieux avec action, image et répétition à côté.',
        'Nowe słowo łatwiej zapamiętać, gdy obok są działanie, obraz i powtórzenie.'
      ),
      l10n(
        'Дитина рухає світлий камінець через іграшковий міст біля планшета',
        'A child moves a glowing pebble across a toy bridge beside a tablet',
        'Ребенок двигает светящийся камешек через игрушечный мост рядом с планшетом',
        'Un niño mueve una piedra brillante por un puente de juguete junto a una tableta',
        'Ein Kind bewegt neben einem Tablet einen leuchtenden Stein über eine Spielzeugbrücke',
        'Un enfant déplace un galet lumineux sur un pont jouet près d’une tablette',
        'Dziecko przesuwa świecący kamyk przez zabawkowy most obok tabletu'
      ),
      l10n(
        'Для старших дітей можна додати другий наслідок, якщо маршрут усе ще зрозумілий.',
        'Older children can handle a second consequence when the path still stays clear.',
        'Старшим детям можно добавить второе последствие, если маршрут остается понятным.',
        'Los niños mayores pueden seguir una segunda consecuencia si el camino sigue claro.',
        'Ältere Kinder können eine zweite Folge tragen, wenn der Weg klar bleibt.',
        'Les plus grands peuvent suivre une seconde conséquence si le chemin reste clair.',
        'Starsze dzieci udźwigną drugą konsekwencję, jeśli droga nadal jest jasna.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Занадто легко', title: 'Дитина вгадує все наперед', body: 'Якщо сюжет не дає жодної нової думки, дитина може перебивати, поспішати до фіналу або втрачати інтерес.' },
        { eyebrow: 'Саме в міру', title: 'Є одне-два запитання', body: 'Дитина іноді уточнює слово чи мотив, але все ще тримає сюжет і хоче знати, що буде далі.' },
        { eyebrow: 'Занадто важко', title: 'Губиться хто що зробив', body: 'Коли майже кожен абзац потребує пояснення, краще скоротити сцену або додати опорну картинку.' },
      ],
      en: [
        { eyebrow: 'Too easy', title: 'The child predicts everything', body: 'If the plot offers no new thought, the child may interrupt, rush to the ending, or lose interest.' },
        { eyebrow: 'Just right', title: 'One or two questions appear', body: 'The child may ask about a word or motive, but still holds the plot and wants to know what comes next.' },
        { eyebrow: 'Too hard', title: 'Who did what gets lost', body: 'If almost every paragraph needs explaining, shorten the scene or add a clear picture cue.' },
      ],
      ru: [
        { eyebrow: 'Слишком легко', title: 'Ребенок все угадывает', body: 'Если сюжет не дает новой мысли, ребенок может перебивать, торопить финал или терять интерес.' },
        { eyebrow: 'В самый раз', title: 'Есть один-два вопроса', body: 'Ребенок иногда уточняет слово или мотив, но держит сюжет и хочет знать, что дальше.' },
        { eyebrow: 'Слишком трудно', title: 'Теряется кто что сделал', body: 'Если почти каждый абзац нужно объяснять, лучше сократить сцену или добавить понятную картинку-опору.' },
      ],
      es: [
        { eyebrow: 'Demasiado fácil', title: 'El niño predice todo', body: 'Si la trama no ofrece ninguna idea nueva, puede interrumpir, correr al final o perder interés.' },
        { eyebrow: 'Adecuado', title: 'Aparecen una o dos preguntas', body: 'El niño pregunta alguna palabra o motivo, pero mantiene la trama y quiere saber qué sigue.' },
        { eyebrow: 'Demasiado difícil', title: 'Se pierde quién hizo qué', body: 'Si casi cada párrafo necesita explicación, conviene acortar la escena o añadir una pista visual.' },
      ],
      de: [
        { eyebrow: 'Zu leicht', title: 'Das Kind sagt alles voraus', body: 'Wenn die Handlung nichts Neues bietet, unterbricht das Kind vielleicht, drängt zum Ende oder verliert Interesse.' },
        { eyebrow: 'Genau richtig', title: 'Ein bis zwei Fragen tauchen auf', body: 'Das Kind fragt nach einem Wort oder Motiv, folgt aber weiter der Handlung und will wissen, was kommt.' },
        { eyebrow: 'Zu schwer', title: 'Wer was getan hat geht verloren', body: 'Wenn fast jeder Absatz erklärt werden muss, kürze die Szene oder gib einen klaren Bildhinweis.' },
      ],
      fr: [
        { eyebrow: 'Trop facile', title: 'L’enfant devine tout', body: 'Si l’intrigue n’apporte rien de nouveau, l’enfant peut interrompre, presser la fin ou décrocher.' },
        { eyebrow: 'Juste assez', title: 'Une ou deux questions apparaissent', body: 'L’enfant demande parfois un mot ou une raison, mais suit encore l’intrigue et veut connaître la suite.' },
        { eyebrow: 'Trop difficile', title: 'On perd qui a fait quoi', body: 'Si presque chaque paragraphe doit être expliqué, raccourcissez la scène ou ajoutez un repère visuel.' },
      ],
      pl: [
        { eyebrow: 'Za łatwo', title: 'Dziecko przewiduje wszystko', body: 'Gdy fabuła nie daje żadnej nowej myśli, dziecko może przerywać, spieszyć do końca albo tracić zainteresowanie.' },
        { eyebrow: 'W sam raz', title: 'Pojawia się jedno lub dwa pytania', body: 'Dziecko pyta o słowo albo motyw, ale nadal trzyma fabułę i chce wiedzieć, co dalej.' },
        { eyebrow: 'Za trudno', title: 'Gubi się kto co zrobił', body: 'Jeśli prawie każdy akapit wymaga wyjaśnienia, skróć scenę albo dodaj jasną wskazówkę obrazkową.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Орієнтири складності за віком',
        intro: 'Це не жорсткі норми, а стартові підказки. Дивіться на конкретну дитину, її досвід читання й настрій у цей день.',
        columns: ['Вік', 'Що зазвичай працює', 'Що краще обмежити'],
        rows: [
          ['3-4', 'Короткі сцени, повтори, конкретні предмети', 'Довгі пояснення мотивів і кілька паралельних ліній'],
          ['5-6', 'Одна проблема, простий вибір, знайома фраза-повтор', 'Багато героїв і різкі зміни місця дії'],
          ['7-8', 'Причина й наслідок, внутрішній мотив героя, легкий гумор', 'Надто дитячі повтори без розвитку'],
          ['9+', 'Складніший вибір, підтекст, наслідки рішення', 'Пояснення всього замість довіри до читача'],
        ],
      },
      en: {
        heading: 'Age-based complexity guide',
        intro: 'These are not rigid rules. Use them as starting points, then watch the child’s reading experience and mood that day.',
        columns: ['Age', 'What often works', 'What to limit'],
        rows: [
          ['3-4', 'Short scenes, repetition, concrete objects', 'Long motive explanations and several parallel lines'],
          ['5-6', 'One problem, simple choice, familiar repeated phrase', 'Too many characters and abrupt setting changes'],
          ['7-8', 'Cause and effect, inner motive, light humor', 'Very babyish repetition without development'],
          ['9+', 'More complex choice, subtext, consequences', 'Explaining everything instead of trusting the reader'],
        ],
      },
      ru: {
        heading: 'Ориентиры сложности по возрасту',
        intro: 'Это не жесткие нормы, а стартовые подсказки. Смотрите на конкретного ребенка, опыт чтения и настроение в этот день.',
        columns: ['Возраст', 'Что обычно работает', 'Что лучше ограничить'],
        rows: [
          ['3-4', 'Короткие сцены, повторы, конкретные предметы', 'Долгие объяснения мотивов и несколько линий сюжета'],
          ['5-6', 'Одна проблема, простой выбор, знакомая фраза-повтор', 'Много героев и резкие смены места'],
          ['7-8', 'Причина и следствие, мотив героя, легкий юмор', 'Слишком детские повторы без развития'],
          ['9+', 'Более сложный выбор, подтекст, последствия', 'Объяснение всего вместо доверия читателю'],
        ],
      },
      es: {
        heading: 'Guía de complejidad por edad',
        intro: 'No son reglas rígidas. Úsalas como punto de partida y observa la experiencia lectora y el ánimo del niño.',
        columns: ['Edad', 'Qué suele funcionar', 'Qué limitar'],
        rows: [
          ['3-4', 'Escenas cortas, repetición, objetos concretos', 'Explicaciones largas de motivos y varias líneas paralelas'],
          ['5-6', 'Un problema, elección simple, frase repetida familiar', 'Demasiados personajes y cambios bruscos de lugar'],
          ['7-8', 'Causa y efecto, motivo interno, humor ligero', 'Repetición demasiado infantil sin desarrollo'],
          ['9+', 'Elección más compleja, subtexto, consecuencias', 'Explicar todo en vez de confiar en el lector'],
        ],
      },
      de: {
        heading: 'Orientierung für Komplexität nach Alter',
        intro: 'Das sind keine starren Regeln. Nutze sie als Startpunkt und achte auf Leseerfahrung und Tagesform.',
        columns: ['Alter', 'Was oft funktioniert', 'Was begrenzen'],
        rows: [
          ['3-4', 'Kurze Szenen, Wiederholung, konkrete Dinge', 'Lange Motiverklärungen und mehrere Handlungsstränge'],
          ['5-6', 'Ein Problem, einfache Wahl, vertraute Wiederholungsphrase', 'Zu viele Figuren und abrupte Ortswechsel'],
          ['7-8', 'Ursache und Wirkung, inneres Motiv, leichter Humor', 'Zu kindliche Wiederholung ohne Entwicklung'],
          ['9+', 'Komplexere Wahl, Subtext, Konsequenzen', 'Alles erklären statt dem Leser zu vertrauen'],
        ],
      },
      fr: {
        heading: 'Repères de complexité selon l’âge',
        intro: 'Ce ne sont pas des règles fixes. Servez-vous-en comme point de départ et observez l’expérience et l’humeur du jour.',
        columns: ['Âge', 'Ce qui fonctionne souvent', 'Ce qu’il vaut mieux limiter'],
        rows: [
          ['3-4', 'Scènes courtes, répétition, objets concrets', 'Longues explications de motivations et plusieurs fils parallèles'],
          ['5-6', 'Un problème, choix simple, phrase répétée familière', 'Trop de personnages et changements brusques de lieu'],
          ['7-8', 'Cause et conséquence, motif interne, humour léger', 'Répétitions trop enfantines sans progression'],
          ['9+', 'Choix plus complexe, sous-texte, conséquences', 'Tout expliquer au lieu de faire confiance au lecteur'],
        ],
      },
      pl: {
        heading: 'Wskazówki trudności według wieku',
        intro: 'To nie są sztywne normy. Zacznij od nich i obserwuj doświadczenie czytania oraz nastrój dziecka.',
        columns: ['Wiek', 'Co zwykle działa', 'Co ograniczyć'],
        rows: [
          ['3-4', 'Krótkie sceny, powtórzenia, konkretne przedmioty', 'Długie wyjaśnianie motywów i kilka równoległych wątków'],
          ['5-6', 'Jeden problem, prosty wybór, znajoma fraza', 'Zbyt wielu bohaterów i nagłe zmiany miejsca'],
          ['7-8', 'Przyczyna i skutek, motyw wewnętrzny, lekki humor', 'Zbyt dziecięce powtórki bez rozwoju'],
          ['9+', 'Trudniejszy wybór, podtekst, konsekwencje', 'Wyjaśnianie wszystkiego zamiast zaufania czytelnikowi'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Налаштування',
        heading: 'Як WonderTales підлаштовує складність на один рівень',
        intro: 'У WonderTales не потрібно перебудовувати всю історію. Вікові підказки керують кількома ручками: довжиною сцени, словником, кількістю героїв і емоційною вагою.',
        steps: [
          { title: 'Довжина сцени', body: 'Скоротіть сцену до однієї події або додайте другий наслідок, якщо дитині занадто легко.' },
          { title: 'Нове слово', body: 'Залиште цікаве слово, але поставте поруч дію, картинку або повтор, який пояснює сенс.' },
          { title: 'Кількість героїв', body: 'Для легшого читання тримайте двох активних персонажів; для старших додайте третій погляд.' },
          { title: 'Емоційна вага', body: 'Перед сном зменшуйте напругу, вдень можна лишити складніший вибір і обговорення.' },
        ],
      },
      en: {
        eyebrow: 'Adjustment',
        heading: 'How WonderTales adjusts complexity by one step',
        intro: 'In WonderTales, the whole story does not need to be rebuilt. Age guidance steers a few knobs: scene length, vocabulary, number of characters, and emotional weight.',
        steps: [
          { title: 'Scene length', body: 'Reduce the scene to one event, or add a second consequence when the story is too easy.' },
          { title: 'New word', body: 'Keep the interesting word, but place action, image, or repetition nearby to reveal meaning.' },
          { title: 'Number of characters', body: 'For easier reading, keep two active characters; for older children, add a third perspective.' },
          { title: 'Emotional weight', body: 'At bedtime, lower tension; during the day, you can keep a harder choice and talk about it.' },
        ],
      },
      ru: {
        eyebrow: 'Настройка',
        heading: 'Как WonderTales подстраивает сложность на один уровень',
        intro: 'В WonderTales не нужно перестраивать всю историю. Возрастные подсказки управляют несколькими ручками: длиной сцены, словарем, количеством героев и эмоциональным весом.',
        steps: [
          { title: 'Длина сцены', body: 'Сократите сцену до одного события или добавьте второе последствие, если слишком легко.' },
          { title: 'Новое слово', body: 'Оставьте интересное слово, но поставьте рядом действие, картинку или повтор, раскрывающий смысл.' },
          { title: 'Количество героев', body: 'Для легкого чтения оставьте двух активных персонажей; для старших добавьте третий взгляд.' },
          { title: 'Эмоциональный вес', body: 'Перед сном снижайте напряжение, днем можно оставить более сложный выбор и обсудить его.' },
        ],
      },
      es: {
        eyebrow: 'Ajuste',
        heading: 'Cómo WonderTales ajusta la complejidad un paso',
        intro: 'En WonderTales no hace falta reconstruir toda la historia. La guía por edad ajusta varias palancas: longitud de escena, vocabulario, número de personajes y peso emocional.',
        steps: [
          { title: 'Longitud de escena', body: 'Reduce la escena a un evento o añade una segunda consecuencia si resulta demasiado fácil.' },
          { title: 'Palabra nueva', body: 'Mantén la palabra interesante, pero pon cerca acción, imagen o repetición que revele el sentido.' },
          { title: 'Número de personajes', body: 'Para leer fácil, deja dos personajes activos; para mayores, añade una tercera perspectiva.' },
          { title: 'Peso emocional', body: 'Antes de dormir baja la tensión; de día puedes dejar una elección más difícil y hablarla.' },
        ],
      },
      de: {
        eyebrow: 'Anpassung',
        heading: 'Wie WonderTales Komplexität um eine Stufe anpasst',
        intro: 'In WonderTales muss nicht die ganze Geschichte neu gebaut werden. Alterslogik steuert einige Regler: Szenenlänge, Wortschatz, Figurenanzahl und emotionale Schwere.',
        steps: [
          { title: 'Szenenlänge', body: 'Kürze auf ein Ereignis oder füge eine zweite Folge hinzu, wenn es zu leicht ist.' },
          { title: 'Neues Wort', body: 'Behalte das spannende Wort, aber gib Handlung, Bild oder Wiederholung daneben.' },
          { title: 'Figurenanzahl', body: 'Für leichteres Lesen zwei aktive Figuren; für ältere Kinder eine dritte Perspektive.' },
          { title: 'Emotionale Schwere', body: 'Abends Spannung senken; tagsüber darf eine schwierigere Wahl bleiben.' },
        ],
      },
      fr: {
        eyebrow: 'Ajustement',
        heading: 'Comment WonderTales ajuste la complexité d’un cran',
        intro: 'Dans WonderTales, il n’est pas nécessaire de reconstruire toute l’histoire. Les repères d’âge ajustent quelques leviers : longueur de scène, vocabulaire, nombre de personnages et poids émotionnel.',
        steps: [
          { title: 'Longueur de scène', body: 'Réduisez à un événement ou ajoutez une seconde conséquence si c’est trop facile.' },
          { title: 'Mot nouveau', body: 'Gardez le mot intéressant, mais ajoutez action, image ou répétition pour en montrer le sens.' },
          { title: 'Nombre de personnages', body: 'Pour faciliter, gardez deux personnages actifs; pour les plus grands, ajoutez un troisième point de vue.' },
          { title: 'Poids émotionnel', body: 'Le soir, baissez la tension; le jour, un choix plus difficile peut rester.' },
        ],
      },
      pl: {
        eyebrow: 'Dopasowanie',
        heading: 'Jak WonderTales dostosowuje trudność o jeden poziom',
        intro: 'W WonderTales nie trzeba przebudowywać całej historii. Wskazówki wieku sterują kilkoma rzeczami: długością sceny, słownictwem, liczbą postaci i ciężarem emocji.',
        steps: [
          { title: 'Długość sceny', body: 'Skróć do jednego wydarzenia albo dodaj drugą konsekwencję, jeśli jest zbyt łatwo.' },
          { title: 'Nowe słowo', body: 'Zostaw ciekawe słowo, ale dodaj obok działanie, obraz albo powtórzenie.' },
          { title: 'Liczba postaci', body: 'Dla łatwiejszego czytania zostaw dwie aktywne postacie; starszym dodaj trzeci punkt widzenia.' },
          { title: 'Ciężar emocji', body: 'Wieczorem zmniejsz napięcie; w dzień można zostawić trudniejszy wybór.' },
        ],
      },
    },
  },
  {
    slug: 'audio-bedtime-stories',
    heroImage: '/landing/blog/audio-bedtime-stories-scene-01.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Аудіоісторії', en: 'Audio stories', ru: 'Аудиоистории', es: 'Historias de audio', de: 'Hörgeschichten', fr: 'Histoires audio', pl: 'Audiohistorie' },
    title: {
      uk: 'Як зацікавити дитину аудіоісторією на ніч',
      en: 'How to help a child enjoy bedtime audio stories',
      ru: 'Как заинтересовать ребенка аудиоисторией на ночь',
      es: 'Cómo ayudar a un niño a disfrutar historias de audio antes de dormir',
      de: 'Wie Kinder Hörgeschichten vor dem Schlafen genießen',
      fr: 'Comment donner envie d’écouter une histoire audio le soir',
      pl: 'Jak zachęcić dziecko do audiohistorii na dobranoc',
    },
    description: {
      uk: 'Аудіоісторія працює краще, коли це ритуал: знайомий голос, короткий вибір, тиха кімната і зрозумілий фінал.',
      en: 'A bedtime audio story works better as a ritual: familiar voice, small choice, quiet room, and a clear ending.',
      ru: 'Аудиоистория работает лучше как ритуал: знакомый голос, небольшой выбор, тихая комната и понятный финал.',
      es: 'Una historia de audio funciona mejor como ritual: voz familiar, pequeña elección, habitación tranquila y final claro.',
      de: 'Eine Hörgeschichte funktioniert besser als Ritual: vertraute Stimme, kleine Wahl, ruhiger Raum und klares Ende.',
      fr: 'Une histoire audio fonctionne mieux comme rituel : voix familière, petit choix, pièce calme et fin claire.',
      pl: 'Audiohistoria działa najlepiej jako rytuał: znajomy głos, mały wybór, cichy pokój i jasne zakończenie.',
    },
    lead: {
      uk: 'На ніч дитині потрібна не “ще одна функція”, а передбачуваний м’який перехід від дня до сну.',
      en: 'At bedtime, a child does not need another feature. They need a predictable, gentle bridge from the day into sleep.',
      ru: 'На ночь ребенку нужна не “еще одна функция”, а понятный мягкий переход от дня ко сну.',
      es: 'Antes de dormir, un niño no necesita otra función, sino un puente suave y predecible hacia el sueño.',
      de: 'Abends braucht ein Kind keine weitere Funktion, sondern eine sanfte, vorhersehbare Brücke in den Schlaf.',
      fr: 'Le soir, l’enfant n’a pas besoin d’une fonction de plus, mais d’un passage doux et prévisible vers le sommeil.',
      pl: 'Wieczorem dziecko nie potrzebuje kolejnej funkcji, tylko przewidywalnego, łagodnego przejścia do snu.',
    },
    focus: {
      uk: 'Дайте дитині маленький вибір: голос, герой або тема. Після цього вибір закінчується, а ритуал починається: приглушене світло, одна історія, спокійний фінал.',
      en: 'Offer a small choice: voice, hero, or theme. Then choice ends and ritual begins: dim light, one story, calm ending.',
      ru: 'Дайте маленький выбор: голос, герой или тема. Затем выбор заканчивается и начинается ритуал: мягкий свет, одна история, спокойный финал.',
      es: 'Ofrece una elección pequeña: voz, héroe o tema. Luego termina la elección y empieza el ritual: luz baja, una historia, final tranquilo.',
      de: 'Gib eine kleine Wahl: Stimme, Figur oder Thema. Danach beginnt das Ritual: gedimmtes Licht, eine Geschichte, ruhiges Ende.',
      fr: 'Proposez un petit choix : voix, héros ou thème. Ensuite le rituel commence : lumière douce, une histoire, fin calme.',
      pl: 'Daj mały wybór: głos, bohater albo temat. Potem zaczyna się rytuał: przygaszone światło, jedna historia, spokojny finał.',
    },
    research: {
      uk: 'Дослідження сну у дітей стабільно підкреслюють роль регулярних bedtime routines. Аудіоісторія може бути частиною рутини, якщо не стає нескінченною стимуляцією.',
      en: 'Child sleep research consistently emphasizes regular bedtime routines. Audio stories can support the routine when they do not become endless stimulation.',
      ru: 'Исследования детского сна постоянно подчеркивают роль вечерних ритуалов. Аудиоистория помогает, если не превращается в бесконечную стимуляцию.',
      es: 'La investigación del sueño infantil subraya las rutinas de noche. Las historias de audio ayudan si no se vuelven estimulación infinita.',
      de: 'Kinderschlafforschung betont regelmäßige Abendroutinen. Hörgeschichten helfen, wenn sie nicht zu endloser Stimulation werden.',
      fr: 'La recherche sur le sommeil de l’enfant souligne les routines du soir. L’audio aide s’il ne devient pas une stimulation sans fin.',
      pl: 'Badania nad snem dzieci podkreślają rolę wieczornych rytuałów. Audiohistoria pomaga, jeśli nie staje się nieskończoną stymulacją.',
    },
    storyUse: {
      uk: 'У WonderTales одна історія має одне аудіо, без нескінченного автопрогравання. Це підтримує межу вечірнього ритуалу: прозвучала фінальна фраза — історія завершилася.',
      en: 'In WonderTales, one story has one audio track, without endless autoplay. That supports the bedtime boundary: once the final line plays, the story is complete.',
      ru: 'В WonderTales у одной истории одно аудио, без бесконечного автопродолжения. Это поддерживает границу вечернего ритуала: прозвучала финальная фраза — история завершилась.',
      es: 'En WonderTales, cada historia tiene un solo audio, sin reproducción automática infinita. Esto sostiene el límite del ritual: suena la frase final y la historia termina.',
      de: 'In WonderTales hat jede Geschichte eine Audiospur, ohne endloses Autoplay. Das stützt die Ritualgrenze: Nach dem letzten Satz ist die Geschichte abgeschlossen.',
      fr: 'Dans WonderTales, une histoire a un seul audio, sans lecture automatique infinie. Cela garde la limite du rituel : la phrase finale arrive, l’histoire se termine.',
      pl: 'W WonderTales jedna historia ma jedno audio, bez niekończącego się autoplay. To wspiera granicę rytuału: po ostatnim zdaniu historia jest zakończona.',
    },
    adjustment: {
      uk: 'Якщо аудіо розганяє дитину, змініть тему на менш пригодницьку, зменшіть гучність і слухайте частину історії раніше, не в ліжку.',
      en: 'If audio energizes the child, choose a calmer theme, lower volume, and listen to part of the story earlier, outside the bed.',
      ru: 'Если аудио бодрит, выберите более спокойную тему, снизьте громкость и слушайте часть истории раньше, не в кровати.',
      es: 'Si el audio activa al niño, elige un tema más calmado, baja el volumen y escucha parte antes, fuera de la cama.',
      de: 'Wenn Audio das Kind aktiviert, wähle ein ruhigeres Thema, senke die Lautstärke und höre einen Teil früher.',
      fr: 'Si l’audio excite l’enfant, choisissez un thème plus calme, baissez le volume et écoutez une partie plus tôt.',
      pl: 'Jeśli audio pobudza, wybierz spokojniejszy temat, ścisz i posłuchaj części wcześniej, poza łóżkiem.',
    },
    checklist: {
      uk: ['Один маленький вибір перед стартом.', 'Одна аудіоісторія без автопродовження.', 'Одна фінальна фраза, після якої ритуал завершується.'],
      en: ['One small choice before start.', 'One audio story without autoplay.', 'One final line that ends the ritual.'],
      ru: ['Один маленький выбор перед стартом.', 'Одно аудио без автопродолжения.', 'Одна финальная фраза для завершения ритуала.'],
      es: ['Una elección pequeña antes de empezar.', 'Una historia de audio sin autoplay.', 'Una frase final que cierre el ritual.'],
      de: ['Eine kleine Wahl vor dem Start.', 'Eine Hörgeschichte ohne Autoplay.', 'Ein letzter Satz beendet das Ritual.'],
      fr: ['Un petit choix avant de commencer.', 'Une histoire audio sans autoplay.', 'Une phrase finale clôt le rituel.'],
      pl: ['Jeden mały wybór przed startem.', 'Jedna audiohistoria bez autoplay.', 'Jedno końcowe zdanie zamyka rytuał.'],
    },
    quote: {
      text: {
        uk: 'Вечірня рутина перед сном — цілком здійсненна й економна сімейна поведінка.',
        en: 'A bedtime routine is a highly feasible and cost-effective family behavior.',
        ru: 'Ритуал перед сном — вполне осуществимое и экономичное семейное поведение.',
        es: 'Una rutina para dormir es una conducta familiar muy viable y de bajo coste.',
        de: 'Eine Abendroutine ist ein gut umsetzbares und kosteneffektives Familienverhalten.',
        fr: 'Une routine du coucher est un comportement familial très réalisable et peu coûteux.',
        pl: 'Rutyna przed snem to bardzo wykonalne i opłacalne zachowanie rodzinne.',
      },
      attribution: 'Mindell et al.',
      sourceLabel: 'Sleep Medicine Reviews',
      sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/29195725/',
    },
    sources: [
      { label: 'Mindell et al.: bedtime routines', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2675894/' },
      { label: 'Sleep Foundation: bedtime routines for children', url: 'https://www.sleepfoundation.org/children-and-sleep/bedtime-routine' },
    ],
    visualDirection: 'A warm nightstand, headphones, a glowing storybook, and a calm bedroom in WonderTales illustration style.',
    relatedSlugs: ['bedtime-story-family-ritual', 'five-minute-stories'],
    inlineImages: articleInlineImages(
      'audio-bedtime-stories',
      l10n(
        'Дитина робить маленький вибір на планшеті перед вечірньою аудіоісторією',
        'A child makes one small choice on a tablet before a bedtime audio story',
        'Ребенок делает маленький выбор на планшете перед вечерней аудиоисторией',
        'Un niño hace una pequeña elección en una tableta antes de la historia de audio',
        'Ein Kind trifft vor der Hörgeschichte eine kleine Wahl auf dem Tablet',
        'Un enfant fait un petit choix sur une tablette avant l’histoire audio du soir',
        'Dziecko dokonuje małego wyboru na tablecie przed wieczorną audiohistorią'
      ),
      l10n(
        'Маленький вибір на старті допомагає ритуалу початися без нескінченного перемикання.',
        'A small choice at the start helps the ritual begin without endless switching.',
        'Маленький выбор в начале помогает ритуалу начаться без бесконечного переключения.',
        'Una elección pequeña al inicio ayuda a empezar el ritual sin cambios infinitos.',
        'Eine kleine Wahl am Anfang lässt das Ritual beginnen, ohne endloses Wechseln.',
        'Un petit choix au départ aide le rituel à commencer sans basculer sans fin.',
        'Mały wybór na początku pomaga zacząć rytuał bez ciągłego przełączania.'
      ),
      l10n(
        'Планшет лежить на низькому столику, поки дитина спокійно слухає поруч із дорослим',
        'A tablet rests on a low table while a child listens calmly beside a parent',
        'Планшет лежит на низком столике, пока ребенок спокойно слушает рядом с взрослым',
        'Una tableta descansa en una mesa baja mientras el niño escucha junto a un adulto',
        'Ein Tablet liegt auf einem niedrigen Tisch, während das Kind ruhig neben einem Elternteil zuhört',
        'Une tablette repose sur une table basse pendant que l’enfant écoute calmement près d’un parent',
        'Tablet leży na niskim stoliku, gdy dziecko spokojnie słucha obok rodzica'
      ),
      l10n(
        'Аудіо краще працює як місток до сну, коли екран не керує всім вечором.',
        'Audio works better as a bridge to sleep when the screen does not run the evening.',
        'Аудио лучше работает как мостик ко сну, когда экран не управляет всем вечером.',
        'El audio funciona mejor como puente hacia el sueño cuando la pantalla no dirige la noche.',
        'Audio hilft besser als Brücke in den Schlaf, wenn der Bildschirm nicht den Abend steuert.',
        'L’audio aide mieux comme passage vers le sommeil quand l’écran ne dirige pas la soirée.',
        'Audio lepiej prowadzi do snu, gdy ekran nie przejmuje całego wieczoru.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Коли допомагає', title: 'Одна історія і зрозумілий фінал', body: 'Дитина розслабляється, слухає знайомий ритм і приймає завершення без нескінченного “ще одну”.' },
        { eyebrow: 'Коли збуджує', title: 'Сюжет надто пригодницький', body: 'Якщо після аудіо дитина активніша, спробуйте спокійнішу тему, нижчу гучність або слухання трохи раніше.' },
        { eyebrow: 'Роль дорослого', title: 'Не телефон керує ритуалом', body: 'Дорослий обирає межу: одна історія, таймер, екран убраний, фінальна фраза повторюється щовечора.' },
      ],
      en: [
        { eyebrow: 'When it helps', title: 'One story and a clear ending', body: 'The child relaxes, follows a familiar rhythm, and accepts the ending without endless “one more”.' },
        { eyebrow: 'When it activates', title: 'The plot is too adventurous', body: 'If audio makes the child livelier, try a calmer theme, lower volume, or listening a little earlier.' },
        { eyebrow: 'Adult role', title: 'The phone should not run the ritual', body: 'The adult sets the boundary: one story, timer, screen away, final phrase repeated each evening.' },
      ],
      ru: [
        { eyebrow: 'Когда помогает', title: 'Одна история и понятный финал', body: 'Ребенок расслабляется, слышит знакомый ритм и принимает завершение без бесконечного “еще одну”.' },
        { eyebrow: 'Когда бодрит', title: 'Сюжет слишком приключенческий', body: 'Если после аудио ребенок активнее, попробуйте спокойную тему, ниже громкость или слушание раньше.' },
        { eyebrow: 'Роль взрослого', title: 'Ритуалом управляет не телефон', body: 'Взрослый задает границу: одна история, таймер, экран убран, финальная фраза повторяется каждый вечер.' },
      ],
      es: [
        { eyebrow: 'Cuando ayuda', title: 'Una historia y un final claro', body: 'El niño se relaja, sigue un ritmo conocido y acepta el cierre sin pedir “una más” sin fin.' },
        { eyebrow: 'Cuando activa', title: 'La trama es demasiado aventurera', body: 'Si el audio lo despierta, prueba un tema más tranquilo, menor volumen o escuchar un poco antes.' },
        { eyebrow: 'Papel adulto', title: 'El teléfono no dirige el ritual', body: 'El adulto marca el límite: una historia, temporizador, pantalla fuera y frase final repetida cada noche.' },
      ],
      de: [
        { eyebrow: 'Wenn es hilft', title: 'Eine Geschichte und ein klares Ende', body: 'Das Kind entspannt sich, folgt einem vertrauten Rhythmus und akzeptiert das Ende ohne endloses “noch eine”.' },
        { eyebrow: 'Wenn es aktiviert', title: 'Die Handlung ist zu abenteuerlich', body: 'Wenn Audio das Kind munter macht, wähle ein ruhigeres Thema, geringere Lautstärke oder einen früheren Zeitpunkt.' },
        { eyebrow: 'Rolle des Erwachsenen', title: 'Nicht das Telefon steuert das Ritual', body: 'Der Erwachsene setzt die Grenze: eine Geschichte, Timer, Bildschirm weg, derselbe Schlusssatz.' },
      ],
      fr: [
        { eyebrow: 'Quand cela aide', title: 'Une histoire et une fin claire', body: 'L’enfant se détend, suit un rythme familier et accepte la fin sans “encore une” sans fin.' },
        { eyebrow: 'Quand cela stimule', title: 'L’intrigue est trop aventureuse', body: 'Si l’audio l’active, essayez un thème plus calme, un volume plus bas ou une écoute plus tôt.' },
        { eyebrow: 'Rôle adulte', title: 'Le téléphone ne dirige pas le rituel', body: 'L’adulte pose le cadre : une histoire, minuterie, écran éloigné et phrase finale répétée chaque soir.' },
      ],
      pl: [
        { eyebrow: 'Kiedy pomaga', title: 'Jedna historia i jasny koniec', body: 'Dziecko rozluźnia się, słyszy znajomy rytm i przyjmuje koniec bez nieskończonego “jeszcze jedną”.' },
        { eyebrow: 'Kiedy pobudza', title: 'Fabuła jest zbyt przygodowa', body: 'Jeśli audio ożywia dziecko, wybierz spokojniejszy temat, niższą głośność albo wcześniejszy moment.' },
        { eyebrow: 'Rola dorosłego', title: 'To nie telefon prowadzi rytuał', body: 'Dorosły ustala granicę: jedna historia, timer, ekran poza łóżkiem, stałe zdanie końcowe.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Як WonderTales тримає аудіоісторію в межах ритуалу',
        intro: 'Мета не в тому, щоб дитина слухала довше. WonderTales підтримує короткий маршрут до сну: одна історія, один голос, зрозумілий фінал.',
        columns: ['Ознака', 'М’яке налаштування', 'Чого уникати'],
        rows: [
          ['Просить ще одну', 'Заздалегідь домовитися про останній звук', 'Автопрогравання серії'],
          ['Стає активнішою', 'Обрати спокійнішу тему й нижчу гучність', 'Пригодницький темп перед самим сном'],
          ['Не хоче починати', 'Дати вибір голосу, героя або теми', 'Відкривати великий список варіантів'],
          ['Засинає до фіналу', 'Обрати коротшу історію або починати раніше', 'Вмикати аудіо на всю ніч'],
        ],
      },
      en: {
        heading: 'How WonderTales keeps audio inside the ritual',
        intro: 'The goal is not longer listening. WonderTales supports a short bridge to sleep: one story, one voice, and a clear ending.',
        columns: ['Signal', 'Gentle adjustment', 'Avoid'],
        rows: [
          ['Asks for one more', 'Agree on the last sound before starting', 'Series autoplay'],
          ['Gets more active', 'Choose a calmer theme and lower volume', 'Adventure pacing right before sleep'],
          ['Does not want to start', 'Offer a choice of voice, hero, or theme', 'Opening a huge list of options'],
          ['Falls asleep before the end', 'Choose a shorter story or start earlier', 'Playing audio all night'],
        ],
      },
      ru: {
        heading: 'Как WonderTales удерживает аудиоисторию в границах ритуала',
        intro: 'Цель не в том, чтобы слушать дольше. WonderTales поддерживает короткий переход ко сну: одна история, один голос и понятный финал.',
        columns: ['Признак', 'Мягкая настройка', 'Чего избегать'],
        rows: [
          ['Просит еще одну', 'Заранее договориться о последнем звуке', 'Автопроигрывание серии'],
          ['Становится активнее', 'Выбрать спокойную тему и ниже громкость', 'Приключенческий темп прямо перед сном'],
          ['Не хочет начинать', 'Дать выбор голоса, героя или темы', 'Открывать огромный список вариантов'],
          ['Засыпает до финала', 'Выбрать историю короче или начать раньше', 'Включать аудио на всю ночь'],
        ],
      },
      es: {
        heading: 'Cómo WonderTales mantiene el audio dentro del ritual',
        intro: 'La meta no es escuchar más tiempo. WonderTales apoya un puente breve hacia el sueño: una historia, una voz y un final claro.',
        columns: ['Señal', 'Ajuste suave', 'Evitar'],
        rows: [
          ['Pide una más', 'Acordar el último sonido antes de empezar', 'Reproducción automática de series'],
          ['Se activa más', 'Elegir tema más tranquilo y volumen bajo', 'Ritmo aventurero justo antes de dormir'],
          ['No quiere empezar', 'Ofrecer voz, héroe o tema', 'Abrir una lista enorme de opciones'],
          ['Se duerme antes del final', 'Elegir historia más corta o empezar antes', 'Audio toda la noche'],
        ],
      },
      de: {
        heading: 'Wie WonderTales Audio im Ritual hält',
        intro: 'Ziel ist nicht längeres Hören. WonderTales unterstützt eine kurze Brücke in den Schlaf: eine Geschichte, eine Stimme, ein klares Ende.',
        columns: ['Signal', 'Sanfte Anpassung', 'Vermeiden'],
        rows: [
          ['Will noch eine', 'Vorher den letzten Ton vereinbaren', 'Serien-Autoplay'],
          ['Wird aktiver', 'Ruhigeres Thema und geringere Lautstärke', 'Abenteuerliches Tempo direkt vor dem Schlaf'],
          ['Will nicht starten', 'Wahl von Stimme, Figur oder Thema geben', 'Eine riesige Liste öffnen'],
          ['Schläft vor Ende ein', 'Kürzere Geschichte wählen oder früher beginnen', 'Audio die ganze Nacht'],
        ],
      },
      fr: {
        heading: 'Comment WonderTales garde l’audio dans le rituel',
        intro: 'Le but n’est pas d’écouter plus longtemps. WonderTales soutient un passage court vers le sommeil : une histoire, une voix et une fin claire.',
        columns: ['Signal', 'Ajustement doux', 'À éviter'],
        rows: [
          ['Demande encore une', 'Définir le dernier son avant de commencer', 'Lecture automatique en série'],
          ['S’active davantage', 'Choisir un thème plus calme et baisser le volume', 'Rythme d’aventure juste avant dormir'],
          ['Ne veut pas commencer', 'Proposer voix, héros ou thème', 'Ouvrir une liste immense'],
          ['S’endort avant la fin', 'Choisir plus court ou commencer plus tôt', 'Audio toute la nuit'],
        ],
      },
      pl: {
        heading: 'Jak WonderTales trzyma audio w rytuale',
        intro: 'Celem nie jest dłuższe słuchanie. WonderTales wspiera krótkie przejście do snu: jedna historia, jeden głos i jasny finał.',
        columns: ['Sygnał', 'Łagodna zmiana', 'Unikaj'],
        rows: [
          ['Prosi o jeszcze jedną', 'Ustalić ostatni dźwięk przed startem', 'Autoodtwarzania serii'],
          ['Staje się aktywniejsze', 'Wybrać spokojniejszy temat i niższą głośność', 'Przygodowego tempa tuż przed snem'],
          ['Nie chce zaczynać', 'Dać wybór głosu, bohatera albo tematu', 'Otwierania wielkiej listy opcji'],
          ['Zasypia przed finałem', 'Wybrać krótszą historię albo zacząć wcześniej', 'Audio przez całą noc'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Ритуал',
        heading: 'Короткий вечірній аудіомаршрут',
        intro: 'Це проста послідовність, яку легко повторити навіть у втомлений вечір.',
        steps: [
          { title: 'Один маленький вибір', body: 'Дитина обирає голос, героя або тему до старту, але не гортає нескінченний список.' },
          { title: 'Тиха кімната', body: 'Світло приглушене, екран прибраний, звук достатньо тихий, щоб не змагатися з тишею.' },
          { title: 'Одна історія', body: 'Без автопродовження і без “ще одну” після фінальної фрази.' },
          { title: 'Останній звук', body: 'Після завершення дорослий повторює коротку нічну фразу, і ритуал закривається.' },
        ],
      },
      en: {
        eyebrow: 'Ritual',
        heading: 'A short evening audio route',
        intro: 'A simple sequence that is easy to repeat even on tired evenings.',
        steps: [
          { title: 'One small choice', body: 'The child chooses voice, hero, or theme before starting, not from an endless list.' },
          { title: 'Quiet room', body: 'Lights are dim, the screen is away, and sound is low enough not to compete with quiet.' },
          { title: 'One story', body: 'No autoplay and no “one more” after the final line.' },
          { title: 'Last sound', body: 'After the ending, the adult repeats a short night phrase and the ritual closes.' },
        ],
      },
      ru: {
        eyebrow: 'Ритуал',
        heading: 'Короткий вечерний аудиомаршрут',
        intro: 'Простая последовательность, которую легко повторить даже в уставший вечер.',
        steps: [
          { title: 'Один маленький выбор', body: 'Ребенок выбирает голос, героя или тему до старта, но не листает бесконечный список.' },
          { title: 'Тихая комната', body: 'Свет приглушен, экран убран, звук достаточно тихий, чтобы не спорить с тишиной.' },
          { title: 'Одна история', body: 'Без автопродолжения и без “еще одну” после финальной фразы.' },
          { title: 'Последний звук', body: 'После завершения взрослый повторяет короткую ночную фразу, и ритуал закрывается.' },
        ],
      },
      es: {
        eyebrow: 'Ritual',
        heading: 'Una ruta breve de audio por la noche',
        intro: 'Una secuencia simple que se puede repetir incluso en noches de cansancio.',
        steps: [
          { title: 'Una pequeña elección', body: 'El niño elige voz, héroe o tema antes de empezar, no desde una lista infinita.' },
          { title: 'Habitación tranquila', body: 'Luz baja, pantalla fuera y volumen lo bastante bajo para no competir con el silencio.' },
          { title: 'Una historia', body: 'Sin autoplay y sin “una más” después de la frase final.' },
          { title: 'Último sonido', body: 'Al terminar, el adulto repite una frase nocturna breve y el ritual se cierra.' },
        ],
      },
      de: {
        eyebrow: 'Ritual',
        heading: 'Eine kurze Audio-Abendroute',
        intro: 'Eine einfache Folge, die auch an müden Abenden wiederholbar bleibt.',
        steps: [
          { title: 'Eine kleine Wahl', body: 'Das Kind wählt Stimme, Figur oder Thema vor dem Start, nicht aus einer endlosen Liste.' },
          { title: 'Ruhiger Raum', body: 'Licht gedimmt, Bildschirm weg, Lautstärke leise genug für Ruhe.' },
          { title: 'Eine Geschichte', body: 'Kein Autoplay und kein “noch eine” nach dem Schluss.' },
          { title: 'Letzter Ton', body: 'Nach dem Ende wiederholt der Erwachsene einen kurzen Nachtsatz und das Ritual schließt.' },
        ],
      },
      fr: {
        eyebrow: 'Rituel',
        heading: 'Un court trajet audio du soir',
        intro: 'Une suite simple à répéter même les soirs de fatigue.',
        steps: [
          { title: 'Un petit choix', body: 'L’enfant choisit voix, héros ou thème avant le départ, pas dans une liste infinie.' },
          { title: 'Pièce calme', body: 'Lumière douce, écran éloigné, volume assez bas pour ne pas lutter avec le silence.' },
          { title: 'Une histoire', body: 'Pas d’autoplay et pas de “encore une” après la dernière phrase.' },
          { title: 'Dernier son', body: 'Après la fin, l’adulte répète une courte phrase de nuit et le rituel se ferme.' },
        ],
      },
      pl: {
        eyebrow: 'Rytuał',
        heading: 'Krótka wieczorna trasa audio',
        intro: 'Prosta kolejność, którą da się powtórzyć nawet w zmęczony wieczór.',
        steps: [
          { title: 'Jeden mały wybór', body: 'Dziecko wybiera głos, bohatera albo temat przed startem, nie z nieskończonej listy.' },
          { title: 'Cichy pokój', body: 'Przygaszone światło, ekran poza łóżkiem, dźwięk wystarczająco cichy.' },
          { title: 'Jedna historia', body: 'Bez autoplay i bez “jeszcze jedną” po finałowym zdaniu.' },
          { title: 'Ostatni dźwięk', body: 'Po zakończeniu dorosły powtarza krótkie zdanie na noc i rytuał się zamyka.' },
        ],
      },
    },
  },
  {
    slug: 'five-minute-stories',
    heroImage: '/landing/blog/five-minute-stories-scene-01.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Швидкі історії', en: 'Quick stories', ru: 'Быстрые истории', es: 'Historias rápidos', de: 'Kurze Geschichten', fr: 'Histoires rapides', pl: 'Szybkie historie' },
    title: {
      uk: 'П’ятихвилинні історії, які завжди під рукою',
      en: 'Five-minute stories that are always ready',
      ru: 'Пятиминутные истории, которые всегда под рукой',
      es: 'Historias de cinco minutos siempre a mano',
      de: 'Fünf-Minuten-Geschichten, die immer bereit sind',
      fr: 'Des histoires de cinq minutes toujours prêtes',
      pl: 'Pięciominutowe historie zawsze pod ręką',
    },
    description: {
      uk: 'Як короткий флоу створення історії допомагає в черзі, дорозі, перед сном і в ті моменти, коли в батьків немає сил вигадувати з нуля.',
      en: 'How a short story-creation flow helps in queues, travel, bedtime, and moments when parents cannot invent from scratch.',
      ru: 'Как короткий флоу создания истории помогает в очереди, дороге, перед сном и когда у родителей нет сил придумывать с нуля.',
      es: 'Cómo un flujo corto de creación ayuda en colas, viajes, antes de dormir y cuando no hay energía para inventar desde cero.',
      de: 'Wie ein kurzer Erstellungsflow in Warteschlangen, unterwegs, abends und an müden Tagen hilft.',
      fr: 'Comment un flux court aide dans les files, les trajets, le soir et quand les parents n’ont plus d’énergie.',
      pl: 'Jak krótki proces tworzenia pomaga w kolejce, podróży, przed snem i gdy rodzic nie ma siły wymyślać od zera.',
    },
    lead: {
      uk: 'Коротка історія не має бути бідною. Вона має швидко вибрати основу, тримати одну ідею і завершитися так, щоб дитина відчула маленьку цілісність.',
      en: 'A short story does not have to be thin. It needs one clear base, one idea, and an ending that feels complete.',
      ru: 'Короткая история не обязана быть бедной. Ей нужны ясная основа, одна идея и завершение, которое ощущается цельным.',
      es: 'Una historia corta no tiene por qué ser pobre. Necesita una base clara, una idea y un final completo.',
      de: 'Eine kurze Geschichte muss nicht dünn sein. Sie braucht eine klare Basis, eine Idee und ein rundes Ende.',
      fr: 'Une histoire courte n’est pas forcément pauvre. Elle a besoin d’une base claire, d’une idée et d’une fin complète.',
      pl: 'Krótka historia nie musi być uboga. Potrzebuje jasnej podstawy, jednej idei i pełnego zakończenia.',
    },
    focus: {
      uk: 'Найкращі п’ятихвилинні історії мають одну сцену запуску, одну перешкоду і один теплий фінал. Надмірні персонажі й підсюжети краще залишити на довші вечори.',
      en: 'The best five-minute stories have one launch scene, one obstacle, and one warm ending. Extra characters and subplots belong to longer evenings.',
      ru: 'Лучшие пятиминутные истории имеют одну стартовую сцену, одно препятствие и теплый финал. Лишних персонажей лучше оставить на длинный вечер.',
      es: 'Las mejores historias de cinco minutos tienen una escena inicial, un obstáculo y un final cálido. Subtramas y muchos personajes quedan para otro momento.',
      de: 'Gute Fünf-Minuten-Geschichten haben eine Startszene, ein Hindernis und ein warmes Ende. Nebenhandlungen warten auf längere Abende.',
      fr: 'Les bonnes histoires de cinq minutes ont une scène de départ, un obstacle et une fin douce. Les intrigues secondaires attendent.',
      pl: 'Najlepsze pięciominutowe historie mają scenę startową, jedną przeszkodę i ciepły finał. Poboczne wątki zostają na dłuższe wieczory.',
    },
    research: {
      uk: 'Короткі читання легше вписати в реальне сімейне життя. Регулярність часто важливіша за ідеальну тривалість: краще п’ять хвилин сьогодні, ніж “велика історія” ніколи.',
      en: 'Short reading moments fit real family life. Consistency often matters more than ideal duration: five minutes today beats a perfect long story never started.',
      ru: 'Короткое чтение легче встроить в семейную жизнь. Регулярность часто важнее идеальной длительности: пять минут сегодня лучше, чем идеальная длинная история никогда.',
      es: 'Los momentos breves encajan mejor en la vida familiar. La constancia suele importar más que la duración ideal.',
      de: 'Kurze Lesemomente passen besser ins Familienleben. Regelmäßigkeit zählt oft mehr als perfekte Länge.',
      fr: 'Les moments courts s’intègrent mieux à la vie familiale. La régularité compte souvent plus que la durée idéale.',
      pl: 'Krótkie czytanie łatwiej mieści się w życiu rodziny. Regularność bywa ważniejsza niż idealna długość.',
    },
    storyUse: {
      uk: 'У WonderTales швидкий флоу прибирає зайві рішення: тема, дитина або персонаж, мова, старт. Деталі можна додати пізніше, якщо є час і сили.',
      en: 'In WonderTales, the quick flow removes unnecessary decisions: theme, child or character, language, start. Details can wait if there is time and energy.',
      ru: 'В WonderTales быстрый флоу убирает лишние решения: тема, ребенок или персонаж, язык, старт. Детали можно добавить позже.',
      es: 'En WonderTales, el flujo rápido quita decisiones innecesarias: tema, niño o personaje, idioma, empezar. Los detalles pueden esperar.',
      de: 'In WonderTales entfernt der schnelle Flow unnötige Entscheidungen: Thema, Kind oder Figur, Sprache, Start. Details können warten.',
      fr: 'Dans WonderTales, le parcours rapide enlève les décisions inutiles : thème, enfant ou personnage, langue, démarrer. Les détails peuvent attendre.',
      pl: 'W WonderTales szybki proces usuwa zbędne decyzje: temat, dziecko albo postać, język, start. Szczegóły mogą poczekać.',
    },
    adjustment: {
      uk: 'Якщо історія здається занадто швидкою, не додавайте все одразу. Додайте один повторюваний образ або коротке питання в середині.',
      en: 'If the story feels too quick, do not add everything. Add one repeating image or a short question in the middle.',
      ru: 'Если история слишком быстрая, не добавляйте все сразу. Добавьте один повторяющийся образ или короткий вопрос в середине.',
      es: 'Si parece demasiado rápida, no añadas todo. Añade una imagen repetida o una pregunta breve.',
      de: 'Wenn sie zu schnell wirkt, füge nicht alles hinzu. Nutze ein wiederkehrendes Bild oder eine kurze Frage.',
      fr: 'Si elle semble trop rapide, n’ajoutez pas tout. Ajoutez une image répétée ou une courte question.',
      pl: 'Jeśli jest zbyt szybka, nie dodawaj wszystkiego. Dodaj powracający obraz albo krótkie pytanie.',
    },
    checklist: {
      uk: ['Одна тема.', 'Один герой або маленька команда.', 'Один добрий фінал без продовження “ще одну”.'],
      en: ['One theme.', 'One hero or small team.', 'One kind ending without “just one more.”'],
      ru: ['Одна тема.', 'Один герой или маленькая команда.', 'Один добрый финал без “еще одну”.'],
      es: ['Un tema.', 'Un héroe o equipo pequeño.', 'Un final amable sin “otra más”.'],
      de: ['Ein Thema.', 'Eine Figur oder kleines Team.', 'Ein freundliches Ende ohne „noch eine“.'],
      fr: ['Un thème.', 'Un héros ou petite équipe.', 'Une fin douce sans “encore une”.'],
      pl: ['Jeden temat.', 'Jeden bohater albo mała drużyna.', 'Dobry finał bez „jeszcze jednej”.'],
    },
    quote: {
      text: {
        uk: 'Ми не народжені для читання.',
        en: 'We were never born to read.',
        ru: 'Мы не рождены, чтобы читать.',
        es: 'Nunca nacimos para leer.',
        de: 'Wir wurden nicht zum Lesen geboren.',
        fr: 'Nous ne sommes jamais nés pour lire.',
        pl: 'Nie urodziliśmy się po to, by czytać.',
      },
      attribution: 'Maryanne Wolf',
      sourceLabel: 'Proust and the Squid',
      sourceUrl: 'https://www.maryannewolf.com/proust-and-the-squid',
    },
    sources: [
      { label: 'Maryanne Wolf: Proust and the Squid', url: 'https://www.maryannewolf.com/proust-and-the-squid' },
      { label: 'Reading Rockets: reading aloud', url: 'https://www.readingrockets.org/topics/early-literacy-development/articles/reading-aloud-build-comprehension' },
    ],
    visualDirection: 'A small glowing story button in a parent’s hand, opening into a finished illustrated mini-adventure.',
    relatedSlugs: ['audio-bedtime-stories', 'reading-without-pressure'],
    inlineImages: articleInlineImages(
      'five-minute-stories',
      l10n(
        'Планшет лежить на столику в поїзді, поки коротка історія займає частину дороги',
        'A tablet lies on a train table while a short story fills part of the ride',
        'Планшет лежит на столике в поезде, пока короткая история занимает часть дороги',
        'Una tableta está sobre la mesa del tren mientras una historia breve acompaña el viaje',
        'Ein Tablet liegt auf dem Zugtisch, während eine kurze Geschichte die Fahrt begleitet',
        'Une tablette repose sur la table du train pendant qu’une courte histoire accompagne le trajet',
        'Tablet leży na stoliku w pociągu, a krótka historia wypełnia część drogi'
      ),
      l10n(
        'П’яти хвилин достатньо, якщо сцена має один початок, одну дію і м’який фінал.',
        'Five minutes can be enough when the scene has one start, one action, and a soft ending.',
        'Пяти минут достаточно, если у сцены есть одно начало, одно действие и мягкий финал.',
        'Cinco minutos pueden bastar con un inicio, una acción y un cierre suave.',
        'Fünf Minuten reichen, wenn die Szene einen Anfang, eine Handlung und ein weiches Ende hat.',
        'Cinq minutes peuvent suffire avec un début, une action et une fin douce.',
        'Pięć minut wystarczy, gdy scena ma jeden początek, jedno działanie i miękki finał.'
      ),
      l10n(
        'Коротка історія на планшеті завершує вечір за кухонним столом',
        'A short story on a tablet closes the evening at the kitchen table',
        'Короткая история на планшете завершает вечер за кухонным столом',
        'Una historia breve en la tableta cierra la tarde en la mesa de la cocina',
        'Eine kurze Geschichte auf dem Tablet rundet den Abend am Küchentisch ab',
        'Une courte histoire sur la tablette clôt la soirée à la table de cuisine',
        'Krótka historia na tablecie zamyka wieczór przy kuchennym stole'
      ),
      l10n(
        'Короткий формат допомагає знайти маленьку казку навіть у завантажений день.',
        'A short format makes room for a small story even on a crowded day.',
        'Короткий формат помогает найти место для маленькой сказки даже в загруженный день.',
        'El formato breve deja espacio para una pequeña historia incluso en un día lleno.',
        'Das kurze Format schafft Platz für eine kleine Geschichte selbst an vollen Tagen.',
        'Le format court laisse une place à une petite histoire même dans une journée chargée.',
        'Krótki format robi miejsce na małą opowieść nawet w pełny dzień.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Реальне життя', title: 'П’ять хвилин краще за ідеальний план', body: 'Коротка історія працює тоді, коли її справді можна повторити: у черзі, в машині, перед сном або між справами.' },
        { eyebrow: 'Перехід', title: 'Місток між станами', body: 'Міні-історія допомагає перейти від гри до сну, від дороги до вечора або від напруги до спокійнішого ритму.' },
        { eyebrow: 'Не тест', title: 'Одна розмова після фіналу', body: 'Після короткої історії достатньо одного теплого питання: що сподобалося, що здивувало або кому дитина співчувала.' },
      ],
      en: [
        { eyebrow: 'Real life', title: 'Five minutes beats a perfect plan', body: 'A short story works when it can actually be repeated: in a queue, in the car, before bed, or between family tasks.' },
        { eyebrow: 'Transition', title: 'A bridge between states', body: 'A mini-story helps move from play to sleep, from travel to evening, or from tension into a calmer rhythm.' },
        { eyebrow: 'Not a test', title: 'One conversation after the ending', body: 'After a short story, one warm question is enough: what felt fun, surprising, or easy to care about.' },
      ],
      ru: [
        { eyebrow: 'Реальная жизнь', title: 'Пять минут лучше идеального плана', body: 'Короткая история работает, когда ее реально повторять: в очереди, в машине, перед сном или между делами.' },
        { eyebrow: 'Переход', title: 'Мостик между состояниями', body: 'Мини-история помогает перейти от игры ко сну, от дороги к вечеру или от напряжения к более спокойному ритму.' },
        { eyebrow: 'Не проверка', title: 'Один разговор после финала', body: 'После короткой истории достаточно одного теплого вопроса: что понравилось, удивило или кому ребенок сопереживал.' },
      ],
      es: [
        { eyebrow: 'Vida real', title: 'Cinco minutos mejor que un plan perfecto', body: 'Una historia breve funciona cuando se puede repetir de verdad: en una fila, en el coche, antes de dormir o entre tareas.' },
        { eyebrow: 'Transición', title: 'Un puente entre estados', body: 'Una mini-historia ayuda a pasar del juego al sueño, del viaje a la tarde o de la tensión a un ritmo más tranquilo.' },
        { eyebrow: 'No es examen', title: 'Una conversación al final', body: 'Después de una historia corta basta una pregunta cálida: qué gustó, qué sorprendió o por quién sintió algo.' },
      ],
      de: [
        { eyebrow: 'Echtes Leben', title: 'Fünf Minuten schlagen den perfekten Plan', body: 'Eine kurze Geschichte funktioniert, wenn sie wirklich wiederholbar ist: in der Schlange, im Auto, vor dem Schlafen oder zwischendurch.' },
        { eyebrow: 'Übergang', title: 'Eine Brücke zwischen Zuständen', body: 'Eine Mini-Geschichte hilft vom Spiel zum Schlaf, von unterwegs in den Abend oder von Spannung in ruhigeren Rhythmus.' },
        { eyebrow: 'Kein Test', title: 'Ein Gespräch nach dem Ende', body: 'Nach einer kurzen Geschichte genügt eine warme Frage: was schön, überraschend oder mitfühlbar war.' },
      ],
      fr: [
        { eyebrow: 'Vie réelle', title: 'Cinq minutes valent mieux qu’un plan parfait', body: 'Une histoire courte fonctionne quand elle peut vraiment se répéter : en file, en voiture, avant le coucher ou entre deux tâches.' },
        { eyebrow: 'Transition', title: 'Un pont entre deux états', body: 'Une mini-histoire aide à passer du jeu au sommeil, du trajet au soir ou de la tension à un rythme plus calme.' },
        { eyebrow: 'Pas un test', title: 'Une conversation après la fin', body: 'Après une histoire courte, une seule question chaleureuse suffit : ce qui a plu, surpris ou touché.' },
      ],
      pl: [
        { eyebrow: 'Prawdziwe życie', title: 'Pięć minut lepsze niż idealny plan', body: 'Krótka historia działa, gdy da się ją naprawdę powtarzać: w kolejce, w aucie, przed snem albo między obowiązkami.' },
        { eyebrow: 'Przejście', title: 'Most między stanami', body: 'Minihistoria pomaga przejść od zabawy do snu, od drogi do wieczoru albo od napięcia do spokojniejszego rytmu.' },
        { eyebrow: 'Nie sprawdzian', title: 'Jedna rozmowa po finale', body: 'Po krótkiej historii wystarczy jedno ciepłe pytanie: co się podobało, zaskoczyło albo komu dziecko współczuło.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Де п’ятихвилинна історія справді доречна',
        intro: 'Короткий формат не замінює довге читання, але добре закриває маленькі сімейні паузи без зайвого екрана.',
        columns: ['Ситуація', 'Яка історія пасує', 'Що тримати коротким'],
        rows: [
          ['Перед сном', 'Знайома, м’яка, з передбачуваним фіналом', 'Без нової серії після завершення'],
          ['У дорозі', 'Смішна пригода або загадка з одним вибором', 'Не відкривати нескінченний список тем'],
          ['Після сварки', 'Історія про емоцію, примирення або прохання про допомогу', 'Без моралізаторського висновку'],
          ['Вранці', 'Бадьора історія з маленькою місією', 'Без складної драми й багатьох героїв'],
        ],
      },
      en: {
        heading: 'Where a five-minute story really fits',
        intro: 'The short format does not replace long reading, but it fills small family pauses without handing over another screen.',
        columns: ['Moment', 'Story that fits', 'Keep short'],
        rows: [
          ['Before bed', 'Familiar, gentle, predictable ending', 'No new episode after the ending'],
          ['On the road', 'Funny adventure or mystery with one choice', 'Do not open an endless topic list'],
          ['After conflict', 'A story about emotion, repair, or asking for help', 'No moralizing final line'],
          ['Morning', 'Bright story with a small mission', 'No heavy drama or too many characters'],
        ],
      },
      ru: {
        heading: 'Где пятиминутная история действительно уместна',
        intro: 'Короткий формат не заменяет долгое чтение, но хорошо закрывает маленькие семейные паузы без лишнего экрана.',
        columns: ['Ситуация', 'Какая история подходит', 'Что держать коротким'],
        rows: [
          ['Перед сном', 'Знакомая, мягкая, с предсказуемым финалом', 'Без новой серии после завершения'],
          ['В дороге', 'Смешное приключение или загадка с одним выбором', 'Не открывать бесконечный список тем'],
          ['После ссоры', 'История про эмоцию, примирение или просьбу о помощи', 'Без морализаторского вывода'],
          ['Утром', 'Бодрая история с маленькой миссией', 'Без тяжелой драмы и множества героев'],
        ],
      },
      es: {
        heading: 'Dónde encaja una historia de cinco minutos',
        intro: 'El formato breve no sustituye la lectura larga, pero llena pequeñas pausas familiares sin entregar otra pantalla.',
        columns: ['Momento', 'Historia adecuada', 'Mantén breve'],
        rows: [
          ['Antes de dormir', 'Familiar, suave, con final predecible', 'Sin nuevo episodio al terminar'],
          ['En el camino', 'Aventura divertida o misterio con una elección', 'No abrir una lista infinita'],
          ['Después de conflicto', 'Historia sobre emoción, reparación o pedir ayuda', 'Sin moraleja sermoneadora'],
          ['Por la mañana', 'Historia viva con una pequeña misión', 'Sin drama pesado ni muchos personajes'],
        ],
      },
      de: {
        heading: 'Wo eine Fünf-Minuten-Geschichte passt',
        intro: 'Das kurze Format ersetzt kein langes Lesen, füllt aber kleine Familienpausen ohne weiteren Bildschirm.',
        columns: ['Moment', 'Passende Geschichte', 'Kurz halten'],
        rows: [
          ['Vor dem Schlafen', 'Vertraut, sanft, vorhersehbares Ende', 'Keine neue Episode danach'],
          ['Unterwegs', 'Lustiges Abenteuer oder Rätsel mit einer Wahl', 'Keine endlose Themenliste öffnen'],
          ['Nach Streit', 'Geschichte über Gefühl, Wiedergutmachung oder Hilfe', 'Keine predigende Schlusszeile'],
          ['Morgens', 'Helle Geschichte mit kleiner Mission', 'Kein schweres Drama, nicht zu viele Figuren'],
        ],
      },
      fr: {
        heading: 'Où une histoire de cinq minutes aide vraiment',
        intro: 'Le format court ne remplace pas la longue lecture, mais remplit de petites pauses familiales sans écran de plus.',
        columns: ['Moment', 'Histoire adaptée', 'À garder court'],
        rows: [
          ['Avant le coucher', 'Familière, douce, avec fin prévisible', 'Pas de nouvel épisode après la fin'],
          ['En trajet', 'Aventure drôle ou mystère avec un choix', 'Ne pas ouvrir une liste infinie'],
          ['Après un conflit', 'Histoire sur l’émotion, la réparation ou l’aide', 'Pas de morale sermonnée'],
          ['Le matin', 'Histoire vive avec petite mission', 'Pas de drame lourd ni trop de personnages'],
        ],
      },
      pl: {
        heading: 'Gdzie pasuje pięciominutowa historia',
        intro: 'Krótki format nie zastępuje długiego czytania, ale wypełnia małe rodzinne pauzy bez kolejnego ekranu.',
        columns: ['Moment', 'Historia, która pasuje', 'Co skrócić'],
        rows: [
          ['Przed snem', 'Znajoma, łagodna, z przewidywalnym finałem', 'Bez nowego odcinka po końcu'],
          ['W drodze', 'Zabawna przygoda albo zagadka z jednym wyborem', 'Nie otwierać nieskończonej listy tematów'],
          ['Po kłótni', 'Historia o emocji, naprawie albo proszeniu o pomoc', 'Bez pouczającego morału'],
          ['Rano', 'Żywa historia z małą misją', 'Bez ciężkiego dramatu i wielu postaci'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Формула',
        heading: 'Як WonderTales вкладає історію у короткий маршрут',
        intro: 'Коли час обмежений, WonderTales не пришвидшує дитину, а скорочує кількість рішень до простого маршруту.',
        steps: [
          { title: '30 секунд на вибір', body: 'Дайте два варіанти теми або героя. Не відкривайте всі можливості одразу.' },
          { title: '3 хвилини історії', body: 'Одна сцена, одна перешкода, одна маленька перемога.' },
          { title: '1 хвилина розмови', body: 'Попросіть назвати улюблену деталь або почуття героя.' },
          { title: '30 секунд завершення', body: 'Повторіть фінальну фразу й не запускайте нову історію автоматично.' },
        ],
      },
      en: {
        eyebrow: 'Formula',
        heading: 'How WonderTales turns a story into a short route',
        intro: 'When time is limited, WonderTales does not rush the child; it reduces decisions to a simple route.',
        steps: [
          { title: '30 seconds to choose', body: 'Offer two themes or heroes. Do not open every possibility.' },
          { title: '3 minutes of story', body: 'One scene, one obstacle, one small win.' },
          { title: '1 minute to talk', body: 'Ask for a favorite detail or the hero’s feeling.' },
          { title: '30 seconds to close', body: 'Repeat the closing phrase and do not autoplay a new story.' },
        ],
      },
      ru: {
        eyebrow: 'Формула',
        heading: 'Как WonderTales укладывает историю в короткий маршрут',
        intro: 'Когда времени мало, WonderTales не торопит ребенка, а сокращает количество решений до простого маршрута.',
        steps: [
          { title: '30 секунд на выбор', body: 'Дайте два варианта темы или героя. Не открывайте все возможности сразу.' },
          { title: '3 минуты истории', body: 'Одна сцена, одно препятствие, одна маленькая победа.' },
          { title: '1 минута разговора', body: 'Попросите назвать любимую деталь или чувство героя.' },
          { title: '30 секунд завершения', body: 'Повторите финальную фразу и не запускайте новую историю автоматически.' },
        ],
      },
      es: {
        eyebrow: 'Fórmula',
        heading: 'Cómo WonderTales convierte la historia en una ruta breve',
        intro: 'Cuando hay poco tiempo, WonderTales no apura al niño; reduce las decisiones a una ruta simple.',
        steps: [
          { title: '30 segundos para elegir', body: 'Ofrece dos temas o héroes. No abras todas las posibilidades.' },
          { title: '3 minutos de historia', body: 'Una escena, un obstáculo, una pequeña victoria.' },
          { title: '1 minuto para hablar', body: 'Pregunta por un detalle favorito o la emoción del héroe.' },
          { title: '30 segundos para cerrar', body: 'Repite la frase final y no inicies otra historia automáticamente.' },
        ],
      },
      de: {
        eyebrow: 'Formel',
        heading: 'Wie WonderTales eine kurze Route baut',
        intro: 'Bei wenig Zeit hetzt WonderTales das Kind nicht, sondern reduziert Entscheidungen auf eine einfache Route.',
        steps: [
          { title: '30 Sekunden wählen', body: 'Gib zwei Themen oder Figuren. Nicht alle Möglichkeiten öffnen.' },
          { title: '3 Minuten Geschichte', body: 'Eine Szene, ein Hindernis, ein kleiner Erfolg.' },
          { title: '1 Minute Gespräch', body: 'Frage nach Lieblingsdetail oder Gefühl der Figur.' },
          { title: '30 Sekunden Abschluss', body: 'Schlusssatz wiederholen und keine neue Geschichte automatisch starten.' },
        ],
      },
      fr: {
        eyebrow: 'Formule',
        heading: 'Comment WonderTales crée un chemin court',
        intro: 'Quand le temps manque, WonderTales ne presse pas l’enfant : il réduit les décisions à un chemin simple.',
        steps: [
          { title: '30 secondes pour choisir', body: 'Proposez deux thèmes ou héros. N’ouvrez pas toutes les options.' },
          { title: '3 minutes d’histoire', body: 'Une scène, un obstacle, une petite victoire.' },
          { title: '1 minute de conversation', body: 'Demandez le détail préféré ou l’émotion du héros.' },
          { title: '30 secondes pour finir', body: 'Répétez la phrase finale et ne lancez pas une autre histoire.' },
        ],
      },
      pl: {
        eyebrow: 'Formuła',
        heading: 'Jak WonderTales buduje krótką ścieżkę',
        intro: 'Gdy czasu jest mało, WonderTales nie pogania dziecka, tylko ogranicza decyzje do prostego toru.',
        steps: [
          { title: '30 sekund wyboru', body: 'Daj dwa tematy albo bohaterów. Nie otwieraj wszystkich możliwości.' },
          { title: '3 minuty historii', body: 'Jedna scena, jedna przeszkoda, jedno małe zwycięstwo.' },
          { title: '1 minuta rozmowy', body: 'Zapytaj o ulubiony detal albo uczucie bohatera.' },
          { title: '30 sekund końca', body: 'Powtórz zdanie końcowe i nie uruchamiaj kolejnej historii automatycznie.' },
        ],
      },
    },
  },
  {
    slug: 'story-morals-without-lecturing',
    heroImage: '/landing/blog/story-morals-without-lecturing-scene-01.webp',
    updatedAt: '2026-06-18',
    category: { uk: 'Мораль історії', en: 'Story morals', ru: 'Мораль истории', es: 'Moralejas', de: 'Moral der Geschichte', fr: 'Morale de l’histoire', pl: 'Morał historii' },
    title: {
      uk: 'Мораль історії без моралізаторства: дружба, терпіння, сила волі',
      en: 'Story morals without lecturing: friendship, patience, willpower',
      ru: 'Мораль истории без морализаторства: дружба, терпение, сила воли',
      es: 'Moralejas sin sermones: amistad, paciencia y fuerza de voluntad',
      de: 'Moral ohne Predigt: Freundschaft, Geduld und Willenskraft',
      fr: 'Une morale sans sermon : amitié, patience et volonté',
      pl: 'Morał bez kazania: przyjaźń, cierpliwość i siła woli',
    },
    description: {
      uk: 'Як говорити про цінності через вибір героя і наслідки, а не через лекцію в кінці.',
      en: 'How to speak about values through a hero’s choices and consequences, not a lecture at the end.',
      ru: 'Как говорить о ценностях через выбор героя и последствия, а не лекцию в конце.',
      es: 'Cómo hablar de valores mediante decisiones y consecuencias, no con un sermón final.',
      de: 'Wie Werte über Entscheidungen und Folgen erzählt werden, nicht über eine Predigt am Ende.',
      fr: 'Comment parler de valeurs par les choix et conséquences du héros, pas par une leçon finale.',
      pl: 'Jak mówić o wartościach przez wybory i konsekwencje bohatera, nie kazanie na końcu.',
    },
    lead: {
      uk: 'Дитині не завжди потрібне пояснення “як правильно”. Часто сильніше працює історія, де герой сам обирає, помиляється, бачить наслідок і знаходить м’якший спосіб діяти.',
      en: 'A child does not always need a final explanation of “the right thing.” Often the stronger story lets a hero choose, make a mistake, notice the consequence, and try a gentler way.',
      ru: 'Ребенку не всегда нужно финальное объяснение “как правильно”. Часто сильнее работает история, где герой выбирает, ошибается, замечает последствия и пробует более мягкий способ.',
      es: 'Un niño no siempre necesita una explicación final sobre “lo correcto”. A menudo funciona mejor que el héroe elija, se equivoque, note la consecuencia y pruebe una forma más amable.',
      de: 'Ein Kind braucht nicht immer eine abschließende Erklärung, was “richtig” ist. Oft wirkt eine Geschichte stärker, wenn die Figur wählt, scheitert, Folgen bemerkt und einen weicheren Weg versucht.',
      fr: 'Un enfant n’a pas toujours besoin d’une explication finale sur “ce qui est bien”. L’histoire agit souvent mieux quand le héros choisit, se trompe, voit la conséquence et essaie autrement.',
      pl: 'Dziecko nie zawsze potrzebuje końcowego wyjaśnienia, “co jest właściwe”. Często mocniej działa historia, w której bohater wybiera, myli się, widzi skutek i próbuje łagodniejszej drogi.',
    },
    focus: {
      uk: [
        'Діти швидко відчувають, коли історія починає виховувати. У цей момент увага зміщується з героя на дорослий висновок, і цінність може прозвучати як зовнішня вимога. Набагато краще, коли дружба, терпіння або сміливість з’являються як жива проблема всередині сюжету.',
        'У підходах соціально-емоційного навчання цінності описують як навички: помітити емоцію, керувати імпульсом, побачити іншу людину, підтримати стосунок, прийняти відповідальне рішення. Для історії це означає не “будь добрим”, а “герой помітив, що другові страшно, і вирішив залишитися поруч”.',
      ],
      en: [
        'Children quickly notice when a story turns into instruction. At that moment attention shifts away from the hero and toward the adult’s conclusion, so the value can feel like an outside demand. It works better when friendship, patience, or courage appears as a living problem inside the plot.',
        'Social-emotional learning describes values as skills: noticing emotions, managing impulses, seeing another person’s perspective, maintaining relationships, and making responsible decisions. For a story, that means not “be kind,” but “the hero noticed their friend was scared and chose to stay close.”',
      ],
      ru: [
        'Дети быстро чувствуют, когда история начинает воспитывать. В этот момент внимание уходит от героя к взрослому выводу, а ценность звучит как внешнее требование. Гораздо лучше, когда дружба, терпение или смелость появляются как живая проблема внутри сюжета.',
        'В подходах социально-эмоционального обучения ценности описывают как навыки: заметить эмоцию, управлять импульсом, увидеть точку зрения другого, поддержать отношения, принять ответственное решение. Для истории это значит не “будь добрым”, а “герой заметил, что другу страшно, и решил остаться рядом”.',
      ],
      es: [
        'Los niños notan rápido cuando una historia se convierte en instrucción. En ese momento la atención deja al héroe y se fija en la conclusión adulta, y el valor puede sentirse como una exigencia externa. Funciona mejor cuando amistad, paciencia o valentía aparecen como un problema vivo dentro de la trama.',
        'El aprendizaje socioemocional describe los valores como habilidades: notar emociones, regular impulsos, ver la perspectiva de otra persona, cuidar relaciones y tomar decisiones responsables. En una historia, eso no significa “sé amable”, sino “el héroe notó que su amigo tenía miedo y decidió quedarse cerca”.',
      ],
      de: [
        'Kinder merken schnell, wenn eine Geschichte zur Belehrung wird. Dann wandert die Aufmerksamkeit von der Figur zum erwachsenen Schluss, und der Wert fühlt sich wie eine Forderung von außen an. Besser wirkt es, wenn Freundschaft, Geduld oder Mut als echtes Problem in der Handlung auftauchen.',
        'Sozial-emotionales Lernen beschreibt Werte als Fähigkeiten: Gefühle bemerken, Impulse steuern, eine andere Perspektive sehen, Beziehungen halten und verantwortliche Entscheidungen treffen. Für eine Geschichte heißt das nicht “sei nett”, sondern “die Figur merkte, dass ihr Freund Angst hatte, und blieb bei ihm”.',
      ],
      fr: [
        'Les enfants sentent vite quand une histoire devient une leçon. L’attention quitte alors le héros pour se fixer sur la conclusion adulte, et la valeur peut devenir une exigence extérieure. Cela fonctionne mieux quand l’amitié, la patience ou le courage apparaissent comme un vrai problème dans l’intrigue.',
        'L’apprentissage socio-émotionnel décrit les valeurs comme des compétences : reconnaître une émotion, réguler une impulsion, comprendre un autre point de vue, entretenir une relation et prendre une décision responsable. Dans une histoire, cela veut dire non pas “sois gentil”, mais “le héros a vu que son ami avait peur et a choisi de rester”.',
      ],
      pl: [
        'Dzieci szybko czują, kiedy historia zamienia się w pouczenie. Wtedy uwaga odchodzi od bohatera i skupia się na dorosłym wniosku, a wartość brzmi jak zewnętrzny nakaz. Lepiej działa sytuacja, w której przyjaźń, cierpliwość albo odwaga są żywym problemem w fabule.',
        'Uczenie społeczno-emocjonalne opisuje wartości jako umiejętności: zauważenie emocji, opanowanie impulsu, zobaczenie perspektywy drugiej osoby, podtrzymanie relacji i podjęcie odpowiedzialnej decyzji. W historii oznacza to nie “bądź miły”, lecz “bohater zauważył, że przyjaciel się boi, i postanowił zostać blisko”.',
      ],
    },
    research: {
      uk: [
        'CASEL, одна з головних організацій у сфері social-emotional learning, виділяє п’ять пов’язаних груп навичок: самосвідомість, самокерування, соціальну обізнаність, навички стосунків і відповідальне прийняття рішень. Це корисна рамка для історій: мораль не повинна висіти окремо, вона може проявлятися через емоцію героя, його вибір і те, як цей вибір впливає на інших.',
        'Великий метааналіз Durlak, Weissberg та колег охопив 213 шкільних SEL-програм і понад 270 тисяч учнів. Він показав поліпшення соціально-емоційних навичок, поведінки й академічних результатів у групах, де ці навички тренували системно. Домашня історія не є формальною програмою SEL, але вона може підтримувати ту саму логіку: коротка ситуація, названа емоція, наслідок і спокійна розмова після читання.',
        'Harvard Center on the Developing Child описує “serve and return” як чутливий обмін між дитиною і дорослим: дитина подає сигнал, дорослий помічає, відповідає і повертає увагу назад. Після історії це може бути дуже простим: дитина сміється з героя, сердиться на персонажа або питає “чому він так зробив?”, а дорослий не читає мораль, а підхоплює цю реакцію.',
        'NAEYC радить використовувати читання вголос, щоб вводити словник емоцій і пов’язувати почуття персонажів із життям дитини. Тому питання “що він відчув?” часто продуктивніше за “який висновок ти зробив?”. Воно відкриває розмову, а не перевірку.',
      ],
      en: [
        'CASEL, one of the central organizations in social-emotional learning, describes five connected areas of competence: self-awareness, self-management, social awareness, relationship skills, and responsible decision-making. That is a useful frame for stories: a moral does not have to sit apart from the plot; it can appear through the hero’s feeling, choice, and effect on others.',
        'A large meta-analysis by Durlak, Weissberg, and colleagues reviewed 213 school-based SEL programs with more than 270,000 students. It found improvements in social-emotional skills, behavior, and academic outcomes when these skills were taught systematically. A home story is not a formal SEL program, but it can support the same logic: a short situation, a named emotion, a consequence, and a calm conversation afterward.',
        'The Harvard Center on the Developing Child describes “serve and return” as a responsive exchange between a child and adult: the child offers a signal, the adult notices, responds, and returns attention. After a story, this can be simple: a child laughs at a hero, gets angry at a character, or asks “why did they do that?”, and the adult follows the reaction instead of turning it into a lecture.',
        'NAEYC recommends read-alouds as a way to introduce emotion vocabulary and connect characters’ feelings to a child’s world. That is why “what did the hero feel?” is often more useful than “what lesson did you learn?” It opens conversation instead of checking for compliance.',
      ],
      ru: [
        'CASEL, одна из ключевых организаций в сфере social-emotional learning, выделяет пять связанных групп навыков: самосознание, саморегуляцию, социальную осознанность, навыки отношений и ответственное принятие решений. Для историй это удобная рамка: мораль не должна висеть отдельно от сюжета, она может проявляться через чувство героя, его выбор и влияние этого выбора на других.',
        'Крупный метаанализ Durlak, Weissberg и коллег охватил 213 школьных SEL-программ и более 270 тысяч учеников. В группах, где эти навыки развивали системно, улучшались социально-эмоциональные навыки, поведение и академические результаты. Домашняя история не является формальной SEL-программой, но может поддерживать ту же логику: короткая ситуация, названная эмоция, последствие и спокойный разговор после чтения.',
        'Harvard Center on the Developing Child описывает “serve and return” как чуткий обмен между ребенком и взрослым: ребенок подает сигнал, взрослый замечает, отвечает и возвращает внимание. После истории это может быть очень просто: ребенок смеется над героем, сердится на персонажа или спрашивает “почему он так сделал?”, а взрослый не читает мораль, а подхватывает реакцию.',
        'NAEYC рекомендует использовать чтение вслух, чтобы вводить словарь эмоций и связывать чувства персонажей с опытом ребенка. Поэтому вопрос “что он почувствовал?” часто полезнее, чем “какой вывод ты сделал?”. Он открывает разговор, а не проверку.',
      ],
      es: [
        'CASEL, una de las organizaciones centrales en aprendizaje socioemocional, describe cinco áreas conectadas: autoconciencia, autocontrol, conciencia social, habilidades de relación y toma responsable de decisiones. Es una buena guía para historias: la moraleja no tiene que estar separada de la trama; puede aparecer en lo que siente el héroe, en lo que elige y en cómo afecta a otros.',
        'Un gran metaanálisis de Durlak, Weissberg y colegas revisó 213 programas escolares de SEL con más de 270.000 estudiantes. Encontró mejoras en habilidades socioemocionales, conducta y resultados académicos cuando estas habilidades se trabajaban de forma sistemática. Una historia en casa no es un programa formal, pero puede seguir la misma lógica: una situación breve, una emoción nombrada, una consecuencia y una conversación tranquila después.',
        'El Harvard Center on the Developing Child describe “serve and return” como un intercambio sensible entre niño y adulto: el niño da una señal, el adulto la nota, responde y devuelve la atención. Después de una historia puede ser simple: el niño se ríe del héroe, se enfada con un personaje o pregunta “¿por qué hizo eso?”, y el adulto sigue esa reacción en vez de convertirla en sermón.',
        'NAEYC recomienda las lecturas en voz alta para introducir vocabulario emocional y conectar los sentimientos de los personajes con el mundo del niño. Por eso “¿qué sintió el héroe?” suele ser más útil que “¿qué enseñanza aprendiste?”. Abre conversación, no examen.',
      ],
      de: [
        'CASEL, eine zentrale Organisation für sozial-emotionales Lernen, beschreibt fünf verbundene Kompetenzbereiche: Selbstwahrnehmung, Selbstmanagement, soziales Bewusstsein, Beziehungsfähigkeiten und verantwortungsvolle Entscheidungen. Für Geschichten ist das hilfreich: Moral muss nicht getrennt von der Handlung stehen, sondern kann durch Gefühl, Entscheidung und Wirkung auf andere sichtbar werden.',
        'Eine große Meta-Analyse von Durlak, Weissberg und Kolleginnen und Kollegen untersuchte 213 schulische SEL-Programme mit mehr als 270.000 Schülerinnen und Schülern. Sie fand Verbesserungen bei sozial-emotionalen Kompetenzen, Verhalten und schulischen Ergebnissen, wenn diese Fähigkeiten systematisch geübt wurden. Eine Geschichte zu Hause ist kein formales SEL-Programm, kann aber dieselbe Logik unterstützen: kurze Situation, benanntes Gefühl, Folge und ruhiges Gespräch danach.',
        'Das Harvard Center on the Developing Child beschreibt “serve and return” als feinfühligen Austausch zwischen Kind und Erwachsenem: Das Kind sendet ein Signal, der Erwachsene bemerkt es, antwortet und gibt Aufmerksamkeit zurück. Nach einer Geschichte kann das einfach sein: Das Kind lacht über die Figur, ärgert sich über eine Person oder fragt “warum hat sie das getan?”, und der Erwachsene folgt der Reaktion statt zu predigen.',
        'NAEYC empfiehlt Vorlesen, um Emotionswörter einzuführen und Gefühle von Figuren mit der Welt des Kindes zu verbinden. Darum ist “Was hat die Figur gefühlt?” oft hilfreicher als “Welche Lehre hast du gelernt?”. Es öffnet ein Gespräch, keine Prüfung.',
      ],
      fr: [
        'CASEL, une organisation de référence en apprentissage socio-émotionnel, décrit cinq domaines liés : conscience de soi, autorégulation, conscience sociale, compétences relationnelles et décisions responsables. C’est un bon cadre pour les histoires : la morale n’a pas besoin d’être séparée de l’intrigue; elle peut apparaître dans l’émotion du héros, son choix et l’effet de ce choix sur les autres.',
        'Une grande méta-analyse de Durlak, Weissberg et leurs collègues a examiné 213 programmes scolaires de SEL avec plus de 270 000 élèves. Elle a montré des améliorations des compétences socio-émotionnelles, du comportement et des résultats scolaires lorsque ces compétences étaient travaillées de façon structurée. Une histoire à la maison n’est pas un programme formel, mais elle peut suivre la même logique : une situation courte, une émotion nommée, une conséquence et une conversation calme ensuite.',
        'Le Harvard Center on the Developing Child décrit le “serve and return” comme un échange sensible entre l’enfant et l’adulte : l’enfant envoie un signal, l’adulte le remarque, répond et renvoie l’attention. Après une histoire, cela peut être simple : l’enfant rit d’un héros, s’énerve contre un personnage ou demande “pourquoi a-t-il fait ça ?”, et l’adulte suit cette réaction au lieu de faire la morale.',
        'NAEYC recommande la lecture à voix haute pour introduire le vocabulaire des émotions et relier les sentiments des personnages au monde de l’enfant. C’est pourquoi “qu’a ressenti le héros ?” est souvent plus utile que “quelle leçon as-tu apprise ?”. Cela ouvre une conversation, pas un contrôle.',
      ],
      pl: [
        'CASEL, jedna z najważniejszych organizacji zajmujących się uczeniem społeczno-emocjonalnym, opisuje pięć powiązanych obszarów: samoświadomość, samoregulację, świadomość społeczną, umiejętności relacyjne i odpowiedzialne podejmowanie decyzji. To dobra rama dla historii: morał nie musi wisieć obok fabuły, może pojawić się w emocji bohatera, jego wyborze i wpływie na innych.',
        'Duża metaanaliza Durlaka, Weissberga i współautorów objęła 213 szkolnych programów SEL i ponad 270 tysięcy uczniów. Pokazała poprawę umiejętności społeczno-emocjonalnych, zachowania i wyników szkolnych, gdy takie umiejętności były ćwiczone systematycznie. Domowa historia nie jest formalnym programem SEL, ale może wspierać tę samą logikę: krótka sytuacja, nazwana emocja, skutek i spokojna rozmowa po czytaniu.',
        'Harvard Center on the Developing Child opisuje “serve and return” jako uważną wymianę między dzieckiem a dorosłym: dziecko daje sygnał, dorosły go zauważa, odpowiada i oddaje uwagę. Po historii może to być bardzo proste: dziecko śmieje się z bohatera, złości się na postać albo pyta “dlaczego on tak zrobił?”, a dorosły podąża za reakcją zamiast wygłaszać morał.',
        'NAEYC poleca czytanie na głos jako sposób wprowadzania słownictwa emocji i łączenia uczuć postaci ze światem dziecka. Dlatego pytanie “co poczuł bohater?” bywa bardziej pomocne niż “jaka była nauka?”. Otwiera rozmowę, a nie sprawdzian.',
      ],
    },
    storyUse: {
      uk: [
        'Коли у WonderTales обрана мораль історії, застосунок не починає з її назви, а показує цінність через мікроконфлікт. Якщо тема — дружба, герой може мати шанс швидко дістатися скарбу сам, але помічає, що друг застряг позаду. Якщо тема — терпіння, перша спроба не ламає героя, а підказує, що треба змінити рух.',
        'У WonderTales можна обрати мораль історії на кшталт дружби, терпіння, сміливості, емпатії або відповідальності. Найкраще працює, коли ця мораль стає не підписом до історії, а прихованим двигуном сцени: що герой хоче, що йому заважає, кого він помічає поруч і яку маленьку ціну має його вибір.',
        'Після читання не обов’язково питати “чого навчила історія?”. Краще почати з персонажа: “що герой хотів?”, “коли йому стало важко?”, “хто помітив його зміну?”. Так дитина може говорити про цінність через безпечну дистанцію, а не відчувати, що її саму оцінюють.',
      ],
      en: [
        'When a moral is selected in WonderTales, the app does not begin with the value’s name. It shows the value through a small conflict. If the value is friendship, the hero might be able to reach the treasure faster alone, then notice a friend stuck behind. If the value is patience, the first failed attempt does not defeat the hero; it shows what needs to change.',
        'In WonderTales, a story moral can be selected, such as friendship, patience, courage, empathy, or responsibility. It works best when that moral becomes the hidden engine of the scene: what the hero wants, what blocks them, who they notice nearby, and what small cost their choice carries.',
        'After reading, you do not have to ask “what did this story teach you?” It is often better to begin with the character: “what did the hero want?”, “when did it get hard?”, “who noticed the change?”. The child can talk about values at a safe distance instead of feeling personally judged.',
      ],
      ru: [
        'Когда в WonderTales выбрана мораль истории, приложение не начинает с ее названия. Оно показывает ценность через маленький конфликт. Если тема — дружба, герой может быстрее добраться до сокровища один, но замечает, что друг застрял позади. Если тема — терпение, первая неудачная попытка не ломает героя, а показывает, что нужно изменить.',
        'В WonderTales можно выбрать мораль истории: дружбу, терпение, смелость, эмпатию или ответственность. Лучше всего работает, когда эта мораль становится не подписью к истории, а скрытым двигателем сцены: чего хочет герой, что ему мешает, кого он замечает рядом и какую маленькую цену несет его выбор.',
        'После чтения не обязательно спрашивать “чему научила история?”. Часто лучше начать с персонажа: “чего хотел герой?”, “когда ему стало трудно?”, “кто заметил его изменение?”. Так ребенок говорит о ценности через безопасную дистанцию, а не чувствует, что оценивают его самого.',
      ],
      es: [
        'Cuando se elige una moraleja en WonderTales, la app no empieza con el nombre del valor. Lo muestra mediante un conflicto pequeño. Si el valor es la amistad, el héroe puede llegar más rápido al tesoro solo, pero nota que un amigo se quedó atrás. Si el valor es la paciencia, el primer intento fallido no derrota al héroe; le muestra qué cambiar.',
        'En WonderTales se puede elegir una moraleja como amistad, paciencia, valentía, empatía o responsabilidad. Funciona mejor cuando esa moraleja no es una etiqueta, sino el motor oculto de la escena: qué quiere el héroe, qué lo bloquea, a quién nota cerca y qué pequeño coste tiene su elección.',
        'Después de leer, no hace falta preguntar “¿qué te enseñó la historia?”. Suele ser mejor empezar por el personaje: “¿qué quería?”, “¿cuándo se puso difícil?”, “¿quién notó su cambio?”. El niño puede hablar del valor con distancia segura, sin sentirse juzgado.',
      ],
      de: [
        'Wenn in WonderTales eine Moral gewählt ist, beginnt die App nicht mit dem Namen des Werts. Sie zeigt ihn über einen kleinen Konflikt. Wenn es um Freundschaft geht, könnte die Figur den Schatz allein schneller erreichen, bemerkt aber, dass ein Freund zurückbleibt. Wenn es um Geduld geht, zerstört der erste Fehlversuch die Figur nicht, sondern zeigt, was sie ändern kann.',
        'In WonderTales kann eine Moral wie Freundschaft, Geduld, Mut, Empathie oder Verantwortung gewählt werden. Am besten wirkt sie, wenn sie nicht als Etikett an der Geschichte hängt, sondern die Szene antreibt: Was will die Figur, was hält sie auf, wen bemerkt sie, und welchen kleinen Preis hat ihre Entscheidung?',
        'Nach dem Lesen muss die Frage nicht lauten: “Was hast du gelernt?” Oft ist es besser, bei der Figur zu beginnen: “Was wollte sie?”, “Wann wurde es schwer?”, “Wer bemerkte die Veränderung?”. So kann das Kind über Werte sprechen, ohne sich bewertet zu fühlen.',
      ],
      fr: [
        'Quand une morale est choisie dans WonderTales, l’application ne commence pas par le nom de la valeur. Elle la montre à travers un petit conflit. Si le thème est l’amitié, le héros peut atteindre le trésor plus vite seul, mais remarque qu’un ami est resté coincé derrière. Si le thème est la patience, le premier échec ne détruit pas le héros; il montre ce qu’il faut ajuster.',
        'Dans WonderTales, on peut choisir une morale comme l’amitié, la patience, le courage, l’empathie ou la responsabilité. Elle fonctionne mieux quand elle n’est pas une étiquette, mais le moteur caché de la scène : ce que veut le héros, ce qui le bloque, qui il remarque autour de lui et quel petit coût porte son choix.',
        'Après la lecture, il n’est pas nécessaire de demander “qu’est-ce que l’histoire t’a appris ?”. Il vaut mieux partir du personnage : “que voulait-il ?”, “quand est-ce devenu difficile ?”, “qui a remarqué son changement ?”. L’enfant peut parler de la valeur avec une distance sûre, sans se sentir jugé.',
      ],
      pl: [
        'Gdy w WonderTales wybrany jest morał historii, aplikacja nie zaczyna od nazwy wartości. Pokazuje ją przez mały konflikt. Jeśli tematem jest przyjaźń, bohater może szybciej dotrzeć do skarbu sam, ale zauważa, że przyjaciel utknął z tyłu. Jeśli tematem jest cierpliwość, pierwsza nieudana próba nie łamie bohatera, tylko pokazuje, co można zmienić.',
        'W WonderTales można wybrać morał historii, na przykład przyjaźń, cierpliwość, odwagę, empatię albo odpowiedzialność. Najlepiej działa wtedy, gdy nie jest podpisem pod historią, lecz ukrytym silnikiem sceny: czego chce bohater, co go blokuje, kogo zauważa obok i jaki mały koszt niesie jego wybór.',
        'Po czytaniu nie trzeba pytać “czego nauczyła cię ta historia?”. Często lepiej zacząć od postaci: “czego chciał bohater?”, “kiedy zrobiło się trudno?”, “kto zauważył jego zmianę?”. Dziecko może rozmawiać o wartości z bezpiecznego dystansu, bez poczucia, że samo jest oceniane.',
      ],
    },
    adjustment: {
      uk: [
        'Якщо мораль звучить як лекція, приберіть останній висновок. Нехай фінальна дія героя сама покаже зміну: він повернувся, дочекався, вибачився, поділився або спробував ще раз.',
        'Якщо дитина закочує очі, перебиває або каже “я знаю”, можливо, історія надто прямо називає правильну відповідь. Спробуйте зробити конфлікт меншим і ближчим до життя: не “врятувати світ завдяки дружбі”, а “почекати сестру біля дверей, хоча дуже хочеться бігти першим”.',
        'Для старших дітей залишайте трохи моральної неоднозначності. Хороший герой може хотіти дві речі одночасно: перемогти й не образити друга, бути сміливим і все одно боятися, сказати правду й переживати за наслідки. Саме там з’являється змістовна розмова.',
      ],
      en: [
        'If the moral sounds like a lecture, remove the final explanation. Let the hero’s last action show the change: they came back, waited, apologized, shared, or tried again.',
        'If a child rolls their eyes, interrupts, or says “I know,” the story may be naming the right answer too directly. Make the conflict smaller and closer to life: not “save the world through friendship,” but “wait for a sister at the door even though you want to run first.”',
        'For older children, leave a little moral complexity. A good hero can want two things at once: to win and not hurt a friend, to be brave and still feel afraid, to tell the truth and worry about consequences. That is where a real conversation begins.',
      ],
      ru: [
        'Если мораль звучит как лекция, уберите финальное объяснение. Пусть последний поступок героя сам покажет изменение: он вернулся, подождал, извинился, поделился или попробовал еще раз.',
        'Если ребенок закатывает глаза, перебивает или говорит “я знаю”, возможно, история слишком прямо называет правильный ответ. Сделайте конфликт меньше и ближе к жизни: не “спасти мир благодаря дружбе”, а “подождать сестру у двери, хотя очень хочется побежать первым”.',
        'Для детей постарше оставляйте немного моральной неоднозначности. Хороший герой может хотеть две вещи одновременно: победить и не обидеть друга, быть смелым и все равно бояться, сказать правду и переживать о последствиях. Именно там начинается содержательный разговор.',
      ],
      es: [
        'Si la moraleja suena a sermón, elimina la explicación final. Deja que la última acción del héroe muestre el cambio: volvió, esperó, pidió perdón, compartió o lo intentó otra vez.',
        'Si el niño pone los ojos en blanco, interrumpe o dice “ya lo sé”, quizá la historia nombra la respuesta correcta de forma demasiado directa. Haz el conflicto más pequeño y cercano: no “salvar el mundo con amistad”, sino “esperar a la hermana en la puerta aunque quiera correr primero”.',
        'Para niños mayores, deja algo de complejidad moral. Un buen héroe puede querer dos cosas a la vez: ganar y no herir a un amigo, ser valiente y seguir teniendo miedo, decir la verdad y preocuparse por las consecuencias. Ahí empieza una conversación real.',
      ],
      de: [
        'Wenn die Moral wie eine Predigt klingt, streiche die letzte Erklärung. Die letzte Handlung der Figur soll die Veränderung zeigen: zurückkommen, warten, sich entschuldigen, teilen oder es noch einmal versuchen.',
        'Wenn ein Kind die Augen verdreht, unterbricht oder “weiß ich schon” sagt, nennt die Geschichte die richtige Antwort vielleicht zu direkt. Mache den Konflikt kleiner und alltagsnäher: nicht “die Welt durch Freundschaft retten”, sondern “an der Tür auf die Schwester warten, obwohl man zuerst losrennen will”.',
        'Für ältere Kinder darf moralische Komplexität bleiben. Eine gute Figur kann zwei Dinge zugleich wollen: gewinnen und einen Freund nicht verletzen, mutig sein und trotzdem Angst haben, die Wahrheit sagen und Folgen fürchten. Genau dort beginnt ein echtes Gespräch.',
      ],
      fr: [
        'Si la morale ressemble à un sermon, retirez l’explication finale. Laissez le dernier geste du héros montrer le changement : il revient, attend, s’excuse, partage ou essaie encore.',
        'Si l’enfant lève les yeux au ciel, coupe la parole ou dit “je sais”, l’histoire donne peut-être trop directement la bonne réponse. Rendez le conflit plus petit et plus proche : non pas “sauver le monde grâce à l’amitié”, mais “attendre sa sœur à la porte alors qu’on veut partir le premier”.',
        'Pour les enfants plus âgés, gardez un peu de complexité morale. Un bon héros peut vouloir deux choses à la fois : gagner et ne pas blesser un ami, être courageux et avoir peur, dire la vérité et craindre les conséquences. C’est là que commence une vraie discussion.',
      ],
      pl: [
        'Jeśli morał brzmi jak kazanie, usuń końcowe wyjaśnienie. Niech ostatnie działanie bohatera pokaże zmianę: wrócił, poczekał, przeprosił, podzielił się albo spróbował jeszcze raz.',
        'Jeśli dziecko przewraca oczami, przerywa albo mówi “wiem”, historia może zbyt wprost podawać właściwą odpowiedź. Zmniejsz konflikt i przybliż go do życia: nie “ocalić świat dzięki przyjaźni”, lecz “poczekać na siostrę przy drzwiach, choć bardzo chce się pobiec pierwszym”.',
        'Dla starszych dzieci zostaw trochę moralnej złożoności. Dobry bohater może chcieć dwóch rzeczy naraz: wygrać i nie zranić przyjaciela, być odważnym i nadal się bać, powiedzieć prawdę i martwić się skutkami. Tam zaczyna się prawdziwa rozmowa.',
      ],
    },
    checklist: {
      uk: ['У WonderTales оберіть одну цінність для історії.', 'Застосунок перетворює її на вибір героя, а не на фінальну лекцію.', 'Сцена отримує наслідок, який можна спокійно обговорити.', 'Після читання легше говорити про героя, а не оцінювати дитину.'],
      en: ['In WonderTales, choose one value for the story.', 'The app turns it into a hero’s choice, not a final lecture.', 'The scene gets a consequence that can be discussed calmly.', 'After reading, it is easier to talk about the hero instead of evaluating the child.'],
      ru: ['В WonderTales выберите одну ценность для истории.', 'Приложение превращает ее в выбор героя, а не в финальную лекцию.', 'Сцена получает последствие, которое можно спокойно обсудить.', 'После чтения легче говорить о герое, а не оценивать ребенка.'],
      es: ['En WonderTales, elige un valor para la historia.', 'La app lo convierte en una elección del héroe, no en un sermón final.', 'La escena recibe una consecuencia que puede comentarse con calma.', 'Después de leer, es más fácil hablar del héroe sin evaluar al niño.'],
      de: ['In WonderTales wählst du einen Wert für die Geschichte.', 'Die App macht daraus eine Entscheidung der Figur, keine Schlussbelehrung.', 'Die Szene bekommt eine Folge, über die ruhig gesprochen werden kann.', 'Nach dem Lesen geht es leichter um die Figur, nicht um Bewertung des Kindes.'],
      fr: ['Dans WonderTales, choisissez une valeur pour l’histoire.', 'L’application la transforme en choix du héros, pas en leçon finale.', 'La scène reçoit une conséquence dont on peut parler calmement.', 'Après la lecture, il est plus simple de parler du héros que d’évaluer l’enfant.'],
      pl: ['W WonderTales wybierz jedną wartość dla historii.', 'Aplikacja zamienia ją w wybór bohatera, nie w końcowe kazanie.', 'Scena dostaje skutek, o którym można spokojnie porozmawiać.', 'Po czytaniu łatwiej mówić o bohaterze, zamiast oceniać dziecko.'],
    },
    quote: {
      text: {
        uk: 'Емоції мають значення для уваги, пам’яті й навчання.',
        en: 'Emotions matter for attention, memory, and learning.',
        ru: 'Эмоции важны для внимания, памяти и обучения.',
        es: 'Las emociones importan para la atención, la memoria y el aprendizaje.',
        de: 'Emotionen sind wichtig für Aufmerksamkeit, Gedächtnis und Lernen.',
        fr: 'Les émotions comptent pour l’attention, la mémoire et l’apprentissage.',
        pl: 'Emocje mają znaczenie dla uwagi, pamięci i uczenia się.',
      },
      attribution: 'Marc Brackett',
      sourceLabel: 'Yale Center for Emotional Intelligence',
      sourceUrl: 'https://www.ascd.org/el/articles/emotions-matter',
    },
    sources: [
      { label: 'Marc Brackett: Emotions Matter', url: 'https://www.ascd.org/el/articles/emotions-matter' },
      { label: 'CASEL Framework', url: 'https://casel.org/fundamentals-of-sel/what-is-the-casel-framework/' },
      { label: 'Durlak et al. SEL meta-analysis', url: 'https://files.casel.org/impact-enhancing-students-social-emotional-learning-meta-analysis-school-based-universal-interventions.pdf' },
      { label: 'Harvard Center on the Developing Child: Serve and Return', url: 'https://developingchild.harvard.edu/key-concept/serve-and-return/' },
      { label: 'NAEYC: Teaching Emotional Intelligence in Early Childhood', url: 'https://www.naeyc.org/resources/pubs/yc/mar2017/teaching-emotional-intelligence' },
    ],
    visualDirection: 'A hero at a fork in a glowing path, with friendship, patience, and courage represented as small story charms.',
    relatedSlugs: ['personalized-childrens-stories', 'reading-without-pressure'],
    inlineImages: articleInlineImages(
      'story-morals-without-lecturing',
      l10n(
        'Дитина і дорослий спокійно будують місток із кубиків поруч із планшетом',
        'A child and parent calmly rebuild a block bridge beside a tablet',
        'Ребенок и взрослый спокойно строят мостик из кубиков рядом с планшетом',
        'Un niño y un adulto reconstruyen con calma un puente de bloques junto a una tableta',
        'Ein Kind und ein Elternteil bauen neben einem Tablet ruhig eine Klötzchenbrücke neu',
        'Un enfant et un parent reconstruisent calmement un pont de cubes près d’une tablette',
        'Dziecko i rodzic spokojnie odbudowują most z klocków obok tabletu'
      ),
      l10n(
        'Терпіння видно краще через другу спробу, ніж через пояснення, як треба поводитися.',
        'Patience is easier to see through a second try than through an explanation of behavior.',
        'Терпение лучше видно через вторую попытку, чем через объяснение, как нужно себя вести.',
        'La paciencia se ve mejor en un segundo intento que en una explicación de conducta.',
        'Geduld zeigt sich besser im zweiten Versuch als in einer Erklärung richtigen Verhaltens.',
        'La patience se voit mieux dans un second essai que dans une leçon de conduite.',
        'Cierpliwość lepiej widać w drugiej próbie niż w wyjaśnianiu zachowania.'
      ),
      l10n(
        'Дитина і дорослий розмовляють після історії, планшет лежить між подушками',
        'A child and parent talk after the story while a tablet rests between pillows',
        'Ребенок и взрослый разговаривают после истории, а планшет лежит между подушками',
        'Un niño y un adulto conversan después de la historia con una tableta entre cojines',
        'Ein Kind und ein Elternteil sprechen nach der Geschichte, während ein Tablet zwischen Kissen liegt',
        'Un enfant et un parent discutent après l’histoire, une tablette posée entre les coussins',
        'Dziecko i rodzic rozmawiają po historii, a tablet leży między poduszkami'
      ),
      l10n(
        'Питання після сцени залишає місце для власного висновку дитини.',
        'A question after the scene leaves room for the child’s own conclusion.',
        'Вопрос после сцены оставляет место для собственного вывода ребенка.',
        'Una pregunta después de la escena deja espacio para la conclusión del niño.',
        'Eine Frage nach der Szene lässt Raum für die eigene Schlussfolgerung des Kindes.',
        'Une question après la scène laisse de la place à la conclusion de l’enfant.',
        'Pytanie po scenie zostawia miejsce na własny wniosek dziecka.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Не лекція', title: 'Цінність має відбутися в дії', body: 'Дружба переконує краще, коли герой чекає друга, ділиться підказкою або визнає помилку без довгої пояснювальної промови.' },
        { eyebrow: 'Без тиску', title: 'Питання про героя безпечніше', body: '“Що він відчув?” звучить м’якше, ніж “а ти так робиш?” і дає дитині простір думати без захисту.' },
        { eyebrow: 'Розмова', title: 'Мораль живе після історії', body: 'Коротке обговорення емоцій, вибору й наслідків допомагає дитині перенести сюжет у власний досвід.' },
      ],
      en: [
        { eyebrow: 'Not a lecture', title: 'A value needs to happen in action', body: 'Friendship lands better when the hero waits, shares a clue, or admits a mistake without a long explanatory speech.' },
        { eyebrow: 'No pressure', title: 'Questions about the hero feel safer', body: '“What did they feel?” is gentler than “do you do that?” and gives the child space to think without defending themselves.' },
        { eyebrow: 'Conversation', title: 'The moral lives after the story', body: 'A short talk about feeling, choice, and consequence helps the child connect the plot to lived experience.' },
      ],
      ru: [
        { eyebrow: 'Не лекция', title: 'Ценность должна случиться в действии', body: 'Дружба убеждает сильнее, когда герой ждет друга, делится подсказкой или признает ошибку без длинной объясняющей речи.' },
        { eyebrow: 'Без давления', title: 'Вопросы про героя безопаснее', body: '“Что он почувствовал?” мягче, чем “а ты так делаешь?” и оставляет ребенку место подумать без защиты.' },
        { eyebrow: 'Разговор', title: 'Мораль живет после истории', body: 'Короткое обсуждение чувства, выбора и последствий помогает ребенку связать сюжет с собственным опытом.' },
      ],
      es: [
        { eyebrow: 'No sermón', title: 'El valor debe verse en acción', body: 'La amistad convence más cuando el héroe espera, comparte una pista o reconoce un error sin una larga explicación.' },
        { eyebrow: 'Sin presión', title: 'Preguntar por el héroe es más seguro', body: '“¿Qué sintió?” suena más suave que “¿tú haces eso?” y deja espacio para pensar sin defenderse.' },
        { eyebrow: 'Conversación', title: 'La moraleja sigue después', body: 'Una charla breve sobre emoción, elección y consecuencia ayuda a conectar la trama con la experiencia del niño.' },
      ],
      de: [
        { eyebrow: 'Keine Predigt', title: 'Ein Wert muss in Handlung sichtbar werden', body: 'Freundschaft wirkt stärker, wenn die Figur wartet, einen Hinweis teilt oder einen Fehler zugibt, ohne lange Erklärung.' },
        { eyebrow: 'Ohne Druck', title: 'Fragen zur Figur sind sicherer', body: '„Was hat sie gefühlt?“ ist sanfter als „machst du das auch?“ und lässt Raum zum Denken, ohne Abwehr auszulösen.' },
        { eyebrow: 'Gespräch', title: 'Moral lebt nach der Geschichte weiter', body: 'Ein kurzes Gespräch über Gefühl, Entscheidung und Folge verbindet die Handlung mit eigener Erfahrung.' },
      ],
      fr: [
        { eyebrow: 'Pas un sermon', title: 'La valeur doit passer par l’action', body: 'L’amitié touche davantage quand le héros attend, partage un indice ou reconnaît son erreur sans long discours explicatif.' },
        { eyebrow: 'Sans pression', title: 'Parler du héros est plus sûr', body: '“Qu’a-t-il ressenti ?” est plus doux que “tu fais pareil ?” et laisse réfléchir sans se défendre.' },
        { eyebrow: 'Conversation', title: 'La morale continue après l’histoire', body: 'Un bref échange sur l’émotion, le choix et la conséquence aide à relier l’intrigue à l’expérience de l’enfant.' },
      ],
      pl: [
        { eyebrow: 'Nie kazanie', title: 'Wartość musi wydarzyć się w działaniu', body: 'Przyjaźń działa mocniej, gdy bohater czeka, dzieli się wskazówką albo przyznaje do błędu bez długiego wyjaśnienia.' },
        { eyebrow: 'Bez presji', title: 'Pytanie o bohatera jest bezpieczniejsze', body: '„Co poczuł?” brzmi łagodniej niż „czy ty tak robisz?” i zostawia miejsce na myślenie bez obrony.' },
        { eyebrow: 'Rozmowa', title: 'Morał żyje po historii', body: 'Krótka rozmowa o emocji, wyborze i skutku pomaga połączyć fabułę z doświadczeniem dziecka.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Як WonderTales показує мораль без повчання',
        intro: 'WonderTales не додає мораль як висновок дорослого. Цінність заходить у сцену через вибір героя і наслідок, який можна обговорити.',
        columns: ['Цінність', 'Сцена в історії', 'Питання після читання'],
        rows: [
          ['Дружба', 'Герой може виграти сам, але повертається за другом', 'Що стало легшим, коли вони діяли разом?'],
          ['Терпіння', 'Перша спроба не вдається, друга стає уважнішою', 'Що герой помітив під час другої спроби?'],
          ['Сила волі', 'Герой втомився, але робить маленький наступний крок', 'Що допомогло йому не здатися?'],
          ['Емпатія', 'Герой помічає, що інший персонаж мовчить не через злість, а через страх', 'Як він зрозумів, що іншому потрібна підтримка?'],
          ['Відповідальність', 'Герой виправляє наслідок своєї дії', 'Як він зробив ситуацію трохи кращою?'],
        ],
      },
      en: {
        heading: 'How WonderTales shows morals without preaching',
        intro: 'WonderTales does not add the moral as an adult’s final explanation. The value enters the scene through a hero’s choice and a consequence that can be discussed.',
        columns: ['Value', 'Story scene', 'Question after reading'],
        rows: [
          ['Friendship', 'The hero could win alone but returns for a friend', 'What became easier when they worked together?'],
          ['Patience', 'The first try fails; the second becomes more careful', 'What did the hero notice on the second try?'],
          ['Willpower', 'The hero is tired but takes one next step', 'What helped them not give up?'],
          ['Empathy', 'The hero realizes another character is quiet from fear, not anger', 'How did the hero know someone needed support?'],
          ['Responsibility', 'The hero repairs the result of their action', 'How did they make the situation a little better?'],
        ],
      },
      ru: {
        heading: 'Как WonderTales показывает мораль без поучения',
        intro: 'WonderTales не добавляет мораль как вывод взрослого. Ценность входит в сцену через выбор героя и последствие, которое можно обсудить.',
        columns: ['Ценность', 'Сцена в истории', 'Вопрос после чтения'],
        rows: [
          ['Дружба', 'Герой мог победить один, но возвращается за другом', 'Что стало легче, когда они действовали вместе?'],
          ['Терпение', 'Первая попытка не удалась, вторая стала внимательнее', 'Что герой заметил во второй попытке?'],
          ['Сила воли', 'Герой устал, но делает следующий маленький шаг', 'Что помогло ему не сдаться?'],
          ['Эмпатия', 'Герой понимает, что другой персонаж молчит не из злости, а из страха', 'Как он понял, что другому нужна поддержка?'],
          ['Ответственность', 'Герой исправляет последствия своего поступка', 'Как он сделал ситуацию немного лучше?'],
        ],
      },
      es: {
        heading: 'Cómo WonderTales muestra valores sin sermón',
        intro: 'WonderTales no añade la moraleja como explicación adulta final. El valor entra en la escena mediante una elección del héroe y una consecuencia conversable.',
        columns: ['Valor', 'Escena', 'Pregunta después'],
        rows: [
          ['Amistad', 'El héroe podría ganar solo, pero vuelve por un amigo', '¿Qué fue más fácil cuando actuaron juntos?'],
          ['Paciencia', 'El primer intento falla; el segundo es más atento', '¿Qué notó en el segundo intento?'],
          ['Voluntad', 'El héroe está cansado, pero da un paso más', '¿Qué le ayudó a no rendirse?'],
          ['Empatía', 'El héroe entiende que otro personaje calla por miedo, no por enfado', '¿Cómo supo que alguien necesitaba apoyo?'],
          ['Responsabilidad', 'El héroe repara el resultado de su acción', '¿Cómo mejoró un poco la situación?'],
        ],
      },
      de: {
        heading: 'Wie WonderTales Werte ohne Predigt zeigt',
        intro: 'WonderTales fügt Moral nicht als erwachsene Schluss-Erklärung ein. Der Wert kommt über Entscheidung und Folge in die Szene.',
        columns: ['Wert', 'Szene', 'Frage danach'],
        rows: [
          ['Freundschaft', 'Die Figur könnte allein gewinnen, kehrt aber zum Freund zurück', 'Was wurde leichter, als sie zusammen handelten?'],
          ['Geduld', 'Der erste Versuch scheitert, der zweite wird aufmerksamer', 'Was bemerkte die Figur beim zweiten Versuch?'],
          ['Willenskraft', 'Die Figur ist müde, macht aber einen kleinen Schritt weiter', 'Was half, nicht aufzugeben?'],
          ['Empathie', 'Die Figur erkennt, dass jemand aus Angst schweigt, nicht aus Ärger', 'Woran merkte sie, dass Unterstützung nötig war?'],
          ['Verantwortung', 'Die Figur repariert die Folge ihrer Handlung', 'Wie wurde die Situation etwas besser?'],
        ],
      },
      fr: {
        heading: 'Comment WonderTales montre une valeur sans sermon',
        intro: 'WonderTales n’ajoute pas la morale comme explication finale adulte. La valeur entre dans la scène par un choix du héros et une conséquence.',
        columns: ['Valeur', 'Scène', 'Question après'],
        rows: [
          ['Amitié', 'Le héros pourrait gagner seul, mais revient chercher son ami', 'Qu’est-ce qui est devenu plus facile ensemble ?'],
          ['Patience', 'Le premier essai échoue; le second devient plus attentif', 'Qu’a remarqué le héros au second essai ?'],
          ['Volonté', 'Le héros est fatigué, mais fait un petit pas de plus', 'Qu’est-ce qui l’a aidé à continuer ?'],
          ['Empathie', 'Le héros comprend qu’un personnage se tait par peur, pas par colère', 'Comment a-t-il su que quelqu’un avait besoin de soutien ?'],
          ['Responsabilité', 'Le héros répare la conséquence de son action', 'Comment a-t-il amélioré la situation ?'],
        ],
      },
      pl: {
        heading: 'Jak WonderTales pokazuje morał bez pouczania',
        intro: 'WonderTales nie dodaje morału jako końcowego wyjaśnienia dorosłego. Wartość wchodzi w scenę przez wybór bohatera i skutek.',
        columns: ['Wartość', 'Scena', 'Pytanie po czytaniu'],
        rows: [
          ['Przyjaźń', 'Bohater mógłby wygrać sam, ale wraca po przyjaciela', 'Co było łatwiejsze, gdy działali razem?'],
          ['Cierpliwość', 'Pierwsza próba się nie udaje, druga jest uważniejsza', 'Co bohater zauważył za drugim razem?'],
          ['Siła woli', 'Bohater jest zmęczony, ale robi mały następny krok', 'Co pomogło mu się nie poddać?'],
          ['Empatia', 'Bohater rozumie, że ktoś milczy ze strachu, a nie ze złości', 'Skąd wiedział, że ktoś potrzebuje wsparcia?'],
          ['Odpowiedzialność', 'Bohater naprawia skutek swojego działania', 'Jak trochę poprawił sytuację?'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Після історії',
        heading: 'Чотири питання, які не звучать як контроль',
        intro: 'Вони допомагають дитині подумати про цінність, не перетворюючи історію на урок поведінки.',
        steps: [
          { title: 'Що герой хотів?', body: 'Почніть із мотиву, а не з оцінки. Так дитина бачить причину вчинку.' },
          { title: 'Кому стало легше або важче?', body: 'Це переносить увагу на наслідки без звинувачення.' },
          { title: 'Що він міг зробити інакше?', body: 'Питання відкриває альтернативи й тренує моральну уяву.' },
          { title: 'Де була маленька перемога?', body: 'Завершуйте не мораллю, а поміченою зміною героя.' },
        ],
      },
      en: {
        eyebrow: 'After reading',
        heading: 'Four questions that do not feel like control',
        intro: 'They help the child think about values without turning the story into a behavior lesson.',
        steps: [
          { title: 'What did the hero want?', body: 'Begin with motive, not judgment. The child sees why the action happened.' },
          { title: 'Who felt better or worse?', body: 'This shifts attention to consequences without blame.' },
          { title: 'What could they do differently?', body: 'The question opens alternatives and trains moral imagination.' },
          { title: 'Where was the small win?', body: 'End with a noticed change, not a lecture.' },
        ],
      },
      ru: {
        eyebrow: 'После истории',
        heading: 'Четыре вопроса, которые не звучат как контроль',
        intro: 'Они помогают подумать о ценности, не превращая историю в урок поведения.',
        steps: [
          { title: 'Чего хотел герой?', body: 'Начните с мотива, а не с оценки. Так ребенок видит причину поступка.' },
          { title: 'Кому стало легче или тяжелее?', body: 'Это переводит внимание на последствия без обвинения.' },
          { title: 'Что он мог сделать иначе?', body: 'Вопрос открывает альтернативы и тренирует моральное воображение.' },
          { title: 'Где была маленькая победа?', body: 'Завершайте не моралью, а замеченным изменением героя.' },
        ],
      },
      es: {
        eyebrow: 'Después',
        heading: 'Cuatro preguntas que no suenan a control',
        intro: 'Ayudan a pensar en valores sin convertir la historia en clase de conducta.',
        steps: [
          { title: '¿Qué quería el héroe?', body: 'Empieza por el motivo, no por el juicio. El niño ve la razón de la acción.' },
          { title: '¿A quién le fue más fácil o difícil?', body: 'Mueve la atención a las consecuencias sin culpa.' },
          { title: '¿Qué podría hacer distinto?', body: 'Abre alternativas y entrena imaginación moral.' },
          { title: '¿Dónde estuvo la pequeña victoria?', body: 'Termina con un cambio observado, no con una lección.' },
        ],
      },
      de: {
        eyebrow: 'Danach',
        heading: 'Vier Fragen, die nicht nach Kontrolle klingen',
        intro: 'Sie helfen, über Werte nachzudenken, ohne die Geschichte zur Verhaltensstunde zu machen.',
        steps: [
          { title: 'Was wollte die Figur?', body: 'Beginne mit dem Motiv, nicht mit Bewertung. Das Kind sieht den Grund.' },
          { title: 'Für wen wurde es leichter oder schwerer?', body: 'Das lenkt auf Folgen, ohne Schuld zuzuweisen.' },
          { title: 'Was hätte anders gehen können?', body: 'Die Frage öffnet Alternativen und trainiert moralische Vorstellungskraft.' },
          { title: 'Wo war der kleine Erfolg?', body: 'Ende mit einer bemerkten Veränderung, nicht mit Predigt.' },
        ],
      },
      fr: {
        eyebrow: 'Après',
        heading: 'Quatre questions qui ne contrôlent pas',
        intro: 'Elles aident à penser les valeurs sans transformer l’histoire en leçon de conduite.',
        steps: [
          { title: 'Que voulait le héros ?', body: 'Commencez par le motif, pas par le jugement. L’enfant voit la raison.' },
          { title: 'Pour qui est-ce devenu plus facile ou difficile ?', body: 'On parle des conséquences sans accuser.' },
          { title: 'Que pouvait-il faire autrement ?', body: 'La question ouvre des alternatives et l’imagination morale.' },
          { title: 'Où était la petite victoire ?', body: 'Terminez par un changement observé, pas par une morale.' },
        ],
      },
      pl: {
        eyebrow: 'Po historii',
        heading: 'Cztery pytania, które nie brzmią jak kontrola',
        intro: 'Pomagają myśleć o wartościach bez zamiany historii w lekcję zachowania.',
        steps: [
          { title: 'Czego chciał bohater?', body: 'Zacznij od motywu, nie oceny. Dziecko widzi przyczynę działania.' },
          { title: 'Komu było łatwiej albo trudniej?', body: 'To przenosi uwagę na skutki bez obwiniania.' },
          { title: 'Co mógł zrobić inaczej?', body: 'Pytanie otwiera alternatywy i ćwiczy moralną wyobraźnię.' },
          { title: 'Gdzie było małe zwycięstwo?', body: 'Kończ zauważoną zmianą, nie kazaniem.' },
        ],
      },
    },
  },
  {
    slug: 'reading-without-pressure',
    heroImage: '/landing/blog/reading-without-pressure-scene-01.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Читання без тиску', en: 'Reading without pressure', ru: 'Чтение без давления', es: 'Leer sin presión', de: 'Lesen ohne Druck', fr: 'Lire sans pression', pl: 'Czytanie bez presji' },
    title: {
      uk: 'Як підтримати читання без тиску й боротьби',
      en: 'How to support reading without pressure or fights',
      ru: 'Как поддержать чтение без давления и борьбы',
      es: 'Cómo apoyar la lectura sin presión ni peleas',
      de: 'Lesen fördern ohne Druck und Streit',
      fr: 'Soutenir la lecture sans pression ni conflit',
      pl: 'Jak wspierać czytanie bez presji i walki',
    },
    description: {
      uk: 'Як помітити, чому дитина уникає читання, і повернути інтерес через вибір, спільне читання, аудіо, короткі ролі й персональну історію.',
      en: 'How to understand why a child avoids reading and rebuild interest through choice, shared reading, audio, short roles, and personal stories.',
      ru: 'Как понять, почему ребенок избегает чтения, и вернуть интерес через выбор, совместное чтение, аудио, короткие роли и личную историю.',
      es: 'Cómo entender por qué un niño evita leer y reconstruir el interés con elección, lectura compartida, audio, roles breves e historias personales.',
      de: 'Wie man versteht, warum ein Kind Lesen meidet, und Interesse durch Wahl, gemeinsames Lesen, Audio, kurze Rollen und persönliche Geschichten zurückholt.',
      fr: 'Comment comprendre pourquoi un enfant évite de lire et raviver l’intérêt par le choix, la lecture partagée, l’audio, les petits rôles et les histoires personnelles.',
      pl: 'Jak zrozumieć, dlaczego dziecko unika czytania, i odbudować zainteresowanie przez wybór, wspólne czytanie, audio, krótkie role i osobiste historie.',
    },
    lead: {
      uk: 'Коли дитина відсуває книжку, це не завжди “лінь”. Часто вона захищає себе від помилки, нудної теми, надто важкого тексту або ситуації, де дорослий одразу оцінює.',
      en: 'When a child pushes a book away, it is not always “laziness.” Often they are protecting themselves from mistakes, a dull topic, a text that is too hard, or a situation where an adult immediately evaluates.',
      ru: 'Когда ребенок отодвигает книгу, это не всегда “лень”. Часто он защищается от ошибки, скучной темы, слишком трудного текста или ситуации, где взрослый сразу оценивает.',
      es: 'Cuando un niño aparta un libro, no siempre es “pereza”. A menudo se protege del error, de un tema aburrido, de un texto demasiado difícil o de una situación donde el adulto evalúa enseguida.',
      de: 'Wenn ein Kind ein Buch wegschiebt, ist das nicht immer „Faulheit“. Oft schützt es sich vor Fehlern, einem langweiligen Thema, einem zu schweren Text oder sofortiger Bewertung.',
      fr: 'Quand un enfant repousse un livre, ce n’est pas toujours de la “paresse”. Souvent, il se protège de l’erreur, d’un sujet ennuyeux, d’un texte trop difficile ou d’une évaluation immédiate.',
      pl: 'Gdy dziecko odsuwa książkę, to nie zawsze “lenistwo”. Często chroni się przed błędem, nudnym tematem, zbyt trudnym tekstem albo sytuacją, w której dorosły od razu ocenia.',
    },
    focus: {
      uk: [
        'Замість “прочитай сторінку” спробуйте “знайди, що зробить твій герой”. Дитина читає не для оцінки, а щоб отримати відповідь.',
        'Низький тиск не означає відсутність структури. Навпаки, дорослий тримає рамку: короткий епізод, зрозуміла роль, один вибір, завершення до втоми. Дитина отримує контроль усередині безпечних меж.',
        'Найкраща перша мета — не “прочитати більше”, а пережити один успішний момент читання: дочитати репліку, знайти деталь на ілюстрації, передбачити наступний крок героя або впізнати повторювану фразу.',
      ],
      en: [
        'Instead of “read a page,” try “find out what your hero does.” The child reads for an answer, not a grade.',
        'Low pressure does not mean no structure. The adult still holds the frame: a short episode, a clear role, one choice, and a stop before fatigue. The child gets control inside safe boundaries.',
        'The first goal is not “read more.” It is one successful reading moment: finish a line, find a detail in the illustration, predict the hero’s next move, or recognize a repeated phrase.',
      ],
      ru: [
        'Вместо “прочитай страницу” попробуйте “узнай, что сделает твой герой”. Ребенок читает за ответом, а не ради оценки.',
        'Чтение без давления не означает отсутствие структуры. Взрослый держит рамку: короткий эпизод, понятная роль, один выбор и остановка до усталости. Ребенок получает контроль внутри безопасных границ.',
        'Первая цель — не “прочитать больше”, а пережить один успешный момент чтения: дочитать реплику, найти деталь на иллюстрации, предсказать следующий шаг героя или узнать повторяющуюся фразу.',
      ],
      es: [
        'En vez de “lee una página”, prueba “descubre qué hará tu héroe”. El niño lee por una respuesta, no por una nota.',
        'Baja presión no significa ausencia de estructura. El adulto sostiene el marco: episodio corto, rol claro, una elección y cierre antes del cansancio. El niño tiene control dentro de límites seguros.',
        'La primera meta no es “leer más”, sino vivir un momento lector exitoso: terminar una frase, encontrar un detalle, anticipar el siguiente paso del héroe o reconocer una frase repetida.',
      ],
      de: [
        'Statt „lies eine Seite“: „Finde heraus, was dein Held tut.“ Das Kind liest für eine Antwort, nicht für eine Bewertung.',
        'Wenig Druck bedeutet nicht keine Struktur. Erwachsene halten den Rahmen: kurze Episode, klare Rolle, eine Wahl und Stopp vor Müdigkeit. Das Kind bekommt Kontrolle innerhalb sicherer Grenzen.',
        'Das erste Ziel ist nicht „mehr lesen“, sondern ein gelungener Lesemoment: eine Zeile beenden, ein Detail finden, den nächsten Schritt der Figur vorhersagen oder eine Wiederholungsformel erkennen.',
      ],
      fr: [
        'Au lieu de “lis une page”, essayez “découvre ce que fait ton héros”. L’enfant lit pour une réponse, pas pour une note.',
        'Peu de pression ne veut pas dire absence de cadre. L’adulte garde le cadre : épisode court, rôle clair, un choix, arrêt avant la fatigue. L’enfant a du contrôle dans des limites sûres.',
        'Le premier objectif n’est pas “lire plus”, mais vivre un moment de réussite : finir une réplique, trouver un détail, deviner l’action suivante ou reconnaître une phrase répétée.',
      ],
      pl: [
        'Zamiast „przeczytaj stronę”, spróbuj „sprawdź, co zrobi bohater”. Dziecko czyta po odpowiedź, nie po ocenę.',
        'Niska presja nie oznacza braku struktury. Dorosły trzyma ramę: krótki odcinek, jasna rola, jeden wybór i koniec przed zmęczeniem. Dziecko ma kontrolę w bezpiecznych granicach.',
        'Pierwszym celem nie jest „przeczytać więcej”, ale jedno udane doświadczenie: dokończyć kwestię, znaleźć szczegół, przewidzieć następny krok bohatera albo rozpoznać powtarzaną frazę.',
      ],
    },
    research: {
      uk: [
        'Дослідники мотивації читання часто виділяють п’ять опор: інтерес, право вибору, відчуття “я можу”, розмову навколо тексту й досвід поступового майстерності. Зовнішній тиск може змусити відкрити книжку, але рідко робить читання бажаним.',
        'Вибір має бути справжнім, але не безмежним. Для дитини, якій важко читати, корисний “обмежений вибір”: дорослий пропонує кілька текстів, які підходять за рівнем і темою, а дитина обирає сама.',
        'Спільне читання, аудіо й комікси не є “обманом”. Вони підтримують словник, розуміння, інтерес і контакт із текстом. Але якщо дитина стабільно плутає звуки, читає дуже повільно, уникає читання вголос або швидко виснажується, варто поговорити з учителем чи фахівцем, щоб не пропустити реальну читацьку трудність.',
      ],
      en: [
        'Reading motivation researchers often point to five anchors: interest, ownership, “I can do this” competence, social talk around text, and gradual mastery. External pressure may open the book, but it rarely makes reading desirable.',
        'Choice should be real, but not endless. For a child who struggles, bounded choice helps: the adult offers several texts that fit the child’s level and interests, and the child chooses from them.',
        'Shared reading, audio, and comics are not cheating. They support vocabulary, comprehension, interest, and contact with text. But if a child consistently confuses sounds, reads very slowly, avoids reading aloud, or becomes exhausted quickly, talk with a teacher or specialist so a real reading difficulty is not missed.',
      ],
      ru: [
        'Исследователи мотивации чтения часто выделяют пять опор: интерес, право выбора, ощущение “я могу”, разговор вокруг текста и постепенное мастерство. Внешнее давление может заставить открыть книгу, но редко делает чтение желанным.',
        'Выбор должен быть настоящим, но не бесконечным. Для ребенка, которому трудно читать, полезен “ограниченный выбор”: взрослый предлагает несколько текстов по уровню и теме, а ребенок выбирает сам.',
        'Совместное чтение, аудио и комиксы — не обман. Они поддерживают словарь, понимание, интерес и контакт с текстом. Но если ребенок постоянно путает звуки, читает очень медленно, избегает чтения вслух или быстро истощается, стоит поговорить с учителем или специалистом, чтобы не пропустить реальную трудность чтения.',
      ],
      es: [
        'La investigación sobre motivación lectora suele señalar cinco apoyos: interés, elección, sensación de “puedo hacerlo”, conversación social sobre el texto y dominio gradual. La presión externa puede abrir el libro, pero rara vez vuelve deseable la lectura.',
        'La elección debe ser real, pero no infinita. Para un niño con dificultades ayuda la elección acotada: el adulto ofrece varios textos adecuados a su nivel e intereses, y el niño elige entre ellos.',
        'Leer juntos, usar audio o cómics no es hacer trampa. Apoyan vocabulario, comprensión, interés y contacto con el texto. Pero si confunde sonidos, lee muy lento, evita leer en voz alta o se agota rápido de forma persistente, conviene hablar con el docente o un especialista.',
      ],
      de: [
        'Forschung zur Lesemotivation nennt oft fünf Anker: Interesse, Mitbestimmung, Kompetenzgefühl, sozialen Austausch über Texte und schrittweise Meisterschaft. Äußerer Druck öffnet vielleicht das Buch, macht Lesen aber selten attraktiv.',
        'Wahl sollte echt sein, aber nicht grenzenlos. Für ein Kind mit Schwierigkeiten hilft begrenzte Auswahl: Erwachsene bieten mehrere passende Texte nach Niveau und Interesse an, das Kind wählt daraus.',
        'Gemeinsames Lesen, Audio und Comics sind kein Schummeln. Sie stützen Wortschatz, Verstehen, Interesse und Kontakt mit Text. Wenn ein Kind aber dauerhaft Laute verwechselt, sehr langsam liest, Vorlesen meidet oder schnell erschöpft ist, sollte man mit Lehrkraft oder Fachperson sprechen.',
      ],
      fr: [
        'La recherche sur la motivation en lecture met souvent en avant cinq appuis : intérêt, choix, sentiment de compétence, échanges sociaux autour du texte et maîtrise progressive. La pression peut ouvrir le livre, mais rend rarement la lecture désirable.',
        'Le choix doit être réel, mais pas infini. Pour un enfant en difficulté, le choix borné aide : l’adulte propose quelques textes adaptés au niveau et aux intérêts, puis l’enfant choisit.',
        'La lecture partagée, l’audio et les bandes dessinées ne sont pas de la triche. Ils soutiennent vocabulaire, compréhension, intérêt et contact avec le texte. Mais si l’enfant confond souvent les sons, lit très lentement, évite de lire à voix haute ou s’épuise vite, mieux vaut en parler à l’enseignant ou à un spécialiste.',
      ],
      pl: [
        'Badacze motywacji czytelniczej często wskazują pięć podpór: zainteresowanie, wybór, poczucie “umiem”, rozmowę o tekście i stopniowe mistrzostwo. Zewnętrzna presja może otworzyć książkę, ale rzadko sprawia, że czytanie staje się chciane.',
        'Wybór ma być prawdziwy, ale nie nieskończony. Dziecku, które ma trudność, pomaga wybór ograniczony: dorosły proponuje kilka tekstów pasujących poziomem i tematem, a dziecko wybiera z nich samo.',
        'Wspólne czytanie, audio i komiksy to nie oszustwo. Wspierają słownictwo, rozumienie, zainteresowanie i kontakt z tekstem. Jeśli jednak dziecko stale myli dźwięki, czyta bardzo wolno, unika czytania na głos albo szybko się wyczerpuje, warto porozmawiać z nauczycielem lub specjalistą.',
      ],
    },
    storyUse: {
      uk: [
        'Чергуйте ролі: дорослий читає описи, дитина — короткі репліки героя або повторювану фразу. Це створює участь без перевантаження.',
        'У WonderTales можна почати з теми, яку дитина сама обрала: герой, улюблена істота, космос, детектив, кумедна місія. Персональний герой або знайомий персонаж дає тексту причину: дитина хоче дізнатися, що станеться саме з ним.',
        'Якщо читати очима важко, використайте аудіо як місток: дитина слухає й слідкує за рядком або ілюстрацією. Після сцени ставте не контрольне питання, а питання вибору: “Що герой має зробити далі?” або “Яку деталь ти помітив?”',
      ],
      en: [
        'Alternate roles: the adult reads descriptions, the child reads short hero lines or a repeating phrase. It creates participation without overload.',
        'In WonderTales, start with a topic the child chose: a hero, favorite creature, space, detective story, or funny mission. A personal hero or familiar character gives the text a reason: the child wants to know what happens to them.',
        'If eye reading is hard, use audio as a bridge: the child listens while following the line or illustration. After a scene, ask a choice question instead of a quiz: “What should the hero do next?” or “What detail did you notice?”',
      ],
      ru: [
        'Чередуйте роли: взрослый читает описания, ребенок — короткие реплики героя или повтор. Это участие без перегруза.',
        'В WonderTales можно начать с темы, которую ребенок выбрал сам: герой, любимое существо, космос, детектив, смешная миссия. Личный герой или знакомый персонаж дает тексту причину: ребенку хочется узнать, что случится именно с ним.',
        'Если читать глазами трудно, используйте аудио как мостик: ребенок слушает и следит за строкой или иллюстрацией. После сцены задавайте не проверочный вопрос, а вопрос выбора: “Что герою сделать дальше?” или “Какую деталь ты заметил?”',
      ],
      es: [
        'Alternen roles: el adulto lee descripciones, el niño frases cortas del héroe o una repetición. Participa sin sobrecarga.',
        'En WonderTales, empieza con un tema elegido por el niño: héroe, criatura favorita, espacio, misterio o misión divertida. Un héroe personal o personaje familiar da una razón al texto: quiere saber qué le pasará.',
        'Si leer con los ojos cuesta, usa audio como puente: escucha mientras sigue la línea o la ilustración. Después de una escena, no preguntes como examen; pregunta elección: “¿Qué debería hacer ahora el héroe?” o “¿Qué detalle viste?”',
      ],
      de: [
        'Wechselt Rollen: Erwachsene lesen Beschreibungen, Kinder kurze Sätze oder Wiederholungen. Teilnahme ohne Überlastung.',
        'In WonderTales beginnt ihr mit einem Thema, das das Kind gewählt hat: Held, Lieblingswesen, Weltraum, Detektivgeschichte oder lustige Mission. Eine persönliche oder vertraute Figur gibt dem Text einen Grund: Das Kind will wissen, was ihr passiert.',
        'Wenn Lesen mit den Augen schwer ist, nutze Audio als Brücke: Das Kind hört zu und folgt Zeile oder Illustration. Nach der Szene keine Kontrollfrage, sondern Wahlfrage: „Was soll die Figur als Nächstes tun?“ oder „Welches Detail hast du entdeckt?“',
      ],
      fr: [
        'Alternez : l’adulte lit les descriptions, l’enfant les petites répliques ou une phrase répétée. Participation sans surcharge.',
        'Dans WonderTales, commencez par un thème choisi par l’enfant : héros, créature aimée, espace, enquête ou mission drôle. Un héros personnel ou familier donne une raison au texte : l’enfant veut savoir ce qui va lui arriver.',
        'Si lire avec les yeux est difficile, utilisez l’audio comme pont : l’enfant écoute en suivant la ligne ou l’image. Après une scène, posez une question de choix plutôt qu’un test : “Que devrait faire le héros ?” ou “Quel détail as-tu remarqué ?”',
      ],
      pl: [
        'Zmieniajcie role: dorosły czyta opisy, dziecko krótkie kwestie albo powtórzenia. Udział bez przeciążenia.',
        'W WonderTales zacznijcie od tematu wybranego przez dziecko: bohater, ulubione stworzenie, kosmos, detektyw albo zabawna misja. Osobisty lub znajomy bohater daje tekstowi powód: dziecko chce wiedzieć, co mu się stanie.',
        'Jeśli czytanie oczami jest trudne, użyj audio jako mostu: dziecko słucha i śledzi linijkę albo ilustrację. Po scenie nie zadawaj pytania-testu, lecz pytanie wyboru: „Co bohater ma zrobić dalej?” albo „Jaki szczegół zauważyłeś?”',
      ],
    },
    adjustment: {
      uk: [
        'Якщо дитина сердиться, поверніть контроль: вона може обрати абзац, який читає дорослий, або поставити історію на аудіо й слідкувати очима.',
        'Якщо вона відволікається, не додавайте довшу сцену. Змініть одну змінну: коротший епізод, більша ілюстрація, знайоміший герой, читання вдвох або менше нових слів.',
        'Якщо опір повторюється в різних текстах і ситуаціях, не пояснюйте все характером. Повільне читання, пропуски слів, вгадування, головний біль, сильний сором або різка втома можуть бути сигналом, що дитині потрібна інша підтримка, а не більше тиску.',
      ],
      en: [
        'If the child gets upset, return control: they choose a paragraph for the adult to read, or use audio while following the text.',
        'If they drift away, do not add a longer scene. Change one variable: shorter episode, larger illustration, more familiar hero, paired reading, or fewer new words.',
        'If resistance repeats across different texts and situations, do not explain it all as attitude. Slow reading, skipped words, guessing, headaches, strong shame, or sudden fatigue can signal that the child needs different support, not more pressure.',
      ],
      ru: [
        'Если ребенок злится, верните контроль: пусть выберет абзац для взрослого или слушает аудио и следит глазами.',
        'Если он отвлекается, не добавляйте сцену длиннее. Измените одну переменную: короче эпизод, крупнее иллюстрация, знакомее герой, чтение вдвоем или меньше новых слов.',
        'Если сопротивление повторяется в разных текстах и ситуациях, не объясняйте все характером. Медленное чтение, пропуски слов, угадывание, головная боль, сильный стыд или резкая усталость могут быть сигналом, что ребенку нужна другая поддержка, а не больше давления.',
      ],
      es: [
        'Si se frustra, devuélvele control: elige un párrafo para que lea el adulto o escucha audio siguiendo el texto.',
        'Si se dispersa, no alargues la escena. Cambia una variable: episodio más corto, ilustración más grande, héroe más familiar, lectura en pareja o menos palabras nuevas.',
        'Si la resistencia se repite en textos y situaciones distintas, no lo reduzcas a actitud. Lectura lenta, saltos de palabras, adivinanzas, dolor de cabeza, mucha vergüenza o cansancio brusco pueden indicar que necesita otro apoyo, no más presión.',
      ],
      de: [
        'Bei Frust gib Kontrolle zurück: Das Kind wählt den Absatz für den Erwachsenen oder hört Audio und folgt mit den Augen.',
        'Wenn es abschweift, mach die Szene nicht länger. Ändere eine Variable: kürzere Episode, größere Illustration, vertrautere Figur, gemeinsames Lesen oder weniger neue Wörter.',
        'Wenn Widerstand bei verschiedenen Texten und Situationen wiederkehrt, erkläre nicht alles mit Haltung. Langsames Lesen, ausgelassene Wörter, Raten, Kopfschmerz, starke Scham oder schnelle Erschöpfung können zeigen, dass andere Unterstützung nötig ist, nicht mehr Druck.',
      ],
      fr: [
        'En cas de frustration, rendez du contrôle : l’enfant choisit le paragraphe lu par l’adulte ou suit avec l’audio.',
        'S’il décroche, n’allongez pas la scène. Changez une variable : épisode plus court, image plus grande, héros plus familier, lecture à deux ou moins de mots nouveaux.',
        'Si la résistance revient avec plusieurs textes et situations, ne l’expliquez pas seulement par l’attitude. Lecture lente, mots sautés, devinettes, maux de tête, forte honte ou fatigue soudaine peuvent signaler un besoin d’aide différente, pas de pression supplémentaire.',
      ],
      pl: [
        'Gdy pojawia się złość, oddaj kontrolę: dziecko wybiera akapit dla dorosłego albo słucha audio i śledzi tekst.',
        'Jeśli odpływa, nie wydłużaj sceny. Zmień jedną rzecz: krótszy odcinek, większą ilustrację, bardziej znanego bohatera, czytanie w parze albo mniej nowych słów.',
        'Jeśli opór powtarza się przy różnych tekstach i sytuacjach, nie tłumacz wszystkiego nastawieniem. Wolne czytanie, pomijanie słów, zgadywanie, ból głowy, silny wstyd albo szybkie zmęczenie mogą oznaczać potrzebę innego wsparcia, nie większej presji.',
      ],
    },
    checklist: {
      uk: ['Запропонувати 3 варіанти історії на вибір.', 'Дати дитині коротку роль у читанні.', 'Закінчити на маленькому успіху, а не на виснаженні.'],
      en: ['Offer 3 story options to choose from.', 'Give the child a short reading role.', 'End on a small success, not exhaustion.'],
      ru: ['Предложите 3 варианта истории на выбор.', 'Дайте ребенку короткую роль в чтении.', 'Закончите на маленьком успехе, а не на истощении.'],
      es: ['Ofrece 3 opciones de historia.', 'Dale un rol breve de lectura.', 'Termina con un pequeño éxito, no con agotamiento.'],
      de: ['Biete 3 Geschichten zur Auswahl an.', 'Gib dem Kind eine kurze Leserolle.', 'Ende mit kleinem Erfolg, nicht mit Erschöpfung.'],
      fr: ['Proposez 3 histoires au choix.', 'Donnez un petit rôle de lecture.', 'Terminez sur une petite réussite, pas sur l’épuisement.'],
      pl: ['Zaproponuj 3 historie do wyboru.', 'Daj dziecku krótką rolę czytelniczą.', 'Zakończ małym sukcesem, nie wyczerpaniem.'],
    },
    quote: {
      text: {
        uk: 'Учні мають більше мотивації читати, коли можуть робити вибір.',
        en: 'Students are more motivated to read when they have opportunities to make choices.',
        ru: 'Ученики сильнее мотивированы читать, когда у них есть возможность выбирать.',
        es: 'Los estudiantes tienen más motivación para leer cuando pueden tomar decisiones.',
        de: 'Schülerinnen und Schüler sind motivierter zu lesen, wenn sie Wahlmöglichkeiten haben.',
        fr: 'Les élèves sont plus motivés à lire lorsqu’ils peuvent faire des choix.',
        pl: 'Uczniowie są bardziej zmotywowani do czytania, gdy mają możliwość wyboru.',
      },
      attribution: 'Linda B. Gambrell',
      sourceLabel: 'Seven Rules of Engagement',
      sourceUrl: 'https://www.readinghalloffame.org/sites/default/files/final_pdf_of_ms_10.1002_trtr.01024.pdf',
    },
    sources: [
      { label: 'Reading Rockets: Reading Motivation', url: 'https://www.readingrockets.org/reading-motivation' },
      { label: 'Gambrell: Seven Rules of Engagement', url: 'https://www.readinghalloffame.org/sites/default/files/final_pdf_of_ms_10.1002_trtr.01024.pdf' },
      { label: 'Reading Rockets: Teacher Practices that Impact Reading Motivation', url: 'https://www.readingrockets.org/topics/motivation/articles/teacher-practices-impact-reading-motivation' },
      { label: 'Reading Rockets: Hooking Struggling Readers', url: 'https://www.readingrockets.org/topics/childrens-books/articles/hooking-struggling-readers-using-books-they-can-and-want-read' },
      { label: 'National Literacy Trust: Reading for pleasure research overview', url: 'https://literacytrust.org.uk/research-services/research-reports/reading-for-pleasure-a-research-overview-2006/' },
      { label: 'Reading Rockets: Children with Dyslexia', url: 'https://www.readingrockets.org/helping-all-readers/neurodiversity-and-children-learning-differences/children-dyslexia' },
    ],
    visualDirection: 'A parent and child reading the same glowing page, with text becoming gentle stepping stones.',
    relatedSlugs: ['age-appropriate-story-complexity', 'five-minute-stories'],
    inlineImages: articleInlineImages(
      'reading-without-pressure',
      l10n(
        'Дитина грає маленьку роль у сцені з пальчиковими героями поруч із планшетом',
        'A child plays a small role with finger puppets beside a tablet',
        'Ребенок играет маленькую роль с пальчиковыми героями рядом с планшетом',
        'Un niño participa con títeres de dedo junto a una tableta',
        'Ein Kind übernimmt neben einem Tablet eine kleine Rolle mit Fingerpuppen',
        'Un enfant joue un petit rôle avec des marionnettes à doigts près d’une tablette',
        'Dziecko odgrywa małą rolę pacynkami obok tabletu'
      ),
      l10n(
        'Маленька керована роль дає участь без відчуття перевірки.',
        'A small guided role creates participation without feeling like a test.',
        'Маленькая управляемая роль дает участие без ощущения проверки.',
        'Un papel pequeño y guiado crea participación sin sensación de examen.',
        'Eine kleine geführte Rolle schafft Beteiligung ohne Prüfungsgefühl.',
        'Un petit rôle guidé permet de participer sans impression de test.',
        'Mała prowadzona rola daje udział bez poczucia testu.'
      ),
      l10n(
        'Дитина слухає в навушниках і дивиться на планшет, а дорослий сидить поруч',
        'A child listens with headphones and looks at a tablet while a parent sits nearby',
        'Ребенок слушает в наушниках и смотрит на планшет, а взрослый сидит рядом',
        'Un niño escucha con auriculares y mira una tableta mientras un adulto está cerca',
        'Ein Kind hört mit Kopfhörern und schaut auf ein Tablet, während ein Elternteil nahe sitzt',
        'Un enfant écoute au casque et regarde une tablette pendant qu’un parent reste près de lui',
        'Dziecko słucha w słuchawkach i patrzy na tablet, a rodzic siedzi obok'
      ),
      l10n(
        'Аудіо може бути містком, коли читання очима поки забирає занадто багато сил.',
        'Audio can be a bridge when eye reading still takes too much effort.',
        'Аудио может быть мостиком, когда чтение глазами пока забирает слишком много сил.',
        'El audio puede ser un puente cuando leer con los ojos aún exige demasiado.',
        'Audio kann eine Brücke sein, wenn Lesen mit den Augen noch zu viel Kraft kostet.',
        'L’audio peut servir de pont quand lire avec les yeux demande encore trop d’effort.',
        'Audio może być mostem, gdy czytanie oczami wciąż kosztuje za dużo wysiłku.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Контакт', title: 'Спільне читання теж рахується', body: 'Якщо дорослий читає частину тексту, дитина все одно працює зі змістом, мовою, емоціями й передбаченням.' },
        { eyebrow: 'Вибір', title: 'Менше боротьби, коли є право обрати', body: 'Дитина може обрати героя, абзац, роль, аудіо або повторну історію. Це повертає відчуття контролю.' },
        { eyebrow: 'Сигнали', title: 'Опір часто щось означає', body: 'Відмова може бути втомою, соромом, надто складним текстом або невдалою темою, а не просто “не хочу”.' },
      ],
      en: [
        { eyebrow: 'Connection', title: 'Shared reading still counts', body: 'When an adult reads part of the text, the child still works with meaning, language, emotion, and prediction.' },
        { eyebrow: 'Choice', title: 'Less fight when choice is real', body: 'The child can choose a hero, paragraph, role, audio, or reread. This restores a sense of control.' },
        { eyebrow: 'Signals', title: 'Resistance often means something', body: 'Refusal can mean fatigue, shame, too-hard text, or the wrong topic, not simply “I do not want to”.' },
      ],
      ru: [
        { eyebrow: 'Контакт', title: 'Совместное чтение тоже считается', body: 'Если взрослый читает часть текста, ребенок все равно работает со смыслом, языком, эмоциями и прогнозом.' },
        { eyebrow: 'Выбор', title: 'Меньше борьбы, когда выбор настоящий', body: 'Ребенок может выбрать героя, абзац, роль, аудио или повтор. Это возвращает чувство контроля.' },
        { eyebrow: 'Сигналы', title: 'Сопротивление часто что-то означает', body: 'Отказ может быть усталостью, стыдом, слишком сложным текстом или неподходящей темой, а не просто “не хочу”.' },
      ],
      es: [
        { eyebrow: 'Conexión', title: 'Leer juntos también cuenta', body: 'Si el adulto lee parte del texto, el niño trabaja significado, lenguaje, emoción y predicción.' },
        { eyebrow: 'Elección', title: 'Menos pelea cuando hay elección real', body: 'Puede elegir héroe, párrafo, rol, audio o repetir historia. Recupera control.' },
        { eyebrow: 'Señales', title: 'La resistencia suele decir algo', body: 'Negarse puede ser cansancio, vergüenza, texto difícil o tema inadecuado, no solo “no quiero”.' },
      ],
      de: [
        { eyebrow: 'Verbindung', title: 'Gemeinsames Lesen zählt', body: 'Wenn Erwachsene einen Teil lesen, arbeitet das Kind trotzdem mit Sinn, Sprache, Gefühl und Vorhersage.' },
        { eyebrow: 'Wahl', title: 'Weniger Streit durch echte Wahl', body: 'Das Kind wählt Figur, Absatz, Rolle, Audio oder Wiederholung. Das gibt Kontrolle zurück.' },
        { eyebrow: 'Signale', title: 'Widerstand bedeutet oft etwas', body: 'Ablehnung kann Müdigkeit, Scham, zu schweren Text oder falsches Thema bedeuten, nicht nur “keine Lust”.' },
      ],
      fr: [
        { eyebrow: 'Lien', title: 'Lire ensemble compte aussi', body: 'Quand l’adulte lit une partie, l’enfant travaille quand même le sens, la langue, l’émotion et l’anticipation.' },
        { eyebrow: 'Choix', title: 'Moins de lutte quand le choix existe', body: 'L’enfant peut choisir héros, paragraphe, rôle, audio ou relecture. Cela rend du contrôle.' },
        { eyebrow: 'Signaux', title: 'La résistance dit souvent quelque chose', body: 'Le refus peut venir de fatigue, honte, texte trop dur ou thème inadéquat, pas seulement “je ne veux pas”.' },
      ],
      pl: [
        { eyebrow: 'Kontakt', title: 'Wspólne czytanie też się liczy', body: 'Gdy dorosły czyta część tekstu, dziecko nadal pracuje ze znaczeniem, językiem, emocją i przewidywaniem.' },
        { eyebrow: 'Wybór', title: 'Mniej walki, gdy wybór jest prawdziwy', body: 'Dziecko może wybrać bohatera, akapit, rolę, audio albo powtórkę. To przywraca kontrolę.' },
        { eyebrow: 'Sygnały', title: 'Opór często coś oznacza', body: 'Odmowa może oznaczać zmęczenie, wstyd, zbyt trudny tekst albo zły temat, nie tylko “nie chcę”.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Що робити, коли дитина не хоче читати',
        intro: 'Не кожен опір треба “продавлювати”. Часто достатньо змінити формат участі.',
        columns: ['Що видно', 'Можлива причина', 'М’який крок'],
        rows: [
          ['Злиться на помилки', 'Сором або страх оцінки', 'Дорослий читає опис, дитина лише репліки героя'],
          ['Швидко втомлюється', 'Текст довгий або дрібний', 'Одна коротка сцена й завершення до втоми'],
          ['Відволікається', 'Немає особистого гачка', 'Обрати героя, предмет або тему разом'],
          ['Просить аудіо', 'Слухати легше, ніж декодувати', 'Увімкнути аудіо й стежити очима за текстом'],
        ],
      },
      en: {
        heading: 'What to do when a child resists reading',
        intro: 'Resistance does not always need pressure. Often the participation format needs to change.',
        columns: ['What you see', 'Possible reason', 'Gentle step'],
        rows: [
          ['Gets angry at mistakes', 'Shame or fear of being tested', 'Adult reads narration; child reads only hero lines'],
          ['Tires quickly', 'Text is long or visually demanding', 'One short scene and stop before fatigue'],
          ['Gets distracted', 'No personal hook', 'Choose hero, object, or theme together'],
          ['Asks for audio', 'Listening is easier than decoding', 'Use audio while following the text visually'],
        ],
      },
      ru: {
        heading: 'Что делать, если ребенок не хочет читать',
        intro: 'Не всякое сопротивление нужно продавливать. Часто достаточно изменить формат участия.',
        columns: ['Что видно', 'Возможная причина', 'Мягкий шаг'],
        rows: [
          ['Злится на ошибки', 'Стыд или страх проверки', 'Взрослый читает описание, ребенок только реплики героя'],
          ['Быстро устает', 'Текст длинный или визуально тяжелый', 'Одна короткая сцена и остановка до усталости'],
          ['Отвлекается', 'Нет личного крючка', 'Выбрать героя, предмет или тему вместе'],
          ['Просит аудио', 'Слушать легче, чем декодировать', 'Включить аудио и следить глазами за текстом'],
        ],
      },
      es: {
        heading: 'Qué hacer si no quiere leer',
        intro: 'La resistencia no siempre necesita presión. A menudo cambia el formato de participación.',
        columns: ['Lo que ves', 'Posible razón', 'Paso suave'],
        rows: [
          ['Se enfada por errores', 'Vergüenza o miedo a evaluación', 'Adulto lee narración; niño solo frases del héroe'],
          ['Se cansa rápido', 'Texto largo o visualmente exigente', 'Una escena corta y parar antes del cansancio'],
          ['Se distrae', 'Falta de gancho personal', 'Elegir héroe, objeto o tema juntos'],
          ['Pide audio', 'Escuchar es más fácil que decodificar', 'Audio mientras sigue el texto con la vista'],
        ],
      },
      de: {
        heading: 'Wenn das Kind Lesen vermeidet',
        intro: 'Widerstand braucht nicht immer Druck. Oft muss nur die Beteiligung anders sein.',
        columns: ['Beobachtung', 'Möglicher Grund', 'Sanfter Schritt'],
        rows: [
          ['Ärgert sich über Fehler', 'Scham oder Angst vor Prüfung', 'Erwachsener liest Erzählung, Kind nur Figurenzeilen'],
          ['Wird schnell müde', 'Text ist lang oder visuell anstrengend', 'Eine kurze Szene und vor Müdigkeit stoppen'],
          ['Lenkt sich ab', 'Kein persönlicher Haken', 'Figur, Gegenstand oder Thema gemeinsam wählen'],
          ['Möchte Audio', 'Zuhören ist leichter als Dekodieren', 'Audio nutzen und Text mit den Augen verfolgen'],
        ],
      },
      fr: {
        heading: 'Que faire quand l’enfant refuse de lire',
        intro: 'La résistance n’appelle pas toujours la pression. Souvent, il faut changer la participation.',
        columns: ['Ce qu’on voit', 'Cause possible', 'Pas doux'],
        rows: [
          ['Se fâche aux erreurs', 'Honte ou peur d’être évalué', 'L’adulte lit la narration, l’enfant les répliques'],
          ['Se fatigue vite', 'Texte long ou visuellement exigeant', 'Une scène courte et arrêt avant fatigue'],
          ['Se disperse', 'Pas d’accroche personnelle', 'Choisir héros, objet ou thème ensemble'],
          ['Demande l’audio', 'Écouter est plus simple que décoder', 'Audio en suivant le texte des yeux'],
        ],
      },
      pl: {
        heading: 'Co robić, gdy dziecko nie chce czytać',
        intro: 'Opór nie zawsze wymaga nacisku. Często wystarczy zmienić formę udziału.',
        columns: ['Co widać', 'Możliwy powód', 'Łagodny krok'],
        rows: [
          ['Złości się na błędy', 'Wstyd albo strach przed oceną', 'Dorosły czyta opis, dziecko tylko kwestie bohatera'],
          ['Szybko się męczy', 'Tekst długi albo trudny wizualnie', 'Jedna krótka scena i koniec przed zmęczeniem'],
          ['Rozprasza się', 'Brak osobistego haczyka', 'Wybrać razem bohatera, przedmiot albo temat'],
          ['Prosi o audio', 'Słuchanie łatwiejsze niż dekodowanie', 'Włączyć audio i śledzić tekst oczami'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Меню читання',
        heading: 'П’ять форматів без боротьби',
        intro: 'Мета — повернути дитину до історії, а не довести, що вона мусить читати саме так.',
        steps: [
          { title: 'Дорослий читає, дитина керує', body: 'Дитина обирає, де зупинитися, кого слухати і яку деталь знайти.' },
          { title: 'Ролі по черзі', body: 'Дорослий читає довге, дитина — короткі репліки або повтори.' },
          { title: 'Аудіо плюс текст', body: 'Слухання з очима на рядку зменшує навантаження, але лишає контакт із текстом.' },
          { title: 'Повторна історія', body: 'Рерідинг не “нудний”: знайомий текст дає впевненість і плавність.' },
          { title: 'Розмова після сцени', body: 'Питайте про вибір героя або помічену деталь, а не перевіряйте правильність переказу.' },
        ],
      },
      en: {
        eyebrow: 'Reading menu',
        heading: 'Five formats without a fight',
        intro: 'The goal is to bring the child back to the story, not prove they must read in one exact way.',
        steps: [
          { title: 'Adult reads, child directs', body: 'The child chooses where to pause, whom to listen to, and what detail to find.' },
          { title: 'Turn-taking roles', body: 'The adult reads long parts; the child reads short lines or repeated phrases.' },
          { title: 'Audio plus text', body: 'Listening while following the line lowers load while keeping contact with text.' },
          { title: 'Rereading', body: 'Rereading is not boring: familiar text builds confidence and fluency.' },
          { title: 'Talk after the scene', body: 'Ask about the hero’s choice or a noticed detail, not whether the child can retell perfectly.' },
        ],
      },
      ru: {
        eyebrow: 'Меню чтения',
        heading: 'Пять форматов без борьбы',
        intro: 'Цель — вернуть ребенка к истории, а не доказать, что читать надо только одним способом.',
        steps: [
          { title: 'Взрослый читает, ребенок управляет', body: 'Ребенок выбирает, где остановиться, кого слушать и какую деталь найти.' },
          { title: 'Роли по очереди', body: 'Взрослый читает длинное, ребенок — короткие реплики или повторы.' },
          { title: 'Аудио плюс текст', body: 'Слушание с глазами на строке снижает нагрузку, но сохраняет контакт с текстом.' },
          { title: 'Повторное чтение', body: 'Повтор не скука: знакомый текст дает уверенность и плавность.' },
          { title: 'Разговор после сцены', body: 'Спрашивайте о выборе героя или замеченной детали, а не проверяйте точность пересказа.' },
        ],
      },
      es: {
        eyebrow: 'Menú lector',
        heading: 'Formatos sin pelea',
        intro: 'La meta es volver a la historia, no demostrar que solo existe una forma de leer.',
        steps: [
          { title: 'Adulto lee, niño dirige', body: 'El niño elige dónde pausar, a quién escuchar y qué detalle encontrar.' },
          { title: 'Roles por turnos', body: 'El adulto lee lo largo; el niño frases cortas o repeticiones.' },
          { title: 'Audio más texto', body: 'Escuchar siguiendo la línea baja la carga y mantiene contacto con el texto.' },
          { title: 'Releer', body: 'Releer no es aburrido: el texto conocido da confianza y fluidez.' },
          { title: 'Conversar después', body: 'Pregunta por la decisión del héroe o un detalle observado, no por repetir perfectamente.' },
        ],
      },
      de: {
        eyebrow: 'Lesemenü',
        heading: 'Formate ohne Streit',
        intro: 'Ziel ist Rückkehr zur Geschichte, nicht Beweis, dass nur eine Leseart gilt.',
        steps: [
          { title: 'Erwachsener liest, Kind steuert', body: 'Das Kind wählt Pausen, Zuhören und Detailsuche.' },
          { title: 'Rollen im Wechsel', body: 'Erwachsene lesen lange Stellen, Kinder kurze Zeilen oder Wiederholungen.' },
          { title: 'Audio plus Text', body: 'Hören und mit den Augen folgen senkt die Last und hält Textkontakt.' },
          { title: 'Wiederlesen', body: 'Wiederlesen ist nicht langweilig: vertrauter Text gibt Sicherheit und Flüssigkeit.' },
          { title: 'Nach der Szene sprechen', body: 'Frage nach der Entscheidung der Figur oder einem Detail, nicht nach perfektem Nacherzählen.' },
        ],
      },
      fr: {
        eyebrow: 'Menu lecture',
        heading: 'Des formats sans lutte',
        intro: 'Le but est de revenir à l’histoire, pas de prouver qu’il n’y a qu’une façon de lire.',
        steps: [
          { title: 'L’adulte lit, l’enfant dirige', body: 'L’enfant choisit où s’arrêter, qui écouter et quel détail trouver.' },
          { title: 'Rôles à tour de rôle', body: 'L’adulte lit le long; l’enfant les répliques courtes ou répétées.' },
          { title: 'Audio plus texte', body: 'Écouter en suivant la ligne allège la charge et garde le contact au texte.' },
          { title: 'Relire', body: 'Relire n’est pas ennuyeux: le texte connu donne confiance et fluidité.' },
          { title: 'Parler après la scène', body: 'Demandez le choix du héros ou un détail remarqué, pas un résumé parfait.' },
        ],
      },
      pl: {
        eyebrow: 'Menu czytania',
        heading: 'Formaty bez walki',
        intro: 'Celem jest powrót do historii, nie udowodnienie, że czyta się tylko jednym sposobem.',
        steps: [
          { title: 'Dorosły czyta, dziecko steruje', body: 'Dziecko wybiera pauzę, kogo słucha i jaki szczegół znaleźć.' },
          { title: 'Role na zmianę', body: 'Dorosły czyta długie fragmenty, dziecko krótkie kwestie albo powtórki.' },
          { title: 'Audio plus tekst', body: 'Słuchanie ze śledzeniem linijki zmniejsza obciążenie i utrzymuje kontakt z tekstem.' },
          { title: 'Powtórne czytanie', body: 'Powtórka nie jest nudna: znany tekst daje pewność i płynność.' },
          { title: 'Rozmowa po scenie', body: 'Zapytaj o wybór bohatera albo zauważony szczegół, nie o perfekcyjne streszczenie.' },
        ],
      },
    },
  },
  {
    slug: 'bedtime-story-family-ritual',
    heroImage: '/landing/blog/bedtime-story-family-ritual-scene-01.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Сімейний ритуал', en: 'Family ritual', ru: 'Семейный ритуал', es: 'Ritual familiar', de: 'Familienritual', fr: 'Rituel familial', pl: 'Rytuał rodzinny' },
    title: {
      uk: 'Вечірня історія як сімейний ритуал, а не ще один екран',
      en: 'Bedtime stories as a family ritual, not another screen',
      ru: 'Вечерняя история как семейный ритуал, а не еще один экран',
      es: 'La historia nocturna como ritual familiar, no otra pantalla',
      de: 'Die Abendgeschichte als Familienritual, nicht als weiterer Bildschirm',
      fr: 'L’histoire du soir comme rituel familial, pas comme écran de plus',
      pl: 'Historia na dobranoc jako rytuał rodzinny, nie kolejny ekran',
    },
    description: {
      uk: 'Як перетворити вечірню історію на стабільний сімейний ритуал: менше екранної стимуляції, більше передбачуваності, голосу і спокійного фіналу.',
      en: 'How to turn a bedtime story into a stable family ritual: less screen stimulation, more predictability, voice, and a calm ending.',
      ru: 'Как превратить вечернюю историю в стабильный семейный ритуал: меньше экранной стимуляции, больше предсказуемости, голоса и спокойного финала.',
      es: 'Cómo convertir la historia nocturna en un ritual familiar estable: menos estimulación de pantalla, más previsibilidad, voz y cierre tranquilo.',
      de: 'Wie die Abendgeschichte zu einem stabilen Familienritual wird: weniger Bildschirmreiz, mehr Vorhersagbarkeit, Stimme und ruhiger Abschluss.',
      fr: 'Comment faire de l’histoire du soir un rituel familial stable : moins de stimulation d’écran, plus de prévisibilité, de voix et de calme.',
      pl: 'Jak zmienić historię na dobranoc w stabilny rytuał rodzinny: mniej bodźców z ekranu, więcej przewidywalności, głosu i spokojnego końca.',
    },
    lead: {
      uk: 'Проблема не в тому, що історія цифрова. Проблема починається, коли вона поводиться як нескінченна стрічка: ще один вибір, ще один звук, ще один екран перед сном.',
      en: 'The issue is not that the story is digital. The issue begins when it behaves like an endless feed: one more choice, one more sound, one more screen before sleep.',
      ru: 'Проблема не в том, что история цифровая. Проблема начинается, когда она ведет себя как бесконечная лента: еще один выбор, еще один звук, еще один экран перед сном.',
      es: 'El problema no es que la historia sea digital. Empieza cuando se comporta como un feed infinito: otra elección, otro sonido, otra pantalla antes de dormir.',
      de: 'Das Problem ist nicht, dass die Geschichte digital ist. Es beginnt, wenn sie wie ein endloser Feed funktioniert: noch eine Wahl, noch ein Klang, noch ein Bildschirm vor dem Schlaf.',
      fr: 'Le problème n’est pas que l’histoire soit numérique. Il commence quand elle agit comme un fil infini : encore un choix, encore un son, encore un écran avant de dormir.',
      pl: 'Problemem nie jest to, że historia jest cyfrowa. Zaczyna się, gdy działa jak nieskończony feed: jeszcze jeden wybór, jeszcze jeden dźwięk, jeszcze jeden ekran przed snem.',
    },
    focus: {
      uk: [
        'Ритуал має початок і кінець. Дитина може вибрати героя, але дорослий тримає рамку: одна історія, один голос, одне завершення. Саме ця рамка відрізняє вечірній ритуал від розваги, яка не хоче закінчуватися.',
        'Для сну важлива не ідеальна історія, а повторювана послідовність. Дитина чує знайомі кроки: вмилися, обрали героя, слухаємо, бажаємо герою добра, вимикаємо. Передбачуваність знімає частину вечірніх переговорів.',
        'Аудіо може бути корисним, якщо воно прибирає екран із рук дитини. Низька гучність, таймер, без автопродовження, без нового меню після фіналу. Тоді історія стає мостом до сну, а не ще одним джерелом стимуляції.',
      ],
      en: [
        'A ritual has a beginning and an end. The child may choose the hero, but the adult holds the frame: one story, one voice, one ending. That frame is what separates a bedtime ritual from entertainment that does not want to end.',
        'Sleep does not need the perfect story as much as a repeated sequence. The child hears familiar steps: wash, choose a hero, listen, wish the hero well, turn off. Predictability reduces some of the evening negotiation.',
        'Audio can help when it removes the screen from the child’s hands. Low volume, a timer, no autoplay, no new menu after the ending. Then the story becomes a bridge to sleep, not another source of stimulation.',
      ],
      ru: [
        'У ритуала есть начало и конец. Ребенок может выбрать героя, но взрослый держит рамку: одна история, один голос, одно завершение. Именно эта рамка отличает вечерний ритуал от развлечения, которое не хочет заканчиваться.',
        'Для сна важна не идеальная история, а повторяемая последовательность. Ребенок слышит знакомые шаги: умылись, выбрали героя, слушаем, желаем герою добра, выключаем. Предсказуемость снимает часть вечерних переговоров.',
        'Аудио может помогать, если убирает экран из рук ребенка. Низкая громкость, таймер, без автопродолжения, без нового меню после финала. Тогда история становится мостом ко сну, а не еще одним источником стимуляции.',
      ],
      es: [
        'Un ritual tiene inicio y fin. El niño puede elegir héroe, pero el adulto sostiene el marco: una historia, una voz, un cierre. Ese marco separa el ritual nocturno del entretenimiento que no quiere terminar.',
        'El sueño no necesita una historia perfecta tanto como una secuencia repetida. El niño oye pasos conocidos: lavarse, elegir héroe, escuchar, desearle algo bueno, apagar. La previsibilidad reduce parte de la negociación nocturna.',
        'El audio puede ayudar si quita la pantalla de las manos del niño. Volumen bajo, temporizador, sin autoplay, sin nuevo menú después del final. Entonces la historia es puente hacia el sueño, no otra fuente de estimulación.',
      ],
      de: [
        'Ein Ritual hat Anfang und Ende. Das Kind darf die Figur wählen, aber der Erwachsene hält den Rahmen: eine Geschichte, eine Stimme, ein Abschluss. Dieser Rahmen unterscheidet ein Abendritual von Unterhaltung, die nicht enden will.',
        'Für Schlaf zählt nicht die perfekte Geschichte, sondern eine wiederholte Reihenfolge. Das Kind hört vertraute Schritte: waschen, Figur wählen, hören, der Figur Gutes wünschen, ausschalten. Vorhersagbarkeit senkt Abendverhandlungen.',
        'Audio kann helfen, wenn es den Bildschirm aus den Kinderhänden nimmt. Leise Lautstärke, Timer, kein Autoplay, kein neues Menü nach dem Ende. Dann wird die Geschichte zur Brücke in den Schlaf, nicht zur weiteren Stimulation.',
      ],
      fr: [
        'Un rituel a un début et une fin. L’enfant peut choisir le héros, mais l’adulte tient le cadre : une histoire, une voix, une fin. Ce cadre distingue le rituel du soir d’un divertissement qui ne veut pas finir.',
        'Le sommeil n’a pas besoin d’une histoire parfaite autant que d’une séquence répétée. L’enfant entend des étapes connues : se laver, choisir un héros, écouter, lui souhaiter du bien, éteindre. La prévisibilité réduit les négociations.',
        'L’audio peut aider s’il retire l’écran des mains de l’enfant. Volume bas, minuteur, pas d’autoplay, pas de nouveau menu après la fin. L’histoire devient alors un pont vers le sommeil, pas une stimulation de plus.',
      ],
      pl: [
        'Rytuał ma początek i koniec. Dziecko może wybrać bohatera, ale dorosły trzyma ramę: jedna historia, jeden głos, jedno zakończenie. Ta rama odróżnia wieczorny rytuał od rozrywki, która nie chce się skończyć.',
        'Sen nie potrzebuje idealnej historii tak bardzo jak powtarzalnej kolejności. Dziecko słyszy znane kroki: mycie, wybór bohatera, słuchanie, życzenie bohaterowi dobra, wyłączenie. Przewidywalność zmniejsza wieczorne negocjacje.',
        'Audio może pomagać, jeśli zabiera ekran z rąk dziecka. Cicha głośność, timer, bez autoplay, bez nowego menu po finale. Wtedy historia jest mostem do snu, nie kolejnym źródłem pobudzenia.',
      ],
    },
    research: {
      uk: [
        'Дослідження Jodi Mindell та колег показують: регулярні вечірні рутини пов’язані з ранішим засинанням, меншою кількістю нічних пробуджень, довшим сном і кращим самопочуттям батьків. Важливий не “магічний крок”, а повторюваність.',
        'American Academy of Pediatrics пропонує просту логіку “Brush, Book, Bed”: гігієна, книжка, сон. Це не лише про сон. Спільне читання підтримує мову, близькість і соціально-емоційний розвиток, якщо дорослий справді поруч, а не просто вмикає контент.',
        'Фахівці зі сну часто радять зменшувати яскраве світло, екрани й активну стимуляцію приблизно за годину до сну. Тому цифрова історія має бути налаштована як тихий режим: без кліків, гри, автопродовження і спокуси “пошукати ще щось”.',
        'З аудіо варто бути чесними: воно не є доказаними ліками від безсоння. Але як частина передбачуваного ритуалу воно може допомогти сім’ї зберегти темп вечора, особливо коли дорослий втомлений або дитині важливо чути знайомий голос.',
      ],
      en: [
        'Research by Jodi Mindell and colleagues shows that regular bedtime routines are associated with earlier bedtimes, fewer night wakings, longer sleep, and better parent mood. The important piece is not a magic step, but repetition.',
        'The American Academy of Pediatrics offers a simple “Brush, Book, Bed” logic: hygiene, book, sleep. This is not only about sleep. Shared reading supports language, closeness, and social-emotional development when the adult is truly present, not just starting content.',
        'Sleep specialists often recommend reducing bright light, screens, and active stimulation about an hour before bed. So a digital story should be configured as a quiet mode: no tapping, games, autoplay, or temptation to search for more.',
        'Audio should be described honestly: it is not a proven cure for insomnia. But as part of a predictable ritual, it can help a family keep the evening rhythm, especially when the adult is tired or the child needs a familiar voice.',
      ],
      ru: [
        'Исследования Jodi Mindell и коллег показывают: регулярные вечерние рутины связаны с более ранним отходом ко сну, меньшим числом ночных пробуждений, более долгим сном и лучшим самочувствием родителей. Важен не “волшебный шаг”, а повторяемость.',
        'American Academy of Pediatrics предлагает простую логику “Brush, Book, Bed”: гигиена, книга, сон. Это не только про сон. Совместное чтение поддерживает речь, близость и социально-эмоциональное развитие, если взрослый действительно рядом, а не просто включает контент.',
        'Специалисты по сну часто советуют уменьшать яркий свет, экраны и активную стимуляцию примерно за час до сна. Поэтому цифровая история должна быть настроена как тихий режим: без кликов, игры, автопродолжения и соблазна “поискать еще”.',
        'Об аудио стоит говорить честно: это не доказанное лекарство от бессонницы. Но как часть предсказуемого ритуала оно может помочь семье сохранить темп вечера, особенно когда взрослый устал или ребенку важен знакомый голос.',
      ],
      es: [
        'La investigación de Jodi Mindell y colegas muestra que las rutinas regulares se asocian con acostarse antes, menos despertares, más sueño y mejor ánimo parental. Lo importante no es un paso mágico, sino la repetición.',
        'La American Academy of Pediatrics propone una lógica simple: “Brush, Book, Bed”: higiene, libro, sueño. No es solo sueño. Leer juntos apoya lenguaje, cercanía y desarrollo socioemocional cuando el adulto está realmente presente.',
        'Los especialistas en sueño suelen recomendar bajar luz intensa, pantallas y estimulación activa alrededor de una hora antes de dormir. Por eso una historia digital debe funcionar como modo tranquilo: sin toques, juegos, autoplay ni búsqueda de más.',
        'Conviene hablar del audio con honestidad: no es una cura probada para el insomnio. Pero dentro de un ritual predecible puede ayudar a mantener el ritmo de la noche, sobre todo si el adulto está cansado o el niño necesita una voz familiar.',
      ],
      de: [
        'Forschung von Jodi Mindell und Kolleginnen zeigt: Regelmäßige Abendroutinen hängen mit früherem Zubettgehen, weniger nächtlichem Aufwachen, längerem Schlaf und besserer Stimmung der Eltern zusammen. Entscheidend ist kein magischer Schritt, sondern Wiederholung.',
        'Die American Academy of Pediatrics schlägt “Brush, Book, Bed” vor: Hygiene, Buch, Schlaf. Es geht nicht nur um Schlaf. Gemeinsames Lesen unterstützt Sprache, Nähe und sozial-emotionale Entwicklung, wenn der Erwachsene wirklich dabei ist.',
        'Schlafexpertinnen empfehlen oft, helles Licht, Bildschirme und aktive Stimulation etwa eine Stunde vor dem Schlaf zu reduzieren. Eine digitale Geschichte sollte daher als leiser Modus funktionieren: kein Tippen, Spiel, Autoplay oder Suchen nach mehr.',
        'Über Audio sollte man ehrlich sprechen: Es ist kein belegtes Heilmittel gegen Schlaflosigkeit. Als Teil eines vorhersehbaren Rituals kann es aber helfen, den Abendrhythmus zu halten, besonders wenn Erwachsene müde sind oder das Kind eine vertraute Stimme braucht.',
      ],
      fr: [
        'Les recherches de Jodi Mindell et ses collègues montrent que les routines régulières sont associées à un coucher plus tôt, moins de réveils nocturnes, plus de sommeil et un meilleur état parental. Ce qui compte n’est pas une étape magique, mais la répétition.',
        'L’American Academy of Pediatrics propose une logique simple : “Brush, Book, Bed” : hygiène, livre, sommeil. Ce n’est pas seulement le sommeil. La lecture partagée soutient le langage, le lien et le développement socio-émotionnel quand l’adulte est vraiment présent.',
        'Les spécialistes du sommeil recommandent souvent de réduire lumière vive, écrans et stimulation active environ une heure avant le coucher. Une histoire numérique doit donc être en mode calme : pas de clics, pas de jeu, pas d’autoplay, pas de recherche de plus.',
        'Il faut parler de l’audio honnêtement : ce n’est pas un remède prouvé contre l’insomnie. Mais dans un rituel prévisible, il peut aider la famille à garder le rythme du soir, surtout quand l’adulte est fatigué ou que l’enfant a besoin d’une voix familière.',
      ],
      pl: [
        'Badania Jodi Mindell i współpracowników pokazują, że regularne rutyny wieczorne wiążą się z wcześniejszym zasypianiem, mniejszą liczbą nocnych pobudek, dłuższym snem i lepszym samopoczuciem rodziców. Ważny jest nie magiczny krok, ale powtarzalność.',
        'American Academy of Pediatrics proponuje prostą logikę “Brush, Book, Bed”: higiena, książka, sen. To nie tylko sen. Wspólne czytanie wspiera język, bliskość i rozwój społeczno-emocjonalny, gdy dorosły naprawdę jest obok.',
        'Specjaliści od snu często zalecają ograniczanie jasnego światła, ekranów i aktywnej stymulacji około godziny przed snem. Dlatego cyfrowa historia powinna działać jak tryb cichy: bez klikania, gry, autoplay i pokusy “poszukajmy jeszcze”.',
        'O audio warto mówić uczciwie: nie jest udowodnionym lekarstwem na bezsenność. Ale jako część przewidywalnego rytuału może pomóc rodzinie utrzymać rytm wieczoru, zwłaszcza gdy dorosły jest zmęczony albo dziecko potrzebuje znajomego głosu.',
      ],
    },
    storyUse: {
      uk: [
        'Створіть маленьку формулу: “обираємо героя — слухаємо — бажаємо добра герою — вимикаємо”. Повтор формули робить цифровий досвід передбачуваним.',
        'Для короткого вечора обирайте не новий великий світ, а знайомого героя або продовження серії. Дитині легше заспокоїтися, коли не треба щоразу вивчати нові правила, імена й небезпеки.',
        'Якщо дитина слухає аудіо, домовтеся перед стартом: одна аудіоісторія, екран лежить екраном вниз або в руках дорослого, після фіналу лише одна фраза на ніч. Це прибирає “меню” з моменту засинання.',
        'Добра нічна історія не має закінчуватися гострим cliffhanger. Краще м’яке закриття: герой повернувся додому, знайшов відповідь, подякував другу, погасив світло, почув тихе “до завтра”.',
      ],
      en: [
        'Use a small formula: “choose a hero, listen, wish the hero well, turn off.” Repetition makes the digital experience predictable.',
        'On short nights, choose a familiar hero or a series continuation instead of a large new world. It is easier to settle when the child does not need to learn new rules, names, and dangers.',
        'If the child listens to audio, agree before starting: one audio story, screen face down or in the adult’s hands, then one goodnight phrase. This removes the “menu” from the moment of falling asleep.',
        'A bedtime story should not end with a sharp cliffhanger. A soft closure works better: the hero returns home, finds an answer, thanks a friend, turns off the light, or hears a quiet “see you tomorrow.”',
      ],
      ru: [
        'Создайте маленькую формулу: “выбираем героя — слушаем — желаем герою добра — выключаем”. Повтор делает цифровой опыт предсказуемым.',
        'В короткий вечер выбирайте не новый большой мир, а знакомого героя или продолжение серии. Ребенку легче успокоиться, когда не нужно каждый раз изучать новые правила, имена и опасности.',
        'Если ребенок слушает аудио, договоритесь до старта: одна аудиоистория, экран лежит экраном вниз или в руках взрослого, после финала одна фраза на ночь. Это убирает “меню” из момента засыпания.',
        'Хорошая ночная история не должна заканчиваться острым cliffhanger. Лучше мягкое закрытие: герой вернулся домой, нашел ответ, поблагодарил друга, погасил свет, услышал тихое “до завтра”.',
      ],
      es: [
        'Usa una pequeña fórmula: “elegimos héroe, escuchamos, deseamos algo bueno, apagamos”. La repetición vuelve predecible la experiencia digital.',
        'En noches cortas, elige un héroe conocido o una continuación de serie en vez de un mundo nuevo. Es más fácil calmarse si el niño no aprende reglas, nombres y peligros nuevos cada vez.',
        'Si escucha audio, acuerden antes: una audiohistoria, pantalla boca abajo o en manos del adulto, y después una frase de buenas noches. Así el “menú” sale del momento de dormir.',
        'Una historia nocturna no debería terminar con cliffhanger fuerte. Funciona mejor un cierre suave: el héroe vuelve a casa, encuentra respuesta, agradece a un amigo, apaga la luz o escucha “hasta mañana”.',
      ],
      de: [
        'Nutze eine kleine Formel: “Figur wählen, hören, Gutes wünschen, ausschalten”. Wiederholung macht digitale Erfahrung vorhersehbar.',
        'An kurzen Abenden lieber vertraute Figur oder Serienfortsetzung als eine große neue Welt. Beruhigung fällt leichter, wenn das Kind nicht jedes Mal neue Regeln, Namen und Gefahren lernen muss.',
        'Wenn das Kind Audio hört, vorher klären: eine Audiogeschichte, Bildschirm nach unten oder in Erwachsenenhänden, danach ein Gute-Nacht-Satz. So verschwindet das Menü aus dem Einschlafmoment.',
        'Eine Abendgeschichte sollte nicht mit starkem Cliffhanger enden. Besser ist weicher Abschluss: Figur kommt heim, findet Antwort, dankt einem Freund, löscht das Licht oder hört “bis morgen”.',
      ],
      fr: [
        'Utilisez une petite formule : “choisir le héros, écouter, lui souhaiter du bien, éteindre”. La répétition rend l’expérience numérique prévisible.',
        'Les soirs courts, choisissez un héros connu ou la suite d’une série plutôt qu’un grand monde nouveau. L’enfant se calme mieux s’il n’a pas à apprendre de nouvelles règles, noms et dangers.',
        'Si l’enfant écoute l’audio, convenez avant : une histoire audio, écran face contre table ou dans les mains de l’adulte, puis une phrase de bonne nuit. Le menu sort du moment d’endormissement.',
        'Une histoire du soir ne doit pas finir par un cliffhanger fort. Mieux vaut une fermeture douce : le héros rentre, trouve une réponse, remercie un ami, éteint la lumière ou entend “à demain”.',
      ],
      pl: [
        'Użyj małej formuły: “wybieramy bohatera, słuchamy, życzymy mu dobrze, wyłączamy”. Powtórzenie daje przewidywalność.',
        'W krótki wieczór wybierz znanego bohatera albo kontynuację serii zamiast dużego nowego świata. Dziecku łatwiej się wyciszyć, gdy nie musi poznawać nowych zasad, imion i zagrożeń.',
        'Jeśli dziecko słucha audio, umówcie się przed startem: jedna audiohistoria, ekran leży ekranem w dół albo jest w rękach dorosłego, po finale jedno zdanie na dobranoc. To usuwa menu z momentu zasypiania.',
        'Dobra historia na noc nie powinna kończyć się ostrym cliffhangerem. Lepiej działa miękkie zamknięcie: bohater wraca do domu, znajduje odpowiedź, dziękuje przyjacielowi, gasi światło albo słyszy “do jutra”.',
      ],
    },
    adjustment: {
      uk: [
        'Якщо дитина торгується за ще одну історію, не сперечайтеся з сюжетом. Посилайтеся на ритуал: “сьогодні історія завершилась”. Межа звучить спокійніше, коли вона не залежить від настрою дорослого.',
        'Якщо після історії дитина оживає, скоротіть вибір наступного разу: не переглядати галерею, не створювати нового героя, не обирати голос. Підготуйте історію заздалегідь і залиште лише кнопку старту.',
        'Якщо дитина боїться засинати одна, історія не має замінювати вашу присутність. Краще короткий контакт після фіналу: “я поруч, історія завершилась, тепер тіло відпочиває”.',
        'Якщо проблеми зі сном регулярні, сильні або супроводжуються тривогою, нічними пробудженнями чи втомою вдень, це вже не питання “кращої історії”. Варто обговорити сон із педіатром або спеціалістом.',
      ],
      en: [
        'If the child bargains for one more story, do not debate the plot. Refer to the ritual: “Tonight, the story is complete.” A boundary feels calmer when it does not depend on the adult’s mood.',
        'If the child becomes more energized after the story, reduce choice next time: no gallery browsing, no new hero, no voice selection. Prepare the story beforehand and leave only the start button.',
        'If the child is afraid to fall asleep alone, the story should not replace your presence. Use a short contact after the ending: “I am nearby, the story is complete, now your body rests.”',
        'If sleep problems are regular, intense, or come with anxiety, night wakings, or daytime fatigue, this is no longer a “better story” issue. Talk with a pediatrician or specialist.',
      ],
      ru: [
        'Если ребенок торгуется за еще одну историю, не спорьте о сюжете. Ссылайтесь на ритуал: “сегодня история завершилась”. Граница звучит спокойнее, когда не зависит от настроения взрослого.',
        'Если после истории ребенок оживляется, в следующий раз сократите выбор: не смотреть галерею, не создавать нового героя, не выбирать голос. Подготовьте историю заранее и оставьте только кнопку старта.',
        'Если ребенок боится засыпать один, история не должна заменять ваше присутствие. Лучше короткий контакт после финала: “я рядом, история завершилась, теперь тело отдыхает”.',
        'Если проблемы со сном регулярные, сильные или идут вместе с тревогой, ночными пробуждениями или дневной усталостью, это уже не вопрос “лучшей истории”. Стоит обсудить сон с педиатром или специалистом.',
      ],
      es: [
        'Si pide otra historia, no negocies la trama. Vuelve al ritual: “hoy la historia terminó”. El límite suena más tranquilo cuando no depende del humor adulto.',
        'Si después de la historia se activa más, reduce la elección la próxima vez: sin galería, sin héroe nuevo, sin elegir voz. Prepara la historia antes y deja solo el botón de empezar.',
        'Si teme dormirse solo, la historia no debe sustituir tu presencia. Usa un contacto breve después del final: “estoy cerca, la historia terminó, ahora el cuerpo descansa”.',
        'Si los problemas de sueño son regulares, intensos o vienen con ansiedad, despertares o cansancio diurno, ya no es cuestión de “mejor historia”. Conviene hablar con pediatra o especialista.',
      ],
      de: [
        'Wenn das Kind noch eine Geschichte verhandelt, diskutiere nicht über die Handlung. Verweise auf das Ritual: “Heute ist die Geschichte vollständig.” Eine Grenze wirkt ruhiger, wenn sie nicht von der Stimmung abhängt.',
        'Wenn das Kind nach der Geschichte aufdreht, beim nächsten Mal Wahl reduzieren: keine Galerie, keine neue Figur, keine Stimmwahl. Geschichte vorher vorbereiten, nur Startknopf lassen.',
        'Wenn das Kind Angst hat, allein einzuschlafen, soll die Geschichte deine Präsenz nicht ersetzen. Nach dem Ende kurzer Kontakt: “Ich bin in der Nähe, die Geschichte ist fertig, der Körper ruht jetzt.”',
        'Wenn Schlafprobleme regelmäßig, stark oder mit Angst, nächtlichem Aufwachen oder Tagesmüdigkeit auftreten, geht es nicht mehr um eine bessere Geschichte. Dann mit Kinderarzt oder Fachperson sprechen.',
      ],
      fr: [
        'Si l’enfant négocie encore une histoire, ne discutez pas l’intrigue. Revenez au rituel : “ce soir, l’histoire est terminée”. La limite est plus calme quand elle ne dépend pas de l’humeur adulte.',
        'Si l’enfant s’active après l’histoire, réduisez le choix la prochaine fois : pas de galerie, pas de nouveau héros, pas de choix de voix. Préparez l’histoire et laissez seulement le bouton de départ.',
        'Si l’enfant a peur de s’endormir seul, l’histoire ne doit pas remplacer votre présence. Gardez un contact court après la fin : “je suis près de toi, l’histoire est finie, maintenant le corps se repose”.',
        'Si les problèmes de sommeil sont réguliers, intenses ou accompagnés d’anxiété, réveils nocturnes ou fatigue diurne, ce n’est plus une question de “meilleure histoire”. Parlez-en à un pédiatre ou spécialiste.',
      ],
      pl: [
        'Jeśli dziecko negocjuje jeszcze jedną historię, nie dyskutuj o fabule. Odwołaj się do rytuału: “dziś historia się skończyła”. Granica brzmi spokojniej, gdy nie zależy od nastroju dorosłego.',
        'Jeśli po historii dziecko się pobudza, następnym razem ogranicz wybór: bez galerii, bez nowego bohatera, bez wyboru głosu. Przygotuj historię wcześniej i zostaw tylko start.',
        'Jeśli dziecko boi się zasypiać samo, historia nie powinna zastępować twojej obecności. Po finale krótki kontakt: “jestem blisko, historia skończona, teraz ciało odpoczywa”.',
        'Jeśli problemy ze snem są regularne, silne albo łączą się z lękiem, nocnymi pobudkami lub zmęczeniem w dzień, to nie jest już kwestia “lepszej historii”. Warto porozmawiać z pediatrą lub specjalistą.',
      ],
    },
    checklist: {
      uk: ['Заздалегідь назвати кількість історій.', 'Повторювати той самий фінальний жест.', 'Не відкривати новий вибір після фіналу.'],
      en: ['Name the number of stories upfront.', 'Repeat the same closing gesture.', 'Do not open a new choice after the ending.'],
      ru: ['Заранее назвать количество историй.', 'Повторять один финальный жест.', 'Не открывать новый выбор после финала.'],
      es: ['Di cuántas historias habrá.', 'Repite el mismo gesto final.', 'No abras otra elección al final.'],
      de: ['Anzahl vorher nennen.', 'Den gleichen Abschluss wiederholen.', 'Nach dem Ende keine neue Wahl öffnen.'],
      fr: ['Annoncer le nombre d’histoires.', 'Répéter le même geste final.', 'Ne pas rouvrir un choix après la fin.'],
      pl: ['Powiedz wcześniej, ile historii.', 'Powtarzaj ten sam gest końcowy.', 'Nie otwieraj nowego wyboru po finale.'],
    },
    quote: {
      text: {
        uk: 'Регулярні вечірні рутини пов’язані з кращими результатами сну в маленьких дітей.',
        en: 'Regular bedtime routines are associated with better sleep outcomes in young children.',
        ru: 'Регулярные ритуалы перед сном связаны с лучшими показателями сна у маленьких детей.',
        es: 'Las rutinas regulares antes de dormir se asocian con mejores resultados de sueño en niños pequeños.',
        de: 'Regelmäßige Abendroutinen sind bei kleinen Kindern mit besseren Schlafergebnissen verbunden.',
        fr: 'Les routines régulières du coucher sont associées à de meilleurs résultats de sommeil chez les jeunes enfants.',
        pl: 'Regularne rutyny przed snem wiążą się z lepszym snem u małych dzieci.',
      },
      attribution: 'Mindell et al.',
      sourceLabel: 'Sleep Medicine Reviews',
      sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2675894/',
    },
    sources: [
      { label: 'AAP / HealthyChildren: Brush, Book, Bed', url: 'https://www.healthychildren.org/English/healthy-living/oral-health/Pages/Brush-Book-Bed.aspx' },
      { label: 'AAP / HealthyChildren: Healthy Sleep Habits', url: 'https://www.healthychildren.org/english/healthy-living/sleep/pages/healthy-sleep-habits-how-many-hours-does-your-child-need.aspx' },
      { label: 'Mindell et al.: bedtime routine study', url: 'https://academic.oup.com/sleep/article/32/5/599/2454387' },
      { label: 'Mindell et al.: bedtime routines review', url: 'https://pubmed.ncbi.nlm.nih.gov/29195725/' },
      { label: 'Society of Pediatric Psychology: bedtime problems', url: 'https://pedpsych.org/fact_sheets/bedtime_problems/' },
      { label: 'AAP Pediatrics: Literacy Promotion', url: 'https://publications.aap.org/pediatrics/article/154/6/e2024069091/199468/Literacy-Promotion-An-Essential-Component-of' },
      { label: 'JMIR Pediatrics and Parenting: Sleep apps content analysis', url: 'https://pediatrics.jmir.org/2022/1/e32129/' },
    ],
    visualDirection: 'A cozy family bedtime scene where the glowing story page fades into stars over the room.',
    relatedSlugs: ['audio-bedtime-stories', 'five-minute-stories'],
    inlineImages: articleInlineImages(
      'bedtime-story-family-ritual',
      l10n(
        'Планшет лежить на комоді, поки дорослий сидить поруч із дитиною в ліжку',
        'A tablet rests on a dresser while a parent sits beside a child in bed',
        'Планшет лежит на комоде, пока взрослый сидит рядом с ребенком в кровати',
        'Una tableta descansa sobre una cómoda mientras un adulto se sienta junto al niño en la cama',
        'Ein Tablet liegt auf einer Kommode, während ein Elternteil neben dem Kind im Bett sitzt',
        'Une tablette repose sur une commode pendant qu’un parent s’assoit près de l’enfant au lit',
        'Tablet leży na komodzie, gdy rodzic siedzi obok dziecka w łóżku'
      ),
      l10n(
        'Коли планшет не в руках дитини, історія краще залишається частиною спокійного ритуалу.',
        'When the tablet is not in the child’s hands, the story stays part of a calm ritual.',
        'Когда планшет не в руках ребенка, история лучше остается частью спокойного ритуала.',
        'Cuando la tableta no está en las manos del niño, la historia sigue siendo un ritual tranquilo.',
        'Liegt das Tablet nicht in Kinderhänden, bleibt die Geschichte Teil eines ruhigen Rituals.',
        'Quand la tablette n’est pas dans les mains de l’enfant, l’histoire reste un rituel calme.',
        'Gdy tablet nie jest w rękach dziecka, historia pozostaje częścią spokojnego rytuału.'
      ),
      l10n(
        'Планшет відкладений на плетений піднос, а дорослий завершує вечірній ритуал',
        'A tablet is set aside on a woven tray while a parent closes the bedtime ritual',
        'Планшет отложен на плетеный поднос, а взрослый завершает вечерний ритуал',
        'La tableta queda apartada en una bandeja tejida mientras el adulto cierra el ritual',
        'Das Tablet liegt auf einem geflochtenen Tablett, während der Elternteil das Abendritual abschließt',
        'La tablette est posée sur un plateau tressé pendant que le parent clôt le rituel du soir',
        'Tablet odłożono na plecioną tacę, a rodzic kończy wieczorny rytuał'
      ),
      l10n(
        'Фінальний жест показує: історія завершена, дитина в безпеці, вечір рухається до сну.',
        'The final gesture says: the story is complete, the child is safe, and the evening moves toward sleep.',
        'Финальный жест говорит: история завершена, ребенок в безопасности, вечер движется ко сну.',
        'El gesto final dice: la historia terminó, el niño está seguro y la noche avanza hacia el sueño.',
        'Die letzte Geste sagt: Die Geschichte ist fertig, das Kind ist sicher, der Abend führt in den Schlaf.',
        'Le geste final dit : l’histoire est terminée, l’enfant est en sécurité, la soirée va vers le sommeil.',
        'Ostatni gest mówi: historia skończona, dziecko jest bezpieczne, wieczór prowadzi do snu.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Рамка', title: 'Ритуал має берегти кінець дня', body: 'Історія допомагає, коли вона завершує вечір, а не відкриває новий нескінченний вибір.' },
        { eyebrow: 'Екран', title: 'Проблема не лише в світлі', body: 'Найчастіше заважають інтерактивність, автопродовження і відчуття, що після історії ще щось можна обрати.' },
        { eyebrow: 'Близькість', title: 'Голос дорослого важить більше за функцію', body: 'Навіть цифрова історія стає теплішою, якщо дорослий поруч, чує реакцію і тримає фінальну межу.' },
      ],
      en: [
        { eyebrow: 'Frame', title: 'A ritual protects the end of the day', body: 'A story helps when it closes the evening instead of opening an endless menu of choices.' },
        { eyebrow: 'Screen', title: 'The issue is not only light', body: 'Interactivity, autoplay, and the sense that another choice is available often keep children engaged too long.' },
        { eyebrow: 'Closeness', title: 'The adult voice matters more than the feature', body: 'Even a digital story feels warmer when an adult stays nearby, notices reactions, and holds the ending.' },
      ],
      ru: [
        { eyebrow: 'Рамка', title: 'Ритуал бережет конец дня', body: 'История помогает, когда закрывает вечер, а не открывает бесконечный список новых выборов.' },
        { eyebrow: 'Экран', title: 'Проблема не только в свете', body: 'Чаще мешают интерактивность, автопродолжение и ощущение, что после истории можно выбрать еще что-то.' },
        { eyebrow: 'Близость', title: 'Голос взрослого важнее функции', body: 'Даже цифровая история становится теплее, если взрослый рядом, слышит реакции и держит финальную границу.' },
      ],
      es: [
        { eyebrow: 'Marco', title: 'El ritual protege el final del día', body: 'La historia ayuda cuando cierra la tarde, no cuando abre un menú infinito de elecciones.' },
        { eyebrow: 'Pantalla', title: 'No es solo la luz', body: 'Interactividad, autoplay y la idea de que aún se puede elegir algo suelen prolongar demasiado.' },
        { eyebrow: 'Cercanía', title: 'La voz adulta pesa más que la función', body: 'Incluso una historia digital se vuelve cálida si el adulto está cerca, nota reacciones y sostiene el final.' },
      ],
      de: [
        { eyebrow: 'Rahmen', title: 'Ein Ritual schützt das Ende des Tages', body: 'Eine Geschichte hilft, wenn sie den Abend schließt, nicht ein endloses Auswahlmenü öffnet.' },
        { eyebrow: 'Bildschirm', title: 'Es geht nicht nur um Licht', body: 'Interaktivität, Autoplay und weitere Wahlmöglichkeiten halten Kinder oft zu lange wach.' },
        { eyebrow: 'Nähe', title: 'Die erwachsene Stimme zählt mehr als die Funktion', body: 'Auch digital wird die Geschichte wärmer, wenn ein Erwachsener da ist, Reaktionen sieht und das Ende hält.' },
      ],
      fr: [
        { eyebrow: 'Cadre', title: 'Le rituel protège la fin de journée', body: 'L’histoire aide quand elle ferme le soir, pas quand elle ouvre un menu infini de choix.' },
        { eyebrow: 'Écran', title: 'Ce n’est pas seulement la lumière', body: 'L’interactivité, l’autoplay et l’idée de pouvoir encore choisir prolongent souvent trop.' },
        { eyebrow: 'Présence', title: 'La voix adulte compte plus que la fonction', body: 'Même numérique, l’histoire devient chaleureuse si l’adulte reste près, observe et tient la fin.' },
      ],
      pl: [
        { eyebrow: 'Rama', title: 'Rytuał chroni koniec dnia', body: 'Historia pomaga, gdy zamyka wieczór, a nie otwiera nieskończone menu wyborów.' },
        { eyebrow: 'Ekran', title: 'To nie tylko światło', body: 'Często przeszkadza interaktywność, autoplay i poczucie, że po historii można wybrać następną.' },
        { eyebrow: 'Bliskość', title: 'Głos dorosłego ważniejszy niż funkcja', body: 'Nawet cyfrowa historia jest cieplejsza, gdy dorosły jest obok, widzi reakcje i trzyma zakończenie.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Вечірній маршрут без зайвого екрана',
        intro: 'Це не жорсткий графік. Це послідовність, яка допомагає дитині розуміти, що буде далі.',
        columns: ['Коли', 'Що робити', 'Навіщо'],
        rows: [
          ['За 60 хв', 'Екрани й активні ігри поступово завершуються', 'Мозок отримує сигнал, що день сповільнюється'],
          ['За 25 хв', 'Піжама, зуби, приглушене світло', 'Рутинні дії знімають зайві переговори'],
          ['За 15 хв', 'Одна історія або одне аудіо', 'Є близькість, але є межа'],
          ['Фінал', 'Одна фраза на ніч і вимкнення', 'Кінець повторюється й стає передбачуваним'],
        ],
      },
      en: {
        heading: 'An evening route without extra screen time',
        intro: 'This is not a rigid schedule. It is a sequence that helps the child know what comes next.',
        columns: ['When', 'What to do', 'Why'],
        rows: [
          ['60 min before', 'Screens and active games wind down', 'The brain gets a signal that the day is slowing'],
          ['25 min before', 'Pajamas, teeth, dim light', 'Routine actions reduce negotiation'],
          ['15 min before', 'One story or one audio story', 'There is closeness, and there is a boundary'],
          ['Ending', 'One night phrase and turn off', 'The ending repeats and becomes predictable'],
        ],
      },
      ru: {
        heading: 'Вечерний маршрут без лишнего экрана',
        intro: 'Это не жесткий график, а последовательность, которая помогает ребенку понимать, что дальше.',
        columns: ['Когда', 'Что делать', 'Зачем'],
        rows: [
          ['За 60 мин', 'Экраны и активные игры постепенно заканчиваются', 'Мозг получает сигнал, что день замедляется'],
          ['За 25 мин', 'Пижама, зубы, приглушенный свет', 'Рутинные действия уменьшают переговоры'],
          ['За 15 мин', 'Одна история или одно аудио', 'Есть близость, но есть граница'],
          ['Финал', 'Одна ночная фраза и выключение', 'Конец повторяется и становится предсказуемым'],
        ],
      },
      es: {
        heading: 'Ruta nocturna sin pantalla extra',
        intro: 'No es un horario rígido, sino una secuencia que ayuda a saber qué viene después.',
        columns: ['Cuándo', 'Qué hacer', 'Para qué'],
        rows: [
          ['60 min antes', 'Pantallas y juegos activos se cierran', 'El cerebro nota que el día baja el ritmo'],
          ['25 min antes', 'Pijama, dientes, luz baja', 'La rutina reduce negociaciones'],
          ['15 min antes', 'Una historia o un audio', 'Hay cercanía y también límite'],
          ['Final', 'Una frase de noche y apagar', 'El final se repite y se vuelve predecible'],
        ],
      },
      de: {
        heading: 'Abendroute ohne zusätzlichen Bildschirm',
        intro: 'Kein starrer Plan, sondern eine Reihenfolge, die zeigt, was als Nächstes kommt.',
        columns: ['Wann', 'Was tun', 'Warum'],
        rows: [
          ['60 Min vorher', 'Bildschirme und aktive Spiele auslaufen lassen', 'Das Gehirn spürt, dass der Tag langsamer wird'],
          ['25 Min vorher', 'Schlafanzug, Zähne, gedimmtes Licht', 'Routine senkt Verhandlungen'],
          ['15 Min vorher', 'Eine Geschichte oder ein Audio', 'Nähe mit klarer Grenze'],
          ['Ende', 'Ein Nachtsatz und ausschalten', 'Das Ende wiederholt sich und wird vorhersehbar'],
        ],
      },
      fr: {
        heading: 'Un trajet du soir sans écran en plus',
        intro: 'Ce n’est pas un planning rigide, mais une séquence qui aide l’enfant à prévoir.',
        columns: ['Quand', 'Que faire', 'Pourquoi'],
        rows: [
          ['60 min avant', 'Écrans et jeux actifs se terminent', 'Le cerveau reçoit un signal de ralentissement'],
          ['25 min avant', 'Pyjama, dents, lumière douce', 'La routine réduit les négociations'],
          ['15 min avant', 'Une histoire ou un audio', 'Il y a présence et limite'],
          ['Fin', 'Une phrase de nuit et on éteint', 'La fin répétée devient prévisible'],
        ],
      },
      pl: {
        heading: 'Wieczorna ścieżka bez dodatkowego ekranu',
        intro: 'To nie sztywny plan, tylko kolejność, która pomaga dziecku wiedzieć, co dalej.',
        columns: ['Kiedy', 'Co robić', 'Po co'],
        rows: [
          ['60 min wcześniej', 'Ekrany i aktywne zabawy wygaszają się', 'Mózg dostaje sygnał zwolnienia'],
          ['25 min wcześniej', 'Piżama, zęby, przygaszone światło', 'Rutyna zmniejsza negocjacje'],
          ['15 min wcześniej', 'Jedna historia albo jedno audio', 'Jest bliskość i granica'],
          ['Finał', 'Jedno zdanie na noc i wyłączenie', 'Koniec się powtarza i staje przewidywalny'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Мінімум',
        heading: 'Коли вечір важкий, скоротіть ритуал, а не скасовуйте',
        intro: 'Навіть дуже коротка версія зберігає передбачуваність.',
        steps: [
          { title: 'Три звичні дії', body: 'Зуби, піжама, світло тихіше. Без довгого пояснення.' },
          { title: 'Одна коротка історія', body: 'Не найновіша й не найгучніша, а та, що легко завершується.' },
          { title: 'Один контакт', body: 'Обійми, долоня або фраза, яку дитина чує щовечора.' },
          { title: 'Один кінець', body: 'Після фіналу не відкривати вибір знову.' },
        ],
      },
      en: {
        eyebrow: 'Minimum',
        heading: 'On hard nights, shorten the ritual instead of canceling it',
        intro: 'Even a very short version keeps predictability.',
        steps: [
          { title: 'Three familiar actions', body: 'Teeth, pajamas, softer light. No long explanation.' },
          { title: 'One short story', body: 'Not the newest or loudest, but one that ends easily.' },
          { title: 'One contact', body: 'A hug, hand, or phrase the child hears every night.' },
          { title: 'One ending', body: 'After the ending, do not reopen the choice.' },
        ],
      },
      ru: {
        eyebrow: 'Минимум',
        heading: 'В сложный вечер сокращайте ритуал, а не отменяйте',
        intro: 'Даже очень короткая версия сохраняет предсказуемость.',
        steps: [
          { title: 'Три привычных действия', body: 'Зубы, пижама, свет тише. Без длинных объяснений.' },
          { title: 'Одна короткая история', body: 'Не самая новая и громкая, а та, что легко заканчивается.' },
          { title: 'Один контакт', body: 'Объятие, ладонь или фраза, которую ребенок слышит каждый вечер.' },
          { title: 'Один конец', body: 'После финала не открывать выбор заново.' },
        ],
      },
      es: {
        eyebrow: 'Mínimo',
        heading: 'En noches difíciles, acorta el ritual en vez de cancelarlo',
        intro: 'Incluso una versión breve mantiene previsibilidad.',
        steps: [
          { title: 'Tres acciones conocidas', body: 'Dientes, pijama, luz más suave. Sin explicación larga.' },
          { title: 'Una historia corta', body: 'No la más nueva ni intensa, sino una que cierre fácil.' },
          { title: 'Un contacto', body: 'Abrazo, mano o frase que oye cada noche.' },
          { title: 'Un final', body: 'Después del final, no reabrir la elección.' },
        ],
      },
      de: {
        eyebrow: 'Minimum',
        heading: 'An schweren Abenden Ritual kürzen, nicht streichen',
        intro: 'Auch eine sehr kurze Version erhält Vorhersagbarkeit.',
        steps: [
          { title: 'Drei vertraute Schritte', body: 'Zähne, Schlafanzug, weicheres Licht. Keine lange Erklärung.' },
          { title: 'Eine kurze Geschichte', body: 'Nicht die neueste oder lauteste, sondern eine, die leicht endet.' },
          { title: 'Ein Kontakt', body: 'Umarmung, Hand oder Satz, den das Kind jeden Abend hört.' },
          { title: 'Ein Ende', body: 'Nach dem Ende die Wahl nicht neu öffnen.' },
        ],
      },
      fr: {
        eyebrow: 'Minimum',
        heading: 'Les soirs difficiles, raccourcir le rituel plutôt que l’annuler',
        intro: 'Même une version très courte garde la prévisibilité.',
        steps: [
          { title: 'Trois gestes connus', body: 'Dents, pyjama, lumière douce. Pas de longue explication.' },
          { title: 'Une histoire courte', body: 'Pas la plus nouvelle ni intense, mais celle qui se ferme facilement.' },
          { title: 'Un contact', body: 'Un câlin, une main ou une phrase entendue chaque soir.' },
          { title: 'Une fin', body: 'Après la fin, ne pas rouvrir le choix.' },
        ],
      },
      pl: {
        eyebrow: 'Minimum',
        heading: 'W trudny wieczór skróć rytuał, nie odwołuj go',
        intro: 'Nawet bardzo krótka wersja zachowuje przewidywalność.',
        steps: [
          { title: 'Trzy znajome działania', body: 'Zęby, piżama, cichsze światło. Bez długiego tłumaczenia.' },
          { title: 'Jedna krótka historia', body: 'Nie najnowsza ani najgłośniejsza, tylko taka, która łatwo się kończy.' },
          { title: 'Jeden kontakt', body: 'Przytulenie, dłoń albo zdanie słyszane co wieczór.' },
          { title: 'Jeden koniec', body: 'Po finale nie otwierać wyboru od nowa.' },
        ],
      },
    },
  },
  {
    slug: 'child-created-characters',
    heroImage: '/landing/blog/child-created-characters-scene-01.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Персонажі', en: 'Characters', ru: 'Персонажи', es: 'Personajes', de: 'Figuren', fr: 'Personnages', pl: 'Postacie' },
    title: {
      uk: 'Коли дитина сама створює персонажа: як не перетворити творчість на анкету',
      en: 'When children create their own characters: how to keep it creative',
      ru: 'Когда ребенок сам создает персонажа: как не превратить творчество в анкету',
      es: 'Cuando un niño crea su personaje: cómo mantener la creatividad',
      de: 'Wenn Kinder eigene Figuren erschaffen: kreativ statt Formular',
      fr: 'Quand l’enfant crée son personnage : garder la créativité',
      pl: 'Gdy dziecko tworzy postać: jak nie zrobić z tego formularza',
    },
    description: {
      uk: 'Чому власний герой допомагає дитині відчути авторство, як поєднати фантазію з межами і які вибори справді потрібні для стабільної історії.',
      en: 'Why a child-made hero builds ownership, how to combine imagination with boundaries, and which choices truly matter for a stable story.',
      ru: 'Почему собственный герой помогает ребенку почувствовать авторство, как соединить фантазию с границами и какие выборы реально нужны истории.',
      es: 'Por qué un héroe creado por el niño da autoría, cómo unir imaginación y límites, y qué elecciones importan para una historia estable.',
      de: 'Warum eine eigene Figur Autorschaft stärkt, wie Fantasie und Grenzen zusammenpassen und welche Wahlen für eine stabile Geschichte zählen.',
      fr: 'Pourquoi un héros créé par l’enfant renforce l’appropriation, comment unir imagination et cadre, et quels choix comptent vraiment.',
      pl: 'Dlaczego własny bohater buduje poczucie autorstwa, jak połączyć wyobraźnię z granicami i które wybory naprawdę liczą się w historii.',
    },
    lead: {
      uk: 'Коли дитина створює героя, вона не просто “заповнює профіль”. Вона пробує керувати світом історії: обирає, хто там важливий, що цей герой уміє, чого боїться і як змінюється.',
      en: 'When a child creates a hero, they are not just “filling a profile.” They are trying to steer a story world: who matters there, what the hero can do, what scares them, and how they change.',
      ru: 'Когда ребенок создает героя, он не просто “заполняет профиль”. Он пробует управлять миром истории: кто там важен, что герой умеет, чего боится и как меняется.',
      es: 'Cuando un niño crea un héroe, no solo “rellena un perfil”. Intenta dirigir un mundo narrativo: quién importa, qué puede hacer, qué teme y cómo cambia.',
      de: 'Wenn ein Kind eine Figur erschafft, füllt es nicht nur ein Profil aus. Es steuert eine Geschichtenwelt: wer wichtig ist, was die Figur kann, wovor sie Angst hat und wie sie sich verändert.',
      fr: 'Quand un enfant crée un héros, il ne “remplit” pas seulement un profil. Il pilote un monde d’histoire : qui compte, ce que le héros sait faire, ce qui lui fait peur et comment il change.',
      pl: 'Gdy dziecko tworzy bohatera, nie tylko “wypełnia profil”. Próbuje kierować światem historii: kto jest ważny, co bohater potrafi, czego się boi i jak się zmienia.',
    },
    focus: {
      uk: [
        'Власний персонаж дає дитині відчуття авторства. Це вже не “мені дали готову історію”, а “я відкрив двері у свій світ і запросив туди героя”. Для дітей приблизно 8-12 років це особливо важливо: вони хочуть більше самостійності, але все ще потребують ясної рамки.',
        'Структурні вибори допомагають: “хто це?”, “якого кольору?”, “що вміє?”, “чого боїться?”, “як допомагає друзям?”. Вільний текст краще залишати не для всього підряд, а для однієї особливої ідеї, яку дитина справді хоче додати.',
        'Добрий конструктор персонажа має бути схожим на гру: великі картки, кольорові кружки, короткі назви, миттєвий результат. Якщо дитина бачить, як “синій робот, який світить у темряві, але соромиться нових друзів” одразу стає героєм сцени, вибір починає мати сенс.',
      ],
      en: [
        'A child-made character gives the child a feeling of authorship. It is no longer “someone gave me a story”; it is “I opened a door into my world and invited a hero in.” Around ages 8-12, this matters a lot: children want more independence while still needing a clear frame.',
        'Structured choices help: “who is it?”, “what color?”, “what can it do?”, “what scares it?”, “how does it help friends?” Free text should not carry everything. It works best as one special idea the child truly wants to add.',
        'A good character builder should feel like play: large cards, color dots, short labels, and an immediate result. When a child sees that “a blue robot who glows in the dark but feels shy with new friends” becomes a scene hero, the choices start to matter.',
      ],
      ru: [
        'Собственный персонаж дает ребенку чувство авторства. Это уже не “мне дали готовую историю”, а “я открыл дверь в свой мир и пригласил туда героя”. В возрасте примерно 8-12 лет это особенно важно: детям хочется больше самостоятельности, но понятная рамка все еще нужна.',
        'Структурный выбор помогает: “кто это?”, “какого цвета?”, “что умеет?”, “чего боится?”, “как помогает друзьям?”. Свободный текст лучше оставлять не для всего подряд, а для одной особой идеи, которую ребенок правда хочет добавить.',
        'Хороший конструктор персонажа должен ощущаться как игра: крупные карточки, цветные кружки, короткие названия, быстрый результат. Если ребенок видит, как “синий робот, который светит в темноте, но стесняется новых друзей” сразу становится героем сцены, выбор приобретает смысл.',
      ],
      es: [
        'Un personaje creado por el niño le da autoría. Ya no es “me dieron una historia”, sino “abrí una puerta a mi mundo e invité a un héroe”. Entre los 8 y 12 años esto importa mucho: quieren más independencia, pero siguen necesitando un marco claro.',
        'Ayudan elecciones estructuradas: quién es, color, habilidad, miedo, cómo ayuda a sus amigos. El texto libre no debería cargar con todo; funciona mejor como una idea especial que el niño realmente quiere añadir.',
        'Un buen creador de personajes debe sentirse como juego: tarjetas grandes, puntos de color, nombres cortos y resultado inmediato. Cuando “un robot azul que brilla en la oscuridad pero se pone tímido con nuevos amigos” entra enseguida en una escena, las elecciones cobran sentido.',
      ],
      de: [
        'Eine eigene Figur gibt dem Kind Autorschaft. Es heißt nicht mehr “jemand hat mir eine Geschichte gegeben”, sondern “ich habe eine Tür in meine Welt geöffnet und eine Figur eingeladen”. Gerade mit 8-12 Jahren zählt das: Kinder wollen mehr Selbstständigkeit, brauchen aber weiter einen klaren Rahmen.',
        'Strukturierte Wahl hilft: Wer ist es, welche Farbe, was kann es, wovor hat es Angst, wie hilft es Freunden? Freitext sollte nicht alles tragen. Am besten bleibt er für eine besondere Idee, die das Kind wirklich hinzufügen möchte.',
        'Ein guter Figurenbaukasten fühlt sich wie Spiel an: große Karten, Farbpunkte, kurze Namen und sofortiges Ergebnis. Wenn “ein blauer Roboter, der im Dunkeln leuchtet, aber bei neuen Freunden schüchtern ist” direkt zur Szenenfigur wird, bekommt die Wahl Bedeutung.',
      ],
      fr: [
        'Un personnage créé par l’enfant lui donne un vrai sentiment d’auteur. Ce n’est plus “on m’a donné une histoire”, mais “j’ai ouvert une porte vers mon monde et j’y ai invité un héros”. Entre 8 et 12 ans, c’est précieux : l’enfant veut plus d’autonomie tout en ayant besoin d’un cadre clair.',
        'Les choix structurés aident : qui est-ce, quelle couleur, quel pouvoir, quelle peur, comment aide-t-il ses amis ? Le texte libre ne doit pas tout porter. Il fonctionne mieux comme une idée spéciale que l’enfant tient vraiment à ajouter.',
        'Un bon créateur de personnage doit ressembler à un jeu : grandes cartes, pastilles de couleur, mots courts, résultat immédiat. Quand “un robot bleu qui brille dans le noir mais se sent timide avec les nouveaux amis” devient aussitôt héros d’une scène, le choix prend du sens.',
      ],
      pl: [
        'Własna postać daje dziecku poczucie autorstwa. To już nie “dostałem gotową historię”, ale “otworzyłem drzwi do swojego świata i zaprosiłem tam bohatera”. W wieku około 8-12 lat jest to szczególnie ważne: dzieci chcą większej samodzielności, ale nadal potrzebują jasnej ramy.',
        'Pomagają wybory strukturalne: kto to jest, jaki ma kolor, co potrafi, czego się boi, jak pomaga przyjaciołom. Tekst wolny nie powinien nieść wszystkiego. Najlepiej działa jako jedna wyjątkowa myśl, którą dziecko naprawdę chce dodać.',
        'Dobry kreator postaci powinien przypominać zabawę: duże karty, kolorowe kółka, krótkie nazwy i natychmiastowy efekt. Gdy “niebieski robot, który świeci w ciemności, ale wstydzi się nowych przyjaciół” od razu staje się bohaterem sceny, wybory zaczynają mieć znaczenie.',
      ],
    },
    research: {
      uk: [
        'Педіатри American Academy of Pediatrics описують гру як важливий шлях розвитку мови, соціально-емоційних навичок, саморегуляції та виконавчих функцій. Коли дитина вигадує персонажа, вона тренує не лише фантазію: вона планує, утримує правила, пробує роль і перевіряє наслідки.',
        'Виготський писав, що у грі дитина часто діє вище свого щоденного рівня. Це добре пояснює, чому герой може бути корисним: боязка дитина може створити обережного, але сміливого дракона; нетерпляча - робота, який вчиться чекати сигналу; дитина, що злиться, - істоту, яка шукає м’який спосіб сказати “ні”.',
        'Дослідження уявних друзів і дитячої фантазії показують, що вигадані персонажі не є “втечею від реальності” за замовчуванням. Часто це спосіб тренувати перспективу, соціальну мову, дружбу й емоційні сценарії в безпечному просторі.',
        'Психологи, які працюють із наративними підходами, часто говорять про “зовнішнє винесення” проблеми: дитині легше говорити не “я поганий”, а “у мого героя є страх темряви, і ми шукаємо спосіб йому допомогти”. Це не терапія в застосунку, але корисний принцип для м’яких історій.',
      ],
      en: [
        'The American Academy of Pediatrics describes play as a major route for language, social-emotional skills, self-regulation, and executive function. When a child invents a character, they are not only imagining: they are planning, holding rules, trying a role, and testing consequences.',
        'Vygotsky wrote that in play a child often acts above everyday behavior. This explains why a hero can help: a cautious child may create a careful but brave dragon; an impatient child, a robot learning to wait for a signal; an angry child, a creature finding a softer way to say “no”.',
        'Research on imaginary companions and childhood imagination suggests that invented characters are not automatically an escape from reality. They can be a safe place to practice perspective, social language, friendship, and emotional scripts.',
        'Psychologists using narrative approaches often talk about externalizing a problem: it can be easier for a child to say “my hero has a fear of the dark, and we are helping them” than “I am bad”. This is not therapy inside the app, but it is a useful principle for gentle stories.',
      ],
      ru: [
        'Педиатры American Academy of Pediatrics описывают игру как важный путь развития речи, социально-эмоциональных навыков, саморегуляции и исполнительных функций. Когда ребенок придумывает персонажа, он тренирует не только фантазию: он планирует, удерживает правила, пробует роль и проверяет последствия.',
        'Выготский писал, что в игре ребенок часто действует выше своего обычного поведения. Это хорошо объясняет, почему герой может помогать: осторожный ребенок создает осторожного, но смелого дракона; нетерпеливый - робота, который учится ждать сигнал; злой - существо, которое ищет мягкий способ сказать “нет”.',
        'Исследования воображаемых друзей и детской фантазии показывают, что придуманные персонажи не обязательно “уход от реальности”. Часто это безопасное пространство, где ребенок тренирует взгляд другого, социальную речь, дружбу и эмоциональные сценарии.',
        'Психологи в нарративных подходах часто говорят о внешнем вынесении проблемы: ребенку легче сказать не “я плохой”, а “у моего героя есть страх темноты, и мы ищем способ ему помочь”. Это не терапия в приложении, но полезный принцип для мягких историй.',
      ],
      es: [
        'La American Academy of Pediatrics describe el juego como una vía importante para lenguaje, habilidades socioemocionales, autorregulación y funciones ejecutivas. Cuando un niño inventa un personaje, no solo imagina: planifica, mantiene reglas, prueba un rol y observa consecuencias.',
        'Vygotsky escribió que en el juego el niño suele actuar por encima de su conducta cotidiana. Esto explica por qué un héroe ayuda: un niño prudente puede crear un dragón prudente pero valiente; uno impaciente, un robot que aprende a esperar; uno enfadado, una criatura que busca decir “no” con suavidad.',
        'La investigación sobre compañeros imaginarios e imaginación infantil sugiere que los personajes inventados no son automáticamente una huida de la realidad. Pueden ser un espacio seguro para practicar perspectiva, lenguaje social, amistad y escenas emocionales.',
        'En enfoques narrativos, los psicólogos hablan de externalizar el problema: para un niño puede ser más fácil decir “mi héroe teme la oscuridad y lo ayudamos” que “soy malo”. No es terapia dentro de la app, pero sí un principio útil para historias cuidadosas.',
      ],
      de: [
        'Die American Academy of Pediatrics beschreibt Spiel als wichtigen Weg für Sprache, sozial-emotionale Fähigkeiten, Selbstregulation und exekutive Funktionen. Wenn ein Kind eine Figur erfindet, fantasiert es nicht nur: Es plant, hält Regeln, probiert Rollen und prüft Folgen.',
        'Vygotsky schrieb, dass ein Kind im Spiel oft über sein Alltagsverhalten hinaus handelt. Deshalb kann eine Figur helfen: Ein vorsichtiges Kind erschafft einen vorsichtigen, aber mutigen Drachen; ein ungeduldiges einen Roboter, der Warten übt; ein wütendes ein Wesen, das ein sanfteres “Nein” findet.',
        'Forschung zu imaginären Gefährten und kindlicher Fantasie zeigt: Erfundene Figuren sind nicht automatisch Realitätsflucht. Sie können ein sicherer Raum sein, um Perspektive, soziale Sprache, Freundschaft und emotionale Drehbücher zu üben.',
        'In narrativen Ansätzen sprechen Psychologinnen und Psychologen oft vom Externalisieren eines Problems: Für ein Kind ist es leichter zu sagen “meine Figur hat Angst vor der Dunkelheit, und wir helfen ihr” als “ich bin falsch”. Das ist keine Therapie in der App, aber ein hilfreiches Prinzip für sanfte Geschichten.',
      ],
      fr: [
        'L’American Academy of Pediatrics décrit le jeu comme un chemin important pour le langage, les compétences socio-émotionnelles, l’autorégulation et les fonctions exécutives. Quand l’enfant invente un personnage, il ne fait pas qu’imaginer : il planifie, garde des règles, essaie un rôle et observe les conséquences.',
        'Vygotsky écrivait que dans le jeu, l’enfant agit souvent au-dessus de son comportement quotidien. Cela explique pourquoi un héros aide : un enfant prudent peut créer un dragon prudent mais courageux; un enfant impatient, un robot qui apprend à attendre; un enfant en colère, une créature qui cherche une façon douce de dire “non”.',
        'Les recherches sur les compagnons imaginaires et l’imagination enfantine montrent que les personnages inventés ne sont pas forcément une fuite du réel. Ils peuvent être un espace sûr pour travailler la perspective, le langage social, l’amitié et les scénarios émotionnels.',
        'Dans les approches narratives, les psychologues parlent souvent d’externaliser le problème : il peut être plus facile pour l’enfant de dire “mon héros a peur du noir et nous l’aidons” que “je suis mauvais”. Ce n’est pas une thérapie dans l’application, mais un principe utile pour des histoires délicates.',
      ],
      pl: [
        'American Academy of Pediatrics opisuje zabawę jako ważną drogę rozwoju języka, umiejętności społeczno-emocjonalnych, samoregulacji i funkcji wykonawczych. Gdy dziecko wymyśla postać, nie tylko fantazjuje: planuje, utrzymuje zasady, próbuje roli i sprawdza skutki.',
        'Wygotski pisał, że w zabawie dziecko często działa ponad swoje codzienne zachowanie. To wyjaśnia, dlaczego bohater pomaga: ostrożne dziecko może stworzyć ostrożnego, ale dzielnego smoka; niecierpliwe - robota uczącego się czekać; zezłoszczone - stworzenie, które szuka łagodnego sposobu powiedzenia “nie”.',
        'Badania nad wyobrażonymi przyjaciółmi i dziecięcą wyobraźnią pokazują, że wymyślone postacie nie są automatycznie ucieczką od rzeczywistości. Mogą być bezpiecznym miejscem ćwiczenia perspektywy, języka społecznego, przyjaźni i scen emocjonalnych.',
        'Psychologowie pracujący narracyjnie często mówią o zewnętrznym nazwaniu problemu: dziecku łatwiej powiedzieć “mój bohater boi się ciemności i pomagamy mu” niż “jestem zły”. To nie terapia w aplikacji, ale przydatna zasada dla łagodnych historii.',
      ],
    },
    storyUse: {
      uk: [
        'У WonderTales герой збирається з простих візуальних виборів: тип персонажа, колір, роль у пригоді, одна сила й одна вразливість. Цього достатньо, щоб застосунок краще зберігав і зовнішність, і поведінку героя.',
        'Для дитини краще звучить не “заповни властивості”, а “обери, що герой зробить у потрібний момент”. Літає, світить у темряві, знаходить загублені речі, розуміє мову рослин, лагодить механізми, розсмішує тих, кому страшно.',
        'У WonderTales персонажа можна зробити з фото іграшки, малюнка, референсу або власного опису. Потім під час створення історії дитина або батьки обирають цього героя, і він входить у сюжет не як випадкова прикраса, а як персонаж із роллю.',
        'Серії історій особливо добре працюють із власними героями: дитина не починає щоразу з нуля, а повертається до знайомого друга. Це дозволяє поступово розвивати характер: сьогодні герой вчиться просити допомогу, завтра - чекати, післязавтра - миритися.',
      ],
      en: [
        'In WonderTales, a hero is built from simple visual choices: character type, color, role in the adventure, one strength, and one vulnerability. That is enough for the app to keep both the look and behavior more consistent.',
        'For a child, “choose what the hero does at the right moment” feels better than “fill in properties.” The hero may fly, glow in the dark, find lost things, understand plants, fix machines, or make frightened friends laugh.',
        'In WonderTales, a character can start from a toy photo, a drawing, a reference image, or a short description. When creating a story, the child or parent chooses that hero, and the hero enters the plot as someone with a role, not a random decoration.',
        'Story series work especially well with child-created heroes: the child does not start from zero every time, but returns to a familiar friend. Character can grow gradually: today the hero asks for help, tomorrow waits, later makes peace.',
      ],
      ru: [
        'В WonderTales герой собирается из простых визуальных выборов: тип персонажа, цвет, роль в приключении, одна сила и одна уязвимость. Этого достаточно, чтобы приложение стабильнее сохраняло и внешний вид, и поведение героя.',
        'Для ребенка лучше звучит не “заполни свойства”, а “выбери, что герой сделает в нужный момент”. Он летает, светит в темноте, находит потерянное, понимает язык растений, чинит механизмы, смешит тех, кому страшно.',
        'В WonderTales персонажа можно сделать из фото игрушки, рисунка, референса или короткого описания. Затем при создании истории ребенок или родитель выбирает этого героя, и он входит в сюжет не как случайное украшение, а как персонаж с ролью.',
        'Серии историй особенно хорошо работают с собственными героями: ребенок не начинает каждый раз с нуля, а возвращается к знакомому другу. Характер можно развивать постепенно: сегодня герой просит помощи, завтра ждет, позже мирится.',
      ],
      es: [
        'En WonderTales, el héroe se construye con elecciones visuales simples: tipo de personaje, color, rol en la aventura, una fuerza y una vulnerabilidad. Eso basta para que la app mantenga mejor la apariencia y el comportamiento.',
        'Para un niño suena mejor “elige qué hará el héroe en el momento importante” que “rellena propiedades”. Puede volar, brillar en la oscuridad, encontrar objetos perdidos, entender plantas, reparar máquinas o hacer reír a quien tiene miedo.',
        'En WonderTales, un personaje puede nacer de una foto de juguete, un dibujo, una imagen de referencia o una descripción breve. Al crear la historia, el niño o el padre elige ese héroe, y entra en la trama con un rol, no como adorno aleatorio.',
        'Las series funcionan muy bien con héroes propios: el niño no empieza de cero cada vez, vuelve a un amigo conocido. El carácter puede crecer poco a poco: hoy pide ayuda, mañana espera, más adelante hace las paces.',
      ],
      de: [
        'In WonderTales entsteht eine Figur aus einfachen visuellen Entscheidungen: Figurentyp, Farbe, Rolle im Abenteuer, eine Stärke und eine Verletzlichkeit. Das reicht, damit die App Aussehen und Verhalten stabiler halten kann.',
        'Für Kinder klingt “Wähle, was die Figur im richtigen Moment tut” besser als “Fülle Eigenschaften aus”. Sie kann fliegen, im Dunkeln leuchten, Verlorenes finden, Pflanzen verstehen, Maschinen reparieren oder ängstliche Freunde zum Lachen bringen.',
        'In WonderTales kann eine Figur aus einem Spielzeugfoto, einer Zeichnung, einem Referenzbild oder einer kurzen Beschreibung entstehen. Beim Erstellen der Geschichte wählen Kind oder Eltern diese Figur, und sie kommt mit einer Rolle in die Handlung, nicht als zufällige Dekoration.',
        'Serien funktionieren besonders gut mit eigenen Figuren: Das Kind startet nicht jedes Mal bei null, sondern kehrt zu einem vertrauten Freund zurück. Charakter kann langsam wachsen: heute um Hilfe bitten, morgen warten, später Frieden schließen.',
      ],
      fr: [
        'Dans WonderTales, un héros se construit avec des choix visuels simples : type de personnage, couleur, rôle dans l’aventure, une force et une vulnérabilité. Cela suffit pour que l’application garde mieux son apparence et son comportement.',
        'Pour l’enfant, “choisis ce que le héros fera au bon moment” est plus vivant que “remplis ses propriétés”. Il peut voler, briller dans le noir, retrouver des objets perdus, comprendre les plantes, réparer des machines ou faire rire ceux qui ont peur.',
        'Dans WonderTales, un personnage peut partir d’une photo de jouet, d’un dessin, d’une image de référence ou d’une courte description. Ensuite, pendant la création de l’histoire, l’enfant ou le parent choisit ce héros, qui entre dans l’intrigue avec un rôle.',
        'Les séries fonctionnent très bien avec les héros créés par l’enfant : on ne repart pas de zéro, on retrouve un ami connu. Le caractère peut évoluer peu à peu : aujourd’hui demander de l’aide, demain attendre, plus tard se réconcilier.',
      ],
      pl: [
        'W WonderTales bohater powstaje z prostych wyborów wizualnych: typ postaci, kolor, rola w przygodzie, jedna siła i jedna wrażliwość. To wystarczy, aby aplikacja stabilniej trzymała wygląd i zachowanie bohatera.',
        'Dla dziecka lepiej brzmi “wybierz, co bohater zrobi w ważnym momencie” niż “uzupełnij właściwości”. Może latać, świecić w ciemności, znajdować zguby, rozumieć rośliny, naprawiać maszyny albo rozśmieszać tych, którzy się boją.',
        'W WonderTales postać może powstać ze zdjęcia zabawki, rysunku, obrazu referencyjnego albo krótkiego opisu. Podczas tworzenia historii dziecko lub rodzic wybiera tego bohatera, a on wchodzi do fabuły z rolą, nie jako przypadkowa ozdoba.',
        'Serie historii szczególnie dobrze działają z własnymi bohaterami: dziecko nie zaczyna za każdym razem od zera, tylko wraca do znanego przyjaciela. Charakter może rosnąć stopniowo: dziś prosi o pomoc, jutro czeka, później się godzi.',
      ],
    },
    adjustment: {
      uk: [
        'Якщо дитина застрягла, дайте не порожнє поле, а три варіанти. “Хочеш, щоб герой був швидкий, уважний чи смішний?” Таке питання легше за “опиши характер”.',
        'Якщо дитина хоче вигадати все сама, не забирайте цю свободу. Просто відокремте обов’язкові речі для стабільності образу від творчої зони: тип, колір і роль мають бути ясними; дивна звичка, таємний предмет або смішний звук можуть бути відкритими.',
        'Якщо герой став занадто “всемогутнім”, додайте не покарання, а цікаве правило. Наприклад: він може літати тільки, коли каже правду; світить у темряві, але швидко втомлюється; має сильний хвіст, але боїться гучних звуків. Обмеження робить історію живою.',
      ],
      en: [
        'If the child gets stuck, offer three choices instead of a blank field. “Should the hero be fast, careful, or funny?” is easier than “describe the personality.”',
        'If the child wants to invent everything, do not take that freedom away. Separate what the image needs for stability from the creative zone: type, color, and role should be clear; a strange habit, secret object, or funny sound can stay open.',
        'If the hero becomes too powerful, add an interesting rule, not a punishment. Maybe they can fly only when telling the truth; glow in the dark but tire quickly; have a strong tail but fear loud sounds. A limit makes the story alive.',
      ],
      ru: [
        'Если ребенок застрял, дайте не пустое поле, а три варианта. “Герой быстрый, внимательный или смешной?” легче, чем “опиши характер”.',
        'Если ребенок хочет придумать все сам, не забирайте свободу. Просто отделите обязательное для стабильного образа от творческой зоны: тип, цвет и роль должны быть ясными; странная привычка, тайный предмет или смешной звук могут оставаться открытыми.',
        'Если герой стал слишком всемогущим, добавьте не наказание, а интересное правило. Например: он летает только когда говорит правду; светит в темноте, но быстро устает; у него сильный хвост, но он боится громких звуков. Ограничение делает историю живой.',
      ],
      es: [
        'Si el niño se bloquea, ofrece tres opciones en vez de un campo vacío. “¿El héroe es rápido, cuidadoso o divertido?” es más fácil que “describe su personalidad”.',
        'Si quiere inventarlo todo, no le quites esa libertad. Separa lo necesario para estabilidad visual de la zona creativa: tipo, color y rol claros; hábito raro, objeto secreto o sonido gracioso pueden quedar abiertos.',
        'Si el héroe se vuelve demasiado poderoso, añade una regla interesante, no un castigo. Puede volar solo cuando dice la verdad; brillar en la oscuridad pero cansarse rápido; tener cola fuerte pero temer ruidos fuertes. Un límite vuelve viva la historia.',
      ],
      de: [
        'Wenn das Kind stockt, gib drei Optionen statt eines leeren Feldes. “Ist die Figur schnell, aufmerksam oder lustig?” ist leichter als “Beschreibe den Charakter.”',
        'Wenn das Kind alles selbst erfinden will, nimm diese Freiheit nicht weg. Trenne nur, was für Bildstabilität nötig ist, von der Kreativzone: Typ, Farbe und Rolle klar; seltsame Gewohnheit, geheimer Gegenstand oder lustiges Geräusch offen.',
        'Wenn die Figur allmächtig wird, füge keine Strafe hinzu, sondern eine interessante Regel. Sie fliegt nur, wenn sie die Wahrheit sagt; leuchtet im Dunkeln, wird aber schnell müde; hat einen starken Schwanz, fürchtet aber laute Geräusche. Begrenzung macht die Geschichte lebendig.',
      ],
      fr: [
        'Si l’enfant bloque, proposez trois options plutôt qu’un champ vide. “Le héros est rapide, attentif ou drôle ?” est plus facile que “décris son caractère”.',
        'S’il veut tout inventer, ne retirez pas cette liberté. Séparez ce qui stabilise l’image de la zone créative : type, couleur et rôle clairs; habitude étrange, objet secret ou son amusant peuvent rester ouverts.',
        'Si le héros devient trop puissant, ajoutez une règle intéressante, pas une punition. Il vole seulement quand il dit la vérité; il brille dans le noir mais se fatigue vite; il a une queue forte mais craint les bruits forts. Une limite rend l’histoire vivante.',
      ],
      pl: [
        'Gdy dziecko utknie, daj trzy opcje zamiast pustego pola. “Bohater jest szybki, uważny czy zabawny?” jest łatwiejsze niż “opisz charakter”.',
        'Jeśli dziecko chce wymyślić wszystko samo, nie odbieraj mu tej wolności. Oddziel tylko rzeczy potrzebne do stabilnego obrazu od strefy twórczej: typ, kolor i rola powinny być jasne; dziwny nawyk, tajny przedmiot albo zabawny dźwięk mogą zostać otwarte.',
        'Jeśli bohater staje się zbyt wszechmocny, dodaj nie karę, ale ciekawą zasadę. Może latać tylko, gdy mówi prawdę; świeci w ciemności, ale szybko się męczy; ma silny ogon, ale boi się głośnych dźwięków. Ograniczenie ożywia historię.',
      ],
    },
    checklist: {
      uk: ['Тип персонажа.', 'Головний колір і 1-2 помітні риси.', 'Роль у пригоді.', 'Сила і вразливість.', 'Одна особлива деталь від дитини.'],
      en: ['Character type.', 'Main color and 1-2 visible traits.', 'Role in the adventure.', 'Strength and vulnerability.', 'One special child-made detail.'],
      ru: ['Тип персонажа.', 'Главный цвет и 1-2 заметные черты.', 'Роль в приключении.', 'Сила и уязвимость.', 'Одна особая деталь от ребенка.'],
      es: ['Tipo de personaje.', 'Color principal y 1-2 rasgos visibles.', 'Rol en la aventura.', 'Fuerza y vulnerabilidad.', 'Un detalle especial del niño.'],
      de: ['Figurentyp.', 'Hauptfarbe und 1-2 sichtbare Merkmale.', 'Rolle im Abenteuer.', 'Stärke und Verletzlichkeit.', 'Ein besonderes Detail des Kindes.'],
      fr: ['Type de personnage.', 'Couleur principale et 1-2 traits visibles.', 'Rôle dans l’aventure.', 'Force et vulnérabilité.', 'Un détail spécial de l’enfant.'],
      pl: ['Typ postaci.', 'Główny kolor i 1-2 widoczne cechy.', 'Rola w przygodzie.', 'Siła i wrażliwość.', 'Jeden wyjątkowy detal od dziecka.'],
    },
    quote: {
      text: {
        uk: 'У грі дитина ніби стає на голову вищою за себе.',
        en: 'In play a child is, as it were, a head taller than himself.',
        ru: 'В игре ребенок как будто становится на голову выше самого себя.',
        es: 'En el juego, el niño parece estar una cabeza por encima de sí mismo.',
        de: 'Im Spiel ist ein Kind gleichsam einen Kopf größer als es selbst.',
        fr: 'Dans le jeu, l’enfant est comme une tête au-dessus de lui-même.',
        pl: 'W zabawie dziecko jest jakby o głowę wyższe od samego siebie.',
      },
      attribution: 'Lev Vygotsky',
      sourceLabel: 'Mind in Society',
      sourceUrl: 'https://www.hup.harvard.edu/books/9780674576292',
    },
    sources: [
      { label: 'American Academy of Pediatrics: The Power of Play', url: 'https://publications.aap.org/pediatrics/article/142/3/e20182058/38649/The-Power-of-Play-A-Pediatric-Role-in-Enhancing' },
      { label: 'NAEYC: Play', url: 'https://www.naeyc.org/resources/topics/play' },
      { label: 'Marjorie Taylor: Imaginary Companions and the Children Who Create Them', url: 'https://global.oup.com/academic/product/imaginary-companions-and-the-children-who-create-them-9780195146298' },
      { label: 'Harvard University Press: Vygotsky, Mind in Society', url: 'https://www.hup.harvard.edu/books/9780674576292' },
      { label: 'Harvard Center on the Developing Child: executive function', url: 'https://developingchild.harvard.edu/science/key-concepts/executive-function/' },
      { label: 'Dulwich Centre: What is narrative therapy?', url: 'https://dulwichcentre.com.au/what-is-narrative-therapy/' },
    ],
    visualDirection: 'A child choosing colorful character tokens that assemble into an illustrated hero on the page.',
    relatedSlugs: ['personalized-childrens-stories', 'safe-scary-stories'],
    inlineImages: articleInlineImages(
      'child-created-characters',
      l10n(
        'Дитина створює героя з простих предметів, а планшет лежить на столі поруч',
        'A child builds a hero from simple objects while a tablet lies on the table nearby',
        'Ребенок создает героя из простых предметов, а планшет лежит рядом на столе',
        'Un niño crea un héroe con objetos simples mientras una tableta está en la mesa',
        'Ein Kind baut aus einfachen Gegenständen eine Figur, während ein Tablet daneben liegt',
        'Un enfant crée un héros avec de simples objets, une tablette posée sur la table',
        'Dziecko tworzy bohatera z prostych przedmiotów, a tablet leży obok na stole'
      ),
      l10n(
        'Тип, колір і роль героя дають образу стійкість, а дивна деталь лишає свободу.',
        'Type, color, and role give the hero stability, while one strange detail keeps freedom alive.',
        'Тип, цвет и роль героя дают образу устойчивость, а странная деталь оставляет свободу.',
        'Tipo, color y rol dan estabilidad al héroe, y un detalle extraño deja libertad.',
        'Art, Farbe und Rolle geben der Figur Halt, ein seltsames Detail bewahrt Freiheit.',
        'Type, couleur et rôle stabilisent le héros; un détail étrange garde la liberté.',
        'Typ, kolor i rola dają postaci stabilność, a dziwny szczegół zostawia wolność.'
      ),
      l10n(
        'Планшет лежить біля подушкового будиночка, де оживає вигаданий персонаж дитини',
        'A tablet lies near a pillow fort where the child’s invented character comes alive',
        'Планшет лежит у домика из подушек, где оживает придуманный ребенком персонаж',
        'Una tableta está junto a un fuerte de cojines donde cobra vida el personaje inventado',
        'Ein Tablet liegt am Kissenlager, wo die erfundene Figur des Kindes lebendig wird',
        'Une tablette repose près d’une cabane de coussins où le personnage inventé prend vie',
        'Tablet leży przy bazie z poduszek, gdzie ożywa wymyślona przez dziecko postać'
      ),
      l10n(
        'Коли персонаж повертається в сценах, дитині легше впізнавати його роль і розвивати ідею.',
        'When a character returns across scenes, the child can recognize its role and grow the idea.',
        'Когда персонаж возвращается в сценах, ребенку легче узнавать его роль и развивать идею.',
        'Cuando un personaje vuelve en las escenas, el niño reconoce su rol y desarrolla la idea.',
        'Kehrt eine Figur in Szenen zurück, erkennt das Kind ihre Rolle und entwickelt die Idee weiter.',
        'Quand un personnage revient d’une scène à l’autre, l’enfant reconnaît son rôle et développe l’idée.',
        'Gdy postać wraca w scenach, dziecku łatwiej rozpoznać jej rolę i rozwijać pomysł.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Авторство', title: 'Дитина має відчути “це мій герой”', body: 'Навіть кілька виборів — ім’я, колір, сила — дають більше залучення, ніж довга анкета, яку заповнює дорослий.' },
        { eyebrow: 'Структура', title: 'Вибір краще за порожнє поле', body: 'Кольори, ролі, риси й уміння у вигляді красивих таблеток допомагають дітям швидше почати.' },
        { eyebrow: 'Безпека', title: 'Персонаж може говорити про складне', body: 'Через героя дитині легше торкнутися страху, сорому, злості або бажання бути сміливішою.' },
      ],
      en: [
        { eyebrow: 'Authorship', title: 'The child needs to feel “this is my hero”', body: 'Even a few choices — name, color, strength — create more ownership than a long adult-filled form.' },
        { eyebrow: 'Structure', title: 'Choices beat blank fields', body: 'Colors, roles, traits, and abilities as beautiful chips help children start faster.' },
        { eyebrow: 'Safety', title: 'A character can carry hard feelings', body: 'Through a hero, a child can touch fear, shame, anger, or the wish to be braver with more distance.' },
      ],
      ru: [
        { eyebrow: 'Авторство', title: 'Ребенок должен почувствовать “это мой герой”', body: 'Даже несколько выборов — имя, цвет, сила — дают больше вовлечения, чем длинная анкета для взрослого.' },
        { eyebrow: 'Структура', title: 'Выбор лучше пустого поля', body: 'Цвета, роли, черты и умения в виде красивых таблеток помогают детям быстрее начать.' },
        { eyebrow: 'Безопасность', title: 'Персонаж может говорить о сложном', body: 'Через героя ребенку легче коснуться страха, стыда, злости или желания стать смелее.' },
      ],
      es: [
        { eyebrow: 'Autoría', title: 'El niño necesita sentir “es mi héroe”', body: 'Unas pocas elecciones — nombre, color, fuerza — dan más pertenencia que un formulario largo.' },
        { eyebrow: 'Estructura', title: 'Elegir es mejor que campo vacío', body: 'Colores, roles, rasgos y habilidades en chips bonitos ayudan a empezar rápido.' },
        { eyebrow: 'Seguridad', title: 'Un personaje puede llevar emociones difíciles', body: 'A través del héroe, el niño toca miedo, vergüenza, rabia o deseo de valentía con más distancia.' },
      ],
      de: [
        { eyebrow: 'Autorschaft', title: 'Das Kind soll fühlen: “Das ist meine Figur”', body: 'Schon wenige Entscheidungen — Name, Farbe, Stärke — schaffen mehr Besitzgefühl als ein langes Formular.' },
        { eyebrow: 'Struktur', title: 'Auswahl schlägt leere Felder', body: 'Farben, Rollen, Eigenschaften und Fähigkeiten als schöne Chips helfen Kindern schneller zu starten.' },
        { eyebrow: 'Sicherheit', title: 'Eine Figur kann Schwieriges tragen', body: 'Über die Figur kann das Kind Angst, Scham, Wut oder Mutwunsch mit Abstand berühren.' },
      ],
      fr: [
        { eyebrow: 'Auteur', title: 'L’enfant doit sentir “c’est mon héros”', body: 'Quelques choix — nom, couleur, force — donnent plus d’appropriation qu’un long formulaire.' },
        { eyebrow: 'Structure', title: 'Choisir vaut mieux qu’un champ vide', body: 'Couleurs, rôles, traits et capacités en jolies pastilles aident à commencer vite.' },
        { eyebrow: 'Sécurité', title: 'Un personnage peut porter le difficile', body: 'Par le héros, l’enfant aborde peur, honte, colère ou envie d’être courageux avec distance.' },
      ],
      pl: [
        { eyebrow: 'Autorstwo', title: 'Dziecko ma poczuć “to mój bohater”', body: 'Kilka wyborów — imię, kolor, siła — daje więcej własności niż długi formularz.' },
        { eyebrow: 'Struktura', title: 'Wybór lepszy niż puste pole', body: 'Kolory, role, cechy i umiejętności jako ładne kapsułki pomagają szybciej zacząć.' },
        { eyebrow: 'Bezpieczeństwo', title: 'Postać może nieść trudne uczucia', body: 'Przez bohatera dziecko łatwiej dotyka strachu, wstydu, złości albo pragnienia odwagi.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Які вибори WonderTales залишає для персонажа',
        intro: 'WonderTales не просить дитину заповнювати анкету. Для впізнаваного героя залишаються деталі, що впливають на вигляд і поведінку.',
        columns: ['Вибір', 'Навіщо він потрібен', 'Як подати дитині'],
        rows: [
          ['Хто це', 'Дає застосунку WonderTales базову форму й роль у сюжеті', 'Дракон, фея, робот, тварина, дитина'],
          ['Колір', 'Утримує візуальну сталість', 'Великий кольоровий кружок і назва кольору'],
          ['Сила', 'Підказує, як герой діє', 'Швидкий, добрий, уважний, сміливий, винахідливий'],
          ['Слабкість або страх', 'Створює сюжетний розвиток', 'Боїться темряви, поспішає, губиться, соромиться'],
        ],
      },
      en: {
        heading: 'Which character choices WonderTales keeps',
        intro: 'WonderTales does not ask the child to fill out a long form. The remaining choices shape the hero’s look and behavior.',
        columns: ['Choice', 'Why it matters', 'How to show it'],
        rows: [
          ['Who it is', 'Gives the WonderTales app the basic form and story role', 'Dragon, fairy, robot, animal, child'],
          ['Color', 'Keeps the visual identity stable', 'Large color dot plus color name'],
          ['Strength', 'Suggests how the hero acts', 'Fast, kind, careful, brave, inventive'],
          ['Weakness or fear', 'Creates story development', 'Afraid of dark, rushes, gets lost, feels shy'],
        ],
      },
      ru: {
        heading: 'Какие выборы WonderTales оставляет для персонажа',
        intro: 'WonderTales не просит ребенка заполнять длинную анкету. Остаются детали, которые влияют на внешний вид и поведение героя.',
        columns: ['Выбор', 'Зачем нужен', 'Как показать ребенку'],
        rows: [
          ['Кто это', 'Дает приложению WonderTales базовую форму и роль в сюжете', 'Дракон, фея, робот, животное, ребенок'],
          ['Цвет', 'Держит визуальную стабильность', 'Большой цветной кружок и название цвета'],
          ['Сила', 'Подсказывает, как герой действует', 'Быстрый, добрый, внимательный, смелый, изобретательный'],
          ['Слабость или страх', 'Создает развитие сюжета', 'Боится темноты, спешит, теряется, стесняется'],
        ],
      },
      es: {
        heading: 'Qué elecciones conserva WonderTales',
        intro: 'WonderTales no pide al niño rellenar un formulario largo. Quedan las elecciones que dan forma al aspecto y la conducta del héroe.',
        columns: ['Elección', 'Por qué importa', 'Cómo mostrarla'],
        rows: [
          ['Quién es', 'Da forma base y rol narrativo', 'Dragón, hada, robot, animal, niño'],
          ['Color', 'Mantiene identidad visual estable', 'Círculo grande de color y nombre'],
          ['Fuerza', 'Sugiere cómo actúa', 'Rápido, amable, atento, valiente, inventivo'],
          ['Debilidad o miedo', 'Crea desarrollo de historia', 'Miedo a oscuridad, prisa, perderse, timidez'],
        ],
      },
      de: {
        heading: 'Welche Figurenwahlen WonderTales behält',
        intro: 'WonderTales lässt Kinder kein langes Formular ausfüllen. Übrig bleiben Entscheidungen, die Aussehen und Verhalten formen.',
        columns: ['Wahl', 'Warum wichtig', 'So zeigen'],
        rows: [
          ['Wer es ist', 'Gibt Grundform und Rolle', 'Drache, Fee, Roboter, Tier, Kind'],
          ['Farbe', 'Hält visuelle Identität stabil', 'Großer Farbpunkt plus Name'],
          ['Stärke', 'Zeigt, wie die Figur handelt', 'Schnell, freundlich, aufmerksam, mutig, erfinderisch'],
          ['Schwäche oder Angst', 'Schafft Entwicklung', 'Dunkelangst, Eile, Verirren, Schüchternheit'],
        ],
      },
      fr: {
        heading: 'Quels choix WonderTales garde',
        intro: 'WonderTales ne demande pas à l’enfant de remplir un long formulaire. Les choix gardés façonnent l’apparence et le comportement du héros.',
        columns: ['Choix', 'Pourquoi', 'Comment le montrer'],
        rows: [
          ['Qui c’est', 'Donne forme de base et rôle', 'Dragon, fée, robot, animal, enfant'],
          ['Couleur', 'Stabilise l’identité visuelle', 'Grand rond de couleur et nom'],
          ['Force', 'Indique comment le héros agit', 'Rapide, gentil, attentif, courageux, inventif'],
          ['Faiblesse ou peur', 'Crée l’évolution du récit', 'Peur du noir, précipitation, se perdre, timidité'],
        ],
      },
      pl: {
        heading: 'Które wybory zostawia WonderTales',
        intro: 'WonderTales nie prosi dziecka o długi formularz. Zostają wybory, które wpływają na wygląd i zachowanie bohatera.',
        columns: ['Wybór', 'Po co', 'Jak pokazać'],
        rows: [
          ['Kto to jest', 'Daje aplikacji WonderTales podstawową formę i rolę', 'Smok, wróżka, robot, zwierzę, dziecko'],
          ['Kolor', 'Utrzymuje tożsamość wizualną', 'Duże kolorowe kółko i nazwa'],
          ['Siła', 'Podpowiada działanie bohatera', 'Szybki, dobry, uważny, odważny, pomysłowy'],
          ['Słabość albo lęk', 'Tworzy rozwój historii', 'Ciemność, pośpiech, gubienie się, nieśmiałość'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Дитячий флоу',
        heading: 'Як WonderTales створює героя без анкети',
        intro: 'Дитині потрібна гра з виборами, а не довге редагування полів. Тому WonderTales показує великі варіанти, кольори й прості властивості.',
        steps: [
          { title: 'Обрати тип', body: 'Вибір починається з великих карток: людина, тварина, чарівна істота, робот.' },
          { title: 'Обрати колір', body: 'Кольоровий кружок у таблетці допомагає дитині швидко впізнати вибір і не губитися в назвах.' },
          { title: 'Дати силу', body: 'Сила має відповідати дії: допомагає, літає, знаходить, лікує, смішить.' },
          { title: 'Додати одну дивинку', body: 'Одне вільне поле або “особлива деталь” залишає місце фантазії.' },
        ],
      },
      en: {
        eyebrow: 'Child flow',
        heading: 'How WonderTales creates a hero without a form',
        intro: 'Children need playful choices, not long field editing. WonderTales uses large options, colors, and simple traits.',
        steps: [
          { title: 'Choose type', body: 'The choice starts with large cards: person, animal, magical creature, robot.' },
          { title: 'Choose color', body: 'The color dot inside the chip helps the child recognize the choice quickly without relying only on the name.' },
          { title: 'Give a strength', body: 'The strength should imply action: helps, flies, finds, heals, makes others laugh.' },
          { title: 'Add one odd detail', body: 'One open field or “special detail” leaves room for imagination.' },
        ],
      },
      ru: {
        eyebrow: 'Детский флоу',
        heading: 'Как WonderTales создает героя без анкеты',
        intro: 'Ребенку нужна игра с выбором, а не долгое редактирование полей. Поэтому WonderTales показывает крупные варианты, цвета и простые свойства.',
        steps: [
          { title: 'Выбрать тип', body: 'Выбор начинается с крупных карточек: человек, животное, волшебное существо, робот.' },
          { title: 'Выбрать цвет', body: 'Цветной кружок в таблетке помогает ребенку быстро узнать выбор и не теряться в названиях.' },
          { title: 'Дать силу', body: 'Сила должна вести к действию: помогает, летает, находит, лечит, смешит.' },
          { title: 'Добавить одну странность', body: 'Одно свободное поле или “особая деталь” оставляет место фантазии.' },
        ],
      },
      es: {
        eyebrow: 'Flujo infantil',
        heading: 'Cómo WonderTales crea un héroe sin formulario',
        intro: 'El niño necesita elecciones de juego, no editar campos largos. WonderTales usa opciones grandes, colores y rasgos simples.',
        steps: [
          { title: 'Elegir tipo', body: 'La elección empieza con tarjetas grandes: persona, animal, criatura mágica, robot.' },
          { title: 'Elegir color', body: 'El punto de color dentro del chip ayuda al niño a reconocer la opción sin depender solo del nombre.' },
          { title: 'Dar fuerza', body: 'La fuerza debe sugerir acción: ayuda, vuela, encuentra, cura, hace reír.' },
          { title: 'Añadir rareza', body: 'Un campo abierto o “detalle especial” deja espacio a la imaginación.' },
        ],
      },
      de: {
        eyebrow: 'Kinderflow',
        heading: 'Wie WonderTales eine Figur ohne Formular erschafft',
        intro: 'Kinder brauchen spielerische Wahl, nicht langes Feld-Editieren. WonderTales nutzt große Optionen, Farben und einfache Eigenschaften.',
        steps: [
          { title: 'Typ wählen', body: 'Die Auswahl beginnt mit großen Karten: Mensch, Tier, magisches Wesen, Roboter.' },
          { title: 'Farbe wählen', body: 'Der Farbpunkt im Chip hilft dem Kind, die Auswahl schnell zu erkennen, ohne nur den Namen zu lesen.' },
          { title: 'Stärke geben', body: 'Stärke soll Handlung nahelegen: helfen, fliegen, finden, heilen, zum Lachen bringen.' },
          { title: 'Eine Eigenheit', body: 'Ein offenes Feld oder „besonderes Detail“ lässt Fantasie.' },
        ],
      },
      fr: {
        eyebrow: 'Parcours enfant',
        heading: 'Comment WonderTales crée un héros sans formulaire',
        intro: 'L’enfant a besoin de choix ludiques, pas de longs champs à éditer. WonderTales utilise de grandes options, des couleurs et des traits simples.',
        steps: [
          { title: 'Choisir le type', body: 'Le choix commence par de grandes cartes : humain, animal, créature magique, robot.' },
          { title: 'Choisir la couleur', body: 'Le rond coloré dans la pastille aide l’enfant à reconnaître vite son choix sans dépendre seulement du mot.' },
          { title: 'Donner une force', body: 'La force doit suggérer une action : aider, voler, trouver, soigner, faire rire.' },
          { title: 'Ajouter un détail étrange', body: 'Un champ libre ou “détail spécial” garde de la place pour l’imagination.' },
        ],
      },
      pl: {
        eyebrow: 'Flow dziecka',
        heading: 'Jak WonderTales tworzy bohatera bez formularza',
        intro: 'Dziecko potrzebuje zabawy wyborami, nie długiej edycji pól. WonderTales używa dużych opcji, kolorów i prostych cech.',
        steps: [
          { title: 'Wybrać typ', body: 'Wybór zaczyna się od dużych kart: człowiek, zwierzę, magiczna istota, robot.' },
          { title: 'Wybrać kolor', body: 'Kolorowe kółko w kapsułce pomaga dziecku szybko rozpoznać wybór, nie tylko przeczytać nazwę.' },
          { title: 'Dać siłę', body: 'Siła powinna sugerować działanie: pomaga, lata, znajduje, leczy, rozśmiesza.' },
          { title: 'Dodać dziwny detal', body: 'Jedno wolne pole lub „wyjątkowy detal” zostawia miejsce fantazji.' },
        ],
      },
    },
  },
  {
    slug: 'safe-scary-stories',
    heroImage: '/landing/blog/safe-scary-stories-scene-01.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Страшилки', en: 'Safe scares', ru: 'Страшилки', es: 'Miedos seguros', de: 'Sicher gruseln', fr: 'Frissons sûrs', pl: 'Bezpieczne strachy' },
    title: {
      uk: 'Страшні історії для дітей: як зробити лячно, але безпечно',
      en: 'Scary stories for children: spooky but safe',
      ru: 'Страшные истории для детей: страшно, но безопасно',
      es: 'Historias de miedo para niños: inquietantes pero seguros',
      de: 'Gruselgeschichten für Kinder: spannend, aber sicher',
      fr: 'Histoires qui font peur : frissonner en sécurité',
      pl: 'Straszne historie dla dzieci: dreszcz, ale bezpiecznie',
    },
    description: {
      uk: 'Чому діти люблять контрольований страх, де проходить межа “занадто”, і як будувати страшну історію через загадку, гумор, право зупинитися й повернення безпеки.',
      en: 'Why children enjoy controlled fear, where “too much” begins, and how to build a scary story through mystery, humor, permission to stop, and restored safety.',
      ru: 'Почему детям нравится контролируемый страх, где начинается “слишком”, и как строить страшную историю через загадку, юмор, право остановиться и возвращение безопасности.',
      es: 'Por qué a los niños les gusta el miedo controlado, dónde empieza “demasiado”, y cómo crear una historia con misterio, humor, derecho a parar y seguridad recuperada.',
      de: 'Warum Kinder kontrollierten Grusel mögen, wo “zu viel” beginnt und wie eine Geschichte mit Rätsel, Humor, Stopprecht und Rückkehr zur Sicherheit funktioniert.',
      fr: 'Pourquoi les enfants aiment la peur contrôlée, où commence le “trop”, et comment construire une histoire avec mystère, humour, droit d’arrêter et sécurité retrouvée.',
      pl: 'Dlaczego dzieci lubią kontrolowany strach, gdzie zaczyna się “za dużo” i jak budować historię przez zagadkę, humor, prawo stop i powrót bezpieczeństwa.',
    },
    lead: {
      uk: 'Страх в історії може бути тренажером сміливості, якщо дитина знає: вона в безпеці, дорослий поруч, а історію можна зупинити.',
      en: 'Fear in a story can train courage when the child knows they are safe, an adult is nearby, and the story can stop.',
      ru: 'Страх в истории может тренировать смелость, если ребенок знает: он в безопасности, взрослый рядом, историю можно остановить.',
      es: 'El miedo en una historia puede entrenar valentía si el niño sabe que está seguro, con adulto cerca y puede parar.',
      de: 'Angst in Geschichten kann Mut üben, wenn das Kind weiß: sicher, Erwachsener da, Geschichte stoppbar.',
      fr: 'La peur dans l’histoire peut entraîner le courage si l’enfant sait qu’il est en sécurité, avec un adulte, et peut arrêter.',
      pl: 'Strach w bajce może ćwiczyć odwagę, jeśli dziecko wie: jest bezpieczne, dorosły jest obok, można przerwać.',
    },
    focus: {
      uk: [
        'Безпечна страшна історія не принижує і не травмує героя. Вона створює загадку, тінь, дивний звук або незрозумілу істоту, а потім дає дитині спосіб повернути контроль.',
        'Добрий страх має бути добровільним. Дитина може захотіти “трошки страшно”, але вона також має право сказати “пауза”, “далі не хочу” або “розкажи смішну версію”. Зупинка не має звучати як поразка.',
        'Найкраща дитяча страшилка часто працює не через жорстокість, а через невідоме: у шафі шумить щось дивне, у лісі світиться віконце, маленький привид загубив свій дзвіночок. Потім історія показує: це можна дослідити, назвати, зрозуміти або перетворити на жарт.',
      ],
      en: [
        'A safe scary story does not humiliate or harm the hero. It creates a mystery, shadow, strange sound, or puzzling creature, then gives the child a way back to control.',
        'Good fear should be voluntary. A child may want “a little scary,” but they also need permission to say “pause,” “I do not want more,” or “tell the funny version.” Stopping should not sound like losing.',
        'The best children’s scary stories often work through the unknown, not cruelty: something rustles in the closet, a window glows in the forest, a tiny ghost has lost its bell. Then the story shows that it can be explored, named, understood, or turned into a joke.',
      ],
      ru: [
        'Безопасная страшная история не унижает и не травмирует героя. Она создает загадку, тень, странный звук или непонятное существо, а затем дает ребенку способ вернуть контроль.',
        'Хороший страх должен быть добровольным. Ребенок может хотеть “немного страшно”, но у него должно быть право сказать “пауза”, “дальше не хочу” или “расскажи смешную версию”. Остановка не должна звучать как проигрыш.',
        'Лучшая детская страшилка часто работает не через жестокость, а через неизвестность: в шкафу что-то шуршит, в лесу светится окно, маленький призрак потерял колокольчик. Потом история показывает: это можно исследовать, назвать, понять или превратить в шутку.',
      ],
      es: [
        'Una historia de miedo segura no humilla ni daña al héroe. Crea misterio, sombra, sonido extraño o criatura incomprensible, y luego devuelve control.',
        'El miedo bueno debe ser voluntario. El niño puede querer “un poco de miedo”, pero también necesita poder decir “pausa”, “no quiero más” o “cuenta la versión graciosa”. Parar no debe sonar a perder.',
        'Las mejores historias de miedo infantiles suelen usar lo desconocido, no la crueldad: algo cruje en el armario, una ventana brilla en el bosque, un fantasma pequeño perdió su campana. Luego la historia muestra que se puede explorar, nombrar, entender o volver chiste.',
      ],
      de: [
        'Eine sichere Gruselgeschichte demütigt oder verletzt die Figur nicht. Sie schafft Rätsel, Schatten, seltsame Geräusche oder ein unverständliches Wesen und gibt dann Kontrolle zurück.',
        'Guter Grusel sollte freiwillig sein. Ein Kind darf “ein bisschen gruselig” wollen, braucht aber auch das Recht auf “Pause”, “nicht weiter” oder “erzähl die lustige Version”. Stoppen darf nicht wie Verlieren klingen.',
        'Die besten Kindergruselgeschichten arbeiten oft mit Unbekanntem, nicht mit Grausamkeit: Im Schrank raschelt etwas, im Wald leuchtet ein Fenster, ein kleiner Geist hat seine Glocke verloren. Dann zeigt die Geschichte: Man kann es erforschen, benennen, verstehen oder zum Witz machen.',
      ],
      fr: [
        'Une histoire qui fait peur en sécurité n’humilie pas et ne blesse pas le héros. Elle crée un mystère, une ombre, un son étrange ou une créature incomprise, puis rend du contrôle.',
        'La bonne peur doit rester volontaire. L’enfant peut vouloir “un peu peur”, mais il doit pouvoir dire “pause”, “je ne veux pas la suite” ou “raconte la version drôle”. S’arrêter ne doit pas ressembler à un échec.',
        'Les meilleures histoires effrayantes pour enfants passent souvent par l’inconnu, pas par la cruauté : un bruit dans le placard, une fenêtre qui brille dans la forêt, un petit fantôme qui a perdu sa clochette. Puis l’histoire montre qu’on peut explorer, nommer, comprendre ou transformer en blague.',
      ],
      pl: [
        'Bezpieczna straszna historia nie upokarza i nie rani bohatera. Tworzy zagadkę, cień, dziwny dźwięk albo niezrozumiałą istotę, a potem daje dziecku drogę powrotu do kontroli.',
        'Dobry strach powinien być dobrowolny. Dziecko może chcieć “trochę strasznie”, ale ma też prawo powiedzieć “pauza”, “dalej nie chcę” albo “opowiedz śmieszną wersję”. Stop nie powinien brzmieć jak przegrana.',
        'Najlepsze dziecięce straszne historie często działają przez nieznane, nie przez okrucieństwo: coś szeleści w szafie, w lesie świeci okno, mały duch zgubił dzwoneczek. Potem historia pokazuje, że można to zbadać, nazwać, zrozumieć albo obrócić w żart.',
      ],
    },
    research: {
      uk: [
        'Фахівці Child Mind Institute радять не висміювати дитячі страхи і не тиснути “та не бійся”. Спершу варто визнати почуття, а потім запропонувати маленький керований крок. Для історії це означає: страх названий, поруч є дорослий, герой має план.',
        'American Academy of Pediatrics підкреслює: реакція на страшний контент залежить не лише від віку, а й від конкретної дитини, досвіду, темпераменту й контексту. Тому універсальної шкали “з 7 років можна” недостатньо.',
        'Дослідження recreational fear описують страх як гру, коли він добровільний, дозований і переживається як цікавість. Але хронічний страх, тривога, повторні кошмари або страх засинання — інша ситуація. Її не варто “тренувати страшилками”.',
        'Психологи, які працюють з емоційною регуляцією, нагадують: страх пов’язаний із тілом, увагою, мовою і плануванням. Тому корисно давати дитині слова: “серце стукає”, “я хочу паузу”, “мені стало смішно, коли ми побачили, що це був капелюх”.',
      ],
      en: [
        'Child Mind Institute specialists advise adults not to mock children’s fears or push with “don’t be scared.” First validate the feeling, then offer a small manageable step. For a story, this means fear is named, an adult is nearby, and the hero has a plan.',
        'The American Academy of Pediatrics emphasizes that reactions to scary content depend not only on age, but also on the individual child, experience, temperament, and context. A universal “safe from age 7” rule is not enough.',
        'Research on recreational fear describes fear as play when it is voluntary, moderate, and experienced with curiosity. Chronic fear, anxiety, repeated nightmares, or fear of falling asleep are different. They should not be “trained” with scary stories.',
        'Psychologists working with emotion regulation remind us that fear involves the body, attention, language, and planning. So it helps to give children words: “my heart is beating,” “I want a pause,” “it became funny when we saw it was a hat.”',
      ],
      ru: [
        'Специалисты Child Mind Institute советуют не высмеивать детские страхи и не давить фразой “да не бойся”. Сначала важно признать чувство, потом предложить маленький управляемый шаг. Для истории это значит: страх назван, взрослый рядом, у героя есть план.',
        'American Academy of Pediatrics подчеркивает: реакция на страшный контент зависит не только от возраста, но и от конкретного ребенка, опыта, темперамента и контекста. Универсального правила “с 7 лет можно” недостаточно.',
        'Исследования recreational fear описывают страх как игру, когда он добровольный, умеренный и переживается с любопытством. Но хронический страх, тревога, повторные кошмары или страх засыпания — другая ситуация. Их не стоит “тренировать страшилками”.',
        'Психологи, работающие с эмоциональной регуляцией, напоминают: страх связан с телом, вниманием, языком и планированием. Поэтому полезно давать ребенку слова: “сердце стучит”, “я хочу паузу”, “мне стало смешно, когда мы увидели, что это была шляпа”.',
      ],
      es: [
        'Especialistas de Child Mind Institute recomiendan no ridiculizar los miedos ni presionar con “no tengas miedo”. Primero se valida el sentimiento y luego se ofrece un paso pequeño y manejable. En una historia: el miedo tiene nombre, hay adulto cerca y el héroe tiene plan.',
        'La American Academy of Pediatrics subraya que la reacción al contenido de miedo no depende solo de la edad, sino del niño concreto, su experiencia, temperamento y contexto. No basta una regla universal de “desde los 7”.',
        'La investigación sobre recreational fear describe el miedo como juego cuando es voluntario, moderado y vivido con curiosidad. El miedo crónico, la ansiedad, las pesadillas repetidas o el miedo a dormir son otra cosa. No conviene “entrenarlos” con historias de miedo.',
        'La psicología de la regulación emocional recuerda que el miedo implica cuerpo, atención, lenguaje y planificación. Ayuda dar palabras: “me late el corazón”, “quiero pausa”, “fue gracioso cuando vimos que era un sombrero”.',
      ],
      de: [
        'Fachleute des Child Mind Institute raten, Kinderängste nicht lächerlich zu machen und nicht mit “Hab keine Angst” zu drücken. Erst Gefühl anerkennen, dann einen kleinen steuerbaren Schritt anbieten. In Geschichten heißt das: Angst wird benannt, ein Erwachsener ist da, die Figur hat einen Plan.',
        'Die American Academy of Pediatrics betont: Reaktionen auf gruselige Inhalte hängen nicht nur vom Alter ab, sondern vom Kind, Erfahrung, Temperament und Kontext. Eine allgemeine Regel “ab 7 sicher” reicht nicht.',
        'Forschung zu recreational fear beschreibt Angst als Spiel, wenn sie freiwillig, dosiert und neugierig erlebt wird. Chronische Angst, wiederkehrende Albträume oder Angst vor dem Einschlafen sind etwas anderes. Das sollte man nicht mit Gruselgeschichten trainieren.',
        'Psychologie der Emotionsregulation erinnert: Angst betrifft Körper, Aufmerksamkeit, Sprache und Planung. Hilfreich sind Worte: “mein Herz klopft”, “ich will Pause”, “es wurde lustig, als wir sahen, dass es ein Hut war”.',
      ],
      fr: [
        'Les spécialistes du Child Mind Institute conseillent de ne pas se moquer des peurs et de ne pas forcer avec “n’aie pas peur”. On reconnaît d’abord l’émotion, puis on propose un petit pas contrôlable. Dans une histoire : la peur est nommée, l’adulte est proche, le héros a un plan.',
        'L’American Academy of Pediatrics souligne que la réaction au contenu effrayant dépend non seulement de l’âge, mais aussi de l’enfant, de son expérience, de son tempérament et du contexte. Une règle universelle “à partir de 7 ans” ne suffit pas.',
        'Les recherches sur la peur récréative décrivent la peur comme un jeu quand elle est volontaire, dosée et vécue avec curiosité. La peur chronique, l’anxiété, les cauchemars répétés ou la peur de s’endormir sont autre chose. On ne les “entraîne” pas avec des histoires qui font peur.',
        'La psychologie de la régulation émotionnelle rappelle que la peur mobilise le corps, l’attention, le langage et la planification. Il est utile de donner des mots : “mon coeur bat”, “je veux une pause”, “c’était drôle quand on a vu que c’était un chapeau”.',
      ],
      pl: [
        'Specjaliści Child Mind Institute radzą nie wyśmiewać dziecięcych lęków i nie naciskać “nie bój się”. Najpierw warto uznać uczucie, potem zaproponować mały kontrolowany krok. W historii oznacza to: strach jest nazwany, dorosły blisko, bohater ma plan.',
        'American Academy of Pediatrics podkreśla, że reakcja na straszne treści zależy nie tylko od wieku, ale od konkretnego dziecka, doświadczeń, temperamentu i kontekstu. Uniwersalna zasada “od 7 lat można” nie wystarcza.',
        'Badania nad recreational fear opisują strach jako zabawę, gdy jest dobrowolny, umiarkowany i przeżywany z ciekawością. Chroniczny lęk, niepokój, powtarzające się koszmary albo strach przed zaśnięciem to inna sytuacja. Nie warto “ćwiczyć” jej strasznymi historiami.',
        'Psychologia regulacji emocji przypomina, że strach łączy ciało, uwagę, język i planowanie. Pomagają słowa: “serce bije”, “chcę pauzę”, “zrobiło się śmiesznie, gdy zobaczyliśmy, że to kapelusz”.',
      ],
    },
    storyUse: {
      uk: [
        'Зробіть монстра незрозумілим, а не жорстоким. Нехай герой розгадує, домовляється або знаходить світло. Фінал має відновити безпеку.',
        'Зелена зона: таємниця, шурхіт, смішний монстр, темна кімната з ліхтариком, привид, який сам боїться. Жовта зона: погоня без травм, напруга з паузами, нічний ліс, дивний звук. Червона зона: реалістичне насильство, безпорадність, смерть близьких, жах у власному домі без виходу.',
        'Перед стартом домовтеся про “стоп-слово”. Після нього історія не пояснює, чому дитині “не треба боятися”, а змінює режим: коротка пауза, смішна версія, м’якший фінал або повернення до знайомої історії.',
        'Після страшної сцени корисно дати герою дію контролю: запалити ліхтар, назвати звук, покликати друга, поставити межу, намалювати монстра смішним. Дитина бачить не лише страх, а спосіб із ним обійтися.',
      ],
      en: [
        'Make the monster puzzling, not cruel. Let the hero investigate, negotiate, or find light. The ending should restore safety.',
        'Green zone: mystery, rustling, a funny monster, a dark room with a flashlight, a ghost who is scared too. Yellow zone: a chase without injury, tension with pauses, a night forest, a strange sound. Red zone: realistic violence, helplessness, death of loved ones, horror inside the home with no exit.',
        'Before starting, agree on a stop word. After it, the story should not explain why the child “should not be scared”; it changes mode: short pause, funny version, softer ending, or return to a familiar story.',
        'After a scary scene, give the hero a control action: turn on a lantern, name the sound, call a friend, set a boundary, draw the monster as silly. The child sees not only fear, but a way through it.',
      ],
      ru: [
        'Сделайте монстра загадочным, а не жестоким. Герой может расследовать, договориться или найти свет. Финал возвращает безопасность.',
        'Зеленая зона: тайна, шорох, смешной монстр, темная комната с фонариком, призрак, который сам боится. Желтая зона: погоня без травм, напряжение с паузами, ночной лес, странный звук. Красная зона: реалистичное насилие, беспомощность, смерть близких, ужас в собственном доме без выхода.',
        'До старта договоритесь о стоп-слове. После него история не объясняет, почему ребенку “не надо бояться”, а меняет режим: короткая пауза, смешная версия, мягкий финал или возвращение к знакомой истории.',
        'После страшной сцены полезно дать герою действие контроля: включить фонарь, назвать звук, позвать друга, поставить границу, нарисовать монстра смешным. Ребенок видит не только страх, но и способ с ним обойтись.',
      ],
      es: [
        'Haz que el monstruo sea misterioso, no cruel. El héroe investiga, negocia o encuentra luz. El final restaura seguridad.',
        'Zona verde: misterio, crujido, monstruo gracioso, cuarto oscuro con linterna, fantasma que también tiene miedo. Zona amarilla: persecución sin daño, tensión con pausas, bosque nocturno, sonido raro. Zona roja: violencia realista, impotencia, muerte de seres queridos, terror en casa sin salida.',
        'Antes de empezar, acuerden una palabra de stop. Después, la historia no explica por qué “no debería dar miedo”; cambia de modo: pausa breve, versión graciosa, final más suave o regreso a una historia conocida.',
        'Después de una escena de miedo, dale al héroe una acción de control: encender linterna, nombrar el sonido, llamar a un amigo, poner límite, dibujar al monstruo ridículo. El niño ve no solo miedo, sino una forma de atravesarlo.',
      ],
      de: [
        'Das Wesen soll rätselhaft sein, nicht grausam. Die Figur erforscht, verhandelt oder findet Licht. Das Ende stellt Sicherheit wieder her.',
        'Grüne Zone: Geheimnis, Rascheln, lustiges Monster, dunkles Zimmer mit Taschenlampe, Geist, der selbst Angst hat. Gelbe Zone: Verfolgung ohne Verletzung, Spannung mit Pausen, Nachtwald, seltsames Geräusch. Rote Zone: realistische Gewalt, Hilflosigkeit, Tod naher Menschen, Horror im eigenen Zuhause ohne Ausweg.',
        'Vor dem Start ein Stoppwort vereinbaren. Danach erklärt die Geschichte nicht, warum das Kind “keine Angst haben soll”, sondern wechselt den Modus: kurze Pause, lustige Version, weicheres Ende oder vertraute Geschichte.',
        'Nach einer gruseligen Szene bekommt die Figur eine Kontrollhandlung: Laterne anzünden, Geräusch benennen, Freund rufen, Grenze setzen, Monster komisch zeichnen. Das Kind sieht nicht nur Angst, sondern einen Umgang damit.',
      ],
      fr: [
        'Rendez le monstre mystérieux, pas cruel. Le héros enquête, négocie ou trouve de la lumière. La fin restaure la sécurité.',
        'Zone verte : mystère, bruissement, monstre drôle, chambre sombre avec lampe, fantôme qui a peur lui aussi. Zone jaune : poursuite sans blessure, tension avec pauses, forêt de nuit, son étrange. Zone rouge : violence réaliste, impuissance, mort de proches, horreur à la maison sans sortie.',
        'Avant de commencer, choisissez un mot stop. Ensuite, l’histoire n’explique pas pourquoi l’enfant “ne doit pas avoir peur”; elle change de mode : pause courte, version drôle, fin plus douce ou retour à une histoire connue.',
        'Après une scène effrayante, donnez au héros une action de contrôle : allumer une lanterne, nommer le son, appeler un ami, poser une limite, dessiner le monstre en drôle. L’enfant voit la peur et une façon de la traverser.',
      ],
      pl: [
        'Niech potwór będzie zagadkowy, nie okrutny. Bohater bada, rozmawia albo znajduje światło. Finał przywraca bezpieczeństwo.',
        'Zielona strefa: tajemnica, szelest, śmieszny potwór, ciemny pokój z latarką, duch, który sam się boi. Żółta: pościg bez krzywdy, napięcie z pauzami, nocny las, dziwny dźwięk. Czerwona: realistyczna przemoc, bezradność, śmierć bliskich, horror w domu bez wyjścia.',
        'Przed startem ustalcie słowo stop. Po nim historia nie tłumaczy, czemu dziecko “nie powinno się bać”, tylko zmienia tryb: krótka pauza, śmieszna wersja, łagodniejszy finał albo powrót do znanej historii.',
        'Po strasznej scenie daj bohaterowi działanie kontroli: zapalić latarnię, nazwać dźwięk, zawołać przyjaciela, postawić granicę, narysować potwora śmiesznie. Dziecko widzi nie tylko strach, ale też sposób przejścia przez niego.',
      ],
    },
    adjustment: {
      uk: [
        'Якщо дитина просить вимкнути, вимкніть. Наступного разу виберіть “таємницю” замість “страшилки” і додайте гумор.',
        'Якщо після історії дитина довго не засинає, просить перевірити кімнату або тривожно повертається до сцени наступного дня, рівень був зависокий. Зменшуйте не лише монстра, а й темп, звук, темряву, невідомість.',
        'Якщо приснився кошмар, спершу поверніть безпеку: прийти, заспокоїти, нагадати, що це сон, дозволити маленьке світло або знайомий предмет. Розбирати сюжет краще не посеред ночі, а вдень.',
        'Якщо кошмари часті, страх заважає школі, сну або щоденному життю, історії не мають бути інструментом експериментів. Тут доречна розмова з педіатром або дитячим психологом.',
      ],
      en: [
        'If the child asks to stop, stop. Next time choose “mystery” instead of “scary” and add humor.',
        'If after the story the child cannot settle, asks to check the room, or anxiously returns to the scene the next day, the level was too high. Reduce not only the monster, but also pace, sound, darkness, and uncertainty.',
        'After a nightmare, restore safety first: come quickly, soothe, remind the child it was a dream, allow a small light or familiar object. Discuss the plot during the day, not in the middle of the night.',
        'If nightmares are frequent, or fear interferes with school, sleep, or daily life, stories should not become experiments. Talk with a pediatrician or child psychologist.',
      ],
      ru: [
        'Если ребенок просит остановиться, остановитесь. В следующий раз выберите “тайну” вместо “страшилки” и добавьте юмор.',
        'Если после истории ребенок долго не засыпает, просит проверить комнату или тревожно возвращается к сцене на следующий день, уровень был слишком высоким. Уменьшайте не только монстра, но и темп, звук, темноту, неизвестность.',
        'Если приснился кошмар, сначала верните безопасность: прийти, успокоить, напомнить, что это сон, разрешить маленький свет или знакомый предмет. Обсуждать сюжет лучше днем, а не среди ночи.',
        'Если кошмары частые, страх мешает школе, сну или обычной жизни, истории не должны быть инструментом экспериментов. Здесь уместен разговор с педиатром или детским психологом.',
      ],
      es: [
        'Si pide parar, para. La próxima vez elige misterio en vez de miedo y añade humor.',
        'Si después de la historia no se calma, pide revisar la habitación o vuelve ansioso a la escena al día siguiente, el nivel fue demasiado alto. Reduce no solo el monstruo, también ritmo, sonido, oscuridad e incertidumbre.',
        'Tras una pesadilla, primero devuelve seguridad: acude, calma, recuerda que fue un sueño, permite una luz pequeña u objeto conocido. El argumento se conversa mejor de día, no de madrugada.',
        'Si las pesadillas son frecuentes o el miedo afecta escuela, sueño o vida diaria, las historias no deben ser experimentos. Conviene hablar con pediatra o psicólogo infantil.',
      ],
      de: [
        'Wenn das Kind stoppen möchte, stoppe. Nächstes Mal: Rätsel statt Grusel und Humor dazu.',
        'Wenn das Kind nach der Geschichte nicht zur Ruhe kommt, das Zimmer prüfen lassen will oder am nächsten Tag ängstlich zur Szene zurückkehrt, war es zu viel. Nicht nur Monster reduzieren, auch Tempo, Klang, Dunkelheit und Ungewissheit.',
        'Nach einem Albtraum zuerst Sicherheit herstellen: kommen, beruhigen, erinnern, dass es ein Traum war, kleines Licht oder vertrauten Gegenstand erlauben. Die Handlung besser am Tag besprechen, nicht nachts.',
        'Wenn Albträume häufig sind oder Angst Schule, Schlaf oder Alltag stört, sollten Geschichten kein Experiment sein. Dann mit Kinderarzt oder Kinderpsychologin sprechen.',
      ],
      fr: [
        'Si l’enfant demande d’arrêter, arrêtez. La prochaine fois, choisissez mystère plutôt que peur et ajoutez de l’humour.',
        'Si après l’histoire l’enfant ne s’apaise pas, demande de vérifier la chambre ou revient anxieux à la scène le lendemain, le niveau était trop haut. Réduisez le monstre, mais aussi rythme, son, obscurité et incertitude.',
        'Après un cauchemar, restaurez d’abord la sécurité : venir, rassurer, rappeler que c’était un rêve, autoriser une petite lumière ou un objet familier. On parle de l’intrigue plutôt le jour, pas au milieu de la nuit.',
        'Si les cauchemars sont fréquents ou si la peur gêne l’école, le sommeil ou la vie quotidienne, les histoires ne doivent pas être des expériences. Parlez-en à un pédiatre ou psychologue pour enfants.',
      ],
      pl: [
        'Jeśli dziecko prosi o stop, zatrzymaj. Następnym razem wybierz tajemnicę zamiast strachu i dodaj humor.',
        'Jeśli po historii dziecko długo nie zasypia, prosi o sprawdzenie pokoju albo lękowo wraca do sceny następnego dnia, poziom był za wysoki. Zmniejsz nie tylko potwora, ale też tempo, dźwięk, ciemność i niepewność.',
        'Po koszmarze najpierw przywróć bezpieczeństwo: przyjdź, uspokój, przypomnij, że to sen, pozwól na małe światło albo znajomy przedmiot. Fabułę lepiej omawiać w dzień, nie w środku nocy.',
        'Jeśli koszmary są częste albo strach przeszkadza w szkole, śnie lub codziennym życiu, historie nie powinny być eksperymentem. Warto porozmawiać z pediatrą albo psychologiem dziecięcym.',
      ],
    },
    checklist: {
      uk: ['Сигнал “стоп” перед стартом.', 'Страх через загадку, а не жорстокість.', 'Дорослий читає або слухає поруч.', 'Герой має дію контролю.', 'Світлий, смішний або заспокійливий фінал.'],
      en: ['A stop signal before starting.', 'Fear through mystery, not cruelty.', 'An adult reads or listens nearby.', 'The hero has a control action.', 'A bright, funny, or calming ending.'],
      ru: ['Сигнал “стоп” перед стартом.', 'Страх через загадку, а не жестокость.', 'Взрослый читает или слушает рядом.', 'У героя есть действие контроля.', 'Светлый, смешной или успокаивающий финал.'],
      es: ['Señal de parar antes de empezar.', 'Miedo por misterio, no crueldad.', 'Adulto lee o escucha cerca.', 'El héroe tiene acción de control.', 'Final luminoso, gracioso o calmante.'],
      de: ['Stoppsignal vor dem Start.', 'Angst durch Rätsel, nicht Grausamkeit.', 'Erwachsener liest oder hört mit.', 'Die Figur hat eine Kontrollhandlung.', 'Helles, lustiges oder beruhigendes Ende.'],
      fr: ['Signal d’arrêt avant le début.', 'Peur par mystère, pas par cruauté.', 'Un adulte lit ou écoute près.', 'Le héros a une action de contrôle.', 'Fin lumineuse, drôle ou apaisante.'],
      pl: ['Sygnał stop przed startem.', 'Strach przez zagadkę, nie okrucieństwo.', 'Dorosły czyta albo słucha obok.', 'Bohater ma działanie kontroli.', 'Jasny, śmieszny albo uspokajający finał.'],
    },
    checklistCtaLabel: {
      uk: 'Створити страшну історію',
      en: 'Create a spooky story',
      ru: 'Создать страшную историю',
      es: 'Crear una historia de miedo',
      de: 'Gruselgeschichte erstellen',
      fr: 'Créer une histoire qui fait peur',
      pl: 'Stwórz straszną historię',
    },
    createStoryParams: { theme: 'scary_stories' },
    quote: {
      text: {
        uk: 'М’яке хвилювання може дати дітям змогу досліджувати страх у безпечному середовищі.',
        en: 'Gentle thrills can let kids explore fears in a safe environment.',
        ru: 'Мягкое волнение может помочь детям исследовать страхи в безопасной среде.',
        es: 'Las emociones suaves pueden permitir que los niños exploren miedos en un entorno seguro.',
        de: 'Sanfter Nervenkitzel kann Kindern helfen, Ängste in sicherer Umgebung zu erkunden.',
        fr: 'Des frissons doux peuvent aider les enfants à explorer leurs peurs dans un cadre sûr.',
        pl: 'Łagodne dreszcze mogą pomóc dzieciom badać lęki w bezpiecznym otoczeniu.',
      },
      attribution: 'Corinn Cross, MD, FAAP',
      sourceLabel: 'American Academy of Pediatrics / HealthyChildren',
      sourceUrl: 'https://www.healthychildren.org/English/tips-tools/ask-the-pediatrician/Pages/should-i-let-my-child-watch-scary-movies.aspx',
    },
    sources: [
      { label: 'Child Mind Institute: How to Help Children Manage Fears', url: 'https://childmind.org/article/help-children-manage-fears/' },
      { label: 'AAP / HealthyChildren: Scary movies and children', url: 'https://www.healthychildren.org/English/tips-tools/ask-the-pediatrician/Pages/should-i-let-my-child-watch-scary-movies.aspx' },
      { label: 'AAP / HealthyChildren: Nightmares, Night Terrors & Sleepwalking', url: 'https://www.healthychildren.org/English/ages-stages/preschool/Pages/Nightmares-and-Night-Terrors.aspx' },
      { label: 'APA: Helping children manage emotions', url: 'https://www.apa.org/topics/parenting/emotion-regulation' },
      { label: 'Harvard Center on the Developing Child: Persistent fear and anxiety', url: 'https://developingchild.harvard.edu/wp-content/uploads/2024/10/Persistent-Fear-and-Anxiety-Can-Affect-Young-Childrens-Learning-and-Development.pdf' },
      { label: 'Taranu et al.: Recreational Fear Across Childhood', url: 'https://link.springer.com/article/10.1007/s10578-025-01850-2' },
      { label: 'Lewis et al.: Bibliotherapy for nighttime fears', url: 'https://pubmed.ncbi.nlm.nih.gov/25638438/' },
      { label: 'Montgomery & Maunders: Creative bibliotherapy review', url: 'https://ideas.repec.org/a/eee/cysrev/v55y2015icp37-47.html' },
    ],
    visualDirection: 'A cute ghost holding a lantern, shadows turning into harmless shapes, warm safe ending.',
    relatedSlugs: ['story-morals-without-lecturing', 'child-created-characters'],
    inlineImages: articleInlineImages(
      'safe-scary-stories',
      l10n(
        'Дитина з ліхтариком досліджує шафу, а планшет лежить на низькому столику поруч',
        'A child investigates a closet with a flashlight while a tablet rests on a low stool nearby',
        'Ребенок с фонариком исследует шкаф, а планшет лежит на низком столике рядом',
        'Un niño explora el armario con una linterna mientras una tableta descansa cerca',
        'Ein Kind untersucht mit einer Taschenlampe den Schrank, während ein Tablet auf einem niedrigen Hocker liegt',
        'Un enfant explore le placard avec une lampe, une tablette posée sur un tabouret bas',
        'Dziecko z latarką sprawdza szafę, a tablet leży obok na niskim stołku'
      ),
      l10n(
        'Безпечна страшна історія дає дитині контроль: можна подивитися, зупинити і зрозуміти.',
        'A safe scary story gives the child control: look, pause, and understand.',
        'Безопасная страшная история дает ребенку контроль: посмотреть, остановиться и понять.',
        'Una historia de miedo segura da control: mirar, pausar y entender.',
        'Eine sichere Gruselgeschichte gibt Kontrolle: hinschauen, pausieren und verstehen.',
        'Une histoire qui fait peur sans danger donne du contrôle : regarder, faire pause, comprendre.',
        'Bezpieczna straszna historia daje kontrolę: spojrzeć, zatrzymać się i zrozumieć.'
      ),
      l10n(
        'Дитина і дорослий дивляться на дружнього маленького привида, планшет лежить на сидінні біля вікна',
        'A child and parent see a friendly little ghost while a tablet rests on the window seat',
        'Ребенок и взрослый смотрят на маленького дружелюбного призрака, а планшет лежит у окна',
        'Un niño y un adulto ven un pequeño fantasma amable mientras la tableta está junto a la ventana',
        'Ein Kind und ein Elternteil sehen einen freundlichen kleinen Geist, während ein Tablet auf der Fensterbank liegt',
        'Un enfant et un parent voient un petit fantôme amical, la tablette posée près de la fenêtre',
        'Dziecko i rodzic patrzą na małego przyjaznego ducha, a tablet leży przy oknie'
      ),
      l10n(
        'Фінал повертає напругу в м’яке диво: страшне стає зрозумілим і добрим.',
        'The ending turns tension into gentle wonder: the scary thing becomes understandable and kind.',
        'Финал превращает напряжение в мягкое чудо: страшное становится понятным и добрым.',
        'El final convierte la tensión en maravilla suave: lo inquietante se vuelve comprensible y amable.',
        'Das Ende verwandelt Spannung in sanftes Staunen: Das Unheimliche wird verständlich und freundlich.',
        'La fin transforme la tension en douce merveille : ce qui faisait peur devient compréhensible et gentil.',
        'Finał zmienia napięcie w łagodny zachwyt: straszne staje się zrozumiałe i dobre.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Контроль', title: 'Дитина має право зупинити історію', body: 'Сигнал “стоп” перед стартом робить страх керованим, а не нав’язаним.' },
        { eyebrow: 'Тон', title: 'Лячно не означає жорстоко', body: 'Для дітей краще працюють загадка, тінь, дивний звук, смішний монстр і повернення світла.' },
        { eyebrow: 'Після', title: 'Дивіться не на сміливість, а на наслідки', body: 'Якщо після історії з’явилися кошмари, уникання або тривога, рівень був занадто високим.' },
      ],
      en: [
        { eyebrow: 'Control', title: 'The child can stop the story', body: 'A stop signal before starting makes fear chosen and manageable, not imposed.' },
        { eyebrow: 'Tone', title: 'Spooky does not mean cruel', body: 'For children, mystery, shadow, strange sound, funny monster, and returning light often work better.' },
        { eyebrow: 'Afterward', title: 'Watch effects, not bravery', body: 'If nightmares, avoidance, or anxiety appear after the story, the level was too high.' },
      ],
      ru: [
        { eyebrow: 'Контроль', title: 'Ребенок может остановить историю', body: 'Сигнал “стоп” до начала делает страх управляемым, а не навязанным.' },
        { eyebrow: 'Тон', title: 'Страшно не значит жестоко', body: 'Для детей лучше работают загадка, тень, странный звук, смешной монстр и возвращение света.' },
        { eyebrow: 'После', title: 'Смотрите не на смелость, а на последствия', body: 'Если после истории появились кошмары, избегание или тревога, уровень был слишком высоким.' },
      ],
      es: [
        { eyebrow: 'Control', title: 'El niño puede parar la historia', body: 'Una señal de parar antes de empezar hace que el miedo sea elegido y manejable.' },
        { eyebrow: 'Tono', title: 'Inquietante no significa cruel', body: 'Para niños funcionan mejor misterio, sombra, sonido extraño, monstruo gracioso y vuelta de la luz.' },
        { eyebrow: 'Después', title: 'Mira efectos, no valentía', body: 'Si aparecen pesadillas, evitación o ansiedad, el nivel fue demasiado alto.' },
      ],
      de: [
        { eyebrow: 'Kontrolle', title: 'Das Kind darf stoppen', body: 'Ein Stoppsignal vor dem Start macht Angst wählbar und steuerbar, nicht aufgezwungen.' },
        { eyebrow: 'Ton', title: 'Gruselig heißt nicht grausam', body: 'Für Kinder wirken Rätsel, Schatten, seltsame Geräusche, lustige Monster und zurückkehrendes Licht besser.' },
        { eyebrow: 'Danach', title: 'Folgen beobachten, nicht Mut bewerten', body: 'Wenn Albträume, Vermeidung oder Angst auftreten, war die Stufe zu hoch.' },
      ],
      fr: [
        { eyebrow: 'Contrôle', title: 'L’enfant peut arrêter l’histoire', body: 'Un signal stop avant le début rend la peur choisie et maîtrisable, pas imposée.' },
        { eyebrow: 'Ton', title: 'Faire peur ne veut pas dire être cruel', body: 'Mystère, ombre, son étrange, monstre drôle et retour de lumière fonctionnent mieux.' },
        { eyebrow: 'Après', title: 'Observer les effets, pas le courage', body: 'Si cauchemars, évitement ou anxiété apparaissent, le niveau était trop haut.' },
      ],
      pl: [
        { eyebrow: 'Kontrola', title: 'Dziecko może zatrzymać historię', body: 'Sygnał stop przed startem sprawia, że strach jest wybrany i możliwy do opanowania.' },
        { eyebrow: 'Ton', title: 'Straszne nie znaczy okrutne', body: 'Dla dzieci lepsze są zagadka, cień, dziwny dźwięk, zabawny potwór i powrót światła.' },
        { eyebrow: 'Po', title: 'Patrz na skutki, nie na odwagę', body: 'Jeśli po historii są koszmary, unikanie albo lęk, poziom był za wysoki.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Як WonderTales тримає страшну історію в безпечних межах',
        intro: 'WonderTales розглядає страшну історію як контрольовану пригоду: важливі не тільки вік, а й настрій, час доби й недавній досвід дитини.',
        columns: ['Рівень', 'Що підходить', 'Коли обережно'],
        rows: [
          ['Зелений', 'Смішний монстр, таємниця, добра розв’язка', 'Підходить для вечора, якщо дитина любить такі сюжети'],
          ['Жовтий', 'Напруга, темний коридор, невідомий звук', 'Краще вдень або разом з дорослим поруч'],
          ['Червоний', 'Реалістичне насильство, безвихідь, тілесні деталі', 'Не для дитячого ритуалу і не перед сном'],
          ['Пауза', 'Дитина просить зупинити або змінити тему', 'Зупинити одразу, без “дочитай до кінця”'],
        ],
      },
      en: {
        heading: 'How WonderTales keeps scary stories within safe limits',
        intro: 'WonderTales treats a scary story as a controlled adventure: age matters, but so do mood, time of day, and recent experience.',
        columns: ['Level', 'What fits', 'Use caution when'],
        rows: [
          ['Green', 'Funny monster, mystery, kind resolution', 'Works in the evening if the child likes this tone'],
          ['Yellow', 'Tension, dark hallway, unknown sound', 'Better during the day or with an adult close by'],
          ['Red', 'Realistic violence, hopelessness, body details', 'Not for a child ritual and not before bed'],
          ['Pause', 'Child asks to stop or change topic', 'Stop immediately, no “finish it first”'],
        ],
      },
      ru: {
        heading: 'Как WonderTales держит страшную историю в безопасных границах',
        intro: 'WonderTales рассматривает страшную историю как контролируемое приключение: важен не только возраст, но и настроение, время дня и недавний опыт ребенка.',
        columns: ['Уровень', 'Что подходит', 'Когда осторожно'],
        rows: [
          ['Зеленый', 'Смешной монстр, тайна, добрый финал', 'Подходит вечером, если ребенок любит такой тон'],
          ['Желтый', 'Напряжение, темный коридор, неизвестный звук', 'Лучше днем или вместе со взрослым рядом'],
          ['Красный', 'Реалистичное насилие, безысходность, телесные детали', 'Не для детского ритуала и не перед сном'],
          ['Пауза', 'Ребенок просит остановить или сменить тему', 'Остановить сразу, без “дочитай до конца”'],
        ],
      },
      es: {
        heading: 'Cómo WonderTales mantiene el miedo en límites seguros',
        intro: 'WonderTales trata la historia de miedo como una aventura controlada: importan edad, ánimo, hora del día y experiencias recientes.',
        columns: ['Nivel', 'Qué encaja', 'Precaución'],
        rows: [
          ['Verde', 'Monstruo gracioso, misterio, final amable', 'Puede servir de noche si le gusta ese tono'],
          ['Amarillo', 'Tensión, pasillo oscuro, sonido desconocido', 'Mejor de día o con adulto cerca'],
          ['Rojo', 'Violencia realista, desesperanza, detalles corporales', 'No para ritual infantil ni antes de dormir'],
          ['Pausa', 'Pide parar o cambiar tema', 'Parar de inmediato, sin “termina primero”'],
        ],
      },
      de: {
        heading: 'Wie WonderTales Grusel in sicheren Grenzen hält',
        intro: 'WonderTales behandelt Grusel als kontrolliertes Abenteuer: Alter zählt, aber auch Stimmung, Tageszeit und jüngste Erfahrungen.',
        columns: ['Stufe', 'Was passt', 'Vorsicht wenn'],
        rows: [
          ['Grün', 'Lustiges Monster, Rätsel, gutes Ende', 'Abends okay, wenn das Kind diesen Ton mag'],
          ['Gelb', 'Spannung, dunkler Flur, unbekanntes Geräusch', 'Besser tagsüber oder mit Erwachsenem daneben'],
          ['Rot', 'Realistische Gewalt, Hoffnungslosigkeit, Körperdetails', 'Nicht für Kinderritual und nicht vor dem Schlafen'],
          ['Pause', 'Kind möchte stoppen oder Thema wechseln', 'Sofort stoppen, kein “erst fertig hören”'],
        ],
      },
      fr: {
        heading: 'Comment WonderTales garde la peur dans des limites sûres',
        intro: 'WonderTales traite l’histoire qui fait peur comme une aventure contrôlée : âge, humeur, moment et expériences récentes comptent.',
        columns: ['Niveau', 'Ce qui convient', 'Prudence quand'],
        rows: [
          ['Vert', 'Monstre drôle, mystère, fin douce', 'Possible le soir si l’enfant aime ce ton'],
          ['Jaune', 'Tension, couloir sombre, son inconnu', 'Mieux le jour ou avec un adulte proche'],
          ['Rouge', 'Violence réaliste, désespoir, détails corporels', 'Pas pour un rituel enfant ni avant le coucher'],
          ['Pause', 'L’enfant demande d’arrêter ou changer', 'Arrêter tout de suite, pas de “finis d’abord”'],
        ],
      },
      pl: {
        heading: 'Jak WonderTales trzyma strach w bezpiecznych granicach',
        intro: 'WonderTales traktuje straszną historię jak kontrolowaną przygodę: liczy się wiek, nastrój, pora dnia i niedawne doświadczenia.',
        columns: ['Poziom', 'Co pasuje', 'Kiedy ostrożnie'],
        rows: [
          ['Zielony', 'Zabawny potwór, tajemnica, dobry finał', 'Może być wieczorem, jeśli dziecko lubi ten ton'],
          ['Żółty', 'Napięcie, ciemny korytarz, nieznany dźwięk', 'Lepiej w dzień albo z dorosłym obok'],
          ['Czerwony', 'Realistyczna przemoc, beznadzieja, szczegóły ciała', 'Nie do rytuału dziecka i nie przed snem'],
          ['Pauza', 'Dziecko prosi o stop albo zmianę tematu', 'Zatrzymać od razu, bez “dokończ najpierw”'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Безпечний старт',
        heading: 'Як домовитися про страшилку перед початком',
        intro: 'Так дитина відчуває контроль ще до першої темної сцени.',
        steps: [
          { title: 'Вибрати рівень', body: 'Запитайте: сьогодні смішно-страшно, загадково чи зовсім без страшного?' },
          { title: 'Назвати стоп-слово', body: 'Будь-яке слово або жест означає паузу без пояснень.' },
          { title: 'Тримати світлий вихід', body: 'У фіналі герой має знайти допомогу, світло, гумор або безпечне місце.' },
          { title: 'Перевірити після', body: 'Запитайте не “було страшно?”, а “який момент хочеш зробити м’якшим наступного разу?”' },
        ],
      },
      en: {
        eyebrow: 'Safe start',
        heading: 'How to agree on a scary story before starting',
        intro: 'This gives the child control before the first dark scene.',
        steps: [
          { title: 'Choose the level', body: 'Ask: funny-spooky, mysterious, or no scary parts today?' },
          { title: 'Name a stop signal', body: 'Any word or gesture means pause without explanation.' },
          { title: 'Keep a bright exit', body: 'The ending should bring help, light, humor, or a safe place.' },
          { title: 'Check afterward', body: 'Ask not “was it scary?” but “which moment should be softer next time?”' },
        ],
      },
      ru: {
        eyebrow: 'Безопасный старт',
        heading: 'Как договориться о страшилке до начала',
        intro: 'Так ребенок чувствует контроль еще до первой темной сцены.',
        steps: [
          { title: 'Выбрать уровень', body: 'Спросите: сегодня смешно-страшно, загадочно или совсем без страшного?' },
          { title: 'Назвать стоп-сигнал', body: 'Любое слово или жест означает паузу без объяснений.' },
          { title: 'Оставить светлый выход', body: 'В финале герой находит помощь, свет, юмор или безопасное место.' },
          { title: 'Проверить после', body: 'Спросите не “было страшно?”, а “какой момент сделать мягче в следующий раз?”' },
        ],
      },
      es: {
        eyebrow: 'Inicio seguro',
        heading: 'Acordar el miedo antes de empezar',
        intro: 'Así el niño siente control antes de la primera escena oscura.',
        steps: [
          { title: 'Elegir nivel', body: 'Pregunta: ¿divertido-inquietante, misterioso o hoy sin miedo?' },
          { title: 'Nombrar señal de pausa', body: 'Cualquier palabra o gesto significa pausa sin explicaciones.' },
          { title: 'Mantener salida luminosa', body: 'El final debe traer ayuda, luz, humor o lugar seguro.' },
          { title: 'Revisar después', body: 'Pregunta no “¿dio miedo?”, sino “¿qué momento suavizamos la próxima vez?”' },
        ],
      },
      de: {
        eyebrow: 'Sicherer Start',
        heading: 'Grusel vor dem Start vereinbaren',
        intro: 'So hat das Kind Kontrolle vor der ersten dunklen Szene.',
        steps: [
          { title: 'Stufe wählen', body: 'Frage: lustig-gruselig, geheimnisvoll oder heute gar nicht gruselig?' },
          { title: 'Stoppsignal nennen', body: 'Jedes Wort oder Zeichen bedeutet Pause ohne Erklärung.' },
          { title: 'Hellen Ausgang behalten', body: 'Das Ende bringt Hilfe, Licht, Humor oder einen sicheren Ort.' },
          { title: 'Danach prüfen', body: 'Nicht “war es gruselig?”, sondern “welcher Moment soll nächstes Mal sanfter sein?”' },
        ],
      },
      fr: {
        eyebrow: 'Départ sûr',
        heading: 'Se mettre d’accord avant l’histoire',
        intro: 'L’enfant garde du contrôle avant la première scène sombre.',
        steps: [
          { title: 'Choisir le niveau', body: 'Demandez : drôle-frisson, mystérieux ou sans peur aujourd’hui ?' },
          { title: 'Nommer un stop', body: 'Un mot ou geste signifie pause sans explication.' },
          { title: 'Garder une sortie lumineuse', body: 'La fin doit apporter aide, lumière, humour ou lieu sûr.' },
          { title: 'Vérifier après', body: 'Demandez non “as-tu eu peur ?”, mais “quel moment adoucir la prochaine fois ?”' },
        ],
      },
      pl: {
        eyebrow: 'Bezpieczny start',
        heading: 'Jak ustalić strach przed początkiem',
        intro: 'Dziecko czuje kontrolę jeszcze przed pierwszą ciemną sceną.',
        steps: [
          { title: 'Wybrać poziom', body: 'Zapytaj: zabawnie-strasznie, tajemniczo czy dziś bez strachu?' },
          { title: 'Nazwać sygnał stop', body: 'Dowolne słowo albo gest oznacza pauzę bez tłumaczeń.' },
          { title: 'Zostawić jasne wyjście', body: 'Finał daje pomoc, światło, humor albo bezpieczne miejsce.' },
          { title: 'Sprawdzić po', body: 'Pytaj nie “było strasznie?”, ale “który moment zrobimy łagodniejszy następnym razem?”' },
        ],
      },
    },
  },
  {
    slug: 'rewarded-story-quizzes',
    heroImage: '/landing/blog/rewarded-story-quizzes-scene-01.webp',
    updatedAt: '2026-06-29',
    category: l10n(
      'Вікторини й мотивація',
      'Quizzes and motivation',
      'Викторины и мотивация',
      'Cuestionarios y motivación',
      'Quiz und Motivation',
      'Quiz et motivation',
      'Quizy i motywacja'
    ),
    title: l10n(
      'Вікторини з винагородою після історії: самоперевірка без шкільного тиску',
      'Rewarded story quizzes: self-checks without school pressure',
      'Викторины с вознаграждением после истории: самопроверка без школьного давления',
      'Cuestionarios con recompensa: comprobar sin presión escolar',
      'Story-Quiz mit Belohnung: Selbstcheck ohne Schuldruck',
      'Quiz récompensés après l’histoire : vérifier sans pression scolaire',
      'Quizy z nagrodą po historii: sprawdzanie bez szkolnej presji'
    ),
    description: l10n(
      'Як перетворити питання після казки на легку гру: пригадати деталь, отримати маленьку винагороду і поговорити, не перетворюючи читання на урок.',
      'How to turn questions after a story into a light game: remember a detail, unlock a small reward, and talk without turning reading into a lesson.',
      'Как превратить вопросы после сказки в легкую игру: вспомнить деталь, получить маленькую награду и поговорить, не превращая чтение в урок.',
      'Cómo convertir las preguntas después de una historia en un juego ligero con recuerdo, premio pequeño y conversación.',
      'Wie Fragen nach der Geschichte zu einem leichten Spiel werden: erinnern, kleine Belohnung, Gespräch statt Unterricht.',
      'Transformer les questions après l’histoire en jeu léger : se souvenir, recevoir un petit prix et parler sans faire leçon.',
      'Jak zmienić pytania po historii w lekką grę: przypomnieć detal, odblokować małą nagrodę i porozmawiać bez lekcji.'
    ),
    lead: l10n(
      'Дитині не потрібен ще один іспит увечері. Але коротка місія після історії може допомогти помітити сенс, відчути успіх і захотіти повернутися до читання.',
      'A child does not need another exam at night. A tiny quest after a story can help them notice meaning, feel successful, and want to come back to reading.',
      'Ребенку не нужен еще один экзамен вечером. Но короткая миссия после истории помогает заметить смысл, почувствовать успех и захотеть вернуться к чтению.',
      'Un niño no necesita otro examen por la noche. Una pequeña misión tras la historia puede ayudarle a notar sentido, sentir éxito y volver a leer.',
      'Ein Kind braucht abends keine weitere Prüfung. Eine kleine Mission nach der Geschichte kann Sinn sichtbar machen, Erfolg geben und Lust aufs Lesen erhalten.',
      'Un enfant n’a pas besoin d’un examen de plus le soir. Une petite mission après l’histoire peut aider à voir le sens, réussir et revenir lire.',
      'Dziecko nie potrzebuje wieczorem kolejnego sprawdzianu. Mała misja po historii pomaga zauważyć sens, poczuć sukces i wrócić do czytania.'
    ),
    focus: {
      uk: [
        'Після хорошого сюжету питання має звучати як “згадай секрет героя”, а не “доведи, що слухав”. У WonderTales коротка вікторина підсвічує сенс історії: хто допоміг, що змінило рішення героя, який предмет виявився важливим.',
        'Найчастіший батьківський страх звучить чесно: “а раптом дитина читатиме тільки за приз?”. У WonderTales винагорода не купує увагу, а працює як маленький ритуал завершення: значок, іскорка, вибір наступного героя або м’яка додаткова сцена.',
        'Вікторина тримається короткою: кілька завдань на хвилину, щоб відновити порядок подій, вибрати предмет із сюжету, знайти емоцію персонажа або пояснити причину. Це не оцінка, а спосіб сказати дитині: “ти помітив важливе, ти всередині історії”.',
      ],
      en: [
        'After a good story, the question can feel like “remember the hero’s secret,” not “prove you listened.” In WonderTales, the short quiz highlights story meaning: who helped, what changed the hero’s decision, which object mattered.',
        'The parent worry is reasonable: “what if my child reads only for the prize?” In WonderTales, the reward does not buy attention; it acts as a tiny closing ritual: a badge, a sparkle, the right to choose the next hero, or a soft bonus scene.',
        'The quiz stays short: a few one-minute activities to restore the order of events, choose a story object, find a character’s emotion, or explain a cause. It is not a grade; it is a way to tell the child, “you noticed something important.”',
      ],
      ru: [
        'После хорошего сюжета вопрос может звучать как “вспомни секрет героя”, а не “докажи, что слушал”. В WonderTales короткая викторина подсвечивает смысл истории: кто помог, что изменило решение героя, какой предмет оказался важным.',
        'Главный родительский страх здесь понятен: “а вдруг ребенок будет читать только ради приза?”. В WonderTales награда не покупает внимание, а работает как маленький ритуал завершения: значок, искорка, выбор следующего героя или мягкая дополнительная сцена.',
        'Викторина остается короткой: несколько заданий на минуту, чтобы восстановить порядок событий, выбрать предмет из сюжета, найти эмоцию персонажа или объяснить причину. Это не оценка, а способ сказать ребенку: “ты заметил важное, ты внутри истории”.',
      ],
      es: [
        'Tras una buena historia, la pregunta puede sonar a “recuerda el secreto del héroe”, no a “demuestra que escuchaste”. En WonderTales, el cuestionario breve ilumina el sentido: quién ayudó, qué cambió la decisión, qué objeto importaba.',
        'La preocupación de muchas familias es razonable: “¿y si lee solo por el premio?”. En WonderTales, la recompensa no compra atención; funciona como pequeño ritual de cierre: insignia, brillo, elegir al siguiente héroe o abrir una escena extra suave.',
        'El cuestionario se mantiene breve: unas pocas actividades de un minuto para ordenar hechos, elegir un objeto, encontrar una emoción o explicar una causa. No es una nota; es una forma de decir: “viste algo importante dentro de la historia”.',
      ],
      de: [
        'Nach einer guten Geschichte kann die Frage wie “erinnere dich an das Geheimnis der Figur” klingen, nicht wie “beweise, dass du zugehört hast”. In WonderTales macht das kurze Quiz Bedeutung sichtbar: wer geholfen hat, was eine Entscheidung änderte, welcher Gegenstand wichtig war.',
        'Die Sorge vieler Eltern ist berechtigt: “Liest mein Kind dann nur noch für die Belohnung?” In WonderTales kauft die Belohnung keine Aufmerksamkeit; sie wirkt als kleiner Abschlussritus: Abzeichen, Funkeln, die nächste Figur wählen oder eine sanfte Bonusszene öffnen.',
        'Das Quiz bleibt kurz: wenige Ein-Minuten-Aufgaben, um Ereignisse zu ordnen, einen Gegenstand zu wählen, ein Gefühl zu finden oder eine Ursache zu erklären. Das ist keine Note, sondern die Botschaft: “Du hast etwas Wichtiges bemerkt.”',
      ],
      fr: [
        'Après une bonne histoire, la question peut ressembler à “retrouve le secret du héros”, pas à “prouve que tu as écouté”. Dans WonderTales, le quiz court éclaire le sens : qui a aidé, ce qui a changé une décision, quel objet comptait.',
        'L’inquiétude parentale est légitime : “et si mon enfant lisait seulement pour le prix ?”. Dans WonderTales, la récompense n’achète pas l’attention; elle agit comme un petit rituel de fin : badge, étincelle, choix du prochain héros ou scène bonus douce.',
        'Le quiz reste bref : quelques activités d’une minute pour remettre les événements en ordre, choisir un objet, trouver une émotion ou expliquer une cause. Ce n’est pas une note, mais une manière de dire : “tu as remarqué quelque chose d’important”.',
      ],
      pl: [
        'Po dobrej historii pytanie może brzmieć jak “przypomnij sobie sekret bohatera”, nie “udowodnij, że słuchałeś”. W WonderTales krótki quiz podświetla sens: kto pomógł, co zmieniło decyzję bohatera, jaki przedmiot był ważny.',
        'Obawa rodziców jest zrozumiała: “czy dziecko będzie czytać tylko dla nagrody?”. W WonderTales nagroda nie kupuje uwagi; działa jak mały rytuał zakończenia: odznaka, iskierka, wybór następnego bohatera albo łagodna scena bonusowa.',
        'Quiz pozostaje krótki: kilka minutowych zadań, aby ułożyć kolejność, wybrać przedmiot, znaleźć emocję albo wyjaśnić przyczynę. To nie ocena, lecz komunikat: “zauważyłeś coś ważnego”.',
      ],
    },
    research: {
      uk: [
        'Henry L. Roediger III із Вашингтонського університету в Сент-Луїсі і Jeffrey D. Karpicke з Університету Пердью показали: пригадування саме по собі може зміцнювати довготривале запам’ятовування, а не тільки перевіряти знання. Великий огляд John Dunlosky з Кентського державного університету та колег назвав регулярну самоперевірку однією з найкорисніших технік навчання, особливо коли це коротка повторювана практика, а не рідкісний великий іспит.',
        'У роботах про практику пригадування важлива не сама кнопка “правильно”, а спроба дістати зміст із пам’яті й одразу отримати зрозумілий зворотний зв’язок. Andrew C. Butler і Henry L. Roediger III з Вашингтонського університету в Сент-Луїсі показували, що зворотний зв’язок після відповіді допомагає виправляти помилки. У WonderTales це відображено через підказку з історії замість сухого “ні”.',
        'З іншого боку, Richard M. Ryan і Edward L. Deci з Рочестерського університету нагадують: мотивацію підтримують автономія, компетентність і зв’язок. У батьківських обговореннях про призи видно дві правди: інколи маленький стимул допомагає почати, але контрольна винагорода може витіснити інтерес. Тому вікторина в WonderTales уже працює як коротка добровільна пригода, а не як оцінка.',
      ],
      en: [
        'Henry L. Roediger III from Washington University in St. Louis and Jeffrey D. Karpicke from Purdue University showed that retrieval can strengthen long-term retention, not merely check knowledge. A large review led by John Dunlosky at Kent State University rated practice testing as a high-utility learning technique, especially when it is short repeated practice instead of a rare big exam.',
        'In retrieval practice, the key is not the “correct” button; it is the attempt to bring meaning back from memory and receive usable feedback. Andrew C. Butler and Henry L. Roediger III at Washington University in St. Louis showed that feedback after an answer helps correct errors. WonderTales reflects this with a story clue instead of a flat “no.”',
        'At the same time, Richard M. Ryan and Edward L. Deci from the University of Rochester remind us that motivation is supported by autonomy, competence, and connection. Parent discussions about rewards show two truths: a small prompt can help a child start, but controlling rewards can crowd out interest. That is why the WonderTales quiz works as a short optional adventure, not a grade.',
      ],
      ru: [
        'Henry L. Roediger III из Вашингтонского университета в Сент-Луисе и Jeffrey D. Karpicke из Университета Пердью показали: припоминание может укреплять долговременное запоминание, а не только проверять знания. Большой обзор John Dunlosky из Кентского государственного университета и коллег относит регулярную самопроверку к самым полезным техникам обучения, особенно когда это короткая повторяющаяся практика, а не редкий большой экзамен.',
        'В работах о практике припоминания важна не сама кнопка “правильно”, а попытка достать смысл из памяти и сразу получить понятную обратную связь. Andrew C. Butler и Henry L. Roediger III из Вашингтонского университета в Сент-Луисе показывали, что обратная связь после ответа помогает исправлять ошибки. В WonderTales это отражено через подсказку из истории вместо сухого “нет”.',
        'С другой стороны, Richard M. Ryan и Edward L. Deci из Рочестерского университета напоминают: мотивацию поддерживают автономия, компетентность и связь. В родительских обсуждениях о призах видны две правды: иногда маленький стимул помогает начать, но контролирующая награда может вытеснять интерес. Поэтому викторина в WonderTales уже работает как короткое добровольное приключение, а не как оценка.',
      ],
      es: [
        'Henry L. Roediger III, de la Universidad Washington en San Luis, y Jeffrey D. Karpicke, de la Universidad Purdue, mostraron que recuperar información fortalece la memoria a largo plazo, no solo la mide. Una revisión liderada por John Dunlosky en la Universidad Estatal de Kent situó la práctica de autoevaluación entre las técnicas de mayor utilidad, sobre todo cuando es breve y repetida.',
        'En la práctica de recuperación, lo importante no es el botón “correcto”, sino intentar traer el sentido desde la memoria y recibir una ayuda clara. Andrew C. Butler y Henry L. Roediger III, de la Universidad Washington en San Luis, mostraron que la retroalimentación ayuda a corregir errores. WonderTales lo refleja con una pista de la historia en lugar de un “no” seco.',
        'A la vez, Richard M. Ryan y Edward L. Deci, de la Universidad de Rochester, recuerdan que la motivación necesita autonomía, competencia y vínculo. En debates de padres sobre premios aparecen dos verdades: un incentivo pequeño puede ayudar a empezar, pero una recompensa controladora puede desplazar el interés. Por eso el cuestionario de WonderTales funciona como aventura breve y opcional, no como nota.',
      ],
      de: [
        'Henry L. Roediger III von der Washington-Universität in St. Louis und Jeffrey D. Karpicke von der Purdue-Universität zeigten, dass Abrufen langfristiges Behalten stärkt und nicht nur Wissen prüft. Eine große Übersicht unter Leitung von John Dunlosky an der Kent-State-Universität bewertete regelmäßige Selbstabfragen als besonders nützlich, vor allem als kurze wiederholte Praxis.',
        'Bei der Übung des Erinnerns zählt nicht der “richtig”-Knopf, sondern der Versuch, Bedeutung aus dem Gedächtnis zu holen und hilfreiche Rückmeldung zu bekommen. Andrew C. Butler und Henry L. Roediger III von der Washington-Universität in St. Louis zeigten, dass Rückmeldung nach Antworten Fehler korrigieren hilft. WonderTales greift das mit einer Spur aus der Geschichte auf, nicht mit einem trockenen “nein”.',
        'Gleichzeitig erinnern Richard M. Ryan und Edward L. Deci von der Universität Rochester daran, dass Motivation Autonomie, Kompetenz und Beziehung braucht. In Elterndebatten über Belohnungen sieht man beides: Ein kleiner Anstoß kann den Start erleichtern, kontrollierende Belohnung kann Interesse verdrängen. Das WonderTales-Quiz funktioniert deshalb als kurzes freiwilliges Abenteuer, nicht als Note.',
      ],
      fr: [
        'Henry L. Roediger III, de l’Université Washington à Saint-Louis, et Jeffrey D. Karpicke, de l’Université Purdue, ont montré que récupérer une information renforce la mémoire à long terme, pas seulement l’évalue. Une grande revue menée par John Dunlosky à l’Université d’État de Kent classe l’autoévaluation régulière parmi les techniques les plus utiles, surtout quand elle est courte et répétée.',
        'Dans la pratique de récupération en mémoire, le cœur n’est pas le bouton “correct”, mais l’effort de retrouver le sens et de recevoir un retour utile. Andrew C. Butler et Henry L. Roediger III, de l’Université Washington à Saint-Louis, ont montré que le retour après réponse aide à corriger les erreurs. WonderTales reprend cela avec un indice tiré de l’histoire, pas un simple “non”.',
        'En même temps, Richard M. Ryan et Edward L. Deci, de l’Université de Rochester, rappellent que la motivation s’appuie sur autonomie, compétence et lien. Les discussions de parents sur les récompenses montrent deux vérités : un petit encouragement peut aider à commencer, mais une récompense contrôlante peut étouffer l’intérêt. Le quiz WonderTales fonctionne donc comme une courte aventure volontaire, pas comme une note.',
      ],
      pl: [
        'Henry L. Roediger III z Uniwersytetu Waszyngtona w St. Louis i Jeffrey D. Karpicke z Uniwersytetu Purdue pokazali, że przypominanie wzmacnia pamięć długotrwałą, a nie tylko ją sprawdza. Duży przegląd prowadzony przez John Dunlosky z Uniwersytetu Stanowego Kent uznał regularne samosprawdzanie za jedną z najbardziej użytecznych technik, szczególnie gdy jest krótką, powtarzaną praktyką.',
        'W praktyce przypominania ważny nie jest sam przycisk “dobrze”, lecz próba wydobycia sensu z pamięci i szybka, zrozumiała informacja zwrotna. Andrew C. Butler i Henry L. Roediger III z Uniwersytetu Waszyngtona w St. Louis pokazywali, że informacja zwrotna po odpowiedzi pomaga poprawiać błędy. WonderTales wykorzystuje to jako wskazówkę z historii zamiast suchego “nie”.',
        'Z drugiej strony Richard M. Ryan i Edward L. Deci z Uniwersytetu Rochester przypominają, że motywację wspierają autonomia, kompetencja i więź. W rozmowach rodziców o nagrodach widać dwie prawdy: mały bodziec może pomóc zacząć, ale kontrolująca nagroda może wypierać zainteresowanie. Quiz w WonderTales działa więc jak krótka dobrowolna przygoda, nie jak ocena.',
      ],
    },
    storyUse: {
      uk: [
        'У WonderTales вікторина після історії вже подана як продовження пригоди на планшеті: “відкрий приз”, “знайди слід”, “допоможи герою згадати”. Завдання можуть бути об’єктивними, але тон лишається ігровим: дитина не складає тест, а завершує маленьку місію.',
        'Це допомагає батькам не вигадувати перевірку з нуля. Вікторина веде дитину від факту до причинності, а потім до емоції або вибору героя: що лежало біля воріт, чому дракон зупинився, як герой зрозумів, що друг боїться.',
        'Розмовні питання в цьому сценарії не перетворюються на бали. Дорослий може просто підхопити відповідь дитини: “спочатку твоя версія, потім подивимося підказку”. Повторна спроба лишається частиною гри, а винагорода — маленьким знаком завершеної пригоди.',
      ],
      en: [
        'In WonderTales, the quiz after a story is already framed as a continuation on the tablet: “unlock the prize,” “find the clue,” “help the hero remember.” Activities can be objective while the tone stays playful: the child is finishing a small mission, not taking a test.',
        'This helps parents avoid inventing a check from scratch. The quiz leads the child from fact to cause, then to emotion or choice: what was near the gate, why the dragon stopped, how the hero knew the friend was afraid.',
        'Reflective questions in this flow do not become points. The adult can simply follow the child’s answer: “your version first, then we will look at the clue.” Retrying stays part of the game, and the reward is a small sign of a completed adventure.',
      ],
      ru: [
        'В WonderTales викторина после истории уже подана как продолжение приключения на планшете: “открой приз”, “найди след”, “помоги герою вспомнить”. Задания могут быть объективными, но тон остается игровым: ребенок не сдает тест, а завершает маленькую миссию.',
        'Это помогает родителям не придумывать проверку с нуля. Викторина ведет ребенка от факта к причинности, а затем к эмоции или выбору героя: что лежало у ворот, почему дракон остановился, как герой понял, что друг боится.',
        'Вопросы-разговоры в таком сценарии не превращаются в баллы. Взрослый может просто подхватить ответ: “сначала твоя версия, потом посмотрим подсказку”. Повтор остается частью игры, а награда — маленьким знаком завершенного приключения.',
      ],
      es: [
        'En WonderTales, el cuestionario ya aparece como continuación en la tableta: “abre el premio”, “encuentra la pista”, “ayuda al héroe a recordar”. Las tareas pueden ser objetivas, pero el tono sigue siendo lúdico: el niño completa una misión, no un examen.',
        'Esto ayuda a los padres a no inventar una comprobación desde cero. El cuestionario guía del hecho a la causa y luego a emoción o elección: qué había junto a la puerta, por qué se detuvo el dragón, cómo supo el héroe que su amigo tenía miedo.',
        'Las preguntas reflexivas no se convierten en puntos. El adulto puede seguir la respuesta: “primero tu versión, luego miramos la pista”. Reintentar queda como parte del juego, y el premio señala una aventura completada.',
      ],
      de: [
        'In WonderTales ist das Quiz bereits als Fortsetzung auf dem Tablet gerahmt: “Preis öffnen”, “Spur finden”, “der Figur beim Erinnern helfen”. Aufgaben dürfen objektiv sein, der Ton bleibt spielerisch: Das Kind beendet eine kleine Mission, keine Prüfung.',
        'Das hilft Eltern, keine eigene Abfrage erfinden zu müssen. Das Quiz führt vom Fakt zur Ursache und dann zu Gefühl oder Entscheidung: was am Tor lag, warum der Drache stehen blieb, woran die Figur merkte, dass der Freund Angst hatte.',
        'Gesprächsfragen werden in diesem Ablauf nicht zu Punkten. Erwachsene können die Antwort einfach aufnehmen: “Erst deine Version, dann schauen wir auf den Hinweis.” Wiederholen bleibt Teil des Spiels, und die Belohnung zeigt ein abgeschlossenes Abenteuer.',
      ],
      fr: [
        'Dans WonderTales, le quiz est déjà présenté comme une suite sur la tablette : “débloque le prix”, “trouve l’indice”, “aide le héros à se souvenir”. Les tâches peuvent être objectives, mais le ton reste ludique : l’enfant termine une petite mission, pas un examen.',
        'Cela évite aux parents d’inventer une vérification. Le quiz mène du fait à la cause, puis à l’émotion ou au choix : ce qui était près de la porte, pourquoi le dragon s’est arrêté, comment le héros a vu que son ami avait peur.',
        'Les questions de discussion ne deviennent pas des points. L’adulte peut simplement suivre la réponse : “d’abord ta version, puis on regarde l’indice”. Réessayer reste dans le jeu, et la récompense signale l’aventure terminée.',
      ],
      pl: [
        'W WonderTales quiz po historii jest już dalszą częścią przygody na tablecie: “odblokuj nagrodę”, “znajdź ślad”, “pomóż bohaterowi pamiętać”. Zadania mogą być sprawdzalne, ale ton zostaje zabawowy: dziecko kończy małą misję, nie test.',
        'To pomaga rodzicom nie wymyślać sprawdzania od zera. Quiz prowadzi od faktu do przyczyny, potem do emocji albo wyboru bohatera: co leżało przy bramie, dlaczego smok się zatrzymał, skąd bohater wiedział, że przyjaciel się boi.',
        'Pytania do rozmowy nie zamieniają się tu w punkty. Dorosły może po prostu podchwycić odpowiedź: “najpierw twoja wersja, potem zobaczymy wskazówkę”. Powtórka zostaje częścią gry, a nagroda znakiem ukończonej przygody.',
      ],
    },
    adjustment: {
      uk: [
        'Якщо дитина напружується, сперечається через “неправильно” або просить підказку до кожного кроку, перейдіть від самоперевірки до вкладки “Поговоримо про цю історію?” у розділі “Завдання після історії”. Там відповідь працює як думка для розмови з дорослим, а не як оцінка, тому можна спокійно обговорити: “що б ти зробив на місці героя?”.',
        'Якщо дитина починає гнатися тільки за призом, зменште його помітність і використайте розмовну вкладку як людський місток після завдання. У WonderTales це вже розділено: приз завершує коротку гру, а “Поговоримо про цю історію?” повертає увагу до сюжету, емоцій і вибору героя.',
        'Якщо дитина вже читає із задоволенням, вікторина не обов’язкова щовечора. Іноді достатньо відкрити “Поговоримо про цю історію?” й поговорити з батьками, іноді — пропустити завдання й залишити історію чистим відпочинком. Головний маркер: після активності дитина хоче повернутися до історій, а не втекти від них.',
      ],
      en: [
        'If the child becomes tense, argues about being “wrong,” or asks for hints at every step, move from self-checking to the “Shall we talk about this story?” tab inside “Activities after the story.” There, an answer works as a thought for talking with an adult, not as a grade, so the conversation can stay open: “what would you do in the hero’s place?”',
        'If the child starts chasing only the prize, reduce its visibility and use the talk tab as a human bridge after the activity. WonderTales already separates the two: the prize closes a short game, while “Shall we talk about this story?” brings attention back to plot, feelings, and the hero’s choice.',
        'If the child already reads happily, the quiz does not need to appear every night. Sometimes it is enough to open “Shall we talk about this story?” and talk with a parent; sometimes it is better to skip the activities and keep the story as pure rest. The real signal is whether the child wants to return to stories afterward.',
      ],
      ru: [
        'Если ребенок напрягается, спорит из-за “неправильно” или просит подсказку на каждом шаге, переходите от самопроверки к вкладке “Поговорим об этой истории?” в разделе “Задания после истории”. Там ответ работает как мысль для разговора с родителем, а не как оценка, поэтому можно спокойно обсудить: “что бы ты сделал на месте героя?”.',
        'Если ребенок начинает гнаться только за призом, уменьшите его заметность и используйте разговорную вкладку как человеческий мостик после задания. В WonderTales это уже разделено: приз завершает короткую игру, а “Поговорим об этой истории?” возвращает внимание к сюжету, эмоциям и выбору героя.',
        'Если ребенок уже читает с удовольствием, викторина не обязана появляться каждый вечер. Иногда достаточно открыть “Поговорим об этой истории?” и обсудить сказку с родителем, иногда — пропустить задания и оставить историю чистым отдыхом. Главный маркер: после активности ребенок хочет вернуться к историям, а не сбежать от них.',
      ],
      es: [
        'Si el niño se tensa, discute por “incorrecto” o pide pista en cada paso, pasa de la autoevaluación a la pestaña “¿Hablamos de esta historia?” dentro de “Actividades después de la historia”. Allí la respuesta funciona como idea para hablar con un adulto, no como nota, así que podéis conversar: “¿qué harías tú en su lugar?”.',
        'Si empieza a perseguir solo el premio, reduce su presencia y usa la pestaña de conversación como puente humano después de la actividad. WonderTales ya separa las dos cosas: el premio cierra un juego breve, y “¿Hablamos de esta historia?” devuelve la atención a la trama, las emociones y la elección del héroe.',
        'Si ya lee con gusto, el quiz no tiene que aparecer cada noche. A veces basta abrir “¿Hablamos de esta historia?” y conversar con un padre; a veces conviene saltar las actividades y dejar la historia como descanso. La señal principal: después de la actividad quiere volver a las historias.',
      ],
      de: [
        'Wenn das Kind angespannt wird, über “falsch” streitet oder ständig Hinweise braucht, wechsle von der Selbstprüfung zum Tab “Sprechen wir über diese Geschichte?” in “Aufgaben nach der Geschichte”. Dort zählt die Antwort als Gedanke für das Gespräch mit einem Erwachsenen, nicht als Note, also bleibt die Frage offen: “Was würdest du an der Stelle der Figur tun?”',
        'Wenn das Kind nur noch der Belohnung nachjagt, mach sie weniger sichtbar und nutze den Gesprächs-Tab als menschliche Brücke nach der Aufgabe. WonderTales trennt das bereits: Der Preis beendet ein kurzes Spiel, “Sprechen wir über diese Geschichte?” bringt die Aufmerksamkeit zurück zu Handlung, Gefühlen und Entscheidung der Figur.',
        'Wenn das Kind schon gern liest, braucht es das Quiz nicht jeden Abend. Manchmal reicht “Sprechen wir über diese Geschichte?” für ein Gespräch mit den Eltern; manchmal lässt man die Aufgaben aus und die Geschichte bleibt reine Erholung. Entscheidend ist: Will das Kind danach zu Geschichten zurückkehren?',
      ],
      fr: [
        'Si l’enfant se crispe, discute du “faux” ou demande un indice à chaque étape, passez de l’autoévaluation à l’onglet “On parle de cette histoire ?” dans “Activités après l’histoire”. Là, la réponse devient une idée pour parler avec un adulte, pas une note; la question peut rester ouverte : “que ferais-tu à la place du héros ?”.',
        'Si l’enfant ne cherche plus que le prix, rendez-le moins visible et utilisez l’onglet de discussion comme pont humain après l’activité. WonderTales sépare déjà les deux : le prix clôt un jeu court, tandis que “On parle de cette histoire ?” ramène l’attention vers l’intrigue, les émotions et le choix du héros.',
        'Si l’enfant lit déjà avec plaisir, le quiz n’est pas obligatoire chaque soir. Parfois il suffit d’ouvrir “On parle de cette histoire ?” et d’échanger avec un parent; parfois mieux vaut sauter les activités et garder l’histoire comme repos. Le vrai signal : après l’activité, l’enfant veut revenir aux histoires.',
      ],
      pl: [
        'Jeśli dziecko się spina, kłóci o “źle” albo prosi o podpowiedź przy każdym kroku, przejdź od samosprawdzania do karty “Porozmawiamy o tej historii?” w “Zadaniach po historii”. Tam odpowiedź jest myślą do rozmowy z dorosłym, nie oceną, więc można spokojnie zapytać: “co zrobiłbyś na miejscu bohatera?”.',
        'Jeśli dziecko zaczyna gonić tylko za nagrodą, zmniejsz jej widoczność i użyj karty rozmowy jako ludzkiego mostu po zadaniu. WonderTales już to rozdziela: nagroda zamyka krótką grę, a “Porozmawiamy o tej historii?” wraca do fabuły, emocji i wyboru bohatera.',
        'Jeśli dziecko już czyta z radością, quiz nie musi być co wieczór. Czasem wystarczy otworzyć “Porozmawiamy o tej historii?” i porozmawiać z rodzicem; czasem lepiej pominąć zadania i zostawić historię jako odpoczynek. Najważniejszy sygnał: po aktywności dziecko chce wrócić do historii.',
      ],
    },
    checklist: {
      uk: ['Назвіть вікторину пригодою, а не тестом.', 'Залиште 2-4 короткі питання.', 'Давайте приз за завершення, не за ідеальність.', 'Показуйте помилку як підказку, а не провал.', 'Після призу відкрийте “Поговоримо про цю історію?”.'],
      en: ['Call the quiz a quest, not a test.', 'Keep only 2-4 short questions.', 'Reward completion, not perfection.', 'Turn mistakes into clues, not failure.', 'After the prize, open “Shall we talk about this story?”.'],
      ru: ['Назовите викторину приключением, а не тестом.', 'Оставьте только 2-4 коротких вопроса.', 'Давайте приз за завершение, а не за идеальность.', 'Показывайте ошибку как подсказку, а не провал.', 'После приза откройте “Поговорим об этой истории?”.'],
      es: ['Llama al cuestionario misión, no examen.', 'Deja solo 2-4 preguntas breves.', 'Premia completar, no la perfección.', 'Convierte errores en pistas, no fracasos.', 'Tras el premio, abre “¿Hablamos de esta historia?”.'],
      de: ['Nenne das Quiz Mission, nicht Test.', 'Nutze nur 2-4 kurze Fragen.', 'Belohne Abschluss, nicht Perfektion.', 'Mach Fehler zu Hinweisen, nicht Scheitern.', 'Öffne nach dem Preis “Sprechen wir über diese Geschichte?”.'],
      fr: ['Appelez le quiz mission, pas test.', 'Gardez seulement 2-4 questions courtes.', 'Récompensez la fin, pas la perfection.', 'Transformez l’erreur en indice, pas en échec.', 'Après le prix, ouvrez “On parle de cette histoire ?”.'],
      pl: ['Nazwij quiz misją, nie testem.', 'Zostaw tylko 2-4 krótkie pytania.', 'Nagradzaj ukończenie, nie perfekcję.', 'Zmieniaj błąd we wskazówkę, nie porażkę.', 'Po nagrodzie otwórz “Porozmawiamy o tej historii?”.'],
    },
    quote: {
      text: l10n(
        'Тестування — потужний спосіб покращувати навчання, а не лише оцінювати його.',
        'Testing is a powerful means of improving learning, not just assessing it.',
        'Тестирование — мощный способ улучшать обучение, а не только оценивать его.',
        'La prueba es una forma poderosa de mejorar el aprendizaje, no solo evaluarlo.',
        'Testen ist ein starkes Mittel, Lernen zu verbessern, nicht nur es zu bewerten.',
        'Tester est un moyen puissant d’améliorer l’apprentissage, pas seulement de l’évaluer.',
        'Testowanie to mocny sposób ulepszania uczenia się, nie tylko jego oceniania.'
      ),
      attribution: 'Roediger & Karpicke',
      sourceLabel: l10n('Навчання, посилене перевіркою', 'Test-Enhanced Learning', 'Обучение, усиленное проверкой', 'Aprendizaje reforzado por pruebas', 'Durch Prüfen gestärktes Lernen', 'Apprentissage renforcé par le test', 'Uczenie wzmacniane sprawdzaniem'),
      sourceUrl: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
    },
    sources: [
      { label: 'Roediger (Вашингтонский университет в Сент-Луисе) & Karpicke (Университет Пердью): обучение, усиленное проверкой', url: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x' },
      { label: 'Dunlosky (Кентский государственный университет) и коллеги: эффективные техники обучения', url: 'https://doi.org/10.1177/1529100612453266' },
      { label: 'Ryan & Deci (Рочестерский университет): внутренняя и внешняя мотивация', url: 'https://doi.org/10.1006/ceps.1999.1020' },
      { label: 'Deci & Ryan (Рочестерский университет), Koestner (Университет Макгилла): награды и внутренняя мотивация', url: 'https://selfdeterminationtheory.org/wp-content/uploads/2014/04/1999_DeciKoestnerRyan_Meta.pdf' },
      { label: 'Butler & Roediger (Вашингтонский университет в Сент-Луисе): обратная связь и вопросы с выбором ответа', url: 'https://doi.org/10.3758/MC.36.3.604' },
    ],
    visualDirection: 'A child and parent using a tablet story quiz as a cozy quest, with a small glowing reward badge and no school-test feeling.',
    relatedSlugs: ['reading-without-pressure', 'story-morals-without-lecturing'],
    inlineImages: articleInlineImages(
      'rewarded-story-quizzes',
      l10n(
        'Дитина тримає нагородний жетон і вибирає картку вікторини на планшеті',
        'A child holds a reward token and chooses a quiz card on a tablet',
        'Ребенок держит наградной жетон и выбирает карточку викторины на планшете',
        'Un niño sostiene una ficha de premio y elige una tarjeta del cuestionario en la tableta',
        'Ein Kind hält einen Belohnungsjeton und wählt eine Quizkarte auf dem Tablet',
        'Un enfant tient un jeton de récompense et choisit une carte de quiz sur la tablette',
        'Dziecko trzyma żeton nagrody i wybiera kartę quizu na tablecie'
      ),
      l10n(
        'Жетон показує завершення маленької місії, а не оцінку за правильність.',
        'The token marks the end of a small mission, not a grade for perfection.',
        'Жетон отмечает завершение маленькой миссии, а не оценку за идеальность.',
        'La ficha marca el final de una pequeña misión, no una nota por perfección.',
        'Der Jeton markiert das Ende einer kleinen Mission, nicht eine Note für Perfektion.',
        'Le jeton marque la fin d’une petite mission, pas une note de perfection.',
        'Żeton oznacza koniec małej misji, nie ocenę za perfekcję.'
      ),
      l10n(
        'Дитина в наметі з ковдр поєднує картинки з відповідями на планшеті',
        'A child in a blanket fort matches picture cards to answer blocks on a tablet',
        'Ребенок в домике из одеял соединяет картинки с ответами на планшете',
        'Un niño en una cabaña de mantas une imágenes con respuestas en la tableta',
        'Ein Kind in einer Deckenhöhle verbindet Bildkarten mit Antwortfeldern auf dem Tablet',
        'Un enfant dans une cabane de couvertures relie des images à des réponses sur tablette',
        'Dziecko w bazie z koców łączy obrazki z odpowiedziami na tablecie'
      ),
      l10n(
        'Завдання на відповідності допомагає пригадати деталі історії через гру зі стрілками.',
        'A matching task helps the child recall story details through a simple arrow game.',
        'Задание на соответствия помогает вспомнить детали истории через простую игру со стрелками.',
        'La actividad de emparejar ayuda a recordar detalles de la historia con flechas.',
        'Eine Zuordnungsaufgabe hilft, Details der Geschichte mit Pfeilen zu erinnern.',
        'L’activité d’association aide à retrouver les détails de l’histoire avec des flèches.',
        'Zadanie dopasowywania pomaga przypomnieć szczegóły historii za pomocą strzałek.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Самоперевірка', title: 'Питання повертає до сенсу', body: 'Коротка відповідь допомагає пригадати деталь, причину або емоцію, а не доводити дорослому “я читав”.' },
        { eyebrow: 'Мотивація', title: 'Приз завершує місію', body: 'Винагорода працює як знак завершення маленької пригоди, тому не забирає увагу від самої історії.' },
        { eyebrow: 'Розмова', title: 'Є окрема вкладка без оцінки', body: '“Поговоримо про цю історію?” переводить дитину від правильної відповіді до думки, яку можна обговорити з батьками.' },
      ],
      en: [
        { eyebrow: 'Self-check', title: 'The question returns to meaning', body: 'A short answer helps the child recall a detail, cause, or feeling instead of proving “I read it.”' },
        { eyebrow: 'Motivation', title: 'The prize closes the mission', body: 'The reward works as a small completion signal, so it does not pull attention away from the story itself.' },
        { eyebrow: 'Talk', title: 'A separate tab has no grade', body: '“Shall we talk about this story?” moves the child from a correct answer to a thought they can discuss with a parent.' },
      ],
      ru: [
        { eyebrow: 'Самопроверка', title: 'Вопрос возвращает к смыслу', body: 'Короткий ответ помогает вспомнить деталь, причину или эмоцию, а не доказывать взрослому “я читал”.' },
        { eyebrow: 'Мотивация', title: 'Приз завершает миссию', body: 'Награда работает как знак завершения маленького приключения, поэтому не перетягивает внимание с самой истории.' },
        { eyebrow: 'Разговор', title: 'Есть отдельная вкладка без оценки', body: '“Поговорим об этой истории?” переводит ребенка от правильного ответа к мысли, которую можно обсудить с родителем.' },
      ],
      es: [
        { eyebrow: 'Autoevaluación', title: 'La pregunta vuelve al sentido', body: 'Una respuesta breve ayuda a recordar un detalle, una causa o una emoción, no a demostrar “he leído”.' },
        { eyebrow: 'Motivación', title: 'El premio cierra la misión', body: 'La recompensa funciona como señal de cierre de una pequeña aventura, sin robar atención a la historia.' },
        { eyebrow: 'Conversación', title: 'Hay una pestaña sin nota', body: '“¿Hablamos de esta historia?” lleva al niño de la respuesta correcta a una idea para conversar con un padre.' },
      ],
      de: [
        { eyebrow: 'Selbstcheck', title: 'Die Frage führt zurück zum Sinn', body: 'Eine kurze Antwort hilft, Detail, Ursache oder Gefühl zu erinnern, nicht “ich habe gelesen” zu beweisen.' },
        { eyebrow: 'Motivation', title: 'Der Preis beendet die Mission', body: 'Die Belohnung markiert eine kleine abgeschlossene Abenteueraufgabe, ohne die Geschichte zu verdrängen.' },
        { eyebrow: 'Gespräch', title: 'Ein eigener Tab ohne Note', body: '“Sprechen wir über diese Geschichte?” führt vom richtigen Ergebnis zu einem Gedanken für das Gespräch mit Eltern.' },
      ],
      fr: [
        { eyebrow: 'Auto-vérification', title: 'La question revient au sens', body: 'Une réponse courte aide à retrouver un détail, une cause ou une émotion, pas à prouver “j’ai lu”.' },
        { eyebrow: 'Motivation', title: 'Le prix clôt la mission', body: 'La récompense marque la fin d’une petite aventure sans détourner l’attention de l’histoire.' },
        { eyebrow: 'Discussion', title: 'Un onglet séparé sans note', body: '“On parle de cette histoire ?” fait passer de la bonne réponse à une idée à discuter avec un parent.' },
      ],
      pl: [
        { eyebrow: 'Samosprawdzenie', title: 'Pytanie wraca do sensu', body: 'Krótka odpowiedź pomaga przypomnieć detal, przyczynę albo emocję, nie udowodnić dorosłemu “czytałem”.' },
        { eyebrow: 'Motywacja', title: 'Nagroda zamyka misję', body: 'Nagroda działa jak znak ukończenia małej przygody, więc nie zabiera uwagi samej historii.' },
        { eyebrow: 'Rozmowa', title: 'Jest osobna karta bez oceny', body: '“Porozmawiamy o tej historii?” prowadzi od dobrej odpowiedzi do myśli, którą można omówić z rodzicem.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Як зрозуміти, що робити після вікторини',
        intro: 'Одна й та сама функція може підтримати або перевантажити. Орієнтир — реакція дитини, а не кількість правильних відповідей.',
        columns: ['Що видно', 'Що це може означати', 'Що відкрити в WonderTales'],
        rows: [
          ['Просить підказку до кожного кроку', 'Самоперевірка стала схожою на оцінювання', 'Перейдіть до “Поговоримо про цю історію?”'],
          ['Радіє призу й пам’ятає сюжет', 'Коротка місія підтримує увагу', 'Залиште “Перевір себе та отримай приз” короткою'],
          ['Натискає навмання', 'Дитина втомилася або питання зарано', 'Використайте підказку в тексті й завершіть після одного завдання'],
          ['Сперечається через “неправильно”', 'Страх помилки сильніший за інтерес', 'Дозвольте повтор і переключіть на розмовну вкладку'],
        ],
      },
      en: {
        heading: 'How to choose the next step after a quiz',
        intro: 'The same feature can support or overload. The signal is the child’s reaction, not the number of correct answers.',
        columns: ['What you see', 'What it may mean', 'What to open in WonderTales'],
        rows: [
          ['Asks for a hint at every step', 'Self-checking feels like evaluation', 'Switch to “Shall we talk about this story?”'],
          ['Enjoys the prize and remembers the plot', 'The short mission supports attention', 'Keep “Check yourself and claim a prize” brief'],
          ['Taps random answers', 'The child is tired or the question is too soon', 'Use the text clue and stop after one activity'],
          ['Argues about being “wrong”', 'Fear of mistakes is louder than interest', 'Allow retry, then move to the talk tab'],
        ],
      },
      ru: {
        heading: 'Как понять, что делать после викторины',
        intro: 'Одна и та же функция может поддержать или перегрузить. Ориентир — реакция ребенка, а не число правильных ответов.',
        columns: ['Что видно', 'Что это может означать', 'Что открыть в WonderTales'],
        rows: [
          ['Просит подсказку на каждом шаге', 'Самопроверка стала похожа на оценивание', 'Перейти к “Поговорим об этой истории?”'],
          ['Радуется призу и помнит сюжет', 'Короткая миссия поддерживает внимание', 'Оставить “Проверь себя и получи приз” короткой'],
          ['Нажимает наугад', 'Ребенок устал или вопрос задан рано', 'Использовать подсказку в тексте и остановиться после одного задания'],
          ['Спорит из-за “неправильно”', 'Страх ошибки сильнее интереса', 'Разрешить повтор и переключить на разговорную вкладку'],
        ],
      },
      es: {
        heading: 'Cómo elegir el siguiente paso tras el cuestionario',
        intro: 'La misma función puede apoyar o saturar. La señal está en la reacción del niño, no en el número de aciertos.',
        columns: ['Lo que ves', 'Qué puede significar', 'Qué abrir en WonderTales'],
        rows: [
          ['Pide pista en cada paso', 'La autoevaluación parece evaluación', 'Pasar a “¿Hablamos de esta historia?”'],
          ['Disfruta el premio y recuerda la trama', 'La misión breve sostiene la atención', 'Mantener breve “Ponte a prueba y consigue un premio”'],
          ['Toca respuestas al azar', 'Está cansado o la pregunta llega pronto', 'Usar la pista del texto y parar tras una actividad'],
          ['Discute por “incorrecto”', 'El miedo al error pesa más que el interés', 'Permitir repetir y pasar a la pestaña de conversación'],
        ],
      },
      de: {
        heading: 'Was nach dem Quiz der nächste Schritt ist',
        intro: 'Dieselbe Funktion kann stützen oder überlasten. Entscheidend ist die Reaktion des Kindes, nicht die Zahl richtiger Antworten.',
        columns: ['Beobachtung', 'Mögliche Bedeutung', 'Was in WonderTales öffnen'],
        rows: [
          ['Braucht bei jedem Schritt einen Hinweis', 'Der Selbstcheck fühlt sich wie Bewertung an', 'Zu “Sprechen wir über diese Geschichte?” wechseln'],
          ['Freut sich über den Preis und kennt die Handlung', 'Die kurze Mission stützt Aufmerksamkeit', '“Prüf dich und hol dir deinen Preis” kurz halten'],
          ['Tippt wahllos Antworten an', 'Das Kind ist müde oder die Frage kommt zu früh', 'Texthinweis nutzen und nach einer Aufgabe stoppen'],
          ['Streitet über “falsch”', 'Fehlerangst ist stärker als Interesse', 'Wiederholen erlauben und in den Gesprächs-Tab wechseln'],
        ],
      },
      fr: {
        heading: 'Choisir la suite après le quiz',
        intro: 'La même fonction peut soutenir ou surcharger. Le repère est la réaction de l’enfant, pas le nombre de bonnes réponses.',
        columns: ['Ce qu’on voit', 'Ce que cela peut signifier', 'Quoi ouvrir dans WonderTales'],
        rows: [
          ['Demande un indice à chaque étape', 'L’auto-vérification ressemble à une évaluation', 'Passer à “On parle de cette histoire ?”'],
          ['Aime le prix et se souvient de l’intrigue', 'La petite mission soutient l’attention', 'Garder “Teste-toi et gagne un prix” court'],
          ['Répond au hasard', 'L’enfant est fatigué ou la question arrive trop tôt', 'Utiliser l’indice du texte et arrêter après une activité'],
          ['Discute du “faux”', 'La peur de l’erreur dépasse l’intérêt', 'Autoriser un nouvel essai puis passer à l’onglet discussion'],
        ],
      },
      pl: {
        heading: 'Jak wybrać następny krok po quizie',
        intro: 'Ta sama funkcja może wspierać albo przeciążyć. Sygnałem jest reakcja dziecka, nie liczba dobrych odpowiedzi.',
        columns: ['Co widać', 'Co to może znaczyć', 'Co otworzyć w WonderTales'],
        rows: [
          ['Prosi o podpowiedź przy każdym kroku', 'Samosprawdzanie przypomina ocenianie', 'Przejść do “Porozmawiamy o tej historii?”'],
          ['Cieszy się nagrodą i pamięta fabułę', 'Krótka misja wspiera uwagę', 'Zostawić krótkie “Sprawdź się i zdobądź nagrodę”'],
          ['Klika losowe odpowiedzi', 'Dziecko jest zmęczone albo pytanie jest za wcześnie', 'Użyć wskazówki w tekście i skończyć po jednym zadaniu'],
          ['Kłóci się o “źle”', 'Lęk przed błędem jest silniejszy niż ciekawość', 'Pozwolić powtórzyć i przejść do karty rozmowy'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Маршрут після історії',
        heading: 'Три хвилини без уроку',
        intro: 'Короткий порядок допомагає зберегти гру, зміст і контакт із батьками.',
        steps: [
          { title: 'Відкрити самоперевірку', body: 'Почніть із 2-4 коротких завдань, де відповідь прив’язана до події в історії.' },
          { title: 'Дати підказку з тексту', body: 'Помилка не стає провалом: дитина повертається до сцени й пробує ще раз.' },
          { title: 'Показати приз', body: 'Нагорода позначає завершення маленької місії, а не ідеальність.' },
          { title: 'Перейти до розмови', body: 'Вкладка “Поговоримо про цю історію?” допомагає обговорити вибір героя без оцінки.' },
        ],
      },
      en: {
        eyebrow: 'After-story route',
        heading: 'Three minutes without a lesson',
        intro: 'A short order keeps the experience playful, meaningful, and connected to the parent.',
        steps: [
          { title: 'Open the self-check', body: 'Start with 2-4 brief activities tied to something that happened in the story.' },
          { title: 'Use a text clue', body: 'A mistake is not a failure: the child returns to the scene and tries again.' },
          { title: 'Show the prize', body: 'The reward marks completion of a small mission, not perfection.' },
          { title: 'Move into talk', body: '“Shall we talk about this story?” helps discuss the hero’s choice without grading.' },
        ],
      },
      ru: {
        eyebrow: 'Маршрут после истории',
        heading: 'Три минуты без урока',
        intro: 'Короткий порядок помогает сохранить игру, смысл и контакт с родителем.',
        steps: [
          { title: 'Открыть самопроверку', body: 'Начните с 2-4 коротких заданий, где ответ связан с событием в истории.' },
          { title: 'Дать подсказку из текста', body: 'Ошибка не становится провалом: ребенок возвращается к сцене и пробует еще раз.' },
          { title: 'Показать приз', body: 'Награда отмечает завершение маленькой миссии, а не идеальность.' },
          { title: 'Перейти к разговору', body: '“Поговорим об этой истории?” помогает обсудить выбор героя без оценки.' },
        ],
      },
      es: {
        eyebrow: 'Ruta después de la historia',
        heading: 'Tres minutos sin lección',
        intro: 'Un orden breve conserva juego, sentido y contacto con el padre.',
        steps: [
          { title: 'Abrir la autoevaluación', body: 'Empieza con 2-4 actividades breves ligadas a algo que pasó en la historia.' },
          { title: 'Usar una pista del texto', body: 'El error no es fracaso: vuelve a la escena y prueba otra vez.' },
          { title: 'Mostrar el premio', body: 'La recompensa marca una pequeña misión completada, no la perfección.' },
          { title: 'Pasar a conversar', body: '“¿Hablamos de esta historia?” ayuda a hablar de la elección del héroe sin nota.' },
        ],
      },
      de: {
        eyebrow: 'Route nach der Geschichte',
        heading: 'Drei Minuten ohne Unterricht',
        intro: 'Eine kurze Reihenfolge hält Spiel, Sinn und Kontakt zu den Eltern zusammen.',
        steps: [
          { title: 'Selbstcheck öffnen', body: 'Starte mit 2-4 kurzen Aufgaben, die an ein Ereignis der Geschichte gebunden sind.' },
          { title: 'Texthinweis nutzen', body: 'Ein Fehler ist kein Scheitern: Das Kind kehrt zur Szene zurück und versucht es erneut.' },
          { title: 'Preis zeigen', body: 'Die Belohnung markiert eine beendete kleine Mission, nicht Perfektion.' },
          { title: 'Ins Gespräch wechseln', body: '“Sprechen wir über diese Geschichte?” hilft, die Entscheidung der Figur ohne Note zu besprechen.' },
        ],
      },
      fr: {
        eyebrow: 'Parcours après l’histoire',
        heading: 'Trois minutes sans leçon',
        intro: 'Un ordre court garde le jeu, le sens et le lien avec le parent.',
        steps: [
          { title: 'Ouvrir l’auto-vérification', body: 'Commencez par 2-4 activités brèves liées à un événement de l’histoire.' },
          { title: 'Utiliser l’indice du texte', body: 'L’erreur n’est pas un échec : l’enfant revient à la scène et réessaie.' },
          { title: 'Montrer le prix', body: 'La récompense marque une petite mission terminée, pas la perfection.' },
          { title: 'Passer à la discussion', body: '“On parle de cette histoire ?” aide à parler du choix du héros sans note.' },
        ],
      },
      pl: {
        eyebrow: 'Ścieżka po historii',
        heading: 'Trzy minuty bez lekcji',
        intro: 'Krótka kolejność utrzymuje zabawę, sens i kontakt z rodzicem.',
        steps: [
          { title: 'Otworzyć samosprawdzenie', body: 'Zacznij od 2-4 krótkich zadań związanych z wydarzeniem z historii.' },
          { title: 'Użyć wskazówki z tekstu', body: 'Błąd nie jest porażką: dziecko wraca do sceny i próbuje jeszcze raz.' },
          { title: 'Pokazać nagrodę', body: 'Nagroda oznacza ukończenie małej misji, nie perfekcję.' },
          { title: 'Przejść do rozmowy', body: '“Porozmawiamy o tej historii?” pomaga omówić wybór bohatera bez oceny.' },
        ],
      },
    },
  },
  {
    slug: 'comic-stories-reading-bridge',
    heroImage: '/landing/blog/comic-stories-reading-bridge-scene-01.webp',
    updatedAt: '2026-06-29',
    category: l10n(
      'Комікси й читання',
      'Comics and reading',
      'Комиксы и чтение',
      'Cómics y lectura',
      'Comics und Lesen',
      'BD et lecture',
      'Komiksy i czytanie'
    ),
    title: l10n(
      'Історії у форматі коміксу: місток до довшого читання',
      'Comic-style stories as a bridge to longer reading',
      'Истории в формате комиксов: мостик к чтению больших объемов',
      'Historias tipo cómic como puente hacia lecturas más largas',
      'Comic-Geschichten als Brücke zu längeren Texten',
      'Histoires en BD : un pont vers des lectures plus longues',
      'Historie komiksowe jako pomost do dłuższego czytania'
    ),
    description: l10n(
      'Чому панелі, короткі репліки й візуальна послідовність допомагають дитині перейти від “дивлюся картинки” до “читаю сцену сам”.',
      'Why panels, short speech, and visual sequencing help a child move from “looking at pictures” to “reading the scene myself.”',
      'Почему панели, короткие реплики и визуальная последовательность помогают перейти от “смотрю картинки” к “читаю сцену сам”.',
      'Por qué viñetas, frases breves y secuencia visual ayudan a pasar de mirar imágenes a leer escenas.',
      'Warum Panels, kurze Sprechblasen und visuelle Reihenfolge vom Bilderanschauen zum eigenen Lesen führen.',
      'Pourquoi cases, répliques courtes et séquence visuelle aident à passer des images à la lecture autonome.',
      'Dlaczego kadry, krótkie wypowiedzi i sekwencja obrazów pomagają przejść od oglądania do samodzielnego czytania.'
    ),
    lead: l10n(
      'Комікс не є “читанням простіше”. Для багатьох дітей це тренувальний формат: очі тримають сюжет, а короткий текст поступово бере на себе більше роботи.',
      'A comic is not “lesser reading.” For many children it is a training format: the eyes hold the plot while short text gradually carries more of the work.',
      'Комикс — не “чтение попроще”. Для многих детей это тренировочный формат: глаза удерживают сюжет, а короткий текст постепенно берет на себя больше работы.',
      'Un cómic no es “lectura menor”. Para muchos niños es entrenamiento: la imagen sostiene la trama y el texto breve toma más trabajo.',
      'Ein Comic ist kein minderwertiges Lesen. Für viele Kinder ist er Training: Bilder halten die Handlung, kurzer Text übernimmt nach und nach mehr Arbeit.',
      'La BD n’est pas une lecture inférieure. Pour beaucoup d’enfants, c’est un entraînement : l’image porte l’intrigue et le texte prend peu à peu plus de place.',
      'Komiks nie jest “gorszym czytaniem”. Dla wielu dzieci to trening: obraz trzyma fabułę, a krótki tekst stopniowo przejmuje więcej pracy.'
    ),
    focus: {
      uk: [
        'Коли дитині важко читати довгі абзаци, не треба одразу вимагати “справжню книгу”. Комікс розкладає історію на кроки: подивився на панель, прочитав коротку репліку, зрозумів зміну, перейшов далі. Це тренує послідовність без відчуття стіни тексту.',
        'Батьки часто хвилюються: “він тільки дивиться картинки, це рахується читанням?”. Рахується, якщо дитина читає репліки, відстежує порядок, пояснює, що сталося між кадрами, і помічає причину. У коміксі багато змісту живе не в підписі, а в переході від одного моменту до іншого.',
        'У WonderTales перехідний формат не перевантажує екран: дитина бачить чіткі панелі, велику дію, короткі репліки й зрозумілий напрямок читання. Так картинка не замінює читання, а тримає дитину біля тексту.',
      ],
      en: [
        'When long paragraphs are hard, do not rush to demand a “real book.” A comic breaks the story into steps: look at a panel, read a short line, understand the change, move on. It trains sequence without the feeling of a wall of text.',
        'Parents often worry: “my child is only looking at pictures; does this count as reading?” It counts when the child reads speech, follows order, explains what happened between panels, and notices cause. In comics, much of the meaning lives in the move from one moment to the next.',
        'In WonderTales, the bridge format avoids overloading the screen: the child sees clear panels, big action, short speech, and obvious reading direction. The image does not replace reading; it keeps the child close to the text.',
      ],
      ru: [
        'Когда длинные абзацы даются тяжело, не нужно сразу требовать “настоящую книгу”. Комикс раскладывает историю на шаги: посмотреть панель, прочитать короткую реплику, понять изменение, перейти дальше. Это тренирует последовательность без ощущения стены текста.',
        'Родители часто тревожатся: “он просто смотрит картинки, это вообще считается чтением?”. Считается, если ребенок читает реплики, удерживает порядок, объясняет, что произошло между кадрами, и замечает причину. В комиксе много смысла живет не в подписи, а в переходе от одного момента к другому.',
        'В WonderTales переходный формат не перегружает экран: ребенок видит понятные панели, крупное действие, короткие реплики и ясное направление чтения. Так картинка не заменяет чтение, а удерживает ребенка рядом с текстом.',
      ],
      es: [
        'Cuando los párrafos largos cuestan, no hace falta exigir enseguida un “libro de verdad”. El cómic divide la historia: mirar una viñeta, leer una frase corta, entender el cambio y seguir. Entrena secuencia sin la sensación de muro de texto.',
        'Muchas familias preguntan: “solo mira dibujos, ¿eso cuenta como lectura?”. Cuenta si lee diálogos, sigue el orden, explica qué pasó entre viñetas y nota la causa. En el cómic, mucho sentido vive en el paso de un momento al siguiente.',
        'En WonderTales, el puente no sobrecarga la pantalla: el niño ve viñetas claras, acción grande, frases breves y dirección evidente. La imagen no reemplaza la lectura; mantiene al niño cerca del texto.',
      ],
      de: [
        'Wenn lange Absätze schwerfallen, muss man nicht sofort ein “richtiges Buch” verlangen. Ein Comic teilt die Geschichte: Panel anschauen, kurze Zeile lesen, Veränderung verstehen, weitergehen. Das trainiert Reihenfolge ohne Textwand-Gefühl.',
        'Viele Eltern fragen: “Schaut mein Kind nur Bilder an, zählt das als Lesen?” Es zählt, wenn das Kind Sprechblasen liest, Reihenfolge hält, erklärt, was zwischen Panels passiert, und Ursachen bemerkt. Im Comic entsteht viel Bedeutung im Übergang von einem Moment zum nächsten.',
        'In WonderTales überlädt der Übergang den Bildschirm nicht: Das Kind sieht klare Panels, große Handlung, kurze Rede und deutliche Leserichtung. Das Bild ersetzt Lesen nicht, sondern hält das Kind am Text.',
      ],
      fr: [
        'Quand les longs paragraphes sont difficiles, inutile d’exiger tout de suite un “vrai livre”. La BD découpe l’histoire : regarder une case, lire une phrase courte, comprendre le changement, avancer. Elle entraîne la séquence sans mur de texte.',
        'Les parents demandent souvent : “il regarde seulement les images, est-ce vraiment lire ?”. Oui, si l’enfant lit les bulles, suit l’ordre, explique ce qui change entre les cases et repère la cause. Dans la BD, beaucoup de sens vit entre deux moments.',
        'Dans WonderTales, le format-pont ne surcharge pas l’écran : l’enfant voit des cases claires, une grande action, des répliques courtes et une direction lisible. L’image ne remplace pas la lecture; elle garde l’enfant près du texte.',
      ],
      pl: [
        'Gdy długie akapity są trudne, nie trzeba od razu wymagać “prawdziwej książki”. Komiks dzieli historię: spojrzeć na kadr, przeczytać krótką kwestię, zrozumieć zmianę i iść dalej. Ćwiczy kolejność bez ściany tekstu.',
        'Rodzice często pytają: “czy to czytanie, jeśli dziecko tylko ogląda obrazki?”. Tak, jeśli czyta wypowiedzi, trzyma kolejność, wyjaśnia, co stało się między kadrami, i zauważa przyczynę. W komiksie dużo sensu mieszka w przejściu między momentami.',
        'W WonderTales format przejściowy nie przeciąża ekranu: dziecko widzi czytelne kadry, dużą akcję, krótkie wypowiedzi i jasny kierunek. Obraz nie zastępuje czytania, lecz trzyma dziecko blisko tekstu.',
      ],
    },
    research: {
      uk: [
        'Richard E. Mayer з Каліфорнійського університету в Санта-Барбарі формулює мультимедійний принцип просто: люди краще навчаються зі слів і картинок разом, ніж лише зі слів. Для читання це не означає замінити текст картинками; це означає дати опору, поки дитина пов’язує дію, мову, емоцію і причинність.',
        'Joanne Ujiie та Stephen Krashen з Університету Південної Каліфорнії у дослідженні семикласників знайшли зв’язок між частішим читанням коміксів, більшим читанням для задоволення і більшою любов’ю до читання. Національна рада вчителів англійської мови також розглядає графічні романи як матеріал для розвитку грамотності: там є послідовність, уміння робити висновки, словник, діалог і візуальна грамотність.',
        'У батьківських обговореннях про графічні романи часто видно не відмову від читання, а страх за “застрягання” на легкому форматі. Практичний висновок: не соромити комікс, а зробити з нього сходинку. Сьогодні дитина читає бульбашку, завтра переказує проміжок між кадрами, а коли впевненість зростає — наступну історію можна створити вже у звичайному текстовому форматі.',
      ],
      en: [
        'Richard E. Mayer from the University of California, Santa Barbara states the multimedia principle plainly: people learn better from words and pictures together than from words alone. For reading, that does not mean replacing text with images; it means giving support while a child connects action, language, emotion, and cause.',
        'Joanne Ujiie and Stephen Krashen from the University of Southern California found that more comic reading was associated with more pleasure reading and greater reading enjoyment among seventh graders. NCTE, the National Council of Teachers of English, also treats graphic novels as literacy material: sequence, inference, vocabulary, dialogue, and visual literacy all live there.',
        'Parent discussions about graphic novels often reveal not hostility to reading, but fear that a child will get stuck in the easier format. The practical answer is not to shame comics; it is to make them a step. Today the child reads a bubble, tomorrow explains the gap between panels, and when confidence grows, the next story can be created in the regular text format.',
      ],
      ru: [
        'Richard E. Mayer из Калифорнийского университета в Санта-Барбаре формулирует мультимедийный принцип просто: люди лучше учатся со словами и картинками вместе, чем только со словами. Для чтения это не замена текста картинками, а опора, пока ребенок связывает действие, язык, эмоцию и причинность.',
        'Joanne Ujiie и Stephen Krashen из Университета Южной Калифорнии обнаружили у семиклассников связь между частым чтением комиксов, большим чтением для удовольствия и большей любовью к чтению. Национальный совет преподавателей английского языка также рассматривает графические романы как материал для грамотности: там есть последовательность, умение делать выводы, словарь, диалог и визуальная грамотность.',
        'В родительских обсуждениях о графических романах часто видна не враждебность к чтению, а страх, что ребенок “застрянет” на легком формате. Практический вывод: не стыдить комикс, а сделать из него ступеньку. Сегодня ребенок читает облачко, завтра объясняет промежуток между кадрами, а когда уверенность выросла — следующую историю можно создать уже в обычном текстовом формате.',
      ],
      es: [
        'Richard E. Mayer, de la Universidad de California en Santa Bárbara, resume el principio multimedia: aprendemos mejor con palabras e imágenes juntas que solo con palabras. Para leer, no significa sustituir texto por dibujos; significa apoyar la conexión entre acción, lenguaje, emoción y causa.',
        'Joanne Ujiie y Stephen Krashen, de la Universidad del Sur de California, hallaron que leer más cómics se asociaba con más lectura por placer y disfrute lector en séptimo grado. El Consejo Nacional de Profesores de Inglés también trata la novela gráfica como material de alfabetización: secuencia, inferencia, vocabulario, diálogo y lectura visual.',
        'En debates de padres sobre novelas gráficas se ve menos rechazo a leer y más miedo a que el niño se quede en lo fácil. La respuesta práctica no es avergonzar el cómic, sino usarlo como escalón. Hoy lee un globo, mañana explica el hueco entre viñetas y, cuando gana confianza, la siguiente historia puede crearse en formato de texto normal.',
      ],
      de: [
        'Richard E. Mayer von der Universität von Kalifornien in Santa Barbara fasst das Multimedia-Prinzip klar zusammen: Menschen lernen besser mit Wörtern und Bildern zusammen als nur mit Wörtern. Beim Lesen ersetzt das Text nicht durch Bilder, sondern stützt die Verbindung von Handlung, Sprache, Gefühl und Ursache.',
        'Joanne Ujiie und Stephen Krashen von der Universität von Südkalifornien fanden bei Siebtklässlern Zusammenhänge zwischen Comic-Lesen, mehr Lesen aus Freude und größerer Lesefreude. Der Nationale Rat der Englischlehrkräfte behandelt grafische Romane ebenfalls als Material für Lesekompetenz: Reihenfolge, Schlussfolgern, Wortschatz, Dialog und visuelle Kompetenz stecken darin.',
        'In Elterndebatten über grafische Romane sieht man oft keine Ablehnung des Lesens, sondern Angst, dass das Kind im leichten Format stecken bleibt. Die praktische Antwort: Comics nicht beschämen, sondern als Stufe nutzen. Heute liest das Kind eine Sprechblase, morgen erklärt es die Lücke, und wenn Sicherheit wächst, kann die nächste Geschichte im normalen Textformat entstehen.',
      ],
      fr: [
        'Richard E. Mayer, de l’Université de Californie à Santa Barbara, formule le principe multimédia simplement : on apprend mieux avec mots et images ensemble qu’avec mots seuls. Pour lire, cela ne remplace pas le texte par l’image; cela soutient le lien entre action, langage, émotion et cause.',
        'Joanne Ujiie et Stephen Krashen, de l’Université de Californie du Sud, ont trouvé chez des élèves de septième année une association entre lecture de comics, lecture plaisir et plaisir de lire. Le Conseil national des enseignants d’anglais considère aussi les romans graphiques comme supports de littératie : séquence, inférence, vocabulaire, dialogue et lecture visuelle.',
        'Dans les discussions de parents sur les romans graphiques, on voit souvent moins un rejet de la lecture qu’une peur de rester coincé dans un format facile. La réponse pratique : ne pas dévaloriser la BD, mais l’utiliser comme marche. Aujourd’hui une bulle, demain l’espace entre deux cases, puis, quand la confiance grandit, l’histoire suivante peut être créée en texte classique.',
      ],
      pl: [
        'Richard E. Mayer z Uniwersytetu Kalifornijskiego w Santa Barbara ujmuje zasadę multimedialną prosto: uczymy się lepiej ze słów i obrazów razem niż z samych słów. W czytaniu nie chodzi o zastąpienie tekstu obrazkami, lecz o wsparcie połączeń między działaniem, językiem, emocją i przyczyną.',
        'Joanne Ujiie i Stephen Krashen z Uniwersytetu Południowej Kalifornii u siódmoklasistów znaleźli związek między czytaniem komiksów, czytaniem dla przyjemności i radością czytania. Krajowa Rada Nauczycieli Języka Angielskiego także traktuje powieści graficzne jako materiał do rozwijania piśmienności: kolejność, wnioskowanie, słownictwo, dialog i czytanie obrazu.',
        'W rozmowach rodziców o powieściach graficznych często widać nie niechęć do czytania, lecz strach, że dziecko utknie w łatwiejszym formacie. Praktyczny wniosek: nie zawstydzać komiksu, tylko zrobić z niego stopień. Dziś dymek, jutro przerwa między kadrami, a gdy rośnie pewność, następną historię można stworzyć już w zwykłym formacie tekstowym.',
      ],
    },
    storyUse: {
      uk: [
        'У WonderTales формат коміксу вже веде дитину не від тексту, а до тексту: на планшеті сцена розкладена на зрозумілі панелі, короткі репліки й один помітний крок дії. Персоналізований герой допомагає втримати інтерес, а структура веде до читання.',
        'Попросіть дитину пройти три кроки. Перший: прочитати репліки в бульбашках. Другий: сказати, що не намальовано між двома кадрами. Третій: коротко переказати сцену своїми словами: що герой помітив, чого злякався, чому змінив рішення.',
        'Коли це стає легким, наступний крок — окрема нова історія у звичайному текстовому форматі. У WonderTales можна залишити дитині знайомого героя, тему або настрій. Комікс підготував порядок подій, а нова текстова історія поступово бере на себе більше читання.',
      ],
      en: [
        'In WonderTales, comic format already leads a child toward text, not away from it: the tablet scene is broken into clear panels, short speech, and one visible action step. A personalized hero holds interest, and the structure points toward reading.',
        'Invite the child through three steps. First: read the speech bubbles. Second: say what is not drawn between two panels. Third: briefly retell the scene in their own words: what the hero noticed, feared, and why they changed their mind.',
        'When that feels easy, the next step is a separate new story in the regular text format. In WonderTales, you can keep a familiar hero, theme, or mood. The comic has prepared event order; the new text story gradually carries more of the reading.',
      ],
      ru: [
        'В WonderTales формат комикса уже ведет ребенка не от текста, а к тексту: сцена на планшете разложена на понятные панели, короткие реплики и один заметный шаг действия. Персонализированный герой удерживает интерес, а структура ведет к чтению.',
        'Попросите ребенка пройти три шага. Первый: прочитать реплики в облачках. Второй: сказать, что не нарисовано между двумя кадрами. Третий: коротко пересказать сцену своими словами: что герой заметил, чего испугался, почему изменил решение.',
        'Когда это становится легким, следующий шаг — отдельная новая история в обычном текстовом формате. В WonderTales можно оставить знакомого героя, тему или настроение. Комикс подготовил порядок событий, а новая текстовая история постепенно берет на себя больше чтения.',
      ],
      es: [
        'En WonderTales, el formato cómic ya acerca al texto, no aleja: la escena en la tableta se divide en viñetas claras, frases breves y un paso de acción visible. El héroe personalizado sostiene interés, y la estructura guía hacia leer.',
        'Invita al niño a tres pasos. Primero: leer los globos. Segundo: decir qué no está dibujado entre dos viñetas. Tercero: contar la escena con sus propias palabras: qué notó el héroe, qué le dio miedo y por qué cambió.',
        'Cuando sea fácil, el siguiente paso es otra historia nueva en formato de texto normal. En WonderTales, se puede mantener un héroe, tema o ambiente familiar. El cómic preparó el orden; la nueva historia de texto asume más lectura.',
      ],
      de: [
        'In WonderTales führt das Comic-Format bereits zum Text hin: Die Tablet-Szene ist in klare Panels, kurze Rede und einen sichtbaren Handlungsschritt gegliedert. Die personalisierte Figur hält Interesse, und die Struktur führt zum Lesen.',
        'Führe das Kind durch drei Schritte. Erstens: Sprechblasen lesen. Zweitens: sagen, was zwischen zwei Panels nicht gezeichnet ist. Drittens: die Szene kurz mit eigenen Worten erzählen: was die Figur bemerkte, wovor sie Angst hatte und warum sie sich entschied.',
        'Wenn das leicht wird, ist der nächste Schritt eine getrennte neue Geschichte im normalen Textformat. In WonderTales kann sie mit vertrauter Figur, Thema oder Stimmung erstellt werden. Der Comic hat die Reihenfolge vorbereitet; die neue Textgeschichte übernimmt mehr Lesearbeit.',
      ],
      fr: [
        'Dans WonderTales, le format BD mène déjà vers le texte : la scène sur tablette est découpée en cases claires, répliques courtes et une action visible. Le héros personnalisé garde l’intérêt, et la structure mène à lire.',
        'Proposez trois étapes. D’abord : lire les bulles. Ensuite : dire ce qui n’est pas dessiné entre deux cases. Enfin : raconter brièvement la scène avec ses mots : ce que le héros remarque, ce qui lui fait peur et pourquoi il change.',
        'Quand cela devient facile, l’étape suivante est une nouvelle histoire séparée en format texte classique. Dans WonderTales, elle peut garder un héros, un thème ou une ambiance familière. La BD prépare l’ordre; la nouvelle histoire en texte porte davantage la lecture.',
      ],
      pl: [
        'W WonderTales format komiksowy już prowadzi do tekstu, nie od niego: scena na tablecie jest podzielona na czytelne kadry, krótkie wypowiedzi i jeden widoczny krok akcji. Spersonalizowany bohater trzyma uwagę, a struktura prowadzi ku czytaniu.',
        'Poprowadź dziecko przez trzy kroki. Pierwszy: przeczytać dymki. Drugi: powiedzieć, czego nie narysowano między kadrami. Trzeci: krótko opowiedzieć scenę własnymi słowami: co bohater zauważył, czego się bał i dlaczego zmienił decyzję.',
        'Gdy to staje się łatwe, następnym krokiem jest osobna nowa historia w zwykłym formacie tekstowym. W WonderTales można zostawić znajomego bohatera, temat albo nastrój. Komiks przygotował kolejność zdarzeń; nowa historia tekstowa przejmuje więcej czytania.',
      ],
    },
    adjustment: {
      uk: [
        'Якщо дитина тільки перегортає картинки, додайте одну м’яку зупинку: “що змінилося між цими двома кадрами?”. Не зупиняйте після кожної панелі; достатньо одного-двох місць, де дитина вчиться бачити причинний зв’язок.',
        'Якщо репліки дрібні, кадрів забагато або дитина губить напрямок, спростіть сцену. Одна велика панель на екрані іноді краща за сторінку з багатьма маленькими кадрами. Для перехідного читання ясність важливіша за декоративність.',
        'Якщо дитина “застрягла” тільки на коміксах, не забирайте їх різко. Зробіть ритм між окремими історіями: сьогодні комікс, наступного разу звичайна текстова історія з дуже знайомим героєм або темою. Мета — нарощувати читацьку витривалість без сорому.',
      ],
      en: [
        'If the child only flips through pictures, add one gentle stop: “what changed between these two panels?” Do not interrupt every panel; one or two places are enough for practicing cause and effect.',
        'If speech is tiny, there are too many frames, or the child loses direction, simplify the scene. One large panel on a screen can be better than a page of many small frames. For bridge reading, clarity matters more than decoration.',
        'If the child is “stuck” only on comics, do not remove them abruptly. Use a rhythm across separate stories: comic today, then a regular text story next time with a very familiar hero or theme. The aim is reading stamina without shame.',
      ],
      ru: [
        'Если ребенок только пролистывает картинки, добавьте одну мягкую остановку: “что изменилось между этими двумя кадрами?”. Не останавливайте после каждой панели; достаточно одного-двух мест, где ребенок учится видеть причинную связь.',
        'Если реплики мелкие, кадров слишком много или ребенок теряет направление, упростите сцену. Одна крупная панель на экране иногда лучше страницы с множеством маленьких кадров. Для переходного чтения ясность важнее декоративности.',
        'Если ребенок “застрял” только на комиксах, не забирайте их резко. Сделайте ритм между отдельными историями: сегодня комикс, в следующий раз обычная текстовая история с очень знакомым героем или темой. Цель — наращивать читательскую выносливость без стыда.',
      ],
      es: [
        'Si solo pasa imágenes, añade una pausa suave: “¿qué cambió entre estas dos viñetas?”. No interrumpas cada viñeta; uno o dos momentos bastan para practicar causa y efecto.',
        'Si el texto es pequeño, hay demasiadas viñetas o pierde dirección, simplifica. Una viñeta grande en pantalla puede ser mejor que una página con muchos cuadros. Para lectura puente, la claridad importa más que la decoración.',
        'Si se queda solo en cómics, no los quites de golpe. Usa ritmo entre historias separadas: hoy cómic; la próxima vez, una historia de texto normal con un héroe o tema muy familiar. La meta es resistencia lectora sin vergüenza.',
      ],
      de: [
        'Wenn das Kind nur Bilder durchblättert, halte sanft an: “Was hat sich zwischen diesen zwei Panels verändert?” Nicht jedes Panel unterbrechen; ein oder zwei Stellen reichen, um Ursache und Wirkung zu üben.',
        'Sind Sprechblasen klein, Panels zu viele oder die Richtung unklar, vereinfache. Ein großes Panel auf dem Bildschirm ist manchmal besser als viele kleine. Beim Übergangslesen zählt Klarheit mehr als Dekoration.',
        'Wenn das Kind nur bei Comics bleibt, nimm sie nicht abrupt weg. Nutze Rhythmus zwischen getrennten Geschichten: heute Comic, beim nächsten Mal eine normale Textgeschichte mit sehr vertrauter Figur oder Thema. Ziel ist Leseausdauer ohne Scham.',
      ],
      fr: [
        'Si l’enfant ne fait que tourner les images, ajoutez une pause douce : “qu’est-ce qui a changé entre ces deux cases ?”. N’interrompez pas chaque case; un ou deux endroits suffisent pour travailler cause et effet.',
        'Si le texte est trop petit, les cases trop nombreuses ou la direction confuse, simplifiez. Une grande case à l’écran peut valoir mieux qu’une page de petits cadres. Pour une lecture-pont, la clarté compte plus que l’ornement.',
        'Si l’enfant reste seulement sur la BD, ne la retirez pas brusquement. Créez un rythme entre histoires séparées : aujourd’hui BD, puis une histoire en texte classique avec un héros ou thème très familier. Le but : l’endurance de lecture sans honte.',
      ],
      pl: [
        'Jeśli dziecko tylko przegląda obrazki, zatrzymaj łagodnie: “co zmieniło się między tymi kadrami?”. Nie zatrzymuj po każdym kadrze; wystarczy jedno lub dwa miejsca do ćwiczenia przyczyny i skutku.',
        'Gdy dymki są małe, kadrów za dużo albo kierunek się gubi, uprość scenę. Jeden duży kadr na ekranie bywa lepszy niż strona z wieloma małymi. W czytaniu przejściowym jasność jest ważniejsza niż dekoracja.',
        'Jeśli dziecko “utknęło” tylko przy komiksach, nie zabieraj ich nagle. Zrób rytm między osobnymi historiami: dziś komiks, następnym razem zwykła historia tekstowa z bardzo znajomym bohaterem albo tematem. Cel to wytrzymałość czytelnicza bez wstydu.',
      ],
    },
    checklist: {
      uk: ['Почніть з 4-6 панелей, не з повної сторінки тексту.', 'Перевірте, що репліки великі й короткі.', 'Попросіть пояснити зміну між двома кадрами.', 'Попросіть переказати сцену своїми словами.', 'Коли дитина готова, створіть наступну історію у звичайному текстовому форматі.'],
      en: ['Start with 4-6 panels, not a full page of prose.', 'Make sure speech is large and short.', 'Ask what changed between two panels.', 'Ask the child to retell the scene in their own words.', 'When the child is ready, create the next story in the regular text format.'],
      ru: ['Начните с 4-6 панелей, не с полной страницы текста.', 'Проверьте, что реплики крупные и короткие.', 'Попросите объяснить, что изменилось между двумя кадрами.', 'Попросите пересказать сцену своими словами.', 'Когда ребенок готов, создайте следующую историю в обычном текстовом формате.'],
      es: ['Empieza con 4-6 viñetas, no una página completa.', 'Asegura globos grandes y breves.', 'Pregunta qué cambió entre dos viñetas.', 'Pide que cuente la escena con sus propias palabras.', 'Cuando esté listo, crea la siguiente historia en formato de texto normal.'],
      de: ['Mit 4-6 Panels starten, nicht mit voller Textseite.', 'Sprechblasen groß und kurz halten.', 'Fragen, was sich zwischen zwei Panels änderte.', 'Das Kind die Szene mit eigenen Worten erzählen lassen.', 'Wenn das Kind bereit ist, die nächste Geschichte im normalen Textformat erstellen.'],
      fr: ['Commencer par 4-6 cases, pas une page pleine.', 'Gardez des bulles grandes et courtes.', 'Demander ce qui change entre deux cases.', 'Demander à l’enfant de raconter la scène avec ses mots.', 'Quand l’enfant est prêt, créer l’histoire suivante en format texte classique.'],
      pl: ['Zacznij od 4-6 kadrów, nie pełnej strony.', 'Dymki mają być duże i krótkie.', 'Zapytaj, co zmieniło się między kadrami.', 'Poproś dziecko, aby opowiedziało scenę własnymi słowami.', 'Gdy dziecko jest gotowe, stwórz następną historię w zwykłym formacie tekstowym.'],
    },
    quote: {
      text: l10n(
        'Люди краще навчаються зі слів і картинок, ніж лише зі слів.',
        'People learn better from words and pictures than from words alone.',
        'Люди лучше учатся со словами и картинками, чем только со словами.',
        'Las personas aprenden mejor con palabras e imágenes que solo con palabras.',
        'Menschen lernen besser mit Wörtern und Bildern als nur mit Wörtern.',
        'Les personnes apprennent mieux avec mots et images qu’avec mots seuls.',
        'Ludzie uczą się lepiej ze słów i obrazów niż z samych słów.'
      ),
      attribution: 'Richard E. Mayer',
      sourceLabel: l10n('Мультимедійне навчання', 'Multimedia Learning', 'Мультимедийное обучение', 'Aprendizaje multimedia', 'Multimediales Lernen', 'Apprentissage multimédia', 'Uczenie multimedialne'),
      sourceUrl: 'https://www.cambridge.org/core/books/multimedia-learning/multimedia-principle/1CC3DE892B0431BA48B4C4DCA10D0B8F',
    },
    sources: [
      { label: 'Mayer (Калифорнийский университет в Санта-Барбаре): мультимедийный принцип', url: 'https://www.cambridge.org/core/books/multimedia-learning/multimedia-principle/1CC3DE892B0431BA48B4C4DCA10D0B8F' },
      { label: 'Ujiie & Krashen (Университет Южной Калифорнии): комиксы и удовольствие от чтения', url: 'https://eric.ed.gov/?id=EJ527305' },
      { label: 'Национальный совет преподавателей английского языка: архив о графических романах', url: 'https://ncte.org/blog/tag/graphic-novels/' },
      { label: 'Национальный совет преподавателей английского языка: связи грамотности и графических романов', url: 'https://cdn.ncte.org/nctefiles/resources/books/sample/03920chap01_x.pdf' },
      { label: 'Reading Rockets (проект WETA о грамотности): графические романы для младших детей', url: 'https://www.readingrockets.org/topics/childrens-books/articles/graphic-novels-young-kids' },
      { label: 'Scholastic (издательство и образовательная компания): графические романы и навыки чтения', url: 'https://www.scholastic.com/parents/books-and-reading/raise-a-reader-blog/raising-super-readers-benefits-comic-books-and-graphic-novels.html' },
    ],
    visualDirection: 'A child reading a WonderTales comic story on a tablet, with clear panels, short speech bubbles, and a parent nearby.',
    relatedSlugs: ['reading-without-pressure', 'age-appropriate-story-complexity'],
    inlineImages: articleInlineImages(
      'comic-stories-reading-bridge',
      l10n(
        'Дорослий стилусом показує три комікс-панелі, а дитина пальцем відстежує зміну',
        'An adult points with a stylus at three comic panels while a child follows the change',
        'Взрослый стилусом показывает три комикс-панели, а ребенок пальцем отслеживает изменение',
        'Un adulto señala con un lápiz tres viñetas mientras el niño sigue el cambio con el dedo',
        'Ein Erwachsener zeigt mit dem Stift auf drei Comic-Panels, während das Kind die Veränderung verfolgt',
        'Un adulte montre trois cases avec un stylet pendant que l’enfant suit le changement du doigt',
        'Dorosły wskazuje rysikiem trzy kadry, a dziecko palcem śledzi zmianę'
      ),
      l10n(
        'Одна зупинка між кадрами вчить бачити причину й наслідок без великого абзацу.',
        'One pause between panels teaches cause and effect without a long paragraph.',
        'Одна остановка между кадрами учит видеть причину и следствие без большого абзаца.',
        'Una pausa entre viñetas enseña causa y efecto sin un párrafo largo.',
        'Eine Pause zwischen Panels zeigt Ursache und Wirkung ohne langen Absatz.',
        'Une pause entre deux cases apprend cause et effet sans long paragraphe.',
        'Jedna pauza między kadrami uczy przyczyny i skutku bez długiego akapitu.'
      ),
      l10n(
        'Дитина відкриває звичайну текстову історію на планшеті після досвіду з коміксами',
        'A child opens a regular text story on a tablet after practicing with comics',
        'Ребенок открывает обычную текстовую историю на планшете после опыта с комиксами',
        'Un niño abre una historia de texto normal en la tableta después de practicar con cómics',
        'Ein Kind öffnet nach Comic-Erfahrung eine normale Textgeschichte auf dem Tablet',
        'Un enfant ouvre une histoire en texte classique sur tablette après l’expérience de la BD',
        'Dziecko otwiera zwykłą historię tekstową na tablecie po doświadczeniu z komiksami'
      ),
      l10n(
        'Наступний крок показаний як окрема нова історія у звичайному текстовому форматі.',
        'The next step is shown as a separate new story in the regular text format.',
        'Следующий шаг показан как отдельная новая история в обычном текстовом формате.',
        'El siguiente paso aparece como otra historia nueva en formato de texto normal.',
        'Der nächste Schritt ist als getrennte neue Geschichte im normalen Textformat gezeigt.',
        'L’étape suivante est montrée comme une nouvelle histoire séparée en format texte classique.',
        'Następny krok pokazano jako osobną nową historię w zwykłym formacie tekstowym.'
      )
    ),
    insightCards: {
      uk: [
        { eyebrow: 'Послідовність', title: 'Кадри тримають порядок', body: 'Дитина бачить, що сталося спочатку, що змінилося потім і куди рухається дія.' },
        { eyebrow: 'Висновок', title: 'Сенс живе між кадрами', body: 'Питання “що змінилося?” тренує причинність і здогадку без великого абзацу.' },
        { eyebrow: 'Перехід', title: 'Наступна історія може бути текстовою', body: 'Коли репліки вже даються легко, у WonderTales можна створити нову історію у звичайному текстовому форматі.' },
      ],
      en: [
        { eyebrow: 'Sequence', title: 'Panels hold the order', body: 'The child sees what happened first, what changed next, and where the action is going.' },
        { eyebrow: 'Inference', title: 'Meaning lives between panels', body: 'The question “what changed?” practices cause and inference without a long paragraph.' },
        { eyebrow: 'Bridge', title: 'The next story can be text', body: 'When speech bubbles feel easy, WonderTales can create a new story in the regular text format.' },
      ],
      ru: [
        { eyebrow: 'Последовательность', title: 'Кадры держат порядок', body: 'Ребенок видит, что было сначала, что изменилось потом и куда движется действие.' },
        { eyebrow: 'Вывод', title: 'Смысл живет между кадрами', body: 'Вопрос “что изменилось?” тренирует причинность и догадку без большого абзаца.' },
        { eyebrow: 'Переход', title: 'Следующая история может быть текстовой', body: 'Когда реплики уже даются легко, в WonderTales можно создать новую историю в обычном текстовом формате.' },
      ],
      es: [
        { eyebrow: 'Secuencia', title: 'Las viñetas sostienen el orden', body: 'El niño ve qué pasó primero, qué cambió después y hacia dónde va la acción.' },
        { eyebrow: 'Inferencia', title: 'El sentido vive entre viñetas', body: 'La pregunta “¿qué cambió?” entrena causa e inferencia sin un párrafo largo.' },
        { eyebrow: 'Puente', title: 'La siguiente historia puede ser texto', body: 'Cuando los globos ya son fáciles, WonderTales puede crear una historia nueva en formato de texto normal.' },
      ],
      de: [
        { eyebrow: 'Reihenfolge', title: 'Panels halten die Ordnung', body: 'Das Kind sieht, was zuerst geschah, was sich danach änderte und wohin die Handlung führt.' },
        { eyebrow: 'Schlussfolgern', title: 'Sinn entsteht zwischen Panels', body: 'Die Frage “Was hat sich verändert?” übt Ursache und Vermutung ohne langen Absatz.' },
        { eyebrow: 'Übergang', title: 'Die nächste Geschichte kann Text sein', body: 'Wenn Sprechblasen leicht fallen, kann WonderTales eine neue Geschichte im normalen Textformat erstellen.' },
      ],
      fr: [
        { eyebrow: 'Séquence', title: 'Les cases tiennent l’ordre', body: 'L’enfant voit ce qui arrive d’abord, ce qui change ensuite et où va l’action.' },
        { eyebrow: 'Inférence', title: 'Le sens vit entre les cases', body: 'La question “qu’est-ce qui a changé ?” entraîne cause et déduction sans long paragraphe.' },
        { eyebrow: 'Pont', title: 'L’histoire suivante peut être en texte', body: 'Quand les bulles deviennent faciles, WonderTales peut créer une nouvelle histoire en format texte classique.' },
      ],
      pl: [
        { eyebrow: 'Kolejność', title: 'Kadry trzymają porządek', body: 'Dziecko widzi, co było najpierw, co zmieniło się potem i dokąd idzie akcja.' },
        { eyebrow: 'Wniosek', title: 'Sens mieszka między kadrami', body: 'Pytanie “co się zmieniło?” ćwiczy przyczynę i domysł bez długiego akapitu.' },
        { eyebrow: 'Pomost', title: 'Następna historia może być tekstowa', body: 'Gdy dymki są już łatwe, WonderTales może stworzyć nową historię w zwykłym formacie tekstowym.' },
      ],
    },
    decisionTable: {
      uk: {
        heading: 'Як вести дитину від коміксу до довшого тексту',
        intro: 'Комікс стає сходинкою, коли дорослий використовує його для послідовності й розуміння, а текстову історію вводить окремим наступним кроком.',
        columns: ['Що видно', 'Що тренувати', 'М’який крок'],
        rows: [
          ['Перегортає тільки картинки', 'Причину між кадрами', 'Запитайте: “що змінилося між цими двома панелями?”'],
          ['Читає лише репліки', 'Розуміння діалогу', 'Запитайте: “хто це сказав і чому?”'],
          ['Губить напрямок читання', 'Послідовність і увагу до екрана', 'Залиште одну велику панель і коротку репліку'],
          ['Просить той самий формат', 'Готовність до текстової історії', 'Наступного разу створіть звичайну текстову історію зі знайомим героєм'],
        ],
      },
      en: {
        heading: 'How to lead from comics to longer text',
        intro: 'Comics become a step when the adult uses them for sequence and comprehension, then introduces a text story as a separate next move.',
        columns: ['What you see', 'What to practice', 'Gentle step'],
        rows: [
          ['Only flips through pictures', 'Cause between panels', 'Ask: “what changed between these two panels?”'],
          ['Reads only speech bubbles', 'Dialogue comprehension', 'Ask: “who said this and why?”'],
          ['Loses reading direction', 'Sequence and screen attention', 'Use one large panel and a short line'],
          ['Asks for the same format', 'Readiness for a text story', 'Next time, create a regular text story with a familiar hero'],
        ],
      },
      ru: {
        heading: 'Как вести ребенка от комикса к более длинному тексту',
        intro: 'Комикс становится ступенькой, когда взрослый использует его для последовательности и понимания, а текстовую историю вводит отдельным следующим шагом.',
        columns: ['Что видно', 'Что тренировать', 'Мягкий шаг'],
        rows: [
          ['Пролистывает только картинки', 'Причину между кадрами', 'Спросить: “что изменилось между этими двумя панелями?”'],
          ['Читает только реплики', 'Понимание диалога', 'Спросить: “кто это сказал и почему?”'],
          ['Теряет направление чтения', 'Последовательность и внимание к экрану', 'Оставить одну крупную панель и короткую реплику'],
          ['Просит тот же формат', 'Готовность к текстовой истории', 'В следующий раз создать обычную текстовую историю со знакомым героем'],
        ],
      },
      es: {
        heading: 'Cómo pasar del cómic a textos más largos',
        intro: 'El cómic es escalón cuando el adulto lo usa para secuencia y comprensión, y presenta una historia de texto como paso siguiente separado.',
        columns: ['Lo que ves', 'Qué practicar', 'Paso suave'],
        rows: [
          ['Solo pasa imágenes', 'La causa entre viñetas', 'Preguntar: “¿qué cambió entre estas dos viñetas?”'],
          ['Lee solo globos', 'Comprensión del diálogo', 'Preguntar: “¿quién lo dijo y por qué?”'],
          ['Pierde la dirección', 'Secuencia y atención a la pantalla', 'Usar una viñeta grande y una frase corta'],
          ['Pide el mismo formato', 'Preparación para una historia de texto', 'La próxima vez, crear una historia de texto con un héroe familiar'],
        ],
      },
      de: {
        heading: 'Vom Comic zu längerem Text führen',
        intro: 'Der Comic wird zur Stufe, wenn Erwachsene ihn für Reihenfolge und Verständnis nutzen und die Textgeschichte als getrennten nächsten Schritt einführen.',
        columns: ['Beobachtung', 'Was üben', 'Sanfter Schritt'],
        rows: [
          ['Blättert nur Bilder durch', 'Ursache zwischen Panels', 'Fragen: “Was hat sich zwischen diesen zwei Panels verändert?”'],
          ['Liest nur Sprechblasen', 'Dialog verstehen', 'Fragen: “Wer sagt das und warum?”'],
          ['Verliert die Richtung', 'Reihenfolge und Aufmerksamkeit am Bildschirm', 'Ein großes Panel und eine kurze Zeile nutzen'],
          ['Will dasselbe Format', 'Bereitschaft für Textgeschichte', 'Beim nächsten Mal eine normale Textgeschichte mit vertrauter Figur erstellen'],
        ],
      },
      fr: {
        heading: 'Passer de la BD au texte plus long',
        intro: 'La BD devient une marche quand l’adulte l’utilise pour la séquence et la compréhension, puis introduit une histoire en texte comme étape suivante séparée.',
        columns: ['Ce qu’on voit', 'À entraîner', 'Pas doux'],
        rows: [
          ['Tourne seulement les images', 'La cause entre les cases', 'Demander : “qu’est-ce qui a changé entre ces deux cases ?”'],
          ['Lit seulement les bulles', 'Compréhension du dialogue', 'Demander : “qui le dit et pourquoi ?”'],
          ['Perd le sens de lecture', 'Séquence et attention à l’écran', 'Garder une grande case et une phrase courte'],
          ['Redemande le même format', 'Prêt pour une histoire en texte', 'La prochaine fois, créer une histoire texte avec un héros familier'],
        ],
      },
      pl: {
        heading: 'Jak prowadzić od komiksu do dłuższego tekstu',
        intro: 'Komiks staje się stopniem, gdy dorosły używa go do kolejności i rozumienia, a historię tekstową wprowadza jako osobny następny krok.',
        columns: ['Co widać', 'Co ćwiczyć', 'Łagodny krok'],
        rows: [
          ['Przegląda tylko obrazki', 'Przyczynę między kadrami', 'Zapytać: “co zmieniło się między tymi kadrami?”'],
          ['Czyta tylko dymki', 'Rozumienie dialogu', 'Zapytać: “kto to powiedział i dlaczego?”'],
          ['Gubi kierunek czytania', 'Kolejność i uwagę na ekranie', 'Zostawić jeden duży kadr i krótką wypowiedź'],
          ['Prosi o ten sam format', 'Gotowość na historię tekstową', 'Następnym razem stworzyć zwykłą historię tekstową ze znajomym bohaterem'],
        ],
      },
    },
    stepBlock: {
      uk: {
        eyebrow: 'Сходинка читання',
        heading: 'Від коміксу до текстової історії',
        intro: 'Не треба різко забирати комікс. Краще спочатку закріпити порядок подій, а потім створити окрему історію текстом.',
        steps: [
          { title: 'Прочитати репліку', body: 'Дитина починає з короткого тексту в бульбашці, де видно, хто говорить.' },
          { title: 'Назвати зміну', body: 'Між двома панелями дитина пояснює, що сталося й чому.' },
          { title: 'Переказати сцену', body: 'Дитина коротко розповідає своїми словами, що герой зробив і що зрозумів.' },
          { title: 'Створити текстову історію', body: 'Коли дитина готова, наступна історія створюється вже у звичайному текстовому форматі.' },
        ],
      },
      en: {
        eyebrow: 'Reading step',
        heading: 'From comic to text story',
        intro: 'There is no need to remove comics abruptly. First strengthen event order, then create a separate story in text.',
        steps: [
          { title: 'Read the line', body: 'The child starts with short bubble text where the speaker is visible.' },
          { title: 'Name the change', body: 'Between two panels, the child explains what happened and why.' },
          { title: 'Retell the scene', body: 'The child briefly says in their own words what the hero did and understood.' },
          { title: 'Create a text story', body: 'When the child is ready, the next story is created in the regular text format.' },
        ],
      },
      ru: {
        eyebrow: 'Ступень чтения',
        heading: 'От комикса к текстовой истории',
        intro: 'Не нужно резко забирать комикс. Лучше сначала закрепить порядок событий, а затем создать отдельную историю текстом.',
        steps: [
          { title: 'Прочитать реплику', body: 'Ребенок начинает с короткого текста в облачке, где видно, кто говорит.' },
          { title: 'Назвать изменение', body: 'Между двумя панелями ребенок объясняет, что произошло и почему.' },
          { title: 'Пересказать сцену', body: 'Ребенок коротко говорит своими словами, что герой сделал и что понял.' },
          { title: 'Создать текстовую историю', body: 'Когда ребенок готов, следующая история создается уже в обычном текстовом формате.' },
        ],
      },
      es: {
        eyebrow: 'Escalón lector',
        heading: 'Del cómic a la historia de texto',
        intro: 'No hace falta quitar el cómic de golpe. Primero se refuerza el orden de los hechos; después se crea otra historia en texto.',
        steps: [
          { title: 'Leer el globo', body: 'Empieza con texto breve donde se ve quién habla.' },
          { title: 'Nombrar el cambio', body: 'Entre dos viñetas explica qué ocurrió y por qué.' },
          { title: 'Contar la escena', body: 'El niño dice brevemente con sus palabras qué hizo y entendió el héroe.' },
          { title: 'Crear una historia de texto', body: 'Cuando esté listo, la siguiente historia se crea en formato de texto normal.' },
        ],
      },
      de: {
        eyebrow: 'Lesestufe',
        heading: 'Vom Comic zur Textgeschichte',
        intro: 'Comics müssen nicht abrupt verschwinden. Erst wird die Ereignisfolge gestärkt, dann entsteht eine getrennte Geschichte als Text.',
        steps: [
          { title: 'Sprechblase lesen', body: 'Das Kind beginnt mit kurzem Text, bei dem sichtbar ist, wer spricht.' },
          { title: 'Veränderung benennen', body: 'Zwischen zwei Panels erklärt das Kind, was passiert ist und warum.' },
          { title: 'Szene erzählen', body: 'Das Kind sagt kurz mit eigenen Worten, was die Figur getan und verstanden hat.' },
          { title: 'Textgeschichte erstellen', body: 'Wenn das Kind bereit ist, entsteht die nächste Geschichte im normalen Textformat.' },
        ],
      },
      fr: {
        eyebrow: 'Marche de lecture',
        heading: 'De la BD à l’histoire en texte',
        intro: 'Inutile de retirer la BD brusquement. On consolide d’abord l’ordre des événements, puis on crée une histoire séparée en texte.',
        steps: [
          { title: 'Lire la bulle', body: 'L’enfant commence par un texte court où l’on voit qui parle.' },
          { title: 'Nommer le changement', body: 'Entre deux cases, l’enfant explique ce qui s’est passé et pourquoi.' },
          { title: 'Raconter la scène', body: 'L’enfant dit brièvement avec ses mots ce que le héros a fait et compris.' },
          { title: 'Créer une histoire en texte', body: 'Quand l’enfant est prêt, l’histoire suivante est créée en format texte classique.' },
        ],
      },
      pl: {
        eyebrow: 'Stopień czytania',
        heading: 'Od komiksu do historii tekstowej',
        intro: 'Nie trzeba nagle zabierać komiksu. Najpierw wzmacnia się kolejność zdarzeń, potem tworzy osobną historię tekstową.',
        steps: [
          { title: 'Przeczytać dymek', body: 'Dziecko zaczyna od krótkiego tekstu, gdzie widać, kto mówi.' },
          { title: 'Nazwać zmianę', body: 'Między dwoma kadrami dziecko wyjaśnia, co się stało i dlaczego.' },
          { title: 'Opowiedzieć scenę', body: 'Dziecko krótko mówi własnymi słowami, co bohater zrobił i zrozumiał.' },
          { title: 'Stworzyć historię tekstową', body: 'Gdy dziecko jest gotowe, następna historia powstaje w zwykłym formacie tekstowym.' },
        ],
      },
    },
  },
  {
    slug: 'siblings-shared-stories',
    heroImage: '/landing/optimized/multiple-child-profiles-960.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Брати й сестри', en: 'Siblings', ru: 'Братья и сестры', es: 'Hermanos', de: 'Geschwister', fr: 'Fratrie', pl: 'Rodzeństwo' },
    title: {
      uk: 'Історії для братів і сестер: як не змагатися за головну роль',
      en: 'Stories for siblings: avoiding the fight for the main role',
      ru: 'Истории для братьев и сестер: как не спорить за главную роль',
      es: 'Historias para hermanos: evitar la lucha por ser protagonista',
      de: 'Geschichten für Geschwister: ohne Kampf um die Hauptrolle',
      fr: 'Histoires pour frères et sœurs : éviter la bataille du rôle principal',
      pl: 'Historie dla rodzeństwa: bez walki o główną rolę',
    },
    description: {
      uk: 'Як персоналізувати історію для кількох дітей: ролі, черга, спільна місія і справедливий фінал.',
      en: 'How to personalize one story for multiple children: roles, turns, shared mission, and a fair ending.',
      ru: 'Как персонализировать одну историю для нескольких детей: роли, очередь, общая миссия и справедливый финал.',
      es: 'Cómo personalizar una historia para varios niños: roles, turnos, misión compartida y final justo.',
      de: 'Eine Geschichte für mehrere Kinder personalisieren: Rollen, Reihenfolge, gemeinsame Mission, faires Ende.',
      fr: 'Personnaliser une histoire pour plusieurs enfants : rôles, tours, mission commune et fin juste.',
      pl: 'Jak spersonalizować jedną historię dla kilku dzieci: role, kolej, wspólna misja i sprawiedliwy finał.',
    },
    lead: {
      uk: 'Коли в історії двоє дітей, питання не тільки “хто герой”, а “як кожен відчує себе потрібним”.',
      en: 'When a story has two children, the question is not only “who is the hero,” but “how does each child feel needed?”',
      ru: 'Когда в истории двое детей, вопрос не только “кто герой”, а “как каждый почувствует себя нужным”.',
      es: 'Cuando hay dos niños en la historia, la pregunta no es solo quién protagoniza, sino cómo cada uno se siente necesario.',
      de: 'Bei zwei Kindern geht es nicht nur um die Hauptrolle, sondern darum, wie jedes Kind gebraucht wird.',
      fr: 'Avec deux enfants, la question n’est pas seulement qui est héros, mais comment chacun se sent utile.',
      pl: 'Gdy w bajce jest dwoje dzieci, pytanie brzmi nie tylko kto jest bohaterem, lecz jak każde czuje się potrzebne.',
    },
    focus: {
      uk: 'Розділіть ролі за дією: один помічає деталі, інший сміливо пробує. Тоді історія не порівнює дітей, а показує різні сили.',
      en: 'Split roles by action: one notices details, another bravely tries. The story stops comparing children and shows different strengths.',
      ru: 'Разделите роли по действиям: один замечает детали, другой смело пробует. История не сравнивает, а показывает разные силы.',
      es: 'Divide roles por acción: uno nota detalles, otro se atreve. La historia no compara, muestra fuerzas distintas.',
      de: 'Teile Rollen nach Handlung: eines bemerkt Details, eines probiert mutig. Die Geschichte vergleicht nicht, sie zeigt Stärken.',
      fr: 'Répartissez par actions : l’un remarque les détails, l’autre ose essayer. L’histoire ne compare pas, elle montre des forces.',
      pl: 'Podziel role według działania: jedno zauważa szczegóły, drugie odważnie próbuje. Historia nie porównuje, tylko pokazuje siły.',
    },
    research: {
      uk: 'Для сімейної історії важливі черга і визнання. Дитина легше приймає не головну роль, якщо її внесок змінює результат.',
      en: 'For a family story, turns and recognition matter. A child accepts a non-leading role more easily when their contribution changes the outcome.',
      ru: 'Для семейной истории важны очередность и признание. Ребенок легче принимает не главную роль, если его вклад меняет результат.',
      es: 'En historias familiares importan turnos y reconocimiento. Un niño acepta mejor no liderar si su aporte cambia el resultado.',
      de: 'In Familiengeschichten zählen Wechsel und Anerkennung. Ein Kind akzeptiert Nebenrollen eher, wenn sein Beitrag das Ergebnis verändert.',
      fr: 'Dans une histoire familiale, tours et reconnaissance comptent. L’enfant accepte mieux un rôle secondaire si sa contribution change l’issue.',
      pl: 'W rodzinnej historii liczą się kolej i uznanie. Dziecko łatwiej akceptuje drugą rolę, gdy jego wkład zmienia wynik.',
    },
    storyUse: {
      uk: 'Зробіть “чергу світла”: в кожній сцені один робить ключову дію, але фінал потребує обох.',
      en: 'Create a “spotlight turn”: each scene gives one child a key action, but the ending requires both.',
      ru: 'Сделайте “очередь света”: в каждой сцене один делает ключевое действие, но финал требует обоих.',
      es: 'Crea turnos de foco: en cada escena uno hace una acción clave, pero el final necesita a ambos.',
      de: 'Nutze Scheinwerfer-Runden: Jede Szene gibt einem Kind eine Schlüsselhandlung, das Ende braucht beide.',
      fr: 'Créez des tours de lumière : chaque scène donne une action clé à l’un, mais la fin nécessite les deux.',
      pl: 'Zrób „kolej światła”: w każdej scenie jedno robi kluczową rzecz, finał wymaga obojga.',
    },
    adjustment: {
      uk: 'Якщо діти сперечаються, не збільшуйте нагороди. Зробіть наступну історію з іншим порядком ролей.',
      en: 'If children argue, do not increase rewards. Make the next story reverse the role order.',
      ru: 'Если дети спорят, не увеличивайте награды. В следующей истории поменяйте порядок ролей.',
      es: 'Si discuten, no aumentes premios. En la siguiente historia invierte el orden de roles.',
      de: 'Bei Streit nicht Belohnungen erhöhen. In der nächsten Geschichte Rollenreihenfolge wechseln.',
      fr: 'S’ils se disputent, n’ajoutez pas de récompenses. Dans l’histoire suivante, inversez l’ordre.',
      pl: 'Gdy się kłócą, nie zwiększaj nagród. W następnej bajce odwróć kolejność ról.',
    },
    checklist: {
      uk: ['Одна спільна місія.', 'Різні сили для кожної дитини.', 'Фінал, де потрібні обидва.'],
      en: ['One shared mission.', 'Different strengths for each child.', 'An ending that needs both.'],
      ru: ['Одна общая миссия.', 'Разные силы каждого ребенка.', 'Финал, где нужны оба.'],
      es: ['Una misión compartida.', 'Fuerzas distintas para cada niño.', 'Final que necesita a ambos.'],
      de: ['Eine gemeinsame Mission.', 'Unterschiedliche Stärken.', 'Ein Ende, das beide braucht.'],
      fr: ['Une mission commune.', 'Des forces différentes.', 'Une fin qui a besoin des deux.'],
      pl: ['Jedna wspólna misja.', 'Różne siły każdego dziecka.', 'Finał, który potrzebuje obojga.'],
    },
    quote: {
      text: {
        uk: 'Діти найкраще навчаються й розвиваються у чуйних стосунках.',
        en: 'Children learn and develop best in responsive relationships.',
        ru: 'Дети лучше всего учатся и развиваются в отзывчивых отношениях.',
        es: 'Los niños aprenden y se desarrollan mejor en relaciones sensibles y receptivas.',
        de: 'Kinder lernen und entwickeln sich am besten in responsiven Beziehungen.',
        fr: 'Les enfants apprennent et se développent mieux dans des relations attentives et réactives.',
        pl: 'Dzieci uczą się i rozwijają najlepiej w responsywnych relacjach.',
      },
      attribution: 'Harvard Center on the Developing Child',
      sourceLabel: 'Serve and return',
      sourceUrl: 'https://developingchild.harvard.edu/science/key-concepts/serve-and-return/',
    },
    sources: [
      { label: 'Harvard Center: serve and return', url: 'https://developingchild.harvard.edu/science/key-concepts/serve-and-return/' },
      { label: 'AAP: sibling relationships and family context', url: 'https://www.healthychildren.org/' },
    ],
    visualDirection: 'Two children with different story tools completing one magical bridge together.',
    relatedSlugs: ['personalized-childrens-stories', 'story-morals-without-lecturing'],
  },
  {
    slug: 'illness-hospital-comfort-stories',
    heroImage: '/landing/optimized/safe-by-age-960.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Складні дні', en: 'Hard days', ru: 'Сложные дни', es: 'Días difíciles', de: 'Schwere Tage', fr: 'Jours difficiles', pl: 'Trudne dni' },
    title: {
      uk: 'Історії для хвороби, лікарні та тривожних днів',
      en: 'Stories for illness, hospitals, and anxious days',
      ru: 'Истории для болезни, больницы и тревожных дней',
      es: 'Historias para enfermedad, hospital y días ansiosos',
      de: 'Geschichten für Krankheit, Krankenhaus und ängstliche Tage',
      fr: 'Histoires pour maladie, hôpital et jours anxieux',
      pl: 'Historie na chorobę, szpital i niespokojne dni',
    },
    description: {
      uk: 'Як підтримати дитину історією, не обіцяючи неможливого: контроль, чесність, маленька сміливість і знайомі опори.',
      en: 'How to support a child with stories without promising the impossible: control, honesty, small courage, and familiar anchors.',
      ru: 'Как поддержать ребенка историей, не обещая невозможного: контроль, честность, маленькая смелость и знакомые опоры.',
      es: 'Cómo apoyar con historias sin prometer lo imposible: control, honestidad, pequeña valentía y anclas familiares.',
      de: 'Wie Geschichten unterstützen, ohne Unmögliches zu versprechen: Kontrolle, Ehrlichkeit, kleiner Mut, vertraute Anker.',
      fr: 'Comment soutenir sans promettre l’impossible : contrôle, honnêteté, petit courage et repères familiers.',
      pl: 'Jak wspierać historią bez obiecywania niemożliwego: kontrola, szczerość, mała odwaga i znajome punkty.',
    },
    lead: {
      uk: 'У складний день дитині може бути потрібна не велика пригода, а історія, де хтось теж хвилюється і знаходить маленьку опору.',
      en: 'On a hard day, a child may not need a grand adventure. They may need a story where someone worries too and finds a small anchor.',
      ru: 'В сложный день ребенку может быть нужна не большая приключенческая история, а сюжет, где кто-то тоже волнуется и находит опору.',
      es: 'En un día difícil, quizá no necesita gran aventura, sino alguien que también se preocupa y encuentra apoyo.',
      de: 'An schweren Tagen braucht ein Kind vielleicht kein großes Abenteuer, sondern eine Figur, die sich sorgt und Halt findet.',
      fr: 'Un jour difficile, l’enfant n’a peut-être pas besoin d’aventure, mais d’un personnage inquiet qui trouve un appui.',
      pl: 'W trudny dzień dziecko może nie potrzebować wielkiej przygody, lecz bohatera, który też się boi i znajduje oparcie.',
    },
    focus: {
      uk: 'Не робіть історію фальшиво веселою. Краще визнайте хвилювання і дайте герою маленьку дію: обрати предмет, попросити допомоги, дихати разом з другом.',
      en: 'Do not make the story falsely cheerful. Name the worry and give the hero a small action: choose an object, ask for help, breathe with a friend.',
      ru: 'Не делайте историю фальшиво веселой. Признайте тревогу и дайте маленькое действие: выбрать предмет, попросить помощь, дышать с другом.',
      es: 'No hagas la historia falsamente alegre. Nombra la preocupación y da una acción pequeña: elegir objeto, pedir ayuda, respirar con un amigo.',
      de: 'Mach die Geschichte nicht künstlich fröhlich. Benenne Sorge und gib eine kleine Handlung: Gegenstand wählen, Hilfe bitten, mit Freund atmen.',
      fr: 'Ne rendez pas l’histoire faussement joyeuse. Nommez l’inquiétude et donnez une petite action : choisir un objet, demander de l’aide, respirer.',
      pl: 'Nie rób historii fałszywie wesołej. Nazwij lęk i daj małe działanie: wybrać przedmiot, poprosić o pomoc, oddychać z przyjacielem.',
    },
    research: {
      uk: 'Діти краще справляються, коли мають передбачуваність і дорослого, який визнає емоції. Історія може дати мову для страху без тиску.',
      en: 'Children cope better with predictability and adults who acknowledge feelings. Stories can give language to fear without pressure.',
      ru: 'Детям легче справляться, когда есть предсказуемость и взрослый признает эмоции. История дает язык для страха без давления.',
      es: 'Los niños afrontan mejor con predictibilidad y adultos que reconocen emociones. Las historias dan lenguaje al miedo sin presión.',
      de: 'Kinder kommen besser zurecht mit Vorhersagbarkeit und Erwachsenen, die Gefühle anerkennen. Geschichten geben Angst Sprache.',
      fr: 'Les enfants gèrent mieux avec prévisibilité et adultes qui reconnaissent les émotions. Les histoires donnent des mots à la peur.',
      pl: 'Dzieci radzą sobie lepiej przy przewidywalności i dorosłych uznających emocje. Historie dają język dla strachu.',
    },
    storyUse: {
      uk: 'Створіть “кишеньковий талісман” у сюжеті: камінчик, стрічка, маленький робот. Нехай він не магічно лікує, а нагадує герою, що він не сам.',
      en: 'Create a pocket talisman: stone, ribbon, tiny robot. It should not magically cure; it should remind the hero they are not alone.',
      ru: 'Создайте “карманный талисман”: камешек, лента, маленький робот. Он не лечит магически, а напоминает герою, что он не один.',
      es: 'Crea un talismán de bolsillo: piedra, cinta, robot pequeño. No cura mágicamente; recuerda que el héroe no está solo.',
      de: 'Erschaffe einen Taschentalsiman: Stein, Band, kleiner Roboter. Er heilt nicht magisch, sondern erinnert: nicht allein.',
      fr: 'Créez un talisman de poche : pierre, ruban, petit robot. Il ne guérit pas, il rappelle que le héros n’est pas seul.',
      pl: 'Stwórz kieszonkowy talizman: kamyk, wstążkę, małego robota. Nie leczy magicznie, tylko przypomina, że bohater nie jest sam.',
    },
    adjustment: {
      uk: 'Уникайте медичних обіцянок і детальних процедур, якщо дитина не просить. Тримайте історію чесною, короткою і теплою.',
      en: 'Avoid medical promises and detailed procedures unless the child asks. Keep the story honest, short, and warm.',
      ru: 'Избегайте медицинских обещаний и подробных процедур, если ребенок не просит. Пусть история будет честной, короткой и теплой.',
      es: 'Evita promesas médicas y procedimientos detallados salvo que pregunte. Mantén la historia honesta, breve y cálida.',
      de: 'Vermeide medizinische Versprechen und Details, wenn das Kind nicht fragt. Bleib ehrlich, kurz und warm.',
      fr: 'Évitez les promesses médicales et détails sauf si l’enfant demande. Gardez l’histoire honnête, courte et chaude.',
      pl: 'Unikaj medycznych obietnic i szczegółów, jeśli dziecko nie pyta. Historia ma być szczera, krótka i ciepła.',
    },
    checklist: {
      uk: ['Назвати почуття м’яко.', 'Дати герою маленьку дію контролю.', 'Не обіцяти того, чого дорослий не контролює.'],
      en: ['Name the feeling gently.', 'Give the hero one small control action.', 'Do not promise what adults cannot control.'],
      ru: ['Мягко назвать чувство.', 'Дать герою маленькое действие контроля.', 'Не обещать того, что взрослый не контролирует.'],
      es: ['Nombra la emoción suavemente.', 'Da una pequeña acción de control.', 'No prometas lo que no controlas.'],
      de: ['Gefühl sanft benennen.', 'Eine kleine Kontrollhandlung geben.', 'Nichts versprechen, was nicht kontrollierbar ist.'],
      fr: ['Nommer doucement l’émotion.', 'Donner une petite action de contrôle.', 'Ne pas promettre l’incontrôlable.'],
      pl: ['Delikatnie nazwij uczucie.', 'Daj małe działanie kontroli.', 'Nie obiecuj rzeczy poza kontrolą.'],
    },
    quote: {
      text: {
        uk: 'Найпоширеніший чинник у дітей, які розвивають стійкість, — принаймні одні стабільні стосунки.',
        en: 'The single most common factor for children who develop resilience is at least one stable relationship.',
        ru: 'Самый распространенный фактор у детей, развивающих устойчивость, — хотя бы одни стабильные отношения.',
        es: 'El factor más común en los niños que desarrollan resiliencia es al menos una relación estable.',
        de: 'Der häufigste Faktor bei Kindern, die Resilienz entwickeln, ist mindestens eine stabile Beziehung.',
        fr: 'Le facteur le plus courant chez les enfants qui développent la résilience est au moins une relation stable.',
        pl: 'Najczęstszym czynnikiem u dzieci rozwijających odporność jest co najmniej jedna stabilna relacja.',
      },
      attribution: 'Harvard Center on the Developing Child',
      sourceLabel: 'Resilience resources',
      sourceUrl: 'https://developingchild.harvard.edu/science/key-concepts/resilience/',
    },
    sources: [
      { label: 'Harvard Center: resilience', url: 'https://developingchild.harvard.edu/science/key-concepts/resilience/' },
      { label: 'Child Mind Institute: helping children cope', url: 'https://childmind.org/topics/anxiety/' },
    ],
    visualDirection: 'A child holding a tiny glowing talisman in a calm waiting room that transforms into a soft fantasy landscape.',
    relatedSlugs: ['bedtime-story-family-ritual', 'story-morals-without-lecturing'],
  },
  {
    slug: 'grandparents-story-sharing',
    heroImage: '/landing/optimized/share-with-family-960.webp',
    updatedAt: '2026-06-17',
    category: { uk: 'Родина', en: 'Family sharing', ru: 'Семья', es: 'Familia', de: 'Familie', fr: 'Famille', pl: 'Rodzina' },
    title: {
      uk: 'Як ділитися дитячими історіями з бабусями й дідусями без втрати приватності',
      en: 'Sharing children’s stories with grandparents without losing privacy',
      ru: 'Как делиться детскими историями с бабушками и дедушками без потери приватности',
      es: 'Compartir historias con abuelos sin perder privacidad',
      de: 'Kindergeschichten mit Großeltern teilen, ohne Privatsphäre zu verlieren',
      fr: 'Partager des histoires avec les grands-parents sans perdre la confidentialité',
      pl: 'Jak dzielić się historiami z dziadkami bez utraty prywatności',
    },
    description: {
      uk: 'Публічна, приватна й сімейна історія — різні речі. Як обирати формат поширення для дитячого контенту.',
      en: 'Public, private, and family-only stories are different. How to choose the right sharing format for child content.',
      ru: 'Публичная, приватная и семейная история — разные вещи. Как выбирать формат для детского контента.',
      es: 'Historias públicas, privadas y familiares son distintas. Cómo elegir formato para contenido infantil.',
      de: 'Öffentlich, privat und nur Familie sind verschieden. So wählt man das passende Teilen für Kinderinhalte.',
      fr: 'Public, privé et familial ne sont pas la même chose. Choisir le bon partage pour le contenu enfant.',
      pl: 'Publiczne, prywatne i rodzinne historie to różne rzeczy. Jak wybrać format udostępniania.',
    },
    lead: {
      uk: 'Близькі хочуть бачити історії дитини. Але дитячий контент потребує ясних меж: хто бачить, що саме і як довго.',
      en: 'Relatives want to see a child’s stories. Child content still needs clear boundaries: who sees it, what they see, and for how long.',
      ru: 'Близкие хотят видеть истории ребенка. Но детскому контенту нужны границы: кто видит, что именно и как долго.',
      es: 'La familia quiere ver las historias del niño. El contenido infantil necesita límites: quién ve, qué ve y por cuánto tiempo.',
      de: 'Familie möchte Geschichten sehen. Kinderinhalte brauchen Grenzen: wer sieht was und wie lange.',
      fr: 'La famille veut voir les histoires. Le contenu enfant demande des limites : qui voit quoi et combien de temps.',
      pl: 'Bliscy chcą widzieć historie dziecka. Treści dzieci potrzebują granic: kto widzi, co i jak długo.',
    },
    focus: {
      uk: 'Найбезпечніший підхід — приватність за замовчуванням і свідоме поширення окремих історій. Родині можна показати історію, не роблячи весь профіль публічним.',
      en: 'The safest approach is privacy by default and intentional sharing of individual stories. Family can see a story without the whole profile becoming public.',
      ru: 'Самый безопасный подход — приватность по умолчанию и осознанное шаринг отдельных историй. Родные могут видеть историю без публичного профиля.',
      es: 'Lo más seguro es privacidad por defecto y compartir historias concretas. La familia puede ver una historia sin hacer público el perfil.',
      de: 'Am sichersten: standardmäßig privat und einzelne Geschichten bewusst teilen. Familie sieht eine Geschichte, nicht das ganze Profil.',
      fr: 'Le plus sûr : privé par défaut et partage intentionnel d’histoires précises. La famille voit une histoire, pas tout le profil.',
      pl: 'Najbezpieczniej: prywatnie domyślnie i świadome udostępnianie pojedynczych historii. Rodzina widzi historię, nie cały profil.',
    },
    research: {
      uk: 'Для дитячих даних важливий принцип мінімізації: показувати рівно стільки, скільки потрібно для конкретної мети.',
      en: 'For children’s data, minimization matters: show only what is needed for the specific purpose.',
      ru: 'Для детских данных важен принцип минимизации: показывать ровно столько, сколько нужно для конкретной цели.',
      es: 'Para datos infantiles importa la minimización: mostrar solo lo necesario para un propósito concreto.',
      de: 'Bei Kinderdaten zählt Datenminimierung: nur zeigen, was für den Zweck nötig ist.',
      fr: 'Pour les données d’enfants, la minimisation compte : montrer seulement le nécessaire.',
      pl: 'Przy danych dzieci ważna jest minimalizacja: pokazywać tylko to, co potrzebne do celu.',
    },
    storyUse: {
      uk: 'Перед поширенням перевірте: чи є фото, повне ім’я, місце, приватні деталі. Якщо є сумнів, лишіть історію приватною або використайте сімейне посилання.',
      en: 'Before sharing, check for photos, full name, location, or private details. If unsure, keep it private or use a family link.',
      ru: 'Перед шарингом проверьте фото, полное имя, место, приватные детали. Если сомневаетесь — оставьте приватной или используйте семейную ссылку.',
      es: 'Antes de compartir, revisa fotos, nombre completo, ubicación o detalles privados. Si dudas, mantén privado o usa enlace familiar.',
      de: 'Vor dem Teilen Fotos, vollen Namen, Ort und private Details prüfen. Bei Zweifel privat lassen oder Familienlink nutzen.',
      fr: 'Avant partage, vérifiez photos, nom complet, lieu, détails privés. En cas de doute, gardez privé ou lien familial.',
      pl: 'Przed udostępnieniem sprawdź zdjęcia, pełne imię, miejsce, prywatne detale. W razie wątpliwości zostaw prywatnie.',
    },
    adjustment: {
      uk: 'Якщо історія стала публічною випадково, змініть статус і перевірте посилання. Поясніть родині, що приватність дитини важливіша за зручність.',
      en: 'If a story was made public by mistake, change its status and check links. Explain that a child’s privacy matters more than convenience.',
      ru: 'Если история случайно стала публичной, смените статус и проверьте ссылки. Объясните, что приватность ребенка важнее удобства.',
      es: 'Si una historia se publicó por error, cambia estado y revisa enlaces. La privacidad del niño importa más que la comodidad.',
      de: 'Wurde eine Geschichte versehentlich öffentlich, Status ändern und Links prüfen. Kinderschutz ist wichtiger als Bequemlichkeit.',
      fr: 'Si une histoire devient publique par erreur, changez le statut et vérifiez les liens. La confidentialité prime sur la facilité.',
      pl: 'Jeśli historia przypadkiem stała się publiczna, zmień status i sprawdź linki. Prywatność dziecka jest ważniejsza niż wygoda.',
    },
    checklist: {
      uk: ['Приватно за замовчуванням.', 'Окреме посилання для родини.', 'Перевірка фото й приватних деталей перед поширенням.'],
      en: ['Private by default.', 'Separate family link.', 'Check photos and private details before sharing.'],
      ru: ['Приватно по умолчанию.', 'Отдельная семейная ссылка.', 'Проверка фото и деталей перед шарингом.'],
      es: ['Privado por defecto.', 'Enlace familiar separado.', 'Revisar fotos y detalles antes de compartir.'],
      de: ['Standardmäßig privat.', 'Separater Familienlink.', 'Fotos und Details vor dem Teilen prüfen.'],
      fr: ['Privé par défaut.', 'Lien familial séparé.', 'Vérifier photos et détails avant partage.'],
      pl: ['Prywatnie domyślnie.', 'Osobny link rodzinny.', 'Sprawdź zdjęcia i detale przed udostępnieniem.'],
    },
    quote: {
      text: {
        uk: 'Захист даних за задумом і за замовчуванням — ключовий принцип приватності.',
        en: 'Data protection by design and by default is a core privacy principle.',
        ru: 'Защита данных по замыслу и по умолчанию — ключевой принцип приватности.',
        es: 'La protección de datos desde el diseño y por defecto es un principio central de privacidad.',
        de: 'Datenschutz durch Technikgestaltung und durch datenschutzfreundliche Voreinstellungen ist ein zentraler Datenschutzgrundsatz.',
        fr: 'La protection des données dès la conception et par défaut est un principe central de confidentialité.',
        pl: 'Ochrona danych w fazie projektowania i domyślnie to podstawowa zasada prywatności.',
      },
      attribution: 'European Data Protection Board',
      sourceLabel: 'EDPB guidelines',
      sourceUrl: 'https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-42019-article-25-data-protection-design-and_en',
    },
    sources: [
      { label: 'EDPB: data protection by design and by default', url: 'https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-42019-article-25-data-protection-design-and_en' },
      { label: 'ICO: children’s code', url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/' },
    ],
    visualDirection: 'A family photo album where selected story pages glow behind a gentle privacy shield.',
    relatedSlugs: ['personalized-childrens-stories', 'illness-hospital-comfort-stories'],
  },
];

const PUBLISHED_ARTICLES = ARTICLES.slice(0, 12);
const ARTICLE_BY_SLUG = new Map(PUBLISHED_ARTICLES.map((article) => [article.slug, article]));

export function getBlogSlugs(): string[] {
  return PUBLISHED_ARTICLES.map((article) => article.slug);
}

export function getBlogSitemapRoutes(): Array<{
  slug: string;
  locale: PublicSeoLocale;
  path: string;
  lastmod: string;
}> {
  return PUBLISHED_ARTICLES.flatMap((article) =>
    PUBLIC_SEO_LOCALES.map((locale) => ({
      slug: article.slug,
      locale,
      path: buildPublicBlogArticlePath(article.slug, locale),
      lastmod: article.updatedAt,
    }))
  );
}

export function getBlogArticle(slug: string, locale: PublicSeoLocale): BlogArticleView | null {
  const article = ARTICLE_BY_SLUG.get(slug);
  if (!article) return null;

  const ui = UI_COPY[locale];
  const title = article.title[locale];
  return {
    slug: article.slug,
    locale,
    category: article.category[locale],
    title,
    seoTitle: `${title} — WonderTales Blog`,
    description: article.description[locale],
    lead: article.lead[locale],
    heroImage: article.heroImage,
    heroAlt: `${ui.heroAltPrefix} ${title}`,
    updatedAt: article.updatedAt,
    readingTime: ui.readingTime,
    sections: [
      { heading: ui.sections[0], paragraphs: localizeParagraphs(article.focus, locale) },
      { heading: ui.sections[1], paragraphs: localizeParagraphs(article.research, locale) },
      { heading: ui.sections[2], paragraphs: localizeParagraphs(article.storyUse, locale) },
      { heading: ui.sections[3], paragraphs: localizeParagraphs(article.adjustment, locale) },
    ],
    checklistTitle: ui.checklistTitle,
    checklistItems: article.checklist[locale],
    checklistCtaLabel: article.checklistCtaLabel?.[locale] ?? null,
    createStoryParams: article.createStoryParams ?? {},
    quote: {
      text: localizeText(article.quote.text, locale),
      attribution: article.quote.attribution,
      sourceLabel: localizeText(article.quote.sourceLabel, locale),
      sourceUrl: article.quote.sourceUrl,
    },
    sources: article.sources,
    relatedSlugs: article.relatedSlugs,
    insightCards: article.insightCards?.[locale] ?? [],
    decisionTable: article.decisionTable?.[locale] ?? null,
    stepBlock: article.stepBlock?.[locale] ?? null,
    inlineImages: (article.inlineImages ?? []).map((image) => ({
      src: image.src,
      alt: image.alt[locale],
      caption: image.caption[locale],
      sectionIndex: image.sectionIndex,
      afterParagraphIndex: image.afterParagraphIndex,
    })),
  };
}

export function listBlogArticles(locale: PublicSeoLocale): BlogArticleSummary[] {
  return PUBLISHED_ARTICLES.map((article) => {
    const ui = UI_COPY[locale];
    const title = article.title[locale];
    return {
      slug: article.slug,
      locale,
      category: article.category[locale],
      title,
      description: article.description[locale],
      heroImage: article.heroImage,
      heroAlt: `${ui.heroAltPrefix} ${title}`,
      updatedAt: article.updatedAt,
      readingTime: ui.readingTime,
    };
  });
}
