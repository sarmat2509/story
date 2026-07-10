import React, { useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { AppButton } from '@/components/AppButton';
import { useTranslation } from 'react-i18next';
import { toastService } from '@/services/toastService';
import { formatAssetUrl } from '@/utils/assetUrl';

export type PublishVisibility = 'public' | 'unlisted';

export interface CoverAssetOption {
  assetId: string;
  imageUrl: string | null;
}

interface PublishShareDialogProps {
  visible: boolean;
  onPublishAndShare: (
    visibility: PublishVisibility,
    coverAssetId?: string | null,
    pseudonym?: string,
    aboutMe?: string
  ) => void;
  onCancel: () => void;
  shareUrl?: string | null;
  isLoading?: boolean;
  /** User's pseudonym from profile. If set, show read-only text; if not, show input. */
  userPseudonym?: string | null;
  authorAboutMe?: string | null;
  allowAuthorProfileEdit?: boolean;
  /** Scene image assets available for cover selection. */
  coverAssets?: CoverAssetOption[];
  /** Currently selected cover asset id. */
  coverAssetId?: string | null;
  /** Called when user taps "Unpublish" link (when shareUrl is shown) */
  onUnpublish?: () => void;
  /** Current story visibility when opening for update (pre-select in dialog) */
  initialVisibility?: PublishVisibility;
  /** True when opened from Share button (unpublished story). Shows "must publish to share" message. */
  openedFromShare?: boolean;
}

const THUMB_HEIGHT = 90;
const THUMB_WIDTH = Math.round(90 * (16 / 9)); // 160, preserves 16:9 scene ratio
const THUMB_GAP = theme.spacing[2];

export function PublishShareDialog({
  visible,
  onPublishAndShare,
  onCancel,
  shareUrl,
  isLoading = false,
  userPseudonym = null,
  authorAboutMe = null,
  allowAuthorProfileEdit = false,
  coverAssets = [],
  coverAssetId: initialCoverAssetId = null,
  onUnpublish,
  initialVisibility = 'public',
  openedFromShare = false,
}: PublishShareDialogProps) {
  const { t } = useTranslation();
  const [selectedVisibility, setSelectedVisibility] = React.useState<PublishVisibility>('public');
  const [selectedCoverAssetId, setSelectedCoverAssetId] = React.useState<string | null>(null);
  const [pseudonymInput, setPseudonymInput] = React.useState('');
  const [aboutMeInput, setAboutMeInput] = React.useState('');
  const isPostPublish = !!shareUrl;

  const coverAssetsWithImages = useMemo(
    () =>
      coverAssets.filter(
        (asset): asset is CoverAssetOption & { imageUrl: string } => !!asset.imageUrl
      ),
    [coverAssets]
  );

  const validInitialCoverAssetId = useMemo(() => {
    if (
      initialCoverAssetId &&
      coverAssetsWithImages.some((asset) => asset.assetId === initialCoverAssetId)
    ) {
      return initialCoverAssetId;
    }
    return coverAssetsWithImages[0]?.assetId ?? null;
  }, [initialCoverAssetId, coverAssetsWithImages]);

  // Sync when dialog opens with new initial value
  React.useEffect(() => {
    if (visible) {
      setSelectedCoverAssetId(validInitialCoverAssetId);
      setPseudonymInput(userPseudonym ?? '');
      setAboutMeInput(authorAboutMe ?? '');
      setSelectedVisibility(initialVisibility);
    }
  }, [visible, validInitialCoverAssetId, initialVisibility, userPseudonym, authorAboutMe]);

  const displayUrl = useMemo(() => {
    if (!shareUrl) return '';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const u = new URL(shareUrl);
        return `${window.location.origin}${u.pathname}${u.search}`;
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog} testID="publish-share-dialog">
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onCancel}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            disabled={isLoading}
            testID="publish-share-close"
          >
            <Ionicons name="close-outline" size={24} color={theme.colors.text.tertiary} />
          </TouchableOpacity>

          <View
            style={[
              styles.iconContainer,
              { backgroundColor: `${theme.colors.interactive.primary}15` },
            ]}
          >
            <Ionicons
              name={
                isPostPublish
                  ? 'checkmark-circle-outline'
                  : openedFromShare
                    ? 'share-social-outline'
                    : 'create-outline'
              }
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
                  testID="publish-share-url"
                />
                <TouchableOpacity
                  style={styles.copyIconButton}
                  onPress={handleCopy}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  testID="publish-share-copy"
                >
                  <Ionicons
                    name="copy-outline"
                    size={22}
                    color={theme.colors.interactive.primary}
                  />
                </TouchableOpacity>
              </View>

              {onUnpublish && (
                <AppButton
                  label={t('story_viewer.unpublish', 'Зняти з публікації')}
                  onPress={onUnpublish}
                  disabled={isLoading}
                  variant="dangerSecondary"
                  size="sm"
                  style={styles.unpublishAction}
                  testID="publish-share-unpublish"
                />
              )}
            </>
          ) : (
            <>
              <Text style={styles.title}>
                {t('story_viewer.publish_share_dialog_title', 'Опублікувати історію')}
              </Text>

              {openedFromShare && (
                <Text style={styles.message}>
                  {t(
                    'story_viewer.publish_share_dialog_message',
                    'Щоб поділитися історією, її потрібно опублікувати. Вона стане доступна всім користувачам.'
                  )}
                </Text>
              )}

              {userPseudonym && !allowAuthorProfileEdit ? (
                <Text style={styles.pseudonymText}>
                  {t('story_viewer.publishing_under_pseudonym', 'Публікуємо під псевдонімом')}{' '}
                  {userPseudonym}
                </Text>
              ) : (
                <View style={styles.pseudonymRow}>
                  <Text style={styles.pseudonymLabel}>{t('profile.pseudonym', 'Псевдоним')}</Text>
                  <TextInput
                    style={styles.pseudonymInput}
                    value={pseudonymInput}
                    onChangeText={setPseudonymInput}
                    maxLength={100}
                    testID="publish-share-pseudonym"
                  />
                </View>
              )}

              {allowAuthorProfileEdit && (
                <View style={styles.pseudonymRow}>
                  <Text style={styles.pseudonymLabel}>
                    {t('profile.about_me', { defaultValue: 'About me' })}
                  </Text>
                  <TextInput
                    style={[styles.pseudonymInput, styles.aboutMeInput]}
                    value={aboutMeInput}
                    onChangeText={setAboutMeInput}
                    maxLength={1000}
                    multiline
                    testID="publish-share-about-me"
                  />
                </View>
              )}

              {coverAssetsWithImages.length > 0 && (
                <>
                  <Text style={styles.carouselLabel}>
                    {t('story_viewer.share_card_cover', 'Обкладинка для поширення')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carouselContent}
                    style={styles.carousel}
                  >
                    {coverAssetsWithImages.map((asset) => {
                      const isSelected = selectedCoverAssetId === asset.assetId;
                      return (
                        <TouchableOpacity
                          key={asset.assetId}
                          style={[styles.thumbWrapper, isSelected && styles.thumbWrapperSelected]}
                          onPress={() => setSelectedCoverAssetId(asset.assetId)}
                          activeOpacity={0.8}
                          testID={`publish-share-cover-${asset.assetId}`}
                        >
                          <Image
                            source={{ uri: formatAssetUrl(asset.imageUrl) ?? '' }}
                            style={styles.thumb}
                            resizeMode="cover"
                          />
                          {isSelected && (
                            <View style={styles.thumbCheck}>
                              <Ionicons
                                name="checkmark-circle"
                                size={24}
                                color={theme.colors.text.inverse}
                              />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              <View style={styles.visibilityOptions}>
                <TouchableOpacity
                  style={[
                    styles.visibilityOption,
                    selectedVisibility === 'public' && styles.visibilityOptionSelected,
                  ]}
                  onPress={() => setSelectedVisibility('public')}
                  activeOpacity={0.7}
                  testID="publish-share-visibility-public"
                >
                  <Ionicons
                    name="globe-outline"
                    size={24}
                    color={
                      selectedVisibility === 'public'
                        ? theme.colors.interactive.primary
                        : theme.colors.text.secondary
                    }
                  />
                  <Text
                    style={[
                      styles.visibilityLabel,
                      selectedVisibility === 'public' && styles.visibilityLabelSelected,
                    ]}
                  >
                    {t('story_viewer.visibility_public', 'Для всіх')}
                  </Text>
                  <Text style={styles.visibilityHint}>
                    {t('story_viewer.visibility_public_hint', 'У каталозі')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.visibilityOption,
                    selectedVisibility === 'unlisted' && styles.visibilityOptionSelected,
                  ]}
                  onPress={() => setSelectedVisibility('unlisted')}
                  activeOpacity={0.7}
                  testID="publish-share-visibility-unlisted"
                >
                  <Ionicons
                    name="link-outline"
                    size={24}
                    color={
                      selectedVisibility === 'unlisted'
                        ? theme.colors.interactive.primary
                        : theme.colors.text.secondary
                    }
                  />
                  <Text
                    style={[
                      styles.visibilityLabel,
                      selectedVisibility === 'unlisted' && styles.visibilityLabelSelected,
                    ]}
                  >
                    {t('story_viewer.visibility_unlisted', 'По посиланню')}
                  </Text>
                  <Text style={styles.visibilityHint}>
                    {t('story_viewer.visibility_unlisted_hint', 'Тільки хто має лінк')}
                  </Text>
                </TouchableOpacity>
              </View>

              {selectedVisibility === 'public' && (
                <View
                  style={styles.publicVisibilityNotice}
                  accessibilityRole="text"
                  testID="publish-share-public-notice"
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={theme.colors.status.warning}
                  />
                  <Text style={styles.publicVisibilityNoticeText}>
                    {t(
                      'story_viewer.visibility_public_notice',
                      'Public stories can appear in the catalog and be seen by anyone. Choose link-only for private sharing.'
                    )}
                  </Text>
                </View>
              )}

              <AppButton
                label={
                  openedFromShare
                    ? t('story_viewer.publish_and_share', 'Опублікувати і поділитися')
                    : t('story_viewer.publish', 'Опублікувати')
                }
                onPress={() =>
                  onPublishAndShare(
                    selectedVisibility,
                    selectedCoverAssetId,
                    (!userPseudonym || allowAuthorProfileEdit) && pseudonymInput.trim()
                      ? pseudonymInput.trim()
                      : undefined,
                    allowAuthorProfileEdit && aboutMeInput.trim() ? aboutMeInput.trim() : undefined
                  )
                }
                disabled={isLoading}
                loading={isLoading}
                style={styles.publishAction}
                testID="publish-share-submit"
              />
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
  publishAction: {
    width: '100%',
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
  visibilityOptions: {
    flexDirection: 'row',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  visibilityOption: {
    flex: 1,
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.border.light,
    alignItems: 'center',
  },
  visibilityOptionSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: `${theme.colors.interactive.primary}10`,
  },
  visibilityLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginTop: theme.spacing[2],
  },
  visibilityLabelSelected: {
    color: theme.colors.interactive.primary,
  },
  visibilityHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
  },
  publicVisibilityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    backgroundColor: `${theme.colors.status.warning}15`,
    marginBottom: theme.spacing[4],
  },
  publicVisibilityNoticeText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: theme.typography.fontSize.sm * 1.35,
    color: theme.colors.text.secondary,
  },
  pseudonymText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[4],
  },
  pseudonymRow: {
    marginBottom: theme.spacing[4],
  },
  pseudonymLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[1],
  },
  pseudonymInput: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[3],
  },
  aboutMeInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  carouselLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[2],
  },
  carousel: {
    marginBottom: theme.spacing[4],
    maxHeight: THUMB_HEIGHT + theme.spacing[2],
  },
  carouselContent: {
    flexDirection: 'row',
    gap: THUMB_GAP,
    paddingVertical: theme.spacing[1],
  },
  thumbWrapper: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: theme.borders.radius.md,
    overflow: 'hidden',
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.border.light,
  },
  thumbWrapperSelected: {
    borderColor: theme.colors.interactive.primary,
    borderWidth: theme.borders.width.thick,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbCheck: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unpublishAction: {
    marginTop: theme.spacing[4],
    alignSelf: 'center',
  },
});
