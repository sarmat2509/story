import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

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
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#0ea5e9',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#64748b',
    marginBottom: 48,
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    textAlign: 'center',
    fontSize: 14,
  },
  buttonContainer: {
    gap: 16,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  googleButton: {
    backgroundColor: '#4285F4',
  },
  appleButton: {
    backgroundColor: '#000',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  noteText: {
    marginTop: 16,
    fontSize: 12,
    textAlign: 'center',
    color: '#94a3b8',
  },
});
