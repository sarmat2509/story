import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';
import MainNavigator from './MainNavigator';
import ModeSelectionScreen from '@/screens/onboarding/ModeSelectionScreen';
import type { RootStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  
  // Check if user needs to select a mode
  const needsModeSelection = isAuthenticated && !user?.mode;

  // Show loading while auth state is being restored from storage
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background.primary }}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
      </View>
    );
  }

  const navigatorKey = needsModeSelection ? 'mode-selection' : 'main';

  const initialRoute = needsModeSelection ? 'ModeSelection' : 'Main';

  return (
    <Stack.Navigator
      key={navigatorKey}
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRoute}
    >
      <Stack.Screen name="ModeSelection" component={ModeSelectionScreen} />
      <Stack.Screen name="Main" component={MainNavigator} />
    </Stack.Navigator>
  );
}
