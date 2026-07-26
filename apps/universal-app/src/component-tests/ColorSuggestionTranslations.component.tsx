import en from '@wondertales/shared/i18n/en.json';
import uk from '@wondertales/shared/i18n/uk.json';
import ru from '@wondertales/shared/i18n/ru.json';
import es from '@wondertales/shared/i18n/es.json';
import fr from '@wondertales/shared/i18n/fr.json';
import de from '@wondertales/shared/i18n/de.json';
import pl from '@wondertales/shared/i18n/pl.json';

const colorSuggestionKeys = [
  'rainbow',
  'gold',
  'silver',
  'sparkly',
  'transparent',
  'glowing',
  'changing',
  'purple',
  'pink',
  'blue',
  'green',
  'red',
  'yellow',
  'orange',
  'multicolor',
  'pastel',
];

describe('color suggestion translations', () => {
  it.each([
    ['en', en],
    ['uk', uk],
    ['ru', ru],
    ['es', es],
    ['fr', fr],
    ['de', de],
    ['pl', pl],
  ])('provides every color pill label for %s', (_locale, translation) => {
    const labels = translation.character_form.color_suggestions;

    for (const key of colorSuggestionKeys) {
      expect(labels[key as keyof typeof labels]).toEqual(expect.any(String));
      expect(labels[key as keyof typeof labels]).not.toHaveLength(0);
    }
  });
});
