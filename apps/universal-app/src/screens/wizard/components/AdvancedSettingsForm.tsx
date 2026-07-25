import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { IMAGE_STYLES, IMAGE_STYLE_METADATA, type ImageStyle } from '@wondertales/shared';

interface Goal {
  slug: string;
  name: string;
}

interface ChildProfile {
  id: string;
  name: string;
}

interface Props {
  childProfileId?: string;
  onChildProfileChange: (id: string) => void;
  children?: ChildProfile[];
  onAddChild?: () => void;
  showChildProfileSelector?: boolean;

  goals?: Goal[];
  selectedGoals?: string[];
  onGoalsChange: (goals: string[]) => void;

  imageStyle?: ImageStyle;
  onImageStyleChange: (style: ImageStyle | undefined) => void;

  userNotes?: string;
  onNotesChange: (notes: string) => void;
  notesEnabled?: boolean;
  compactAddChild?: boolean;
}

export function AdvancedSettingsForm({
  childProfileId,
  onChildProfileChange,
  children = [],
  onAddChild,
  showChildProfileSelector = true,
  goals = [],
  selectedGoals = [],
  onGoalsChange,
  imageStyle,
  onImageStyleChange,
  userNotes = '',
  onNotesChange,
  notesEnabled = true,
  compactAddChild = false,
}: Props) {
  const { t } = useTranslation();

  const toggleGoal = (goalSlug: string) => {
    if (selectedGoals.includes(goalSlug)) {
      onGoalsChange(selectedGoals.filter((g) => g !== goalSlug));
    } else {
      onGoalsChange([...selectedGoals, goalSlug]);
    }
  };

  // Image style options
  const imageStyles = IMAGE_STYLES.map((slug) => ({
    slug,
    name: t(IMAGE_STYLE_METADATA[slug].i18nKey),
    icon: IMAGE_STYLE_METADATA[slug].icon,
  }));

  return (
    <View style={styles.container}>
      {/* Child Profile Selector */}
      {showChildProfileSelector && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('wizard.story_for')}</Text>
          {children.length === 0 ? (
            <View style={styles.profileRequiredNotice} testID="wizard-child-profile-required">
              <View style={styles.profileRequiredIcon}>
                <Ionicons
                  name="sparkles-outline"
                  size={20}
                  color={theme.colors.interactive.primary}
                />
              </View>
              <View style={styles.profileRequiredCopy}>
                <Text style={styles.profileRequiredTitle}>{t('wizard.child_profile_required')}</Text>
                <Text style={styles.profileRequiredDescription}>
                  {t('wizard.child_profile_required_hint')}
                </Text>
              </View>
              {onAddChild ? (
                <TouchableOpacity
                  onPress={onAddChild}
                  style={styles.profileRequiredAction}
                  accessibilityRole="button"
                  accessibilityLabel={t('wizard.create_child_profile')}
                  testID="wizard-add-child"
                >
                  <Ionicons name="add" size={18} color={theme.colors.text.inverse} />
                  <Text style={styles.profileRequiredActionText}>
                    {t('wizard.create_child_profile')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={styles.profileSelectorRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.profileChipsScroll}
                contentContainerStyle={styles.profileChipsContent}
              >
                {children.map((child) => (
                  <TouchableOpacity
                    key={child.id}
                    style={[styles.chip, childProfileId === child.id && styles.chipSelected]}
                    onPress={() => onChildProfileChange(child.id)}
                    testID={`wizard-child-${child.id}`}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        childProfileId === child.id && styles.chipTextSelected,
                      ]}
                    >
                      {child.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {onAddChild && (
                <TouchableOpacity
                  onPress={onAddChild}
                  style={[
                    styles.chip,
                    styles.addProfileChip,
                    compactAddChild && styles.addProfileChipCompact,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('wizard.create_child_profile')}
                  testID="wizard-add-child"
                >
                  <Ionicons name="add-circle" size={20} color={theme.colors.interactive.primary} />
                  {!compactAddChild ? (
                    <Text style={[styles.chipText, styles.addProfileChipText]}>
                      {t('wizard.create_child_profile')}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Goals Selector */}
      {goals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('wizard.goal_label')}</Text>
          <View style={styles.chipsContainer}>
            {goals.map((goal) => (
              <TouchableOpacity
                key={goal.slug}
                style={[styles.chip, selectedGoals.includes(goal.slug) && styles.chipSelected]}
                onPress={() => toggleGoal(goal.slug)}
                testID={`wizard-goal-${goal.slug}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedGoals.includes(goal.slug) && styles.chipTextSelected,
                  ]}
                >
                  {goal.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Image Style Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('wizard.image_style_label')}</Text>
        <Text style={styles.sectionHint}>{t('wizard.image_style_hint')}</Text>
        <View style={styles.chipsContainer}>
          {imageStyles.map((style) => (
            <TouchableOpacity
              key={style.slug}
              style={[styles.chip, imageStyle === style.slug && styles.chipSelected]}
              onPress={() => onImageStyleChange(imageStyle === style.slug ? undefined : style.slug)}
              testID={`wizard-image-style-${style.slug}`}
            >
              <Text style={styles.styleIcon}>{style.icon}</Text>
              <Text style={[styles.chipText, imageStyle === style.slug && styles.chipTextSelected]}>
                {style.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Notes Input */}
      {notesEnabled && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('wizard.notes_label')}</Text>
          <TextInput
            style={styles.textInput}
            placeholder={t('wizard.notes_placeholder')}
            placeholderTextColor={theme.colors.text.disabled}
            value={userNotes}
            onChangeText={onNotesChange}
            multiline
            numberOfLines={4}
            maxLength={500}
            textAlignVertical="top"
            testID="wizard-notes"
          />
          <Text style={styles.charCount}>{userNotes.length}/500</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[8],
  },
  section: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  profileSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  profileChipsScroll: {
    flex: 1,
    minWidth: 0,
  },
  profileChipsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingRight: theme.spacing[1],
  },
  profileRequiredNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.xl,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.tertiary,
  },
  profileRequiredIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borders.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  profileRequiredCopy: {
    flex: 1,
    gap: theme.spacing[1],
  },
  profileRequiredTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  profileRequiredDescription: {
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  profileRequiredAction: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.interactive.primary,
  },
  profileRequiredActionText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  sectionLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  sectionHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginTop: -theme.spacing[3],
    lineHeight: 20,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
  },
  chip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    gap: theme.spacing[2],
  },
  addProfileChip: {
    flexShrink: 0,
    borderColor: theme.colors.interactive.primary,
  },
  addProfileChipCompact: {
    width: 48,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  addProfileChipText: {
    color: theme.colors.interactive.primary,
    flexShrink: 0,
  },
  chipSelected: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  chipText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  chipTextSelected: {
    color: theme.colors.text.inverse,
  },
  styleIcon: {
    fontSize: 22,
  },
  textInput: {
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    minHeight: 132,
    lineHeight: 24,
  },
  charCount: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
    textAlign: 'right',
  },
});
