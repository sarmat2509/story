import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';

interface FeedbackHeaderButtonProps {
  onPress: () => void;
  testID?: string;
}

export function FeedbackHeaderButton({
  onPress,
  testID = 'feedback-header-button',
}: FeedbackHeaderButtonProps) {
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.iconAction}
      accessibilityRole="button"
      accessibilityLabel={t('profile.report_problem')}
      testID={testID}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
    >
      <Ionicons name="bug-outline" size={22} color={theme.colors.text.tertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconAction: {
    minWidth: 40,
    height: 36,
    paddingHorizontal: theme.spacing[3],
    marginRight: theme.spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
});
