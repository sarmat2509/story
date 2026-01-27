import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';
import apiClient from '@/api/client';

export default function OAuthCallbackScreen() {
  const navigation = useNavigation();
  const { login } = useAuthStore();

  useEffect(() => {
    async function handleCallback() {
      try {
        // Get token from URL
        let token: string | null = null;
        let isNewUser = false;

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          token = params.get('token');
          isNewUser = params.get('isNewUser') === 'true';
        }

        if (!token) {
          throw new Error('No token received');
        }

        // Save token
        await storage.setAuthToken(token);

        // Fetch user info
        const response = await apiClient.get('/api/v1/me');
        const user = response.data.user;

        await storage.setUser(user);
        login(user, token);

        // Clear OAuth state
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem('oauth_redirect');
        }

        // Success - RootNavigator will redirect to main app
      } catch (error) {
        console.error('OAuth callback error:', error);
        alert('Authentication failed. Please try again.');
        navigation.navigate('Login' as never);
      }
    }

    handleCallback();
  }, [navigation, login]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0ea5e9" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
});
