export type PresentationAudioFormat = 'story' | 'graphic_novel' | 'mixed_story';
export type PresentationAudioLanguage = 'uk' | 'ru' | 'en' | 'es' | 'de' | 'fr' | 'pl';

export type PresentationAudioEntry = {
  storyId: string;
  language: PresentationAudioLanguage;
  format: PresentationAudioFormat;
  title: string;
  preferredVoiceName: 'hydra' | 'centaurus' | 'lyra';
};

const VOICE_BY_FORMAT: Record<PresentationAudioFormat, PresentationAudioEntry['preferredVoiceName']> = {
  story: 'hydra',
  graphic_novel: 'centaurus',
  mixed_story: 'lyra',
};

function entry(
  storyId: string,
  language: PresentationAudioLanguage,
  format: PresentationAudioFormat,
  title: string
): PresentationAudioEntry {
  return { storyId, language, format, title, preferredVoiceName: VOICE_BY_FORMAT[format] };
}

export const PRESENTATION_AUDIO_MANIFEST: readonly PresentationAudioEntry[] = [
  entry('9738b7b8-635c-40af-8ce5-edc1cfc9827f', 'uk', 'story', 'Місяць загубив позіхання'),
  entry('14a878de-d1b8-42df-be79-a841752277af', 'ru', 'story', 'Тропинка светлячков'),
  entry('d7db50d6-5b68-4e2d-bb99-818097d3ecae', 'en', 'story', "Momo's Quiet Morning"),
  entry('a50cbccf-185a-4d09-86d4-b4b0ca1f9bb4', 'es', 'story', 'Las dos canciones de Maya'),
  entry('b2dedbd4-e042-46e5-b389-54e583e3bd7e', 'de', 'story', 'Lina und der mutige kleine Schritt'),
  entry('ba90c888-5dcf-4b13-bd94-c25dc6ae2df2', 'fr', 'story', 'La lanterne de Mamie'),
  entry('ecc3ee04-6d39-47ba-b0da-f14d76d99844', 'pl', 'story', 'Ravi i kompas dżungli'),
  entry('a8c9e033-d1ab-46d7-b8d9-86a0dc6b9866', 'uk', 'graphic_novel', 'Естафета чесних кроків'),
  entry('b1c4db30-feb1-490d-a9ce-c63db5d13bc2', 'ru', 'graphic_novel', 'Город, который отвечал завтра'),
  entry('5a2ffaa3-00f9-4dbc-93b5-c402c422afb4', 'en', 'graphic_novel', 'The Power of Listening'),
  entry('54fa1247-da09-468a-b133-d800594b0eb2', 'es', 'graphic_novel', 'El mapa de la marea'),
  entry('093369f1-e3a9-41b1-8fe3-aaf038fa5639', 'de', 'graphic_novel', 'Die Werkstatt der fliegenden Räder'),
  entry('ef1795bf-6a4d-4655-946f-096b9aabd39e', 'fr', 'graphic_novel', 'Luma et la forêt des géants'),
  entry('69b097b0-a325-4a05-88c0-6d02e88e0d3d', 'pl', 'graphic_novel', 'Stacja po drugiej stronie Słońca'),
  entry('ba7b6a5e-2a75-48bf-aa58-06b030aea458', 'uk', 'mixed_story', 'Таємниця годинника на горищі'),
  entry('dfd71b69-f92d-4402-9d1f-45591836b52c', 'ru', 'mixed_story', 'Шорохи доброго чердака'),
  entry('9619264b-8470-4b83-8571-c2b6f72c613f', 'en', 'mixed_story', 'Why the Moon Follows Us'),
  entry('0bd7e934-cc38-4334-abe6-2ec8cc1a5880', 'es', 'mixed_story', 'La estación bajo el hielo'),
  entry('efec3f42-e211-4161-ab96-61fc87d42d04', 'de', 'mixed_story', 'Die Brücke aus Mondlicht'),
  entry('426af5b2-459a-49ea-aba9-e02c273b32e9', 'fr', 'mixed_story', 'L’école des sorts oubliés'),
  entry('de722aef-ccfa-448c-b928-4a28f0d13385', 'pl', 'mixed_story', 'Dwa domy, jedna opowieść'),
];

export const PRESENTATION_AUDIO_PERIOD = {
  start: '2026-07-18T22:27:41.620Z',
  end: '2026-08-18T22:27:41.620Z',
} as const;
