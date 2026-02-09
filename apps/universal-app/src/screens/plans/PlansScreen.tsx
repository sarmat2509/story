import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList, PublicStackParamList } from '@/types/navigation';
import { usePlans, usePlansWithAuth, useUpgradePlan } from '@/api/plans';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PlansScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList | PublicStackParamList>>();
  const { isAuthenticated } = useAuthStore();
  
  // Modal state for upgrade flow
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const upgradePlan = useUpgradePlan();
  
  // Fetch plans - use authenticated hook if logged in, otherwise public
  const publicPlansQuery = usePlans();
  const authPlansQuery = usePlansWithAuth();
  
  // Select appropriate query based on auth state
  const { data: plans, isLoading, error } = isAuthenticated 
    ? authPlansQuery 
    : publicPlansQuery;
  
  // Fixed feature order - same for all plans
  const FEATURE_ORDER = [
    'stories_per_day',
    'images_per_story', 
    'image_quality',
    'premium_voices',
    'child_profiles_limit',
    'series_enabled',
    'export_pdf',
    'export_video',
    'share_enabled',
    'story_from_drawing',
  ];
  
  // Sort features: available first, unavailable last, in fixed order
  const sortFeatures = (features: Record<string, any>) => {
    const entries = Object.entries(features);
    
    // Separate available and unavailable features
    const available: Array<[string, any]> = [];
    const unavailable: Array<[string, any]> = [];
    
    entries.forEach(([slug, feature]) => {
      if (slug === 'audio_stories_per_month') return; // Skip highlighted feature
      
      const isAvailable = feature.value?.enabled !== false && 
                         (feature.value?.limit === undefined || feature.value?.limit > 0);
      
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
  
  // Handle upgrade confirmation
  const handleUpgrade = async () => {
    if (!selectedPlan) return;
    
    try {
      await upgradePlan.mutateAsync(selectedPlan.slug);
      // Keep modal open to show success state
    } catch (error: any) {
      console.error('Upgrade failed:', error);
      // Modal will show error state
    }
  };
  
  // Helper to format price
  const formatPrice = (priceMonthly: number, currency: string) => {
    if (priceMonthly === 0) return t('plans.free');
    
    // Convert UAH kopiykas to hryvnias or use direct EUR
    const amount = currency === 'UAH' ? priceMonthly / 100 : priceMonthly;
    const symbol = currency === 'EUR' ? '€' : '₴';
    
    return `${symbol}${amount}`;
  };
  
  // Helper to render feature value
  const renderFeatureValue = (feature: any) => {
    const value = feature.value;
    
    if ('limit' in value) {
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
    if ('limit' in value) return value.limit > 0;
    return true;
  };
  
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('plans.loading')}</Text>
      </View>
    );
  }
  
  if (error) {
    return (
      <View style={styles.centerContainer}>
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
  
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('plans.title')}</Text>
        <Text style={styles.subtitle}>{t('plans.subtitle')}</Text>
      </View>
      
      <View style={[styles.plansGrid, isWeb && styles.plansGridWeb]}>
        {plans?.map((plan) => {
          const isCurrent = isAuthenticated && 'isCurrent' in plan && plan.isCurrent;
          const audioFeature = plan.features['audio_stories_per_month']; // CHANGED from audio_minutes_per_month
          
          // Determine button type
          let buttonType: 'subscribe' | 'upgrade' | 'current' = 'subscribe';
          if (isAuthenticated && 'isCurrent' in plan) {
            if (plan.isCurrent) {
              buttonType = 'current';
            } else if (plan.priceMonthly > 0) {
              // Find current plan to compare
              const currentPlan = plans.find((p: any) => 'isCurrent' in p && p.isCurrent);
              if (currentPlan && plan.sortOrder > (currentPlan as any).sortOrder) {
                buttonType = 'upgrade';
              }
            }
          }
          
          return (
            <View 
              key={plan.id} 
              style={[
                styles.planCard,
                isCurrent && styles.planCardCurrent
              ]}
            >
              {isCurrent && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>
                    {t('plans.current_plan')}
                  </Text>
                </View>
              )}
              
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
                      count: audioFeature.value.limit 
                    })}
                  </Text>
                </View>
              )}
              
              {/* Features list */}
              <View style={styles.featuresContainer}>
                {sortFeatures(plan.features).map(([slug, feature]: [string, any]) => {
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
                        {t(`plans.features.${slug}`, { 
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
              ) : (
                <TouchableOpacity 
                  style={styles.subscribeButton}
                  onPress={() => {
                    if (!isAuthenticated) {
                      // Navigate to login for guest users
                      navigation.navigate('Login' as any);
                    } else {
                      // TODO: Navigate to payment flow for downgrade/subscribe
                      console.log('Subscribe to', plan.slug);
                    }
                  }}
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
            {upgradePlan.isPending ? (
              <>
                <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
                <Text style={styles.modalTitle}>{t('plans.upgrading')}</Text>
              </>
            ) : upgradePlan.isError ? (
              <>
                <Ionicons name="alert-circle" size={48} color={theme.colors.status.error} />
                <Text style={styles.modalTitle}>{t('plans.upgrade_error')}</Text>
                <Text style={styles.modalMessage}>
                  {upgradePlan.error?.response?.data?.message || t('plans.upgrade_error_message')}
                </Text>
                <TouchableOpacity 
                  style={styles.modalButton}
                  onPress={() => {
                    setShowUpgradeModal(false);
                    setSelectedPlan(null);
                    upgradePlan.reset();
                  }}
                >
                  <Text style={styles.modalButtonText}>{t('common.close')}</Text>
                </TouchableOpacity>
              </>
            ) : upgradePlan.isSuccess ? (
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
                          {t(`plans.features.${slug}`, { 
                            defaultValue: feature.name,
                            value: feature.value?.limit || ''
                          })}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <TouchableOpacity 
                  style={styles.modalButton}
                  onPress={() => {
                    setShowUpgradeModal(false);
                    setSelectedPlan(null);
                    upgradePlan.reset();
                  }}
                >
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
    padding: theme.spacing[6],
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
    minWidth: 280,
    maxWidth: 320,
    position: 'relative',
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
