import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';

interface FeedbackHeaderButtonProps {
  onPress: () => void;
  testID?: string;
  action?: 'bug' | 'generatedContent';
}

export function FeedbackHeaderButton({
  onPress,
  testID = 'feedback-header-button',
  action = 'bug',
}: FeedbackHeaderButtonProps) {
  const { t } = useTranslation();
  const isContentReport = action === 'generatedContent';
  const expansion = useRef(new Animated.Value(0)).current;
  const [labelWidth, setLabelWidth] = useState(0);
  const label = isContentReport ? t('feedback.content_report_title') : t('profile.report_problem');

  const setExpanded = (expanded: boolean) => {
    Animated.timing(expansion, {
      toValue: expanded ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  };

  const expandedWidth = labelWidth > 0 ? Math.ceil(labelWidth + 48) : isContentReport ? 216 : 184;
  const animatedWidth = expansion.interpolate({
    inputRange: [0, 1],
    outputRange: [44, expandedWidth],
  });
  const animatedIconTranslateX = expansion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 19 - expandedWidth / 2],
  });

  return (
    <Animated.View style={[styles.animatedContainer, { width: animatedWidth }]}>
      <Pressable
        onPress={onPress}
        style={[styles.iconAction, styles.fullWidth]}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        onHoverIn={() => setExpanded(true)}
        onHoverOut={() => setExpanded(false)}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
      >
        <Animated.View style={{ transform: [{ translateX: animatedIconTranslateX }] }}>
          <Ionicons
            name={isContentReport ? 'flag-outline' : 'bug-outline'}
            size={22}
            color={theme.colors.text.tertiary}
          />
        </Animated.View>
        <Animated.Text
          numberOfLines={1}
          onLayout={(event) => setLabelWidth(event.nativeEvent.layout.width)}
          style={[styles.label, { opacity: expansion }]}
        >
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  iconAction: {
    height: 36,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    overflow: 'hidden',
  },
  animatedContainer: {
    height: 36,
    marginRight: theme.spacing[2],
    overflow: 'hidden',
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    position: 'absolute',
    left: 38,
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
