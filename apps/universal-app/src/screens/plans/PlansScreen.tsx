import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Modal, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { usePlans, usePlansWithAuth, useUpgradePlan, useCreateCheckoutSession } from '@/api/plans';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PlansScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuthStore();
  
  // Modal state for upgrade flow
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const upgradePlan = useUpgradePlan();
  const createCheckoutSession = useCreateCheckoutSession();
  
  // Fetch plans - use authenticated hook if logged in, otherwise public
  const publicPlansQuery = usePlans();
  const authPlansQuery = usePlansWithAuth();
  
  // Select appropriate query based on auth state
  const authData = authPlansQuery.data;
  const plans = isAuthenticated
    ? (authData && 'plans' in authData ? authData.plans : authData)
    : publicPlansQuery.data;
  const enableRealPayments = isAuthenticated && authData && 'enableRealPayments' in authData
    ? authData.enableRealPayments
    : false;
  const isLoading = isAuthenticated ? authPlansQuery.isLoading : publicPlansQuery.isLoading;
  const error = isAuthenticated ? authPlansQuery.error : publicPlansQuery.error;
  
  // Fixed feature order - same for all plans
  const FEATURE_ORDER = [
    'stories_per_day',
    'images_per_story',
    'premium_voices',
    'child_profiles_limit',
    'series_enabled',
    'export_pdf',
    'export_video',
    'share_enabled',
  ];
  
  // Sort features: available first, unavailable last, in fixed order
  const sortFeatures = (features: Record<string, unknown> | Array<{ name?: string; value?: unknown }>) => {
    const asRecord = Array.isArray(features)
      ? Object.fromEntries((features as Array<{ name?: string; value?: unknown }>).map((f) => [f.name ?? '', f]))
      : features as Record<string, unknown>;
    const entries = Object.entries(asRecord);
    
    // Separate available and unavailable features
    const available: Array<[string, any]> = [];
    const unavailable: Array<[string, any]> = [];
    
    entries.forEach(([slug, feature]: [string, any]) => {
      if (slug === 'audio_stories_per_month') return; // Skip highlighted feature
      if (slug === 'story_from_drawing') return; // Removed: same as Instant mode, avoid confusion
      if (slug === 'image_quality') return; // Removed: quality is same across plans
      
      const isAvailable = feature.value?.enabled !== false &&
                         (feature.value?.limit === undefined || feature.value?.limit == null || feature.value?.limit > 0);
      
      if (isAvailable) {
        available.push([slug, feature]);
      } else {
        unavailable.push([slug, feature]);
      }
    });
    
    // Sort each group by FEATURE_ORDER
    const sortByOrder = (a: [string, any], b: [string, any]) => {
      const indexA = FEATURE_ORDER.indexOf(a[0]);
      const indexB = FEATURE_ORDER.indexOf(b[0]);
      return indexA - indexB;
    };
    
    available.sort(sortByOrder);
    unavailable.sort(sortByOrder);
    
    // Concatenate: available first, unavailable last
    return [...available, ...unavailable];
  };
  
  // Handle upgrade: Stripe (web) or stub (mobile / when disabled)
  const handleUpgrade = async () => {
    if (!selectedPlan) return;
    
    const isWeb = Platform.OS === 'web';
    if (enableRealPayments && isWeb) {
      try {
        const { url } = await createCheckoutSession.mutateAsync(selectedPlan.slug);
        if (typeof window !== 'undefined' && url) {
          window.location.href = url;
        }
      } catch (err: unknown) {
        console.error('Checkout failed:', err);
        // Modal will show error via createCheckoutSession.isError
      }
      return;
    }

    if (enableRealPayments && !isWeb) {
      // Mobile: RevenueCat not yet implemented - show coming soon
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
  
  // Helper to format price
  const formatPrice = (priceMonthly: number, currency: string) => {
    if (priceMonthly === 0) return t('plans.free');
    // UAH: kopiykas; USD: cents — both stored as integer, divide by 100
    const amount = (currency === 'UAH' || currency === 'USD') ? priceMonthly / 100 : priceMonthly;
    const symbol = currency === 'UAH' ? '₴' : currency === 'USD' ? '$' : '€';
    return `${symbol}${amount.toFixed(currency === 'USD' ? 2 : 0)}`;
  };

  // Helper to render feature value
  const renderFeatureValue = (feature: any) => {
    const value = feature.value;

    if ('limit' in value) {
      if (value.limit == null) return '∞';
      return `${value.limit} ${value.unit || ''}`;
    }
    if ('enabled' in value) {
      return value.enabled ? '✓' : '✗';
    }
    if ('selected' in value) {
      return value.selected;
    }
    return String(value);
  };
  
  // Helper to check if feature is available
  const isFeatureAvailable = (feature: any) => {
    const value = feature.value;
    if ('enabled' in value) return value.enabled;
    if ('limit' in value) return value.limit == null || value.limit > 0;
    return true;
  };
  
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
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.retryButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  const isWeb = Platform.OS === 'web';
  const useStripeFlow = enableRealPayments && isWeb;
  const modalPending = useStripeFlow ? createCheckoutSession.isPending : upgradePlan.isPending;
  const modalError = useStripeFlow ? createCheckoutSession.isError : upgradePlan.isError;
  const modalErrorData = useStripeFlow ? createCheckoutSession.error : upgradePlan.error;
  const resetModal = () => {
    setShowUpgradeModal(false);
    setSelectedPlan(null);
    upgradePlan.reset();
    createCheckoutSession.reset();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: theme.spacing[6] + insets.top },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('plans.title')}</Text>
        <Text style={styles.subtitle}>{t('plans.subtitle')}</Text>
      </View>
      
      <View style={[styles.plansGrid, isWeb && styles.plansGridWeb]}>
        {plans?.map((plan) => {
          const isCurrent = isAuthenticated && 'isCurrent' in plan && plan.isCurrent;
          const audioFeature = (plan.features as unknown as Record<string, { value?: { limit?: number } }>)['audio_stories_per_month']; // CHANGED from audio_minutes_per_month
          
          // Determine button type
          let buttonType: 'subscribe' | 'upgrade' | 'downgrade' | 'current' = 'subscribe';
          if (isAuthenticated && 'isCurrent' in plan) {
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
            <View
              key={plan.id}
              style={[
                styles.planCard,
                isWeb ? styles.planCardWeb : styles.planCardNative,
                isCurrent && styles.planCardCurrent,
              ] as ViewStyle[]}
            >
              {isCurrent ? (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>
                    {t('plans.current_plan')}
                  </Text>
                </View>
              ) : null}
              
              <Text style={styles.planName}>{plan.name}</Text>
              {plan.description && (
                <Text style={styles.planDescription}>{plan.description}</Text>
              )}
              
              <View style={styles.priceContainer}>
                <Text style={styles.price}>
                  {formatPrice(plan.priceMonthly, plan.pricingCurrency)}
                </Text>
                {plan.priceMonthly > 0 && (
                  <Text style={styles.pricePeriod}>
                    /{t('plans.per_month')}
                  </Text>
                )}
              </View>
              
              {/* Audio stories highlight */}
              {audioFeature && (
                <View style={styles.highlightFeature}>
                  <Ionicons 
                    name="musical-notes" 
                    size={20} 
                    color={theme.colors.interactive.primary}
                  />
                  <Text style={styles.highlightFeatureText}>
                    {t('plans.audio_stories', { 
                      count: audioFeature?.value?.limit ?? 0
                    })}
                  </Text>
                </View>
              )}
              
              {/* Features list */}
              <View style={styles.featuresContainer}>
                {sortFeatures(plan.features as Record<string, any>).map(([slug, feature]: [string, any]) => {
                  const available = isFeatureAvailable(feature);
                  
                  return (
                    <View key={slug} style={styles.featureRow}>
                      <Ionicons 
                        name={available ? 'checkmark-circle' : 'close-circle'}
                        size={16}
                        color={available ? theme.colors.status.success : theme.colors.text.tertiary}
                      />
                      <Text 
                        style={[
                          styles.featureText,
                          !available && styles.featureTextDisabled
                        ]}
                      >
                        {slug === 'child_profiles_limit' && feature.value?.limit == null
                          ? t('plans.features.child_profiles_limit_unlimited')
                          : slug === 'child_profiles_limit' && feature.value?.limit === 1
                          ? t('plans.features.child_profiles_limit_one')
                          : slug === 'images_per_story' && typeof feature.value?.limit === 'number'
                          ? t('plans.features.images_per_story', { value: feature.value.limit, count: feature.value.limit })
                          : t(`plans.features.${slug}`, { 
                              defaultValue: feature.name,
                              value: renderFeatureValue(feature)
                            })}
                      </Text>
                    </View>
                  );
                })}
              </View>
              
              {/* Action button based on user state and plan tier */}
              {buttonType === 'current' ? (
                <View style={styles.currentPlanButton}>
                  <Text style={styles.currentPlanButtonText}>
                    {t('plans.your_plan')}
                  </Text>
                </View>
              ) : buttonType === 'upgrade' ? (
                <TouchableOpacity 
                  style={styles.upgradeButton}
                  onPress={() => {
                    setSelectedPlan(plan);
                    setShowUpgradeModal(true);
                  }}
                >
                  <Text style={styles.upgradeButtonText}>
                    {t('plans.upgrade_button')}
                  </Text>
                </TouchableOpacity>
              ) : buttonType === 'downgrade' ? (
                <TouchableOpacity 
                  style={styles.subscribeButton}
                  onPress={() => {
                    setSelectedPlan(plan);
                    setShowUpgradeModal(true);
                  }}
                >
                  <Text style={styles.subscribeButtonText}>
                    {t('plans.subscribe_button')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={styles.subscribeButton}
                  onPress={() => navigation.navigate('Welcome')}
                >
                  <Text style={styles.subscribeButtonText}>
                    {t('plans.subscribe_button')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
      
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
                  {(modalErrorData as { response?: { data?: { message?: string } } })?.response?.data?.message || t('plans.upgrade_error_message')}
                </Text>
                <TouchableOpacity style={styles.modalButton} onPress={resetModal}>
                  <Text style={styles.modalButtonText}>{t('common.close')}</Text>
                </TouchableOpacity>
              </>
            ) : !useStripeFlow && upgradePlan.isSuccess ? (
              <>
                <Ionicons name="checkmark-circle" size={48} color={theme.colors.status.success} />
                <Text style={styles.modalTitle}>{t('plans.upgrade_success')}</Text>
                <Text style={styles.modalMessage}>
                  {t('plans.upgrade_success_message', { planName: selectedPlan?.name })}
                </Text>
                <View style={styles.featuresList}>
                  <Text style={styles.featuresTitle}>{t('plans.new_features')}</Text>
                  {selectedPlan && sortFeatures(selectedPlan.features).map(([slug, feature]: [string, any]) => {
                    const available = feature.value?.enabled !== false && 
                                     (feature.value?.limit === undefined || feature.value?.limit > 0);
                    if (!available) return null;
                    return (
                      <View key={slug} style={styles.featureRow}>
                        <Ionicons 
                          name="checkmark-circle"
                          size={16}
                          color={theme.colors.status.success}
                        />
                        <Text style={styles.featureText}>
                          {slug === 'child_profiles_limit' && feature.value?.limit == null
                            ? t('plans.features.child_profiles_limit_unlimited')
                            : slug === 'child_profiles_limit' && feature.value?.limit === 1
                            ? t('plans.features.child_profiles_limit_one')
                            : slug === 'images_per_story' && typeof feature.value?.limit === 'number'
                            ? t('plans.features.images_per_story', { value: feature.value.limit, count: feature.value.limit })
                            : t(`plans.features.${slug}`, { 
                                defaultValue: feature.name,
                                value: feature.value?.limit ?? renderFeatureValue(feature)
                              })}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <TouchableOpacity style={styles.modalButton} onPress={resetModal}>
                  <Text style={styles.modalButtonText}>{t('common.got_it')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>{t('plans.confirm_upgrade')}</Text>
                <Text style={styles.modalMessage}>
                  {t('plans.confirm_upgrade_message', { planName: selectedPlan?.name })}
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.modalButtonSecondary]}
                    onPress={() => {
                      setShowUpgradeModal(false);
                      setSelectedPlan(null);
                    }}
                  >
                    <Text style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>
                      {t('common.cancel')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.modalButton}
                    onPress={handleUpgrade}
                  >
                    <Text style={styles.modalButtonText}>{t('plans.confirm')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
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
    backgroundColor: theme.colors.background.primary,
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
  plansGrid: {
    gap: theme.spacing[6],
  },
  plansGridWeb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  planCard: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.border.light,
    position: 'relative',
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
  featureText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    flex: 1,
  },
  featureTextDisabled: {
    color: theme.colors.text.tertiary,
    textDecorationLine: 'line-through',
  },
  subscribeButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  upgradeButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
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
  retryButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
  },
  retryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
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
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    width: '100%',
  },
  modalButton: {
    flex: 1,
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: theme.colors.background.tertiary,
  },
  modalButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  modalButtonTextSecondary: {
    color: theme.colors.text.primary,
  },
});
