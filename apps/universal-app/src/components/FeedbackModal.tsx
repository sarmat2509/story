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
import { captureScreen } from 'react-native-view-shot';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_TOPICS,
  getFeedbackCategoryForTopic,
  isContentReportTopic,
  type FeedbackTopic,
} from '@wondertales/shared';
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
  'published_story',
  'other',
];

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  initialReportedScreen?: ReportedScreen;
  initialTopic?: FeedbackTopic;
  contentReportContext?: {
    storyId?: string;
    storySlug?: string;
    shareToken?: string;
    sceneId?: number;
    contentType?: 'story' | 'scene' | 'image' | 'audio' | 'other';
  };
}

const GENERATED_CONTENT_REPORT_TOPICS: FeedbackTopic[] = [
  'unsafe_image',
  'unsafe_text',
  'privacy_concern',
  'other',
];

function getDefaultFeedbackTopic(screen: ReportedScreen): FeedbackTopic {
  if (screen === 'plans' || screen === 'profile') {
    return 'billing';
  }

  if (screen === 'published_story') {
    return 'unsafe_image';
  }

  if (screen === 'wizard') {
    return 'generation_failed';
  }

  return 'bug';
}

async function captureCurrentViewportDataUrl(): Promise<string> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Web-only screenshot capture is unavailable');
  }

  console.log('[FeedbackModal] Starting web viewport screenshot capture');

  const captureRoot =
    document.getElementById('root') ??
    document.getElementById('main') ??
    document.body;

  if (!captureRoot) {
    throw new Error('App root not found');
  }
  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  const html2canvasModule = await import('html2canvas');
  const html2canvas = html2canvasModule.default;
  const canvas = await html2canvas(captureRoot as HTMLElement, {
    backgroundColor: window.getComputedStyle(document.body).backgroundColor || '#ffffff',
    useCORS: true,
    allowTaint: false,
    logging: false,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    width: viewportWidth,
    height: viewportHeight,
    x: scrollX,
    y: scrollY,
    scrollX,
    scrollY,
    windowWidth: viewportWidth,
    windowHeight: viewportHeight,
  });

  console.log('[FeedbackModal] Web viewport screenshot render completed');

  const dataUrl = await new Promise<string>((resolve, reject) => {
    if (!canvas.toBlob) {
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (error) {
        reject(error);
      }
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to serialize screenshot canvas'));
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read screenshot blob'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read screenshot blob'));
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.9);
  });

  console.log('[FeedbackModal] Web viewport screenshot encoded');
  return dataUrl;
}

async function captureFeedbackScreenshotUri(): Promise<string> {
  if (Platform.OS === 'web') {
    console.log('[FeedbackModal] Using web screenshot capture path');
    return captureCurrentViewportDataUrl();
  }

  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    console.log('[FeedbackModal] Using native screenshot capture path', { platform: Platform.OS });
    return captureScreen({
      format: 'jpg',
      quality: 0.8,
    });
  }

  throw new Error('Automatic screenshot capture is unavailable on this platform');
}

export function FeedbackModal({
  visible,
  onClose,
  initialReportedScreen = 'profile',
  initialTopic,
  contentReportContext,
}: FeedbackModalProps) {
  const { t } = useTranslation();
  const { user, sessionMode } = useAuthStore();
  const submitFeedback = useSubmitFeedback();

  const [reportedScreen, setReportedScreen] = useState<ReportedScreen>(initialReportedScreen);
  const [supportTopic, setSupportTopic] = useState<FeedbackTopic>(
    initialTopic ?? getDefaultFeedbackTopic(initialReportedScreen)
  );
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [screenshotStoragePath, setScreenshotStoragePath] = useState<string | null>(null);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);
  const [isPreparingModal, setIsPreparingModal] = useState(false);
  const [hasAttemptedAutoCapture, setHasAttemptedAutoCapture] = useState(false);
  const [isAutoCaptured, setIsAutoCaptured] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);

  const isLoggedIn = !!user;
  const isGeneratedContentReport = !!contentReportContext;
  const contentReportTopics = isGeneratedContentReport
    ? GENERATED_CONTENT_REPORT_TOPICS
    : FEEDBACK_TOPICS;
  const emailIsRequired = !isLoggedIn && !isContentReportTopic(supportTopic);
  const showEmailField = !isLoggedIn;
  const showScreenshotField = isLoggedIn && sessionMode !== 'child';

  useEffect(() => {
    if (visible) {
      setReportedScreen(initialReportedScreen);
      setSupportTopic(initialTopic ?? getDefaultFeedbackTopic(initialReportedScreen));
      setMessage('');
      setEmail('');
      setScreenshotUri(null);
      setScreenshotStoragePath(null);
      setIsPreparingModal(false);
      setIsUploadingScreenshot(false);
      setHasAttemptedAutoCapture(false);
      setIsAutoCaptured(false);
      setSubmitted(false);
      setSubmittedReportId(null);
    } else {
      setIsPreparingModal(false);
      setIsUploadingScreenshot(false);
    }
  }, [visible, initialReportedScreen, initialTopic]);

  useEffect(() => {
    if (!visible || !showScreenshotField || hasAttemptedAutoCapture) {
      return;
    }

    let cancelled = false;
    const preparingTimeout = setTimeout(() => {
      if (!cancelled) {
        setIsPreparingModal(false);
      }
    }, 1500);

    const runAutoCapture = async () => {
      try {
        console.log('[FeedbackModal] Auto screenshot capture started', {
          platform: Platform.OS,
          reportedScreen: initialReportedScreen,
        });
        setHasAttemptedAutoCapture(true);
        setIsPreparingModal(true);
        setIsUploadingScreenshot(true);

        if (Platform.OS === 'web') {
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
          });
        }

        const capturedUri = await captureFeedbackScreenshotUri();
        if (cancelled) return;

        console.log('[FeedbackModal] Screenshot captured successfully', {
          platform: Platform.OS,
          uriPrefix: capturedUri.slice(0, 40),
        });
        setScreenshotUri(capturedUri);
        setIsAutoCaptured(true);
        setIsPreparingModal(false);
        const uploaded = await uploadPhoto(capturedUri, 'feedback');
        if (cancelled) return;

        console.log('[FeedbackModal] Screenshot uploaded successfully', {
          platform: Platform.OS,
          storagePath: uploaded.storagePath ?? null,
        });
        setScreenshotStoragePath(uploaded.storagePath || null);
      } catch (error) {
        console.warn('Auto feedback screenshot capture failed', error);
        if (!cancelled) {
          setIsPreparingModal(false);
        }
      } finally {
        if (!cancelled) {
          setIsUploadingScreenshot(false);
        }
      }
    };

    void runAutoCapture();

    return () => {
      cancelled = true;
      clearTimeout(preparingTimeout);
    };
  }, [visible, showScreenshotField]);

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
      setIsAutoCaptured(false);
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
    setIsAutoCaptured(false);
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
      if (emailIsRequired && !trimmedEmail) {
        Alert.alert(t('common.error'), t('feedback.email_required'));
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
        Alert.alert(t('common.error'), t('feedback.email_invalid'));
        return;
      }
    }

    try {
      const report = await submitFeedback.mutateAsync({
        category: getFeedbackCategoryForTopic(supportTopic),
        supportTopic,
        message: trimmedMessage,
        email: showEmailField ? email.trim() : undefined,
        screenshotUrl: screenshotStoragePath || undefined,
        reportedScreen,
        ...contentReportContext,
      });
      setSubmittedReportId(report.id);
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit feedback';
      Alert.alert(t('common.error'), msg);
    }
  };

  const handleClose = () => {
    if (!submitFeedback.isPending && !isPreparingModal) {
      onClose();
    }
  };

  if (visible && showScreenshotField && (isPreparingModal || !hasAttemptedAutoCapture)) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={styles.preparingDialog}>
            <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
            <Text style={styles.preparingTitle}>{t('feedback.title')}</Text>
            <Text style={styles.preparingText}>{t('feedback.preparing_screenshot')}</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (submitted) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={styles.successDialog}>
            <View style={[styles.iconContainer, { backgroundColor: `${theme.colors.status.success}20` }]}>
              <Ionicons name="checkmark-circle" size={48} color={theme.colors.status.success} />
            </View>
            <Text style={styles.successTitle}>{t('feedback.success')}</Text>
            <Text style={styles.successMessage}>
              {isGeneratedContentReport
                ? t('feedback.success_content_report_message')
                : t('feedback.success_message')}
            </Text>
            {submittedReportId ? (
              <Text style={styles.reportIdText}>
                {t('feedback.report_id', { id: submittedReportId })}
              </Text>
            ) : null}
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
            <Text style={styles.title}>
              {isGeneratedContentReport ? t('feedback.content_report_title') : t('feedback.title')}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={theme.colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {!isGeneratedContentReport ? (
              <>
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
              </>
            ) : (
              <Text style={styles.contentReportNotice}>
                {t('feedback.content_report_notice')}
              </Text>
            )}

            {/* Category */}
            <Text style={styles.label}>
              {isGeneratedContentReport ? t('feedback.content_report_category') : t('feedback.category')} *
            </Text>
            <View style={styles.pickerRow}>
              {contentReportTopics.map((topic) => (
                <TouchableOpacity
                  key={topic}
                  style={[styles.pill, supportTopic === topic && styles.pillSelected]}
                  onPress={() => setSupportTopic(topic)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      supportTopic === topic && styles.pillTextSelected,
                    ]}
                  >
                    {t(`feedback.categories.${topic}`)}
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
              placeholder={
                isGeneratedContentReport
                  ? t('feedback.content_report_placeholder')
                  : t('feedback.message_placeholder')
              }
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
                <Text style={styles.label}>
                  {emailIsRequired ? `${t('feedback.email')} *` : t('feedback.email_optional')}
                </Text>
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
                    <View style={styles.screenshotActions}>
                      {isAutoCaptured ? (
                        <Text style={styles.autoScreenshotHint}>{t('feedback.auto_screenshot_attached')}</Text>
                      ) : null}
                      {isUploadingScreenshot ? (
                        <Text style={styles.autoScreenshotHint}>{t('feedback.uploading_screenshot')}</Text>
                      ) : null}
                      <View style={styles.screenshotButtonRow}>
                        <TouchableOpacity
                          style={styles.replaceScreenshotButton}
                          onPress={handleAttachScreenshot}
                          disabled={isUploadingScreenshot}
                        >
                          <Ionicons name="refresh-outline" size={20} color={theme.colors.interactive.primary} />
                          <Text style={styles.replaceScreenshotText}>{t('feedback.replace_screenshot')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.removeScreenshotButton}
                          onPress={handleRemoveScreenshot}
                        >
                          <Ionicons name="trash-outline" size={20} color={theme.colors.text.inverse} />
                          <Text style={styles.removeScreenshotText}>{t('feedback.remove_screenshot')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
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
  successDialog: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.xl,
    maxWidth: 480,
    width: '100%',
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[8],
    alignItems: 'center',
  },
  preparingDialog: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.xl,
    maxWidth: 420,
    width: '100%',
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[6],
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  preparingTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  preparingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
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
  contentReportNotice: {
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.warning[50],
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
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
  screenshotActions: {
    flex: 1,
    gap: theme.spacing[2],
  },
  screenshotButtonRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    flexWrap: 'wrap',
  },
  screenshotImage: {
    width: 64,
    height: 64,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.tertiary,
  },
  autoScreenshotHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
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
  replaceScreenshotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
  },
  replaceScreenshotText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.medium,
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
    minWidth: 180,
    alignItems: 'center',
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
    marginBottom: theme.spacing[5],
  },
  successTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[3],
  },
  successMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: theme.spacing[8],
    maxWidth: 360,
  },
  reportIdText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: -theme.spacing[5],
    marginBottom: theme.spacing[6],
  },
});
