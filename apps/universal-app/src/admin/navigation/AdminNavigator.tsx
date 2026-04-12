import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';
import AdminDashboardScreen from '@/admin/screens/AdminDashboardScreen';
import AdminContentConfigScreen from '@/admin/screens/AdminContentConfigScreen';
import AdminFeedbackScreen from '@/admin/screens/AdminFeedbackScreen';
import AdminScenesScreen from '@/admin/screens/AdminScenesScreen';
import AdminStoriesScreen from '@/admin/screens/AdminStoriesScreen';
import AdminUsersScreen from '@/admin/screens/AdminUsersScreen';
import AdminValidationDetailScreen from '@/admin/screens/AdminValidationDetailScreen';
import AdminValidationsScreen from '@/admin/screens/AdminValidationsScreen';

const Stack = createNativeStackNavigator<AdminStackParamList>();

export default function AdminNavigator() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      navigation.replace('Main');
      return;
    }
    if (!isLoading && user?.role !== 'admin') {
      navigation.replace('Main', { screen: 'Profile' });
    }
  }, [isLoading, navigation, user?.role]);

  if (Platform.OS !== 'web' || isLoading || user?.role !== 'admin') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background.secondary }}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator initialRouteName="AdminDashboard" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminStories" component={AdminStoriesScreen} />
      <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
      <Stack.Screen name="AdminFeedback" component={AdminFeedbackScreen} />
      <Stack.Screen name="AdminValidations" component={AdminValidationsScreen} />
      <Stack.Screen name="AdminContentConfig" component={AdminContentConfigScreen} />
      <Stack.Screen name="AdminValidationDetail" component={AdminValidationDetailScreen} />
      <Stack.Screen name="AdminScenesStory" component={AdminScenesScreen} />
    </Stack.Navigator>
  );
}
