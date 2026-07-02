import {
  APP_SUPPORTED_LOCALES,
  DEFAULT_PUBLIC_SEO_LOCALE,
  PUBLIC_SEO_LOCALES,
  type AppSupportedLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';

export const DEFAULT_LANDING_LOCALE = DEFAULT_PUBLIC_SEO_LOCALE;
export const LANDING_LOCALES = APP_SUPPORTED_LOCALES;
export type LandingLocale = AppSupportedLocale;
export { PUBLIC_SEO_LOCALES, type PublicSeoLocale };

type PlanSlug = 'free' | 'silver' | 'golden' | 'fairyworld';

export interface LandingImageCard {
  title: string;
  desc: string;
  image: string;
}

export interface LandingFaqItem {
  q: string;
  a: string;
  allowHtml?: boolean;
}

export interface LandingExampleStory {
  age: string;
  title: string;
  time: string;
  slug: string;
  thumbnailUrl: string | null;
}

export interface LandingContent {
  htmlLang: string;
  ogLocale: string;
  metaTitle: string;
  metaDescription: string;
  hero: {
    title: string;
    highlight: string;
    subheadline: string;
    imageAlt: string;
    cta: string;
  };
  trustChips: {
    safe: string;
    audio: string;
    personalized: string;
    languages: string;
    ready: string;
  };
  whyFamiliesLove: {
    title: string;
    subtitle: string;
    cards: LandingImageCard[];
  };
  fromSketchToStory: {
    title: string;
    subtitle: string;
    steps: Array<{ title: string; desc: string }>;
  };
  exampleStories: {
    title: string;
    subtitle: string;
    previewFallback: string;
    ageLabel: string;
    readingLabel: string;
    viewStoryCta: string;
    allStoriesCta: string;
    fallbackStories: LandingExampleStory[];
  };
  madeForChildren: {
    title: string;
    subtitle: string;
    cards: LandingImageCard[];
  };
  featureGrid: {
    title: string;
    subtitle: string;
    features: LandingImageCard[];
  };
  safety: {
    title: string;
    subtitle: string;
    points: string[];
  };
  voices: {
    title: string;
    subtitle: string;
    previewAria: string;
    noSampleAria: string;
    fallbackVoices: Array<{ id: string; name: string; displayName: string; sampleAudioUrl: null }>;
  };
  multilingual: {
    title: string;
    subtitle: string;
    bullets: string[];
  };
  pricing: {
    title: string;
    subtitle: string;
    reassurance: string;
    cta: string;
    popularBadge: string;
    perMonthSuffix: string;
    fallbackPlans: Record<PlanSlug, { name: string; price: string }>;
  };
  faq: {
    title: string;
    subtitle: string;
    cta: string;
    items: LandingFaqItem[];
  };
  finalCta: {
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
  };
}

const landingContent: Record<LandingLocale, LandingContent> = {
  uk: {
    htmlLang: 'uk',
    ogLocale: 'uk_UA',
    metaTitle: 'WonderTales — Перетворіть малюнок дитини на героя казки',
    metaDescription:
      'Створюйте персоналізовані історії з ілюстраціями, озвученням і текстом для читання. Безпечно, з урахуванням віку, для сімей.',
    hero: {
      title: 'Перетворіть малюнок дитини на',
      highlight: 'чарівного героя казки',
      subheadline:
        'Створюйте персоналізовані історії з красивими ілюстраціями, озвученням і текстом для читання — за хвилини, безпечно, з урахуванням віку.',
      imageAlt: 'Малюнок дитини перетворюється на ілюстрацію до казки',
      cta: 'Створити першу історію безкоштовно →',
    },
    trustChips: {
      safe: 'Безпечно для дітей',
      audio: 'Озвучення включено',
      personalized: 'Персоналізація за малюнками',
      languages: 'Багато мов',
      ready: 'Готово за хвилини',
    },
    whyFamiliesLove: {
      title: 'Чому діти люблять WonderTales',
      subtitle:
        'Більше ніж генератор історій — чарівний досвід, до якого діти хочуть повертатися, а батьки відчувають спокій.',
      cards: [
        {
          title: 'Їхній малюнок оживає',
          desc: 'Дитина бачить свій світ у казці — її ідеї та улюблені герої стають справжніми персонажами.',
          image: '/landing/draw-to-hero.png',
        },
        {
          title: 'Історії, які хочеться вмикати знову',
          desc: 'Яскраві сцени, виразне озвучення й текст, що підсвічується під голос, роблять кожну історію захопливою від початку до кінця.',
          image: '/landing/listen-again.png',
        },
        {
          title: 'Казки, які легко зрозуміти й полюбити',
          desc: 'Історії звучать природно, цікаво й по віку — дитині легко стежити за сюжетом і занурюватися в пригоду.',
          image: '/landing/safe-by-age.png',
        },
        {
          title: 'Чарівна історія з’являється дуже швидко',
          desc: 'Достатньо обрати героя, тему й настрій — або завантажте кілька фото, і WonderTales сам створить персонажів. За кілька хвилин дитина вже може слухати, читати й роздивлятися свою казку.',
          image: '/landing/create-in-minutes.png',
        },
      ],
    },
    fromSketchToStory: {
      title: 'Від малюнка до казки — один чарівний процес',
      subtitle:
        'Побачте, як простий малюнок стає опрацьованим персонажем і повною персоналізованою історією.',
      steps: [
        {
          title: 'Додайте малюнки, фото або ідеї героїв',
          desc: 'Завантажте дитячі малюнки, фото чи просто опишіть персонажів словами — WonderTales перетворить ваші ідеї на живих героїв, яких дитина впізнає, полюбить і захоче бачити знову.',
        },
        {
          title: 'Налаштуйте казку саме під вашу дитину',
          desc: 'Оберіть мову й тему: магія, космос, детективи, страшилки та інші. Можна обрати мораль історії, стиль ілюстрацій і додати особливі побажання. WonderTales врахує все й створить історію, яка відчувається по-справжньому особливою.',
        },
        {
          title: 'Отримайте готову казку з ілюстраціями',
          desc: 'За кілька хвилин WonderTales створить повноцінну історію з красивими сценами, продуманим сюжетом і персонажами — щоб читати було цікаво, легко й захопливо.',
        },
        {
          title: 'Слухайте, читайте й діліться разом',
          desc: 'Увімкніть озвучення, читайте текст у зручному темпі або діліться історією з рідними. Казка стає не просто контентом, а теплим сімейним моментом, до якого хочеться повертатися знову і знову.',
        },
      ],
    },
    exampleStories: {
      title: 'Приклади чарівних історій',
      subtitle:
        'Перегляньте зразки історій, щоб побачити якість, тон і різноманіття, які можуть створювати сім’ї.',
      previewFallback: 'Перегляд',
      ageLabel: 'Вік:',
      readingLabel: 'Читання:',
      viewStoryCta: 'Переглянути історію',
      allStoriesCta: 'Всі історії',
      fallbackStories: [
        { age: '3–5 років', title: 'Малий будівник ракет', time: '5 хв', slug: '', thumbnailUrl: null },
        { age: '6–8 років', title: 'Міла та місячний сад', time: '6 хв', slug: '', thumbnailUrl: null },
        { age: '4–7 років', title: 'Бруно — відважний паперовий дракон', time: '7 хв', slug: '', thumbnailUrl: null },
      ],
    },
    madeForChildren: {
      title: 'Створено для дітей. Цінно для батьків.',
      subtitle: 'Більш змістовний час перед екраном — творчий, особистий і до нього хочеться повертатися.',
      cards: [
        {
          title: 'Особиста пам’ятка, а не одноразовий контент',
          desc: 'Кожна історія особлива, бо починається з уяви вашої дитини.',
          image: '/landing/personal-keepsake.png',
        },
        {
          title: 'Підтримка читання та мовного розвитку',
          desc: 'Діти слухають, читають за текстом і насолоджуються історіями різними мовами.',
          image: '/landing/reading-and-language.png',
        },
        {
          title: 'Ідеально перед сном і для спокійних моментів',
          desc: 'Готова казка для щоденних сімейних ритуалів.',
          image: '/landing/bedtime-moments.png',
        },
        {
          title: 'Легко ділитися з родиною',
          desc: 'Надсилайте посилання на історії бабусям, дідусям і рідним. Опублікуйте в каталозі — отримайте оцінки від читачів.',
          image: '/landing/share-with-family.png',
        },
      ],
    },
    featureGrid: {
      title: 'Все необхідне для чарівного часу з казками',
      subtitle: 'Створено для красивої, простої й багаторазової персоналізованої казки.',
      features: [
        {
          title: 'Голосове озвучення',
          desc: 'Виразна аудіоверсія: обирайте голос під настрій — жіночий чи чоловічий, дзвінкий чи м’який. Слухайте в дорозі, перед сном або коли зручно.',
          image: '/landing/voice-narration.png',
        },
        {
          title: 'Текст для читання разом',
          desc: 'Слово за словом підсвічується під озвучення — дитина слідкує оком і природно пов’язує звук із текстом. Як караоке для казок.',
          image: '/landing/read-along-text.png',
        },
        {
          title: 'Адаптація за віком',
          desc: 'Складність тексту, довжина речень і абзаців узгоджені з Lexile (MetaMetrics) — стандартом, яким користуються школи й освітні програми. Тон і лексика підлаштовуються під вік дитини.',
          image: '/landing/age-adaptation.png',
        },
        {
          title: 'Серії з улюбленими героями',
          desc: 'Улюблені персонажі легко та зручно повертаються в нових історіях — дитина чекає на продовження пригод свого героя.',
          image: '/landing/favorite-hero-series.png',
        },
        {
          title: 'Своя історія від малюнка до казки',
          desc: 'Дитина стає автором власної казки — придумує героя, обирає пригоду, ділиться з сім’єю чи друзями. Опублікуйте в каталозі — отримайте оцінки від читачів.',
          image: '/landing/draw-to-story.png',
        },
        {
          title: 'Кілька профілів дітей',
          desc: 'Окремий профіль для кожної дитини — вік, ім’я, вподобання та настрій. Історії підлаштовуються під конкретну дитину.',
          image: '/landing/multiple-child-profiles.png',
        },
        {
          title: 'Ілюстрації різних стилів',
          desc: 'Оберіть стиль під настрій — акварель, пластелін, 3D-анімація, комікс чи нічна казка. Кожна історія виглядає по-своєму.',
          image: '/landing/illustration-styles.png',
        },
      ],
    },
    safety: {
      title: 'Безпечно для дітей',
      subtitle: 'Кожна історія відповідає правилам безпеки і задумана бути радісною, м’якою та відповідною віку дитини.',
      points: [
        'Щасливі кінцівки',
        'Без насильства й тривожного контенту',
        'Адаптація під вік дитини',
        'Лише дружній, позитивний тон',
        'Сімейні, безпечні теми',
      ],
    },
    voices: {
      title: 'Голоси для озвучення',
      subtitle:
        'Обирайте голос для казки — жіночий чи чоловічий. Передслухайте перед створенням історії. Безкоштовні голоси для всіх. Преміум-голоси (Персей, Оріон, Андромеда, Кассіопея) — для тарифу Казковий світ.',
      previewAria: 'Передслухати',
      noSampleAria: 'Немає зразка',
      fallbackVoices: [
        { id: 'lyra', name: 'lyra', displayName: 'Ліра', sampleAudioUrl: null },
        { id: 'hydra', name: 'hydra', displayName: 'Гідра', sampleAudioUrl: null },
        { id: 'phoenix', name: 'phoenix', displayName: 'Феникс', sampleAudioUrl: null },
        { id: 'centaurus', name: 'centaurus', displayName: 'Кентавр', sampleAudioUrl: null },
      ],
    },
    multilingual: {
      title: 'Читай однією мовою, вчися іншій',
      subtitle: 'WonderTales — багатомовні історії для сімей, де важливі й уява, й занурення в мову.',
      bullets: [
        'Створюйте історії різними мовами',
        'Читайте та слухайте природно',
        'Ідеально для дво- та багатомовних сімей',
        'Чудово для ігрового вивчення мови',
      ],
    },
    pricing: {
      title: 'Оберіть тариф для вашої сім’ї',
      subtitle: 'Почніть безкоштовно, потім відкрийте більше історій, озвучення, ілюстрацій, коміксів і способів поділитися.',
      reassurance: 'Підвищуйте тариф будь-коли, коли сім’я більше читає, слухає і створює.',
      cta: 'Тарифи та можливості',
      popularBadge: 'Найпопулярніший',
      perMonthSuffix: '/міс',
      fallbackPlans: {
        free: { name: 'Безкоштовний', price: '0' },
        silver: { name: 'Срібні мрії', price: '—' },
        golden: { name: 'Золоті зорі', price: '—' },
        fairyworld: { name: 'Казковий світ', price: '—' },
      },
    },
    faq: {
      title: 'Часті питання',
      subtitle: 'Усе, що батьки зазвичай хочуть знати перед стартом.',
      cta: 'Створити першу історію зараз',
      items: [
        {
          q: 'Чому WonderTales безпечно для дітей?',
          a: 'Текст кожної сцени перевіряється окремо: WonderTales аналізує зміст на відповідність віку, безпечні теми й щасливе закінчення. Якщо сцена не проходить перевірку, сервіс автоматично переписує її з урахуванням зауважень. Ілюстрації теж проходять валідацію: WonderTales перевіряє кожне зображення на наявність забороненого контенту й за потреби генерує заміну. У WonderTales діють чіткі обмеження: без насильства, горя чи травмуючих сцен; лише дружній, позитивний тон. Складність речень узгоджена з Lexile, тому казка залишається зрозумілою саме для обраного віку.',
        },
        {
          q: 'Чи можу я використати малюнок дитини в історії?',
          a: 'Так. Завантажте малюнок, фото дитини чи улюбленої тваринки — або опишіть героя словами: WonderTales намалює персонажа за вашими нотатками. Є швидкий режим: кілька фото, і WonderTales сам розпізнає обличчя, створить персонажів і вплете їх у сюжет. Можна додати дракона, єдинорога, робота або уявного друга — історія будується навколо тих, кого ваша дитина впізнає і полюбить.',
        },
        {
          q: 'Чи потрібно самому писати історію?',
          a: 'Ні. Ви обираєте вік дитини, тему, персонажів і мову. Можна обрати моральну мету — дружба, сміливість, допомога, безпека на дорозі — і додати короткі примітки. WonderTales створює повноцінну історію з сенсорними деталями, діалогами, місією та задовольняючою кульмінацією. Ви лише натискаєте — і отримуєте текст, ілюстрації та, за бажання, озвучення.',
        },
        {
          q: 'Скільки часу потрібно для створення історії?',
          a: 'Зазвичай 1–2 хвилини. Ви бачите прогрес у реальному часі: аналіз фото, генерація тексту, перевірка безпеки та створення ілюстрацій. Озвучення можна додати пізніше окремо. Це час для чашки чаю — і дитина вже отримує свою історію.',
        },
        {
          q: 'Чи можна слухати історію в аудіо?',
          a: 'Так. Після створення історії можна згенерувати виразне озвучення з емоціями: радість, цікавість, шепіт, сміх. Голоси жіночі й чоловічі, з різними тембрами. Є режим читання разом: слово підсвічується синхронно з озвученням, як караоке для казок, — дитина легко співвідносить звук і текст. Преміум-голоси доступні на вищих тарифах, а ліміт аудіоісторій залежить від плану.',
        },
        {
          q: 'Чи можна створювати історії різними мовами?',
          a: 'Так. WonderTales підтримує українську, англійську, німецьку, французьку, іспанську, польську та російську мови. Текст і озвучення генеруються тією мовою, яку ви обрали. Це особливо корисно для сімей, які підтримують дво- або багатомовність і хочуть занурювати дитину в мову через знайомих персонажів та захопливі сюжети.',
        },
        {
          q: 'Чи є безкоштовний тариф?',
          a: 'Так. Можна почати безкоштовно: кілька історій на місяць, одна аудіоісторія та один профіль дитини. Платні тарифи відкривають більше історій, більше озвучення, кілька профілів дітей і більше ілюстрацій. <a href="/pricing">Деталі — на сторінці тарифів</a>.',
          allowHtml: true,
        },
        {
          q: 'Чи можна ділитися історіями з родиною?',
          a: 'Так. Опублікуйте історію публічно або приватним посиланням — і надішліть бабусям, дідусям чи друзям. Опубліковані історії можуть отримувати оцінки від читачів і з’являтися в загальному каталозі прикладів.',
        },
        {
          q: 'Які є стилі ілюстрацій?',
          a: 'Доступні акварель, олівець, комікс, тепла 3D-анімація, нічна казка, фетр, пластелін і аніме. Оберіть стиль під настрій — і кожна історія виглядатиме по-своєму.',
        },
        {
          q: 'Який обсяг історії?',
          a: 'Зазвичай це 5–11 сцен залежно від віку: для молодших дітей історії коротші, для старших — довші й глибші. WonderTales автоматично підлаштовує довжину під обраний вік.',
        },
      ],
    },
    finalCta: {
      title: 'Подаруйте дитині радість стати героєм власної історії',
      subtitle: 'Малюнок, фото або опис — WonderTales створить персоналізовану історію за хвилини.',
      primaryCta: 'Створити першу історію безкоштовно',
      secondaryCta: 'Переглянути тарифи',
    },
  },
  ru: {
    htmlLang: 'ru',
    ogLocale: 'ru_RU',
    metaTitle: 'WonderTales — превратите рисунок ребенка в героя сказки',
    metaDescription:
      'Создавайте персонализированные истории с иллюстрациями, озвучкой и текстом для чтения. Безопасно, с учетом возраста, для всей семьи.',
    hero: {
      title: 'Превратите рисунок ребенка в',
      highlight: 'волшебного героя сказки',
      subheadline:
        'Создавайте персонализированные истории с красивыми иллюстрациями, озвучкой и текстом для чтения — за минуты, безопасно и с учетом возраста.',
      imageAlt: 'Рисунок ребенка превращается в иллюстрацию к сказке',
      cta: 'Создать первую историю бесплатно →',
    },
    trustChips: {
      safe: 'Безопасно для детей',
      audio: 'Озвучка включена',
      personalized: 'Персонализация по рисункам',
      languages: 'Много языков',
      ready: 'Готово за минуты',
    },
    whyFamiliesLove: {
      title: 'Почему дети любят WonderTales',
      subtitle:
        'Это больше, чем генератор историй: волшебный опыт, к которому дети хотят возвращаться, а родители чувствуют спокойствие.',
      cards: [
        {
          title: 'Их рисунок оживает',
          desc: 'Ребенок видит свой мир в сказке: его идеи и любимые герои становятся настоящими персонажами.',
          image: '/landing/draw-to-hero.png',
        },
        {
          title: 'Истории, которые хочется включать снова',
          desc: 'Яркие сцены, выразительная озвучка и текст с подсветкой под голос делают каждую историю увлекательной от начала до конца.',
          image: '/landing/listen-again.png',
        },
        {
          title: 'Сказки, которые легко понять и полюбить',
          desc: 'Истории звучат естественно, интересно и по возрасту — ребенку легко следить за сюжетом и погружаться в приключение.',
          image: '/landing/safe-by-age.png',
        },
        {
          title: 'Волшебная история появляется очень быстро',
          desc: 'Достаточно выбрать героя, тему и настроение — или загрузить несколько фото, и WonderTales сам создаст персонажей. Через пару минут ребенок уже может слушать, читать и рассматривать свою сказку.',
          image: '/landing/create-in-minutes.png',
        },
      ],
    },
    fromSketchToStory: {
      title: 'От рисунка до сказки — один волшебный процесс',
      subtitle: 'Посмотрите, как простой рисунок превращается в проработанного персонажа и полноценную персонализированную историю.',
      steps: [
        {
          title: 'Добавьте рисунки, фото или идеи героев',
          desc: 'Загрузите детские рисунки, фотографии или просто опишите персонажей словами — WonderTales превратит ваши идеи в живых героев, которых ребенок узнает, полюбит и захочет видеть снова.',
        },
        {
          title: 'Настройте сказку именно под вашего ребенка',
          desc: 'Выберите язык и тему: магия, космос, детективы, страшилки и другие. Можно задать мораль истории, стиль иллюстраций и особые пожелания. WonderTales учтет все и создаст историю, которая ощущается по-настоящему особенной.',
        },
        {
          title: 'Получите готовую сказку с иллюстрациями',
          desc: 'Через несколько минут WonderTales создаст полноценную историю с красивыми сценами, продуманным сюжетом и героями — чтобы читать было легко, интересно и захватывающе.',
        },
        {
          title: 'Слушайте, читайте и делитесь вместе',
          desc: 'Включайте озвучку, читайте текст в удобном темпе или делитесь историей с близкими. Сказка становится не просто контентом, а теплым семейным моментом, к которому хочется возвращаться снова и снова.',
        },
      ],
    },
    exampleStories: {
      title: 'Примеры волшебных историй',
      subtitle: 'Посмотрите примеры, чтобы оценить качество, тон и разнообразие историй, которые могут создавать семьи.',
      previewFallback: 'Просмотр',
      ageLabel: 'Возраст:',
      readingLabel: 'Чтение:',
      viewStoryCta: 'Открыть историю',
      allStoriesCta: 'Все истории',
      fallbackStories: [
        { age: '3–5 лет', title: 'Маленький строитель ракет', time: '5 мин', slug: '', thumbnailUrl: null },
        { age: '6–8 лет', title: 'Мила и лунный сад', time: '6 мин', slug: '', thumbnailUrl: null },
        { age: '4–7 лет', title: 'Бруно — храбрый бумажный дракон', time: '7 мин', slug: '', thumbnailUrl: null },
      ],
    },
    madeForChildren: {
      title: 'Создано для детей. Ценно для родителей.',
      subtitle: 'Более осмысленное экранное время — творческое, личное и такое, к которому хочется возвращаться.',
      cards: [
        {
          title: 'Личная история, а не одноразовый контент',
          desc: 'Каждая история особенная, потому что начинается с воображения вашего ребенка.',
          image: '/landing/personal-keepsake.png',
        },
        {
          title: 'Поддержка чтения и языкового развития',
          desc: 'Дети слушают, читают по тексту и наслаждаются историями на разных языках.',
          image: '/landing/reading-and-language.png',
        },
        {
          title: 'Идеально перед сном и для спокойных моментов',
          desc: 'Готовая сказка для ежедневных семейных ритуалов.',
          image: '/landing/bedtime-moments.png',
        },
        {
          title: 'Легко делиться с семьей',
          desc: 'Отправляйте ссылки на истории бабушкам, дедушкам и близким. Публикуйте в каталоге и получайте оценки читателей.',
          image: '/landing/share-with-family.png',
        },
      ],
    },
    featureGrid: {
      title: 'Все необходимое для волшебного времени со сказками',
      subtitle: 'Продумано для красивой, простой и многоразовой персонализированной сказки.',
      features: [
        {
          title: 'Голосовая озвучка',
          desc: 'Выразительная аудиоверсия: выбирайте голос под настроение — женский или мужской, звонкий или мягкий. Слушайте в дороге, перед сном или когда удобно.',
          image: '/landing/voice-narration.png',
        },
        {
          title: 'Текст для чтения вместе',
          desc: 'Слова подсвечиваются синхронно с озвучкой — ребенок следит глазами и естественно связывает звук с текстом. Как караоке для сказок.',
          image: '/landing/read-along-text.png',
        },
        {
          title: 'Адаптация по возрасту',
          desc: 'Сложность текста, длина предложений и абзацев согласованы с Lexile (MetaMetrics) — стандартом, которым пользуются школы и образовательные программы. Тон и лексика подстраиваются под возраст ребенка.',
          image: '/landing/age-adaptation.png',
        },
        {
          title: 'Серии с любимыми героями',
          desc: 'Любимые персонажи легко возвращаются в новых историях — ребенок с нетерпением ждет продолжения приключений своего героя.',
          image: '/landing/favorite-hero-series.png',
        },
        {
          title: 'Своя история от рисунка до сказки',
          desc: 'Ребенок становится автором собственной сказки — придумывает героя, выбирает приключение, делится с семьей и друзьями. Публикуйте в каталоге и получайте оценки читателей.',
          image: '/landing/draw-to-story.png',
        },
        {
          title: 'Несколько детских профилей',
          desc: 'Отдельный профиль для каждого ребенка — возраст, имя, интересы и настроение. Истории подстраиваются под конкретного ребенка.',
          image: '/landing/multiple-child-profiles.png',
        },
        {
          title: 'Иллюстрации в разных стилях',
          desc: 'Выберите стиль под настроение — акварель, пластилин, 3D-анимация, комикс или ночная сказка. Каждая история выглядит по-своему.',
          image: '/landing/illustration-styles.png',
        },
      ],
    },
    safety: {
      title: 'Безопасно для детей',
      subtitle: 'Каждая история проходит правила безопасности и задумана быть доброй, мягкой и подходящей по возрасту.',
      points: [
        'Счастливые концовки',
        'Без насилия и тревожного контента',
        'Адаптация под возраст ребенка',
        'Только дружелюбный, позитивный тон',
        'Семейные, безопасные темы',
      ],
    },
    voices: {
      title: 'Голоса для озвучки',
      subtitle:
        'Выбирайте голос для сказки — женский или мужской. Прослушайте перед созданием истории. Базовые голоса доступны всем. Премиум-голоса (Персей, Орион, Андромеда, Кассиопея) — для плана Fairy World.',
      previewAria: 'Прослушать',
      noSampleAria: 'Нет примера',
      fallbackVoices: [
        { id: 'lyra', name: 'lyra', displayName: 'Лира', sampleAudioUrl: null },
        { id: 'hydra', name: 'hydra', displayName: 'Гидра', sampleAudioUrl: null },
        { id: 'phoenix', name: 'phoenix', displayName: 'Феникс', sampleAudioUrl: null },
        { id: 'centaurus', name: 'centaurus', displayName: 'Кентавр', sampleAudioUrl: null },
      ],
    },
    multilingual: {
      title: 'Читай на одном языке, учись на другом',
      subtitle: 'WonderTales — это многоязычные истории для семей, где важны и воображение, и погружение в язык.',
      bullets: [
        'Создавайте истории на разных языках',
        'Читайте и слушайте естественно',
        'Идеально для двуязычных и многоязычных семей',
        'Отлично подходит для игрового изучения языка',
      ],
    },
    pricing: {
      title: 'Выберите план для вашей семьи',
      subtitle: 'Начните бесплатно, а потом откройте больше историй, озвучки, иллюстраций, комиксов и способов делиться.',
      reassurance: 'Переходите на более высокий план в любой момент, когда семья больше читает, слушает и создает.',
      cta: 'Планы и возможности',
      popularBadge: 'Самый популярный',
      perMonthSuffix: '/мес',
      fallbackPlans: {
        free: { name: 'Бесплатный', price: '0' },
        silver: { name: 'Серебряные мечты', price: '—' },
        golden: { name: 'Золотые звезды', price: '—' },
        fairyworld: { name: 'Сказочный мир', price: '—' },
      },
    },
    faq: {
      title: 'Частые вопросы',
      subtitle: 'Все, что родители обычно хотят знать перед началом.',
      cta: 'Создать первую историю сейчас',
      items: [
        {
          q: 'Почему WonderTales безопасен для детей?',
          a: 'Текст каждой сцены проверяется отдельно: WonderTales анализирует содержание на соответствие возрасту, безопасные темы и счастливую концовку. Если сцена не проходит проверку, сервис автоматически переписывает ее. Иллюстрации тоже проходят валидацию: WonderTales проверяет изображения на запрещенный контент и при необходимости создает замену. В WonderTales действуют строгие ограничения: без насилия, горя и травмирующих сцен; только дружелюбный и позитивный тон. Сложность текста согласована с Lexile, поэтому история остается понятной для выбранного возраста.',
        },
        {
          q: 'Можно ли использовать рисунок ребенка в истории?',
          a: 'Да. Загрузите рисунок, фотографию ребенка или любимого питомца — или опишите героя словами: WonderTales создаст персонажа по вашим заметкам. Есть быстрый режим: несколько фото, и WonderTales сам распознает лица, создаст героев и вплетет их в сюжет.',
        },
        {
          q: 'Нужно ли самому писать историю?',
          a: 'Нет. Вы выбираете возраст ребенка, тему, персонажей и язык. Можно задать мораль истории — дружба, смелость, помощь, безопасность на дороге — и добавить короткие заметки. WonderTales создает полноценную историю с диалогами, подробностями и выразительной кульминацией.',
        },
        {
          q: 'Сколько времени занимает создание истории?',
          a: 'Обычно 1–2 минуты. Вы видите прогресс в реальном времени: анализ фото, генерация текста, проверка безопасности и создание иллюстраций. Озвучку можно добавить позже отдельно.',
        },
        {
          q: 'Можно ли слушать историю в аудио?',
          a: 'Да. После создания истории можно сгенерировать выразительную озвучку с эмоциями. Доступны женские и мужские голоса с разными тембрами. Есть режим чтения вместе: слово подсвечивается синхронно с аудио, поэтому ребенку легче связывать звук и текст.',
        },
        {
          q: 'Можно ли создавать истории на разных языках?',
          a: 'Да. WonderTales поддерживает украинский, английский, немецкий, французский, испанский, польский и русский языки. Текст и озвучка создаются на выбранном языке. Это особенно удобно для семей, которые поддерживают двуязычие и хотят погружать ребенка в язык через знакомых персонажей и увлекательные сюжеты.',
        },
        {
          q: 'Есть ли бесплатный тариф?',
          a: 'Да. Можно начать бесплатно: несколько историй в месяц, одна аудиоистория и один профиль ребенка. Платные планы открывают больше историй, больше озвучки, несколько профилей детей и больше иллюстраций. <a href="/pricing">Подробности — на странице тарифов</a>.',
          allowHtml: true,
        },
        {
          q: 'Можно ли делиться историями с семьей?',
          a: 'Да. Опубликуйте историю публично или по приватной ссылке и отправьте ее бабушкам, дедушкам или друзьям. Опубликованные истории могут получать оценки и попадать в общий каталог примеров.',
        },
        {
          q: 'Какие есть стили иллюстраций?',
          a: 'Доступны акварель, карандаш, комикс, теплая 3D-анимация, ночная сказка, фетр, пластилин и аниме. Выбирайте стиль под настроение — и каждая история будет выглядеть по-своему.',
        },
        {
          q: 'Какой объем у истории?',
          a: 'Обычно это 5–11 сцен в зависимости от возраста: для младших детей истории короче, для старших — длиннее и глубже. WonderTales автоматически подстраивает длину под выбранный возраст.',
        },
      ],
    },
    finalCta: {
      title: 'Подарите ребенку радость стать героем собственной истории',
      subtitle: 'Рисунок, фото или описание — WonderTales создаст персонализированную историю за считанные минуты.',
      primaryCta: 'Создать первую историю бесплатно',
      secondaryCta: 'Посмотреть тарифы',
    },
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    metaTitle: 'WonderTales — Turn Your Child’s Drawing Into a Story Hero',
    metaDescription:
      'Create personalized stories with illustrations, narration, and read-along text. Safe, age-aware storytelling for families.',
    hero: {
      title: 'Turn your child’s drawing into a',
      highlight: 'magical story hero',
      subheadline:
        'Create personalized stories with beautiful illustrations, voice narration, and read-along text in minutes — safely and with age in mind.',
      imageAlt: 'A child’s drawing transforms into a story illustration',
      cta: 'Create your first story for free →',
    },
    trustChips: {
      safe: 'Safe for children',
      audio: 'Narration included',
      personalized: 'Personalized from drawings',
      languages: 'Multiple languages',
      ready: 'Ready in minutes',
    },
    whyFamiliesLove: {
      title: 'Why kids love WonderTales',
      subtitle:
        'More than a story generator: it is a magical experience children want to revisit and parents can feel good about.',
      cards: [
        {
          title: 'Their drawing comes to life',
          desc: 'Children see their own world inside the story, where their ideas and favorite heroes become real characters.',
          image: '/landing/draw-to-hero.png',
        },
        {
          title: 'Stories they want to replay',
          desc: 'Bright scenes, expressive narration, and read-along text make every story engaging from start to finish.',
          image: '/landing/listen-again.png',
        },
        {
          title: 'Stories that feel easy to follow and love',
          desc: 'The storytelling sounds natural, stays age-appropriate, and helps children follow the plot with ease.',
          image: '/landing/safe-by-age.png',
        },
        {
          title: 'A magical story appears fast',
          desc: 'Pick a hero, theme, and mood — or upload a few photos and let WonderTales build the characters for you. In just a few minutes your child can listen, read, and explore their own fairy tale.',
          image: '/landing/create-in-minutes.png',
        },
      ],
    },
    fromSketchToStory: {
      title: 'From drawing to story in one magical flow',
      subtitle: 'See how a simple sketch becomes a polished character and a fully personalized story.',
      steps: [
        {
          title: 'Add drawings, photos, or character ideas',
          desc: 'Upload child-made drawings, family photos, or simply describe the characters in words. WonderTales turns those ideas into living heroes your child will recognize and love.',
        },
        {
          title: 'Shape the story around your child',
          desc: 'Choose the language and theme: magic, space, mysteries, spooky adventures, and more. You can also set the moral, illustration style, and any special wishes. WonderTales weaves everything into something that feels truly personal.',
        },
        {
          title: 'Get a finished story with illustrations',
          desc: 'In minutes, WonderTales creates a complete story with beautiful scenes, a thoughtful arc, and memorable characters that make reading feel exciting and effortless.',
        },
        {
          title: 'Listen, read, and share together',
          desc: 'Turn on narration, read at your own pace, or share the story with family. It becomes more than content — it becomes a warm family moment worth repeating.',
        },
      ],
    },
    exampleStories: {
      title: 'Examples of magical stories',
      subtitle: 'Browse sample stories to get a feel for the quality, tone, and range families can create.',
      previewFallback: 'Preview',
      ageLabel: 'Age:',
      readingLabel: 'Reading:',
      viewStoryCta: 'View story',
      allStoriesCta: 'All stories',
      fallbackStories: [
        { age: '3–5 years', title: 'The Little Rocket Builder', time: '5 min', slug: '', thumbnailUrl: null },
        { age: '6–8 years', title: 'Mila and the Moon Garden', time: '6 min', slug: '', thumbnailUrl: null },
        { age: '4–7 years', title: 'Bruno the Brave Paper Dragon', time: '7 min', slug: '', thumbnailUrl: null },
      ],
    },
    madeForChildren: {
      title: 'Built for children. Valuable for parents.',
      subtitle: 'A more meaningful kind of screen time — creative, personal, and worth coming back to.',
      cards: [
        {
          title: 'A personal keepsake, not disposable content',
          desc: 'Each story feels special because it begins with your child’s imagination.',
          image: '/landing/personal-keepsake.png',
        },
        {
          title: 'Supports reading and language growth',
          desc: 'Children can listen, follow the text, and enjoy stories across multiple languages.',
          image: '/landing/reading-and-language.png',
        },
        {
          title: 'Perfect for bedtime and quiet moments',
          desc: 'A ready-made fairy tale for comforting daily family rituals.',
          image: '/landing/bedtime-moments.png',
        },
        {
          title: 'Easy to share with family',
          desc: 'Send story links to grandparents and relatives. Publish to the catalog and collect reader ratings.',
          image: '/landing/share-with-family.png',
        },
      ],
    },
    featureGrid: {
      title: 'Everything you need for magical story time',
      subtitle: 'Designed for a beautiful, simple, and reusable personalized storytelling experience.',
      features: [
        {
          title: 'Voice narration',
          desc: 'An expressive audio version with voices to match the mood — female or male, bright or gentle. Listen on the go, at bedtime, or whenever it fits.',
          image: '/landing/voice-narration.png',
        },
        {
          title: 'Read-along text',
          desc: 'Words highlight in sync with the narration, helping children connect sound and text naturally. Think karaoke for fairy tales.',
          image: '/landing/read-along-text.png',
        },
        {
          title: 'Age-aware adaptation',
          desc: 'Text complexity, sentence length, and paragraph length align with Lexile (MetaMetrics), a standard used by schools and learning programs. Tone and vocabulary adapt to your child’s age.',
          image: '/landing/age-adaptation.png',
        },
        {
          title: 'Series with favorite heroes',
          desc: 'Beloved characters can return again and again in new stories, giving children something to look forward to.',
          image: '/landing/favorite-hero-series.png',
        },
        {
          title: 'A story of their own from sketch to tale',
          desc: 'Children become authors of their own fairy tale — inventing heroes, choosing adventures, and sharing them with friends or family. Publish to the catalog and receive reader ratings.',
          image: '/landing/draw-to-story.png',
        },
        {
          title: 'Multiple child profiles',
          desc: 'Create a separate profile for each child with age, name, preferences, and mood. Stories adapt to the specific child they are made for.',
          image: '/landing/multiple-child-profiles.png',
        },
        {
          title: 'Illustrations in different styles',
          desc: 'Choose the look that matches the mood — watercolor, clay, 3D animation, comic, or night tale. Every story can feel visually distinct.',
          image: '/landing/illustration-styles.png',
        },
      ],
    },
    safety: {
      title: 'Safe for children',
      subtitle: 'Every story follows safety rules and is designed to feel warm, gentle, and appropriate for your child’s age.',
      points: [
        'Happy endings',
        'No violence or distressing content',
        'Adapted to your child’s age',
        'Friendly, positive tone only',
        'Family-friendly themes',
      ],
    },
    voices: {
      title: 'Narration voices',
      subtitle:
        'Choose a voice for the story — female or male. Preview it before you create. Standard voices are available to everyone. Premium voices (Perseus, Orion, Andromeda, Cassiopeia) come with the Fairy World plan.',
      previewAria: 'Preview voice',
      noSampleAria: 'No sample available',
      fallbackVoices: [
        { id: 'lyra', name: 'lyra', displayName: 'Lyra', sampleAudioUrl: null },
        { id: 'hydra', name: 'hydra', displayName: 'Hydra', sampleAudioUrl: null },
        { id: 'phoenix', name: 'phoenix', displayName: 'Phoenix', sampleAudioUrl: null },
        { id: 'centaurus', name: 'centaurus', displayName: 'Centaurus', sampleAudioUrl: null },
      ],
    },
    multilingual: {
      title: 'Read in one language, grow in another',
      subtitle: 'WonderTales brings multilingual stories to families who care about both imagination and language immersion.',
      bullets: [
        'Create stories in multiple languages',
        'Read and listen naturally',
        'Great for bilingual and multilingual families',
        'A playful way to support language learning',
      ],
    },
    pricing: {
      title: 'Choose the right plan for your family',
      subtitle: 'Start for free, then unlock more stories, narration, illustrations, comics, and sharing options as you grow.',
      reassurance: 'Upgrade anytime when your family wants to read, listen, and create more.',
      cta: 'Plans and features',
      popularBadge: 'Most popular',
      perMonthSuffix: '/mo',
      fallbackPlans: {
        free: { name: 'Free', price: '0' },
        silver: { name: 'Silver Dreams', price: '—' },
        golden: { name: 'Golden Stars', price: '—' },
        fairyworld: { name: 'Fairy World', price: '—' },
      },
    },
    faq: {
      title: 'Frequently asked questions',
      subtitle: 'Everything parents usually want to know before they begin.',
      cta: 'Create your first story now',
      items: [
        {
          q: 'Why is WonderTales safe for children?',
          a: 'Every scene is checked individually. WonderTales reviews the content for age fit, safe themes, and a positive ending. If a scene does not pass, it is automatically rewritten. Illustrations are also validated for prohibited content and replaced when needed. The platform is designed around clear limits: no violence, no grief-heavy scenes, and no traumatic material — only a warm, positive tone. Text complexity also follows Lexile-style expectations for the selected age range.',
        },
        {
          q: 'Can I use my child’s drawing in a story?',
          a: 'Yes. Upload a drawing, a photo of your child or pet, or simply describe the hero in words. WonderTales can turn those notes into a recognizable character. There is also a quick mode where several photos help WonderTales identify faces, build characters, and weave them into the plot.',
        },
        {
          q: 'Do I need to write the story myself?',
          a: 'No. You choose the child’s age, theme, characters, and language. You can also select a moral focus — friendship, courage, kindness, safety, and more — and add a few notes. WonderTales then creates a full story with sensory details, dialogue, and a satisfying ending.',
        },
        {
          q: 'How long does it take to create a story?',
          a: 'Usually 1–2 minutes. You can watch the progress in real time while photos are analyzed, the story is generated, safety checks run, and illustrations are created. Narration can be added later if you want.',
        },
        {
          q: 'Can we listen to the story as audio?',
          a: 'Yes. After the story is created, you can generate narration with expressive voices and emotional range. There is also a read-along mode where words highlight in sync with the audio, helping children connect sound and text more easily.',
        },
        {
          q: 'Can I create stories in different languages?',
          a: 'Yes. WonderTales supports Ukrainian, English, German, French, Spanish, Polish, and Russian. Both the story text and narration are generated in the language you choose, which makes it especially helpful for bilingual or multilingual families.',
        },
        {
          q: 'Is there a free plan?',
          a: 'Yes. You can start for free with a few stories per month, one audio story, and one child profile. Paid plans unlock more stories, more narration, more child profiles, and more illustrations. <a href="/pricing">See pricing for details</a>.',
          allowHtml: true,
        },
        {
          q: 'Can I share stories with family members?',
          a: 'Yes. Publish a story publicly or as a private link and send it to grandparents, relatives, or friends. Published stories can collect ratings and appear in the public catalog.',
        },
        {
          q: 'What illustration styles are available?',
          a: 'You can choose from watercolor, pencil, comic, warm 3D animation, night tale, felt, clay, and anime. Pick the visual mood that fits your story best.',
        },
        {
          q: 'How long is a typical story?',
          a: 'Most stories span 5 to 11 scenes depending on the selected age. Stories for younger children stay shorter, while older children get longer arcs and more depth.',
        },
      ],
    },
    finalCta: {
      title: 'Give your child the joy of becoming the hero of their own story',
      subtitle: 'A drawing, a photo, or a simple description — WonderTales can turn it into a personalized story in minutes.',
      primaryCta: 'Create your first story for free',
      secondaryCta: 'View pricing',
    },
  },
  es: {
    htmlLang: 'es',
    ogLocale: 'es_ES',
    metaTitle: 'WonderTales — convierte el dibujo de tu hijo en un héroe de cuento',
    metaDescription:
      'Crea historias personalizadas con ilustraciones, narración y texto para leer juntos. Seguras, adaptadas por edad y pensadas para familias.',
    hero: {
      title: 'Convierte el dibujo de tu hijo en un',
      highlight: 'héroe mágico de cuento',
      subheadline:
        'Crea historias personalizadas con ilustraciones preciosas, narración en voz y texto para seguir leyendo en pocos minutos, de forma segura y adaptada a la edad.',
      imageAlt: 'Un dibujo infantil se transforma en una ilustración de cuento',
      cta: 'Crear la primera historia gratis →',
    },
    trustChips: {
      safe: 'Seguro para niños',
      audio: 'Narración incluida',
      personalized: 'Personalizado a partir de dibujos',
      languages: 'Varios idiomas',
      ready: 'Listo en minutos',
    },
    whyFamiliesLove: {
      title: 'Por qué los niños aman WonderTales',
      subtitle:
        'Es mucho más que un generador de historias: es una experiencia mágica a la que los niños quieren volver y que da tranquilidad a las familias.',
      cards: [
        {
          title: 'Su dibujo cobra vida',
          desc: 'El niño ve su propio mundo dentro del cuento: sus ideas y personajes favoritos se convierten en héroes reales.',
          image: '/landing/draw-to-hero.png',
        },
        {
          title: 'Historias que quieren escuchar otra vez',
          desc: 'Escenas llenas de color, una narración expresiva y texto sincronizado hacen que cada historia sea envolvente de principio a fin.',
          image: '/landing/listen-again.png',
        },
        {
          title: 'Cuentos fáciles de seguir y de amar',
          desc: 'Las historias suenan naturales, son adecuadas para la edad y ayudan al niño a seguir la aventura con facilidad.',
          image: '/landing/safe-by-age.png',
        },
        {
          title: 'La historia mágica aparece muy rápido',
          desc: 'Elige un héroe, un tema y un ambiente, o sube unas fotos y deja que WonderTales cree los personajes. En pocos minutos tu hijo ya podrá escuchar, leer y explorar su propio cuento.',
          image: '/landing/create-in-minutes.png',
        },
      ],
    },
    fromSketchToStory: {
      title: 'Del dibujo al cuento en un solo proceso mágico',
      subtitle: 'Descubre cómo un simple boceto se convierte en un personaje completo y en una historia totalmente personalizada.',
      steps: [
        {
          title: 'Añade dibujos, fotos o ideas de personajes',
          desc: 'Sube dibujos infantiles, fotos familiares o simplemente describe a los personajes con palabras. WonderTales transforma esas ideas en héroes vivos que tu hijo reconocerá y querrá volver a ver.',
        },
        {
          title: 'Adapta el cuento a tu hijo',
          desc: 'Elige idioma y tema: magia, espacio, misterios, sustos suaves y mucho más. También puedes indicar la moraleja, el estilo visual y deseos especiales. WonderTales lo combina todo en una historia verdaderamente personal.',
        },
        {
          title: 'Recibe un cuento completo con ilustraciones',
          desc: 'En pocos minutos WonderTales crea una historia completa con escenas hermosas, una trama cuidada y personajes memorables para que leer resulte emocionante y fácil.',
        },
        {
          title: 'Escucha, lee y comparte juntos',
          desc: 'Activa la narración, lee a tu ritmo o comparte la historia con la familia. Deja de ser solo contenido y se convierte en un momento familiar al que apetece volver.',
        },
      ],
    },
    exampleStories: {
      title: 'Ejemplos de historias mágicas',
      subtitle: 'Explora historias de muestra para sentir la calidad, el tono y la variedad que pueden crear las familias.',
      previewFallback: 'Vista previa',
      ageLabel: 'Edad:',
      readingLabel: 'Lectura:',
      viewStoryCta: 'Ver historia',
      allStoriesCta: 'Todas las historias',
      fallbackStories: [
        { age: '3–5 años', title: 'El pequeño constructor de cohetes', time: '5 min', slug: '', thumbnailUrl: null },
        { age: '6–8 años', title: 'Mila y el jardín lunar', time: '6 min', slug: '', thumbnailUrl: null },
        { age: '4–7 años', title: 'Bruno, el valiente dragón de papel', time: '7 min', slug: '', thumbnailUrl: null },
      ],
    },
    madeForChildren: {
      title: 'Hecho para niños. Valioso para las familias.',
      subtitle: 'Un tiempo de pantalla más significativo: creativo, personal y digno de repetirse.',
      cards: [
        {
          title: 'Un recuerdo personal, no contenido desechable',
          desc: 'Cada historia se siente especial porque nace de la imaginación de tu hijo.',
          image: '/landing/personal-keepsake.png',
        },
        {
          title: 'Apoya la lectura y el desarrollo del lenguaje',
          desc: 'Los niños pueden escuchar, seguir el texto y disfrutar historias en varios idiomas.',
          image: '/landing/reading-and-language.png',
        },
        {
          title: 'Perfecto para dormir y para momentos tranquilos',
          desc: 'Un cuento listo para acompañar los rituales familiares del día a día.',
          image: '/landing/bedtime-moments.png',
        },
        {
          title: 'Fácil de compartir con la familia',
          desc: 'Envía enlaces a abuelos y seres queridos. Publica en el catálogo y recibe valoraciones de lectores.',
          image: '/landing/share-with-family.png',
        },
      ],
    },
    featureGrid: {
      title: 'Todo lo necesario para un momento mágico de lectura',
      subtitle: 'Diseñado para una experiencia de cuentos personalizada, bonita, simple y reutilizable.',
      features: [
        {
          title: 'Narración en voz',
          desc: 'Una versión de audio expresiva con voces que encajan con el ambiente: femenina o masculina, suave o brillante. Escúchala de camino, antes de dormir o cuando quieras.',
          image: '/landing/voice-narration.png',
        },
        {
          title: 'Texto para leer juntos',
          desc: 'Las palabras se iluminan al ritmo de la narración y ayudan al niño a relacionar de forma natural el sonido con el texto. Como karaoke para cuentos.',
          image: '/landing/read-along-text.png',
        },
        {
          title: 'Adaptación por edad',
          desc: 'La complejidad del texto, la longitud de las frases y los párrafos se alinean con Lexile (MetaMetrics), un estándar utilizado en escuelas y programas educativos. El tono y el vocabulario se ajustan a la edad del niño.',
          image: '/landing/age-adaptation.png',
        },
        {
          title: 'Series con héroes favoritos',
          desc: 'Los personajes preferidos pueden volver una y otra vez en nuevas historias, creando expectativa por la próxima aventura.',
          image: '/landing/favorite-hero-series.png',
        },
        {
          title: 'Una historia propia, del dibujo al cuento',
          desc: 'El niño se convierte en autor de su propio cuento: inventa héroes, elige aventuras y las comparte con familia o amigos. Publica en el catálogo y recibe valoraciones.',
          image: '/landing/draw-to-story.png',
        },
        {
          title: 'Varios perfiles infantiles',
          desc: 'Crea un perfil distinto para cada niño con su edad, nombre, intereses y estado de ánimo. Las historias se adaptan a quien van dirigidas.',
          image: '/landing/multiple-child-profiles.png',
        },
        {
          title: 'Ilustraciones en distintos estilos',
          desc: 'Elige el estilo visual según el ambiente: acuarela, plastilina, animación 3D, cómic o cuento nocturno. Cada historia puede verse diferente.',
          image: '/landing/illustration-styles.png',
        },
      ],
    },
    safety: {
      title: 'Seguro para niños',
      subtitle: 'Cada historia sigue reglas de seguridad y está pensada para ser amable, luminosa y adecuada para la edad.',
      points: [
        'Finales felices',
        'Sin violencia ni contenido inquietante',
        'Adaptado a la edad del niño',
        'Solo un tono amable y positivo',
        'Temas familiares y seguros',
      ],
    },
    voices: {
      title: 'Voces de narración',
      subtitle:
        'Elige una voz para el cuento, femenina o masculina. Puedes escucharla antes de crear la historia. Las voces estándar están disponibles para todos. Las voces premium (Perseo, Orión, Andrómeda, Casiopea) forman parte del plan Fairy World.',
      previewAria: 'Escuchar muestra',
      noSampleAria: 'Sin muestra disponible',
      fallbackVoices: [
        { id: 'lyra', name: 'lyra', displayName: 'Lyra', sampleAudioUrl: null },
        { id: 'hydra', name: 'hydra', displayName: 'Hydra', sampleAudioUrl: null },
        { id: 'phoenix', name: 'phoenix', displayName: 'Phoenix', sampleAudioUrl: null },
        { id: 'centaurus', name: 'centaurus', displayName: 'Centaurus', sampleAudioUrl: null },
      ],
    },
    multilingual: {
      title: 'Lee en un idioma y crece en otro',
      subtitle: 'WonderTales ofrece historias multilingües para familias que valoran tanto la imaginación como la inmersión lingüística.',
      bullets: [
        'Crea historias en varios idiomas',
        'Lee y escucha de forma natural',
        'Ideal para familias bilingües y multilingües',
        'Una forma lúdica de apoyar el aprendizaje de idiomas',
      ],
    },
    pricing: {
      title: 'Elige el plan ideal para tu familia',
      subtitle: 'Empieza gratis y desbloquea más historias, narración, ilustraciones, cómics y opciones para compartir a medida que creces.',
      reassurance: 'Cambia de plan cuando tu familia quiera leer, escuchar y crear más.',
      cta: 'Planes y funciones',
      popularBadge: 'Más popular',
      perMonthSuffix: '/mes',
      fallbackPlans: {
        free: { name: 'Gratis', price: '0' },
        silver: { name: 'Sueños de Plata', price: '—' },
        golden: { name: 'Estrellas Doradas', price: '—' },
        fairyworld: { name: 'Mundo de Hadas', price: '—' },
      },
    },
    faq: {
      title: 'Preguntas frecuentes',
      subtitle: 'Todo lo que las familias suelen querer saber antes de empezar.',
      cta: 'Crear la primera historia ahora',
      items: [
        {
          q: '¿Por qué WonderTales es seguro para niños?',
          a: 'Cada escena se revisa por separado. WonderTales comprueba si el contenido es adecuado para la edad, si trata temas seguros y si termina de forma positiva. Si una escena no supera el control, se reescribe automáticamente. Las ilustraciones también se validan para detectar contenido prohibido y se sustituyen si hace falta. La plataforma está diseñada con límites claros: sin violencia, sin escenas traumáticas y siempre con un tono amable y positivo.',
        },
        {
          q: '¿Puedo usar el dibujo de mi hijo en una historia?',
          a: 'Sí. Puedes subir un dibujo, una foto del niño o de su mascota, o describir al personaje con palabras. WonderTales convierte esas referencias en un héroe reconocible. También existe un modo rápido que usa varias fotos para identificar rostros y construir personajes.',
        },
        {
          q: '¿Tengo que escribir la historia yo mismo?',
          a: 'No. Tú eliges la edad del niño, el tema, los personajes y el idioma. También puedes indicar la moraleja y añadir unas notas. Después WonderTales crea una historia completa con detalles sensoriales, diálogos y un final satisfactorio.',
        },
        {
          q: '¿Cuánto tarda en crearse una historia?',
          a: 'Normalmente entre 1 y 2 minutos. Puedes ver el progreso en tiempo real mientras se analizan las imágenes, se genera el texto, se aplican los controles de seguridad y se crean las ilustraciones.',
        },
        {
          q: '¿Podemos escuchar la historia en audio?',
          a: 'Sí. Una vez creada la historia puedes generar una narración expresiva con voces diferentes. También hay un modo de lectura acompañada donde las palabras se iluminan al ritmo del audio para ayudar a relacionar sonido y texto.',
        },
        {
          q: '¿Puedo crear historias en distintos idiomas?',
          a: 'Sí. WonderTales es compatible con ucraniano, inglés, alemán, francés, español, polaco y ruso. Tanto el texto como la narración se generan en el idioma que elijas, lo que resulta muy útil para familias bilingües o multilingües.',
        },
        {
          q: '¿Existe un plan gratuito?',
          a: 'Sí. Puedes empezar gratis con varias historias al mes, una historia con audio y un perfil infantil. Los planes de pago abren más historias, más narración, más perfiles y más ilustraciones. <a href="/pricing">Consulta la página de precios</a>.',
          allowHtml: true,
        },
        {
          q: '¿Puedo compartir historias con la familia?',
          a: 'Sí. Puedes publicar una historia de forma pública o compartirla con un enlace privado para enviarla a abuelos, familiares o amigos. Las historias públicas pueden recibir valoraciones y aparecer en el catálogo.',
        },
        {
          q: '¿Qué estilos de ilustración hay?',
          a: 'Puedes elegir entre acuarela, lápiz, cómic, animación 3D cálida, cuento nocturno, fieltro, plastilina y anime. Elige el estilo que mejor encaje con el ambiente de tu historia.',
        },
        {
          q: '¿Cuánto suele durar una historia?',
          a: 'La mayoría de las historias tienen entre 5 y 11 escenas según la edad seleccionada. Las historias para niños más pequeños son más breves y las de niños mayores tienen más recorrido.',
        },
      ],
    },
    finalCta: {
      title: 'Regálale a tu hijo la alegría de ser el héroe de su propia historia',
      subtitle: 'Un dibujo, una foto o una breve descripción: WonderTales puede convertirlo en una historia personalizada en minutos.',
      primaryCta: 'Crear la primera historia gratis',
      secondaryCta: 'Ver precios',
    },
  },
  de: {
    htmlLang: 'de',
    ogLocale: 'de_DE',
    metaTitle: 'WonderTales — verwandle die Zeichnung deines Kindes in einen Märchenhelden',
    metaDescription:
      'Erstelle personalisierte Geschichten mit Illustrationen, Erzählstimme und Mitlesetext. Sicher, altersgerecht und für Familien gemacht.',
    hero: {
      title: 'Verwandle die Zeichnung deines Kindes in einen',
      highlight: 'magischen Märchenhelden',
      subheadline:
        'Erstelle personalisierte Geschichten mit wunderschönen Illustrationen, Erzählstimme und Mitlesetext in wenigen Minuten — sicher und altersgerecht.',
      imageAlt: 'Eine Kinderzeichnung verwandelt sich in eine Märchenillustration',
      cta: 'Erste Geschichte kostenlos erstellen →',
    },
    trustChips: {
      safe: 'Sicher für Kinder',
      audio: 'Erzählstimme inklusive',
      personalized: 'Personalisiert aus Zeichnungen',
      languages: 'Mehrere Sprachen',
      ready: 'In Minuten fertig',
    },
    whyFamiliesLove: {
      title: 'Warum Kinder WonderTales lieben',
      subtitle:
        'Mehr als ein Geschichtengenerator: ein magisches Erlebnis, zu dem Kinder gern zurückkehren und bei dem Eltern sich sicher fühlen.',
      cards: [
        {
          title: 'Die Zeichnung wird lebendig',
          desc: 'Kinder sehen ihre eigene Welt in der Geschichte wieder: ihre Ideen und Lieblingshelden werden zu echten Figuren.',
          image: '/landing/draw-to-hero.png',
        },
        {
          title: 'Geschichten, die sie immer wieder hören möchten',
          desc: 'Leuchtende Szenen, ausdrucksstarke Stimmen und Mitlesetext machen jede Geschichte von Anfang bis Ende fesselnd.',
          image: '/landing/listen-again.png',
        },
        {
          title: 'Geschichten, die leicht zu verstehen und zu lieben sind',
          desc: 'Die Sprache klingt natürlich, bleibt altersgerecht und hilft Kindern, der Handlung mühelos zu folgen.',
          image: '/landing/safe-by-age.png',
        },
        {
          title: 'Eine magische Geschichte entsteht schnell',
          desc: 'Wähle Held, Thema und Stimmung — oder lade ein paar Fotos hoch und lasse WonderTales die Figuren erstellen. Schon nach kurzer Zeit kann dein Kind die eigene Geschichte lesen, hören und entdecken.',
          image: '/landing/create-in-minutes.png',
        },
      ],
    },
    fromSketchToStory: {
      title: 'Von der Zeichnung zur Geschichte in einem magischen Ablauf',
      subtitle: 'Sieh, wie aus einer einfachen Skizze eine ausgearbeitete Figur und eine vollständig personalisierte Geschichte wird.',
      steps: [
        {
          title: 'Füge Zeichnungen, Fotos oder Figurenideen hinzu',
          desc: 'Lade Kinderzeichnungen, Familienfotos hoch oder beschreibe Figuren einfach in Worten. WonderTales verwandelt diese Ideen in lebendige Heldinnen und Helden, die dein Kind wiedererkennt und liebt.',
        },
        {
          title: 'Passe die Geschichte an dein Kind an',
          desc: 'Wähle Sprache und Thema: Magie, Weltraum, Detektivabenteuer, sanfter Grusel und mehr. Du kannst außerdem die Botschaft, den Illustrationsstil und besondere Wünsche festlegen. WonderTales verbindet alles zu einer Geschichte, die sich wirklich persönlich anfühlt.',
        },
        {
          title: 'Erhalte eine fertige Geschichte mit Illustrationen',
          desc: 'In wenigen Minuten erstellt WonderTales eine vollständige Geschichte mit schönen Szenen, klarem Spannungsbogen und einprägsamen Figuren.',
        },
        {
          title: 'Zusammen hören, lesen und teilen',
          desc: 'Aktiviere die Erzählstimme, lies im eigenen Tempo oder teile die Geschichte mit der Familie. So wird daraus mehr als nur Inhalt — nämlich ein warmer Familienmoment.',
        },
      ],
    },
    exampleStories: {
      title: 'Beispiele für magische Geschichten',
      subtitle: 'Schau dir Beispielgeschichten an, um Qualität, Tonalität und Vielfalt zu erleben.',
      previewFallback: 'Vorschau',
      ageLabel: 'Alter:',
      readingLabel: 'Lesedauer:',
      viewStoryCta: 'Geschichte ansehen',
      allStoriesCta: 'Alle Geschichten',
      fallbackStories: [
        { age: '3–5 Jahre', title: 'Der kleine Raketenbauer', time: '5 Min.', slug: '', thumbnailUrl: null },
        { age: '6–8 Jahre', title: 'Mila und der Mondgarten', time: '6 Min.', slug: '', thumbnailUrl: null },
        { age: '4–7 Jahre', title: 'Bruno, der mutige Papierdrache', time: '7 Min.', slug: '', thumbnailUrl: null },
      ],
    },
    madeForChildren: {
      title: 'Für Kinder gemacht. Für Eltern wertvoll.',
      subtitle: 'Eine sinnvollere Form von Bildschirmzeit — kreativ, persönlich und es lohnt sich, immer wieder dazu zurückzukehren.',
      cards: [
        {
          title: 'Ein persönliches Andenken statt Wegwerf-Inhalt',
          desc: 'Jede Geschichte fühlt sich besonders an, weil sie mit der Fantasie deines Kindes beginnt.',
          image: '/landing/personal-keepsake.png',
        },
        {
          title: 'Unterstützt Lesen und Sprachentwicklung',
          desc: 'Kinder können zuhören, mitlesen und Geschichten in mehreren Sprachen genießen.',
          image: '/landing/reading-and-language.png',
        },
        {
          title: 'Perfekt für die Schlafenszeit und ruhige Momente',
          desc: 'Ein fertiges Märchen für liebevolle Familienrituale im Alltag.',
          image: '/landing/bedtime-moments.png',
        },
        {
          title: 'Leicht mit der Familie zu teilen',
          desc: 'Sende Links an Großeltern und Verwandte. Veröffentliche im Katalog und sammle Bewertungen von Leserinnen und Lesern.',
          image: '/landing/share-with-family.png',
        },
      ],
    },
    featureGrid: {
      title: 'Alles für eine magische Vorlesezeit',
      subtitle: 'Entwickelt für ein schönes, einfaches und wiederverwendbares personalisiertes Geschichtenerlebnis.',
      features: [
        {
          title: 'Erzählstimme',
          desc: 'Eine ausdrucksstarke Audioversion mit Stimmen passend zur Stimmung — weiblich oder männlich, klar oder sanft. Perfekt für unterwegs, vor dem Schlafengehen oder zwischendurch.',
          image: '/landing/voice-narration.png',
        },
        {
          title: 'Mitlesetext',
          desc: 'Die Wörter werden synchron zur Stimme hervorgehoben und helfen Kindern, Klang und Schrift natürlich zu verbinden. Wie Karaoke für Märchen.',
          image: '/landing/read-along-text.png',
        },
        {
          title: 'Altersgerechte Anpassung',
          desc: 'Textschwierigkeit, Satzlänge und Absatzstruktur orientieren sich an Lexile (MetaMetrics), einem Standard aus Schule und Bildung. Ton und Wortschatz passen sich dem Alter deines Kindes an.',
          image: '/landing/age-adaptation.png',
        },
        {
          title: 'Serien mit Lieblingshelden',
          desc: 'Geliebte Figuren können in neuen Geschichten immer wieder auftauchen und machen Lust auf das nächste Abenteuer.',
          image: '/landing/favorite-hero-series.png',
        },
        {
          title: 'Die eigene Geschichte — von der Zeichnung zum Märchen',
          desc: 'Kinder werden zu Autorinnen und Autoren ihrer eigenen Geschichte: Sie erfinden Figuren, wählen Abenteuer und teilen sie mit Familie und Freunden. Veröffentliche im Katalog und sammle Bewertungen.',
          image: '/landing/draw-to-story.png',
        },
        {
          title: 'Mehrere Kinderprofile',
          desc: 'Lege für jedes Kind ein eigenes Profil mit Alter, Namen, Vorlieben und Stimmung an. Geschichten passen sich genau dem Kind an, für das sie gedacht sind.',
          image: '/landing/multiple-child-profiles.png',
        },
        {
          title: 'Illustrationen in verschiedenen Stilen',
          desc: 'Wähle den Look passend zur Stimmung — Aquarell, Knete, 3D-Animation, Comic oder Nachtmärchen. So kann jede Geschichte visuell anders wirken.',
          image: '/landing/illustration-styles.png',
        },
      ],
    },
    safety: {
      title: 'Sicher für Kinder',
      subtitle: 'Jede Geschichte folgt Sicherheitsregeln und ist warm, sanft und altersgerecht gestaltet.',
      points: [
        'Glückliche Enden',
        'Keine Gewalt oder belastenden Inhalte',
        'An das Alter des Kindes angepasst',
        'Nur ein freundlicher, positiver Ton',
        'Familienfreundliche Themen',
      ],
    },
    voices: {
      title: 'Erzählstimmen',
      subtitle:
        'Wähle eine Stimme für die Geschichte — weiblich oder männlich. Du kannst sie vorab anhören. Standardstimmen stehen allen zur Verfügung. Premium-Stimmen (Perseus, Orion, Andromeda, Kassiopeia) gehören zum Fairy-World-Tarif.',
      previewAria: 'Stimme anhören',
      noSampleAria: 'Keine Hörprobe verfügbar',
      fallbackVoices: [
        { id: 'lyra', name: 'lyra', displayName: 'Lyra', sampleAudioUrl: null },
        { id: 'hydra', name: 'hydra', displayName: 'Hydra', sampleAudioUrl: null },
        { id: 'phoenix', name: 'phoenix', displayName: 'Phoenix', sampleAudioUrl: null },
        { id: 'centaurus', name: 'centaurus', displayName: 'Centaurus', sampleAudioUrl: null },
      ],
    },
    multilingual: {
      title: 'In einer Sprache lesen, in einer anderen wachsen',
      subtitle: 'WonderTales bringt mehrsprachige Geschichten in Familien, denen Fantasie und Sprachbad gleichermaßen wichtig sind.',
      bullets: [
        'Erstelle Geschichten in mehreren Sprachen',
        'Natürlich lesen und hören',
        'Ideal für zwei- und mehrsprachige Familien',
        'Eine spielerische Unterstützung beim Sprachenlernen',
      ],
    },
    pricing: {
      title: 'Wähle den passenden Tarif für deine Familie',
      subtitle: 'Starte kostenlos und schalte später mehr Geschichten, Stimmen, Illustrationen, Comics und Freigabeoptionen frei.',
      reassurance: 'Wechsle jederzeit zu einem größeren Tarif, wenn deine Familie mehr lesen, hören und erstellen möchte.',
      cta: 'Tarife und Funktionen',
      popularBadge: 'Am beliebtesten',
      perMonthSuffix: '/Monat',
      fallbackPlans: {
        free: { name: 'Kostenlos', price: '0' },
        silver: { name: 'Silberträume', price: '—' },
        golden: { name: 'Goldene Sterne', price: '—' },
        fairyworld: { name: 'Märchenwelt', price: '—' },
      },
    },
    faq: {
      title: 'Häufige Fragen',
      subtitle: 'Alles, was Eltern vor dem Start normalerweise wissen möchten.',
      cta: 'Jetzt die erste Geschichte erstellen',
      items: [
        {
          q: 'Warum ist WonderTales sicher für Kinder?',
          a: 'Jede Szene wird einzeln geprüft. WonderTales bewertet, ob Inhalt, Thema und Ende altersgerecht und positiv sind. Wenn etwas nicht passt, wird die Szene automatisch überarbeitet. Auch Illustrationen werden auf unerwünschte Inhalte geprüft und bei Bedarf ersetzt. Die Plattform setzt klare Grenzen: keine Gewalt, keine traumatischen Inhalte und immer ein freundlicher Ton.',
        },
        {
          q: 'Kann ich die Zeichnung meines Kindes in einer Geschichte verwenden?',
          a: 'Ja. Du kannst eine Zeichnung, ein Foto deines Kindes oder Haustiers hochladen oder die Figur einfach beschreiben. WonderTales erstellt daraus einen wiedererkennbaren Helden. Im Schnellmodus helfen mehrere Fotos dabei, Gesichter zu erkennen und Figuren aufzubauen.',
        },
        {
          q: 'Muss ich die Geschichte selbst schreiben?',
          a: 'Nein. Du wählst Alter, Thema, Figuren und Sprache. Zusätzlich kannst du eine Botschaft wie Freundschaft, Mut oder Freundlichkeit festlegen und kurze Notizen ergänzen. Anschließend erstellt WonderTales eine vollständige Geschichte mit Dialogen und einem befriedigenden Abschluss.',
        },
        {
          q: 'Wie lange dauert es, eine Geschichte zu erstellen?',
          a: 'Meist 1–2 Minuten. Du siehst live, wie Bilder analysiert, Text erzeugt, Sicherheitsprüfungen durchgeführt und Illustrationen erstellt werden.',
        },
        {
          q: 'Kann man die Geschichte auch als Audio hören?',
          a: 'Ja. Nach der Erstellung kannst du eine gesprochene Version mit ausdrucksstarken Stimmen erzeugen. Es gibt auch einen Mitlesemodus, in dem Wörter synchron zur Stimme hervorgehoben werden.',
        },
        {
          q: 'Kann ich Geschichten in verschiedenen Sprachen erstellen?',
          a: 'Ja. WonderTales unterstützt Ukrainisch, Englisch, Deutsch, Französisch, Spanisch, Polnisch und Russisch. Sowohl Text als auch Erzählstimme werden in der ausgewählten Sprache erstellt.',
        },
        {
          q: 'Gibt es einen kostenlosen Tarif?',
          a: 'Ja. Du kannst kostenlos starten und bekommst einige Geschichten pro Monat, eine Audiogeschichte und ein Kinderprofil. Bezahlte Tarife bieten mehr Geschichten, mehr Stimmen, mehr Profile und mehr Illustrationen. <a href="/pricing">Mehr dazu auf der Tarifseite</a>.',
          allowHtml: true,
        },
        {
          q: 'Kann ich Geschichten mit der Familie teilen?',
          a: 'Ja. Veröffentliche eine Geschichte öffentlich oder teile sie per privatem Link mit Großeltern, Verwandten oder Freunden. Öffentliche Geschichten können bewertet werden und im Katalog erscheinen.',
        },
        {
          q: 'Welche Illustrationsstile gibt es?',
          a: 'Zur Auswahl stehen Aquarell, Bleistift, Comic, warme 3D-Animation, Nachtmärchen, Filz, Knete und Anime. Wähle den Stil, der am besten zur Stimmung deiner Geschichte passt.',
        },
        {
          q: 'Wie lang ist eine typische Geschichte?',
          a: 'Die meisten Geschichten bestehen je nach Alter aus 5 bis 11 Szenen. Für jüngere Kinder bleiben sie kürzer, für ältere Kinder werden sie länger und ausführlicher.',
        },
      ],
    },
    finalCta: {
      title: 'Schenke deinem Kind die Freude, selbst die Hauptfigur der eigenen Geschichte zu sein',
      subtitle: 'Eine Zeichnung, ein Foto oder eine kurze Beschreibung genügt — WonderTales macht daraus in Minuten eine personalisierte Geschichte.',
      primaryCta: 'Die erste Geschichte kostenlos erstellen',
      secondaryCta: 'Preise ansehen',
    },
  },
  fr: {
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    metaTitle: 'WonderTales — transformez le dessin de votre enfant en héros de conte',
    metaDescription:
      'Créez des histoires personnalisées avec illustrations, narration et texte à lire ensemble. Une expérience sûre, adaptée à l’âge et pensée pour les familles.',
    hero: {
      title: 'Transformez le dessin de votre enfant en',
      highlight: 'héros magique de conte',
      subheadline:
        'Créez en quelques minutes des histoires personnalisées avec de belles illustrations, une narration audio et un texte à suivre, en toute sécurité et selon l’âge.',
      imageAlt: 'Un dessin d’enfant se transforme en illustration de conte',
      cta: 'Créer la première histoire gratuitement →',
    },
    trustChips: {
      safe: 'Sûr pour les enfants',
      audio: 'Narration incluse',
      personalized: 'Personnalisé à partir des dessins',
      languages: 'Plusieurs langues',
      ready: 'Prêt en quelques minutes',
    },
    whyFamiliesLove: {
      title: 'Pourquoi les enfants adorent WonderTales',
      subtitle:
        'Bien plus qu’un générateur d’histoires : une expérience magique à laquelle les enfants veulent revenir et qui rassure les parents.',
      cards: [
        {
          title: 'Leur dessin prend vie',
          desc: 'L’enfant retrouve son propre univers dans l’histoire : ses idées et ses héros préférés deviennent de vrais personnages.',
          image: '/landing/draw-to-hero.png',
        },
        {
          title: 'Des histoires qu’ils veulent réécouter',
          desc: 'Des scènes lumineuses, une narration expressive et un texte synchronisé rendent chaque histoire captivante du début à la fin.',
          image: '/landing/listen-again.png',
        },
        {
          title: 'Des récits faciles à suivre et à aimer',
          desc: 'Le ton est naturel, adapté à l’âge et aide l’enfant à suivre l’intrigue avec aisance.',
          image: '/landing/safe-by-age.png',
        },
        {
          title: 'Une histoire magique apparaît très vite',
          desc: 'Choisissez un héros, un thème et une ambiance, ou téléversez quelques photos et laissez WonderTales créer les personnages. En quelques minutes, votre enfant peut déjà écouter, lire et explorer son propre conte.',
          image: '/landing/create-in-minutes.png',
        },
      ],
    },
    fromSketchToStory: {
      title: 'Du dessin au conte dans un seul parcours magique',
      subtitle: 'Découvrez comment un simple croquis devient un personnage abouti et une histoire entièrement personnalisée.',
      steps: [
        {
          title: 'Ajoutez des dessins, des photos ou des idées de personnages',
          desc: 'Téléversez des dessins d’enfant, des photos de famille ou décrivez simplement vos personnages avec des mots. WonderTales transforme ces idées en héros vivants que votre enfant reconnaîtra et aimera.',
        },
        {
          title: 'Adaptez l’histoire à votre enfant',
          desc: 'Choisissez la langue et le thème : magie, espace, mystères, frissons doux et bien plus. Vous pouvez aussi définir la morale, le style d’illustration et vos souhaits particuliers. WonderTales rassemble le tout dans une histoire vraiment personnelle.',
        },
        {
          title: 'Recevez une histoire complète avec illustrations',
          desc: 'En quelques minutes, WonderTales crée une histoire complète avec de belles scènes, une progression soignée et des personnages mémorables.',
        },
        {
          title: 'Écoutez, lisez et partagez ensemble',
          desc: 'Activez la narration, lisez à votre rythme ou partagez l’histoire avec la famille. Cela devient plus qu’un contenu : un vrai moment chaleureux à revivre.',
        },
      ],
    },
    exampleStories: {
      title: 'Exemples d’histoires magiques',
      subtitle: 'Parcourez quelques exemples pour découvrir la qualité, le ton et la variété des histoires possibles.',
      previewFallback: 'Aperçu',
      ageLabel: 'Âge :',
      readingLabel: 'Lecture :',
      viewStoryCta: 'Voir l’histoire',
      allStoriesCta: 'Toutes les histoires',
      fallbackStories: [
        { age: '3–5 ans', title: 'Le petit constructeur de fusées', time: '5 min', slug: '', thumbnailUrl: null },
        { age: '6–8 ans', title: 'Mila et le jardin lunaire', time: '6 min', slug: '', thumbnailUrl: null },
        { age: '4–7 ans', title: 'Bruno, le brave dragon en papier', time: '7 min', slug: '', thumbnailUrl: null },
      ],
    },
    madeForChildren: {
      title: 'Conçu pour les enfants. Précieux pour les parents.',
      subtitle: 'Un temps d’écran plus riche de sens : créatif, personnel et agréable à retrouver.',
      cards: [
        {
          title: 'Un souvenir personnel, pas un contenu jetable',
          desc: 'Chaque histoire se sent spéciale parce qu’elle naît de l’imagination de votre enfant.',
          image: '/landing/personal-keepsake.png',
        },
        {
          title: 'Soutient la lecture et le développement du langage',
          desc: 'Les enfants peuvent écouter, suivre le texte et profiter d’histoires dans plusieurs langues.',
          image: '/landing/reading-and-language.png',
        },
        {
          title: 'Parfait pour le coucher et les moments calmes',
          desc: 'Un conte prêt à accompagner les rituels familiaux du quotidien.',
          image: '/landing/bedtime-moments.png',
        },
        {
          title: 'Facile à partager avec la famille',
          desc: 'Envoyez des liens aux grands-parents et aux proches. Publiez dans le catalogue et recevez des évaluations de lecteurs.',
          image: '/landing/share-with-family.png',
        },
      ],
    },
    featureGrid: {
      title: 'Tout ce qu’il faut pour un moment de lecture magique',
      subtitle: 'Pensé pour une expérience de conte personnalisée, belle, simple et réutilisable.',
      features: [
        {
          title: 'Narration audio',
          desc: 'Une version audio expressive avec des voix adaptées à l’ambiance : féminine ou masculine, douce ou lumineuse. Idéale en déplacement, au coucher ou quand vous le souhaitez.',
          image: '/landing/voice-narration.png',
        },
        {
          title: 'Texte à lire ensemble',
          desc: 'Les mots se surlignent au rythme de la narration et aident l’enfant à relier naturellement le son et le texte. Comme un karaoké pour contes.',
          image: '/landing/read-along-text.png',
        },
        {
          title: 'Adaptation selon l’âge',
          desc: 'La complexité du texte, la longueur des phrases et des paragraphes suivent Lexile (MetaMetrics), un standard utilisé dans les écoles et programmes éducatifs. Le ton et le vocabulaire s’ajustent à l’âge de votre enfant.',
          image: '/landing/age-adaptation.png',
        },
        {
          title: 'Séries avec les héros préférés',
          desc: 'Les personnages aimés peuvent revenir dans de nouvelles histoires, pour donner envie d’attendre la suite.',
          image: '/landing/favorite-hero-series.png',
        },
        {
          title: 'Sa propre histoire, du dessin au conte',
          desc: 'L’enfant devient l’auteur de son propre conte : il invente des héros, choisit les aventures et les partage avec ses proches. Publiez dans le catalogue et recevez des avis.',
          image: '/landing/draw-to-story.png',
        },
        {
          title: 'Plusieurs profils d’enfants',
          desc: 'Créez un profil distinct pour chaque enfant avec son âge, son prénom, ses préférences et son humeur. Les histoires s’adaptent à l’enfant concerné.',
          image: '/landing/multiple-child-profiles.png',
        },
        {
          title: 'Des illustrations dans plusieurs styles',
          desc: 'Choisissez un style visuel selon l’ambiance : aquarelle, pâte à modeler, animation 3D, bande dessinée ou conte de nuit. Chaque histoire peut avoir son propre univers.',
          image: '/landing/illustration-styles.png',
        },
      ],
    },
    safety: {
      title: 'Sûr pour les enfants',
      subtitle: 'Chaque histoire respecte des règles de sécurité et reste douce, chaleureuse et adaptée à l’âge.',
      points: [
        'Fins heureuses',
        'Aucune violence ni contenu anxiogène',
        'Adapté à l’âge de l’enfant',
        'Uniquement un ton positif et bienveillant',
        'Thèmes familiaux et sûrs',
      ],
    },
    voices: {
      title: 'Voix de narration',
      subtitle:
        'Choisissez une voix pour l’histoire, féminine ou masculine. Vous pouvez l’écouter avant de créer. Les voix standard sont accessibles à tous. Les voix premium (Persée, Orion, Andromède, Cassiopée) font partie du plan Fairy World.',
      previewAria: 'Écouter un extrait',
      noSampleAria: 'Aucun extrait disponible',
      fallbackVoices: [
        { id: 'lyra', name: 'lyra', displayName: 'Lyra', sampleAudioUrl: null },
        { id: 'hydra', name: 'hydra', displayName: 'Hydra', sampleAudioUrl: null },
        { id: 'phoenix', name: 'phoenix', displayName: 'Phoenix', sampleAudioUrl: null },
        { id: 'centaurus', name: 'centaurus', displayName: 'Centaurus', sampleAudioUrl: null },
      ],
    },
    multilingual: {
      title: 'Lire dans une langue, grandir dans une autre',
      subtitle: 'WonderTales propose des histoires multilingues aux familles qui valorisent autant l’imagination que l’immersion linguistique.',
      bullets: [
        'Créer des histoires dans plusieurs langues',
        'Lire et écouter naturellement',
        'Idéal pour les familles bilingues et multilingues',
        'Une manière ludique de soutenir l’apprentissage des langues',
      ],
    },
    pricing: {
      title: 'Choisissez l’offre adaptée à votre famille',
      subtitle: 'Commencez gratuitement, puis débloquez plus d’histoires, de narration, d’illustrations, de BD et d’options de partage.',
      reassurance: 'Passez à une offre supérieure quand votre famille veut lire, écouter et créer davantage.',
      cta: 'Offres et fonctionnalités',
      popularBadge: 'Le plus populaire',
      perMonthSuffix: '/mois',
      fallbackPlans: {
        free: { name: 'Gratuit', price: '0' },
        silver: { name: 'Rêves d’Argent', price: '—' },
        golden: { name: 'Étoiles Dorées', price: '—' },
        fairyworld: { name: 'Monde des Fées', price: '—' },
      },
    },
    faq: {
      title: 'Questions fréquentes',
      subtitle: 'Tout ce que les parents aiment savoir avant de commencer.',
      cta: 'Créer la première histoire maintenant',
      items: [
        {
          q: 'Pourquoi WonderTales est-il sûr pour les enfants ?',
          a: 'Chaque scène est vérifiée individuellement. WonderTales contrôle l’adéquation à l’âge, les thèmes sûrs et la tonalité positive. Si une scène ne convient pas, elle est automatiquement réécrite. Les illustrations sont elles aussi validées pour éviter tout contenu interdit. La plateforme impose des limites claires : pas de violence, pas de scènes traumatisantes et toujours un ton bienveillant.',
        },
        {
          q: 'Puis-je utiliser le dessin de mon enfant dans une histoire ?',
          a: 'Oui. Vous pouvez téléverser un dessin, une photo de votre enfant ou de son animal, ou simplement décrire le personnage avec des mots. WonderTales transforme ces éléments en héros reconnaissables. Un mode rapide permet aussi d’utiliser plusieurs photos pour identifier les visages et créer les personnages.',
        },
        {
          q: 'Dois-je écrire l’histoire moi-même ?',
          a: 'Non. Vous choisissez l’âge, le thème, les personnages et la langue. Vous pouvez aussi définir une morale — amitié, courage, gentillesse, sécurité — et ajouter quelques notes. Ensuite WonderTales crée une histoire complète avec dialogues, détails sensoriels et une fin satisfaisante.',
        },
        {
          q: 'Combien de temps faut-il pour créer une histoire ?',
          a: 'En général 1 à 2 minutes. Vous voyez l’avancement en temps réel pendant l’analyse des images, la génération du texte, les contrôles de sécurité et la création des illustrations.',
        },
        {
          q: 'Peut-on écouter l’histoire en audio ?',
          a: 'Oui. Une fois l’histoire créée, vous pouvez générer une narration expressive avec différentes voix. Il existe aussi un mode lecture accompagnée où les mots se surlignent en rythme avec l’audio.',
        },
        {
          q: 'Puis-je créer des histoires dans plusieurs langues ?',
          a: 'Oui. WonderTales prend en charge l’ukrainien, l’anglais, l’allemand, le français, l’espagnol, le polonais et le russe. Le texte comme la narration sont générés dans la langue choisie.',
        },
        {
          q: 'Existe-t-il une offre gratuite ?',
          a: 'Oui. Vous pouvez commencer gratuitement avec quelques histoires par mois, une histoire audio et un profil enfant. Les offres payantes ouvrent l’accès à plus d’histoires, de narration, de profils et d’illustrations. <a href="/pricing">Voir les détails sur la page des tarifs</a>.',
          allowHtml: true,
        },
        {
          q: 'Puis-je partager les histoires avec ma famille ?',
          a: 'Oui. Publiez l’histoire publiquement ou partagez-la via un lien privé avec les grands-parents, la famille ou les amis. Les histoires publiques peuvent recevoir des avis et apparaître dans le catalogue.',
        },
        {
          q: 'Quels styles d’illustration sont disponibles ?',
          a: 'Vous pouvez choisir entre aquarelle, crayon, bande dessinée, animation 3D chaleureuse, conte de nuit, feutrine, pâte à modeler et anime. Sélectionnez le style qui correspond le mieux à l’ambiance de votre histoire.',
        },
        {
          q: 'Quelle est la longueur d’une histoire en général ?',
          a: 'La plupart des histoires comptent entre 5 et 11 scènes selon l’âge choisi. Les histoires pour les plus petits sont plus courtes, tandis que celles pour les plus grands gagnent en ampleur.',
        },
      ],
    },
    finalCta: {
      title: 'Offrez à votre enfant la joie de devenir le héros de sa propre histoire',
      subtitle: 'Un dessin, une photo ou une simple description suffisent pour que WonderTales crée une histoire personnalisée en quelques minutes.',
      primaryCta: 'Créer la première histoire gratuitement',
      secondaryCta: 'Voir les tarifs',
    },
  },
  pl: {
    htmlLang: 'pl',
    ogLocale: 'pl_PL',
    metaTitle: 'WonderTales — zamień rysunek dziecka w bohatera bajki',
    metaDescription:
      'Twórz spersonalizowane historie z ilustracjami, narracją i tekstem do wspólnego czytania. Bezpieczne, dopasowane do wieku i stworzone dla rodzin.',
    hero: {
      title: 'Zamień rysunek dziecka w',
      highlight: 'magicznego bohatera bajki',
      subheadline:
        'Twórz spersonalizowane historie z pięknymi ilustracjami, narracją głosową i tekstem do wspólnego czytania w kilka minut — bezpiecznie i z uwzględnieniem wieku dziecka.',
      imageAlt: 'Rysunek dziecka zamienia się w ilustrację do bajki',
      cta: 'Stwórz pierwszą historię za darmo →',
    },
    trustChips: {
      safe: 'Bezpieczne dla dzieci',
      audio: 'Narracja w zestawie',
      personalized: 'Personalizacja na podstawie rysunków',
      languages: 'Wiele języków',
      ready: 'Gotowe w kilka minut',
    },
    whyFamiliesLove: {
      title: 'Dlaczego dzieci kochają WonderTales',
      subtitle:
        'To coś więcej niż generator opowieści: magiczne doświadczenie, do którego dzieci chcą wracać, a rodzice mogą czuć spokój.',
      cards: [
        {
          title: 'Ich rysunek ożywa',
          desc: 'Dziecko widzi swój własny świat w bajce — jego pomysły i ulubieni bohaterowie stają się prawdziwymi postaciami.',
          image: '/landing/draw-to-hero.png',
        },
        {
          title: 'Historie, do których chce się wracać',
          desc: 'Barwne sceny, wyrazista narracja i tekst zsynchronizowany z głosem sprawiają, że każda historia wciąga od początku do końca.',
          image: '/landing/listen-again.png',
        },
        {
          title: 'Bajki łatwe do śledzenia i pokochania',
          desc: 'Historie brzmią naturalnie, są dopasowane do wieku i pomagają dziecku z łatwością podążać za fabułą.',
          image: '/landing/safe-by-age.png',
        },
        {
          title: 'Magiczna historia pojawia się bardzo szybko',
          desc: 'Wybierz bohatera, temat i nastrój albo wgraj kilka zdjęć i pozwól WonderTales stworzyć postacie. Już po chwili dziecko może słuchać, czytać i oglądać własną bajkę.',
          image: '/landing/create-in-minutes.png',
        },
      ],
    },
    fromSketchToStory: {
      title: 'Od rysunku do bajki w jednym magicznym procesie',
      subtitle: 'Zobacz, jak prosty szkic staje się dopracowaną postacią i w pełni spersonalizowaną historią.',
      steps: [
        {
          title: 'Dodaj rysunki, zdjęcia lub pomysły na bohaterów',
          desc: 'Wgraj dziecięce rysunki, rodzinne zdjęcia albo po prostu opisz bohaterów słowami. WonderTales zamieni te pomysły w żywe postacie, które dziecko rozpozna i pokocha.',
        },
        {
          title: 'Dopasuj historię do swojego dziecka',
          desc: 'Wybierz język i temat: magia, kosmos, zagadki, lekkie dreszczyki i wiele więcej. Możesz także określić morał, styl ilustracji i dodatkowe życzenia. WonderTales połączy wszystko w naprawdę osobistą opowieść.',
        },
        {
          title: 'Otrzymaj gotową historię z ilustracjami',
          desc: 'W kilka minut WonderTales tworzy pełną historię z pięknymi scenami, przemyślaną fabułą i zapadającymi w pamięć bohaterami.',
        },
        {
          title: 'Słuchajcie, czytajcie i dzielcie się razem',
          desc: 'Włącz narrację, czytajcie we własnym tempie albo podzielcie się historią z rodziną. To nie tylko treść, ale ciepły rodzinny moment, do którego chce się wracać.',
        },
      ],
    },
    exampleStories: {
      title: 'Przykłady magicznych historii',
      subtitle: 'Przejrzyj przykładowe historie, aby poczuć jakość, ton i różnorodność opowieści tworzonych przez rodziny.',
      previewFallback: 'Podgląd',
      ageLabel: 'Wiek:',
      readingLabel: 'Czytanie:',
      viewStoryCta: 'Zobacz historię',
      allStoriesCta: 'Wszystkie historie',
      fallbackStories: [
        { age: '3–5 lat', title: 'Mały budowniczy rakiet', time: '5 min', slug: '', thumbnailUrl: null },
        { age: '6–8 lat', title: 'Mila i księżycowy ogród', time: '6 min', slug: '', thumbnailUrl: null },
        { age: '4–7 lat', title: 'Bruno, odważny papierowy smok', time: '7 min', slug: '', thumbnailUrl: null },
      ],
    },
    madeForChildren: {
      title: 'Stworzone dla dzieci. Cenne dla rodziców.',
      subtitle: 'Bardziej wartościowy czas przed ekranem — kreatywny, osobisty i wart powrotów.',
      cards: [
        {
          title: 'Osobista pamiątka, a nie jednorazowa treść',
          desc: 'Każda historia jest wyjątkowa, bo zaczyna się od wyobraźni Twojego dziecka.',
          image: '/landing/personal-keepsake.png',
        },
        {
          title: 'Wspiera czytanie i rozwój językowy',
          desc: 'Dzieci mogą słuchać, śledzić tekst i cieszyć się historiami w wielu językach.',
          image: '/landing/reading-and-language.png',
        },
        {
          title: 'Idealne na dobranoc i spokojne chwile',
          desc: 'Gotowa bajka, która może stać się częścią codziennych rodzinnych rytuałów.',
          image: '/landing/bedtime-moments.png',
        },
        {
          title: 'Łatwo dzielić się z rodziną',
          desc: 'Wysyłaj linki do historii dziadkom i bliskim. Publikuj w katalogu i zbieraj oceny czytelników.',
          image: '/landing/share-with-family.png',
        },
      ],
    },
    featureGrid: {
      title: 'Wszystko, czego potrzeba do magicznego czasu z bajkami',
      subtitle: 'Zaprojektowane z myślą o pięknym, prostym i wielokrotnym doświadczeniu spersonalizowanego opowiadania.',
      features: [
        {
          title: 'Narracja głosowa',
          desc: 'Wyrazista wersja audio z głosami dopasowanymi do nastroju — kobiecymi lub męskimi, delikatnymi albo wyrazistymi. Słuchajcie w drodze, przed snem lub kiedy tylko chcecie.',
          image: '/landing/voice-narration.png',
        },
        {
          title: 'Tekst do wspólnego czytania',
          desc: 'Słowa podświetlają się w rytm narracji, pomagając dziecku naturalnie łączyć dźwięk z tekstem. Jak karaoke dla bajek.',
          image: '/landing/read-along-text.png',
        },
        {
          title: 'Dopasowanie do wieku',
          desc: 'Złożoność tekstu, długość zdań i akapitów odpowiada standardowi Lexile (MetaMetrics), używanemu w szkołach i programach edukacyjnych. Ton i słownictwo dostosowują się do wieku dziecka.',
          image: '/landing/age-adaptation.png',
        },
        {
          title: 'Serie z ulubionymi bohaterami',
          desc: 'Ukochane postacie mogą wracać w kolejnych historiach, dzięki czemu dziecko czeka na następną przygodę.',
          image: '/landing/favorite-hero-series.png',
        },
        {
          title: 'Własna historia od rysunku do bajki',
          desc: 'Dziecko staje się autorem własnej bajki — wymyśla bohaterów, wybiera przygody i dzieli się nimi z rodziną i przyjaciółmi. Publikuj w katalogu i zbieraj oceny.',
          image: '/landing/draw-to-story.png',
        },
        {
          title: 'Wiele profili dzieci',
          desc: 'Utwórz osobny profil dla każdego dziecka z jego wiekiem, imieniem, preferencjami i nastrojem. Historie dopasowują się do konkretnego odbiorcy.',
          image: '/landing/multiple-child-profiles.png',
        },
        {
          title: 'Ilustracje w różnych stylach',
          desc: 'Wybierz wygląd pasujący do nastroju — akwarela, plastelina, animacja 3D, komiks albo nocna bajka. Każda historia może wyglądać inaczej.',
          image: '/landing/illustration-styles.png',
        },
      ],
    },
    safety: {
      title: 'Bezpieczne dla dzieci',
      subtitle: 'Każda historia spełnia zasady bezpieczeństwa i została zaprojektowana tak, aby była ciepła, łagodna i odpowiednia dla wieku dziecka.',
      points: [
        'Szczęśliwe zakończenia',
        'Bez przemocy i niepokojących treści',
        'Dopasowanie do wieku dziecka',
        'Tylko przyjazny, pozytywny ton',
        'Tematy bezpieczne dla rodziny',
      ],
    },
    voices: {
      title: 'Głosy narratora',
      subtitle:
        'Wybierz głos do historii — kobiecy lub męski. Możesz go odsłuchać przed utworzeniem opowieści. Głosy standardowe są dostępne dla wszystkich. Głosy premium (Perseusz, Orion, Andromeda, Kasjopeja) należą do planu Fairy World.',
      previewAria: 'Odsłuchaj próbkę',
      noSampleAria: 'Brak próbki',
      fallbackVoices: [
        { id: 'lyra', name: 'lyra', displayName: 'Lyra', sampleAudioUrl: null },
        { id: 'hydra', name: 'hydra', displayName: 'Hydra', sampleAudioUrl: null },
        { id: 'phoenix', name: 'phoenix', displayName: 'Phoenix', sampleAudioUrl: null },
        { id: 'centaurus', name: 'centaurus', displayName: 'Centaurus', sampleAudioUrl: null },
      ],
    },
    multilingual: {
      title: 'Czytaj w jednym języku, rozwijaj się w innym',
      subtitle: 'WonderTales to wielojęzyczne historie dla rodzin, którym zależy zarówno na wyobraźni, jak i zanurzeniu w języku.',
      bullets: [
        'Twórz historie w wielu językach',
        'Czytaj i słuchaj w naturalny sposób',
        'Idealne dla rodzin dwujęzycznych i wielojęzycznych',
        'Zabawny sposób na wspieranie nauki języka',
      ],
    },
    pricing: {
      title: 'Wybierz plan odpowiedni dla swojej rodziny',
      subtitle: 'Zacznij za darmo, a potem odblokuj więcej historii, narracji, ilustracji, komiksów i opcji udostępniania.',
      reassurance: 'Zmieniaj plan, kiedy Twoja rodzina chce czytać, słuchać i tworzyć więcej.',
      cta: 'Plany i funkcje',
      popularBadge: 'Najpopularniejszy',
      perMonthSuffix: '/mies.',
      fallbackPlans: {
        free: { name: 'Darmowy', price: '0' },
        silver: { name: 'Srebrne Marzenia', price: '—' },
        golden: { name: 'Złote Gwiazdy', price: '—' },
        fairyworld: { name: 'Bajkowy Świat', price: '—' },
      },
    },
    faq: {
      title: 'Najczęstsze pytania',
      subtitle: 'Wszystko, co rodzice zwykle chcą wiedzieć przed rozpoczęciem.',
      cta: 'Stwórz pierwszą historię teraz',
      items: [
        {
          q: 'Dlaczego WonderTales jest bezpieczne dla dzieci?',
          a: 'Każda scena jest sprawdzana osobno. WonderTales ocenia, czy treść jest odpowiednia do wieku, czy porusza bezpieczne tematy i czy kończy się pozytywnie. Jeśli coś nie przejdzie kontroli, scena jest automatycznie przepisywana. Ilustracje także są weryfikowane pod kątem niedozwolonych treści. Platforma działa według jasnych zasad: bez przemocy, bez traumatycznych scen i zawsze z przyjaznym tonem.',
        },
        {
          q: 'Czy mogę użyć rysunku dziecka w historii?',
          a: 'Tak. Możesz wgrać rysunek, zdjęcie dziecka lub zwierzaka albo opisać bohatera słowami. WonderTales zamieni te wskazówki w rozpoznawalną postać. Tryb szybki pozwala użyć kilku zdjęć do rozpoznania twarzy i zbudowania bohaterów.',
        },
        {
          q: 'Czy muszę samodzielnie pisać historię?',
          a: 'Nie. Wybierasz wiek dziecka, temat, bohaterów i język. Możesz też określić morał i dodać kilka uwag. Następnie WonderTales tworzy pełną historię z dialogami, szczegółami i satysfakcjonującym zakończeniem.',
        },
        {
          q: 'Ile trwa stworzenie historii?',
          a: 'Zwykle 1–2 minuty. Na żywo widzisz postęp analizy obrazów, generowania tekstu, kontroli bezpieczeństwa i tworzenia ilustracji.',
        },
        {
          q: 'Czy można słuchać historii jako audio?',
          a: 'Tak. Po stworzeniu historii możesz wygenerować ekspresyjną narrację z różnymi głosami. Dostępny jest też tryb wspólnego czytania, w którym słowa podświetlają się synchronicznie z dźwiękiem.',
        },
        {
          q: 'Czy mogę tworzyć historie w różnych językach?',
          a: 'Tak. WonderTales obsługuje ukraiński, angielski, niemiecki, francuski, hiszpański, polski i rosyjski. Zarówno tekst, jak i narracja są generowane w wybranym języku.',
        },
        {
          q: 'Czy jest darmowy plan?',
          a: 'Tak. Możesz zacząć za darmo i otrzymać kilka historii miesięcznie, jedną historię audio oraz jeden profil dziecka. Płatne plany oferują więcej historii, narracji, profili i ilustracji. <a href="/pricing">Sprawdź szczegóły na stronie cennika</a>.',
          allowHtml: true,
        },
        {
          q: 'Czy mogę dzielić się historiami z rodziną?',
          a: 'Tak. Opublikuj historię publicznie albo udostępnij ją prywatnym linkiem dziadkom, rodzinie czy znajomym. Publiczne historie mogą zbierać oceny i trafiać do katalogu.',
        },
        {
          q: 'Jakie style ilustracji są dostępne?',
          a: 'Do wyboru są akwarela, ołówek, komiks, ciepła animacja 3D, nocna bajka, filc, plastelina i anime. Wybierz styl, który najlepiej pasuje do klimatu historii.',
        },
        {
          q: 'Jak długa jest typowa historia?',
          a: 'Większość historii liczy od 5 do 11 scen, zależnie od wybranego wieku. Dla młodszych dzieci opowieści są krótsze, a dla starszych bardziej rozbudowane.',
        },
      ],
    },
    finalCta: {
      title: 'Podaruj dziecku radość z bycia bohaterem własnej historii',
      subtitle: 'Rysunek, zdjęcie albo krótki opis wystarczą, by WonderTales stworzyło spersonalizowaną opowieść w kilka minut.',
      primaryCta: 'Stwórz pierwszą historię za darmo',
      secondaryCta: 'Zobacz ceny',
    },
  },
};

export function normalizeLandingLocale(input?: string | null): LandingLocale {
  const normalized = input?.slice(0, 2).toLowerCase() || DEFAULT_LANDING_LOCALE;
  return LANDING_LOCALES.includes(normalized as LandingLocale)
    ? (normalized as LandingLocale)
    : DEFAULT_LANDING_LOCALE;
}

export function getLandingContent(locale?: string | null): LandingContent {
  return landingContent[normalizeLandingLocale(locale)];
}

export function getLandingPath(locale?: string | null): string {
  const normalized = normalizeLandingLocale(locale);
  return normalized === DEFAULT_LANDING_LOCALE ? '/' : `/${normalized}/`;
}

export function getLandingUrl(webAppUrl: string, locale?: string | null): string {
  const base = webAppUrl.replace(/\/$/, '');
  const path = getLandingPath(locale);
  return base ? `${base}${path === '/' ? '' : path}` || base : path;
}

export function buildLandingAlternateLinks(webAppUrl: string): string {
  const defaultUrl = escapeHtml(getLandingUrl(webAppUrl, DEFAULT_LANDING_LOCALE));
  const alternates = PUBLIC_SEO_LOCALES.map((locale) => {
    const href = escapeHtml(getLandingUrl(webAppUrl, locale));
    return `<link rel="alternate" hreflang="${locale}" href="${href}">`;
  });
  alternates.push(`<link rel="alternate" hreflang="x-default" href="${defaultUrl}">`);
  return alternates.join('\n  ');
}

export function formatLandingAgeGroup(locale: string, ageGroup: string): string {
  const normalizedLocale = normalizeLandingLocale(locale);
  const normalized = ageGroup.trim();
  if (!normalized) return ageGroup;

  const compact = normalized.replace(/\s+/g, '');
  const exactMap: Record<LandingLocale, Record<string, string>> = {
    uk: { '2-3': '2–3 років', '4-5': '4–5 років', '6-7': '6–7 років', '8-9': '8–9 років', '10-12': '10–12 років' },
    ru: { '2-3': '2–3 лет', '4-5': '4–5 лет', '6-7': '6–7 лет', '8-9': '8–9 лет', '10-12': '10–12 лет' },
    en: { '2-3': '2–3 years', '4-5': '4–5 years', '6-7': '6–7 years', '8-9': '8–9 years', '10-12': '10–12 years' },
    es: { '2-3': '2–3 años', '4-5': '4–5 años', '6-7': '6–7 años', '8-9': '8–9 años', '10-12': '10–12 años' },
    de: { '2-3': '2–3 Jahre', '4-5': '4–5 Jahre', '6-7': '6–7 Jahre', '8-9': '8–9 Jahre', '10-12': '10–12 Jahre' },
    fr: { '2-3': '2–3 ans', '4-5': '4–5 ans', '6-7': '6–7 ans', '8-9': '8–9 ans', '10-12': '10–12 ans' },
    pl: { '2-3': '2–3 lata', '4-5': '4–5 lat', '6-7': '6–7 lat', '8-9': '8–9 lat', '10-12': '10–12 lat' },
  };

  const fromMap = exactMap[normalizedLocale][compact];
  if (fromMap) return fromMap;

  const unit: Record<LandingLocale, string> = {
    uk: 'років',
    ru: 'лет',
    en: 'years',
    es: 'años',
    de: 'Jahre',
    fr: 'ans',
    pl: 'lat',
  };

  const singleUnit: Record<LandingLocale, string> = {
    uk: 'рік',
    ru: 'год',
    en: 'year',
    es: 'año',
    de: 'Jahr',
    fr: 'an',
    pl: 'rok',
  };

  if (/^\d+\s*[-–]\s*\d+$/.test(normalized)) {
    const [from, to] = normalized.split(/[-–]/).map((part) => part.trim());
    return `${from}–${to} ${unit[normalizedLocale]}`;
  }

  if (/^\d+$/.test(normalized)) {
    return `${normalized} ${normalized === '1' ? singleUnit[normalizedLocale] : unit[normalizedLocale]}`;
  }

  return normalized;
}

export function formatLandingDuration(locale: string, minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const suffix: Record<LandingLocale, string> = {
    uk: 'хв',
    ru: 'мин',
    en: 'min',
    es: 'min',
    de: 'Min.',
    fr: 'min',
    pl: 'min',
  };
  return `${minutes} ${suffix[normalizeLandingLocale(locale)]}`;
}

export function getPlanDisplayName(locale: string, slug: string, fallbackName: string): string {
  const normalizedLocale = normalizeLandingLocale(locale);
  const translations: Record<LandingLocale, Partial<Record<string, string>>> = {
    uk: { free: 'Безкоштовний', silver: 'Срібні мрії', golden: 'Золоті зорі', fairyworld: 'Казковий світ' },
    ru: { free: 'Бесплатный', silver: 'Серебряные мечты', golden: 'Золотые звезды', fairyworld: 'Сказочный мир' },
    en: { free: 'Free', silver: 'Silver Dreams', golden: 'Golden Stars', fairyworld: 'Fairy World' },
    es: { free: 'Gratis', silver: 'Sueños de Plata', golden: 'Estrellas Doradas', fairyworld: 'Mundo de Hadas' },
    de: { free: 'Kostenlos', silver: 'Silberträume', golden: 'Goldene Sterne', fairyworld: 'Märchenwelt' },
    fr: { free: 'Gratuit', silver: 'Rêves d’Argent', golden: 'Étoiles Dorées', fairyworld: 'Monde des Fées' },
    pl: { free: 'Darmowy', silver: 'Srebrne Marzenia', golden: 'Złote Gwiazdy', fairyworld: 'Bajkowy Świat' },
  };
  return translations[normalizedLocale][slug] || fallbackName;
}

function pluralizeCount(locale: LandingLocale, count: number, forms: Record<LandingLocale, [string, string, string] | [string, string]>) {
  const form = forms[locale];
  if (form.length === 2) {
    return count === 1 ? form[0] : form[1];
  }

  if (locale === 'uk' || locale === 'ru') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return form[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return form[1];
    return form[2];
  }

  if (locale === 'pl') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (count === 1) return form[0];
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return form[1];
    return form[2];
  }

  return count === 1 ? form[0] : form[1] || form[form.length - 1];
}

function formatCountLabel(locale: LandingLocale, count: number, forms: Record<LandingLocale, [string, string, string] | [string, string]>): string {
  return `${count} ${pluralizeCount(locale, count, forms)}`;
}

export function buildPlanDescription(
  locale: string,
  slug: string,
  storiesPerMonth: number,
  audioStoriesPerMonth: number,
  imagesPerStory: number,
  comicsPerMonth = 0
): string {
  const normalizedLocale = normalizeLandingLocale(locale);
  const stories = formatCountLabel(normalizedLocale, storiesPerMonth, {
    uk: ['історія', 'історії', 'історій'],
    ru: ['история', 'истории', 'историй'],
    en: ['story', 'stories'],
    es: ['historia', 'historias'],
    de: ['Geschichte', 'Geschichten'],
    fr: ['histoire', 'histoires'],
    pl: ['historia', 'historie', 'historii'],
  });
  const audio = formatCountLabel(normalizedLocale, audioStoriesPerMonth, {
    uk: ['аудіоісторія', 'аудіоісторії', 'аудіоісторій'],
    ru: ['аудиоистория', 'аудиоистории', 'аудиоисторий'],
    en: ['audio story', 'audio stories'],
    es: ['audiohistoria', 'audiohistorias'],
    de: ['Audiogeschichte', 'Audiogeschichten'],
    fr: ['histoire audio', 'histoires audio'],
    pl: ['audiobajka', 'audiobajki', 'audiobajek'],
  });
  const illustrations = formatCountLabel(normalizedLocale, imagesPerStory, {
    uk: ['ілюстрація', 'ілюстрації', 'ілюстрацій'],
    ru: ['иллюстрация', 'иллюстрации', 'иллюстраций'],
    en: ['illustration', 'illustrations'],
    es: ['ilustración', 'ilustraciones'],
    de: ['Illustration', 'Illustrationen'],
    fr: ['illustration', 'illustrations'],
    pl: ['ilustracja', 'ilustracje', 'ilustracji'],
  });
  const comics = formatCountLabel(normalizedLocale, comicsPerMonth, {
    uk: ['комікс', 'комікси', 'коміксів'],
    ru: ['комикс', 'комикса', 'комиксов'],
    en: ['comic', 'comics'],
    es: ['cómic', 'cómics'],
    de: ['Comic', 'Comics'],
    fr: ['BD', 'BD'],
    pl: ['komiks', 'komiksy', 'komiksów'],
  });
  const comicAllowance = comicsPerMonth > 0
    ? ({
      uk: `До ${comics} у межах ліміту історій.`,
      ru: `До ${comics} в рамках лимита историй.`,
      en: `Up to ${comics} within the story limit.`,
      es: `Hasta ${comics} dentro del límite de historias.`,
      de: `Bis zu ${comics} innerhalb des Geschichtenlimits.`,
      fr: `Jusqu’à ${comics} dans la limite d’histoires.`,
      pl: `Do ${comics} w limicie historii.`,
    } satisfies Record<LandingLocale, string>)[normalizedLocale]
    : '';

  const byLocale: Record<LandingLocale, Record<PlanSlug, string>> = {
    uk: {
      free: `${stories} на місяць, ${audio}. ${illustrations} на історію. ${comicAllowance} Спробуйте WonderTales і подивіться, як це працює.`,
      silver: `${stories} на місяць, ${audio}. ${illustrations} на історію. ${comicAllowance} Ідеально для однієї дитини.`,
      golden: `${stories} на місяць, ${audio}. ${illustrations} на історію. ${comicAllowance} Більше щоденних історій і кілька дитячих профілів.`,
      fairyworld: `${stories} на місяць, ${audio}. ${illustrations} на історію. ${comicAllowance} Преміум-голоси, більше профілів і розширені можливості.`,
    },
    ru: {
      free: `${stories} в месяц, ${audio}. ${illustrations} на историю. ${comicAllowance} Попробуйте WonderTales и посмотрите, как это работает.`,
      silver: `${stories} в месяц, ${audio}. ${illustrations} на историю. ${comicAllowance} Отлично подходит для одного ребенка.`,
      golden: `${stories} в месяц, ${audio}. ${illustrations} на историю. ${comicAllowance} Больше ежедневных историй и несколько детских профилей.`,
      fairyworld: `${stories} в месяц, ${audio}. ${illustrations} на историю. ${comicAllowance} Премиум-голоса, больше профилей и расширенные возможности.`,
    },
    en: {
      free: `${stories} per month, ${audio}. ${illustrations} per story. ${comicAllowance} Try WonderTales and see how it feels.`,
      silver: `${stories} per month, ${audio}. ${illustrations} per story. ${comicAllowance} Great for one child.`,
      golden: `${stories} per month, ${audio}. ${illustrations} per story. ${comicAllowance} More daily stories and multiple child profiles.`,
      fairyworld: `${stories} per month, ${audio}. ${illustrations} per story. ${comicAllowance} Premium voices, more profiles, and expanded options.`,
    },
    es: {
      free: `${stories} al mes, ${audio}. ${illustrations} por historia. ${comicAllowance} Prueba WonderTales y descubre cómo funciona.`,
      silver: `${stories} al mes, ${audio}. ${illustrations} por historia. ${comicAllowance} Ideal para un niño.`,
      golden: `${stories} al mes, ${audio}. ${illustrations} por historia. ${comicAllowance} Más historias diarias y varios perfiles infantiles.`,
      fairyworld: `${stories} al mes, ${audio}. ${illustrations} por historia. ${comicAllowance} Voces premium, más perfiles y funciones ampliadas.`,
    },
    de: {
      free: `${stories} pro Monat, ${audio}. ${illustrations} pro Geschichte. ${comicAllowance} Probiere WonderTales aus und erlebe, wie es funktioniert.`,
      silver: `${stories} pro Monat, ${audio}. ${illustrations} pro Geschichte. ${comicAllowance} Ideal für ein Kind.`,
      golden: `${stories} pro Monat, ${audio}. ${illustrations} pro Geschichte. ${comicAllowance} Mehr tägliche Geschichten und mehrere Kinderprofile.`,
      fairyworld: `${stories} pro Monat, ${audio}. ${illustrations} pro Geschichte. ${comicAllowance} Premium-Stimmen, mehr Profile und erweiterte Möglichkeiten.`,
    },
    fr: {
      free: `${stories} par mois, ${audio}. ${illustrations} par histoire. ${comicAllowance} Essayez WonderTales et découvrez comment cela fonctionne.`,
      silver: `${stories} par mois, ${audio}. ${illustrations} par histoire. ${comicAllowance} Idéal pour un enfant.`,
      golden: `${stories} par mois, ${audio}. ${illustrations} par histoire. ${comicAllowance} Plus d’histoires au quotidien et plusieurs profils enfants.`,
      fairyworld: `${stories} par mois, ${audio}. ${illustrations} par histoire. ${comicAllowance} Voix premium, plus de profils et davantage d’options.`,
    },
    pl: {
      free: `${stories} miesięcznie, ${audio}. ${illustrations} na historię. ${comicAllowance} Wypróbuj WonderTales i zobacz, jak to działa.`,
      silver: `${stories} miesięcznie, ${audio}. ${illustrations} na historię. ${comicAllowance} Idealne dla jednego dziecka.`,
      golden: `${stories} miesięcznie, ${audio}. ${illustrations} na historię. ${comicAllowance} Więcej codziennych historii i kilka profili dzieci.`,
      fairyworld: `${stories} miesięcznie, ${audio}. ${illustrations} na historię. ${comicAllowance} Głosy premium, więcej profili i rozszerzone możliwości.`,
    },
  };

  const planKey = (slug in byLocale[normalizedLocale] ? slug : 'free') as PlanSlug;
  return byLocale[normalizedLocale][planKey].replace(/\s+/g, ' ').trim();
}

export function formatPlanPrice(locale: string, priceMonthly: number, currency: string): string {
  const amount = ['UAH', 'USD', 'EUR'].includes(currency) ? priceMonthly / 100 : priceMonthly;
  const normalizedLocale = normalizeLandingLocale(locale);
  const localeTag: Record<LandingLocale, string> = {
    uk: 'uk-UA',
    ru: 'ru-RU',
    en: 'en-US',
    es: 'es-ES',
    de: 'de-DE',
    fr: 'fr-FR',
    pl: 'pl-PL',
  };

  try {
    return new Intl.NumberFormat(localeTag[normalizedLocale], {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
