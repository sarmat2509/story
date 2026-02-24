import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import LandingScreen from '@/screens/public/LandingScreen';
import PlansScreen from '@/screens/plans/PlansScreen';
import LoginScreen from '@/screens/auth/LoginScreen';
import OAuthCallbackScreen from '@/screens/auth/OAuthCallbackScreen';
import type { PublicStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<PublicStackParamList>();

export default function PublicNavigator() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Landing" component={LandingScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="Plans"
        component={PlansScreen}
        options={{
          headerShown: true,
          title: t('plans.title'),
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{
          headerShown: true,
          title: t('auth.login'),
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen
        name="OAuthCallback"
        component={OAuthCallbackScreen}
        options={{
          headerShown: true,
          title: t('common.loading'),
          headerBackVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}
