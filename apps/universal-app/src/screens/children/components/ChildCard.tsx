import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';

interface Child {
  id: string;
  name: string;
  birthDate?: string;
  birthdate?: string;
  turnaroundSheet?: { url: string; frontUrl?: string };
  referencePhotos?: Array<{ url: string }>;
}

interface Props {
  child: Child;
  onPress: () => void;
  onDelete?: (childId: string, childName: string) => void;
}

export function ChildCard({ child, onPress, onDelete }: Props) {
  const avatarUrl =
    child.turnaroundSheet?.frontUrl ?? child.turnaroundSheet?.url ?? child.referencePhotos?.[0]?.url;
  const birthDateRaw = child.birthDate ?? child.birthdate;
  const subline = birthDateRaw
    ? (() => {
        const date = new Date(birthDateRaw);
        return !isNaN(date.getTime()) ? date.toLocaleDateString() : '';
      })()
    : '';

  return (
    <View style={styles.cardWrapper}>
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.imageContainer}>
          {avatarUrl ? (
            <Image
              source={{ uri: formatAssetUrl(avatarUrl) ?? avatarUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>👶</Text>
            </View>
          )}
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {child.name}
        </Text>
        {subline ? (
          <Text style={styles.subline} numberOfLines={1}>
            {subline}
          </Text>
        ) : null}
      </TouchableOpacity>

      {onDelete && (
        <Pressable
          style={(state: { pressed: boolean }) => [
            styles.deleteButton,
            state.pressed && styles.deleteButtonPressed,
          ]}
          onPress={() => onDelete(child.id, child.name)}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    position: 'relative',
  },
  card: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.lg,
    overflow: 'hidden',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    padding: theme.spacing[6],
  },
  imageContainer: {
    height: '180px',
    width: '100%',
    alignSelf: 'center',
    backgroundColor: theme.colors.background.primary,
    ...(Platform.OS === 'web' && { filter: 'contrast(1.05)' }),
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 64,
  },
  name: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    paddingTop: theme.spacing[4],
  },
  subline: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: theme.spacing[1],
  },
  deleteButton: {
    position: 'absolute',
    top: theme.spacing[2],
    right: theme.spacing[2],
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    borderRadius: theme.borders.radius.full,
    padding: theme.spacing[2],
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  deleteButtonPressed: {
    backgroundColor: 'rgba(185, 28, 28, 0.9)',
  },
});
