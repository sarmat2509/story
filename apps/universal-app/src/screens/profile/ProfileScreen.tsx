import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';
import { usePlansWithAuth } from '@/api/plans';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigation = useNavigation();
  const { data: plans, isLoading: plansLoading } = usePlansWithAuth();

  // Get current subscription plan
  const currentPlan = plans?.find(plan => plan.isCurrent);
  const storiesLimit = currentPlan?.features?.stories_per_month?.value?.limit || 5;

  const handleLogout = () => {
    Alert.alert(
      t('profile.logout_confirm_title'),
      t('profile.logout_confirm_message'),
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: t('profile.logout'),
          style: 'destructive',
          onPress: () => logout(),
        },
      ],
      { cancelable: true }
    );
  };

  return (
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
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.preferences')}</Text>
        
        {/* Only show Language Settings on native platforms */}
        {Platform.OS !== 'web' && (
          <TouchableOpacity 
            style={styles.settingButton}
            onPress={() => navigation.navigate('LanguageSettings' as any)}
          >
            <Text style={styles.settingText}>{t('profile.language_settings')}</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
        )}

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
            <Text style={styles.subscriptionDetail}>
              {t('profile.stories_per_month', { count: storiesLimit })}
            </Text>
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
        <Text style={styles.footerText}>Kazka+ v1.0.0</Text>
      </View>
    </ScrollView>
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
  settingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
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
