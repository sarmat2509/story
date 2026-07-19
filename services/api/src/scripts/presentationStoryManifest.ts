import type { ImageStyle } from '@wondertales/shared';

export type PresentationStoryFormat = 'story' | 'graphic_novel' | 'mixed_story';

export interface PresentationStoryDefinition {
  id: string;
  format: PresentationStoryFormat;
  language: 'uk' | 'ru' | 'en' | 'es' | 'de' | 'fr' | 'pl';
  childName: string;
  characterNames: readonly string[];
  scenarioCardId?: string;
  goal: string;
  imageStyle: ImageStyle;
  title: string;
  userNotes: string;
}

export const PRESENTATION_CONTROL_STORY_IDS = [
  'story-uk-moon-yawn',
  'comic-en-power-listening',
  'mixed-de-moonlight-bridge',
] as const;

export const PRESENTATION_STORY_MANIFEST: readonly PresentationStoryDefinition[] = [
  {
    id: 'story-uk-moon-yawn',
    format: 'story',
    language: 'uk',
    childName: 'Ноа',
    characterNames: ['Мара', 'Пип'],
    goal: 'kindness',
    imageStyle: 'soft_watercolor',
    title: 'Місяць загубив позіхання',
    userNotes:
      'Назва має бути точно «Місяць загубив позіхання». Напиши лагідну казку перед сном: Ноа, мама Мара й кролиця Пип допомагають Місяцю знайти загублене позіхання. Спокійний ритм, повтори, відчуття безпеки, без небезпеки й гучних подій. Завершення — затишне засинання.',
  },
  {
    id: 'story-ru-firefly-path',
    format: 'story',
    language: 'ru',
    childName: 'Сами',
    characterNames: ['Лума', 'Руни'],
    scenarioCardId: 'enchanted_forest',
    goal: 'courage',
    imageStyle: 'felt_craft',
    title: 'Тропинка светлячков',
    userNotes:
      'Название должно быть точно «Тропинка светлячков». Сами, дракон Лума и дух-компас Руни идут по зачарованному лесу, где светлячки показывают путь лишь тому, кто умеет спокойно признать страх и попросить друзей о помощи. Приключение доброе, без реальной угрозы; финал тёплый и обнадёживающий.',
  },
  {
    id: 'story-en-momo-morning',
    format: 'story',
    language: 'en',
    childName: 'Лина',
    characterNames: ['Момо', 'Кико'],
    goal: 'friendship',
    imageStyle: 'clay',
    title: "Momo's Quiet Morning",
    userNotes:
      "Use the exact title “Momo's Quiet Morning”. Lina, Momo the cat, and Kiko the lantern snail discover a gentle morning routine through small animal sounds, washing, breakfast, and putting toys away. Keep sentences simple, reassuring, and playful, with repetition and no danger. End with the three friends ready for the day.",
  },
  {
    id: 'story-es-two-songs',
    format: 'story',
    language: 'es',
    childName: 'Майя',
    characterNames: ['Пико'],
    scenarioCardId: 'families_cultures',
    goal: 'respect_elders',
    imageStyle: 'colored_pencil',
    title: 'Las dos canciones de Maya',
    userNotes:
      'El título debe ser exactamente «Las dos canciones de Maya». Maya y su corgi Pico preparan una reunión familiar en la que dos canciones de tradiciones distintas parecen competir. Maya aprende a escucharlas, unir sus ritmos con respeto y celebrar ambas raíces. Historia cálida, cotidiana y sin estereotipos.',
  },
  {
    id: 'story-de-brave-step',
    format: 'story',
    language: 'de',
    childName: 'Лина',
    characterNames: ['Момо', 'Кико'],
    goal: 'friendship',
    imageStyle: 'colored_pencil',
    title: 'Lina und der mutige kleine Schritt',
    userNotes:
      'Der Titel muss genau „Lina und der mutige kleine Schritt“ lauten. Lina kommt an einen neuen, freundlichen Ort. Momo und Kiko helfen ihr mit einer kleinen, überschaubaren Handlung: begrüßen, beobachten, mitmachen. Einfache beruhigende Sprache, Wiederholungen, keine Gefahr; Mut bedeutet hier, sich Zeit zu lassen.',
  },
  {
    id: 'story-fr-grandma-lantern',
    format: 'story',
    language: 'fr',
    childName: 'Майя',
    characterNames: ['Орби'],
    scenarioCardId: 'holidays_traditions',
    goal: 'respect_elders',
    imageStyle: 'soft_watercolor',
    title: 'La lanterne de Mamie',
    userNotes:
      'Le titre doit être exactement « La lanterne de Mamie ». Maya et Orbi aident Mamie, personnage secondaire non personnalisé, à préparer une lanterne pour une fête familiale. Une petite erreur devient l’occasion d’écouter l’histoire de la tradition et d’y ajouter une touche nouvelle. Ton chaleureux, respectueux et joyeux.',
  },
  {
    id: 'story-pl-jungle-compass',
    format: 'story',
    language: 'pl',
    childName: 'Рави',
    characterNames: ['Нова', 'Квилл'],
    scenarioCardId: 'jungle_adventures',
    goal: 'persistence',
    imageStyle: 'felt_craft',
    title: 'Ravi i kompas dżungli',
    userNotes:
      'Tytuł ma brzmieć dokładnie „Ravi i kompas dżungli”. Ravi, robot Nova i papierowa sowa Quill szukają w dżungli kompasu, który wskazuje nie północ, lecz najważniejsze pytanie. Każda spokojna zagadka wymaga obserwacji i wytrwałości. Bez realnego zagrożenia; finał podkreśla współpracę i ciekawość.',
  },
  {
    id: 'comic-uk-honest-relay',
    format: 'graphic_novel',
    language: 'uk',
    childName: 'Амара',
    characterNames: ['Тео', 'Эмбер'],
    scenarioCardId: 'sports_competitions',
    goal: 'responsibility',
    imageStyle: 'comic_line',
    title: 'Естафета чесних кроків',
    userNotes:
      'Назва коміксу має бути точно «Естафета чесних кроків». Амара, тато Тео й саламандра Ембер беруть участь у фантазійній естафеті. Коли помилку легко приховати, Амара чесно повідомляє про неї та допомагає команді завершити змагання справедливо. Динамічно, доброзичливо, без травм і приниження суперників.',
  },
  {
    id: 'comic-ru-tomorrow-city',
    format: 'graphic_novel',
    language: 'ru',
    childName: 'Зури',
    characterNames: ['Веспер'],
    scenarioCardId: 'macro_scifi',
    goal: 'responsibility',
    imageStyle: 'anime_light',
    title: 'Город, который отвечал завтра',
    userNotes:
      'Название комикса должно быть точно «Город, который отвечал завтра». Зури и космическая рысь Веспер исследуют город, где устройства отвечают на вопросы только на следующий день. Они раскрывают временной сбой, учатся проверять последствия решений и не доверять технологии слепо. Умная безопасная фантастика с ясным финалом.',
  },
  {
    id: 'comic-en-power-listening',
    format: 'graphic_novel',
    language: 'en',
    childName: 'Амара',
    characterNames: ['Физз'],
    scenarioCardId: 'super_powers',
    goal: 'empathy',
    imageStyle: 'comic_line',
    title: 'The Power of Listening',
    userNotes:
      'Use the exact title “The Power of Listening”. In this comic, Amara and Fizz discover that Amara’s apparent superpower works only when she listens closely to what people actually need. Build a clear visual adventure with a harmless misunderstanding, teamwork, expressive dialogue, and a satisfying ending. No combat or humiliation.',
  },
  {
    id: 'comic-es-tide-map',
    format: 'graphic_novel',
    language: 'es',
    childName: 'Сами',
    characterNames: ['Лума', 'Руни'],
    scenarioCardId: 'sea_treasures',
    goal: 'sharing',
    imageStyle: 'comic_line',
    title: 'El mapa de la marea',
    userNotes:
      'El título del cómic debe ser exactamente «El mapa de la marea». Sami, Luma y Runi siguen un mapa marino que cambia con cada marea. El tesoro resulta ser un conocimiento que debe compartirse para proteger una bahía fantástica. Aventura visual, cooperación, acertijos claros, peligro solo imaginario y resolución alegre.',
  },
  {
    id: 'comic-de-flying-wheels',
    format: 'graphic_novel',
    language: 'de',
    childName: 'Рави',
    characterNames: ['Нова', 'Квилл'],
    scenarioCardId: 'inventors',
    goal: 'persistence',
    imageStyle: 'comic_line',
    title: 'Die Werkstatt der fliegenden Räder',
    userNotes:
      'Der Comic muss genau „Die Werkstatt der fliegenden Räder“ heißen. Ravi, Nova und Quill bauen in einer Erfinderwerkstatt ein ungewöhnliches Flugrad. Mehrere harmlose Fehlversuche liefern Hinweise, bis sie gemeinsam eine sichere Lösung finden. Klare visuelle Handlung, technische Neugier, Ausdauer und ein freudiger Abschluss.',
  },
  {
    id: 'comic-fr-luma-giants',
    format: 'graphic_novel',
    language: 'fr',
    childName: 'Сами',
    characterNames: ['Лума'],
    scenarioCardId: 'fantasy_creatures',
    goal: 'courage',
    imageStyle: 'retro_magical_shojo',
    title: 'Luma et la forêt des géants',
    userNotes:
      'Le titre du comic doit être exactement « Luma et la forêt des géants ». Sami et Luma entrent dans une forêt où tout semble gigantesque. Ils découvrent que les géants sont des gardiens bienveillants et résolvent un malentendu par le courage et la parole. Merveilleux, expressif, sans combat ni menace réelle.',
  },
  {
    id: 'comic-pl-sun-station',
    format: 'graphic_novel',
    language: 'pl',
    childName: 'Рави',
    characterNames: ['Нова'],
    scenarioCardId: 'space_odyssey',
    goal: 'self_reliance',
    imageStyle: 'warm_3d',
    title: 'Stacja po drugiej stronie Słońca',
    userNotes:
      'Tytuł komiksu ma brzmieć dokładnie „Stacja po drugiej stronie Słońca”. Ravi i Nova docierają do opuszczonej stacji badawczej ukrytej po drugiej stronie Słońca. Samodzielnie analizują wskazówki, przywracają bezpieczny sygnał i odkrywają pokojową wiadomość. Kosmiczna przygoda bez walki, z logicznym finałem.',
  },
  {
    id: 'mixed-uk-attic-clock',
    format: 'mixed_story',
    language: 'uk',
    childName: 'Амара',
    characterNames: ['Тео', 'Физз'],
    scenarioCardId: 'mysteries_detectives',
    goal: 'responsibility',
    imageStyle: 'night_calm',
    title: 'Таємниця годинника на горищі',
    userNotes:
      'Назва mixed-історії має бути точно «Таємниця годинника на горищі». Амара, тато Тео й Физз розслідують, чому старий годинник дзвонить у дивний час. Прозові частини дають підказки, комікс-блоки показують ключові відкриття. Безпечно, атмосферно; розгадка пов’язана з відповідальністю за сімейну річ.',
  },
  {
    id: 'mixed-ru-kind-attic',
    format: 'mixed_story',
    language: 'ru',
    childName: 'Сами',
    characterNames: ['Лума', 'Руни'],
    scenarioCardId: 'scary_stories',
    goal: 'overcoming_fears',
    imageStyle: 'night_calm',
    title: 'Шорохи доброго чердака',
    userNotes:
      'Название mixed-истории должно быть точно «Шорохи доброго чердака». Сами, Лума и Руни слышат пугающие шорохи на чердаке, но исследуют их маленькими безопасными шагами. Проза создаёт мягкое напряжение, комикс-блоки раскрывают смешные подсказки. Никаких монстров: причина добрая и бытовая, финал успокаивает.',
  },
  {
    id: 'mixed-en-following-moon',
    format: 'mixed_story',
    language: 'en',
    childName: 'Рави',
    characterNames: ['Нова', 'Квилл'],
    scenarioCardId: 'science_facts',
    goal: 'self_reliance',
    imageStyle: 'warm_3d',
    title: 'Why the Moon Follows Us',
    userNotes:
      'Use the exact title “Why the Moon Follows Us”. Ravi, Nova, and Quill test the familiar illusion that the Moon follows a traveler. Prose explains observations in age-appropriate language; comic blocks show experiments with nearby objects, distance, and viewpoint. Keep the science accurate, playful, and integrated into an adventure.',
  },
  {
    id: 'mixed-es-under-ice',
    format: 'mixed_story',
    language: 'es',
    childName: 'Зури',
    characterNames: ['Веспер'],
    scenarioCardId: 'expeditions_world_travel',
    goal: 'persistence',
    imageStyle: 'warm_3d',
    title: 'La estación bajo el hielo',
    userNotes:
      'El título debe ser exactamente «La estación bajo el hielo». Zuri y Vesper participan en una expedición científica a una estación fantástica bajo el hielo. La prosa desarrolla el misterio y los bloques de cómic muestran los descubrimientos decisivos. Cooperación, paciencia y asombro; sin accidentes graves ni amenazas realistas.',
  },
  {
    id: 'mixed-de-moonlight-bridge',
    format: 'mixed_story',
    language: 'de',
    childName: 'Амара',
    characterNames: ['Тео', 'Физз'],
    scenarioCardId: 'medieval_heroes',
    goal: 'courage',
    imageStyle: 'retro_magical_shojo',
    title: 'Die Brücke aus Mondlicht',
    userNotes:
      'Der Titel muss genau „Die Brücke aus Mondlicht“ lauten. Amara, Theo und Fizz helfen in einer freundlichen mittelalterlichen Fantasiewelt, eine Brücke aus Mondlicht zu stabilisieren. Prosa erzählt Reise und Entscheidungen, Comicblöcke zeigen die drei Wendepunkte. Mut, Zusammenarbeit und Magie; keine Kämpfe oder echte Gefahr.',
  },
  {
    id: 'mixed-fr-forgotten-spells',
    format: 'mixed_story',
    language: 'fr',
    childName: 'Зури',
    characterNames: ['Веспер'],
    scenarioCardId: 'magic_wizards',
    goal: 'responsibility',
    imageStyle: 'anime_light',
    title: 'L’école des sorts oubliés',
    userNotes:
      'Le titre doit être exactement « L’école des sorts oubliés ». Zuri et Vesper visitent une école de magie où des sorts oubliés provoquent des effets absurdes mais sans danger. La prose mène l’enquête; les blocs comic montrent les moments magiques essentiels. Zuri répare la situation avec méthode et responsabilité.',
  },
  {
    id: 'mixed-pl-two-homes',
    format: 'mixed_story',
    language: 'pl',
    childName: 'Майя',
    characterNames: ['Пико', 'Орби'],
    scenarioCardId: 'families_cultures',
    goal: 'friendship',
    imageStyle: 'colored_pencil',
    title: 'Dwa domy, jedna opowieść',
    userNotes:
      'Tytuł ma brzmieć dokładnie „Dwa domy, jedna opowieść”. Maja, Piko i Orbi odkrywają, że codzienne zwyczaje w dwóch rodzinnych domach mogą się różnić i oba są ważne. Proza jest ciepła, a bloki komiksowe pokazują trzy wspólne chwile. Bez konfliktu dorosłych; finał buduje poczucie bezpieczeństwa.',
  },
] as const;
