import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/theme';
import { useAuthStore } from '@/store/authStore';
import apiClient from '@/api/client';
import { GradientButton } from '@/components/GradientButton';
import { GlassCard } from '@/components/GlassCard';
import { AnimatedSection } from '@/components/AnimatedSection';
import { InteractiveSurface } from '@/components/InteractiveSurface';
import { useScreenEnter } from '@/hooks/useScreenEnter';
interface ModeCardProps {
  mode: 'instant' | 'artisan';
  icon: 'instant' | 'artisan';
  title: string;
  description: string;
  features: string[];
  selected: boolean;
  onPress: () => void;
}

const InstantIcon = ({ selected }: { selected: boolean }) => (
  <View style={[styles.modeIconCircle, selected && styles.modeIconCircleSelected]}>
    <Ionicons
      name="flash"
      size={32}
      color={selected ? theme.colors.interactive.primary : theme.colors.text.secondary}
    />
  </View>
);

const ArtisanIcon = ({ selected }: { selected: boolean }) => (
  <View style={[styles.modeIconCircle, selected && styles.modeIconCircleSelected]}>
    <Ionicons
      name="color-palette"
      size={32}
      color={selected ? theme.colors.interactive.primary : theme.colors.text.secondary}
    />
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
  <InteractiveSurface
    onPress={onPress}
    style={styles.cardPressable}
    accessibilityLabel={title}
  >
    <GlassCard
      intensity={selected ? 'strong' : 'soft'}
      style={[styles.card, selected && styles.cardSelected]}
    >
      {selected && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(169, 156, 224, 0.35)', 'rgba(242, 138, 94, 0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={styles.radioContainer}>
        <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
          {selected && <View style={styles.radioInner} />}
        </View>
      </View>

      <View style={styles.iconContainer}>
        {icon === 'instant' ? <InstantIcon selected={selected} /> : <ArtisanIcon selected={selected} />}
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
    </GlassCard>
  </InteractiveSurface>
);

export default function ModeSelectionScreen() {
  const { user, setUser } = useAuthStore();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const [selectedMode, setSelectedMode] = useState<'instant' | 'artisan' | null>(user?.mode || null);
  const [isSaving, setIsSaving] = useState(false);
  const enterKey = useScreenEnter();

  const isTablet = width >= 768;

  const handleSave = async () => {
    if (!selectedMode || isSaving) return;

    setIsSaving(true);
    try {
      const response = await apiClient.patch<{ status: string; user: any }>('/api/v1/me', {
        mode: selectedMode,
      });

      if (response.data.user) {
        setUser(response.data.user);
        const { getAnalytics } = await import('@/services/analytics');
        getAnalytics().capture('mode_selected', { mode: selectedMode });
        // Navigation will happen automatically via RootNavigator's conditional rendering
        // when user.mode is set, needsModeSelection becomes false
      }
    } catch (error) {
      console.error('Failed to save mode:', error);
      // TODO: Show toast error
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <LinearGradient
      colors={['#E9DFFA', '#F4EEFB', '#FDEDEA', '#FDF5E6']}
      locations={[0, 0.35, 0.7, 1]}
      style={styles.container}
    >
      <View pointerEvents="none" style={styles.bokehOne} />
      <View pointerEvents="none" style={styles.bokehTwo} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrapper}>
          <AnimatedSection delay={0} trigger={enterKey}>
            <Text style={styles.title}>{t('mode_selection.title')}</Text>
          </AnimatedSection>

          <AnimatedSection delay={120} trigger={enterKey} style={styles.cardsAnimWrapper}>
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
          </AnimatedSection>

          <AnimatedSection delay={240} trigger={enterKey}>
            <Text style={styles.subtitle}>{t('mode_selection.can_change_later')}</Text>

            <View style={styles.buttonContainer}>
              <GradientButton
                label={t('common.save')}
                onPress={handleSave}
                disabled={!selectedMode}
                loading={isSaving}
                style={styles.saveButton}
              />
            </View>
          </AnimatedSection>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bokehOne: {
    position: 'absolute',
    top: -160,
    right: -140,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(169, 156, 224, 0.28)',
  },
  bokehTwo: {
    position: 'absolute',
    bottom: -180,
    left: -140,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(242, 138, 94, 0.18)',
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
  cardsAnimWrapper: {
    width: '100%',
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
  cardPressable: {
    flex: 1,
    borderRadius: theme.borders.radius.xl,
  },
  card: {
    padding: theme.spacing[6],
    minHeight: 280,
    position: 'relative',
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: 'rgba(123, 102, 199, 0.55)',
    ...Platform.select({
      ios: {
        shadowColor: '#3B2E6E',
        shadowOpacity: 0.22,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 16 },
      },
      android: { elevation: 8 },
      web: {
        boxShadow: '0 24px 44px -18px rgba(59, 46, 110, 0.42)' as unknown as string,
      },
    }),
  },
  radioContainer: {
    position: 'absolute',
    top: theme.spacing[4],
    left: theme.spacing[4],
    zIndex: 1,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border.medium,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
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
  modeIconCircle: {
    width: 64,
    height: 64,
    borderRadius: theme.borders.radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#3B2E6E',
        shadowOpacity: 0.15,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 3 },
      web: {
        boxShadow: '0 14px 26px -12px rgba(59, 46, 110, 0.35)' as unknown as string,
      },
    }),
  },
  modeIconCircleSelected: {
    backgroundColor: 'rgba(233, 223, 250, 0.95)',
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
    minWidth: 220,
  },
});
