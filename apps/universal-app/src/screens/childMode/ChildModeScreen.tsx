import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLogout, useParentGate } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';

function getParentGateErrorMessage(t: (key: string) => string, error: unknown): string {
  const err = error as { response?: { status?: number; data?: { code?: string } } };
  const code = err.response?.data?.code;
  if (code === 'PARENT_GATE_PASSWORD_UNAVAILABLE') {
    return t('child_mode.parent_gate_unavailable');
  }
  if (err.response?.status === 401 || code === 'PARENT_GATE_FAILED') {
    return t('child_mode.parent_gate_wrong_password');
  }
  return t('child_mode.parent_gate_failed');
}

export default function ChildModeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const activeChild = useAuthStore((state) => state.activeChild);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionMode = useAuthStore((state) => state.sessionMode);
  const user = useAuthStore((state) => state.user);
  const parentGate = useParentGate();
  const logout = useLogout();
  const [gateVisible, setGateVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const childName = activeChild?.name || t('child_mode.child_fallback_name');
  const canSubmit = password.trim().length > 0 && !parentGate.isPending;

  useEffect(() => {
    if (sessionMode === 'child') return;
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          isAuthenticated
            ? { name: 'Main', state: { routes: [{ name: 'Children' }], index: 0 } }
            : { name: 'Main', state: { routes: [{ name: 'Welcome' }], index: 0 } },
        ],
      })
    );
  }, [isAuthenticated, navigation, sessionMode]);

  const handleOpenGate = () => {
    setPassword('');
    setErrorText(null);
    setGateVisible(true);
  };

  const handleParentGate = async () => {
    if (!canSubmit) return;
    setErrorText(null);
    try {
      await parentGate.mutateAsync({ password });
      setGateVisible(false);
      setPassword('');
    } catch (error) {
      setErrorText(getParentGateErrorMessage(t, error));
    }
  };

  const handleLogout = () => {
    logout.mutate();
  };

  return (
    <View style={styles.container}>
      <View style={styles.shell}>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={34} color={theme.colors.interactive.primary} />
        </View>
        <Text style={styles.title}>{t('child_mode.title')}</Text>
        <Text style={styles.childName} numberOfLines={2}>{childName}</Text>
        <Text style={styles.subtitle}>{t('child_mode.subtitle')}</Text>

        <View style={styles.actionStack}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleOpenGate}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-open-outline" size={20} color={theme.colors.text.inverse} />
            <Text style={styles.primaryButtonText}>{t('child_mode.return_to_parent')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleLogout}
            activeOpacity={0.8}
            disabled={logout.isPending}
          >
            {logout.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.text.primary} />
            ) : (
              <Ionicons name="log-out-outline" size={20} color={theme.colors.text.primary} />
            )}
            <Text style={styles.secondaryButtonText}>{t('child_mode.sign_out')}</Text>
          </TouchableOpacity>
        </View>

        {user?.email ? (
          <Text style={styles.accountText} numberOfLines={1}>
            {t('child_mode.signed_in_as')} {user.email}
          </Text>
        ) : null}
      </View>

      <Modal
        visible={gateVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGateVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGateVisible(false)} />
          <View style={styles.dialog}>
            <View style={styles.dialogIcon}>
              <Ionicons name="key-outline" size={34} color={theme.colors.interactive.primary} />
            </View>
            <Text style={styles.dialogTitle}>{t('child_mode.parent_gate_title')}</Text>
            <Text style={styles.dialogSubtitle}>{t('child_mode.parent_gate_subtitle')}</Text>

            <Text style={styles.inputLabel}>{t('auth.password')}</Text>
            <TextInput
              nativeID="parent-gate-password"
              style={styles.input}
              value={password}
              onChangeText={(next) => {
                setPassword(next);
                if (errorText) setErrorText(null);
              }}
              placeholder={t('child_mode.parent_gate_password_placeholder')}
              placeholderTextColor={theme.colors.text.tertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleParentGate}
            />

            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogCancelButton]}
                onPress={() => setGateVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogConfirmButton, !canSubmit && styles.buttonDisabled]}
                onPress={handleParentGate}
                activeOpacity={0.8}
                disabled={!canSubmit}
              >
                {parentGate.isPending ? (
                  <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                ) : (
                  <Text style={styles.dialogConfirmText}>{t('child_mode.parent_gate_unlock')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background.secondary,
  },
  shell: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    padding: theme.spacing[8],
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  badge: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.tertiary,
    marginBottom: theme.spacing[5],
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  childName: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: theme.spacing[3],
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  actionStack: {
    width: '100%',
    gap: theme.spacing[3],
    marginTop: theme.spacing[8],
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
    paddingHorizontal: theme.spacing[5],
  },
  primaryButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  secondaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    paddingHorizontal: theme.spacing[5],
  },
  secondaryButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  accountText: {
    marginTop: theme.spacing[5],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.primary,
  },
  dialogIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.tertiary,
    marginBottom: theme.spacing[4],
  },
  dialogTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  dialogSubtitle: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  inputLabel: {
    marginTop: theme.spacing[5],
    marginBottom: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  input: {
    minHeight: 48,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
  },
  errorText: {
    marginTop: theme.spacing[3],
    color: theme.colors.status.error,
    fontSize: theme.typography.fontSize.sm,
    textAlign: 'center',
  },
  dialogActions: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    marginTop: theme.spacing[6],
  },
  dialogButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[4],
  },
  dialogCancelButton: {
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
  },
  dialogConfirmButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  dialogCancelText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  dialogConfirmText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
