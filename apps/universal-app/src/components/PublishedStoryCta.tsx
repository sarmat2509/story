import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

interface PublishedStoryCtaProps {
  slug: string;
  isAuthenticated: boolean;
  /** When true, used in sidebar (reduces top margin) */
  inSidebar?: boolean;
}

/**
 * CTA block for unauthenticated users viewing a published story.
 * "Увійти та створити" - sign in and create your own story.
 */
export function PublishedStoryCta({ slug, isAuthenticated, inSidebar }: PublishedStoryCtaProps) {
  const { t } = useTranslation();

  if (isAuthenticated) {
    return null;
  }

  const loginUrl = `/login?redirect=${encodeURIComponent(`/stories/${slug}`)}`;

  const handlePress = () => {
    Linking.openURL(loginUrl);
  };

  return (
    <View style={[styles.container, inSidebar && styles.containerSidebar]}>
      <View style={styles.iconContainer}>
        <Ionicons name="sparkles-outline" size={40} color={theme.colors.interactive.primary} />
      </View>
      <Text style={styles.title}>{t('published_story.cta_title')}</Text>
      <Text style={styles.description}>{t('published_story.cta_description')}</Text>
      <TouchableOpacity style={styles.button} onPress={handlePress} activeOpacity={0.7}>
        <Text style={styles.buttonText}>{t('published_story.cta_button')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[6],
    marginTop: theme.spacing[8],
    alignItems: 'center',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  containerSidebar: {
    marginTop: 0,
  },
  iconContainer: {
    marginBottom: theme.spacing[4],
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
    marginBottom: theme.spacing[6],
  },
  button: {
    backgroundColor: theme.colors.interactive.primary,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
  },
  buttonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
});
