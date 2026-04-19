import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import {
  THEME_PALETTE_IDS,
  type ThemePaletteId,
  DEFAULT_THEME_PALETTE_ID,
} from '@wondertales/shared';
import { theme } from '@/theme';
import { PALETTE_META } from '@/theme/palettes';
import { getActivePaletteId, setActivePaletteId } from '@/theme/activePalette';
import { reloadApp } from '@/utils/reloadApp';
import { useUpdateMe } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import type { MainDrawerParamList } from '@/types/navigation';

export default function ThemeSettingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { user } = useAuthStore();

  const initialPaletteId = useMemo<ThemePaletteId>(() => {
    const fromUser = user?.themePalette as ThemePaletteId | undefined;
    return fromUser ?? getActivePaletteId() ?? DEFAULT_THEME_PALETTE_ID;
  }, [user?.themePalette]);

  const [selectedId, setSelectedId] = useState<ThemePaletteId>(initialPaletteId);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const updateMe = useUpdateMe();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />
      ),
    });
  }, [navigation]);

  const handleSelect = async (paletteId: ThemePaletteId) => {
    if (updateMe.isPending || selectedId === paletteId) return;

    const previous = selectedId;
    setSelectedId(paletteId);
    try {
      // Persist on backend first — if it fails we keep the previous palette.
      await updateMe.mutateAsync({ themePalette: paletteId });
      // Write to synchronous local storage so the next cold boot picks it up.
      setActivePaletteId(paletteId);
      // Reload the whole app so `StyleSheet.create()` re-evaluates with new colors.
      reloadApp();
    } catch (error) {
      setSelectedId(previous);
      Alert.alert(t('theme.restart_required_title'), t('theme.save_error'));
    }
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('theme.title')}</Text>
        <Text style={styles.description}>{t('theme.subtitle')}</Text>

        <View style={styles.grid}>
          {THEME_PALETTE_IDS.map((paletteId) => {
            const meta = PALETTE_META[paletteId];
            const isSelected = selectedId === paletteId;
            const isBusy = updateMe.isPending && isSelected;

            return (
              <TouchableOpacity
                key={paletteId}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => handleSelect(paletteId)}
                disabled={updateMe.isPending}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: updateMe.isPending }}
                accessibilityLabel={t(meta.labelKey)}
              >
                <View style={styles.cardRow}>
                  <View style={styles.swatches}>
                    {meta.swatches.map((color, idx) => (
                      <View
                        key={`${paletteId}-${idx}`}
                        style={[styles.swatch, { backgroundColor: color }]}
                      />
                    ))}
                  </View>
                  <View style={styles.cardText}>
                    <Text
                      style={[styles.cardName, isSelected && styles.cardNameSelected]}
                      numberOfLines={1}
                    >
                      {t(meta.labelKey)}
                    </Text>
                    {isSelected && (
                      <Text style={styles.cardCurrent}>{t('theme.current')}</Text>
                    )}
                  </View>
                  <View style={styles.cardTrailing}>
                    {isBusy ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.interactive.primary}
                      />
                    ) : isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={theme.colors.interactive.primary}
                      />
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="profile"
      />
    </>
  );
}

const SWATCH_SIZE = 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  content: {
    padding: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[6],
  },
  grid: {
    gap: theme.spacing[3],
  },
  card: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  cardSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatches: {
    flexDirection: 'row',
    marginRight: theme.spacing[3],
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    marginLeft: -SWATCH_SIZE / 3,
    borderWidth: 2,
    borderColor: theme.colors.white,
  },
  cardText: {
    flex: 1,
    marginLeft: theme.spacing[2],
  },
  cardName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  cardNameSelected: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  cardCurrent: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: 2,
  },
  cardTrailing: {
    width: 28,
    alignItems: 'flex-end',
  },
});
