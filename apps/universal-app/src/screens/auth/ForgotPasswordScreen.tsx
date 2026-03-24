import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useForgotPassword } from '@/api/auth';
import { theme } from '@/theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const forgotPasswordMutation = useForgotPassword();

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_REGEX.test(email);
  const canSubmit = emailValid && !forgotPasswordMutation.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setError(null);
      await forgotPasswordMutation.mutateAsync(email);
      setSubmitted(true);
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{t('auth.forgot_password')}</Text>
        <Text style={styles.subtitle}>
          {t('auth.forgot_password_subtitle')}
        </Text>

        {submitted ? (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>{t('auth.reset_link_sent')}</Text>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.navigate('Welcome')}
            >
              <Text style={styles.backButtonText}>{t('auth.back_to_login')}</Text>
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
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.email_placeholder')}
              placeholderTextColor={theme.colors.text.tertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    padding: theme.spacing[6],
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
  successContainer: {
    alignItems: 'center',
  },
  successText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  backButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
  },
  backButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
