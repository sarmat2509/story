import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from '@/components/AppLinearGradient';
import { API_BASE_URL } from '@/config/constants';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';

interface ScenarioCard {
  id: string | null;
  name: string;
  description: string;
  icon?: string;
}

interface Props {
  scenarios: ScenarioCard[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

const TOPIC_IMAGE_BASE_WEB = '/landing/topics/optimized';
const TOPIC_IMAGE_BASE_NATIVE = '/landing/topics';

const TOPIC_IMAGE_BY_SCENARIO_ID: Record<string, string> = {
  free: 'any',
  magic_wizards: 'magic',
  fantasy_creatures: 'creatures',
  mysteries_detectives: 'detective',
  space_odyssey: 'space',
  medieval_heroes: 'heroes',
  sea_treasures: 'treasure',
  super_powers: 'super-power',
  enchanted_forest: 'forest',
  inventors: 'science',
  jungle_adventures: 'jungles',
  scary_stories: 'ghost',
  expeditions_world_travel: 'geography',
  macro_scifi: 'robot',
};

function getTopicImageUri(scenarioId: string | null) {
  const imageName =
    TOPIC_IMAGE_BY_SCENARIO_ID[scenarioId ?? 'free'] ?? TOPIC_IMAGE_BY_SCENARIO_ID.free;

  if (Platform.OS === 'web') {
    return `${TOPIC_IMAGE_BASE_WEB}/${imageName}.webp`;
  }

  // Native Image requires an absolute URL. Use PNG to avoid platform-specific WebP issues.
  return `${API_BASE_URL.replace(/\/$/, '')}${TOPIC_IMAGE_BASE_NATIVE}/${imageName}.png`;
}

export function ScenarioCardsGrid({ scenarios, selected, onSelect }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  // Add "Free theme" card at the beginning (use i18n)
  const freeThemeCard: ScenarioCard = {
    id: null,
    name: t('wizard.free_theme'),
    description: t('wizard.free_theme_desc'),
  };

  const allScenarios = [freeThemeCard, ...scenarios];

  const numColumns = width < 520 ? 1 : width < 768 ? 2 : width < 1080 ? 3 : 4;
  const isDesktop = width >= 1080;
  const cardWidth =
    numColumns === 1 ? '100%' : numColumns === 2 ? '48%' : numColumns === 3 ? '31%' : '23.5%';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('wizard.theme_title')}</Text>
      <View style={styles.grid}>
        {allScenarios.map((scenario) => {
          const isSelected = selected === scenario.id;

          return (
            <TouchableOpacity
              key={scenario.id || 'free'}
              style={[styles.card, isDesktop && styles.cardDesktop, { width: cardWidth }]}
              onPress={() => onSelect(scenario.id)}
              activeOpacity={0.82}
            >
              {isSelected ? <View pointerEvents="none" style={styles.selectedOutline} /> : null}
              <View style={[styles.imageFrame, isDesktop && styles.imageFrameDesktop]}>
                <Image
                  source={{ uri: getTopicImageUri(scenario.id) }}
                  style={styles.topicImage}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.58)', 'rgba(0,0,0,0.88)']}
                  locations={[0.12, 0.58, 1]}
                  style={styles.gradientOverlay}
                  pointerEvents="none"
                />
                {isSelected ? (
                  <View pointerEvents="none" style={styles.selectedCheck}>
                    <Ionicons name="checkmark" size={18} color={theme.colors.interactive.primary} />
                  </View>
                ) : null}
                <View style={styles.cardContent}>
                  <Text style={styles.cardName}>{scenario.name}</Text>
                  <Text style={styles.cardDescription}>{scenario.description}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing[6],
  },
  label: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
  },
  card: {
    backgroundColor: 'transparent',
    borderRadius: theme.borders.radius.lg,
    padding: 6,
    alignItems: 'stretch',
    minHeight: 204,
    justifyContent: 'flex-start',
    position: 'relative',
  },
  cardDesktop: {
    minHeight: 176,
  },
  imageFrame: {
    width: '100%',
    minHeight: 192,
    aspectRatio: 1.38,
    borderRadius: theme.borders.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.primary,
    position: 'relative',
  },
  imageFrameDesktop: {
    minHeight: 164,
    aspectRatio: 1.68,
  },
  selectedOutline: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 3,
    borderColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.lg,
  },
  selectedCheck: {
    position: 'absolute',
    top: theme.spacing[2],
    right: theme.spacing[2],
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  topicImage: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    top: '50%',
    right: 0,
    bottom: 0,
    left: 0,
  },
  cardContent: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[8],
    paddingBottom: theme.spacing[3],
  },
  cardName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
    textAlign: 'left',
    marginBottom: theme.spacing[1],
  },
  cardDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: 'rgba(255,255,255,0.86)',
    textAlign: 'left',
    lineHeight: 19,
  },
});
