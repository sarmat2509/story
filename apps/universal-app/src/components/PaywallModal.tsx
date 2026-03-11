/**
 * M1: Reusable paywall modal when usage limit is exceeded.
 * Shown before creating story (stories limit) or when API returns 429.
 */

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

export interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  limitInfo?: { used: number; limit: number };
}

export function PaywallModal({
  visible,
  onClose,
  title,
  message,
  limitInfo,
}: PaywallModalProps) {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();

  const handleUpgrade = () => {
    onClose();
    navigation.navigate('Plans');
  };

  const displayTitle = title ?? t('paywall.stories_limit_title');
  const displayMessage = message ?? (limitInfo
    ? t('paywall.stories_limit_message', { used: limitInfo.used, limit: limitInfo.limit })
    : t('paywall.stories_limit_message_default'));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="lock-closed" size={48} color={theme.colors.interactive.primary} />
          </View>
          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.message}>{displayMessage}</Text>
          <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
            <Text style={styles.upgradeButtonText}>{t('paywall.upgrade_button')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  content: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: theme.spacing[4],
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
    textAlign: 'center',
  },
  message: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  upgradeButton: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  upgradeButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  cancelButton: {
    paddingVertical: theme.spacing[2],
  },
  cancelButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
});
