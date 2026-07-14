import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { modernColors } from '@/theme/modernTheme';

interface StoryCreationNoticeProps {
  testID?: string;
}

export function StoryCreationNotice({
  testID = 'story-creation-notice',
}: StoryCreationNoticeProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container} testID={testID}>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setExpanded((current) => !current)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID={`${testID}-toggle`}
      >
        <Ionicons name="sparkles-outline" size={16} color={theme.colors.text.tertiary} />
        <Text style={styles.title}>
          {t('wizard.ai_generation_notice_title', { defaultValue: 'About AI generation' })}
          {' · '}
          {t('image_rights.title', { defaultValue: 'Confirm image rights' })}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.colors.text.tertiary}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.content}>
          <Text style={styles.text}>
            {t('wizard.ai_generation_notice', {
              defaultValue:
                'Your content will be created with AI. Minor image or text generation errors may occasionally appear, so a quick adult review of the result is recommended.',
            })}
          </Text>
          <Text style={styles.text}>
            <Text style={styles.confirmationLead}>
              {t('image_rights.confirm', { defaultValue: 'I confirm' })}.{' '}
            </Text>
            {t('image_rights.rights_statement', {
              defaultValue: 'I have the legal right to use this image.',
            })}{' '}
            {t('image_rights.child_statement', {
              defaultValue:
                "If the image includes a child, I am the child's parent/legal guardian or have permission from the parent/legal guardian.",
            })}{' '}
            {t('image_rights.public_figures_statement', {
              defaultValue:
                'I will not upload images of public figures or other people without permission.',
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing[2],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: modernColors.border,
    gap: theme.spacing[2],
  },
  toggle: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    lineHeight: 18,
    color: theme.colors.text.tertiary,
  },
  content: {
    gap: theme.spacing[2],
  },
  text: {
    fontSize: theme.typography.fontSize.xs,
    lineHeight: 18,
    color: theme.colors.text.tertiary,
  },
  confirmationLead: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
  },
});
