import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const { t, i18n } = useTranslation();
  const [consent, setConsent] = useState<AnalyticsConsent>(() => getAnalyticsConsent());
  const language = i18n.resolvedLanguage?.split('-')[0] ?? i18n.language?.split('-')[0] ?? 'en';
  const consentCopy = (
    i18n.getResourceBundle(language, 'translation') as
      | {
          analytics_consent?: {
            title?: string;
            body?: string;
            accept?: string;
            decline?: string;
          };
        }
      | undefined
  )?.analytics_consent;

  useEffect(
    () =>
      onAnalyticsConsentChange(() => {
        setConsent(getAnalyticsConsent());
      }),
    []
  );

  if (consent) {
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
        <Text style={styles.title}>
          {consentCopy?.title ??
            t('analytics_consent.title', { defaultValue: 'Optional analytics' })}
        </Text>
        <Text style={styles.body}>
          {consentCopy?.body ??
            t('analytics_consent.body', {
              defaultValue:
                'Help us improve WonderTales with product analytics. We do not send child names, photos, prompts, story text, or narration.',
            })}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => handleChoice('denied')}
          style={[styles.button, styles.secondaryButton]}
        >
          <Text style={styles.secondaryText}>
            {consentCopy?.decline ?? t('analytics_consent.decline', { defaultValue: 'Not now' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => handleChoice('granted')}
          style={[styles.button, styles.primaryButton]}
        >
          <Text style={styles.primaryText}>
            {consentCopy?.accept ??
              t('analytics_consent.accept', { defaultValue: 'Allow analytics' })}
          </Text>
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
