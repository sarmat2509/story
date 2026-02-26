import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Modal, Pressable, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '@/hooks/useResponsive';
import { theme } from '@/theme';
import { useAuthStore } from '@/store/authStore';
import DashboardScreen from '@/screens/dashboard/DashboardScreen';
import WizardScreen from '@/screens/wizard/WizardScreen';
import InstantWizardScreen from '@/screens/wizard/InstantWizardScreen';
import LibraryScreen from '@/screens/library/LibraryScreen';
import StoryViewerScreen from '@/screens/story/StoryViewerScreen';
import ChildrenScreen from '@/screens/children/ChildrenScreen';
import CharactersScreen from '@/screens/characters/CharactersScreen';
import PlansScreen from '@/screens/plans/PlansScreen';
import ProfileScreen from '@/screens/profile/ProfileScreen';
import LanguageSettingsScreen from '@/screens/profile/LanguageSettingsScreen';
import ModeSelectionScreen from '@/screens/onboarding/ModeSelectionScreen';
import { LanguageDropdown } from '@/components/LanguageDropdown';
import { MiniAudioPlayer } from '@/components/MiniAudioPlayer';
import { useMainNavigationStore } from '@/store/mainNavigationStore';
import { useDrawerCollapsedStore } from '@/store/drawerCollapsedStore';
import { CollapsibleDrawerContent } from '@/navigation/CollapsibleDrawerContent';
import { navigationRef, navigateToMainRoute } from '@/navigation/navigationRef';
import type { MainDrawerParamList, MainTabParamList } from '@/types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Drawer = createDrawerNavigator<MainDrawerParamList>();

const MOBILE_TAB_ORDER: (keyof MainTabParamList)[] = ['Dashboard', 'Wizard', 'Library', 'Characters'];
const TABLET_TAB_ORDER: (keyof MainTabParamList)[] = [
  'Dashboard',
  'Wizard',
  'Library',
  'Children',
  'Characters',
  'Plans',
  'Profile',
];
const MORE_MENU_ROUTES: (keyof MainTabParamList)[] = ['Children', 'Plans', 'Profile'];

const TAB_LABELS: Record<string, string> = {
  Dashboard: 'navigation.tab_dashboard',
  Wizard: 'navigation.tab_create_story',
  Library: 'navigation.tab_library',
  Characters: 'navigation.tab_characters',
  Children: 'navigation.tab_children',
  Plans: 'navigation.tab_plans',
  Profile: 'navigation.tab_profile',
};
const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'home-outline',
  Wizard: 'create-outline',
  Library: 'library-outline',
  Characters: 'body-outline',
  Children: 'people-outline',
  Plans: 'diamond-outline',
  Profile: 'person-outline',
};

function MobileTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const { isTablet } = useResponsive();
  const [moreVisible, setMoreVisible] = useState(false);
  const activeRouteName = state.routes[state.index]?.name;
  const isMoreActive = MORE_MENU_ROUTES.includes(activeRouteName as keyof MainTabParamList);

  const tabOrder = isTablet ? TABLET_TAB_ORDER : MOBILE_TAB_ORDER;
  const showMoreButton = !isTablet;

  const handleTabPress = (name: keyof MainTabParamList) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: state.routes.find((r) => r.name === name)?.key ?? '',
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(name as never);
    }
  };

  const handleMoreItemPress = (name: keyof MainTabParamList) => {
    navigation.navigate(name as never);
    setMoreVisible(false);
  };

  const moreMenuItems: { name: keyof MainTabParamList; icon: keyof typeof Ionicons.glyphMap; labelKey: string }[] = [
    { name: 'Children', icon: 'people-outline', labelKey: 'navigation.tab_children' },
    { name: 'Plans', icon: 'diamond-outline', labelKey: 'navigation.tab_plans' },
    { name: 'Profile', icon: 'person-outline', labelKey: 'navigation.tab_profile' },
  ];

  return (
    <View style={mobileTabBarStyles.container}>
      <View style={mobileTabBarStyles.tabRow}>
        {tabOrder.map((name) => {
          const isActive = activeRouteName === name;
          const color = isActive ? theme.colors.interactive.primary : theme.colors.text.tertiary;
          return (
            <TouchableOpacity
              key={name}
              style={mobileTabBarStyles.tabItem}
              onPress={() => handleTabPress(name)}
              activeOpacity={0.7}
            >
              <Ionicons name={TAB_ICONS[name]} size={24} color={color} />
              <Text style={[mobileTabBarStyles.tabLabel, { color }]} numberOfLines={1}>
                {t(TAB_LABELS[name])}
              </Text>
            </TouchableOpacity>
          );
        })}
        {showMoreButton && (
          <TouchableOpacity
            style={mobileTabBarStyles.tabItem}
            onPress={() => setMoreVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={24}
              color={isMoreActive ? theme.colors.interactive.primary : theme.colors.text.tertiary}
            />
            <Text
              style={[
                mobileTabBarStyles.tabLabel,
                { color: isMoreActive ? theme.colors.interactive.primary : theme.colors.text.tertiary },
              ]}
              numberOfLines={1}
            >
              {t('navigation.tab_more')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={moreVisible} transparent animationType="fade">
        <View style={mobileTabBarStyles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoreVisible(false)} />
          <View style={mobileTabBarStyles.moreMenu}>
            {moreMenuItems.map((item) => (
              <TouchableOpacity
                key={item.name}
                style={mobileTabBarStyles.moreMenuItem}
                onPress={() => handleMoreItemPress(item.name)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={activeRouteName === item.name ? theme.colors.interactive.primary : theme.colors.text.primary}
                />
                <Text
                  style={[
                    mobileTabBarStyles.moreMenuLabel,
                    activeRouteName === item.name && mobileTabBarStyles.moreMenuLabelActive,
                  ]}
                >
                  {t(item.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const mobileTabBarStyles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: theme.colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[2],
  },
  tabLabel: {
    fontSize: theme.typography.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  moreMenu: {
    backgroundColor: theme.colors.background.primary,
    borderTopLeftRadius: theme.borders.radius.xl,
    borderTopRightRadius: theme.borders.radius.xl,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[3],
  },
  moreMenuLabel: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  moreMenuLabelActive: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});

function TabNavigator() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isInstantMode = user?.mode === 'instant';

  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: theme.colors.interactive.primary,
        tabBarInactiveTintColor: theme.colors.text.tertiary,
      }}
      tabBar={(props) => (
        <View>
          <MiniAudioPlayer />
          <MobileTabBar {...props} />
        </View>
      )}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ 
          title: t('navigation.dashboard'),
          tabBarLabel: t('navigation.tab_dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Wizard" 
        component={isInstantMode ? InstantWizardScreen : WizardScreen}
        options={{ 
          title: t('navigation.create_story'),
          tabBarLabel: t('navigation.tab_create_story'),
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
          tabBarLabel: t('navigation.tab_library'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Story" 
        component={StoryViewerScreen}
        options={{ 
          title: 'Story',
          tabBarButton: () => null,
        }}
      />
      {!isInstantMode && (
        <Tab.Screen 
          name="Children" 
          component={ChildrenScreen}
          options={{ 
            title: t('navigation.children'),
            tabBarLabel: t('navigation.tab_children'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
          }}
        />
      )}
      {!isInstantMode && (
        <Tab.Screen 
          name="Characters" 
          component={CharactersScreen}
          options={{ 
            title: t('navigation.characters'),
            tabBarLabel: t('navigation.tab_characters'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="body-outline" size={size} color={color} />
            ),
          }}
        />
      )}
      <Tab.Screen 
        name="Plans" 
        component={PlansScreen}
        options={{ 
          title: t('navigation.plans'),
          tabBarLabel: t('navigation.tab_plans'),
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
          tabBarLabel: t('navigation.tab_profile'),
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
          tabBarButton: () => null,
        }}
      />
    </Tab.Navigator>
  );
}

function DrawerBurgerButton() {
  const collapsed = useDrawerCollapsedStore((s) => s.collapsed);
  const toggle = useDrawerCollapsedStore((s) => s.toggle);
  return (
    <TouchableOpacity
      onPress={toggle}
      style={{ paddingHorizontal: 16 }}
    >
      <MaterialCommunityIcons
        name={collapsed ? 'menu-close' : 'menu-open'}
        size={24}
        color={theme.colors.text.primary}
      />
    </TouchableOpacity>
  );
}

function DrawerNavigator() {
  const { t } = useTranslation();
  const { isTablet, isDesktop } = useResponsive();
  const { user } = useAuthStore();
  const collapsed = useDrawerCollapsedStore((s) => s.collapsed);
  const isInstantMode = user?.mode === 'instant';

  const drawerWidth = collapsed
    ? theme.layout.drawer.widthCollapsed
    : isDesktop
      ? theme.layout.drawer.widthDesktop
      : theme.layout.drawer.widthTablet;

  return (
    <Drawer.Navigator
      backBehavior="history"
      drawerContent={(props) => <CollapsibleDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        drawerType: isDesktop ? 'permanent' : 'front',
        drawerActiveTintColor: theme.colors.interactive.primary,
        drawerInactiveTintColor: theme.colors.text.tertiary,
        drawerStyle: { width: drawerWidth },
        headerLeft: (isTablet || isDesktop) ? () => <DrawerBurgerButton /> : undefined,
        headerRight: () => <LanguageDropdown />,
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
        component={isInstantMode ? InstantWizardScreen : WizardScreen}
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
          title: 'Story',
          drawerItemStyle: { display: 'none' },
        }}
      />
      {!isInstantMode && (
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
      )}
      {!isInstantMode && (
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
      )}
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
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="ModeSelection" 
        component={ModeSelectionScreen}
        options={{ 
          title: t('mode_selection.title'),
          drawerItemStyle: { display: 'none' },
        }}
      />
    </Drawer.Navigator>
  );
}

export default function MainNavigator() {
  const { isDesktop, isTabletLandscape, isMobile, isLandscape } = useResponsive();

  // Web: Drawer only on desktop. Native: Drawer on tablet/desktop in landscape.
  const useDrawer =
    (Platform.OS === 'web' && isDesktop) || (Platform.OS !== 'web' && !isMobile && isLandscape);

  // When useDrawer changes, block onStateChange from overwriting lastMainRoute during layout transition.
  const prevUseDrawer = useRef(useDrawer);
  if (prevUseDrawer.current !== useDrawer) {
    useMainNavigationStore.getState().setLayoutTransitionInProgress(true);
    prevUseDrawer.current = useDrawer;
  }

  // After switching Tab ↔ Drawer (e.g. iPad rotation), restore the last active Main route so the user stays on the same screen.
  useEffect(() => {
    const id = setTimeout(() => {
      const { lastMainRoute, setLastMainRoute, setLayoutTransitionInProgress } =
        useMainNavigationStore.getState();
      if (lastMainRoute && navigationRef.isReady()) {
        navigateToMainRoute(lastMainRoute);
      }
      setLastMainRoute(null);
      setLayoutTransitionInProgress(false);
    }, 0);
    return () => clearTimeout(id);
  }, [useDrawer]);

  if (useDrawer) {
    return (
      <View style={{ flex: 1 }}>
        <DrawerNavigator />
        <MiniAudioPlayer />
      </View>
    );
  }

  return <TabNavigator />;
}
