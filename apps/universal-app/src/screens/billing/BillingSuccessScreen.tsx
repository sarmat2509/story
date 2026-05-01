/**
 * M1: Shown after successful Stripe Checkout redirect.
 * Displays success message and redirects to Plans or Profile.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

export default function BillingSuccessScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['plans'] });
    queryClient.invalidateQueries({ queryKey: ['plans', 'with-auth'] });
    queryClient.invalidateQueries({ queryKey: ['bundles'] });
    queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
  }, [queryClient]);

  const handleGoToPlans = () => navigation.navigate('Plans');
  const handleGoToProfile = () => navigation.navigate('Profile');

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="checkmark-circle" size={80} color={theme.colors.status.success} />
      </View>
      <Text style={styles.title}>{t('billing.success_title')}</Text>
      <Text style={styles.message}>{t('billing.success_message')}</Text>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleGoToProfile}>
          <Text style={styles.primaryButtonText}>{t('billing.go_to_profile')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleGoToPlans}>
          <Text style={styles.secondaryButtonText}>{t('billing.view_plans')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background.primary,
  },
  iconContainer: {
    marginBottom: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
    textAlign: 'center',
  },
  message: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[8],
  },
  buttons: {
    gap: theme.spacing[4],
    width: '100%',
    maxWidth: 300,
  },
  primaryButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  secondaryButton: {
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
  },
  secondaryButtonText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
