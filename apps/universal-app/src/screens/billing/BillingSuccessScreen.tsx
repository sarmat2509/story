/**
 * M1: Shown after successful Stripe Checkout redirect.
 * Displays success message and redirects to Plans or Profile.
 */

import React, { useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { invalidateBillingState } from '@/api/plans';
import { getWebHistory, getWebHref, getWebSearch } from '@/utils/webRuntime';

export default function BillingSuccessScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const route = useRoute<RouteProp<MainDrawerParamList, 'BillingSuccess'>>();
  const queryClient = useQueryClient();
  const webSearch = getWebSearch();
  const checkoutKind =
    route.params?.kind ?? (webSearch ? new URLSearchParams(webSearch).get('kind') : null);
  const isBundleSuccess = checkoutKind === 'bundle';

  useEffect(() => {
    const href = getWebHref();
    const history = getWebHistory();
    if (href && history) {
      const url = new URL(href);
      if (url.searchParams.has('session_id')) {
        url.searchParams.delete('session_id');
        history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
    }

    invalidateBillingState(queryClient);
  }, [queryClient]);

  const handleGoToPlans = () => navigation.navigate('Plans');
  const handleGoToProfile = () => navigation.navigate('Profile');
  const handlePrimary = isBundleSuccess ? handleGoToPlans : handleGoToProfile;
  const handleSecondary = isBundleSuccess ? handleGoToProfile : handleGoToPlans;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t(isBundleSuccess ? 'billing.bundle_success_title' : 'billing.success_title'),
    });
  }, [isBundleSuccess, navigation, t]);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="checkmark-circle" size={80} color={theme.colors.status.success} />
      </View>
      <Text style={styles.title}>
        {t(isBundleSuccess ? 'billing.bundle_success_title' : 'billing.success_title')}
      </Text>
      <Text style={styles.message}>
        {t(isBundleSuccess ? 'billing.bundle_success_message' : 'billing.success_message')}
      </Text>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.primaryButton} onPress={handlePrimary}>
          <Text style={styles.primaryButtonText}>
            {t(isBundleSuccess ? 'billing.view_plans' : 'billing.go_to_profile')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleSecondary}>
          <Text style={styles.secondaryButtonText}>
            {t(isBundleSuccess ? 'billing.go_to_profile' : 'billing.view_plans')}
          </Text>
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
