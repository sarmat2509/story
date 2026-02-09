import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '@/theme';

interface Language {
  code: string;
  label: string;
  flag: string;
}

interface Props {
  selected: string;
  onSelect: (lang: string) => void;
  defaultLanguage: string;
}

const languages: Language[] = [
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' }
];

export function LanguageSelector({ selected, onSelect, defaultLanguage }: Props) {
  // Auto-select default language on mount if no selection
  useEffect(() => {
    if (!selected && defaultLanguage) {
      onSelect(defaultLanguage);
    }
  }, [defaultLanguage]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Мова історії</Text>
      <View style={styles.chipsContainer}>
        {languages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[
              styles.chip,
              selected === lang.code && styles.chipSelected
            ]}
            onPress={() => onSelect(lang.code)}
            activeOpacity={0.7}
          >
            <Text style={styles.flag}>{lang.flag}</Text>
            <Text style={[
              styles.chipText,
              selected === lang.code && styles.chipTextSelected
            ]}>
              {lang.label}
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
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.border.light,
  },
  chipSelected: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  flag: {
    fontSize: theme.typography.fontSize.lg,
    marginRight: theme.spacing[2],
  },
  chipText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  chipTextSelected: {
    color: theme.colors.text.inverse,
  },
});
