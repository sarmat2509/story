import React, { useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { useTranslation } from 'react-i18next';
import { toastService } from '@/services/toastService';

interface PublishShareDialogProps {
  visible: boolean;
  onPublishAndShare: () => void;
  onCancel: () => void;
  shareUrl?: string | null;
  isLoading?: boolean;
}

export function PublishShareDialog({
  visible,
  onPublishAndShare,
  onCancel,
  shareUrl,
  isLoading = false,
}: PublishShareDialogProps) {
  const { t } = useTranslation();
  const isPostPublish = !!shareUrl;

  const displayUrl = useMemo(() => {
    if (!shareUrl) return '';
    if (Platform.OS === 'web' && typeof location !== 'undefined') {
      try {
        const u = new URL(shareUrl);
        return `${location.origin}${u.pathname}${u.search}`;
      } catch {
        return shareUrl;
      }
    }
    return shareUrl;
  }, [shareUrl]);

  const handleCopy = useCallback(async () => {
    if (!displayUrl) return;
    try {
      if (Platform.OS === 'web') {
        const nav = (globalThis as any).navigator;
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(displayUrl);
          toastService.success(t('story_viewer.url_copied', 'URL скопировано'));
          onCancel();
        }
      }
    } catch (_) {}
  }, [displayUrl, t, onCancel]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onCancel}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            disabled={isLoading}
          >
            <Ionicons name="close-outline" size={24} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <View style={[styles.iconContainer, { backgroundColor: `${theme.colors.interactive.primary}15` }]}>
            <Ionicons
              name={isPostPublish ? 'checkmark-circle-outline' : 'share-social-outline'}
              size={48}
              color={theme.colors.interactive.primary}
            />
          </View>

          {isPostPublish ? (
            <>
              <Text style={styles.title}>
                {t('story_viewer.publish_share_dialog_published', 'Опубліковано')}
              </Text>

              <View style={styles.urlContainer}>
                <TextInput
                  style={styles.urlInput}
                  value={displayUrl}
                  editable={false}
                  selectTextOnFocus
                  multiline
                />
                <TouchableOpacity
                  style={styles.copyIconButton}
                  onPress={handleCopy}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="copy-outline" size={22} color={theme.colors.interactive.primary} />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                {t('story_viewer.publish_share_dialog_title', 'Опублікувати історію')}
              </Text>

              <Text style={styles.message}>
                {t('story_viewer.publish_share_dialog_message', 'Щоб поділитися історією, її потрібно опублікувати. Вона стане доступна всім користувачам.')}
              </Text>

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={onPublishAndShare}
                activeOpacity={0.7}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {t('story_viewer.publish_and_share', 'Опублікувати і поділитися')}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
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
  dialog: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[6],
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: theme.spacing[4],
    right: theme.spacing[4],
    zIndex: 1,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: theme.borders.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: theme.spacing[4],
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[3],
  },
  message: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
    marginBottom: theme.spacing[6],
  },
  confirmButton: {
    width: '100%',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.interactive.primary,
  },
  confirmButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  urlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  urlInput: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    paddingLeft: theme.spacing[4],
    paddingRight: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
  },
  copyIconButton: {
    padding: theme.spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
  },
});
