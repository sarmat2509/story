import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useForgotPassword } from '@/api/auth';
import { theme } from '@/theme';
import { getLocalizedApiError } from '@/utils/localizedApiError';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const forgotPasswordMutation = useForgotPassword();

  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim();
  const emailValid = EMAIL_REGEX.test(normalizedEmail);
  const canSubmit = emailValid && !forgotPasswordMutation.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setError(null);
      await forgotPasswordMutation.mutateAsync(normalizedEmail);
      setEmail(normalizedEmail);
      setSubmittedEmail(normalizedEmail);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(getLocalizedApiError(t, err, 'common.error'));
    }
  };

  const handleUseDifferentEmail = () => {
    setSubmitted(false);
    setError(null);
    forgotPasswordMutation.reset();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.content, submitted && styles.successContent]}>
          <Text style={styles.title}>{t('auth.forgot_password')}</Text>
          <Text style={styles.subtitle}>{t('auth.forgot_password_subtitle')}</Text>

          {submitted ? (
            <View style={styles.successCard}>
              <View style={styles.successIconContainer}>
                <Ionicons
                  name="mail-unread-outline"
                  size={34}
                  color={theme.colors.status.success}
                />
              </View>
              <Text style={styles.successTitle}>{t('auth.reset_link_sent_title')}</Text>
              <Text style={styles.successText}>
                {t('auth.reset_link_sent_body', { email: submittedEmail })}
              </Text>
              <View style={styles.emailBadge}>
                <Ionicons name="mail-outline" size={18} color={theme.colors.text.secondary} />
                <Text style={styles.emailBadgeText} numberOfLines={1}>
                  {submittedEmail}
                </Text>
              </View>
              <View style={styles.helpContainer}>
                <Text style={styles.helpText}>{t('auth.reset_link_sent_help')}</Text>
                <Text style={styles.privacyText}>{t('auth.reset_link_sent_privacy')}</Text>
              </View>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.navigate('Welcome')}
              >
                <Ionicons name="log-in-outline" size={19} color={theme.colors.text.inverse} />
                <Text style={styles.backButtonText}>{t('auth.back_to_login')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleUseDifferentEmail}>
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={theme.colors.interactive.primary}
                />
                <Text style={styles.secondaryButtonText}>{t('auth.use_different_email')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Text style={styles.inputLabel}>{t('auth.email')}</Text>
              <TextInput
                nativeID="forgot-password-email"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.email_placeholder')}
                placeholderTextColor={theme.colors.text.tertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
              />

              <TouchableOpacity
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {forgotPasswordMutation.isPending ? (
                  <ActivityIndicator color={theme.colors.text.inverse} />
                ) : (
                  <Text style={styles.buttonText}>{t('auth.send_reset_link')}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => navigation.navigate('Welcome')}
              >
                <Text style={styles.backLinkText}>{t('auth.back_to_login')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[6],
  },
  content: {
    width: '100%',
    maxWidth: 400,
  },
  successContent: {
    maxWidth: 480,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
    color: theme.colors.text.primary,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    textAlign: 'center',
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[8],
  },
  errorContainer: {
    backgroundColor: theme.colors.error[50],
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
  },
  errorText: {
    color: theme.colors.status.error,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.sm,
  },
  inputLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  input: {
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[6],
  },
  button: {
    backgroundColor: theme.colors.interactive.primary,
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  backLink: {
    marginTop: theme.spacing[6],
    alignSelf: 'center',
  },
  backLinkText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.interactive.primary,
  },
  successCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[6],
  },
  successIconContainer: {
    width: 64,
    height: 64,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.success[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[4],
  },
  successTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  successText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    textAlign: 'center',
    lineHeight: 23,
  },
  emailBadge: {
    marginTop: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    maxWidth: '100%',
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.full,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  emailBadgeText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    flexShrink: 1,
  },
  helpContainer: {
    marginTop: theme.spacing[5],
    width: '100%',
    gap: theme.spacing[3],
  },
  helpText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
  privacyText: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.fontSize.xs,
    lineHeight: 18,
    textAlign: 'center',
  },
  backButton: {
    marginTop: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    alignSelf: 'stretch',
  },
  backButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  secondaryButton: {
    marginTop: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    alignSelf: 'stretch',
  },
  secondaryButtonText: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
