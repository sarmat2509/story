import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { useAuthStore } from '@/store/authStore';
import apiClient from '@/api/client';

interface ModeCardProps {
  mode: 'instant' | 'artisan';
  icon: 'instant' | 'artisan';
  title: string;
  description: string;
  features: string[];
  selected: boolean;
  onPress: () => void;
}

const InstantIcon = () => (
  <View style={styles.instantIcon}>
    <View style={[styles.lightning, styles.lightningYellow]} />
    <View style={[styles.lightning, styles.lightningOrange]} />
  </View>
);

const ArtisanIcon = () => (
  <View style={styles.artisanIcon}>
    <View style={[styles.colorDot, styles.dotPurple]} />
    <View style={[styles.colorDot, styles.dotBlue]} />
    <View style={[styles.colorDot, styles.dotPink]} />
    <View style={[styles.colorDot, styles.dotGreen]} />
  </View>
);

const ModeCard: React.FC<ModeCardProps> = ({
  selected,
  onPress,
  icon,
  title,
  description,
  features,
}) => (
  <TouchableOpacity
    style={[styles.card, selected && styles.cardSelected]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={styles.radioContainer}>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </View>

    <View style={styles.iconContainer}>
      {icon === 'instant' ? <InstantIcon /> : <ArtisanIcon />}
    </View>

    <Text style={styles.cardTitle}>{title}</Text>

    <Text style={styles.cardDescription}>{description}</Text>

    <View style={styles.featuresList}>
      {features.map((feature, idx) => (
        <View key={idx} style={styles.featureItem}>
          <Text style={styles.featureBullet}>•</Text>
          <Text style={styles.featureText}>{feature}</Text>
        </View>
      ))}
    </View>
  </TouchableOpacity>
);

export default function ModeSelectionScreen() {
  const navigation = useNavigation<any>();
  const { user, setUser } = useAuthStore();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const [selectedMode, setSelectedMode] = useState<'instant' | 'artisan' | null>(user?.mode || null);
  const [isSaving, setIsSaving] = useState(false);

  const isTablet = width >= 768;
  const isFromProfile = user?.mode !== undefined; // If user already has mode, they came from profile

  const handleSave = async () => {
    if (!selectedMode || isSaving) return;

    setIsSaving(true);
    try {
      const response = await apiClient.patch<{ status: string; user: any }>('/api/v1/me', {
        mode: selectedMode,
      });

      if (response.data.user) {
        setUser(response.data.user);
        
        // If from profile, go back. If first time, navigate to Main
        if (isFromProfile) {
          navigation.goBack();
        } else {
          navigation.replace('Main');
        }
      }
    } catch (error) {
      console.error('Failed to save mode:', error);
      // TODO: Show toast error
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.contentWrapper}>
        <Text style={styles.title}>{t('mode_selection.title')}</Text>

        <View style={[styles.cardsContainer, isTablet && styles.cardsContainerRow]}>
          <ModeCard
            mode="instant"
            icon="instant"
            title={t('mode_selection.instant_mode')}
            description={t('mode_selection.instant_description')}
            features={[
              t('mode_selection.instant_feature_1'),
              t('mode_selection.instant_feature_2'),
            ]}
            selected={selectedMode === 'instant'}
            onPress={() => setSelectedMode('instant')}
          />

          <ModeCard
            mode="artisan"
            icon="artisan"
            title={t('mode_selection.artisan_mode')}
            description={t('mode_selection.artisan_description')}
            features={[
              t('mode_selection.artisan_feature_1'),
              t('mode_selection.artisan_feature_2'),
              t('mode_selection.artisan_feature_3'),
            ]}
            selected={selectedMode === 'artisan'}
            onPress={() => setSelectedMode('artisan')}
          />
        </View>

        <Text style={styles.subtitle}>{t('mode_selection.can_change_later')}</Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.saveButton, !selectedMode && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!selectedMode || isSaving}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator color={theme.colors.text.inverse} />
            ) : (
              <Text style={[styles.saveButtonText, !selectedMode && styles.saveButtonTextDisabled]}>
                {t('common.save')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[6],
    paddingHorizontal: theme.spacing[6],
    minHeight: '100%',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 900,
    alignItems: 'center',
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[8],
  },
  cardsContainer: {
    width: '100%',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  cardsContainerRow: {
    flexDirection: 'row',
    gap: theme.spacing[6],
  },
  card: {
    flex: 1,
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.primary,
    minHeight: 280,
    position: 'relative',
  },
  cardSelected: {
    borderColor: theme.colors.interactive.primary,
  },
  radioContainer: {
    position: 'absolute',
    top: theme.spacing[4],
    left: theme.spacing[4],
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border.medium,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: theme.colors.interactive.primary,
  },
  radioInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.interactive.primary,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: theme.spacing[8],
    marginBottom: theme.spacing[4],
  },
  // Instant Icon - Lightning bolts
  instantIcon: {
    width: 60,
    height: 60,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightning: {
    position: 'absolute',
    width: 24,
    height: 48,
    transform: [{ rotate: '15deg' }],
  },
  lightningYellow: {
    backgroundColor: '#FCD34D',
    left: 10,
  },
  lightningOrange: {
    backgroundColor: '#FB923C',
    right: 10,
    transform: [{ rotate: '-15deg' }],
  },
  // Artisan Icon - Color palette dots
  artisanIcon: {
    width: 60,
    height: 60,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  dotPurple: {
    backgroundColor: '#A78BFA',
  },
  dotBlue: {
    backgroundColor: '#60A5FA',
  },
  dotPink: {
    backgroundColor: '#F472B6',
  },
  dotGreen: {
    backgroundColor: '#34D399',
  },
  cardTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  cardDescription: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[4],
    lineHeight: theme.typography.lineHeight.normal * theme.typography.fontSize.base,
  },
  featuresList: {
    gap: theme.spacing[2],
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
  },
  featureBullet: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    lineHeight: theme.typography.lineHeight.normal * theme.typography.fontSize.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  saveButton: {
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[12],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 200,
  },
  saveButtonDisabled: {
    backgroundColor: theme.colors.background.tertiary,
  },
  saveButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  saveButtonTextDisabled: {
    color: theme.colors.text.disabled,
  },
});
