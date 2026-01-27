import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useGoogleLogin } from '@/api/auth';

export default function LoginScreen() {
  const googleLogin = useGoogleLogin();

  const handleGoogleLogin = async () => {
    // TODO: Implement actual Google Sign In
    // For now, just show placeholder
    alert('Google Sign In - TODO: Implement OAuth flow');
  };

  const handleAppleLogin = async () => {
    // TODO: Implement actual Apple Sign In
    alert('Apple Sign In - TODO: Implement OAuth flow');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Kazka+</Text>
        <Text style={styles.subtitle}>Personalized illustrated fairy tales</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.button, styles.googleButton]}
            onPress={handleGoogleLogin}
          >
            <Text style={styles.buttonText}>Sign in with Google</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.appleButton]}
            onPress={handleAppleLogin}
          >
            <Text style={styles.buttonText}>Sign in with Apple</Text>
          </TouchableOpacity>
        </View>
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
});
