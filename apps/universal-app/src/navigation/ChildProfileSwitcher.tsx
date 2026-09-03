import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useChildModeSwitcherChildren, useChildren, useEnterChildMode } from '@/api/children';
import { useParentGate, useRequestChildModeExitRecovery } from '@/api/auth';
import { resetToMainRoute } from '@/navigation/navigationRef';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';

type ChildSwitcherTarget = { type: 'parent' } | { type: 'child'; childId: string };

type AvatarSource = {
  turnaroundSheet?: { url?: string; frontUrl?: string; frontThumbnailUrl?: string };
  turnaroundsheet?: { url?: string; frontUrl?: string; frontThumbnailUrl?: string };
  referencePhotos?: Array<{ url?: string }>;
  referencephotos?: Array<{ url?: string }>;
};

type TriggerRenderArgs = {
  avatarUrl: string | null;
  fallbackInitial: string | null;
  open: () => void;
};

interface ChildProfileSwitcherProps {
  autoLoad?: boolean;
  fallbackAvatarUrl?: string | null;
  menuStyle?: StyleProp<ViewStyle>;
  renderTrigger?: (args: TriggerRenderArgs) => React.ReactNode;
}

function getChildAvatarUrl(child?: AvatarSource | null): string | null {
  const rawUrl =
    child?.turnaroundSheet?.frontThumbnailUrl ??
    child?.turnaroundSheet?.frontUrl ??
    child?.turnaroundSheet?.url ??
    child?.turnaroundsheet?.frontThumbnailUrl ??
    child?.turnaroundsheet?.frontUrl ??
    child?.turnaroundsheet?.url ??
    child?.referencePhotos?.[0]?.url ??
    child?.referencephotos?.[0]?.url ??
    null;
  return rawUrl ? (formatAssetUrl(rawUrl) ?? rawUrl) : null;
}

function escapeCssUrl(url: string): string {
  return url.replace(/["\\]/g, '\\$&');
}

export function ChildAvatarImage({
  uri,
  style,
}: {
  uri: string;
  style: StyleProp<ImageStyle | ViewStyle>;
}) {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          style as StyleProp<ViewStyle>,
          {
            backgroundImage: `url("${escapeCssUrl(uri)}")`,
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
          } as any,
        ]}
      />
    );
  }

  return <Image source={{ uri }} style={style as StyleProp<ImageStyle>} resizeMode="cover" />;
}

export function ChildProfileSwitcher({
  autoLoad = false,
  fallbackAvatarUrl = null,
  menuStyle,
  renderTrigger,
}: ChildProfileSwitcherProps) {
  const { t } = useTranslation();
  const activeChild = useAuthStore((state) => state.activeChild);
  const sessionMode = useAuthStore((state) => state.sessionMode);
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [target, setTarget] = useState<ChildSwitcherTarget | null>(null);
  const [error, setError] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);
  const isChildSession = sessionMode === 'child';
  const shouldLoadSwitcherChildren = autoLoad || visible || Boolean(activeChild);
  const { data, isLoading } = useChildModeSwitcherChildren(shouldLoadSwitcherChildren);
  const { data: allChildrenData } = useChildren(!isChildSession && shouldLoadSwitcherChildren);
  const parentGate = useParentGate();
  const childModeRecovery = useRequestChildModeExitRecovery();
  const enterChildMode = useEnterChildMode();
  const children = data?.children ?? (activeChild ? [activeChild] : []);
  const freshActiveChild = activeChild
    ? (children.find((child) => child.id === activeChild.id) ?? activeChild)
    : null;
  const displayedChild = freshActiveChild ?? allChildrenData?.children[0] ?? children[0] ?? null;
  const avatarUrl = getChildAvatarUrl(displayedChild);
  const fallbackInitial = displayedChild?.name.trim()
    ? [...displayedChild.name.trim()][0]?.toLocaleUpperCase() ?? null
    : null;
  const triggerAvatarUrl = avatarUrl ?? (displayedChild ? null : fallbackAvatarUrl);
  const isSubmitting = parentGate.isPending || enterChildMode.isPending;
  const hasSwitcherProfiles = children.length > 0;

  const closeMenu = () => {
    if (isSubmitting) return;
    setVisible(false);
    setTarget(null);
    setPassword('');
    setError('');
    setRecoverySent(false);
  };

  const requestTarget = async (nextTarget: ChildSwitcherTarget) => {
    if (!isChildSession) {
      if (nextTarget.type === 'parent') {
        closeMenu();
        resetToMainRoute({ name: 'Profile' });
        return;
      }

      try {
        setError('');
        await enterChildMode.mutateAsync(nextTarget.childId);
        closeMenu();
      } catch (_err) {
        setError(
          t('children_screen.child_mode_start_failed', {
            defaultValue: 'Could not start Child Mode. Try again in a moment.',
          })
        );
      }
      return;
    }

    setTarget(nextTarget);
    setPassword('');
    setError('');
    setRecoverySent(false);
  };

  const submitParentGate = async () => {
    if (!target || !password.trim() || isSubmitting) return;
    try {
      setError('');
      await parentGate.mutateAsync({ password: password.trim() });

      if (target.type === 'child') {
        await enterChildMode.mutateAsync(target.childId);
      } else {
        resetToMainRoute({ name: 'Profile' });
      }

      closeMenu();
    } catch (_err) {
      setError(
        t('child_mode.parent_gate_wrong_password', {
          defaultValue: 'Password did not work. Try again.',
        })
      );
    }
  };

  const requestRecoveryEmail = async () => {
    if (childModeRecovery.isPending) return;
    try {
      setError('');
      setRecoverySent(false);
      await childModeRecovery.mutateAsync();
      setRecoverySent(true);
    } catch (_err) {
      setError(
        t('child_mode.recovery_request_failed', {
          defaultValue: 'Could not send the recovery link. Try again in a moment.',
        })
      );
    }
  };

  const open = () => setVisible(true);

  if (!hasSwitcherProfiles && !activeChild && !displayedChild) {
    return null;
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ avatarUrl: triggerAvatarUrl, fallbackInitial, open })
      ) : (
        <TouchableOpacity
          style={styles.avatarButton}
          activeOpacity={0.75}
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={t('child_mode.profile_switcher', {
            defaultValue: 'Switch profile',
          })}
          testID="child-profile-switcher-trigger"
        >
          {triggerAvatarUrl ? (
            <ChildAvatarImage uri={triggerAvatarUrl} style={styles.avatarImage} />
          ) : fallbackInitial ? (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{fallbackInitial}</Text>
            </View>
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={18} color={theme.colors.interactive.primary} />
            </View>
          )}
        </TouchableOpacity>
      )}

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <View style={[styles.menu, menuStyle]} testID="child-profile-switcher-menu">
            <Text style={styles.menuTitle}>
              {target
                ? t('child_mode.parent_gate_title', { defaultValue: 'Parent check' })
                : t('child_mode.switcher_title', { defaultValue: 'Profiles' })}
            </Text>

            {target ? (
              <View style={styles.gateContent}>
                <Text style={styles.gateText}>
                  {target.type === 'parent'
                    ? t('child_mode.parent_gate_parent_profile', {
                        defaultValue: 'Enter the parent password to open the parent profile.',
                      })
                    : t('child_mode.parent_gate_child_profile', {
                        defaultValue: 'Enter the parent password to switch child profiles.',
                      })}
                </Text>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t('child_mode.parent_gate_password_placeholder', {
                    defaultValue: 'Password',
                  })}
                  placeholderTextColor={theme.colors.text.tertiary}
                  secureTextEntry
                  autoFocus
                  onSubmitEditing={submitParentGate}
                  testID="parent-gate-password"
                />
                <Pressable
                  style={({ pressed }) => [styles.recoveryLink, pressed && styles.buttonPressed]}
                  disabled={childModeRecovery.isPending}
                  onPress={requestRecoveryEmail}
                  testID="parent-gate-recovery"
                >
                  <Text style={styles.recoveryLinkText}>
                    {childModeRecovery.isPending
                      ? t('child_mode.recovery_request_sending', {
                          defaultValue: 'Sending recovery link...',
                        })
                      : t('child_mode.recovery_request_link', {
                          defaultValue: 'Forgot the exit password?',
                        })}
                  </Text>
                </Pressable>
                {recoverySent ? (
                  <Text style={styles.recoverySuccessText} testID="parent-gate-recovery-sent">
                    {t('child_mode.recovery_request_sent', {
                      defaultValue:
                        'A recovery link was sent to the parent email. It works for 30 minutes.',
                    })}
                  </Text>
                ) : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <View style={styles.gateActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.buttonPressed,
                    ]}
                    disabled={isSubmitting}
                    onPress={() => {
                      setTarget(null);
                      setPassword('');
                      setError('');
                      setRecoverySent(false);
                    }}
                    testID="parent-gate-cancel"
                  >
                    <Text style={styles.secondaryButtonText}>
                      {t('common.cancel', { defaultValue: 'Cancel' })}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (!password.trim() || isSubmitting) && styles.buttonDisabled,
                      pressed && password.trim() && styles.buttonPressed,
                    ]}
                    disabled={!password.trim() || isSubmitting}
                    onPress={submitParentGate}
                    testID="parent-gate-submit"
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {t('child_mode.parent_gate_unlock', { defaultValue: 'Continue' })}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                {isLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                  </View>
                ) : (
                  children.map((child) => {
                    const isActive = child.id === activeChild?.id;
                    const childAvatarUrl = getChildAvatarUrl(child);
                    return (
                      <Pressable
                        key={child.id}
                        style={({ pressed }) => [
                          styles.menuItem,
                          isActive && styles.menuItemActive,
                          pressed && !isActive && styles.menuItemPressed,
                        ]}
                        disabled={isActive}
                        onPress={() => {
                          void requestTarget({ type: 'child', childId: child.id });
                        }}
                        testID={`child-profile-switcher-child-${child.id}`}
                      >
                        {childAvatarUrl ? (
                          <ChildAvatarImage uri={childAvatarUrl} style={styles.itemAvatar} />
                        ) : (
                          <View style={styles.itemAvatarFallback}>
                            <Ionicons name="person" size={15} color={theme.colors.text.secondary} />
                          </View>
                        )}
                        <View style={styles.itemCopy}>
                          <Text style={styles.itemTitle} numberOfLines={1}>
                            {child.name}
                          </Text>
                          {isActive ? (
                            <Text style={styles.itemSubtitle}>
                              {t('child_mode.current_child', { defaultValue: 'Current profile' })}
                            </Text>
                          ) : null}
                        </View>
                        {isActive ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={19}
                            color={theme.colors.interactive.primary}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })
                )}

                <View style={styles.separator} />
                <Pressable
                  style={({ pressed }) => [
                    styles.menuItem,
                    !isChildSession && styles.menuItemActive,
                    pressed && styles.menuItemPressed,
                  ]}
                  onPress={() => {
                    void requestTarget({ type: 'parent' });
                  }}
                  testID="child-profile-switcher-parent"
                >
                  <View style={styles.itemAvatarFallback}>
                    <Ionicons
                      name="shield-checkmark"
                      size={16}
                      color={theme.colors.interactive.primary}
                    />
                  </View>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemTitle}>
                      {t('child_mode.parent_profile', { defaultValue: 'Parent profile' })}
                    </Text>
                    <Text style={styles.itemSubtitle}>
                      {isChildSession
                        ? t('child_mode.password_required', { defaultValue: 'Password required' })
                        : t('child_mode.current_profile', { defaultValue: 'Current profile' })}
                    </Text>
                  </View>
                  {!isChildSession ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={19}
                      color={theme.colors.interactive.primary}
                    />
                  ) : null}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatarButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing[3],
    borderRadius: 22,
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  avatarInitial: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 34, 0.18)',
  },
  menu: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 56 : 78,
    left: theme.spacing[3],
    width: 300,
    maxWidth: '92%',
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
    ...Platform.select({
      web: {
        boxShadow: '0 18px 42px rgba(31, 26, 64, 0.18)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
      },
    }),
  },
  menuTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  menuItem: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  menuItemActive: {
    backgroundColor: theme.colors.interactive.secondary,
  },
  menuItemPressed: {
    backgroundColor: theme.colors.background.secondary,
  },
  itemAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.background.secondary,
  },
  itemAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  itemSubtitle: {
    marginTop: 2,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.secondary,
  },
  separator: {
    height: theme.borders.width.thin,
    backgroundColor: theme.colors.border.light,
    marginVertical: theme.spacing[1],
  },
  loadingRow: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateContent: {
    gap: theme.spacing[3],
  },
  gateText: {
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.text.secondary,
    paddingHorizontal: theme.spacing[2],
  },
  passwordInput: {
    minHeight: 46,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[3],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.primary,
  },
  recoveryLink: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  recoveryLinkText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
  },
  recoverySuccessText: {
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 19,
    color: theme.colors.status.success,
    paddingHorizontal: theme.spacing[2],
  },
  errorText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.status.error,
  },
  gateActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
  },
  secondaryButton: {
    minHeight: 42,
    justifyContent: 'center',
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
  },
  secondaryButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
  },
  primaryButton: {
    minHeight: 42,
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.interactive.primary,
  },
  primaryButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
