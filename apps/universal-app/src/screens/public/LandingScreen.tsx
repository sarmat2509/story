import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';

export default function LandingScreen() {
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.title}>WonderTales</Text>
        <Text style={styles.subtitle}>
          Personalized Illustrated Fairy Tales for Your Children
        </Text>
        <Text style={styles.description}>
          Create magical, AI-generated stories tailored to your child's interests,
          complete with beautiful illustrations and natural voice narration.
        </Text>
      </View>

      <View style={styles.features}>
        <Text style={styles.featuresTitle}>Key Features</Text>
        
        <View style={styles.feature}>
          <Text style={styles.featureTitle}>🎨 Personalized Stories</Text>
          <Text style={styles.featureText}>
            Every story is unique, created just for your child
          </Text>
        </View>

        <View style={styles.feature}>
          <Text style={styles.featureTitle}>🖼️ Beautiful Illustrations</Text>
          <Text style={styles.featureText}>
            AI-generated artwork brings each story to life
          </Text>
        </View>

        <View style={styles.feature}>
          <Text style={styles.featureTitle}>🎙️ Voice Narration</Text>
          <Text style={styles.featureText}>
            Natural voice narration in multiple languages
          </Text>
        </View>

        <View style={styles.feature}>
          <Text style={styles.featureTitle}>📚 Story Library</Text>
          <Text style={styles.featureText}>
            Save and revisit your favorite stories anytime
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {!isAuthenticated && (
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => navigation.navigate('Welcome')}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate('Stories')}
        >
          <Text style={styles.secondaryButtonText}>{t('navigation.published_stories')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate('Plans')}
        >
          <Text style={styles.secondaryButtonText}>View Pricing</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  content: {
    padding: theme.spacing[6],
    alignItems: 'center',
  },
  hero: {
    alignItems: 'center',
    marginTop: theme.spacing[12],
    marginBottom: theme.spacing[12],
  },
  title: {
    fontSize: theme.typography.fontSize['6xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.interactive.primary,
    marginBottom: theme.spacing[4],
  },
  subtitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[4],
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    lineHeight: theme.typography.fontSize['2xl'],
    maxWidth: 600,
  },
  features: {
    width: '100%',
    maxWidth: 600,
    marginBottom: theme.spacing[12],
  },
  featuresTitle: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[6],
    textAlign: 'center',
  },
  feature: {
    marginBottom: theme.spacing[6],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  featureTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  featureText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    lineHeight: 22,
  },
  actions: {
    width: '100%',
    maxWidth: 400,
    gap: theme.spacing[4],
  },
  button: {
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[8],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  secondaryButton: {
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.interactive.primary,
  },
  secondaryButtonText: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
