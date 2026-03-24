import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { useAuthStore } from '@/store/authStore';
import { useSubmitFeedback, type ReportedScreen } from '@/api/feedback';
import { uploadPhoto } from '@/utils/uploadPhoto';

const REPORTED_SCREENS: ReportedScreen[] = [
  'dashboard',
  'wizard',
  'story_viewer',
  'library',
  'children',
  'characters',
  'plans',
  'profile',
  'other',
];

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  initialReportedScreen?: ReportedScreen;
}

export function FeedbackModal({
  visible,
  onClose,
  initialReportedScreen = 'profile',
}: FeedbackModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const submitFeedback = useSubmitFeedback();

  const [reportedScreen, setReportedScreen] = useState<ReportedScreen>(initialReportedScreen);
  const [category, setCategory] = useState<'bug' | 'feature' | 'other'>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [screenshotStoragePath, setScreenshotStoragePath] = useState<string | null>(null);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isLoggedIn = !!user;
  const showEmailField = !isLoggedIn;
  const showScreenshotField = isLoggedIn;

  useEffect(() => {
    if (visible) {
      setReportedScreen(initialReportedScreen);
      setCategory('bug');
      setMessage('');
      setEmail('');
      setScreenshotUri(null);
      setScreenshotStoragePath(null);
      setSubmitted(false);
    }
  }, [visible, initialReportedScreen]);

  const requestPermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('common.error'),
          'Please grant permission to access your photo library.'
        );
        return false;
      }
    }
    return true;
  };

  const handleAttachScreenshot = async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      const uri = result.assets[0].uri;
      setScreenshotUri(uri);
      setIsUploadingScreenshot(true);

      try {
        const uploaded = await uploadPhoto(uri, 'feedback');
        setScreenshotStoragePath(uploaded.storagePath || null);
      } catch {
        Alert.alert(t('common.error'), 'Failed to upload screenshot. Please try again.');
        setScreenshotUri(null);
      } finally {
        setIsUploadingScreenshot(false);
      }
    } catch {
      Alert.alert(t('common.error'), 'Failed to pick image');
    }
  };

  const handleRemoveScreenshot = () => {
    setScreenshotUri(null);
    setScreenshotStoragePath(null);
  };

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 10) {
      Alert.alert(t('common.error'), t('feedback.message_min_length'));
      return;
    }
    if (trimmedMessage.length > 2000) {
      Alert.alert(t('common.error'), t('feedback.message_max_length'));
      return;
    }
    if (showEmailField) {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        Alert.alert(t('common.error'), t('feedback.email_required'));
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        Alert.alert(t('common.error'), t('feedback.email_invalid'));
        return;
      }
    }

    try {
      await submitFeedback.mutateAsync({
        category,
        message: trimmedMessage,
        email: showEmailField ? email.trim() : undefined,
        screenshotUrl: screenshotStoragePath || undefined,
        reportedScreen,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit feedback';
      Alert.alert(t('common.error'), msg);
    }
  };

  const handleClose = () => {
    if (!submitFeedback.isPending) {
      onClose();
    }
  };

  if (submitted) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={[styles.iconContainer, { backgroundColor: `${theme.colors.status.success}20` }]}>
              <Ionicons name="checkmark-circle" size={48} color={theme.colors.status.success} />
            </View>
            <Text style={styles.title}>{t('feedback.success')}</Text>
            <Text style={styles.message}>{t('feedback.success_message')}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handleClose}>
              <Text style={styles.primaryButtonText}>{t('common.got_it')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('feedback.title')}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={theme.colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Where did it happen? */}
            <Text style={styles.label}>{t('feedback.reported_screen')} *</Text>
            <View style={styles.pickerRow}>
              {REPORTED_SCREENS.map((screen) => (
                <TouchableOpacity
                  key={screen}
                  style={[
                    styles.pill,
                    reportedScreen === screen && styles.pillSelected,
                  ]}
                  onPress={() => setReportedScreen(screen)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      reportedScreen === screen && styles.pillTextSelected,
                    ]}
                  >
                    {t(`feedback.reported_screen_options.${screen}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Category */}
            <Text style={styles.label}>{t('feedback.category')} *</Text>
            <View style={styles.pickerRow}>
              {(['bug', 'feature', 'other'] as const).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.pill, category === cat && styles.pillSelected]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      category === cat && styles.pillTextSelected,
                    ]}
                  >
                    {t(`feedback.categories.${cat}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Message */}
            <Text style={styles.label}>{t('feedback.message')} *</Text>
            <TextInput
              style={styles.textArea}
              value={message}
              onChangeText={setMessage}
              placeholder={t('feedback.message_placeholder')}
              placeholderTextColor={theme.colors.text.tertiary}
              multiline
              numberOfLines={4}
              maxLength={2000}
            />
            <Text style={styles.hint}>
              {message.length}/2000
            </Text>

            {/* Email (anonymous only) */}
            {showEmailField && (
              <>
                <Text style={styles.label}>{t('feedback.email')} *</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('auth.email_placeholder')}
                  placeholderTextColor={theme.colors.text.tertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}

            {/* Screenshot (logged-in only) */}
            {showScreenshotField && (
              <>
                <Text style={styles.label}>{t('feedback.attach_screenshot')}</Text>
                {screenshotUri ? (
                  <View style={styles.screenshotPreview}>
                    <Image source={{ uri: screenshotUri }} style={styles.screenshotImage} />
                    <TouchableOpacity
                      style={styles.removeScreenshotButton}
                      onPress={handleRemoveScreenshot}
                    >
                      <Ionicons name="trash-outline" size={20} color={theme.colors.text.inverse} />
                      <Text style={styles.removeScreenshotText}>{t('feedback.remove_screenshot')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.attachButton}
                    onPress={handleAttachScreenshot}
                    disabled={isUploadingScreenshot}
                  >
                    {isUploadingScreenshot ? (
                      <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={24} color={theme.colors.interactive.primary} />
                        <Text style={styles.attachButtonText}>{t('feedback.attach_screenshot')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, submitFeedback.isPending && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitFeedback.isPending}
            >
              {submitFeedback.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.text.inverse} />
              ) : (
                <Text style={styles.submitButtonText}>{t('feedback.submit')}</Text>
              )}
            </TouchableOpacity>
          </View>
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
    maxWidth: 480,
    width: '100%',
    maxHeight: '90%',
    paddingBottom: theme.spacing[6],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  scroll: {
    paddingHorizontal: theme.spacing[6],
    maxHeight: 400,
  },
  label: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  pill: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  pillSelected: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  pillText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
  },
  pillTextSelected: {
    color: theme.colors.text.inverse,
  },
  input: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[3],
  },
  textArea: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[3],
    minHeight: 100,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderStyle: 'dashed',
  },
  attachButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.interactive.primary,
  },
  screenshotPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  screenshotImage: {
    width: 64,
    height: 64,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.tertiary,
  },
  removeScreenshotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.status.error,
    borderRadius: theme.borders.radius.md,
  },
  removeScreenshotText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.inverse,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    padding: theme.spacing[6],
    paddingTop: theme.spacing[4],
  },
  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  submitButton: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  primaryButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
    alignSelf: 'center',
  },
  primaryButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
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
  message: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
});
