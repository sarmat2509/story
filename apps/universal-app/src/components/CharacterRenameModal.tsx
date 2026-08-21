import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRenameCharacter } from '@/api/characters';
import { AppButton } from '@/components/AppButton';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  character: { id: string; name: string } | null;
  onClose: () => void;
  presentation?: 'modal' | 'inline';
}

export function CharacterRenameModal({
  visible,
  character,
  onClose,
  presentation = 'modal',
}: Props) {
  const { t } = useTranslation();
  const renameCharacter = useRenameCharacter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(character?.name ?? '');
      setError(null);
    }
  }, [character?.id, character?.name, visible]);

  const submit = async () => {
    const normalizedName = name.trim();
    if (!character || !normalizedName || normalizedName === character.name.trim()) return;

    setError(null);
    try {
      await renameCharacter.mutateAsync({ id: character.id, name: normalizedName });
      onClose();
    } catch (requestError) {
      setError(getLocalizedApiError(t, requestError, 'character_form.save_failed'));
    }
  };

  const unchanged = !character || name.trim() === character.name.trim();

  const content = (
    <View style={styles.modal} testID="character-rename-modal">
      <View style={styles.header}>
        <Text style={styles.title}>{t('character_form.title_rename')}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={theme.colors.text.primary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>{t('character_form.name_label')}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={name}
        onChangeText={setName}
        placeholder={t('character_form.name_placeholder')}
        placeholderTextColor={theme.colors.text.disabled}
        maxLength={100}
        autoFocus
        testID="character-rename-name"
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.footer}>
        <AppButton
          label={t('character_form.cancel_button')}
          onPress={onClose}
          variant="secondary"
          style={styles.action}
        />
        <AppButton
          label={t('character_form.save_button')}
          onPress={submit}
          disabled={!name.trim() || unchanged || renameCharacter.isPending}
          loading={renameCharacter.isPending}
          style={styles.action}
          testID="character-rename-save"
        />
      </View>
    </View>
  );

  if (presentation === 'inline') {
    return visible ? <View style={[styles.overlay, styles.inlineOverlay]}>{content}</View> : null;
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>{content}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[4],
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  inlineOverlay: { flexGrow: 1, minHeight: 360, borderRadius: theme.borders.radius.xl },
  modal: {
    width: '100%',
    maxWidth: 460,
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius.xl,
    backgroundColor: theme.colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[5],
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  closeButton: { padding: theme.spacing[1] },
  label: {
    marginBottom: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
  },
  inputError: { borderColor: theme.colors.status.error },
  error: {
    marginTop: theme.spacing[2],
    color: theme.colors.status.error,
    fontSize: theme.typography.fontSize.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    marginTop: theme.spacing[6],
  },
  action: { flex: 1 },
});
