import React, { useState } from 'react';
import {
  Pressable,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

interface TagsInputProps {
  label: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  suggestions?: readonly string[] | string[];
  max?: number;
  placeholder?: string;
}

export const TagsInput: React.FC<TagsInputProps> = ({
  label,
  tags,
  onTagsChange,
  suggestions = [],
  max,
  placeholder = 'Add tag...',
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hoveredSuggestion, setHoveredSuggestion] = useState<string | null>(null);

  const filteredSuggestions = suggestions.filter(
    (s) => !tags.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed) && (!max || tags.length < max)) {
      onTagsChange([...tags, trimmed]);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const removeTag = (index: number) => {
    onTagsChange(tags.filter((_, i) => i !== index));
  };

  const handleInputChange = (text: string) => {
    setInputValue(text);
    setShowSuggestions(text.length > 0 && filteredSuggestions.length > 0);
  };

  const handleSubmit = () => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  };

  const isMaxReached = max !== undefined && tags.length >= max;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {max && (
        <Text style={styles.hint}>
          {tags.length} / {max}
        </Text>
      )}

      {/* Existing Tags */}
      {tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {tags.map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
              <TouchableOpacity
                onPress={() => removeTag(index)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={16} color={theme.colors.text.inverse} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Input */}
      {!isMaxReached && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputValue}
            onChangeText={handleInputChange}
            onSubmitEditing={handleSubmit}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.text.secondary}
            returnKeyType="done"
          />
          {inputValue.length > 0 && (
            <TouchableOpacity onPress={handleSubmit} style={styles.addButton}>
              <Ionicons name="add-circle" size={24} color={theme.colors.interactive.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Suggestions */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {filteredSuggestions.map((suggestion, index) => (
            <Pressable
              key={index}
              onPress={() => addTag(suggestion)}
              onHoverIn={() => setHoveredSuggestion(suggestion)}
              onHoverOut={() =>
                setHoveredSuggestion((current) => (current === suggestion ? null : current))
              }
              testID={`tags-input-suggestion-${suggestion}`}
              style={[
                styles.suggestion,
                hoveredSuggestion === suggestion && styles.suggestionHovered,
              ]}
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      )}
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
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.interactive.primary,
    marginRight: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  tagText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.fontWeight.medium,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    borderRadius: theme.borders.radius.md,
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.background.secondary,
  },
  input: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  addButton: {
    marginLeft: theme.spacing[2],
  },
  suggestionsContainer: {
    marginTop: theme.spacing[2],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  suggestion: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.secondary,
    marginRight: theme.spacing[2],
  },
  suggestionHovered: {
    backgroundColor: theme.colors.interactive.secondaryHover,
    borderColor: theme.colors.interactive.primaryHover,
  },
  suggestionText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.primary,
  },
});
