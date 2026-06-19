import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useRegister } from '@/api/auth';
import { AppButton } from '@/components/AppButton';
import { getPasswordStrength, meetsMinRequirements } from '@/utils/passwordStrength';
import { getLegalUrl } from '@/config/constants';
import { theme } from '@/theme';
import { resetToMainRoute } from '@/navigation/navigationRef';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import { assignWebLocation } from '@/utils/webRuntime';
import { replaceWithStoredWebAuthRedirect } from '@/utils/authRedirect';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const registerMutation = useRegister();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isAdultGuardian, setIsAdultGuardian] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_REGEX.test(email);
  const strength = getPasswordStrength(password);
  const canSubmit =
    emailValid &&
    meetsMinRequirements(password) &&
    termsAccepted &&
    privacyAccepted &&
    isAdultGuardian &&
    !registerMutation.isPending;

  const handleRegister = async () => {
    if (!canSubmit) return;
    try {
      setError(null);
      await registerMutation.mutateAsync({
        email,
        password,
        termsAccepted,
        privacyAccepted,
        isAdultGuardian,
      });
      if (replaceWithStoredWebAuthRedirect()) {
        return;
      }
      if (!resetToMainRoute({ name: 'Dashboard' })) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Dashboard' }],
        });
      }
    } catch (err: unknown) {
      setError(getLocalizedApiError(t, err, 'common.error'));
    }
  };

  const strengthLabel =
    strength === 'weak'
      ? t('auth.password_weak')
      : strength === 'medium'
        ? t('auth.password_medium')
        : t('auth.password_strong');

  const strengthColor =
    strength === 'weak'
      ? theme.colors.status.error
      : strength === 'medium'
        ? theme.colors.warning[500]
        : theme.colors.status.success;

  const renderCheckbox = (
    checked: boolean,
    onToggle: () => void,
    label: string,
    linkLabel?: string,
    linkUrl?: string
  ) => (
    <View style={styles.consentRow}>
      <TouchableOpacity
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        activeOpacity={0.75}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Ionicons name="checkmark" size={16} color={theme.colors.text.inverse} />}
        </View>
      </TouchableOpacity>
      <View style={styles.consentCopy}>
        <Text style={styles.consentText}>{label}</Text>
        {linkLabel && linkUrl ? (
          <Text
            style={styles.consentLink}
            onPress={() => {
              if (assignWebLocation(linkUrl)) {
                return;
              }
              Linking.openURL(linkUrl);
            }}
          >
            {linkLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );

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
        <View style={styles.content}>
          <Text style={styles.title}>{t('auth.register')}</Text>
          <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.inputLabel}>{t('auth.email')}</Text>
          <TextInput
            nativeID="register-email"
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

          <Text style={[styles.inputLabel, styles.inputLabelMargin]}>{t('auth.password')}</Text>
          <View style={styles.passwordRow}>
            <TextInput
              nativeID="register-password"
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.password_placeholder')}
              placeholderTextColor={theme.colors.text.tertiary}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={theme.colors.text.tertiary}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.strengthRow}>
            <View
              style={[
                styles.strengthBar,
                styles.strengthBarFill,
                {
                  width: `${strength === 'weak' ? 33 : strength === 'medium' ? 66 : 100}%`,
                  backgroundColor: strengthColor,
                },
              ]}
            />
          </View>
          <Text style={[styles.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text>
          <Text style={styles.requirementsText}>{t('auth.password_requirements')}</Text>

          <View style={styles.consentSection}>
            {renderCheckbox(
              isAdultGuardian,
              () => setIsAdultGuardian((value) => !value),
              t('auth.consent_adult_guardian')
            )}
            {renderCheckbox(
              termsAccepted,
              () => setTermsAccepted((value) => !value),
              t('auth.consent_terms'),
              t('auth.terms_link'),
              getLegalUrl('terms', i18n.language)
            )}
            {renderCheckbox(
              privacyAccepted,
              () => setPrivacyAccepted((value) => !value),
              t('auth.consent_privacy'),
              t('auth.privacy_link'),
              getLegalUrl('privacy', i18n.language)
            )}
          </View>

          <AppButton
            label={t('auth.register')}
            onPress={handleRegister}
            disabled={!canSubmit}
            loading={registerMutation.isPending}
            style={styles.formAction}
          />

          <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('Welcome')}>
            <Text style={styles.loginLinkText}>{t('auth.already_have_account')}</Text>
          </TouchableOpacity>
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
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[6],
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
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
  inputLabelMargin: {
    marginTop: theme.spacing[4],
  },
  input: {
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: theme.spacing[3],
    padding: theme.spacing[2],
  },
  strengthRow: {
    height: 4,
    backgroundColor: theme.colors.border.light,
    borderRadius: 2,
    marginTop: theme.spacing[2],
    overflow: 'hidden',
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
  strengthBarFill: {},
  strengthLabel: {
    fontSize: theme.typography.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  requirementsText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
  },
  consentSection: {
    gap: theme.spacing[3],
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[5],
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.borders.radius.sm,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  consentText: {
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  consentCopy: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[1],
  },
  consentLink: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  formAction: {
    marginTop: theme.spacing[2],
  },
  loginLink: {
    marginTop: theme.spacing[6],
    alignSelf: 'center',
  },
  loginLinkText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.interactive.primary,
  },
});
