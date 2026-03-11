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
import LandingScreen from '@/screens/public/LandingScreen';
import NotFoundScreen from '@/screens/public/NotFoundScreen';
import LoginScreen from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '@/screens/auth/ResetPasswordScreen';
import OAuthCallbackScreen from '@/screens/auth/OAuthCallbackScreen';
import DashboardScreen from '@/screens/dashboard/DashboardScreen';
import WizardScreen from '@/screens/wizard/WizardScreen';
import InstantWizardScreen from '@/screens/wizard/InstantWizardScreen';
import LibraryScreen from '@/screens/library/LibraryScreen';
import SeriesListScreen from '@/screens/series/SeriesListScreen';
import SeriesDetailScreen from '@/screens/series/SeriesDetailScreen';
import LegacyRedirectScreen from '@/screens/LegacyRedirectScreen';
import StoryReaderScreen from '@/screens/StoryReaderScreen';
import PublishedStoriesScreen from '@/screens/published/PublishedStoriesScreen';
import ChildrenScreen from '@/screens/children/ChildrenScreen';
import CharactersScreen from '@/screens/characters/CharactersScreen';
import PlansScreen from '@/screens/plans/PlansScreen';
import ProfileScreen from '@/screens/profile/ProfileScreen';
import BillingSuccessScreen from '@/screens/billing/BillingSuccessScreen';
import LanguageSettingsScreen from '@/screens/profile/LanguageSettingsScreen';
import ModeSelectionScreen from '@/screens/onboarding/ModeSelectionScreen';
import { MiniAudioPlayer } from '@/components/MiniAudioPlayer';
import { useMainNavigationStore } from '@/store/mainNavigationStore';
import { useDrawerCollapsedStore } from '@/store/drawerCollapsedStore';
import { CollapsibleDrawerContent } from '@/navigation/CollapsibleDrawerContent';
import { AuthGuard } from '@/components/AuthGuard';
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
const MORE_MENU_ROUTES: (keyof MainTabParamList)[] = ['Series', 'Stories', 'Children', 'Plans', 'Profile'];

const MOBILE_TAB_ORDER_PUBLIC: (keyof MainTabParamList)[] = ['Landing', 'Stories', 'Plans', 'Login'];
const TABLET_TAB_ORDER_PUBLIC: (keyof MainTabParamList)[] = ['Landing', 'Stories', 'Plans', 'Login'];
const MORE_MENU_ROUTES_PUBLIC: (keyof MainTabParamList)[] = [];

const TAB_LABELS: Record<string, string> = {
  Landing: 'navigation.tab_dashboard',
  Login: 'auth.login',
  Dashboard: 'navigation.tab_dashboard',
  Wizard: 'navigation.tab_create_story',
  Library: 'navigation.tab_library',
  Characters: 'navigation.tab_characters',
  Children: 'navigation.tab_children',
  Plans: 'navigation.tab_plans',
  Profile: 'navigation.tab_profile',
  Stories: 'navigation.published_stories',
  Series: 'navigation.series',
};
const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Landing: 'home-outline',
  Login: 'log-in-outline',
  Dashboard: 'home-outline',
  Wizard: 'create-outline',
  Library: 'library-outline',
  Characters: 'body-outline',
  Children: 'people-outline',
  Plans: 'diamond-outline',
  Profile: 'person-outline',
  Stories: 'newspaper-outline',
  Series: 'layers-outline',
};

type MobileTabBarProps = BottomTabBarProps & { isAuthenticated: boolean };

function MobileTabBar({ state, descriptors: _d, navigation, isAuthenticated }: MobileTabBarProps) {
  const { t } = useTranslation();
  const { isTablet } = useResponsive();
  const [moreVisible, setMoreVisible] = useState(false);
  const activeRouteName = state.routes[state.index]?.name;
  const moreMenuRoutes = isAuthenticated ? MORE_MENU_ROUTES : MORE_MENU_ROUTES_PUBLIC;
  const isMoreActive = moreMenuRoutes.includes(activeRouteName as keyof MainTabParamList);

  const tabOrder = isAuthenticated
    ? (isTablet ? TABLET_TAB_ORDER : MOBILE_TAB_ORDER)
    : (isTablet ? TABLET_TAB_ORDER_PUBLIC : MOBILE_TAB_ORDER_PUBLIC);
  const showMoreButton = isAuthenticated && !isTablet;

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

  const moreMenuItems: { name: keyof MainTabParamList; icon: keyof typeof Ionicons.glyphMap; labelKey: string }[] = isAuthenticated
    ? [
        { name: 'Series', icon: 'layers-outline', labelKey: 'navigation.series' },
        { name: 'Stories', icon: 'newspaper-outline', labelKey: 'navigation.published_stories' },
        { name: 'Children', icon: 'people-outline', labelKey: 'navigation.tab_children' },
        { name: 'Plans', icon: 'diamond-outline', labelKey: 'navigation.tab_plans' },
        { name: 'Profile', icon: 'person-outline', labelKey: 'navigation.tab_profile' },
      ]
    : [];

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
  const { user, isAuthenticated } = useAuthStore();
  const isInstantMode = user?.mode === 'instant';

  return (
    <Tab.Navigator
      key={isAuthenticated ? 'auth' : 'public'}
      initialRouteName={isAuthenticated ? 'Dashboard' : 'Landing'}
      backBehavior="history"
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: theme.colors.interactive.primary,
        tabBarInactiveTintColor: theme.colors.text.tertiary,
      }}
      tabBar={(props) => (
        <View>
          <MiniAudioPlayer />
          <MobileTabBar {...props} isAuthenticated={!!isAuthenticated} />
        </View>
      )}
    >
      <Tab.Screen
        name="Landing"
        component={LandingScreen}
        options={{
          title: 'WonderTales',
          tabBarLabel: t('navigation.tab_dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          tabBarButton: isAuthenticated ? () => null : undefined,
        }}
      />
      <Tab.Screen
        name="Login"
        component={LoginScreen}
        options={{
          title: t('auth.login'),
          tabBarLabel: t('auth.login'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="log-in-outline" size={size} color={color} />
          ),
          tabBarButton: isAuthenticated ? () => null : undefined,
        }}
      />
      <Tab.Screen
        name="Register"
        component={RegisterScreen}
        options={{
          title: t('auth.register'),
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{
          title: t('auth.forgot_password'),
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{
          title: t('auth.reset_password'),
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="OAuthCallback"
        component={OAuthCallbackScreen}
        options={{
          title: t('common.loading'),
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen 
        name="Dashboard" 
        component={() => (
          <AuthGuard>
            <DashboardScreen />
          </AuthGuard>
        )}
        options={{ 
          title: t('navigation.dashboard'),
          tabBarLabel: t('navigation.tab_dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated ? () => null : undefined,
        }}
      />
      <Tab.Screen 
        name="Wizard" 
        component={() => (
          <AuthGuard>
            {isInstantMode ? <InstantWizardScreen /> : <WizardScreen />}
          </AuthGuard>
        )}
        options={{ 
          title: t('navigation.create_story'),
          tabBarLabel: t('navigation.tab_create_story'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="create-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated ? () => null : undefined,
        }}
      />
      <Tab.Screen 
        name="Library" 
        component={() => (
          <AuthGuard>
            <LibraryScreen />
          </AuthGuard>
        )}
        options={{ 
          title: t('navigation.library'),
          tabBarLabel: t('navigation.tab_library'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated ? () => null : undefined,
        }}
      />
      <Tab.Screen 
        name="LibraryRedirect" 
        component={LegacyRedirectScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen 
        name="Series" 
        component={() => (
          <AuthGuard>
            <SeriesListScreen />
          </AuthGuard>
        )}
        options={{ 
          title: 'Series',
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen 
        name="SeriesDetail" 
        component={() => (
          <AuthGuard>
            <SeriesDetailScreen />
          </AuthGuard>
        )}
        options={{ 
          title: 'Series Detail',
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen 
        name="StoryRedirect" 
        component={LegacyRedirectScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen 
        name="Story" 
        component={() => (
          <AuthGuard>
            <StoryReaderScreen />
          </AuthGuard>
        )}
        options={{ 
          title: 'Story',
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen 
        name="Stories" 
        component={PublishedStoriesScreen}
        options={{ 
          title: t('navigation.published_stories'),
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen 
        name="PublishedStory" 
        component={StoryReaderScreen}
        options={{ 
          title: 'Story',
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen 
        name="UnlistedStory" 
        component={StoryReaderScreen}
        options={{ 
          title: 'Story',
          tabBarButton: () => null,
        }}
      />
      {!isInstantMode && (
        <Tab.Screen 
          name="Children" 
          component={() => (
            <AuthGuard>
              <ChildrenScreen />
            </AuthGuard>
          )}
          options={{ 
            title: t('navigation.children'),
            tabBarLabel: t('navigation.tab_children'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
            tabBarButton: !isAuthenticated ? () => null : undefined,
          }}
        />
      )}
      {!isInstantMode && (
        <Tab.Screen 
          name="Characters" 
          component={() => (
            <AuthGuard>
              <CharactersScreen />
            </AuthGuard>
          )}
          options={{ 
            title: t('navigation.characters'),
            tabBarLabel: t('navigation.tab_characters'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="body-outline" size={size} color={color} />
            ),
            tabBarButton: !isAuthenticated ? () => null : undefined,
          }}
        />
      )}
      <Tab.Screen 
        name="BillingSuccess" 
        component={BillingSuccessScreen}
        options={{ 
          title: t('billing.success_title'),
          tabBarButton: () => null,
        }}
      />
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
        component={() => (
          <AuthGuard>
            <ProfileScreen />
          </AuthGuard>
        )}
        options={{ 
          title: t('navigation.profile'),
          tabBarLabel: t('navigation.tab_profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated ? () => null : undefined,
        }}
      />
<Tab.Screen 
        name="LanguageSettings" 
        component={() => (
          <AuthGuard>
            <LanguageSettingsScreen />
          </AuthGuard>
        )}
        options={{ 
          title: t('profile.language_settings'),
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="NotFound"
        component={NotFoundScreen}
        options={{
          title: '404',
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
  const { user, isAuthenticated } = useAuthStore();
  const collapsed = useDrawerCollapsedStore((s) => s.collapsed);
  const isInstantMode = user?.mode === 'instant';

  const drawerWidth = collapsed
    ? theme.layout.drawer.widthCollapsed
    : isDesktop
      ? theme.layout.drawer.widthDesktop
      : theme.layout.drawer.widthTablet;

  return (
    <Drawer.Navigator
      key={isAuthenticated ? 'auth' : 'public'}
      initialRouteName={isAuthenticated ? 'Dashboard' : 'Landing'}
      backBehavior="history"
      drawerContent={(props) => <CollapsibleDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        drawerType: isDesktop ? 'permanent' : 'front',
        drawerActiveTintColor: theme.colors.interactive.primary,
        drawerInactiveTintColor: theme.colors.text.tertiary,
        drawerStyle: { width: drawerWidth },
        headerLeft: (isTablet || isDesktop) ? () => <DrawerBurgerButton /> : undefined,
      }}
    >
      <Drawer.Screen
        name="Landing"
        component={LandingScreen}
        options={{
          title: 'WonderTales',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          drawerItemStyle: isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen
        name="Login"
        component={LoginScreen}
        options={{
          title: t('auth.login'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="log-in-outline" size={size} color={color} />
          ),
          drawerItemStyle: isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen
        name="Register"
        component={RegisterScreen}
        options={{
          title: t('auth.register'),
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{
          title: t('auth.forgot_password'),
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{
          title: t('auth.reset_password'),
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="OAuthCallback"
        component={OAuthCallbackScreen}
        options={{
          title: t('common.loading'),
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="Dashboard" 
        component={() => (
          <AuthGuard>
            <DashboardScreen />
          </AuthGuard>
        )}
        options={{ 
          title: t('navigation.dashboard'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen 
        name="Wizard" 
        component={() => (
          <AuthGuard>
            {isInstantMode ? <InstantWizardScreen /> : <WizardScreen />}
          </AuthGuard>
        )}
        options={{ 
          title: t('navigation.create_story'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="create-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen 
        name="Library" 
        component={() => (
          <AuthGuard>
            <LibraryScreen />
          </AuthGuard>
        )}
        options={{ 
          title: t('navigation.library'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen 
        name="Series" 
        component={() => (
          <AuthGuard>
            <SeriesListScreen />
          </AuthGuard>
        )}
        options={{ 
          title: t('navigation.series'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="layers-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen 
        name="SeriesDetail" 
        component={() => (
          <AuthGuard>
            <SeriesDetailScreen />
          </AuthGuard>
        )}
        options={{ 
          title: 'Series Detail',
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="LibraryRedirect" 
        component={LegacyRedirectScreen}
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen 
        name="StoryRedirect" 
        component={LegacyRedirectScreen}
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen 
        name="Story" 
        component={() => (
          <AuthGuard>
            <StoryReaderScreen />
          </AuthGuard>
        )}
        options={{ 
          title: 'Story',
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="Stories" 
        component={PublishedStoriesScreen}
        options={{ 
          title: t('navigation.published_stories'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="newspaper-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen 
        name="PublishedStory" 
        component={StoryReaderScreen}
        options={{ 
          title: 'Story',
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen 
        name="UnlistedStory" 
        component={StoryReaderScreen}
        options={{ 
          title: 'Story',
          drawerItemStyle: { display: 'none' },
        }}
      />
      {!isInstantMode && (
        <Drawer.Screen 
          name="Children" 
          component={() => (
            <AuthGuard>
              <ChildrenScreen />
            </AuthGuard>
          )}
          options={{ 
            title: t('navigation.children'),
            drawerIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
            drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
          }}
        />
      )}
      {!isInstantMode && (
        <Drawer.Screen 
          name="Characters" 
          component={() => (
            <AuthGuard>
              <CharactersScreen />
            </AuthGuard>
          )}
          options={{ 
            title: t('navigation.characters'),
            drawerIcon: ({ color, size }) => (
              <Ionicons name="body-outline" size={size} color={color} />
            ),
            drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
          }}
        />
      )}
      <Drawer.Screen 
        name="BillingSuccess" 
        component={BillingSuccessScreen}
        options={{ 
          title: t('billing.success_title'),
          drawerItemStyle: { display: 'none' },
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
        component={() => (
          <AuthGuard>
            <ProfileScreen />
          </AuthGuard>
        )}
        options={{ 
          title: t('navigation.profile'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen 
        name="LanguageSettings" 
        component={() => (
          <AuthGuard>
            <LanguageSettingsScreen />
          </AuthGuard>
        )}
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
      <Drawer.Screen 
        name="NotFound" 
        component={NotFoundScreen}
        options={{ 
          title: '404',
          drawerItemStyle: { display: 'none' },
        }}
      />
    </Drawer.Navigator>
  );
}

export default function MainNavigator() {
  const { isDesktop, isMobile, isLandscape } = useResponsive();

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
