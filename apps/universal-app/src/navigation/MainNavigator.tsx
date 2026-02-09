import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '@/hooks/useResponsive';
import { theme } from '@/theme';
import DashboardScreen from '@/screens/dashboard/DashboardScreen';
import WizardScreen from '@/screens/wizard/WizardScreen';
import LibraryScreen from '@/screens/library/LibraryScreen';
import StoryViewerScreen from '@/screens/story/StoryViewerScreen';
import ChildrenScreen from '@/screens/children/ChildrenScreen';
import CharactersScreen from '@/screens/characters/CharactersScreen';
import PlansScreen from '@/screens/plans/PlansScreen';
import ProfileScreen from '@/screens/profile/ProfileScreen';
import LanguageSettingsScreen from '@/screens/profile/LanguageSettingsScreen';
import { LanguageDropdown } from '@/components/LanguageDropdown';
import { MiniAudioPlayer } from '@/components/MiniAudioPlayer';
import type { MainDrawerParamList, MainTabParamList } from '@/types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Drawer = createDrawerNavigator<MainDrawerParamList>();

function TabNavigator() {
  const { t } = useTranslation();
  
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: theme.colors.interactive.primary,
        tabBarInactiveTintColor: theme.colors.text.tertiary,
      }}
      tabBar={(props) => (
        <View>
          <MiniAudioPlayer />
          <BottomTabBar {...props} />
        </View>
      )}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ 
          title: t('navigation.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Wizard" 
        component={WizardScreen}
        options={{ 
          title: t('navigation.create_story'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="create-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Library" 
        component={LibraryScreen}
        options={{ 
          title: t('navigation.library'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Story" 
        component={StoryViewerScreen}
        options={{ 
          title: 'Story', // Will be updated dynamically by StoryViewerScreen
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen 
        name="Children" 
        component={ChildrenScreen}
        options={{ 
          title: t('navigation.children'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Characters" 
        component={CharactersScreen}
        options={{ 
          title: t('navigation.characters'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="body-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Plans" 
        component={PlansScreen}
        options={{ 
          title: t('navigation.plans'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="diamond-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ 
          title: t('navigation.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="LanguageSettings" 
        component={LanguageSettingsScreen}
        options={{ 
          title: t('profile.language_settings'),
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
    </Tab.Navigator>
  );
}

function DrawerNavigator() {
  const { t } = useTranslation();
  
  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: true,
        drawerType: 'permanent',
        drawerActiveTintColor: theme.colors.interactive.primary,
        drawerInactiveTintColor: theme.colors.text.tertiary,
        headerLeft: () => null, // Hide hamburger menu on permanent drawer
        headerRight: () => <LanguageDropdown />, // Language dropdown for web
      }}
    >
      <Drawer.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ 
          title: t('navigation.dashboard'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="Wizard" 
        component={WizardScreen}
        options={{ 
          title: t('navigation.create_story'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="create-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="Library" 
        component={LibraryScreen}
        options={{ 
          title: t('navigation.library'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="Story" 
        component={StoryViewerScreen}
        options={{ 
          title: 'Story', // Will be updated dynamically by StoryViewerScreen
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="Children" 
        component={ChildrenScreen}
        options={{ 
          title: t('navigation.children'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="Characters" 
        component={CharactersScreen}
        options={{ 
          title: t('navigation.characters'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="body-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="Plans" 
        component={PlansScreen}
        options={{ 
          title: t('navigation.plans'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="diamond-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ 
          title: t('navigation.profile'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="LanguageSettings" 
        component={LanguageSettingsScreen}
        options={{ 
          title: t('profile.language_settings'),
          drawerItemStyle: { display: 'none' }, // Hide from drawer menu
        }}
      />
    </Drawer.Navigator>
  );
}

export default function MainNavigator() {
  const { isDesktop } = useResponsive();

  if (isDesktop) {
    // Drawer for web/desktop with MiniAudioPlayer at the bottom
    return (
      <View style={{ flex: 1 }}>
        <DrawerNavigator />
        <MiniAudioPlayer />
      </View>
    );
  }

  // Tabs for mobile (MiniAudioPlayer is rendered above tab bar via tabBar prop)
  return <TabNavigator />;
}
