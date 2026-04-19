import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Platform, Linking, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useAuthStore } from '@/store/authStore';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { theme } from '@/theme';
import { usePlansWithAuth, useSubscriptionUsage, useCreatePortalSession } from '@/api/plans';
import { useUpdateMe } from '@/api/auth';
import { formatAssetUrl, isServerAssetUrl, toCanonicalAssetUrl } from '@/utils/assetUrl';
import { uploadPhoto, deletePhoto } from '@/utils/uploadPhoto';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { data: plansData, isLoading: plansLoading } = usePlansWithAuth();
  const { data: usage, isLoading: usageLoading } = useSubscriptionUsage();
  const createPortalSession = useCreatePortalSession();
  const plans = plansData && 'plans' in plansData ? plansData.plans : plansData;
  const enableRealPayments = plansData && 'enableRealPayments' in plansData ? plansData.enableRealPayments : false;
  const updateProfile = useUpdateMe();
  const updateAvatar = useUpdateMe();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [pseudonym, setPseudonym] = useState(user?.pseudonym ?? '');
  const [aboutMe, setAboutMe] = useState(user?.aboutMe ?? '');
  const [isAvatarBusy, setIsAvatarBusy] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />
      ),
    });
  }, [navigation]);

  useEffect(() => {
    setDisplayName(user?.displayName ?? '');
  }, [user?.displayName]);

  useEffect(() => {
    setPseudonym(user?.pseudonym ?? '');
  }, [user?.pseudonym]);

  useEffect(() => {
    setAboutMe(user?.aboutMe ?? '');
  }, [user?.aboutMe]);

  // Get current subscription plan
  const currentPlan = plans?.find(plan => plan.isCurrent);
  const currentPlanName = currentPlan?.name || t('plans.free');
  // API returns features as object { stories_per_month: { value: { limit } }, ... }
  const featuresObj = currentPlan?.features as Record<string, { value?: { limit?: number } }> | undefined;
  const storiesLimit = featuresObj?.stories_per_month?.value?.limit ?? 3;
  const avatarUrl = formatAssetUrl(user?.avatarUrl) ?? user?.avatarUrl ?? null;
  const avatarInitial = user?.displayName?.trim().charAt(0)
    || user?.email?.trim().charAt(0)
    || 'U';

  const formattedPeriodEnd = usage?.currentPeriodEnd
    ? new Date(usage.currentPeriodEnd).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const hasPaidPlan = currentPlan && (currentPlan.priceMonthly ?? 0) > 0;
  const canManageSubscription = enableRealPayments && usage?.paymentProvider === 'stripe' && hasPaidPlan;

  const handleManageSubscription = async () => {
    if (!canManageSubscription) {
      navigation.navigate('Plans' as any);
      return;
    }
    try {
      const { url } = await createPortalSession.mutateAsync();
      if (url && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = url;
      } else if (url) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('Failed to open portal:', err);
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const requestPhotoPermission = async () => {
    if (Platform.OS === 'web') return true;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('profile.avatar_permission_title'),
        t('profile.avatar_permission_message')
      );
      return false;
    }

    return true;
  };

  const handlePickAvatar = async () => {
    const hasPermission = await requestPhotoPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      const previousAvatarUrl = user?.avatarUrl ?? null;
      const localUri = result.assets[0].uri;

      setIsAvatarBusy(true);
      try {
        const uploadedAvatar = await uploadPhoto(localUri, 'profile');
        const canonicalAvatarUrl = toCanonicalAssetUrl(uploadedAvatar.url);

        try {
          await updateAvatar.mutateAsync({ avatarUrl: canonicalAvatarUrl });

          if (previousAvatarUrl && previousAvatarUrl !== canonicalAvatarUrl && isServerAssetUrl(previousAvatarUrl)) {
            await deletePhoto(previousAvatarUrl);
          }
        } catch (error) {
          if (isServerAssetUrl(uploadedAvatar.url)) {
            await deletePhoto(uploadedAvatar.url);
          }
          throw error;
        }
      } catch (error) {
        console.error('Avatar upload failed:', error);
        Alert.alert(t('common.error'), t('profile.avatar_upload_error'));
      } finally {
        setIsAvatarBusy(false);
      }
    } catch (error) {
      console.error('Avatar pick failed:', error);
      Alert.alert(t('common.error'), t('profile.avatar_pick_error'));
    }
  };

  const handleSaveProfile = () => {
    updateProfile.mutate({
      displayName: displayName.trim(),
      pseudonym: pseudonym.trim() || null,
      aboutMe: aboutMe.trim() || null,
    });
  };

  const handleRemoveAvatar = async () => {
    if (!user?.avatarUrl) return;

    const previousAvatarUrl = user.avatarUrl;
    setIsAvatarBusy(true);

    try {
      await updateAvatar.mutateAsync({ avatarUrl: null });

      if (isServerAssetUrl(previousAvatarUrl)) {
        await deletePhoto(previousAvatarUrl);
      }
    } catch (error) {
      console.error('Avatar removal failed:', error);
      Alert.alert(t('common.error'), t('profile.avatar_remove_error'));
    } finally {
      setIsAvatarBusy(false);
    }
  };

  return (
    <>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('profile.title')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.account_info')}</Text>
        
        <View style={styles.profileCard}>
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={handlePickAvatar}
              activeOpacity={0.85}
              disabled={isAvatarBusy}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarPlaceholder}>
                  {avatarInitial.toUpperCase()}
                </Text>
              )}

              {isAvatarBusy ? (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                </View>
              ) : null}
            </TouchableOpacity>

            <View style={styles.avatarActions}>
              <TouchableOpacity
                style={[styles.avatarActionButton, styles.avatarPrimaryButton]}
                onPress={handlePickAvatar}
                disabled={isAvatarBusy}
              >
                <Text style={[styles.avatarActionText, styles.avatarPrimaryButtonText]}>
                  {isAvatarBusy
                    ? t('profile.avatar_uploading')
                    : avatarUrl
                      ? t('profile.change_avatar')
                      : t('profile.add_avatar')}
                </Text>
              </TouchableOpacity>

              {user?.avatarUrl ? (
                <TouchableOpacity
                  style={[styles.avatarActionButton, styles.avatarSecondaryButton]}
                  onPress={handleRemoveAvatar}
                  disabled={isAvatarBusy}
                >
                  <Text style={[styles.avatarActionText, styles.avatarSecondaryButtonText]}>
                    {t('profile.remove_avatar')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.accountColumns}>
            <View style={styles.accountColumn}>
              <View style={styles.infoRow}>
                <Text style={styles.label}>{t('profile.name')}</Text>
                <TextInput
                  style={styles.pseudonymInput}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder={t('profile.not_set')}
                  placeholderTextColor={theme.colors.text.tertiary}
                  maxLength={255}
                />
              </View>

              <View style={[styles.infoRow, styles.infoRowLastInColumn]}>
                <Text style={styles.label}>{t('profile.email')}</Text>
                <Text style={styles.value}>{user?.email || t('profile.not_set')}</Text>
              </View>
            </View>

            <View style={styles.accountColumn}>
              <View style={styles.infoRow}>
                <Text style={styles.label}>{t('profile.pseudonym')}</Text>
                <TextInput
                  style={styles.pseudonymInput}
                  value={pseudonym}
                  onChangeText={setPseudonym}
                  placeholder={t('profile.pseudonym')}
                  placeholderTextColor={theme.colors.text.tertiary}
                  maxLength={100}
                />
              </View>

              <View style={[styles.infoRow, styles.infoRowLastInColumn]}>
                <Text style={styles.label}>{t('profile.about_me')}</Text>
                <TextInput
                  style={[styles.pseudonymInput, styles.aboutMeInput]}
                  value={aboutMe}
                  onChangeText={setAboutMe}
                  placeholder={t('profile.about_me_placeholder')}
                  placeholderTextColor={theme.colors.text.tertiary}
                  maxLength={1000}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveProfileButton}
            onPress={handleSaveProfile}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.text.inverse} />
            ) : (
              <Text style={styles.saveProfileButtonText}>{t('common.save')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.preferences')}</Text>
        
        {/* Mode Settings */}
        <TouchableOpacity 
          style={styles.settingButton}
          onPress={() => navigation.navigate('ModeSelection' as any)}
        >
          <View style={styles.settingLeft}>
            <Text style={styles.settingText}>{t('profile.mode')}</Text>
            <Text style={styles.settingValue}>
              {user?.mode === 'instant' ? t('mode_selection.instant_mode') : t('mode_selection.artisan_mode')}
            </Text>
          </View>
          <Text style={styles.settingArrow}>›</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.settingButton}
          onPress={() => navigation.navigate('LanguageSettings')}
        >
          <Text style={styles.settingText}>{t('profile.language_settings')}</Text>
          <Text style={styles.settingArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingButton}>
          <Text style={styles.settingText}>{t('profile.notification_settings')}</Text>
          <Text style={styles.settingArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.subscription')}</Text>
        
        {plansLoading ? (
          <View style={styles.subscriptionCard}>
            <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
          </View>
        ) : (
          <View style={styles.subscriptionCard}>
            <Text style={styles.subscriptionPlan}>
              {currentPlanName}
            </Text>
            {usage?.cancelAtPeriodEnd && formattedPeriodEnd ? (
              <Text style={styles.subscriptionDetail}>
                {t('profile.subscription_canceling', { date: formattedPeriodEnd })}
              </Text>
            ) : formattedPeriodEnd ? (
              <Text style={styles.subscriptionDetail}>
                {t('profile.subscription_until', { date: formattedPeriodEnd })}
              </Text>
            ) : null}
            {usage ? (
              <Text style={styles.subscriptionDetail}>
                {t('profile.usage_remaining_short', {
                  stories: usage.stories.remaining,
                  audio: usage.audio.remaining,
                })}
              </Text>
            ) : usageLoading ? (
              <Text style={styles.subscriptionDetail}>{t('common.loading')}</Text>
            ) : (
              <Text style={styles.subscriptionDetail}>
                {t('profile.stories_per_month', { count: storiesLimit })}
              </Text>
            )}
            <TouchableOpacity 
              style={styles.upgradeButton}
              onPress={handleManageSubscription}
              disabled={createPortalSession.isPending}
            >
              {createPortalSession.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.text.inverse} />
              ) : (
                <Text style={styles.upgradeButtonText}>
                  {canManageSubscription ? t('billing.manage_subscription') : t('profile.upgrade_plan')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>WonderTales v1.0.0</Text>
      </View>
    </ScrollView>

    <ConfirmDialog
      visible={showLogoutConfirm}
      title={t('profile.logout_confirm_title')}
      message={t('profile.logout_confirm_message')}
      confirmText={t('profile.logout')}
      cancelText={t('profile.cancel')}
      onConfirm={() => { logout(); setShowLogoutConfirm(false); }}
      onCancel={() => setShowLogoutConfirm(false)}
      variant="danger"
    />

    <FeedbackModal
      visible={showFeedbackModal}
      onClose={() => setShowFeedbackModal(false)}
      initialReportedScreen="profile"
    />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing[6],
    minHeight: '100%',
    backgroundColor: theme.colors.background.primary,
  },
  header: {
    marginBottom: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  section: {
    marginBottom: theme.spacing[8],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  profileCard: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[5],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: theme.spacing[5],
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.interactive.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: theme.spacing[3],
  },
  avatarActionButton: {
    minWidth: 132,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    marginHorizontal: theme.spacing[1],
    marginTop: theme.spacing[2],
  },
  avatarPrimaryButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  avatarSecondaryButton: {
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  avatarActionText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  avatarPrimaryButtonText: {
    color: theme.colors.text.inverse,
  },
  avatarSecondaryButtonText: {
    color: theme.colors.text.primary,
  },
  accountColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[5],
    alignItems: 'flex-start',
  },
  accountColumn: {
    flex: 1,
    minWidth: 148,
  },
  infoRow: {
    marginBottom: theme.spacing[4],
  },
  infoRowLastInColumn: {
    marginBottom: 0,
  },
  label: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[1],
  },
  value: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  pseudonymInput: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  saveProfileButton: {
    marginTop: theme.spacing[5],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  saveProfileButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  settingButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    marginBottom: theme.spacing[2],
  },
  settingLeft: {
    flex: 1,
  },
  settingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  aboutMeInput: {
    minHeight: 120,
    paddingTop: theme.spacing[3],
  },
  settingValue: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
  },
  settingArrow: {
    fontSize: theme.typography.fontSize['2xl'],
    color: theme.colors.text.tertiary,
  },
  subscriptionCard: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[5],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  subscriptionPlan: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  subscriptionDetail: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
  },
  upgradeButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  upgradeButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  logoutButton: {
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.status.error,
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    marginTop: theme.spacing[6],
  },
  logoutButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.status.error,
  },
  footer: {
    alignItems: 'center',
    marginTop: theme.spacing[8],
    marginBottom: theme.spacing[6],
  },
  footerText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.neutral[400],
  },
});
