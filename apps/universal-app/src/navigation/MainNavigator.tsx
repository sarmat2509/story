import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useResponsive } from '@/hooks/useResponsive';
import HomeScreen from '@/screens/home/HomeScreen';
import WizardScreen from '@/screens/wizard/WizardScreen';
import LibraryScreen from '@/screens/library/LibraryScreen';
import type { MainTabParamList } from '@/types/navigation';
import { Text } from 'react-native';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Placeholder for Profile screen
function ProfileScreen() {
  return <Text>Profile (Coming soon)</Text>;
}

export default function MainNavigator() {
  const { isDesktop } = useResponsive();

  // TODO: Implement Drawer Navigator for desktop
  // For now, use Tab Navigator for all screen sizes

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarStyle: {
          display: isDesktop ? 'none' : 'flex',
        },
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen 
        name="Create" 
        component={WizardScreen}
        options={{ title: 'Create Story' }}
      />
      <Tab.Screen 
        name="Library" 
        component={LibraryScreen}
        options={{ title: 'Library' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
