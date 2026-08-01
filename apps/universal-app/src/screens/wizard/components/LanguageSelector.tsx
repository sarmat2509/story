import React, { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, isValidLocale } from '@wondertales/shared';
import { APP_CONFIG } from '@/config/constants';
import { theme } from '@/theme';
import { modernColors, modernShadows } from '@/theme/modernTheme';

interface Props {
  selected: string;
  onSelect: (lang: string) => void;
  /** Scheduler mode: use the same language chips as a multi-select set. */
  selectedLanguages?: string[];
  onLanguagesChange?: (languages: string[]) => void;
  defaultLanguage: string;
  allowedLanguageCodes?: string[];
  schedulerMode?: boolean;
}

export function LanguageSelector({
  selected,
  onSelect,
  selectedLanguages,
  onLanguagesChange,
  defaultLanguage,
  allowedLanguageCodes,
  schedulerMode = false,
}: Props) {
  const { t } = useTranslation();
  const languages = useMemo(
    () =>
      APP_CONFIG.supportedLanguages
        .map((code) => {
          const config = SUPPORTED_LANGUAGES[code];
          return {
            code,
            label: t(`language_names.${code}`, { defaultValue: config.nativeName }),
            flag: config.flag,
          };
        })
        .filter(
          (lang) => !allowedLanguageCodes?.length || allowedLanguageCodes.includes(lang.code)
        ),
    [allowedLanguageCodes, t]
  );

  // Auto-select default language on mount if no selection
  useEffect(() => {
    const normalizedDefaultLanguage = defaultLanguage?.split('-')[0]?.toLowerCase() || '';
    if (!selected && normalizedDefaultLanguage && isValidLocale(normalizedDefaultLanguage)) {
      const nextLanguage = languages.some((lang) => lang.code === normalizedDefaultLanguage)
        ? normalizedDefaultLanguage
        : languages[0]?.code;
      if (nextLanguage) onSelect(nextLanguage);
    }
  }, [defaultLanguage, languages, onSelect, selected]);

  useEffect(() => {
    if (selected && languages.length > 0 && !languages.some((lang) => lang.code === selected)) {
      onSelect(languages[0].code);
    }
  }, [languages, onSelect, selected]);

  return (
    <View style={styles.container} testID="wizard-language-selector">
      <Text style={styles.label}>
        {schedulerMode ? t('scheduler_wizard.languages_title') : t('wizard.language')}
      </Text>
      {schedulerMode ? (
        <Text style={styles.hint}>{t('scheduler_wizard.languages_hint')}</Text>
      ) : null}
      <View style={styles.chipsContainer}>
        {languages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[
              styles.chip,
              (selectedLanguages?.includes(lang.code) ?? selected === lang.code) &&
                styles.chipSelected,
            ]}
            onPress={() => {
              if (selectedLanguages && onLanguagesChange) {
                onLanguagesChange(
                  selectedLanguages.includes(lang.code)
                    ? selectedLanguages.filter((code) => code !== lang.code)
                    : [...selectedLanguages, lang.code]
                );
              } else onSelect(lang.code);
            }}
            activeOpacity={0.7}
            testID={`wizard-language-${lang.code}`}
          >
            <Text style={styles.flag}>{lang.flag}</Text>
            <Text
              style={[
                styles.chipText,
                (selectedLanguages?.includes(lang.code) ?? selected === lang.code) &&
                  styles.chipTextSelected,
              ]}
            >
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
    padding: theme.spacing[4],
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
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    padding: theme.spacing[1],
    borderRadius: theme.borders.radius.lg,
    backgroundColor: modernColors.surfaceMuted,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: 'transparent',
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: theme.colors.background.primary,
    borderColor: theme.colors.interactive.primary,
    ...modernShadows.subtle,
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
    color: theme.colors.primary[700],
  },
});
