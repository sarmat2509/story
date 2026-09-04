import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Voice } from '@/api/voices';
import { theme } from '@/theme';
import VoiceSelector from '@/components/VoiceSelector';

interface AudioGenerationStarterProps {
  voices: Voice[];
  selectedVoiceId?: string;
  onVoiceChange: (voiceId: string) => void;
  language: string;
  userPlan: string;
  hasPremiumAccess: boolean;
  audioUsage?: { remaining: number; limit: number };
  audioFailed?: boolean;
  isGenerating?: boolean;
  jobStatus?: string | null;
  onGenerate?: () => void;
  onUpgrade?: () => void;
}

/** Voice selection and the first/retry audio-generation action. */
export function AudioGenerationStarter({
  voices, selectedVoiceId, onVoiceChange, language, userPlan, hasPremiumAccess, audioUsage,
  audioFailed = false, isGenerating = false, jobStatus, onGenerate = () => undefined,
  onUpgrade = () => undefined,
}: AudioGenerationStarterProps) {
  const { t } = useTranslation();
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId);

  return (
    <View>
      <VoiceSelector
        voices={voices}
        selectedVoiceId={selectedVoiceId}
        onVoiceChange={onVoiceChange}
        language={language}
        userPlan={userPlan}
        hasPremiumAccess={hasPremiumAccess}
        onUpgrade={onUpgrade}
        audioUsage={audioUsage}
      />
      {selectedVoice?.isLocked ? (
        <TouchableOpacity style={[styles.button, styles.upgradeButton]} onPress={onUpgrade}>
          <Text style={styles.buttonText}>⭐ {t('voice_selector.upgrade_to_unlock')}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.button, isGenerating && styles.buttonDisabled]}
          onPress={onGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <ActivityIndicator size="small" color="#fff" style={styles.buttonSpinner} />
              <Text style={styles.buttonText}>
                {jobStatus === 'queued'
                  ? t('story_viewer.audio_queued')
                  : t('story_viewer.audio_generating')}
              </Text>
            </>
          ) : (
            <Text style={styles.buttonText}>
              🎧 {audioFailed ? t('story_viewer.try_again') : t('story_viewer.create_audio')}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.interactive.primary, paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6], borderRadius: theme.spacing[3], flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing[4],
  },
  upgradeButton: { backgroundColor: theme.colors.warning[600] },
  buttonDisabled: { opacity: 0.6 },
  buttonSpinner: { marginRight: theme.spacing[2] },
  buttonText: {
    color: '#fff', fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold,
  },
});
