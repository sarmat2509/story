import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';

interface GenerationErrorModalProps {
  visible: boolean;
  message?: string | null;
  onClose: () => void;
  presentation?: 'modal' | 'inline';
}

export function GenerationErrorModal({
  visible,
  message,
  onClose,
  presentation = 'modal',
}: GenerationErrorModalProps) {
  const { t } = useTranslation();
  const displayMessage =
    message ||
    t('wizard.generation_error_message', {
      defaultValue:
        'Sorry, story generation is temporarily unavailable. Please try again a little later.',
    });

  const content = (
    <View style={styles.content}>
      <View style={styles.iconContainer}>
        <Ionicons name="sparkles-outline" size={40} color={theme.colors.interactive.primary} />
      </View>
      <Text style={styles.title}>
        {t('wizard.generation_error_title', {
          defaultValue: 'Sorry, we could not start the story',
        })}
      </Text>
      <Text style={styles.message}>{displayMessage}</Text>
      <AppButton
        label={t('common.got_it', { defaultValue: 'Got it' })}
        onPress={onClose}
        style={styles.action}
      />
    </View>
  );

  if (presentation === 'inline') {
    return visible ? <View style={[styles.overlay, styles.inlineOverlay]}>{content}</View> : null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>{content}</View>
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
  inlineOverlay: { flexGrow: 1, minHeight: 360, borderRadius: theme.borders.radius.xl },
  content: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: theme.borders.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${theme.colors.interactive.primary}18`,
    marginBottom: theme.spacing[4],
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  message: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing[5],
  },
  action: {
    alignSelf: 'stretch',
  },
});
