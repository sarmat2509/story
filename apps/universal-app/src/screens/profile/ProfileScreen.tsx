import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useAuthStore } from '@/store/authStore';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { theme } from '@/theme';
import { usePlansWithAuth, useSubscriptionUsage } from '@/api/plans';
import { useUpdateMe } from '@/api/auth';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { data: plans, isLoading: plansLoading } = usePlansWithAuth();
  const { data: usage, isLoading: usageLoading } = useSubscriptionUsage();
  const updateMe = useUpdateMe();
  const [pseudonym, setPseudonym] = useState(user?.pseudonym ?? '');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    setPseudonym(user?.pseudonym ?? '');
  }, [user?.pseudonym]);

  // Get current subscription plan
  const currentPlan = plans?.find(plan => plan.isCurrent);
  const featuresArr = currentPlan?.features as Array<{ name?: string; value?: { limit?: number } }> | undefined;
  const storiesLimit = featuresArr?.find((f) => f?.name === 'stories_per_month')?.value?.limit ?? 5;

  const formattedResetsAt = usage?.resetsAt
    ? new Date(usage.resetsAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  const handleLogout = () => setShowLogoutConfirm(true);

  return (
    <>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('profile.title')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.account_info')}</Text>
        
        <View style={styles.profileCard}>
          {user?.avatarUrl && (
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarPlaceholder}>
                {user.displayName?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('profile.name')}</Text>
            <Text style={styles.value}>{user?.displayName || t('profile.not_set')}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('profile.email')}</Text>
            <Text style={styles.value}>{user?.email || t('profile.not_set')}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('profile.language')}</Text>
            <Text style={styles.value}>{user?.preferredLocale || 'en'}</Text>
          </View>

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
            <TouchableOpacity
              style={styles.savePseudonymButton}
              onPress={() => updateMe.mutate({ pseudonym: pseudonym.trim() || null })}
              disabled={updateMe.isPending}
            >
              {updateMe.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.text.inverse} />
              ) : (
                <Text style={styles.savePseudonymText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
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

        <TouchableOpacity style={styles.settingButton}>
          <Text style={styles.settingText}>{t('profile.privacy_settings')}</Text>
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
              {currentPlan?.name || t('plans.free.name')}
            </Text>
            {usage && formattedResetsAt ? (
              <Text style={styles.subscriptionDetail}>
                {t('profile.usage_remaining', {
                  stories: usage.stories.remaining,
                  audio: usage.audio.remaining,
                  date: formattedResetsAt,
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
              onPress={() => navigation.navigate('Plans' as any)}
            >
              <Text style={styles.upgradeButtonText}>{t('profile.upgrade_plan')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.support')}</Text>
        
        <TouchableOpacity style={styles.settingButton}>
          <Text style={styles.settingText}>{t('profile.help_center')}</Text>
          <Text style={styles.settingArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingButton}>
          <Text style={styles.settingText}>{t('profile.terms_of_service')}</Text>
          <Text style={styles.settingArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingButton}>
          <Text style={styles.settingText}>{t('profile.privacy_policy')}</Text>
          <Text style={styles.settingArrow}>›</Text>
        </TouchableOpacity>
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
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.interactive.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: theme.spacing[5],
  },
  avatarPlaceholder: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
  infoRow: {
    marginBottom: theme.spacing[4],
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
  savePseudonymButton: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
    minWidth: 80,
    alignItems: 'center',
  },
  savePseudonymText: {
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
