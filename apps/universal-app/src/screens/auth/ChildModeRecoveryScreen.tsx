import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { MainDrawerParamList } from '@/types/navigation';
import {
  clearChildModeRecoveryHandoff,
  getChildModeRecoveryHandoff,
  useCompleteChildModeExitRecovery,
  useUpdateChildModeExitPasscode,
} from '@/api/auth';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import { getWebSearch } from '@/utils/webRuntime';

type ChildModeRecoveryRouteProp = RouteProp<MainDrawerParamList, 'ChildModeRecovery'>;

function useRecoveryToken(): { token: string | null; isResolving: boolean } {
  const route = useRoute<ChildModeRecoveryRouteProp>();

  const extractTokenFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get('token');
    } catch {
      return null;
    }
  };

  const getInitialToken = () => {
    if (route.params?.token) return route.params.token;
    if (Platform.OS !== 'web') return null;
    return new URLSearchParams(getWebSearch() ?? '').get('token');
  };

  const [token, setToken] = useState<string | null>(getInitialToken);
  const [isResolving, setIsResolving] = useState(() => Platform.OS !== 'web' && !token);

  useEffect(() => {
    const tokenFromRoute = route.params?.token;
    if (tokenFromRoute) {
      setToken(tokenFromRoute);
      setIsResolving(false);
      return;
    }

    if (Platform.OS === 'web') {
      const params = new URLSearchParams(getWebSearch() ?? '');
      const tokenFromSearch = params.get('token');
      if (tokenFromSearch) setToken(tokenFromSearch);
      setIsResolving(false);
      return;
    }

    Linking.getInitialURL().then((url) => {
      if (!url) {
        setIsResolving(false);
        return;
      }
      const tokenFromUrl = extractTokenFromUrl(url);
      if (tokenFromUrl) setToken(tokenFromUrl);
      setIsResolving(false);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const tokenFromUrl = extractTokenFromUrl(url);
      if (tokenFromUrl) setToken(tokenFromUrl);
    });

    return () => subscription.remove();
  }, [route.params?.token]);

  return { token, isResolving };
}

export default function ChildModeRecoveryScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { token, isResolving: isResolvingToken } = useRecoveryToken();
  const recovery = useCompleteChildModeExitRecovery();
  const updateExitPasscode = useUpdateChildModeExitPasscode();
  const recoveryHandoff = token ? getChildModeRecoveryHandoff(token) : null;
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(() => Boolean(recoveryHandoff));
  const [passcodeResetCompleted, setPasscodeResetCompleted] = useState(false);
  const [passcodeResetToken, setPasscodeResetToken] = useState<string | null>(
    () => recoveryHandoff?.childModeExitPasscodeResetToken ?? null
  );
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [passcodeResetError, setPasscodeResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const handoff = getChildModeRecoveryHandoff(token);
    if (!handoff) return;
    setPasscodeResetToken(handoff.childModeExitPasscodeResetToken);
    setCompleted(true);
  }, [token]);

  const handleContinue = () => {
    if (!token || recovery.isPending) return;

    setError(null);
    recovery.mutate(token, {
      onSuccess: (data) => {
        setPasscodeResetToken(data.childModeExitPasscodeResetToken);
        setCompleted(true);
      },
      onError: (err) =>
        setError(getLocalizedApiError(t, err, 'child_mode.recovery_complete_error')),
    });
  };

  const trimmedNewPasscode = newPasscode.trim();
  const canResetPasscode =
    Boolean(passcodeResetToken) &&
    trimmedNewPasscode.length >= 4 &&
    trimmedNewPasscode === confirmPasscode.trim() &&
    !updateExitPasscode.isPending;

  const handleResetPasscode = async () => {
    if (!passcodeResetToken) return;
    if (trimmedNewPasscode.length < 4) {
      setPasscodeResetError(t('profile.child_mode_exit_passcode_too_short'));
      return;
    }
    if (trimmedNewPasscode !== confirmPasscode.trim()) {
      setPasscodeResetError(t('profile.child_mode_exit_passcode_mismatch'));
      return;
    }

    try {
      setPasscodeResetError(null);
      await updateExitPasscode.mutateAsync({
        recoveryToken: passcodeResetToken,
        newPasscode: trimmedNewPasscode,
      });
      if (token) clearChildModeRecoveryHandoff(token);
      setPasscodeResetToken(null);
      setNewPasscode('');
      setConfirmPasscode('');
      setPasscodeResetCompleted(true);
    } catch (err) {
      setPasscodeResetError(getLocalizedApiError(t, err, 'profile.child_mode_exit_passcode_error'));
    }
  };

  const title = passcodeResetCompleted
    ? t('profile.child_mode_exit_passcode_success_title')
    : completed
      ? t('child_mode.recovery_complete_success_title', {
          defaultValue: 'Parent area unlocked',
        })
      : error || (!token && !isResolvingToken)
        ? t('child_mode.recovery_complete_error_title', {
            defaultValue: 'Recovery link did not work',
          })
        : t('child_mode.recovery_complete_title', {
            defaultValue: 'Opening parent area',
          });

  const body = passcodeResetCompleted
    ? t('profile.child_mode_exit_passcode_success_message')
    : completed
      ? t('child_mode.recovery_complete_success_body', {
          defaultValue: 'Parent access is restored. Choose a new Child Mode exit password below.',
        })
      : error || (!token && !isResolvingToken)
        ? error ||
          t('child_mode.recovery_complete_missing_token', {
            defaultValue: 'This recovery link is missing its token.',
          })
        : t('child_mode.recovery_complete_body', {
            defaultValue: 'Checking the secure link from the parent email.',
          });

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {recovery.isPending ? (
          <ActivityIndicator
            size="large"
            color={theme.colors.interactive.primary}
            style={styles.loader}
          />
        ) : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {token && !completed && !error ? (
          <AppButton
            label={t('common.next')}
            onPress={handleContinue}
            loading={recovery.isPending}
            style={styles.action}
            testID="child-mode-recovery-continue"
          />
        ) : null}
        {completed && passcodeResetToken && !passcodeResetCompleted ? (
          <View style={styles.resetForm} testID="child-mode-recovery-reset-form">
            <Text style={styles.label}>{t('profile.child_mode_exit_passcode_new')}</Text>
            <TextInput
              style={styles.input}
              value={newPasscode}
              onChangeText={setNewPasscode}
              placeholder={t('profile.child_mode_exit_passcode_placeholder')}
              placeholderTextColor={theme.colors.text.tertiary}
              secureTextEntry
              maxLength={128}
              testID="child-mode-recovery-new-passcode"
            />
            <Text style={[styles.label, styles.confirmLabel]}>
              {t('profile.child_mode_exit_passcode_confirm')}
            </Text>
            <TextInput
              style={styles.input}
              value={confirmPasscode}
              onChangeText={setConfirmPasscode}
              placeholder={t('profile.child_mode_exit_passcode_placeholder')}
              placeholderTextColor={theme.colors.text.tertiary}
              secureTextEntry
              maxLength={128}
              onSubmitEditing={handleResetPasscode}
              testID="child-mode-recovery-confirm-passcode"
            />
            {passcodeResetError ? (
              <Text style={styles.errorText} testID="child-mode-recovery-reset-error">
                {passcodeResetError}
              </Text>
            ) : null}
            <AppButton
              label={t('auth.reset_password')}
              onPress={handleResetPasscode}
              disabled={!canResetPasscode}
              loading={updateExitPasscode.isPending}
              style={styles.action}
              testID="child-mode-recovery-reset-submit"
            />
          </View>
        ) : null}
        {completed ? (
          <AppButton
            label={t('child_mode.recovery_complete_go_profile', {
              defaultValue: 'Open profile settings',
            })}
            onPress={() => (navigation as any).navigate('Profile')}
            variant={passcodeResetCompleted ? 'primary' : 'secondary'}
            style={styles.action}
          />
        ) : null}
        {error || (!token && !isResolvingToken) ? (
          <AppButton
            label={t('auth.back_to_login')}
            onPress={() => (navigation as any).navigate('Welcome')}
            variant="secondary"
            style={styles.action}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[5],
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'center',
    borderRadius: theme.borders.radius.xl,
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing[8],
    ...Platform.select({
      web: {
        boxShadow: '0 24px 60px rgba(31, 26, 64, 0.16)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
      },
    }),
  },
  loader: {
    marginBottom: theme.spacing[4],
  },
  title: {
    textAlign: 'center',
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  body: {
    textAlign: 'center',
    fontSize: theme.typography.fontSize.base,
    lineHeight: 24,
    color: theme.colors.text.secondary,
  },
  resetForm: {
    width: '100%',
    marginTop: theme.spacing[5],
  },
  label: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  confirmLabel: {
    marginTop: theme.spacing[4],
  },
  input: {
    width: '100%',
    minHeight: 48,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.primary,
    color: theme.colors.text.primary,
    paddingHorizontal: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
  },
  errorText: {
    marginTop: theme.spacing[3],
    color: theme.colors.status.error,
    fontSize: theme.typography.fontSize.sm,
  },
  action: {
    marginTop: theme.spacing[5],
    alignSelf: 'stretch',
  },
});
