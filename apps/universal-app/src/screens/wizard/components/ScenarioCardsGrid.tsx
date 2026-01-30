import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
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

export function ScenarioCardsGrid({ scenarios, selected, onSelect }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  
  // Add "Free theme" card at the beginning (use i18n)
  const freeThemeCard: ScenarioCard = {
    id: null,
    name: t('wizard.free_theme'),
    description: t('wizard.free_theme_desc'),
    icon: '✨'
  };
  
  const allScenarios = [freeThemeCard, ...scenarios];
  
  // Responsive columns: 2 on mobile, 3 on tablet, 4 on desktop
  const numColumns = width < 768 ? 2 : width < 1024 ? 3 : 4;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('wizard.theme_title')}</Text>
      <View style={styles.grid}>
        {allScenarios.map((scenario) => (
          <TouchableOpacity
            key={scenario.id || 'free'}
            style={[
              styles.card,
              { width: `${100 / numColumns - 2}%` },
              selected === scenario.id && styles.cardSelected
            ]}
            onPress={() => onSelect(scenario.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.cardIcon}>{scenario.icon || '📖'}</Text>
            <Text style={styles.cardName} numberOfLines={2}>
              {scenario.name}
            </Text>
            <Text style={styles.cardDescription} numberOfLines={2}>
              {scenario.description}
            </Text>
          </TouchableOpacity>
        ))}
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
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.border.light,
    padding: theme.spacing[4],
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
  },
  cardSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  cardIcon: {
    fontSize: 40,
    marginBottom: theme.spacing[2],
  },
  cardName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[1],
  },
  cardDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
});
