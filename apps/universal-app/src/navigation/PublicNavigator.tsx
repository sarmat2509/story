import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LandingScreen from '@/screens/public/LandingScreen';
import PlansScreen from '@/screens/plans/PlansScreen';
import LoginScreen from '@/screens/auth/LoginScreen';
import OAuthCallbackScreen from '@/screens/auth/OAuthCallbackScreen';
import type { PublicStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<PublicStackParamList>();

export default function PublicNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Landing" component={LandingScreen} />
      <Stack.Screen name="Plans" component={PlansScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OAuthCallback" component={OAuthCallbackScreen} />
    </Stack.Navigator>
  );
}
