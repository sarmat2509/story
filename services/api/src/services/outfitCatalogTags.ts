import type { OutfitPlateSearchFilters } from '../repositories/OutfitPlateCacheRepository';

export interface OutfitCatalogTagData {
  formality?: string | null;
  presentationGroups?: string[];
  purposeTags?: string[];
  seasonTags?: string[];
  climateTags?: string[];
  eraTags?: string[];
  settingTags?: string[];
  activityTags?: string[];
  silhouetteTags?: string[];
  footwearTags?: string[];
  componentTags?: string[];
  colorPalette?: string[];
  materials?: string[];
  patterns?: string[];
  detailTags?: string[];
  coverageTags?: string[];
}

export type OutfitTagListKey = Exclude<keyof OutfitCatalogTagData, 'formality'>;

const TAG_LIST_KEYS: OutfitTagListKey[] = [
  'presentationGroups',
  'purposeTags',
  'seasonTags',
  'climateTags',
  'eraTags',
  'settingTags',
  'activityTags',
  'silhouetteTags',
  'footwearTags',
  'componentTags',
  'colorPalette',
  'materials',
  'patterns',
  'detailTags',
  'coverageTags',
];

export function normalizeOutfitTagList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function includesAny(text: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function addTag(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

function addIfAny(
  text: string,
  tags: OutfitCatalogTagData,
  key: OutfitTagListKey,
  tokens: readonly string[],
  value: string,
): void {
  if (!includesAny(text, tokens)) return;
  const list = tags[key] || [];
  addTag(list, value);
  tags[key] = list;
}

function setFormalityIfUnset(tags: OutfitCatalogTagData, value: string): void {
  if (!tags.formality) tags.formality = value;
}

export function inferOutfitCatalogTags(outfitTextRaw: string): OutfitCatalogTagData {
  const text = outfitTextRaw.toLowerCase();
  const tags: OutfitCatalogTagData = {
    presentationGroups: [],
    purposeTags: [],
    seasonTags: [],
    climateTags: [],
    eraTags: [],
    settingTags: [],
    activityTags: [],
    silhouetteTags: [],
    footwearTags: [],
    componentTags: [],
    colorPalette: [],
    materials: [],
    patterns: [],
    detailTags: [],
    coverageTags: [],
  };

  if (includesAny(text, ['male', 'man', 'men', 'boy', 'masculine', 'муж', 'мальчик'])) {
    addTag(tags.presentationGroups!, 'male');
  }
  if (
    includesAny(text, [
      'female',
      'woman',
      'women',
      'girl',
      'feminine',
      'dress',
      'skirt',
      'gown',
      'blouse',
      'жен',
      'девоч',
      'плать',
      'юбк',
    ])
  ) {
    addTag(tags.presentationGroups!, 'female');
  }
  if (tags.presentationGroups!.length === 0) {
    addTag(tags.presentationGroups!, 'female');
    addTag(tags.presentationGroups!, 'male');
  }

  if (includesAny(text, ['winter', 'snow', 'parka', 'puffer', 'insulated', 'scarf', 'gloves', 'зим', 'снег'])) {
    addTag(tags.seasonTags!, 'winter');
    addTag(tags.climateTags!, 'cold');
    addTag(tags.purposeTags!, 'outerwear');
  }
  if (includesAny(text, ['summer', 'hot weather', 'shorts', 'sun hat', 'sundress', 'sandals', 'лет', 'жар'])) {
    addTag(tags.seasonTags!, 'summer');
    addTag(tags.climateTags!, 'hot');
  }
  if (includesAny(text, ['spring', 'autumn', 'fall', 'demi-season', 'light jacket', 'весен', 'осен', 'демисез'])) {
    addTag(tags.seasonTags!, 'demi');
    addTag(tags.climateTags!, 'mild');
  }
  if (includesAny(text, ['rain', 'raincoat', 'umbrella', 'waterproof', 'дожд', 'непромока'])) {
    addTag(tags.seasonTags!, 'rain');
    addTag(tags.purposeTags!, 'outerwear');
    addTag(tags.purposeTags!, 'protective');
    addTag(tags.coverageTags!, 'waterproof');
  }

  if (includesAny(text, ['swim', 'swimsuit', 'swimming', 'beach', 'pool', 'купаль', 'плав'])) {
    addTag(tags.purposeTags!, 'swim');
    addTag(tags.activityTags!, 'swimming');
    addTag(tags.settingTags!, 'beach');
    addTag(tags.silhouetteTags!, 'swimwear');
  }
  if (includesAny(text, ['pajama', 'pyjama', 'sleepwear', 'slippers', 'robe', 'пижам', 'тапоч', 'халат'])) {
    addTag(tags.purposeTags!, 'sleep_home');
    addTag(tags.settingTags!, 'home');
    setFormalityIfUnset(tags, 'casual');
  }
  if (includesAny(text, ['tuxedo', 'blazer', 'formal', 'ceremony', 'gown', 'business suit', 'костюм', 'смокинг'])) {
    addTag(tags.purposeTags!, 'formal');
    setFormalityIfUnset(tags, 'formal');
  }
  if (includesAny(text, ['party', 'festival', 'holiday', 'christmas', 'new year', 'birthday', 'празд', 'новогод'])) {
    addTag(tags.purposeTags!, 'festive');
    setFormalityIfUnset(tags, 'festive');
  }
  if (includesAny(text, ['costume', 'halloween', 'superhero', 'cape', 'pirate', 'fairy', 'костюм', 'плащ', 'пират'])) {
    addTag(tags.purposeTags!, 'costume');
    addTag(tags.activityTags!, 'roleplay');
  }
  if (includesAny(text, ['casual', 'everyday', 'jeans', 'hoodie', 'sneakers', 'повседнев', 'джинс', 'кеды'])) {
    addTag(tags.purposeTags!, 'casual');
    setFormalityIfUnset(tags, 'casual');
  }

  if (includesAny(text, ['doctor', 'nurse', 'scientist', 'chef', 'firefighter', 'guard', 'miner', 'санитар', 'шахтер', 'охранник'])) {
    addTag(tags.purposeTags!, 'work');
    addTag(tags.purposeTags!, 'uniform');
    setFormalityIfUnset(tags, 'work');
  }
  if (includesAny(text, ['doctor', 'nurse', 'orderly', 'scrubs', 'санитар', 'медицин'])) {
    addTag(tags.purposeTags!, 'medical');
    addTag(tags.settingTags!, 'hospital');
  }
  if (includesAny(text, ['scientist', 'lab coat', 'лаборатор', 'учен'])) {
    addTag(tags.purposeTags!, 'science_lab');
    addTag(tags.settingTags!, 'lab');
  }
  if (includesAny(text, ['chef', 'cook', 'apron', 'повар', 'фартук'])) {
    addTag(tags.settingTags!, 'kitchen');
    addTag(tags.componentTags!, 'apron');
  }
  if (includesAny(text, ['firefighter', 'fireman', 'пожар'])) {
    addTag(tags.purposeTags!, 'protective');
    addTag(tags.settingTags!, 'emergency');
    addTag(tags.coverageTags!, 'protective');
  }

  if (includesAny(text, ['armor', 'knight', 'castle', 'medieval', 'gambeson', 'рыцар', 'доспех', 'средневек'])) {
    addTag(tags.purposeTags!, 'historical');
    addTag(tags.eraTags!, 'medieval');
    addTag(tags.settingTags!, 'castle');
    addTag(tags.coverageTags!, 'armor');
  }
  if (includesAny(text, ['victorian', 'renaissance', 'ancient', 'prehistoric', 'peasant', 'merchant', 'кресть', 'купец', 'ремесл'])) {
    addTag(tags.purposeTags!, 'historical');
  }
  addIfAny(text, tags, 'eraTags', ['prehistoric', 'stone age', 'доистор', 'каменный век'], 'prehistoric');
  addIfAny(text, tags, 'eraTags', ['ancient', 'антич', 'древн'], 'ancient');
  addIfAny(text, tags, 'eraTags', ['victorian', 'викториан'], 'victorian');
  addIfAny(text, tags, 'eraTags', ['renaissance', 'ренессанс'], 'renaissance');
  addIfAny(text, tags, 'eraTags', ['fantasy', 'wizard', 'dragon', 'fairy', 'маг', 'фэнтези'], 'fantasy');

  if (includesAny(text, ['space', 'astronaut', 'spacesuit', 'futuristic', 'sci-fi', 'scifi', 'космо', 'скафандр'])) {
    addTag(tags.purposeTags!, 'space');
    addTag(tags.purposeTags!, 'sci_fi');
    addTag(tags.eraTags!, 'future');
    addTag(tags.settingTags!, 'space_station');
    addTag(tags.settingTags!, 'spaceship');
    addTag(tags.coverageTags!, 'protective');
  }
  if (includesAny(text, ['farm', 'farmer', 'agriculture', 'gardening', 'ферм', 'садов', 'сельск'])) {
    addTag(tags.settingTags!, 'farm');
    addTag(tags.activityTags!, 'farming');
  }
  if (includesAny(text, ['mine', 'miner', 'mining', 'шахт'])) {
    addTag(tags.settingTags!, 'mine');
    addTag(tags.activityTags!, 'mining');
    addTag(tags.purposeTags!, 'protective');
  }
  if (includesAny(text, ['diver', 'diving', 'wetsuit', 'oxygen', 'водолаз', 'дайв'])) {
    addTag(tags.settingTags!, 'underwater');
    addTag(tags.activityTags!, 'diving');
    addTag(tags.purposeTags!, 'protective');
  }

  addIfAny(text, tags, 'footwearTags', ['boots', 'ботин', 'сапог'], 'boots');
  addIfAny(text, tags, 'footwearTags', ['sneaker', 'trainer', 'кроссов', 'кеды'], 'sneakers');
  addIfAny(text, tags, 'footwearTags', ['sandals', 'сандал'], 'sandals');
  addIfAny(text, tags, 'footwearTags', ['slippers', 'тапоч'], 'slippers');
  addIfAny(text, tags, 'footwearTags', ['heels', 'туфл'], 'dress_shoes');

  addIfAny(text, tags, 'componentTags', ['dress', 'плать'], 'dress');
  addIfAny(text, tags, 'componentTags', ['skirt', 'юбк'], 'skirt');
  addIfAny(text, tags, 'componentTags', ['pants', 'trousers', 'jeans', 'брюк', 'джинс'], 'pants');
  addIfAny(text, tags, 'componentTags', ['shorts', 'шорт'], 'shorts');
  addIfAny(text, tags, 'componentTags', ['hoodie', 'толстов', 'худи'], 'hoodie');
  addIfAny(text, tags, 'componentTags', ['jacket', 'coat', 'parka', 'bomber', 'курт', 'пальто', 'бомбер'], 'jacket');
  addIfAny(text, tags, 'componentTags', ['shirt', 't-shirt', 'tee', 'рубаш', 'футбол'], 'shirt');
  addIfAny(text, tags, 'componentTags', ['overalls', 'coveralls', 'комбинез'], 'overalls');
  addIfAny(text, tags, 'componentTags', ['helmet', 'шлем', 'каск'], 'helmet');
  addIfAny(text, tags, 'componentTags', ['hat', 'cap', 'шляп', 'кепк', 'шапк'], 'hat');
  addIfAny(text, tags, 'componentTags', ['gloves', 'перчат'], 'gloves');
  addIfAny(text, tags, 'componentTags', ['scarf', 'шарф'], 'scarf');

  addIfAny(text, tags, 'silhouetteTags', ['dress', 'gown', 'плать'], 'one_piece');
  addIfAny(text, tags, 'silhouetteTags', ['pants', 'trousers', 'jeans', 'брюк', 'джинс'], 'two_piece');
  addIfAny(text, tags, 'silhouetteTags', ['overalls', 'coveralls', 'комбинез'], 'coveralls');
  addIfAny(text, tags, 'silhouetteTags', ['armor', 'spacesuit', 'скафандр', 'доспех'], 'full_body');

  addIfAny(text, tags, 'colorPalette', ['red', 'crimson', 'scarlet', 'красн'], 'red');
  addIfAny(text, tags, 'colorPalette', ['orange', 'оранж'], 'orange');
  addIfAny(text, tags, 'colorPalette', ['yellow', 'gold', 'желт', 'золот'], 'yellow');
  addIfAny(text, tags, 'colorPalette', ['green', 'emerald', 'зелен'], 'green');
  addIfAny(text, tags, 'colorPalette', ['blue', 'navy', 'голуб', 'син'], 'blue');
  addIfAny(text, tags, 'colorPalette', ['purple', 'violet', 'фиолет', 'пурпур'], 'purple');
  addIfAny(text, tags, 'colorPalette', ['pink', 'розов'], 'pink');
  addIfAny(text, tags, 'colorPalette', ['white', 'cream', 'бел', 'крем'], 'white');
  addIfAny(text, tags, 'colorPalette', ['black', 'черн'], 'black');
  addIfAny(text, tags, 'colorPalette', ['gray', 'grey', 'сер'], 'gray');
  addIfAny(text, tags, 'colorPalette', ['brown', 'tan', 'beige', 'корич', 'беж'], 'brown');

  addIfAny(text, tags, 'materials', ['denim', 'джинс'], 'denim');
  addIfAny(text, tags, 'materials', ['leather', 'кож'], 'leather');
  addIfAny(text, tags, 'materials', ['wool', 'шерст'], 'wool');
  addIfAny(text, tags, 'materials', ['cotton', 'хлоп'], 'cotton');
  addIfAny(text, tags, 'materials', ['silk', 'satin', 'шелк', 'атлас'], 'silk');
  addIfAny(text, tags, 'materials', ['metal', 'chainmail', 'steel', 'металл', 'кольчуг', 'сталь'], 'metal');
  addIfAny(text, tags, 'materials', ['rubber', 'резин'], 'rubber');

  addIfAny(text, tags, 'patterns', ['floral', 'flower', 'цветоч'], 'floral');
  addIfAny(text, tags, 'patterns', ['animal print', 'leopard', 'zebra', 'tiger', 'животн', 'леопард', 'зебр'], 'animal_print');
  addIfAny(text, tags, 'patterns', ['striped', 'stripes', 'полоск'], 'striped');
  addIfAny(text, tags, 'patterns', ['plaid', 'tartan', 'check', 'клет'], 'plaid');
  addIfAny(text, tags, 'patterns', ['polka', 'dot', 'горох'], 'polka_dot');
  addIfAny(text, tags, 'patterns', ['abstract', 'абстракт'], 'abstract');
  addIfAny(text, tags, 'patterns', ['geometric', 'геометр'], 'geometric');

  addIfAny(text, tags, 'detailTags', ['hood', 'капюш'], 'hood');
  addIfAny(text, tags, 'detailTags', ['zipper', 'молни'], 'zipper');
  addIfAny(text, tags, 'detailTags', ['buttons', 'buttoned', 'пугов'], 'buttons');
  addIfAny(text, tags, 'detailTags', ['pockets', 'карман'], 'pockets');
  addIfAny(text, tags, 'detailTags', ['reflective', 'светоотраж'], 'reflective');
  addIfAny(text, tags, 'detailTags', ['embroidered', 'embroidery', 'вышив'], 'embroidery');

  if (includesAny(text, ['long sleeve', 'long-sleeve', 'длинн рукав'])) addTag(tags.coverageTags!, 'long_sleeves');
  if (includesAny(text, ['short sleeve', 'short-sleeve', 'коротк рукав'])) addTag(tags.coverageTags!, 'short_sleeves');
  if (includesAny(text, ['sleeveless', 'без рукав'])) addTag(tags.coverageTags!, 'sleeveless');
  if (includesAny(text, ['full body', 'head-to-toe', 'coveralls', 'spacesuit', 'полностью закрыт'])) addTag(tags.coverageTags!, 'full_body');

  return Object.fromEntries(
    Object.entries(tags)
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? normalizeOutfitTagList(value) : value,
      ])
      .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : !!value)),
  ) as OutfitCatalogTagData;
}

export function inferOutfitCatalogFilters(outfitTextRaw: string): OutfitPlateSearchFilters {
  const tags = inferOutfitCatalogTags(outfitTextRaw);
  const filters: OutfitPlateSearchFilters = {};
  for (const key of TAG_LIST_KEYS) {
    if (
      key === 'colorPalette' ||
      key === 'materials' ||
      key === 'patterns' ||
      key === 'detailTags'
    ) {
      continue;
    }
    const values = tags[key];
    if (values?.length) {
      (filters as Record<string, string[]>)[key] = values;
    }
  }
  if (tags.formality) filters.formality = tags.formality;
  return filters;
}

