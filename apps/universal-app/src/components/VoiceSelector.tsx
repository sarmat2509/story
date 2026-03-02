import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Audio } from 'expo-av';
import { theme } from '@/theme';
import { API_BASE_URL } from '@/config/constants';
import type { Voice } from '@/api/voices';

interface Props {
  voices: Voice[];
  selectedVoiceId?: string;
  onVoiceChange: (voiceId: string) => void;
  language: string;
  userPlan: string;
  hasPremiumAccess: boolean;
  onUpgrade?: () => void;
  audioUsage?: {
    remaining: number;
    limit: number;
  };
}

export default function VoiceSelector({ 
  voices, 
  selectedVoiceId, 
  onVoiceChange, 
  language,
  userPlan,
  hasPremiumAccess,
  onUpgrade,
  audioUsage,
}: Props) {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const { width } = useWindowDimensions();
  
  // Audio playback state
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  
  // Determine if desktop (wider screen)
  const isDesktop = width >= 768;

  const selectedVoice = voices.find(v => v.id === selectedVoiceId);
  
  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const handleSelectVoice = (voice: Voice) => {
    if (voice.isLocked) {
      // Don't close modal for locked voices, let user click upgrade
      return;
    }
    
    onVoiceChange(voice.id);
    setModalVisible(false);
  };
  
  const handlePlaySample = async (voice: Voice) => {
    if (!voice.sampleAudioUrl) return;
    
    try {
      // If already playing this voice, pause it
      if (playingVoiceId === voice.id && soundRef.current) {
        await soundRef.current.pauseAsync();
        setPlayingVoiceId(null);
        return;
      }
      
      // Stop currently playing audio
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      
      setLoadingVoiceId(voice.id);
      setPlayingVoiceId(null);
      
      // Construct URL for sample
      // On web: use relative path (proxied to API server)
      // On native: use full API URL
      const sampleUrl = voice.sampleAudioUrl.startsWith('http') 
        ? voice.sampleAudioUrl 
        : Platform.OS === 'web'
          ? `/api/v1/assets/${voice.sampleAudioUrl}`
          : `${API_BASE_URL}/api/v1/assets/${voice.sampleAudioUrl}`;
      
      // Load and play new audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: sampleUrl },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlayingVoiceId(null);
            sound.unloadAsync();
            if (soundRef.current === sound) {
              soundRef.current = null;
            }
          }
        }
      );
      
      soundRef.current = sound;
      setLoadingVoiceId(null);
      setPlayingVoiceId(voice.id);
      
    } catch (error) {
      console.error('Failed to play sample:', error);
      setLoadingVoiceId(null);
      setPlayingVoiceId(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Dropdown Button */}
      <TouchableOpacity 
        style={styles.dropdownButton}
        onPress={() => setModalVisible(true)}
      >
        <View style={styles.dropdownContent}>
          <Text style={styles.dropdownText}>
            {selectedVoice?.displayName || t('voice_selector.select_voice')} {selectedVoice?.isPremium && '⭐'}
          </Text>
          <Text style={styles.dropdownGender}>
            {selectedVoice && t(`voice_selector.gender.${selectedVoice.gender}`)}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={20} color={theme.colors.text.tertiary} />
      </TouchableOpacity>

      {/* Voice Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType={isDesktop ? "fade" : "slide"}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalOverlay, isDesktop && styles.modalOverlayDesktop]}>
          <View style={[styles.modalContent, isDesktop && styles.modalContentDesktop]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('voice_selector.title')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            {/* Usage Info */}
            {audioUsage && (
              <Text style={styles.usageInfo}>
                {t('voice_selector.usage_info', { 
                  remaining: audioUsage.remaining, 
                  limit: audioUsage.limit 
                })}
              </Text>
            )}
            
            {/* Empty state */}
            {voices.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="volume-mute-outline" size={48} color={theme.colors.text.tertiary} />
                <Text style={styles.emptyStateText}>
                  No voices available
                </Text>
                <Text style={styles.emptyStateHint}>
                  Please check your internet connection and try again
                </Text>
              </View>
            )}

            {/* Voice List */}
            {voices.length > 0 && (
            <FlatList
              data={voices}
              keyExtractor={(item) => item.id}
              renderItem={({ item: voice }) => {
                const isSelected = selectedVoiceId === voice.id;
                const isLocked = voice.isLocked;
                
                if (isLocked) {
                  // Locked premium voice
                  return (
                    <View style={styles.voiceItemContainer}>
                      <View style={[styles.voiceItem, styles.lockedItem]}>
                        <View style={styles.voiceItemContent}>
                          <Text style={styles.voiceItemName}>
                            🔒 {voice.displayName} ⭐
                          </Text>
                          <Text style={styles.voiceItemGender}>
                            {t(`voice_selector.gender.${voice.gender}`)}
                          </Text>
                        </View>
                        
                        {onUpgrade && (
                          <TouchableOpacity
                            style={styles.modalUpgradeButton}
                            onPress={() => {
                              setModalVisible(false);
                              onUpgrade();
                            }}
                          >
                            <Text style={styles.modalUpgradeButtonText}>
                              {t('voice_selector.upgrade_to_unlock')}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      
                      {/* Play sample button for locked voice */}
                      {voice.sampleAudioUrl && (
                        <TouchableOpacity
                          style={styles.playButton}
                          onPress={() => handlePlaySample(voice)}
                        >
                          {loadingVoiceId === voice.id ? (
                            <Ionicons name="hourglass-outline" size={28} color={theme.colors.text.tertiary} />
                          ) : (
                            <Ionicons 
                              name={playingVoiceId === voice.id ? "pause-circle" : "play-circle"}
                              size={32}
                              color={theme.colors.interactive.primary}
                            />
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }
                
                // Available voice
                return (
                  <View style={styles.voiceItemContainer}>
                    <TouchableOpacity
                      style={[styles.voiceItem, isSelected && styles.voiceItemSelected]}
                      onPress={() => handleSelectVoice(voice)}
                    >
                      <View style={styles.voiceItemContent}>
                        <Text style={styles.voiceItemName}>
                          {voice.displayName} {voice.isPremium && '⭐'}
                        </Text>
                        <Text style={styles.voiceItemGender}>
                          {t(`voice_selector.gender.${voice.gender}`)}
                        </Text>
                      </View>
                      
                      {/* Selected checkmark inside card */}
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={24} color={theme.colors.interactive.primary} />
                      )}
                    </TouchableOpacity>
                    
                    {/* Play sample button outside card */}
                    {voice.sampleAudioUrl && (
                      <TouchableOpacity
                        style={styles.playButton}
                        onPress={() => handlePlaySample(voice)}
                      >
                        {loadingVoiceId === voice.id ? (
                          <Ionicons name="hourglass-outline" size={28} color={theme.colors.text.tertiary} />
                        ) : (
                          <Ionicons 
                            name={playingVoiceId === voice.id ? "pause-circle" : "play-circle"}
                            size={32}
                            color={theme.colors.interactive.primary}
                          />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
            )}

            {/* Close Button */}
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>{t('voice_selector.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // No margins/padding - fully compact
  },
  
  // Dropdown Button (collapsed state)
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  dropdownContent: {
    flex: 1,
  },
  dropdownText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  dropdownGender: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
  },
  
  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end', // Bottom sheet for mobile
  },
  modalOverlayDesktop: {
    justifyContent: 'center', // Center popup for desktop
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.background.primary,
    borderTopLeftRadius: theme.borders.radius.xl,
    borderTopRightRadius: theme.borders.radius.xl,
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[6],
    paddingHorizontal: theme.spacing[4],
    maxHeight: '80%',
  },
  modalContentDesktop: {
    borderRadius: theme.borders.radius.xl, // All corners rounded on desktop
    width: 600,
    maxWidth: '90%',
    maxHeight: '70%',
    // Shadow for desktop popup
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  
  // Modal Header
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  usageInfo: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[4],
  },
  
  // Voice Items in Modal
  voiceItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
    gap: theme.spacing[2],
  },
  voiceItem: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[3],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  voiceItemSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  lockedItem: {
    borderStyle: 'dashed',
    borderColor: theme.colors.border.medium,
    opacity: 0.8,
  },
  voiceItemContent: {
    flex: 1,
    marginRight: theme.spacing[2],
  },
  playButton: {
    padding: theme.spacing[1],
  },
  voiceItemName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  voiceItemGender: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
  },
  
  // Modal Upgrade Button
  modalUpgradeButton: {
    backgroundColor: theme.colors.warning[600],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
  },
  modalUpgradeButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  
  // Close Button
  closeButton: {
    backgroundColor: theme.colors.background.secondary,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    marginTop: theme.spacing[4],
  },
  closeButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[4],
    textAlign: 'center',
  },
  emptyStateHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[2],
    textAlign: 'center',
  },
});
