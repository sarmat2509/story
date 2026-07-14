import React, { useMemo, useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Linking,
  Image,
  Alert,
  Switch,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useAuthStore } from '@/store/authStore';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { UsageSummaryCard } from '@/components/UsageSummaryCard';
import { AnimatedSection } from '@/components/AnimatedSection';
import { AppButton } from '@/components/AppButton';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { useResponsive } from '@/hooks/useResponsive';
import { theme } from '@/theme';
import { modernColors, modernShadows } from '@/theme/modernTheme';
import { usePlansWithAuth, useSubscriptionUsage, useCreatePortalSession } from '@/api/plans';
import {
  useCreatePrivacyRequest,
  usePrivacyRequests,
  type PrivacyRequestType,
} from '@/api/privacyRequests';
import { useDeleteAccount, useUpdateChildModeExitPasscode, useUpdateMe, useUser } from '@/api/auth';
import { formatSubscriptionPeriodEnd } from '@/utils/formatSubscriptionPeriodEnd';
import { formatAssetUrl, isServerAssetUrl, toCanonicalAssetUrl } from '@/utils/assetUrl';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import { buildAccountDataPrivacyRequestMessage } from '@/utils/privacyRequestMessages';
import { uploadPhoto, deletePhoto } from '@/utils/uploadPhoto';
import { assignWebLocation } from '@/utils/webRuntime';
import { confirmImageRights } from '@/utils/imageRightsConsent';
import {
  getAnalyticsConsent,
  onAnalyticsConsentChange,
  setAnalyticsConsent as setStoredAnalyticsConsent,
  type AnalyticsConsent,
} from '@/services/analytics/consent';
import { disablePostHogClient, getPostHogClient } from '@/services/analytics/posthogProvider';

const PAYMENT_ISSUE_STATUSES = new Set(['past_due', 'unpaid', 'incomplete', 'incomplete_expired']);

type ProfilePrivacyRequestIntent = {
  requestType: PrivacyRequestType;
  title: string;
  message: string;
  confirmText: string;
  successMessage: string;
};

type ParentStoryCreationMode = 'instant' | 'artisan';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsive();
  const { user, logout, setUser } = useAuthStore();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const enterKey = useScreenEnter();
  const { data: plansData, isLoading: plansLoading } = usePlansWithAuth();
  const { data: usage, isLoading: usageLoading } = useSubscriptionUsage();
  const privacyRequestsQuery = usePrivacyRequests();
  const createPrivacyRequest = useCreatePrivacyRequest();
  const createPortalSession = useCreatePortalSession();
  const plans = plansData && 'plans' in plansData ? plansData.plans : plansData;
  const enableRealPayments =
    plansData && 'enableRealPayments' in plansData ? plansData.enableRealPayments : false;
  const updateProfile = useUpdateMe();
  const updateStoryMode = useUpdateMe();
  const updateAvatar = useUpdateMe();
  const updateChildModeExitPasscode = useUpdateChildModeExitPasscode();
  const deleteAccount = useDeleteAccount();
  const currentUserQuery = useUser();
  const profileUser = currentUserQuery.data ?? user;
  const [displayName, setDisplayName] = useState(profileUser?.displayName ?? '');
  const [pseudonym, setPseudonym] = useState(profileUser?.pseudonym ?? '');
  const [aboutMe, setAboutMe] = useState(profileUser?.aboutMe ?? '');
  const [currentExitPasscode, setCurrentExitPasscode] = useState('');
  const [newExitPasscode, setNewExitPasscode] = useState('');
  const [confirmExitPasscode, setConfirmExitPasscode] = useState('');
  const [isAvatarBusy, setIsAvatarBusy] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showChildModePasscodeModal, setShowChildModePasscodeModal] = useState(false);
  const [privacyRequestIntent, setPrivacyRequestIntent] =
    useState<ProfilePrivacyRequestIntent | null>(null);
  const [analyticsConsent, setAnalyticsConsentState] = useState<AnalyticsConsent>(() =>
    getAnalyticsConsent()
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation]);

  useEffect(() => {
    setDisplayName(profileUser?.displayName ?? '');
  }, [profileUser?.displayName]);

  useEffect(() => {
    setPseudonym(profileUser?.pseudonym ?? '');
  }, [profileUser?.pseudonym]);

  useEffect(() => {
    setAboutMe(profileUser?.aboutMe ?? '');
  }, [profileUser?.aboutMe]);

  useEffect(() => {
    currentUserQuery.refetch();
  }, [currentUserQuery.refetch]);

  useEffect(() => {
    if (currentUserQuery.data) {
      setUser(currentUserQuery.data);
    }
  }, [currentUserQuery.data, setUser]);

  useEffect(
    () =>
      onAnalyticsConsentChange(() => {
        setAnalyticsConsentState(getAnalyticsConsent());
      }),
    []
  );

  // Get current subscription plan
  const currentPlan = plans?.find((plan) => plan.isCurrent);
  const currentPlanName = currentPlan?.name || t('plans.free');
  // API returns features as object { stories_per_month: { value: { limit } }, ... }
  const featuresObj = currentPlan?.features as
    | Record<string, { value?: { limit?: number } }>
    | undefined;
  const storiesLimit = featuresObj?.stories_per_month?.value?.limit ?? 3;
  const avatarUrl = formatAssetUrl(profileUser?.avatarUrl) ?? profileUser?.avatarUrl ?? null;
  const avatarInitial =
    profileUser?.displayName?.trim().charAt(0) || profileUser?.email?.trim().charAt(0) || 'U';
  const childModeExitPasscodeConfigured = profileUser?.childModeExitPasscodeConfigured === true;
  const storyCreationMode: ParentStoryCreationMode =
    profileUser?.mode === 'artisan' ? 'artisan' : 'instant';
  const trimmedNewExitPasscode = newExitPasscode.trim();
  const canSaveChildModeExitPasscode =
    trimmedNewExitPasscode.length >= 4 &&
    trimmedNewExitPasscode === confirmExitPasscode.trim() &&
    (!childModeExitPasscodeConfigured || currentExitPasscode.trim().length >= 4) &&
    !updateChildModeExitPasscode.isPending;

  const formattedPeriodEnd = formatSubscriptionPeriodEnd(
    usage?.currentPeriodEnd ?? usage?.resetsAt,
    i18n.language
  );
  const hasPaidPlan = currentPlan && (currentPlan.priceMonthly ?? 0) > 0;
  const canManageSubscription =
    enableRealPayments && usage?.paymentProvider === 'stripe' && hasPaidPlan;
  const hasPaymentIssue = usage?.subscriptionStatus
    ? PAYMENT_ISSUE_STATUSES.has(usage.subscriptionStatus)
    : false;
  const recentPrivacyRequests = useMemo(
    () => (privacyRequestsQuery.data ?? []).slice(0, 3),
    [privacyRequestsQuery.data]
  );

  const getPrivacyRequestStatusLabel = (status: string) => {
    switch (status) {
      case 'in_review':
        return t('profile.privacy_request_status_in_review');
      case 'fulfilled':
        return t('profile.privacy_request_status_fulfilled');
      case 'rejected':
        return t('profile.privacy_request_status_rejected');
      case 'canceled':
        return t('profile.privacy_request_status_canceled');
      default:
        return t('profile.privacy_request_status_open');
    }
  };

  const getPrivacyRequestTypeLabel = (requestType: string) => {
    return requestType === 'export'
      ? t('profile.privacy_request_type_export')
      : t('profile.privacy_request_type_deletion');
  };

  const openProfilePrivacyRequest = (requestType: PrivacyRequestType) => {
    if (requestType === 'export') {
      setPrivacyRequestIntent({
        requestType,
        title: t('profile.data_export_confirm_title'),
        message: t('profile.data_export_confirm_message'),
        confirmText: t('profile.request_data_export'),
        successMessage: t('profile.data_export_success_message'),
      });
      return;
    }

    setPrivacyRequestIntent({
      requestType,
      title: t('profile.data_deletion_confirm_title'),
      message: t('profile.data_deletion_confirm_message'),
      confirmText: t('profile.request_data_deletion'),
      successMessage: t('profile.data_deletion_success_message'),
    });
  };

  const submitProfilePrivacyRequest = async () => {
    if (!privacyRequestIntent || createPrivacyRequest.isPending) return;

    try {
      await createPrivacyRequest.mutateAsync({
        requestType: privacyRequestIntent.requestType,
        message: buildAccountDataPrivacyRequestMessage({
          requestType: privacyRequestIntent.requestType,
        }),
      });
      const successMessage = privacyRequestIntent.successMessage;
      setPrivacyRequestIntent(null);
      Alert.alert(t('profile.privacy_request_success_title'), successMessage);
    } catch (err) {
      Alert.alert(t('common.error'), getLocalizedApiError(t, err, 'profile.privacy_request_error'));
    }
  };

  const handleManageSubscription = async () => {
    if (!canManageSubscription) {
      navigation.navigate('Plans' as any);
      return;
    }
    try {
      const { url } = await createPortalSession.mutateAsync();
      if (url && Platform.OS === 'web' && assignWebLocation(url)) {
        return;
      }

      if (url) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('Failed to open portal:', err);
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount.mutateAsync();
    } catch (err) {
      Alert.alert(t('common.error'), getLocalizedApiError(t, err, 'profile.delete_account_error'));
    } finally {
      setShowDeleteAccountConfirm(false);
    }
  };

  const requestPhotoPermission = async () => {
    if (Platform.OS === 'web') return true;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('profile.avatar_permission_title'), t('profile.avatar_permission_message'));
      return false;
    }

    return true;
  };

  const handlePickAvatar = async () => {
    const imageRights = await confirmImageRights(t);
    if (!imageRights) return;

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

      const previousAvatarUrl = profileUser?.avatarUrl ?? null;
      const asset = result.assets[0];
      const localUri = asset.uri;

      setIsAvatarBusy(true);
      try {
        const uploadedAvatar = await uploadPhoto(
          {
            uri: localUri,
            file: asset.file,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
          },
          'profile',
          imageRights
        );
        const canonicalAvatarUrl = toCanonicalAssetUrl(uploadedAvatar.url);

        try {
          await updateAvatar.mutateAsync({ avatarUrl: canonicalAvatarUrl });

          if (
            previousAvatarUrl &&
            previousAvatarUrl !== canonicalAvatarUrl &&
            isServerAssetUrl(previousAvatarUrl)
          ) {
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

  const handleSaveChildModeExitPasscode = async () => {
    const nextPasscode = newExitPasscode.trim();
    const confirmPasscode = confirmExitPasscode.trim();
    const oldPasscode = currentExitPasscode.trim();

    if (nextPasscode.length < 4) {
      Alert.alert(t('common.error'), t('profile.child_mode_exit_passcode_too_short'));
      return;
    }

    if (nextPasscode !== confirmPasscode) {
      Alert.alert(t('common.error'), t('profile.child_mode_exit_passcode_mismatch'));
      return;
    }

    if (childModeExitPasscodeConfigured && oldPasscode.length < 4) {
      Alert.alert(t('common.error'), t('profile.child_mode_exit_passcode_current_required'));
      return;
    }

    try {
      await updateChildModeExitPasscode.mutateAsync({
        ...(childModeExitPasscodeConfigured ? { oldPasscode } : {}),
        newPasscode: nextPasscode,
      });
      setCurrentExitPasscode('');
      setNewExitPasscode('');
      setConfirmExitPasscode('');
      setShowChildModePasscodeModal(false);
      Alert.alert(
        t('profile.child_mode_exit_passcode_success_title'),
        t('profile.child_mode_exit_passcode_success_message')
      );
    } catch (error) {
      Alert.alert(
        t('common.error'),
        getLocalizedApiError(t, error, 'profile.child_mode_exit_passcode_error')
      );
    }
  };

  const handleCloseChildModePasscodeModal = () => {
    if (updateChildModeExitPasscode.isPending) return;
    setShowChildModePasscodeModal(false);
    setCurrentExitPasscode('');
    setNewExitPasscode('');
    setConfirmExitPasscode('');
  };

  const handleRemoveAvatar = async () => {
    if (!profileUser?.avatarUrl) return;

    const previousAvatarUrl = profileUser.avatarUrl;
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

  const handleAnalyticsConsentChange = (enabled: boolean) => {
    const nextConsent = enabled ? 'granted' : 'denied';
    setStoredAnalyticsConsent(nextConsent);
    setAnalyticsConsentState(nextConsent);
    if (enabled) {
      getPostHogClient();
    } else {
      disablePostHogClient();
    }
  };

  const handleStoryCreationModeChange = async (mode: ParentStoryCreationMode) => {
    if (mode === storyCreationMode || updateStoryMode.isPending) return;

    try {
      await updateStoryMode.mutateAsync({ mode });
    } catch (error) {
      Alert.alert(t('common.error'), getLocalizedApiError(t, error, 'common.error'));
    }
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
        testID="profile-screen"
      >
        <AnimatedSection delay={0} trigger={enterKey}>
          <View style={[styles.header, isMobile && styles.headerMobile]}>
            <Text style={styles.title}>{t('profile.title')}</Text>
          </View>
        </AnimatedSection>

        <View style={[styles.profileLayout, isMobile && styles.profileLayoutMobile]}>
          <AnimatedSection
            delay={120}
            trigger={enterKey}
            style={[styles.profileAside, isMobile && styles.profileAsideMobile]}
          >
            <View style={[styles.profileAsideCard, isMobile && styles.profileAsideCardMobile]}>
              <TouchableOpacity
                style={styles.avatarContainer}
                onPress={handlePickAvatar}
                activeOpacity={0.85}
                disabled={isAvatarBusy}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarPlaceholder}>{avatarInitial.toUpperCase()}</Text>
                )}

                {isAvatarBusy ? (
                  <View style={styles.avatarLoadingOverlay}>
                    <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                  </View>
                ) : null}
              </TouchableOpacity>

              <Text style={styles.profileAsideName}>
                {displayName.trim() || profileUser?.email || t('profile.not_set')}
              </Text>
              <Text style={styles.profileAsideEmail}>
                {profileUser?.email || t('profile.not_set')}
              </Text>

              <View style={styles.profileAsidePlanPill}>
                <Ionicons
                  name="diamond-outline"
                  size={16}
                  color={theme.colors.interactive.primary}
                />
                <Text style={styles.profileAsidePlanText}>{currentPlanName}</Text>
              </View>

              <View style={styles.avatarActions}>
                <AppButton
                  label={
                    isAvatarBusy
                      ? t('profile.avatar_uploading')
                      : avatarUrl
                        ? t('profile.change_avatar')
                        : t('profile.add_avatar')
                  }
                  onPress={handlePickAvatar}
                  disabled={isAvatarBusy}
                  loading={isAvatarBusy}
                  variant="secondary"
                  size="md"
                  style={styles.avatarAction}
                />

                {profileUser?.avatarUrl ? (
                  <AppButton
                    label={t('profile.remove_avatar')}
                    onPress={handleRemoveAvatar}
                    disabled={isAvatarBusy}
                    variant="dangerSecondary"
                    size="md"
                    style={styles.avatarAction}
                  />
                ) : null}
              </View>
            </View>
          </AnimatedSection>

          <View style={[styles.settingsGrid, isMobile && styles.settingsGridMobile]}>
            <AnimatedSection
              delay={120}
              trigger={enterKey}
              style={[
                styles.settingsPanel,
                styles.settingsPanelWide,
                isMobile && styles.settingsPanelMobile,
              ]}
            >
              <View style={styles.settingsPanelHeader}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={theme.colors.interactive.primary}
                />
                <Text style={styles.sectionTitle}>{t('profile.account_info')}</Text>
              </View>

              <View style={[styles.accountColumns, isMobile && styles.accountColumnsMobile]}>
                <View style={[styles.accountColumn, isMobile && styles.accountColumnMobile]}>
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
                    <Text style={styles.value}>{profileUser?.email || t('profile.not_set')}</Text>
                  </View>
                </View>

                <View style={[styles.accountColumn, isMobile && styles.accountColumnMobile]}>
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

              <AppButton
                label={t('common.save')}
                onPress={handleSaveProfile}
                disabled={updateProfile.isPending}
                loading={updateProfile.isPending}
                style={[styles.profileSaveAction, isMobile && styles.mobileFullWidthAction]}
              />
            </AnimatedSection>

            <AnimatedSection
              delay={160}
              trigger={enterKey}
              style={[
                styles.settingsPanel,
                styles.settingsPanelWide,
                isMobile && styles.settingsPanelMobile,
              ]}
            >
              <View style={styles.settingsPanelHeader}>
                <Ionicons
                  name="sparkles-outline"
                  size={20}
                  color={theme.colors.interactive.primary}
                />
                <Text style={styles.sectionTitle}>{t('profile.mode')}</Text>
                {updateStoryMode.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.interactive.primary}
                    style={styles.storyModeSavingIndicator}
                  />
                ) : null}
              </View>

              <Text style={styles.storyModeDescription}>
                {t('mode_selection.can_change_later')}
              </Text>

              <View style={[styles.storyModeOptions, isMobile && styles.storyModeOptionsMobile]}>
                {(['instant', 'artisan'] as const).map((mode) => {
                  const selected = storyCreationMode === mode;
                  const isInstant = mode === 'instant';
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.storyModeOption,
                        selected && styles.storyModeOptionSelected,
                        updateStoryMode.isPending && styles.storyModeOptionDisabled,
                      ]}
                      activeOpacity={0.82}
                      disabled={updateStoryMode.isPending}
                      onPress={() => handleStoryCreationModeChange(mode)}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: selected,
                        disabled: updateStoryMode.isPending,
                      }}
                      aria-checked={selected}
                      testID={`profile-story-mode-${mode}`}
                    >
                      <View
                        style={[styles.storyModeIcon, selected && styles.storyModeIconSelected]}
                      >
                        <Ionicons
                          name={isInstant ? 'flash' : 'color-palette'}
                          size={22}
                          color={
                            selected ? theme.colors.text.inverse : theme.colors.interactive.primary
                          }
                        />
                      </View>
                      <View style={styles.storyModeOptionText}>
                        <Text style={styles.storyModeOptionTitle}>
                          {isInstant
                            ? t('mode_selection.instant_mode')
                            : t('mode_selection.artisan_mode')}
                        </Text>
                        <Text style={styles.storyModeOptionDescription}>
                          {isInstant
                            ? t('mode_selection.instant_description')
                            : t('mode_selection.artisan_description')}
                        </Text>
                      </View>
                      <View
                        style={[styles.storyModeRadio, selected && styles.storyModeRadioSelected]}
                      >
                        {selected ? <View style={styles.storyModeRadioDot} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </AnimatedSection>

            <AnimatedSection
              delay={180}
              trigger={enterKey}
              style={[styles.settingsPanel, isMobile && styles.settingsPanelMobile]}
            >
              <View style={styles.settingsPanelHeader}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={theme.colors.interactive.primary}
                />
                <Text style={styles.sectionTitle}>
                  {t('profile.child_mode_exit_passcode_section')}
                </Text>
              </View>

              <View
                style={[styles.exitPasscodeHeader, isMobile && styles.exitPasscodeHeaderMobile]}
              >
                <View style={styles.exitPasscodeHeaderText}>
                  <Text style={styles.exitPasscodeTitle}>
                    {t('profile.child_mode_exit_passcode_title')}
                  </Text>
                  <Text style={styles.exitPasscodeDescription}>
                    {t('profile.child_mode_exit_passcode_body')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.exitPasscodeStatusPill,
                    childModeExitPasscodeConfigured && styles.exitPasscodeStatusPillEnabled,
                  ]}
                >
                  <Ionicons
                    name={
                      childModeExitPasscodeConfigured
                        ? 'shield-checkmark-outline'
                        : 'shield-outline'
                    }
                    size={16}
                    color={
                      childModeExitPasscodeConfigured
                        ? theme.colors.status.success
                        : theme.colors.text.tertiary
                    }
                  />
                  <Text
                    style={[
                      styles.exitPasscodeStatusText,
                      childModeExitPasscodeConfigured && styles.exitPasscodeStatusTextEnabled,
                    ]}
                  >
                    {childModeExitPasscodeConfigured
                      ? t('profile.child_mode_exit_passcode_set')
                      : t('profile.child_mode_exit_passcode_not_set')}
                  </Text>
                </View>
              </View>

              <AppButton
                label={
                  childModeExitPasscodeConfigured
                    ? t('profile.child_mode_exit_passcode_change')
                    : t('profile.child_mode_exit_passcode_save')
                }
                onPress={() => setShowChildModePasscodeModal(true)}
                style={[styles.profileSaveAction, isMobile && styles.mobileFullWidthAction]}
                testID="profile-child-mode-passcode-open"
              />
            </AnimatedSection>

            <AnimatedSection
              delay={220}
              trigger={enterKey}
              style={[styles.settingsPanel, isMobile && styles.settingsPanelMobile]}
            >
              <View style={styles.settingsPanelHeader}>
                <Ionicons
                  name="options-outline"
                  size={20}
                  color={theme.colors.interactive.primary}
                />
                <Text style={styles.sectionTitle}>{t('profile.preferences')}</Text>
              </View>

              <TouchableOpacity
                style={styles.settingButton}
                onPress={() => navigation.navigate('LanguageSettings')}
              >
                <Text style={styles.settingText}>{t('profile.language_settings')}</Text>
                <Text style={styles.settingArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.settingButton}
                onPress={() => navigation.navigate('ThemeSettings')}
              >
                <View style={styles.settingLeft}>
                  <Text style={styles.settingText}>{t('profile.theme_settings')}</Text>
                  {profileUser?.themePalette ? (
                    <Text style={styles.settingValue}>
                      {t(`theme.palette_names.${profileUser.themePalette}`)}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.settingArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingButton}>
                <Text style={styles.settingText}>{t('profile.notification_settings')}</Text>
                <Text style={styles.settingArrow}>›</Text>
              </TouchableOpacity>

              {Platform.OS === 'web' ? (
                <View style={styles.settingButton}>
                  <View style={styles.settingLeft}>
                    <Text style={styles.settingText}>{t('profile.analytics_settings')}</Text>
                    <Text style={styles.settingValue}>
                      {analyticsConsent === 'granted'
                        ? t('profile.analytics_enabled')
                        : t('profile.analytics_disabled')}
                    </Text>
                  </View>
                  <Switch
                    value={analyticsConsent === 'granted'}
                    onValueChange={handleAnalyticsConsentChange}
                    trackColor={{
                      false: theme.colors.neutral[300],
                      true: theme.colors.interactive.primary,
                    }}
                    thumbColor={theme.colors.background.primary}
                  />
                </View>
              ) : null}
            </AnimatedSection>

            <AnimatedSection
              delay={280}
              trigger={enterKey}
              style={[styles.settingsPanel, isMobile && styles.settingsPanelMobile]}
            >
              <View style={styles.settingsPanelHeader}>
                <Ionicons
                  name="diamond-outline"
                  size={20}
                  color={theme.colors.interactive.primary}
                />
                <Text style={styles.sectionTitle}>{t('profile.subscription')}</Text>
              </View>

              {plansLoading ? (
                <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
              ) : (
                <>
                  <Text style={styles.subscriptionPlan}>{currentPlanName}</Text>
                  {hasPaymentIssue ? (
                    <Text style={styles.subscriptionDetail}>
                      {t('profile.subscription_payment_issue')}
                    </Text>
                  ) : usage?.cancelAtPeriodEnd && formattedPeriodEnd ? (
                    <Text style={styles.subscriptionDetail}>
                      {t('profile.subscription_canceling', { date: formattedPeriodEnd })}
                    </Text>
                  ) : formattedPeriodEnd ? (
                    <Text style={styles.subscriptionDetail}>
                      {t('profile.subscription_until', { date: formattedPeriodEnd })}
                    </Text>
                  ) : null}
                  {usage ? (
                    <UsageSummaryCard
                      usage={usage}
                      periodEndFormatted={formattedPeriodEnd}
                      hidePeriodEnd={usage.cancelAtPeriodEnd === true}
                      variant="embedded"
                    />
                  ) : usageLoading ? (
                    <Text style={styles.subscriptionDetail}>{t('common.loading')}</Text>
                  ) : (
                    <Text style={styles.subscriptionDetail}>
                      {t('profile.stories_per_month', { count: storiesLimit })}
                    </Text>
                  )}
                  <AppButton
                    label={
                      canManageSubscription
                        ? t('billing.manage_subscription')
                        : t('profile.upgrade_plan')
                    }
                    style={[styles.subscriptionAction, isMobile && styles.mobileFullWidthAction]}
                    onPress={handleManageSubscription}
                    disabled={createPortalSession.isPending}
                    loading={createPortalSession.isPending}
                    variant="primary"
                  />
                </>
              )}
            </AnimatedSection>

            <AnimatedSection
              delay={320}
              trigger={enterKey}
              style={[
                styles.settingsPanel,
                styles.settingsPanelWide,
                isMobile && styles.settingsPanelMobile,
              ]}
            >
              <View style={styles.settingsPanelHeader}>
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color={theme.colors.interactive.primary}
                />
                <Text style={styles.sectionTitle}>{t('profile.data_requests_title')}</Text>
              </View>

              <TouchableOpacity
                style={styles.settingButton}
                onPress={() => navigation.navigate('Children')}
              >
                <View style={styles.settingLeft}>
                  <Text style={styles.settingText}>
                    {t('profile.child_data_deletion_requests')}
                  </Text>
                  <Text style={styles.settingValue}>
                    {t('profile.child_data_deletion_requests_hint')}
                  </Text>
                </View>
                <Text style={styles.settingArrow}>›</Text>
              </TouchableOpacity>

              <View style={styles.privacyActionsPanel}>
                <Text style={styles.privacyActionsBody}>{t('profile.data_requests_body')}</Text>
                <View
                  style={[styles.privacyActionsRow, isMobile && styles.privacyActionsRowMobile]}
                >
                  <AppButton
                    label={t('profile.request_data_export')}
                    style={[styles.privacyActionButton, isMobile && styles.mobileFullWidthAction]}
                    disabled={createPrivacyRequest.isPending}
                    onPress={() => openProfilePrivacyRequest('export')}
                    variant="secondary"
                    size="md"
                    leading={
                      <Ionicons
                        name="download-outline"
                        size={16}
                        color={theme.colors.interactive.primary}
                      />
                    }
                  />
                  <AppButton
                    label={t('profile.request_data_deletion')}
                    style={[styles.privacyActionButton, isMobile && styles.mobileFullWidthAction]}
                    disabled={createPrivacyRequest.isPending}
                    onPress={() => openProfilePrivacyRequest('deletion')}
                    variant="dangerSecondary"
                    size="md"
                    leading={
                      <Ionicons name="trash-outline" size={16} color={theme.colors.status.error} />
                    }
                  />
                </View>
                <View style={styles.deleteAccountPanel}>
                  <Text style={styles.deleteAccountTitle}>{t('profile.delete_account_title')}</Text>
                  <Text style={styles.deleteAccountBody}>{t('profile.delete_account_body')}</Text>
                  <AppButton
                    label={
                      deleteAccount.isPending
                        ? t('profile.delete_account_deleting')
                        : t('profile.delete_account_button')
                    }
                    style={[styles.deleteAccountAction, isMobile && styles.mobileFullWidthAction]}
                    disabled={deleteAccount.isPending}
                    onPress={() => setShowDeleteAccountConfirm(true)}
                    variant="danger"
                    size="md"
                    leading={
                      <Ionicons
                        name="warning-outline"
                        size={16}
                        color={theme.colors.text.inverse}
                      />
                    }
                  />
                </View>
              </View>

              {privacyRequestsQuery.isLoading || recentPrivacyRequests.length > 0 ? (
                <View style={styles.privacyRequestsPanel}>
                  <Text style={styles.privacyRequestsTitle}>
                    {t('profile.privacy_requests_recent')}
                  </Text>
                  {privacyRequestsQuery.isLoading ? (
                    <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                  ) : (
                    recentPrivacyRequests.map((request) => (
                      <View
                        key={request.id}
                        style={[
                          styles.privacyRequestRow,
                          isMobile && styles.privacyRequestRowMobile,
                        ]}
                      >
                        <View style={styles.privacyRequestInfo}>
                          <Text style={styles.privacyRequestType}>
                            {getPrivacyRequestTypeLabel(request.requestType)}
                          </Text>
                          <Text style={styles.privacyRequestDate}>
                            {new Date(request.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={styles.privacyRequestStatusPill}>
                          <Text style={styles.privacyRequestStatusText}>
                            {getPrivacyRequestStatusLabel(request.status)}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </AnimatedSection>

            <AnimatedSection
              delay={420}
              trigger={enterKey}
              style={[
                styles.settingsPanel,
                styles.settingsPanelFooter,
                isMobile && styles.settingsPanelMobile,
              ]}
            >
              <AppButton
                label={t('profile.logout')}
                onPress={handleLogout}
                variant="dangerSecondary"
                style={[styles.logoutAction, isMobile && styles.mobileFullWidthAction]}
              />

              <View style={styles.footer}>
                <Text style={styles.footerText}>WonderTales v1.0.0</Text>
              </View>
            </AnimatedSection>
          </View>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={showLogoutConfirm}
        title={t('profile.logout_confirm_title')}
        message={t('profile.logout_confirm_message')}
        confirmText={t('profile.logout')}
        cancelText={t('profile.cancel')}
        onConfirm={() => {
          logout();
          setShowLogoutConfirm(false);
        }}
        onCancel={() => setShowLogoutConfirm(false)}
        variant="danger"
      />

      <ConfirmDialog
        visible={Boolean(privacyRequestIntent)}
        title={privacyRequestIntent?.title ?? ''}
        message={privacyRequestIntent?.message ?? ''}
        confirmText={
          createPrivacyRequest.isPending
            ? t('profile.privacy_request_submitting')
            : (privacyRequestIntent?.confirmText ?? t('common.save'))
        }
        cancelText={t('common.cancel')}
        onConfirm={submitProfilePrivacyRequest}
        onCancel={() => {
          if (!createPrivacyRequest.isPending) {
            setPrivacyRequestIntent(null);
          }
        }}
        variant={privacyRequestIntent?.requestType === 'deletion' ? 'danger' : 'info'}
      />

      <ConfirmDialog
        visible={showDeleteAccountConfirm}
        title={t('profile.delete_account_confirm_title')}
        message={t('profile.delete_account_confirm_message')}
        confirmText={
          deleteAccount.isPending
            ? t('profile.delete_account_deleting')
            : t('profile.delete_account_button')
        }
        cancelText={t('common.cancel')}
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          if (!deleteAccount.isPending) {
            setShowDeleteAccountConfirm(false);
          }
        }}
        variant="danger"
      />

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="profile"
      />

      <Modal
        visible={showChildModePasscodeModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseChildModePasscodeModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.passcodeModal, isMobile && styles.passcodeModalMobile]}
            testID="profile-child-mode-passcode-modal"
          >
            <View
              style={[styles.passcodeModalHeader, isMobile && styles.passcodeModalHeaderMobile]}
            >
              <View style={styles.passcodeModalHeaderText}>
                <Text style={styles.passcodeModalTitle}>
                  {t('profile.child_mode_exit_passcode_title')}
                </Text>
                <Text style={styles.passcodeModalDescription}>
                  {t('profile.child_mode_exit_passcode_body')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseChildModePasscodeModal}
                style={styles.passcodeModalClose}
                disabled={updateChildModeExitPasscode.isPending}
                accessibilityRole="button"
                testID="profile-child-mode-passcode-close"
              >
                <Ionicons name="close" size={24} color={theme.colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {childModeExitPasscodeConfigured ? (
              <View style={styles.infoRow}>
                <Text style={styles.label}>{t('profile.child_mode_exit_passcode_current')}</Text>
                <TextInput
                  style={styles.pseudonymInput}
                  value={currentExitPasscode}
                  onChangeText={setCurrentExitPasscode}
                  placeholder={t('profile.child_mode_exit_passcode_current')}
                  placeholderTextColor={theme.colors.text.tertiary}
                  secureTextEntry
                  maxLength={128}
                  testID="profile-child-mode-passcode-current"
                />
              </View>
            ) : null}

            <View style={[styles.exitPasscodeFields, isMobile && styles.exitPasscodeFieldsMobile]}>
              <View style={[styles.exitPasscodeField, isMobile && styles.exitPasscodeFieldMobile]}>
                <Text style={styles.label}>{t('profile.child_mode_exit_passcode_new')}</Text>
                <TextInput
                  style={styles.pseudonymInput}
                  value={newExitPasscode}
                  onChangeText={setNewExitPasscode}
                  placeholder={t('profile.child_mode_exit_passcode_placeholder')}
                  placeholderTextColor={theme.colors.text.tertiary}
                  secureTextEntry
                  maxLength={128}
                  testID="profile-child-mode-passcode-new"
                />
              </View>
              <View style={[styles.exitPasscodeField, isMobile && styles.exitPasscodeFieldMobile]}>
                <Text style={styles.label}>{t('profile.child_mode_exit_passcode_confirm')}</Text>
                <TextInput
                  style={styles.pseudonymInput}
                  value={confirmExitPasscode}
                  onChangeText={setConfirmExitPasscode}
                  placeholder={t('profile.child_mode_exit_passcode_placeholder')}
                  placeholderTextColor={theme.colors.text.tertiary}
                  secureTextEntry
                  maxLength={128}
                  onSubmitEditing={handleSaveChildModeExitPasscode}
                  testID="profile-child-mode-passcode-confirm"
                />
              </View>
            </View>

            <View
              style={[styles.passcodeModalActions, isMobile && styles.passcodeModalActionsMobile]}
            >
              <AppButton
                label={t('common.cancel')}
                onPress={handleCloseChildModePasscodeModal}
                disabled={updateChildModeExitPasscode.isPending}
                variant="secondary"
                size="md"
                style={[styles.passcodeModalAction, isMobile && styles.mobileFullWidthAction]}
                testID="profile-child-mode-passcode-cancel"
              />
              <AppButton
                label={
                  childModeExitPasscodeConfigured
                    ? t('profile.child_mode_exit_passcode_change')
                    : t('profile.child_mode_exit_passcode_save')
                }
                onPress={handleSaveChildModeExitPasscode}
                disabled={!canSaveChildModeExitPasscode}
                loading={updateChildModeExitPasscode.isPending}
                size="md"
                style={[styles.passcodeModalAction, isMobile && styles.mobileFullWidthAction]}
                testID="profile-child-mode-passcode-save"
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing[8],
    paddingBottom: theme.spacing[12],
    minHeight: '100%',
    backgroundColor: modernColors.page,
  },
  header: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    marginBottom: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  profileLayout: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[6],
  },
  profileAside: {
    width: 340,
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? {
          position: 'sticky' as any,
          top: theme.spacing[8],
        }
      : {}),
  },
  profileAsideCard: {
    backgroundColor: modernColors.surface,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    alignItems: 'center',
    ...modernShadows.subtle,
  },
  profileAsideName: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  profileAsideEmail: {
    marginTop: theme.spacing[1],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  profileAsidePlanPill: {
    minHeight: 36,
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  profileAsidePlanText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  settingsGrid: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: theme.spacing[5],
  },
  settingsPanel: {
    flexGrow: 1,
    flexBasis: 380,
    minWidth: 320,
    backgroundColor: modernColors.surface,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    ...modernShadows.subtle,
  },
  settingsPanelWide: {
    flexBasis: '100%',
  },
  settingsPanelFooter: {
    flexBasis: '100%',
    alignItems: 'center',
  },
  settingsPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  section: {
    marginBottom: theme.spacing[10],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: 0,
  },
  storyModeSavingIndicator: {
    marginLeft: 'auto',
  },
  storyModeDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
    marginBottom: theme.spacing[4],
  },
  storyModeOptions: {
    flexDirection: 'row',
    gap: theme.spacing[4],
  },
  storyModeOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: theme.colors.background.primary,
  },
  storyModeOptionSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: `${theme.colors.interactive.primary}0D`,
  },
  storyModeOptionDisabled: {
    opacity: 0.65,
  },
  storyModeIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.borders.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${theme.colors.interactive.primary}14`,
  },
  storyModeIconSelected: {
    backgroundColor: theme.colors.interactive.primary,
  },
  storyModeOptionText: {
    flex: 1,
    minWidth: 0,
  },
  storyModeOptionTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  storyModeOptionDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  storyModeRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyModeRadioSelected: {
    borderColor: theme.colors.interactive.primary,
  },
  storyModeRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.interactive.primary,
  },
  profileCard: {
    backgroundColor: modernColors.surface,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    ...modernShadows.subtle,
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
    width: '100%',
    gap: theme.spacing[2],
    marginTop: theme.spacing[5],
  },
  avatarAction: {
    width: '100%',
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
  profileSaveAction: {
    alignSelf: 'flex-start',
    minWidth: 180,
    marginTop: theme.spacing[5],
  },
  exitPasscodeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  exitPasscodeHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  exitPasscodeTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  exitPasscodeDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  exitPasscodeStatusPill: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.primary,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
  },
  exitPasscodeStatusPillEnabled: {
    borderColor: theme.colors.status.success,
    backgroundColor: `${theme.colors.status.success}12`,
  },
  exitPasscodeStatusText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
  },
  exitPasscodeStatusTextEnabled: {
    color: theme.colors.status.success,
  },
  exitPasscodeFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[4],
  },
  exitPasscodeField: {
    flex: 1,
    minWidth: 220,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[5],
  },
  passcodeModal: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: modernColors.surface,
    borderRadius: theme.borders.radius.xl,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    padding: theme.spacing[5],
    ...modernShadows.subtle,
  },
  passcodeModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[5],
  },
  passcodeModalHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  passcodeModalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  passcodeModalDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  passcodeModalClose: {
    width: 40,
    height: 40,
    borderRadius: theme.borders.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  passcodeModalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
    marginTop: theme.spacing[5],
  },
  passcodeModalAction: {
    minWidth: 180,
  },
  settingButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
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
  privacyActionsPanel: {
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  privacyActionsTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  privacyActionsBody: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  privacyActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  privacyActionButton: {
    minWidth: 220,
  },
  deleteAccountPanel: {
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
    gap: theme.spacing[2],
  },
  deleteAccountTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.status.error,
  },
  deleteAccountBody: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  deleteAccountAction: {
    alignSelf: 'flex-start',
    minWidth: 220,
  },
  privacyRequestsPanel: {
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
  },
  privacyRequestsTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  privacyRequestRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
  },
  privacyRequestInfo: {
    flex: 1,
    minWidth: 0,
  },
  privacyRequestType: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  privacyRequestDate: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
  },
  privacyRequestStatusPill: {
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
  },
  privacyRequestStatusText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
    textTransform: 'capitalize',
  },
  subscriptionCard: {
    backgroundColor: modernColors.surface,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    ...modernShadows.subtle,
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
  subscriptionAction: {
    alignSelf: 'flex-start',
    minWidth: 240,
  },
  logoutAction: {
    minWidth: 220,
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
  contentMobile: {
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  headerMobile: {
    marginBottom: theme.spacing[4],
  },
  profileLayoutMobile: {
    flexDirection: 'column',
    gap: theme.spacing[4],
  },
  profileAsideMobile: {
    width: '100%',
    position: 'relative',
    top: 0,
  },
  profileAsideCardMobile: {
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
  },
  settingsGridMobile: {
    width: '100%',
    flexDirection: 'column',
    flexWrap: 'nowrap',
    gap: theme.spacing[3],
  },
  settingsPanelMobile: {
    width: '100%',
    minWidth: 0,
    flexBasis: 'auto',
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
  },
  storyModeOptionsMobile: {
    flexDirection: 'column',
  },
  accountColumnsMobile: {
    flexDirection: 'column',
    gap: theme.spacing[4],
  },
  accountColumnMobile: {
    width: '100%',
    minWidth: 0,
  },
  exitPasscodeHeaderMobile: {
    flexDirection: 'column',
    gap: theme.spacing[3],
  },
  privacyActionsRowMobile: {
    flexDirection: 'column',
  },
  privacyRequestRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  passcodeModalMobile: {
    maxWidth: '100%',
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
  },
  passcodeModalHeaderMobile: {
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  exitPasscodeFieldsMobile: {
    flexDirection: 'column',
    gap: theme.spacing[3],
  },
  exitPasscodeFieldMobile: {
    width: '100%',
    minWidth: 0,
  },
  passcodeModalActionsMobile: {
    flexDirection: 'column',
  },
  mobileFullWidthAction: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
});
