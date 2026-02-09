import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { IMAGE_STYLES, IMAGE_STYLE_METADATA } from '@kazka/shared';

interface Goal {
  slug: string;
  name: string;
}

interface Tone {
  slug: string;
  name: string;
}

interface ChildProfile {
  id: string;
  name: string;
}

interface Props {
  childProfileId?: string;
  onChildProfileChange: (id: string | undefined) => void;
  children?: ChildProfile[];
  onAddChild?: () => void;
  
  goals?: Goal[];
  selectedGoals?: string[];
  onGoalsChange: (goals: string[]) => void;
  
  tones?: Tone[];
  selectedTone?: string;
  onToneChange: (tone: string | undefined) => void;
  
  imageStyle?: string;
  onImageStyleChange: (style: string | undefined) => void;
  
  userNotes?: string;
  onNotesChange: (notes: string) => void;
}

export function AdvancedSettingsForm({
  childProfileId,
  onChildProfileChange,
  children = [],
  onAddChild,
  goals = [],
  selectedGoals = [],
  onGoalsChange,
  tones = [],
  selectedTone,
  onToneChange,
  imageStyle,
  onImageStyleChange,
  userNotes = '',
  onNotesChange,
}: Props) {
  const { t } = useTranslation();
  
  const toggleGoal = (goalSlug: string) => {
    if (selectedGoals.includes(goalSlug)) {
      onGoalsChange(selectedGoals.filter(g => g !== goalSlug));
    } else {
      onGoalsChange([...selectedGoals, goalSlug]);
    }
  };
  
  // Image style options
  const imageStyles = IMAGE_STYLES.map(slug => ({
    slug,
    name: t(IMAGE_STYLE_METADATA[slug].i18nKey),
    icon: IMAGE_STYLE_METADATA[slug].icon,
  }));

  return (
    <View style={styles.container}>
      {/* Child Profile Selector */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('wizard.story_for')}</Text>
          {onAddChild && (
            <TouchableOpacity onPress={onAddChild} style={styles.addButton}>
              <Ionicons name="add-circle" size={20} color={theme.colors.interactive.primary} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipsContainer}>
            <TouchableOpacity
              style={[
                styles.chip,
                !childProfileId && styles.chipSelected
              ]}
              onPress={() => onChildProfileChange(undefined)}
            >
              <Text style={[
                styles.chipText,
                !childProfileId && styles.chipTextSelected
              ]}>
                {t('wizard.no_profile')}
              </Text>
            </TouchableOpacity>
            {children.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.chip,
                  childProfileId === child.id && styles.chipSelected
                ]}
                onPress={() => onChildProfileChange(child.id)}
              >
                <Text style={[
                  styles.chipText,
                  childProfileId === child.id && styles.chipTextSelected
                ]}>
                  {child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Goals Selector */}
      {goals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('wizard.goal_label')}</Text>
          <View style={styles.chipsContainer}>
            {goals.map((goal) => (
              <TouchableOpacity
                key={goal.slug}
                style={[
                  styles.chip,
                  selectedGoals.includes(goal.slug) && styles.chipSelected
                ]}
                onPress={() => toggleGoal(goal.slug)}
              >
                <Text style={[
                  styles.chipText,
                  selectedGoals.includes(goal.slug) && styles.chipTextSelected
                ]}>
                  {goal.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Tone Selector */}
      {tones.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('wizard.tone_label')}</Text>
          <View style={styles.chipsContainer}>
            {tones.map((tone) => (
              <TouchableOpacity
                key={tone.slug}
                style={[
                  styles.chip,
                  selectedTone === tone.slug && styles.chipSelected
                ]}
                onPress={() => onToneChange(selectedTone === tone.slug ? undefined : tone.slug)}
              >
                <Text style={[
                  styles.chipText,
                  selectedTone === tone.slug && styles.chipTextSelected
                ]}>
                  {tone.name}
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
              style={[
                styles.chip,
                imageStyle === style.slug && styles.chipSelected
              ]}
              onPress={() => onImageStyleChange(imageStyle === style.slug ? undefined : style.slug)}
            >
              <Text style={styles.styleIcon}>{style.icon}</Text>
              <Text style={[
                styles.chipText,
                imageStyle === style.slug && styles.chipTextSelected
              ]}>
                {style.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Notes Input */}
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
        />
        <Text style={styles.charCount}>{userNotes.length}/500</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[5],
  },
  section: {
    marginBottom: theme.spacing[2],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  sectionLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
  },
  sectionHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[3],
  },
  addButton: {
    padding: theme.spacing[1],
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    gap: theme.spacing[2],
  },
  chipSelected: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  chipText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  chipTextSelected: {
    color: theme.colors.text.inverse,
  },
  styleIcon: {
    fontSize: 18,
  },
  textInput: {
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    minHeight: 100,
  },
  charCount: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[1],
    textAlign: 'right',
  },
});
