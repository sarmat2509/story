import React, { useMemo, useState } from 'react';
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
import { modernColors, modernShadows } from '@/theme/modernTheme';
import { calculateGridCardWidth, getScenarioGridColumnCount } from '@/utils/responsiveGridLayout';

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
  /** Scheduler mode: reuse the card grid while collecting a set of worlds. */
  selectedScenarios?: Array<string | null>;
  onScenariosChange?: (ids: Array<string | null>) => void;
  schedulerMode?: boolean;
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
  sports_competitions: 'sports',
  science_facts: 'science-facts',
  holidays_traditions: 'holidays-traditions',
  families_cultures: 'family-cultures',
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

export function ScenarioCardsGrid({
  scenarios,
  selected,
  onSelect,
  selectedScenarios,
  onScenariosChange,
  schedulerMode = false,
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);

  // Add "Free theme" card at the beginning (use i18n)
  const freeThemeCard: ScenarioCard = {
    id: null,
    name: t('wizard.free_theme'),
    description: t('wizard.free_theme_desc'),
  };

  const allScenarios = [freeThemeCard, ...scenarios];

  const numColumns = gridWidth ? getScenarioGridColumnCount(gridWidth) : width < 520 ? 1 : 2;
  const isDesktop = width >= 1080;
  const cardWidth = useMemo(
    () =>
      gridWidth
        ? calculateGridCardWidth(gridWidth, numColumns, theme.spacing[3])
        : numColumns === 1
          ? '100%'
          : '48%',
    [gridWidth, numColumns]
  );

  return (
    <View style={styles.container} testID="wizard-scenario-grid">
      <Text style={styles.label}>
        {schedulerMode ? t('scheduler_wizard.themes_title') : t('wizard.theme_title')}
      </Text>
      {schedulerMode ? <Text style={styles.hint}>{t('scheduler_wizard.themes_hint')}</Text> : null}
      <View style={styles.grid} onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
        {allScenarios.map((scenario) => {
          const isSelected =
            selectedScenarios?.some((id) => id === scenario.id) ?? selected === scenario.id;

          return (
            <TouchableOpacity
              key={scenario.id || 'free'}
              style={[styles.card, isDesktop && styles.cardDesktop, { width: cardWidth }]}
              onPress={() => {
                if (selectedScenarios && onScenariosChange) {
                  if (schedulerMode && scenario.id === null) {
                    onScenariosChange(isSelected ? [] : [null]);
                  } else if (schedulerMode) {
                    const withoutFreeTheme = selectedScenarios.filter((id) => id !== null);
                    onScenariosChange(
                      isSelected
                        ? withoutFreeTheme.filter((id) => id !== scenario.id)
                        : [...withoutFreeTheme, scenario.id]
                    );
                  } else {
                    onScenariosChange(
                      isSelected
                        ? selectedScenarios.filter((id) => id !== scenario.id)
                        : [...selectedScenarios, scenario.id]
                    );
                  }
                } else onSelect(scenario.id);
              }}
              activeOpacity={0.82}
              testID={`wizard-scenario-${scenario.id || 'free'}`}
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
    padding: theme.spacing[5],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surface,
    ...modernShadows.subtle,
  },
  label: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  hint: {
    marginTop: -theme.spacing[2],
    marginBottom: theme.spacing[4],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
  },
  card: {
    backgroundColor: modernColors.surface,
    borderRadius: theme.borders.radius.lg,
    padding: 5,
    alignItems: 'stretch',
    minHeight: 176,
    justifyContent: 'flex-start',
    position: 'relative',
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    ...modernShadows.subtle,
  },
  cardDesktop: {
    minHeight: 160,
  },
  imageFrame: {
    width: '100%',
    minHeight: 164,
    aspectRatio: 1.38,
    borderRadius: theme.borders.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.primary,
    position: 'relative',
  },
  imageFrameDesktop: {
    minHeight: 148,
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
    zIndex: 2,
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
