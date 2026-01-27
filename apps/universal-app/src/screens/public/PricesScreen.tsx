import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { PublicStackParamList } from '@/types/navigation';
import { usePlans } from '@/api/plans';
import { theme } from '@/theme';

export default function PricesScreen() {
  const navigation = useNavigation<NavigationProp<PublicStackParamList>>();
  const { data: plans, isLoading, error } = usePlans();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.loadingText}>Loading pricing plans...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Failed to load pricing plans</Text>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => navigation.navigate('Landing')}
        >
          <Text style={styles.primaryButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Pricing Plans</Text>
        <Text style={styles.subtitle}>
          Choose the perfect plan for your family
        </Text>
      </View>

      <View style={styles.plansContainer}>
        {plans?.map((plan: any) => (
          <View key={plan.id} style={styles.planCard}>
            <Text style={styles.planName}>{plan.name}</Text>
            {plan.description && (
              <Text style={styles.planDescription}>{plan.description}</Text>
            )}
            <View style={styles.priceContainer}>
              <Text style={styles.price}>
                {plan.price === 0 ? 'Free' : `$${plan.price}`}
              </Text>
              {plan.price > 0 && (
                <Text style={styles.pricePeriod}>/{plan.billingPeriod}</Text>
              )}
            </View>
            
            {plan.features && (
              <View style={styles.features}>
                {Object.entries(plan.features as Record<string, any>).map(([key, value]) => (
                  <View key={key} style={styles.feature}>
                    <Text style={styles.featureText}>
                      ✓ {key.replace(/([A-Z])/g, ' $1').trim()}: {String(value)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                plan.price === 0 ? styles.secondaryButton : styles.primaryButton,
              ]}
              onPress={() => navigation.navigate('Login')}
            >
              <Text
                style={
                  plan.price === 0
                    ? styles.secondaryButtonText
                    : styles.primaryButtonText
                }
              >
                {plan.price === 0 ? 'Start Free' : 'Get Started'}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.navigate('Landing')}
      >
        <Text style={styles.backButtonText}>← Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing[6],
  },
  content: {
    padding: theme.spacing[6],
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: theme.spacing[6],
    marginBottom: theme.spacing[12],
  },
  title: {
    fontSize: theme.typography.fontSize['5xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  plansContainer: {
    width: '100%',
    maxWidth: 1000,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[6],
    justifyContent: 'center',
    marginBottom: theme.spacing[12],
  },
  planCard: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[8],
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.border.light,
    minWidth: 280,
    maxWidth: 320,
  },
  planName: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  planDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing[6],
  },
  price: {
    fontSize: theme.typography.fontSize['6xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.interactive.primary,
  },
  pricePeriod: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.tertiary,
    marginLeft: theme.spacing[1],
  },
  features: {
    marginBottom: theme.spacing[6],
  },
  feature: {
    marginBottom: theme.spacing[3],
  },
  featureText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: theme.colors.interactive.primary,
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  secondaryButton: {
    backgroundColor: theme.colors.background.primary,
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.interactive.primary,
  },
  secondaryButtonText: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  backButton: {
    padding: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  backButtonText: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.status.error,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
});
