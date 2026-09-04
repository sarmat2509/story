import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';

interface AudioGenerationLimitReachedProps {
  used: number;
  limit: number;
  bundleHintText: string;
  showUpgrade?: boolean;
  onUpgrade?: () => void;
  onViewPricing?: () => void;
}

/** Account-level audio quota state, rendered before an audio file exists. */
export function AudioGenerationLimitReached({
  used,
  limit,
  bundleHintText,
  showUpgrade = true,
  onUpgrade = () => undefined,
  onViewPricing = () => undefined,
}: AudioGenerationLimitReachedProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.title}>{t('story_viewer.audio_limit_reached')}</Text>
      <Text style={styles.message}>{t('story_viewer.audio_limit_message', { used, limit })}</Text>

      {showUpgrade ? (
        <>
          <AppButton label={t('story_viewer.upgrade_plan')} onPress={onUpgrade} style={styles.action} />
          <Text style={styles.details}>{t('story_viewer.next_plan_benefit')}</Text>
          <Text style={styles.details}>{bundleHintText}</Text>
          <TouchableOpacity onPress={onViewPricing} accessibilityRole="link">
            <Text style={styles.pricingLink}>{t('story_viewer.bundle_pricing_link')}</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: theme.spacing[4],
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
    textAlign: 'center',
  },
  message: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  action: {
    marginBottom: theme.spacing[4],
  },
  details: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
  pricingLink: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.interactive.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
});
