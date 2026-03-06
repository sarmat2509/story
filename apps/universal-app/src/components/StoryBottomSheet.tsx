import React, { useCallback, useMemo, forwardRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import AudioPlayer from '@/components/AudioPlayer';
import VoiceSelector from '@/components/VoiceSelector';

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
  onActivateAudio: () => void;
  onDeleteStory: () => void;
  onPublish?: () => void;
  onShare?: () => void;
  onUnpublish?: () => void;
  isPublishPending?: boolean;
  characters?: any[];
  onSaveCharacter?: (characterId: string) => Promise<void>;
  savedCharacterIds?: Set<string>;
  userMode?: 'instant' | 'artisan';
}

export const StoryBottomSheet = forwardRef<BottomSheet, StoryBottomSheetProps>(
  ({
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
    onPublish,
    onShare,
    onUnpublish,
    isPublishPending = false,
    characters = [],
    onSaveCharacter,
    savedCharacterIds = new Set(),
    userMode,
  }, ref) => {
    const { t } = useTranslation();
    
    const snapPoints = useMemo(() => ['60%', '90%'], []);
    
    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      []
    );
    
    const getCharacterTypeLabel = (type: string) => {
      switch (type) {
        case 'child': return t('story_viewer.character_type_child');
        case 'person': return t('story_viewer.character_type_person');
        case 'animal': return t('story_viewer.character_type_animal');
        case 'imaginary': return t('story_viewer.character_type_imaginary');
        default: return type;
      }
    };
    
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
                onActivate={onActivateAudio}
              />
            </View>
          )}
          
          {/* Characters Section */}
          {characters.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('story_viewer.characters_title')}</Text>
              {characters.map((char: any) => {
                const isEffectivelyHidden = char.isHidden && !savedCharacterIds.has(char.id);
                const canSaveCharacter = isEffectivelyHidden && userMode === 'artisan' && onSaveCharacter;
                return (
                  <View key={char.id} style={styles.characterCard}>
                    <View style={styles.characterCardRow}>
                      {char.referencePhotoUrl ? (
                        <View style={styles.characterAvatar}>
                          <Ionicons name="person-outline" size={20} color={theme.colors.text.inverse} />
                        </View>
                      ) : (
                        <View style={[styles.characterAvatar, styles.characterAvatarPlaceholder]}>
                          <Ionicons name="person-outline" size={20} color={theme.colors.text.tertiary} />
                        </View>
                      )}
                      <View style={styles.characterInfo}>
                        <Text style={styles.characterName}>{char.name}</Text>
                        <Text style={styles.characterType}>{getCharacterTypeLabel(char.type)}</Text>
                      </View>
                    </View>
                    {canSaveCharacter && (
                      <TouchableOpacity
                        style={styles.saveCharacterButton}
                        onPress={() => onSaveCharacter(char.id)}
                      >
                        <Ionicons name="bookmark-outline" size={16} color={theme.colors.interactive.primary} />
                        <Text style={styles.saveCharacterText}>{t('story_viewer.save_character')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          
          {/* Publication block */}
          {(onPublish || onShare) && (
            <View style={styles.publicationSection}>
              <Text style={styles.sectionTitle}>{t('story_viewer.publication_title')}</Text>
              {!story?.isPublished ? (
                onPublish && (
                  <TouchableOpacity
                    style={styles.publishButton}
                    onPress={onPublish}
                    disabled={isPublishPending}
                  >
                    <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.text.inverse} />
                    <Text style={styles.publishButtonText}>{t('story_viewer.publish')}</Text>
                  </TouchableOpacity>
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
                  {onShare && (
                    <TouchableOpacity style={styles.shareButton} onPress={onShare}>
                      <Ionicons name="share-social-outline" size={20} color={theme.colors.interactive.primary} />
                      <Text style={styles.shareButtonText}>{t('story_viewer.share_title')}</Text>
                    </TouchableOpacity>
                  )}
                  {onPublish && (
                    <TouchableOpacity
                      style={styles.updatePublicationButton}
                      onPress={onPublish}
                      disabled={isPublishPending}
                    >
                      <Ionicons name="create-outline" size={20} color={theme.colors.interactive.primary} />
                      <Text style={styles.updatePublicationButtonText}>{t('story_viewer.update_publication')}</Text>
                    </TouchableOpacity>
                  )}
                  {onUnpublish && (
                    <TouchableOpacity style={styles.unpublishLink} onPress={onUnpublish}>
                      <Text style={styles.unpublishLinkText}>{t('story_viewer.unpublish')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          )}
          
          {/* Delete Story Button */}
          <TouchableOpacity 
            style={styles.deleteButton}
            onPress={onDeleteStory}
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.status.error} />
            <Text style={styles.deleteButtonText}>{t('story_viewer.delete_story')}</Text>
          </TouchableOpacity>
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
  characterCard: {
    flexDirection: 'column',
    paddingVertical: theme.spacing[3],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
  },
  characterCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  characterAvatar: {
    width: 40,
    height: 40,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.interactive.primary,
    marginRight: theme.spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterAvatarPlaceholder: {
    backgroundColor: theme.colors.background.tertiary,
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  characterType: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  saveCharacterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: theme.spacing[2],
    marginLeft: 52,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
  },
  saveCharacterText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.interactive.primary,
    marginLeft: theme.spacing[1],
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    marginTop: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.interactive.primary,
  },
  publishButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    marginTop: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.primary,
  },
  shareButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.interactive.primary,
  },
  publicationSection: {
    marginBottom: theme.spacing[6],
  },
  publicationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
    alignSelf: 'flex-start',
  },
  publicationBadgeText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  updatePublicationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    marginTop: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.primary,
  },
  updatePublicationButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.interactive.primary,
  },
  unpublishLink: {
    paddingVertical: theme.spacing[2],
    marginTop: theme.spacing[2],
    alignSelf: 'flex-start',
  },
  unpublishLinkText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.status.error,
    textDecorationLine: 'underline',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    marginTop: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.status.error,
    backgroundColor: theme.colors.background.primary,
  },
  deleteButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.status.error,
  },
});
