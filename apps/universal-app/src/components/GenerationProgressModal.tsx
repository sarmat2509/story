import React from 'react';
import { Modal, View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RequestStatus, StoryRequestProgressData } from '@wondertales/shared';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  status: RequestStatus;
  progress: number;
  progressData?: StoryRequestProgressData;
  errorMessage?: string;
  onClose?: () => void;
  onRetry?: () => void;
  onReport?: () => void;
  allowManualClose?: boolean;
}

export function GenerationProgressModal({
  visible,
  status,
  progress,
  progressData,
  errorMessage,
  onClose,
  onRetry,
  onReport,
  allowManualClose = false,
}: Props) {
  const { t } = useTranslation();
  const getTaskLabel = (task: string) => {
    const labels: Record<string, string> = {
      'analyzing_photos': 'Аналізуємо фотографії...',
      'generating_text': 'Пишемо текст...',
      'validating': 'Перевіряємо безпечність контенту...',
      'generating_images': 'Створюємо ілюстрації...',
      'generating_audio': 'Озвучуємо історію...',
    };
    return labels[task] || 'Обробляємо запит...';
  };
  
  const getStatusText = () => {
    if (status === 'pending') {
      return 'Додаємо історію до черги...';
    }
    if (status === 'processing' && progressData?.activeTasks?.[0]) {
      return getTaskLabel(progressData.activeTasks[0].task);
    }
    if (status === 'completed') {
      return 'Готово! 🎉';
    }
    if (status === 'failed') {
      return errorMessage || 'Виникла помилка';
    }
    return 'Обробляємо запит...';
  };

  const getProgressPercentage = () => {
    if (status === 'completed') return 100;
    if (status === 'failed') return 0;
    // Use backend-calculated progress directly
    return progressData?.overallProgress ?? progress ?? 0;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {allowManualClose && onClose && status === 'completed' && (
            <TouchableOpacity 
              style={styles.closeIcon}
              onPress={onClose}
            >
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>
          )}
          
          {status !== 'completed' && status !== 'failed' && (
            <ActivityIndicator 
              size="large" 
              color={theme.colors.interactive.primary}
              style={styles.spinner}
            />
          )}
          
          {status === 'completed' && (
            <Text style={styles.successIcon}>✅</Text>
          )}
          
          {status === 'failed' && (
            <Text style={styles.errorIcon}>❌</Text>
          )}
          
          <Text style={[
            styles.statusText,
            status === 'failed' && styles.errorText
          ]}>
            {getStatusText()}
          </Text>
          
          {status !== 'completed' && status !== 'failed' && (
            <>
              <View style={styles.progressBarContainer}>
                <View 
                  style={[
                    styles.progressBar, 
                    { width: `${getProgressPercentage()}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {Math.round(getProgressPercentage())}%
              </Text>
            </>
          )}
          
          {status === 'failed' && errorMessage && (
            <Text style={styles.errorMessage}>{errorMessage}</Text>
          )}
          
          {status === 'failed' && (
            <View style={styles.failedActions}>
              {onRetry && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={onRetry}
                >
                  <Text style={styles.retryButtonText}>{t('wizard.retry')}</Text>
                </TouchableOpacity>
              )}
              {onReport && (
                <TouchableOpacity
                  style={styles.reportButton}
                  onPress={onReport}
                >
                  <Text style={styles.reportButtonText}>{t('feedback.report_this_issue')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          
          {status === 'completed' && onClose && (
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>Переглянути історію</Text>
            </TouchableOpacity>
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
  modal: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[8],
    alignItems: 'center',
    minWidth: 300,
    maxWidth: 400,
    position: 'relative',
  },
  closeIcon: {
    position: 'absolute',
    top: theme.spacing[4],
    right: theme.spacing[4],
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.full,
    zIndex: 10,
  },
  closeIconText: {
    fontSize: 20,
    color: theme.colors.text.tertiary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  spinner: {
    marginBottom: theme.spacing[6],
  },
  successIcon: {
    fontSize: 64,
    marginBottom: theme.spacing[4],
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: theme.spacing[4],
  },
  statusText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[4],
  },
  errorText: {
    color: theme.colors.status.error,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.full,
    overflow: 'hidden',
    marginBottom: theme.spacing[3],
    // iOS-specific fixes
    minHeight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.full,
    // iOS-specific fixes
    minHeight: 8,
    minWidth: 4, // Ensure bar is visible even at 0%
  },
  progressText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
  },
  errorMessage: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  failedActions: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  retryButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
  },
  retryButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  reportButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
  },
  reportButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  closeButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
    marginTop: theme.spacing[4],
  },
  closeButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
});
