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

const imaginarySizeKeys = [
  'tiny',
  'small',
  'medium',
  'large',
  'giant',
  'changes_size',
  'fits_in_pocket',
  'as_tall_as_tree',
  'microscopic',
];

const magicalFeatureKeys = [
  'wings',
  'horns',
  'tail',
  'sparkles',
  'glow',
  'invisibility',
  'flight',
  'magic_powers',
  'shape_shifting',
  'teleportation',
  'fire_breath',
  'ice_breath',
  'super_strength',
  'healing',
  'mind_reading',
  'time_travel',
  'color_changing',
  'size_changing',
  'rainbow_mane',
  'golden_hooves',
  'crystal_scales',
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

  it.each([
    ['en', en],
    ['uk', uk],
    ['ru', ru],
  ])('provides every imaginary size and magical feature pill label for %s', (_locale, translation) => {
    const sizeLabels = translation.character_form.imaginary_sizes;
    const featureLabels = translation.character_form.magical_feature_options;

    for (const key of imaginarySizeKeys) {
      expect(sizeLabels[key as keyof typeof sizeLabels]).toEqual(expect.any(String));
    }
    for (const key of magicalFeatureKeys) {
      expect(featureLabels[key as keyof typeof featureLabels]).toEqual(expect.any(String));
    }
  });
});
