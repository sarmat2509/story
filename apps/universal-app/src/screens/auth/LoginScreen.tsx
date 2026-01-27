import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { theme } from '@/theme';

export default function LoginScreen() {
  const { signInWithGoogle, signInWithApple, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      await signInWithGoogle();
      // For web, page will redirect. For mobile, success handled by RootNavigator
    } catch (err) {
      setError('Google Sign In failed. Please try again.');
      console.error('Google login error:', err);
    }
  };

  const handleAppleLogin = async () => {
    try {
      setError(null);
      await signInWithApple();
      // For web, page will redirect. For mobile, success handled by RootNavigator
    } catch (err) {
      setError('Apple Sign In failed. Please try again.');
      console.error('Apple login error:', err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Kazka+</Text>
        <Text style={styles.subtitle}>Personalized illustrated fairy tales</Text>
        
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.button, styles.googleButton]}
            onPress={handleGoogleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign in with Google</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.appleButton]}
            onPress={handleAppleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign in with Apple</Text>
            )}
          </TouchableOpacity>
        </View>
        
        {Platform.OS === 'web' && (
          <Text style={styles.noteText}>
            Note: Web OAuth will open in the same window
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    padding: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize['6xl'],
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
    color: theme.colors.interactive.primary,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    textAlign: 'center',
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[12],
  },
  errorContainer: {
    backgroundColor: theme.colors.error[50],
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
  },
  errorText: {
    color: theme.colors.status.error,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.sm,
  },
  buttonContainer: {
    gap: theme.spacing[4],
  },
  button: {
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    alignItems: 'center',
  },
  googleButton: {
    backgroundColor: theme.colors.google,
  },
  appleButton: {
    backgroundColor: theme.colors.apple,
  },
  buttonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  noteText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.xs,
    textAlign: 'center',
    color: theme.colors.neutral[400],
  },
});
