import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useEmailLogin } from '@/api/auth';
import { theme } from '@/theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { signInWithGoogle, signInWithApple, isLoading: oauthLoading } = useAuth();
  const emailLoginMutation = useEmailLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSkipOption, setShowSkipOption] = useState(false);

  const isLoading = oauthLoading || emailLoginMutation.isPending;
  const emailValid = EMAIL_REGEX.test(email);
  const canSubmitEmail = emailValid && password.length >= 8;

  const handleError = (message: string, err: unknown) => {
    setError(message);
    setShowSkipOption(true);
    console.error(err);
  };

  const handleEmailLogin = async () => {
    if (!canSubmitEmail) return;
    try {
      setError(null);
      setShowSkipOption(false);
      await emailLoginMutation.mutateAsync({ email, password });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; code?: string } } };
      const msg = e?.response?.data?.message;
      const code = e?.response?.data?.code;
      if (code === 'OAUTH_ONLY') {
        handleError(t('auth.sign_in_with_oauth'), err);
      } else {
        handleError(msg || t('auth.invalid_credentials'), err);
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      setShowSkipOption(false);
      await signInWithGoogle();
    } catch (err: unknown) {
      const message = (err as Error)?.message?.includes('expo-dev-client')
        ? 'Native OAuth requires Custom Dev Client. Please use web version or run: npx expo run:ios'
        : t('auth.google_failed');
      handleError(message, err);
    }
  };

  const handleAppleLogin = async () => {
    try {
      setError(null);
      setShowSkipOption(false);
      await signInWithApple();
    } catch (err: unknown) {
      const message = (err as Error)?.message?.includes('expo-dev-client')
        ? 'Native OAuth requires Custom Dev Client. Please use web version or run: npx expo run:ios'
        : t('auth.apple_failed');
      handleError(message, err);
    }
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
        <View style={styles.content}>
          <Text style={styles.title}>WonderTales</Text>
          <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.formSection}>
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
              autoCorrect={false}
            />

            <Text style={[styles.inputLabel, styles.inputLabelMargin]}>{t('auth.password')}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.password_placeholder')}
                placeholderTextColor={theme.colors.text.tertiary}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={theme.colors.text.tertiary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.forgotLinkText}>{t('auth.forgot_password')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.primaryButton, !canSubmitEmail && styles.buttonDisabled]}
              onPress={handleEmailLogin}
              disabled={!canSubmitEmail || isLoading}
            >
              {emailLoginMutation.isPending ? (
                <ActivityIndicator color={theme.colors.text.inverse} />
              ) : (
                <Text style={styles.primaryButtonText}>{t('auth.login')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.or')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.googleButton]}
              onPress={handleGoogleLogin}
              disabled={isLoading}
            >
              {oauthLoading ? (
                <ActivityIndicator color={theme.colors.text.inverse} />
              ) : (
                <Text style={styles.buttonText}>Sign in with Google</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.appleButton]}
              onPress={handleAppleLogin}
              disabled={isLoading}
            >
              {oauthLoading ? (
                <ActivityIndicator color={theme.colors.text.inverse} />
              ) : (
                <Text style={styles.buttonText}>Sign in with Apple</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.registerLinkText}>{t('auth.want_to_create_stories')}</Text>
          </TouchableOpacity>

          {Platform.OS === 'web' && (
            <Text style={styles.noteText}>Note: Web OAuth will open in the same window</Text>
          )}

          {showSkipOption && Platform.OS !== 'web' && (
            <Text style={styles.devNoteText}>
              Dev Tip: Test UI layout on web version, or build with expo-dev-client for native OAuth
            </Text>
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
  },
  content: {
    width: '100%',
    maxWidth: 400,
    padding: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize['6xl'],
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
    color: theme.colors.interactive.primary,
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
  formSection: {
    marginBottom: theme.spacing[6],
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
  forgotLink: {
    marginTop: theme.spacing[2],
    alignSelf: 'flex-end',
  },
  forgotLinkText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.interactive.primary,
  },
  button: {
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    marginTop: theme.spacing[4],
  },
  primaryButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing[6],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border.light,
  },
  dividerText: {
    marginHorizontal: theme.spacing[4],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  buttonContainer: {
    gap: theme.spacing[4],
  },
  googleButton: {
    backgroundColor: theme.colors.google,
  },
  appleButton: {
    backgroundColor: theme.colors.apple,
  },
  buttonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  registerLink: {
    marginTop: theme.spacing[8],
    alignSelf: 'center',
  },
  registerLinkText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.interactive.primary,
    textAlign: 'center',
  },
  noteText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.xs,
    textAlign: 'center',
    color: theme.colors.text.tertiary,
  },
  devNoteText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.xs,
    textAlign: 'center',
    color: theme.colors.interactive.primary,
    fontStyle: 'italic',
  },
});
