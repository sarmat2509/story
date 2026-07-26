import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '@/theme';

interface ChipSelectorProps {
  label: string;
  options: readonly string[] | string[];
  selected: string | string[] | undefined;
  onSelect: (value: string | string[]) => void;
  multiple?: boolean;
  max?: number;
  translationPrefix?: string;
  getTranslation?: (key: string) => string;
}

export const ChipSelector: React.FC<ChipSelectorProps> = ({
  label,
  options,
  selected,
  onSelect,
  multiple = false,
  max,
  translationPrefix,
  getTranslation,
}) => {
  const selectedArray = Array.isArray(selected) ? selected : selected ? [selected] : [];
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  const handlePress = (value: string) => {
    if (multiple) {
      const newSelected = selectedArray.includes(value)
        ? selectedArray.filter((v) => v !== value)
        : max && selectedArray.length >= max
          ? selectedArray
          : [...selectedArray, value];
      onSelect(newSelected);
    } else {
      onSelect(value);
    }
  };

  const isSelected = (value: string) => selectedArray.includes(value);
  const isDisabled = (value: string) => {
    return multiple && max !== undefined && selectedArray.length >= max && !isSelected(value);
  };

  const getLabel = (value: string): string => {
    if (getTranslation && translationPrefix) {
      return getTranslation(`${translationPrefix}.${value}`);
    }
    return value;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {max && multiple ? (
        <Text style={styles.hint}>
          {selectedArray.length} / {max}
        </Text>
      ) : null}
      <View style={styles.chipsContainer}>
        {options.map((option) => {
          const selected = isSelected(option);
          const disabled = isDisabled(option);

          return (
            <Pressable
              key={option}
              onPress={() => handlePress(option)}
              onHoverIn={() => !disabled && setHoveredOption(option)}
              onHoverOut={() => setHoveredOption((current) => (current === option ? null : current))}
              disabled={disabled}
              testID={`chip-selector-option-${option}`}
              style={[
                styles.chip,
                selected && styles.chipSelected,
                hoveredOption === option && !disabled && styles.chipHovered,
                hoveredOption === option && selected && styles.chipSelectedHovered,
                disabled && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  selected && styles.chipTextSelected,
                  disabled && styles.chipTextDisabled,
                ]}
              >
                {getLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing[4],
  },
  label: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  hint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[2],
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.secondary,
    marginRight: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  chipSelected: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  chipHovered: {
    backgroundColor: theme.colors.interactive.secondaryHover,
    borderColor: theme.colors.interactive.primaryHover,
  },
  chipSelectedHovered: {
    backgroundColor: theme.colors.interactive.primaryHover,
    borderColor: theme.colors.interactive.primaryHover,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
  },
  chipTextSelected: {
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.fontWeight.medium,
  },
  chipTextDisabled: {
    color: theme.colors.text.disabled,
  },
});
