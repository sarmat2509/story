import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { MainDrawerParamList } from '@/types/navigation';
import { useResetPassword } from '@/api/auth';
import { getPasswordStrength, meetsMinRequirements } from '@/utils/passwordStrength';
import { theme } from '@/theme';
import { getLocalizedApiError } from '@/utils/localizedApiError';

type ResetPasswordRouteProp = RouteProp<MainDrawerParamList, 'ResetPassword'>;

function useResetToken(): string | null {
  const route = useRoute<ResetPasswordRouteProp>();
  const [token, setToken] = useState<string | null>(null);

  const extractTokenFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get('token');
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const tokenFromRoute = route.params?.token;
    if (tokenFromRoute) {
      setToken(tokenFromRoute);
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('token');
      if (t) setToken(t);
      return;
    } else {
      Linking.getInitialURL().then((url) => {
        if (url) {
          const t = extractTokenFromUrl(url);
          if (t) setToken(t);
        }
      });

      const subscription = Linking.addEventListener('url', ({ url }) => {
        const t = extractTokenFromUrl(url);
        if (t) setToken(t);
      });
      return () => subscription.remove();
    }
  }, [route.params?.token]);

  return token;
}

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const resetPasswordMutation = useResetPassword();
  const token = useResetToken();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(password);
  const canSubmit =
    token &&
    meetsMinRequirements(password) &&
    !resetPasswordMutation.isPending;

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

  const handleSubmit = async () => {
    if (!canSubmit || !token) return;
    try {
      setError(null);
      await resetPasswordMutation.mutateAsync({ token, password });
      setSuccess(true);
    } catch (err: unknown) {
      setError(getLocalizedApiError(t, err, 'common.error'));
    }
  };

  if (!token && !success) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('auth.reset_password')}</Text>
          <Text style={styles.subtitle}>{t('auth.invalid_or_expired_token')}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => (navigation as any).navigate('ForgotPassword')}
          >
            <Text style={styles.buttonText}>{t('auth.request_new_link')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.successTitle}>{t('auth.reset_success')}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => (navigation as any).navigate('Welcome')}
          >
            <Text style={styles.buttonText}>{t('auth.login')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{t('auth.reset_password')}</Text>
        <Text style={styles.subtitle}>{t('auth.reset_password_subtitle')}</Text>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.inputLabel}>{t('auth.password')}</Text>
        <View style={styles.passwordRow}>
          <TextInput
            nativeID="reset-password"
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
              {
                width: `${strength === 'weak' ? 33 : strength === 'medium' ? 66 : 100}%`,
                backgroundColor: strengthColor,
              },
            ]}
          />
        </View>
        <Text style={[styles.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text>

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {resetPasswordMutation.isPending ? (
            <ActivityIndicator color={theme.colors.text.inverse} />
          ) : (
            <Text style={styles.buttonText}>{t('auth.reset_password')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backLink}
          onPress={() => (navigation as any).navigate('Welcome')}
        >
          <Text style={styles.backLinkText}>{t('auth.back_to_login')}</Text>
        </TouchableOpacity>
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
  successTitle: {
    fontSize: theme.typography.fontSize.lg,
    textAlign: 'center',
    color: theme.colors.text.primary,
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
  strengthLabel: {
    fontSize: theme.typography.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  button: {
    backgroundColor: theme.colors.interactive.primary,
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    marginTop: theme.spacing[8],
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
});
