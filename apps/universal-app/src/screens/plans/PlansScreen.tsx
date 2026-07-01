import React, { useState, useLayoutEffect, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  Alert,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from '@/components/AppLinearGradient';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import {
  usePlansCatalog,
  usePlansWithAuth,
  useUpgradePlan,
  useCreateCheckoutSession,
  useUpdateBillingCurrency,
  useBundles,
  useCreateBundleCheckoutSession,
  useSubscriptionUsage,
  invalidateBillingState,
} from '@/api/plans';
import type { BillingCurrency } from '@wondertales/shared';
import { formatSubscriptionPeriodEnd } from '@/utils/formatSubscriptionPeriodEnd';
import { hexAlpha } from '@/theme/colorAlpha';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';
import { modernColors, modernShadows } from '@/theme/modernTheme';
import { Ionicons } from '@expo/vector-icons';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AnimatedSection } from '@/components/AnimatedSection';
import { ExpandableCard } from '@/components/ExpandableCard';
import { AppButton } from '@/components/AppButton';
import { assignWebLocation } from '@/utils/webRuntime';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import {
  isRevenueCatConfigured,
  purchaseRevenueCatPlan,
  restoreRevenueCatPurchases,
} from '@/services/revenueCatService';
import {
  formatPricingPrice,
  buildPricingFaqItems,
  getCombinedPricingUsageHighlight,
  getPricingFeatureLabel,
  isPricingFeatureAvailable,
  normalizePricingLocale,
  sortPricingFeatureEntries,
  type PricingTranslate,
} from '@wondertales/shared';

const cardDelay = (i: number) => Math.min(120 + i * 120, 420);

const BUNDLE_CARD_WIDTH = 276;
const BILLING_CURRENCY_OPTIONS: BillingCurrency[] = ['EUR', 'USD'];

function getPlanFeatureLimit(
  features: Record<string, any> | undefined,
  slug: string
): number | null {
  const value = features?.[slug]?.value;
  const limit =
    value && typeof value === 'object' && 'limit' in value ? Number(value.limit) : null;
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : null;
}

export default function PlansScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const enterKey = useScreenEnter();
  const { width: windowWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const bundleGridLayout = isWeb || windowWidth >= 720;
  const [selectedBillingCurrency, setSelectedBillingCurrency] = useState<BillingCurrency | undefined>(
    undefined
  );

  // Modal state for upgrade flow
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [nativeBillingPending, setNativeBillingPending] = useState(false);
  const [nativeBillingError, setNativeBillingError] = useState<Error | null>(null);
  const [nativeBillingSuccess, setNativeBillingSuccess] = useState(false);
  const upgradePlan = useUpgradePlan();
  const createCheckoutSession = useCreateCheckoutSession();
  const updateBillingCurrency = useUpdateBillingCurrency();
  const createBundleCheckout = useCreateBundleCheckoutSession();
  const { data: subscriptionUsage } = useSubscriptionUsage(isAuthenticated);
  const periodEndFormatted = useMemo(
    () =>
      formatSubscriptionPeriodEnd(
        subscriptionUsage?.currentPeriodEnd ?? subscriptionUsage?.resetsAt,
        i18n.language
      ),
    [subscriptionUsage?.currentPeriodEnd, subscriptionUsage?.resetsAt, i18n.language]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation]);

  // Fetch plans - use authenticated hook if logged in, otherwise public
  const publicPlansQuery = usePlansCatalog(selectedBillingCurrency ?? 'EUR');
  const authPlansQuery = usePlansWithAuth(isAuthenticated, selectedBillingCurrency);

  // Select appropriate query based on auth state
  const authData = authPlansQuery.data;
  const authStatus = (authPlansQuery.error as { response?: { status?: number } } | null)?.response
    ?.status;
  const authUnauthorized = authStatus === 401;
  const effectiveIsAuthenticated = isAuthenticated && !authUnauthorized;
  const billingCurrency: BillingCurrency =
    selectedBillingCurrency ??
    authData?.billingCurrency ??
    publicPlansQuery.data?.billingCurrency ??
    'EUR';

  useEffect(() => {
    if (!selectedBillingCurrency && effectiveIsAuthenticated && authData?.preferredBillingCurrency) {
      setSelectedBillingCurrency(authData.preferredBillingCurrency);
    }
  }, [authData?.preferredBillingCurrency, effectiveIsAuthenticated, selectedBillingCurrency]);

  const handleBillingCurrencyChange = useCallback(
    (currency: BillingCurrency) => {
      setSelectedBillingCurrency(currency);
      if (effectiveIsAuthenticated) {
        updateBillingCurrency.mutate(currency);
      }
    },
    [effectiveIsAuthenticated, updateBillingCurrency]
  );

  const plans = effectiveIsAuthenticated
    ? authData && 'plans' in authData
      ? authData.plans
      : authData
    : publicPlansQuery.data?.plans;
  const featureUnlockPlanNames = useMemo(() => {
    const unlockMap: Record<string, string> = {};
    const sortedPlans = [...(plans ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

    for (const plan of sortedPlans) {
      for (const [slug, feature] of sortPricingFeatureEntries(
        plan.features as Record<string, any>
      )) {
        if (!unlockMap[slug] && isPricingFeatureAvailable(feature)) {
          unlockMap[slug] = plan.name;
        }
      }
    }

    return unlockMap;
  }, [plans]);
  const currentPlan = useMemo(() => {
    if (!effectiveIsAuthenticated || !Array.isArray(plans)) return null;
    return (
      (plans.find((plan: any) => 'isCurrent' in plan && plan.isCurrent) as
        | { slug: string; name: string; features?: Record<string, any> }
        | undefined) ?? null
    );
  }, [effectiveIsAuthenticated, plans]);
  const currentPlanSlug = currentPlan?.slug ?? null;
  const currentPlanName = currentPlan?.name ?? null;
  const currentPlanBundleComicRatio = useMemo(() => {
    const storiesLimit = getPlanFeatureLimit(currentPlan?.features, 'stories_per_month');
    const comicsLimit = getPlanFeatureLimit(currentPlan?.features, 'graphic_novels_per_month');
    return storiesLimit && comicsLimit ? comicsLimit / storiesLimit : 0;
  }, [currentPlan?.features]);
  const bundlesQuery = useBundles(effectiveIsAuthenticated, currentPlanSlug, billingCurrency);
  const sortedBundles = useMemo(() => {
    const rows = bundlesQuery.data;
    if (!rows?.length) return [];
    return [...rows].sort((a, b) => a.extraStories - b.extraStories);
  }, [bundlesQuery.data]);
  const enableRealPayments =
    effectiveIsAuthenticated && authData && 'enableRealPayments' in authData
      ? authData.enableRealPayments
      : (publicPlansQuery.data?.enableRealPayments ?? false);
  const revenueCatReady = isRevenueCatConfigured();
  const nativeBillingUnavailable = enableRealPayments && !isWeb && !revenueCatReady;
  const useRevenueCatFlow = enableRealPayments && !isWeb && revenueCatReady;
  const isLoading = effectiveIsAuthenticated
    ? authPlansQuery.isLoading
    : publicPlansQuery.isLoading;
  const error = effectiveIsAuthenticated ? authPlansQuery.error : publicPlansQuery.error;

  // Handle upgrade: Stripe (web) or stub (mobile / when disabled)
  const handleUpgrade = async () => {
    if (!selectedPlan) return;
    if (!enableRealPayments && selectedPlan.priceMonthly > 0) return;

    if (enableRealPayments && isWeb) {
      try {
        const { url } = await createCheckoutSession.mutateAsync({
          planSlug: selectedPlan.slug,
          currency: billingCurrency,
        });
        if (url && assignWebLocation(url)) {
          return;
        }
      } catch (err: unknown) {
        console.error('Checkout failed:', err);
        // Modal will show error via createCheckoutSession.isError
      }
      return;
    }

    if (useRevenueCatFlow) {
      if (!revenueCatReady) {
        setNativeBillingError(new Error(t('plans.revenuecat_not_configured')));
        return;
      }
      try {
        setNativeBillingPending(true);
        setNativeBillingError(null);
        setNativeBillingSuccess(false);
        await purchaseRevenueCatPlan(selectedPlan.slug);
        setNativeBillingSuccess(true);
        invalidateBillingState(queryClient);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(t('plans.upgrade_error_message'));
        setNativeBillingError(error);
      } finally {
        setNativeBillingPending(false);
      }
      return;
    }

    try {
      await upgradePlan.mutateAsync(selectedPlan.slug);
      const { getAnalytics } = await import('@/services/analytics');
      getAnalytics().capture('plan_upgraded', { plan_slug: selectedPlan.slug });
    } catch (err: unknown) {
      console.error('Upgrade failed:', err);
    }
  };

  const pricingLocale = normalizePricingLocale(i18n.language);
  const translatePricing = useCallback<PricingTranslate>(
    (key, params, defaultValue) =>
      String(t(`plans.${key}` as never, { ...(params ?? {}), defaultValue } as never)),
    [t]
  );
  const pricingFaqItems = useMemo(
    () => buildPricingFaqItems({ translate: translatePricing, periodEnd: periodEndFormatted }),
    [periodEndFormatted, translatePricing]
  );

  // Helper to format price
  const formatPrice = useCallback(
    (priceMonthly: number, currency: string) => {
      return formatPricingPrice(pricingLocale, priceMonthly, currency, t('plans.free'));
    },
    [pricingLocale, t]
  );

  const handleBundlePurchase = useCallback(
    async (bundleSlug: string) => {
      setBundleError(null);
      if (enableRealPayments && isWeb) {
        try {
          const { url } = await createBundleCheckout.mutateAsync({
            bundleSlug,
            currency: billingCurrency,
          });
          if (url && assignWebLocation(url)) {
            return;
          }
        } catch (err) {
          console.error('Bundle checkout failed:', err);
          setBundleError(getLocalizedApiError(t, err, 'plans.bundle_checkout_error'));
        }
        return;
      }
      if (enableRealPayments && !isWeb) {
        Alert.alert('', t('plans.bundles.native_unavailable'));
      }
    },
    [enableRealPayments, isWeb, createBundleCheckout, t]
  );

  const bundleCardEls = useMemo(
    () =>
      sortedBundles.map((b, idx) => {
        const canBuy = enableRealPayments && isWeb;
        const featured = sortedBundles.length >= 3 && idx === Math.floor(sortedBundles.length / 2);
        const extraComics = Math.floor(b.extraStories * currentPlanBundleComicRatio);
        return (
          <View
            key={b.slug}
            style={[
              styles.bundleCard,
              { width: BUNDLE_CARD_WIDTH },
              featured && styles.bundleCardFeatured,
            ]}
          >
            <LinearGradient
              colors={[theme.colors.primary[400], theme.colors.primary[600]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.bundleCardAccent}
            />
            <View style={styles.bundleCardBody}>
              <Text style={styles.bundleName}>
                {t(`plans.bundles.slug_titles.${b.slug}` as never, { defaultValue: b.name })}
              </Text>
              <Text style={styles.bundleStoriesHero}>+{b.extraStories}</Text>
              <Text style={styles.bundleStoriesHint}>{t('plans.bundles.stories_word')}</Text>
              <View style={styles.bundleMetaList}>
                <View style={styles.bundleMetaRow}>
                  <Ionicons name="headset-outline" size={15} color={theme.colors.text.tertiary} />
                  <Text style={styles.bundleMetaText}>
                    {t('plans.bundles.audio_within_stories', {
                      audio: b.extraAudio,
                      stories: b.extraStories,
                    })}
                  </Text>
                </View>
                {extraComics > 0 ? (
                  <View style={styles.bundleMetaRow}>
                    <Ionicons name="book-outline" size={15} color={theme.colors.text.tertiary} />
                    <Text style={styles.bundleMetaText}>
                      {t('plans.bundles.comics_within_stories', {
                        comics: extraComics,
                        stories: b.extraStories,
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.bundlePrice}>{formatPrice(b.priceMinor, b.pricingCurrency)}</Text>
              <AppButton
                label={t('plans.bundles.buy_button')}
                disabled={!canBuy || createBundleCheckout.isPending}
                loading={createBundleCheckout.isPending}
                onPress={() => handleBundlePurchase(b.slug)}
                size="md"
                style={styles.bundleBuyAction}
              />
            </View>
          </View>
        );
      }),
    [
      sortedBundles,
      enableRealPayments,
      isWeb,
      t,
      formatPrice,
      handleBundlePurchase,
      createBundleCheckout.isPending,
      billingCurrency,
      currentPlanBundleComicRatio,
    ]
  );

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { paddingTop: theme.spacing[6] + insets.top }]}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('plans.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centerContainer, { paddingTop: theme.spacing[6] + insets.top }]}>
        <Text style={styles.errorTitle}>{t('plans.error_title')}</Text>
        <Text style={styles.errorMessage}>{t('plans.error_message')}</Text>
        <AppButton
          label={t('common.back')}
          onPress={() => navigation.goBack()}
          variant="secondary"
          style={styles.errorBackAction}
        />
      </View>
    );
  }

  const useStripeFlow = enableRealPayments && isWeb;
  const modalPending = useStripeFlow
    ? createCheckoutSession.isPending
    : useRevenueCatFlow
      ? nativeBillingPending
      : upgradePlan.isPending;
  const modalError = useStripeFlow
    ? createCheckoutSession.isError
    : useRevenueCatFlow
      ? !!nativeBillingError
      : upgradePlan.isError;
  const modalErrorData = useStripeFlow
    ? createCheckoutSession.error
    : useRevenueCatFlow
      ? nativeBillingError
      : upgradePlan.error;
  const resetModal = () => {
    setShowUpgradeModal(false);
    setSelectedPlan(null);
    upgradePlan.reset();
    createCheckoutSession.reset();
    setNativeBillingError(null);
    setNativeBillingSuccess(false);
  };

  const handleRestorePurchases = async () => {
    if (!revenueCatReady) {
      Alert.alert('', t('plans.revenuecat_not_configured'));
      return;
    }

    try {
      setNativeBillingPending(true);
      await restoreRevenueCatPurchases();
      invalidateBillingState(queryClient);
      Alert.alert(t('plans.restore_success_title'), t('plans.restore_success_message'));
    } catch (err) {
      Alert.alert(
        t('common.error'),
        err instanceof Error ? err.message : t('plans.restore_error_message')
      );
    } finally {
      setNativeBillingPending(false);
    }
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: theme.spacing[6] + insets.top },
        ]}
      >
        <AnimatedSection delay={0} trigger={enterKey}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('plans.title')}</Text>
            <Text style={styles.subtitle}>{t('plans.subtitle')}</Text>
            <View style={styles.currencyToggle}>
              {BILLING_CURRENCY_OPTIONS.map((currency) => {
                const selected = billingCurrency === currency;
                return (
                  <TouchableOpacity
                    key={currency}
                    style={[
                      styles.currencyToggleButton,
                      selected && styles.currencyToggleButtonSelected,
                    ]}
                    onPress={() => handleBillingCurrencyChange(currency)}
                    disabled={selected || updateBillingCurrency.isPending}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.currencyToggleText,
                        selected && styles.currencyToggleTextSelected,
                      ]}
                    >
                      {currency === 'EUR' ? '€ EUR' : '$ USD'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </AnimatedSection>

        <View style={[styles.plansGrid, isWeb && styles.plansGridWeb]}>
          {plans?.map((plan, planIndex) => {
            const isCurrent = isAuthenticated && 'isCurrent' in plan && plan.isCurrent;
            const isFreePlan = plan.slug === 'free';
            const isPaidPlan = plan.priceMonthly > 0;
            const paidCtaDisabled = isPaidPlan && (!enableRealPayments || nativeBillingUnavailable);
            const usageHighlight = getCombinedPricingUsageHighlight(
              pricingLocale,
              translatePricing,
              plan.features as Record<string, any>
            );

            // Determine button type
            let buttonType: 'subscribe' | 'upgrade' | 'downgrade' | 'current' = 'subscribe';
            if (effectiveIsAuthenticated && 'isCurrent' in plan) {
              if (plan.isCurrent) {
                buttonType = 'current';
              } else {
                const currentPlan = plans.find((p: any) => 'isCurrent' in p && p.isCurrent);
                if (currentPlan && plan.sortOrder > (currentPlan as any).sortOrder) {
                  buttonType = 'upgrade';
                } else if (currentPlan) {
                  buttonType = 'downgrade';
                }
              }
            }

            return (
              <AnimatedSection
                key={plan.id}
                delay={cardDelay(planIndex)}
                trigger={enterKey}
                style={
                  [
                    styles.planCard,
                    isWeb ? styles.planCardWeb : styles.planCardNative,
                    isCurrent && styles.planCardCurrent,
                  ] as ViewStyle[]
                }
              >
                <Text style={styles.planName}>{plan.name}</Text>
                {plan.description && <Text style={styles.planDescription}>{plan.description}</Text>}

                <View style={styles.priceContainer}>
                  <Text style={styles.price}>
                    {formatPrice(plan.priceMonthly, plan.pricingCurrency)}
                  </Text>
                  {plan.priceMonthly > 0 && (
                    <Text style={styles.pricePeriod}>/{t('plans.per_month')}</Text>
                  )}
                </View>

                {usageHighlight && (
                  <View style={styles.highlightFeature}>
                    <Ionicons name="sparkles" size={20} color={theme.colors.interactive.primary} />
                    <Text style={styles.highlightFeatureText}>{usageHighlight}</Text>
                  </View>
                )}

                {/* Features list */}
                <View style={styles.featuresContainer}>
                  {sortPricingFeatureEntries(plan.features as Record<string, any>).map(
                    ([slug, feature]: [string, any]) => {
                      const available = isPricingFeatureAvailable(feature);
                      const unlockPlanName = !available ? featureUnlockPlanNames[slug] : null;

                      return (
                        <View key={slug} style={styles.featureRow}>
                          <Ionicons
                            name={available ? 'checkmark-circle' : 'close-circle'}
                            size={16}
                            color={
                              available ? theme.colors.status.success : theme.colors.text.tertiary
                            }
                          />
                          <View style={styles.featureCopy}>
                            <Text
                              style={[styles.featureText, !available && styles.featureTextDisabled]}
                            >
                              {getPricingFeatureLabel(
                                pricingLocale,
                                translatePricing,
                                slug,
                                feature
                              )}
                            </Text>
                            {unlockPlanName ? (
                              <Text style={styles.featureLockedReason}>
                                {t('plans.feature_unlocked_on', { planName: unlockPlanName })}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    }
                  )}
                </View>

                {/* Action button based on user state and plan tier */}
                {buttonType === 'current' ? (
                  <View style={styles.currentPlanButton}>
                    <Text style={styles.currentPlanButtonText}>{t('plans.your_plan')}</Text>
                  </View>
                ) : paidCtaDisabled ? (
                  <View style={styles.unavailablePlanButton}>
                    <Text style={styles.unavailablePlanButtonText}>
                      {t('plans.payments_disabled_button', {
                        defaultValue: 'Payments coming soon',
                      })}
                    </Text>
                  </View>
                ) : buttonType === 'upgrade' ? (
                  <AppButton
                    label={t('plans.upgrade_button')}
                    onPress={() => {
                      setSelectedPlan(plan);
                      setShowUpgradeModal(true);
                    }}
                    style={styles.planAction}
                  />
                ) : buttonType === 'downgrade' && isFreePlan ? null : buttonType === 'downgrade' ? (
                  <AppButton
                    label={t('plans.subscribe_button')}
                    onPress={() => {
                      setSelectedPlan(plan);
                      setShowUpgradeModal(true);
                    }}
                    style={styles.planAction}
                  />
                ) : (
                  <AppButton
                    label={t('plans.subscribe_button')}
                    onPress={() => navigation.navigate('Welcome')}
                    style={styles.planAction}
                  />
                )}
              </AnimatedSection>
            );
          })}
        </View>

        {effectiveIsAuthenticated && (
          <AnimatedSection delay={80} trigger={enterKey}>
            <View style={styles.bundleSection}>
              <View style={styles.bundleShell}>
                <View style={styles.bundleHeaderBlock}>
                  <Text style={styles.bundleSectionTitle}>{t('plans.bundles.section_title')}</Text>
                  {currentPlanName ? (
                    <Text style={styles.bundlePlanContext}>
                      {t('plans.bundles.plan_context', { planName: currentPlanName })}
                    </Text>
                  ) : null}
                  <Text style={styles.bundleSectionSubtitle}>
                    {periodEndFormatted
                      ? t('plans.bundles.section_subtitle', { periodEnd: periodEndFormatted })
                      : t('plans.bundles.section_subtitle_no_date')}
                  </Text>
                  {bundleError ? <Text style={styles.bundleErrorText}>{bundleError}</Text> : null}
                </View>

                {bundlesQuery.isLoading ? (
                  <View style={styles.bundleLoadingBox}>
                    <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
                  </View>
                ) : sortedBundles.length > 0 ? (
                  bundleGridLayout ? (
                    <View style={styles.bundleCardsGrid}>{bundleCardEls}</View>
                  ) : (
                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      showsHorizontalScrollIndicator={false}
                      style={styles.bundleCardsScroll}
                      contentContainerStyle={styles.bundleCardsScrollInner}
                    >
                      {bundleCardEls}
                    </ScrollView>
                  )
                ) : (
                  <Text style={styles.bundleEmpty}>{t('plans.bundles.empty')}</Text>
                )}
              </View>

              {!bundlesQuery.isLoading && (
                <View style={styles.bundleFaqSection}>
                  <Text style={styles.bundleFaqSectionTitle}>{t('plans.bundles.faq_title')}</Text>
                  {!enableRealPayments ? (
                    <Text style={styles.bundleFaqAnswer}>
                      {t('plans.payments_disabled_notice', {
                        defaultValue:
                          'Paid checkout is not enabled yet. Free access remains available while we finish billing verification.',
                      })}
                    </Text>
                  ) : null}
                  {nativeBillingUnavailable ? (
                    <Text style={styles.bundleFaqAnswer}>
                      {t('plans.revenuecat_not_configured')}
                    </Text>
                  ) : null}
                  {pricingFaqItems.map((item) => (
                    <ExpandableCard key={item.id} title={item.title} icon={item.icon}>
                      <Text style={styles.bundleFaqAnswer}>{item.answer}</Text>
                    </ExpandableCard>
                  ))}
                  {useRevenueCatFlow ? (
                    <AppButton
                      label={
                        nativeBillingPending ? t('plans.restoring') : t('plans.restore_purchases')
                      }
                      onPress={handleRestorePurchases}
                      disabled={nativeBillingPending}
                      loading={nativeBillingPending}
                      variant="secondary"
                      size="md"
                      style={styles.restorePurchasesAction}
                      leading={
                        <Ionicons
                          name="refresh-outline"
                          size={16}
                          color={theme.colors.text.primary}
                        />
                      }
                    />
                  ) : null}
                </View>
              )}
            </View>
          </AnimatedSection>
        )}

        {/* Upgrade Modal */}
        <Modal
          visible={showUpgradeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowUpgradeModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {modalPending ? (
                <>
                  <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
                  <Text style={styles.modalTitle}>{t('plans.upgrading')}</Text>
                </>
              ) : modalError ? (
                <>
                  <Ionicons name="alert-circle" size={48} color={theme.colors.status.error} />
                  <Text style={styles.modalTitle}>{t('plans.upgrade_error')}</Text>
                  <Text style={styles.modalMessage}>
                    {getLocalizedApiError(t, modalErrorData, 'plans.upgrade_error_message')}
                  </Text>
                  <AppButton label={t('common.close')} onPress={resetModal} style={styles.modalAction} />
                </>
              ) : useRevenueCatFlow && nativeBillingSuccess ? (
                <>
                  <Ionicons name="checkmark-circle" size={48} color={theme.colors.status.success} />
                  <Text style={styles.modalTitle}>{t('plans.upgrade_success')}</Text>
                  <Text style={styles.modalMessage}>
                    {t('plans.revenuecat_success_message', { planName: selectedPlan?.name })}
                  </Text>
                  <AppButton label={t('common.got_it')} onPress={resetModal} style={styles.modalAction} />
                </>
              ) : !useStripeFlow && !useRevenueCatFlow && upgradePlan.isSuccess ? (
                <>
                  <Ionicons name="checkmark-circle" size={48} color={theme.colors.status.success} />
                  <Text style={styles.modalTitle}>{t('plans.upgrade_success')}</Text>
                  <Text style={styles.modalMessage}>
                    {t('plans.upgrade_success_message', { planName: selectedPlan?.name })}
                  </Text>
                  <View style={styles.featuresList}>
                    <Text style={styles.featuresTitle}>{t('plans.new_features')}</Text>
                    {selectedPlan &&
                      sortPricingFeatureEntries(selectedPlan.features).map(
                        ([slug, feature]: [string, any]) => {
                          const available = isPricingFeatureAvailable(feature);
                          if (!available) return null;
                          return (
                            <View key={slug} style={styles.featureRow}>
                              <Ionicons
                                name="checkmark-circle"
                                size={16}
                                color={theme.colors.status.success}
                              />
                              <Text style={styles.featureText}>
                                {getPricingFeatureLabel(
                                  pricingLocale,
                                  translatePricing,
                                  slug,
                                  feature
                                )}
                              </Text>
                            </View>
                          );
                        }
                      )}
                  </View>
                  <AppButton label={t('common.got_it')} onPress={resetModal} style={styles.modalAction} />
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>{t('plans.confirm_upgrade')}</Text>
                  <Text style={styles.modalMessage}>
                    {t('plans.confirm_upgrade_message', { planName: selectedPlan?.name })}
                  </Text>
                  <View style={styles.modalActions}>
                    <AppButton
                      label={t('common.cancel')}
                      onPress={() => {
                        setShowUpgradeModal(false);
                        setSelectedPlan(null);
                      }}
                      variant="secondary"
                      style={styles.modalAction}
                    />
                    <AppButton
                      label={t('plans.confirm')}
                      onPress={handleUpgrade}
                      style={styles.modalAction}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
      </ScrollView>
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="plans"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: modernColors.page,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing[6],
    paddingBottom: theme.spacing[6],
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
    backgroundColor: modernColors.page,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing[8],
  },
  title: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  currencyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[4],
    padding: 3,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceMuted,
  },
  currencyToggleButton: {
    minWidth: 76,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.sm,
    alignItems: 'center',
  },
  currencyToggleButtonSelected: {
    backgroundColor: theme.colors.interactive.primary,
  },
  currencyToggleText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
  },
  currencyToggleTextSelected: {
    color: theme.colors.text.inverse,
  },
  plansGrid: {
    gap: theme.spacing[6],
  },
  plansGridWeb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  planCard: {
    backgroundColor: modernColors.surface,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
    borderWidth: theme.borders.width.medium,
    borderColor: modernColors.border,
    position: 'relative',
    ...modernShadows.card,
  },
  planCardNative: {
    width: '100%',
    maxWidth: 400,
  },
  planCardWeb: {
    minWidth: 280,
    maxWidth: 320,
  },
  planCardCurrent: {
    borderColor: theme.colors.interactive.primary,
    borderWidth: 2,
  },
  currentBadge: {
    position: 'absolute',
    top: theme.spacing[4],
    right: theme.spacing[4],
    backgroundColor: theme.colors.interactive.primary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borders.radius.full,
  },
  currentBadgeText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  planName: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  planDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
    minHeight: 33,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing[4],
  },
  price: {
    fontSize: theme.typography.fontSize['5xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.interactive.primary,
  },
  pricePeriod: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    marginLeft: theme.spacing[1],
  },
  highlightFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.interactive.primary + '20',
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
    gap: theme.spacing[2],
  },
  highlightFeatureText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
  },
  featuresContainer: {
    marginBottom: theme.spacing[6],
    gap: theme.spacing[3],
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
  },
  featureText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    flexShrink: 1,
  },
  featureTextDisabled: {
    color: theme.colors.text.tertiary,
    textDecorationLine: 'line-through',
  },
  featureLockedReason: {
    marginTop: 2,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
  },
  planAction: {},
  currentPlanButton: {
    backgroundColor: theme.colors.background.tertiary,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  currentPlanButtonText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  unavailablePlanButton: {
    backgroundColor: theme.colors.background.tertiary,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  unavailablePlanButtonText: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  billingNotice: {
    marginTop: theme.spacing[8],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    padding: theme.spacing[5],
    maxWidth: 920,
    alignSelf: 'center',
    width: '100%',
  },
  billingNoticeTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  billingNoticeText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 22,
    marginTop: theme.spacing[2],
  },
  restorePurchasesAction: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing[4],
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.status.error,
    marginBottom: theme.spacing[2],
  },
  errorMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  errorBackAction: {},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  modalContent: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  featuresList: {
    width: '100%',
    marginBottom: theme.spacing[4],
  },
  featuresTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[3],
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    width: '100%',
  },
  modalAction: {
    flex: 1,
  },
  bundleSection: {
    marginTop: theme.spacing[8],
    marginBottom: theme.spacing[6],
    paddingHorizontal: theme.spacing[1],
  },
  bundleShell: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[6],
    paddingBottom: theme.spacing[5],
    borderRadius: theme.borders.radius.xl,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surface,
    ...modernShadows.subtle,
  },
  bundleHeaderBlock: {
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: theme.spacing[5],
  },
  bundleSectionTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    letterSpacing: -0.3,
    marginBottom: theme.spacing[2],
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  bundlePlanContext: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[1],
  },
  bundleSectionSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 520,
    alignSelf: 'center',
  },
  bundleErrorText: {
    marginTop: theme.spacing[3],
    color: theme.colors.status.error,
    fontSize: theme.typography.fontSize.sm,
    textAlign: 'center',
    maxWidth: 520,
  },
  bundleLoadingBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  bundleCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  bundleCardsScroll: {
    marginHorizontal: -theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  bundleCardsScrollInner: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  bundleCard: {
    backgroundColor: modernColors.surface,
    borderRadius: theme.borders.radius.lg,
    borderWidth: 1,
    borderColor: modernColors.border,
    overflow: 'hidden',
    ...modernShadows.subtle,
  },
  bundleCardFeatured: {
    borderColor: theme.colors.primary[300],
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.primary[500],
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
      web: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        boxShadow: `0 16px 40px -12px ${hexAlpha(theme.colors.primary[500], 0.35)}` as any,
      },
    }),
  },
  bundleCardAccent: {
    height: 4,
    width: '100%',
  },
  bundleCardBody: {
    padding: theme.spacing[4],
    paddingTop: theme.spacing[4],
  },
  bundleName: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: theme.spacing[1],
  },
  bundleStoriesHero: {
    fontSize: theme.typography.fontSize['5xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.interactive.primary,
    letterSpacing: -1,
    lineHeight: theme.typography.fontSize['5xl'] * 1.05,
  },
  bundleStoriesHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: -theme.spacing[1],
    marginBottom: theme.spacing[2],
  },
  bundleMetaList: {
    gap: theme.spacing[1],
    marginBottom: theme.spacing[3],
  },
  bundleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  bundleMetaText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  bundlePrice: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  bundleBuyAction: {},
  bundleFaqSection: {
    marginTop: theme.spacing[6],
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
  },
  bundleFaqSectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[4],
  },
  bundleFaqAnswer: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 22,
  },
  bundleEmpty: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
});
