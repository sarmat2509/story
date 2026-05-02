import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { disablePostHogClient, getPostHogClient } from '@/services/analytics/posthogProvider';
import {
  getAnalyticsConsent,
  onAnalyticsConsentChange,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from '@/services/analytics/consent';
import { theme } from '@/theme';

export function AnalyticsConsentBanner() {
  const { t } = useTranslation();
  const [consent, setConsent] = useState<AnalyticsConsent>(() => getAnalyticsConsent());

  useEffect(() => onAnalyticsConsentChange(() => {
    setConsent(getAnalyticsConsent());
  }), []);

  if (Platform.OS !== 'web' || consent) {
    return null;
  }

  const handleChoice = (choice: Exclude<AnalyticsConsent, null>) => {
    setAnalyticsConsent(choice);
    setConsent(choice);
    if (choice === 'granted') {
      getPostHogClient();
    } else {
      disablePostHogClient();
    }
  };

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.copy}>
        <Text style={styles.title}>{t('analytics_consent.title')}</Text>
        <Text style={styles.body}>{t('analytics_consent.body')}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => handleChoice('denied')}
          style={[styles.button, styles.secondaryButton]}
        >
          <Text style={styles.secondaryText}>{t('analytics_consent.decline')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => handleChoice('granted')}
          style={[styles.button, styles.primaryButton]}
        >
          <Text style={styles.primaryText}>{t('analytics_consent.accept')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 1000,
    alignSelf: 'center',
    maxWidth: 760,
    borderRadius: theme.borders.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing[4],
    gap: theme.spacing[4],
    shadowColor: theme.colors.neutral[900],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
  },
  copy: {
    gap: theme.spacing[1],
  },
  title: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  body: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
    flexWrap: 'wrap',
  },
  button: {
    minHeight: 40,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
  },
  primaryButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  secondaryText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  primaryText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
