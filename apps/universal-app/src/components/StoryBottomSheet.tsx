import React, { useCallback, useMemo, forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import { AppButton } from '@/components/AppButton';
import AudioPlayer from '@/components/AudioPlayer';
import { StoryCharactersSection } from '@/components/StoryCharactersSection';

interface StoryBottomSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet | null>;
  audioData?: {
    audioUrl: string;
    duration: number;
  };
  story?: any;
  storyId: string;
  hasAlignment: boolean;
  onHighlightToggle: (enabled: boolean) => void;
  onPositionChange: (position: number) => void;
  onFinish: () => void;
  onActivateAudio: () => void | Promise<void>;
  onDeleteStory?: () => void;
  onReportProblem?: () => void;
  onReportGeneratedContent?: () => void;
  onPublish?: () => void;
  onShare?: () => void;
  onUnpublish?: () => void;
  isPublishPending?: boolean;
  characters?: any[];
  onSaveCharacter?: (characterId: string, description?: string | null) => Promise<void>;
  savedCharacterIds?: readonly string[];
  userMode?: 'instant' | 'artisan';
}

export const StoryBottomSheet = forwardRef<BottomSheet, StoryBottomSheetProps>(
  (
    {
      bottomSheetRef,
      audioData,
      story,
      storyId,
      hasAlignment,
      onHighlightToggle,
      onPositionChange,
      onFinish,
      onActivateAudio,
      onDeleteStory,
      onReportProblem,
      onReportGeneratedContent,
      onPublish,
      onShare,
      onUnpublish,
      isPublishPending = false,
      characters = [],
      onSaveCharacter,
      savedCharacterIds = [],
      userMode,
    },
    _ref
  ) => {
    const { t } = useTranslation();

    const snapPoints = useMemo(() => ['60%', '90%'], []);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
      ),
      []
    );

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        handleIndicatorStyle={styles.handleIndicator}
        backgroundStyle={styles.bottomSheetBackground}
      >
        <BottomSheetScrollView contentContainerStyle={styles.contentContainer}>
          {/* Audio Player Section */}
          {audioData && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('story_viewer.audio_title')}</Text>
              <AudioPlayer
                storyId={storyId}
                audioUrl={formatAssetUrl(audioData.audioUrl) ?? audioData.audioUrl}
                duration={audioData.duration}
                hasAlignment={hasAlignment}
                onHighlightToggle={onHighlightToggle}
                onPositionChange={onPositionChange}
                onFinish={onFinish}
                onActivate={async () => {
                  onActivateAudio();
                }}
              />
            </View>
          )}

          {/* Characters Section */}
          {characters.length > 0 && (
            <View style={styles.section}>
              <StoryCharactersSection
                characters={characters}
                savedCharacterIds={savedCharacterIds}
                isArtisanMode={userMode === 'artisan'}
                onSaveCharacter={onSaveCharacter ?? (() => {})}
                isSavePending={false}
              />
            </View>
          )}

          {/* Publication block */}
          {(onPublish || onShare) && (
            <View style={styles.publicationSection}>
              <Text style={styles.sectionTitle}>{t('story_viewer.publication_title')}</Text>
              {!story?.isPublished ? (
                onPublish && (
                  <AppButton
                    label={t('story_viewer.publish')}
                    onPress={onPublish}
                    disabled={isPublishPending}
                    leading={
                      <Ionicons
                        name="cloud-upload-outline"
                        size={20}
                        color={theme.colors.text.inverse}
                      />
                    }
                    style={styles.publicationAction}
                  />
                )
              ) : (
                <>
                  <View style={styles.publicationBadge}>
                    <Ionicons
                      name={story?.visibility === 'unlisted' ? 'link-outline' : 'globe-outline'}
                      size={18}
                      color={theme.colors.text.secondary}
                    />
                    <Text style={styles.publicationBadgeText}>
                      {story?.visibility === 'unlisted'
                        ? t('story_viewer.publication_badge_unlisted')
                        : t('story_viewer.publication_badge_catalog')}
                    </Text>
                  </View>
                  <View style={styles.publicationActionsStack}>
                    {onShare && (
                      <AppButton
                        label={t('story_viewer.share_title')}
                        onPress={onShare}
                        variant="secondary"
                        leading={
                          <Ionicons
                            name="share-social-outline"
                            size={20}
                            color={theme.colors.text.primary}
                          />
                        }
                        style={styles.publicationAction}
                      />
                    )}
                    {onPublish && (
                      <AppButton
                        label={t('story_viewer.update_publication')}
                        onPress={onPublish}
                        disabled={isPublishPending}
                        variant="secondary"
                        leading={
                          <Ionicons
                            name="create-outline"
                            size={20}
                            color={theme.colors.text.primary}
                          />
                        }
                        style={styles.publicationAction}
                      />
                    )}
                    {onUnpublish && (
                      <AppButton
                        label={t('story_viewer.unpublish')}
                        onPress={onUnpublish}
                        variant="dangerSecondary"
                        size="sm"
                        style={styles.unpublishAction}
                      />
                    )}
                  </View>
                </>
              )}
            </View>
          )}

          {/* Delete Story Button */}
          {onDeleteStory ? (
            <AppButton
              label={t('story_viewer.delete_story')}
              onPress={onDeleteStory}
              variant="dangerSecondary"
              leading={<Ionicons name="trash-outline" size={20} color={theme.colors.status.error} />}
              style={styles.sheetAction}
            />
          ) : null}

          {/* Product bug report */}
          {onReportProblem && (
            <AppButton
              label={t('profile.report_problem')}
              onPress={onReportProblem}
              variant="ghost"
              size="md"
              leading={<Ionicons name="bug-outline" size={20} color={theme.colors.text.tertiary} />}
              style={styles.reportProblemAction}
            />
          )}

          {/* Generated-content safety/privacy report */}
          {onReportGeneratedContent && (
            <AppButton
              label={t('feedback.content_report_title')}
              onPress={onReportGeneratedContent}
              variant="ghost"
              size="md"
              leading={
                <Ionicons name="flag-outline" size={20} color={theme.colors.text.tertiary} />
              }
              style={styles.reportProblemAction}
            />
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    );
  }
);

StoryBottomSheet.displayName = 'StoryBottomSheet';

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: theme.colors.background.primary,
  },
  handleIndicator: {
    backgroundColor: theme.colors.border.medium,
  },
  contentContainer: {
    paddingHorizontal: theme.spacing[6],
    paddingBottom: theme.spacing[10],
  },
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  publicationAction: {
    alignSelf: 'stretch',
  },
  publicationSection: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  publicationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
    alignSelf: 'flex-start',
  },
  publicationBadgeText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  publicationActionsStack: {
    gap: theme.spacing[3],
  },
  unpublishAction: {
    alignSelf: 'stretch',
  },
  sheetAction: {
    alignSelf: 'stretch',
  },
  reportProblemAction: {
    marginTop: theme.spacing[2],
  },
});
