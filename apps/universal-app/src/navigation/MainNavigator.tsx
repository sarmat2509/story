import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '@/hooks/useResponsive';
import { theme } from '@/theme';
import { modernColors } from '@/theme/modernTheme';
import { useAuthStore } from '@/store/authStore';
import WelcomeScreen from '@/screens/public/WelcomeScreen';
import NotFoundScreen from '@/screens/public/NotFoundScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '@/screens/auth/ResetPasswordScreen';
import ChildModeRecoveryScreen from '@/screens/auth/ChildModeRecoveryScreen';
import OAuthCallbackScreen from '@/screens/auth/OAuthCallbackScreen';
import DashboardScreen from '@/screens/dashboard/DashboardScreen';
import WizardScreen from '@/screens/wizard/WizardScreen';
import InstantWizardScreen from '@/screens/wizard/InstantWizardScreen';
import LibraryScreen from '@/screens/library/LibraryScreen';
import ArtifactsScreen from '@/screens/artifacts/ArtifactsScreen';
import MapTilesScreen from '@/screens/map/MapTilesScreen';
import SeriesListScreen from '@/screens/series/SeriesListScreen';
import SeriesDetailScreen from '@/screens/series/SeriesDetailScreen';
import LegacyRedirectScreen from '@/screens/LegacyRedirectScreen';
import StoryReaderScreen from '@/screens/StoryReaderScreen';
import PublishedStoriesScreen from '@/screens/published/PublishedStoriesScreen';
import AuthorProfileScreen from '@/screens/published/AuthorProfileScreen';
import ChildrenScreen from '@/screens/children/ChildrenScreen';
import ChildDetailScreen from '@/screens/children/ChildDetailScreen';
import CharactersScreen from '@/screens/characters/CharactersScreen';
import PlansScreen from '@/screens/plans/PlansScreen';
import ProfileScreen from '@/screens/profile/ProfileScreen';
import BillingSuccessScreen from '@/screens/billing/BillingSuccessScreen';
import LanguageSettingsScreen from '@/screens/profile/LanguageSettingsScreen';
import ThemeSettingsScreen from '@/screens/profile/ThemeSettingsScreen';
import { MiniAudioPlayer } from '@/components/MiniAudioPlayer';
import { useMainNavigationStore } from '@/store/mainNavigationStore';
import { useDrawerCollapsedStore } from '@/store/drawerCollapsedStore';
import { CollapsibleDrawerContent } from '@/navigation/CollapsibleDrawerContent';
import { ChildProfileSwitcher } from '@/navigation/ChildProfileSwitcher';
import { AuthGuard } from '@/components/AuthGuard';
import { navigationRef, navigateToMainRoute } from '@/navigation/navigationRef';
import type { MainDrawerParamList, MainTabParamList } from '@/types/navigation';
import { replaceWebLocation } from '@/utils/webRuntime';
import { formatAssetUrl } from '@/utils/assetUrl';
import { buildPublicPricingPath } from '@wondertales/shared';
import { useChildren } from '@/api/children';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Drawer = createDrawerNavigator<MainDrawerParamList>();

// Wrapper components to avoid inline functions (prevents state loss and perf issues)
function WizardScreenWithAuth() {
  const route = useRoute<RouteProp<MainDrawerParamList, 'Wizard'>>();
  const { user, sessionMode, activeChild } = useAuthStore();
  const isChildSession = sessionMode === 'child';
  const routeChildId = route.params?.childId;
  const { data: childrenData } = useChildren(!isChildSession && Boolean(routeChildId));
  const routeChild = routeChildId
    ? childrenData?.children.find((child) => child.id === routeChildId)
    : undefined;
  const needsRouteChildMode =
    !isChildSession && Boolean(routeChildId) && !route.params?.storyCreationMode && !childrenData;
  const storyCreationMode =
    route.params?.storyCreationMode ||
    (isChildSession ? activeChild?.storyCreationMode : routeChild?.storyCreationMode) ||
    user?.mode ||
    'instant';
  const isInstantMode = storyCreationMode === 'instant';
  if (needsRouteChildMode) {
    return (
      <AuthGuard>
        <View style={styles.centeredLoader}>
          <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        </View>
      </AuthGuard>
    );
  }
  return <AuthGuard>{isInstantMode ? <InstantWizardScreen /> : <WizardScreen />}</AuthGuard>;
}
function DashboardScreenWithAuth() {
  return (
    <AuthGuard>
      <DashboardScreen />
    </AuthGuard>
  );
}
function LibraryScreenWithAuth() {
  return (
    <AuthGuard>
      <LibraryScreen />
    </AuthGuard>
  );
}
function ArtifactsScreenWithAuth() {
  return (
    <AuthGuard>
      <ArtifactsScreen />
    </AuthGuard>
  );
}
function MapTilesScreenWithAuth() {
  return (
    <AuthGuard>
      <MapTilesScreen />
    </AuthGuard>
  );
}
function SeriesListScreenWithAuth() {
  const { sessionMode, activeChild } = useAuthStore();
  const childCanReadFamilyStories =
    sessionMode === 'child' &&
    activeChild?.childMode?.childModeSettings?.allowSharedFamilyStories === true;
  if (sessionMode === 'child' && !childCanReadFamilyStories) {
    return (
      <AuthGuard>
        <NotFoundScreen />
      </AuthGuard>
    );
  }
  return (
    <AuthGuard>
      <SeriesListScreen />
    </AuthGuard>
  );
}
function SeriesDetailScreenWithAuth() {
  const { sessionMode, activeChild } = useAuthStore();
  const childCanReadFamilyStories =
    sessionMode === 'child' &&
    activeChild?.childMode?.childModeSettings?.allowSharedFamilyStories === true;
  if (sessionMode === 'child' && !childCanReadFamilyStories) {
    return (
      <AuthGuard>
        <NotFoundScreen />
      </AuthGuard>
    );
  }
  return (
    <AuthGuard>
      <SeriesDetailScreen />
    </AuthGuard>
  );
}
function StoryReaderScreenWithAuth() {
  return (
    <AuthGuard>
      <StoryReaderScreen />
    </AuthGuard>
  );
}
function ChildrenScreenWithAuth() {
  const sessionMode = useAuthStore((state) => state.sessionMode);
  if (sessionMode === 'child') {
    return (
      <AuthGuard>
        <NotFoundScreen />
      </AuthGuard>
    );
  }
  return (
    <AuthGuard>
      <ChildrenScreen />
    </AuthGuard>
  );
}
function ChildDetailScreenWithAuth() {
  const sessionMode = useAuthStore((state) => state.sessionMode);
  if (sessionMode === 'child') {
    return (
      <AuthGuard>
        <NotFoundScreen />
      </AuthGuard>
    );
  }
  return (
    <AuthGuard>
      <ChildDetailScreen />
    </AuthGuard>
  );
}
function CharactersScreenWithAuth() {
  return (
    <AuthGuard>
      <CharactersScreen />
    </AuthGuard>
  );
}
function ProfileScreenWithAuth() {
  const sessionMode = useAuthStore((state) => state.sessionMode);
  if (sessionMode === 'child') {
    return (
      <AuthGuard>
        <NotFoundScreen />
      </AuthGuard>
    );
  }
  return (
    <AuthGuard>
      <ProfileScreen />
    </AuthGuard>
  );
}
function PlansScreenWithAccess() {
  const { i18n } = useTranslation();
  const { isAuthenticated, sessionMode } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated && Platform.OS === 'web') {
      replaceWebLocation(buildPublicPricingPath(i18n.language));
    }
  }, [isAuthenticated, i18n.language]);

  if (isAuthenticated && sessionMode === 'child') {
    return <NotFoundScreen />;
  }

  if (!isAuthenticated && Platform.OS === 'web') {
    return null;
  }

  return <PlansScreen />;
}
function LanguageSettingsScreenWithAuth() {
  return (
    <AuthGuard>
      <LanguageSettingsScreen />
    </AuthGuard>
  );
}
function ThemeSettingsScreenWithAuth() {
  return (
    <AuthGuard>
      <ThemeSettingsScreen />
    </AuthGuard>
  );
}

const MOBILE_TAB_ORDER: (keyof MainTabParamList)[] = [
  'Dashboard',
  'Wizard',
  'Library',
  'Characters',
];
const TABLET_TAB_ORDER: (keyof MainTabParamList)[] = [
  'Dashboard',
  'Wizard',
  'Library',
  'Artifacts',
  'MapTiles',
  'Children',
  'Characters',
  'Plans',
  'Profile',
];
const MORE_MENU_ROUTES: (keyof MainTabParamList)[] = [
  'Series',
  'Artifacts',
  'MapTiles',
  'Stories',
  'Children',
  'Plans',
  'Profile',
];
const MOBILE_TAB_ORDER_CHILD: (keyof MainTabParamList)[] = [
  'Dashboard',
  'Wizard',
  'Library',
  'Characters',
];
const TABLET_TAB_ORDER_CHILD: (keyof MainTabParamList)[] = [
  'Dashboard',
  'Wizard',
  'Library',
  'Characters',
  'Artifacts',
  'MapTiles',
  'Series',
  'Stories',
];
const MORE_MENU_ROUTES_CHILD: (keyof MainTabParamList)[] = [
  'Series',
  'Artifacts',
  'MapTiles',
  'Stories',
];

const MOBILE_TAB_ORDER_PUBLIC: (keyof MainTabParamList)[] = ['Welcome', 'Stories'];
const TABLET_TAB_ORDER_PUBLIC: (keyof MainTabParamList)[] = ['Welcome', 'Stories'];
const MORE_MENU_ROUTES_PUBLIC: (keyof MainTabParamList)[] = [];

const TAB_LABELS: Record<string, string> = {
  Welcome: 'navigation.tab_dashboard',
  Dashboard: 'navigation.tab_dashboard',
  Wizard: 'navigation.tab_create_story',
  Library: 'navigation.tab_library',
  Artifacts: 'navigation.tab_artifacts',
  MapTiles: 'navigation.tab_map_tiles',
  Characters: 'navigation.tab_characters',
  Children: 'navigation.tab_children',
  Plans: 'navigation.tab_plans',
  Profile: 'navigation.tab_profile',
  Stories: 'navigation.published_stories',
  Series: 'navigation.series',
};
const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Welcome: 'home-outline',
  Dashboard: 'home-outline',
  Wizard: 'create-outline',
  Library: 'library-outline',
  Artifacts: 'sparkles-outline',
  MapTiles: 'map-outline',
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
  const sessionMode = useAuthStore((auth) => auth.sessionMode);
  const activeChild = useAuthStore((auth) => auth.activeChild);
  const isChildSession = isAuthenticated && sessionMode === 'child';
  const childCanReadPublicStories =
    isChildSession && activeChild?.childMode?.childModeSettings?.publicStoriesEnabled === true;
  const childCanReadFamilyStories =
    isChildSession && activeChild?.childMode?.childModeSettings?.allowSharedFamilyStories === true;
  const activeRouteName = state.routes[state.index]?.name;
  const moreMenuRoutes = isChildSession
    ? MORE_MENU_ROUTES_CHILD.filter(
        (name) =>
          (name !== 'Stories' || childCanReadPublicStories) &&
          (name !== 'Series' || childCanReadFamilyStories)
      )
    : isAuthenticated
      ? MORE_MENU_ROUTES
      : MORE_MENU_ROUTES_PUBLIC;
  const isMoreActive = moreMenuRoutes.includes(activeRouteName as keyof MainTabParamList);

  const tabOrder = isChildSession
    ? (isTablet ? TABLET_TAB_ORDER_CHILD : MOBILE_TAB_ORDER_CHILD).filter(
        (name) =>
          (name !== 'Stories' || childCanReadPublicStories) &&
          (name !== 'Series' || childCanReadFamilyStories)
      )
    : isAuthenticated
      ? isTablet
        ? TABLET_TAB_ORDER
        : MOBILE_TAB_ORDER
      : isTablet
        ? TABLET_TAB_ORDER_PUBLIC
        : MOBILE_TAB_ORDER_PUBLIC;
  const showMoreButton = isAuthenticated && !isTablet && moreMenuRoutes.length > 0;

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

  const moreMenuItems: {
    name: keyof MainTabParamList;
    icon: keyof typeof Ionicons.glyphMap;
    labelKey: string;
  }[] = isChildSession
    ? [
        ...(childCanReadFamilyStories
          ? [
              {
                name: 'Series' as const,
                icon: 'layers-outline' as const,
                labelKey: 'navigation.series',
              },
            ]
          : []),
        { name: 'Artifacts', icon: 'sparkles-outline', labelKey: 'navigation.artifacts' },
        { name: 'MapTiles', icon: 'map-outline', labelKey: 'navigation.map_tiles' },
        ...(childCanReadPublicStories
          ? [
              {
                name: 'Stories' as const,
                icon: 'newspaper-outline' as const,
                labelKey: 'navigation.published_stories',
              },
            ]
          : []),
      ]
    : isAuthenticated
      ? [
          { name: 'Series', icon: 'layers-outline', labelKey: 'navigation.series' },
          { name: 'Artifacts', icon: 'sparkles-outline', labelKey: 'navigation.artifacts' },
          { name: 'MapTiles', icon: 'map-outline', labelKey: 'navigation.map_tiles' },
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
              testID={`nav-tab-${name}`}
            >
              <Ionicons name={TAB_ICONS[name]} size={24} color={color} />
              <Text style={[mobileTabBarStyles.tabLabel, { color }]} numberOfLines={2}>
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
            testID="nav-tab-more"
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={24}
              color={isMoreActive ? theme.colors.interactive.primary : theme.colors.text.tertiary}
            />
            <Text
              style={[
                mobileTabBarStyles.tabLabel,
                {
                  color: isMoreActive
                    ? theme.colors.interactive.primary
                    : theme.colors.text.tertiary,
                },
              ]}
              numberOfLines={2}
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
                testID={`nav-more-${item.name}`}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={
                    activeRouteName === item.name
                      ? theme.colors.interactive.primary
                      : theme.colors.text.primary
                  }
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

const styles = StyleSheet.create({
  centeredLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: modernColors.page,
  },
});

const mobileTabBarStyles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: modernColors.surface,
    borderTopWidth: 1,
    borderTopColor: modernColors.border,
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
    width: '100%',
    minHeight: 28,
    paddingHorizontal: 2,
    fontSize: theme.typography.fontSize.xs,
    lineHeight: 14,
    marginTop: theme.spacing[1],
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  moreMenu: {
    backgroundColor: modernColors.surface,
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
  const { user, isAuthenticated, sessionMode } = useAuthStore();
  const isChildSession = isAuthenticated && sessionMode === 'child';
  const profileSwitcherAvatarUrl = user?.avatarUrl
    ? (formatAssetUrl(user.avatarUrl) ?? user.avatarUrl)
    : null;

  return (
    <Tab.Navigator
      key={isChildSession ? 'child' : isAuthenticated ? 'auth' : 'public'}
      initialRouteName={isAuthenticated ? 'Dashboard' : 'Welcome'}
      backBehavior="history"
      screenOptions={{
        headerShown: true,
        headerLeft: isAuthenticated
          ? () => <ChildProfileSwitcher autoLoad fallbackAvatarUrl={profileSwitcherAvatarUrl} />
          : undefined,
        headerStyle: {
          backgroundColor: modernColors.surface,
        },
        headerShadowVisible: false,
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
        name="Welcome"
        component={WelcomeScreen}
        options={{
          title: t('auth.welcome'),
          tabBarLabel: t('navigation.tab_dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
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
        name="ChildModeRecovery"
        component={ChildModeRecoveryScreen}
        options={{
          title: t('child_mode.recovery_complete_title', {
            defaultValue: 'Opening parent area',
          }),
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
        component={DashboardScreenWithAuth}
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
        component={WizardScreenWithAuth}
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
        component={LibraryScreenWithAuth}
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
        name="Artifacts"
        component={ArtifactsScreenWithAuth}
        options={{
          title: t('navigation.artifacts'),
          tabBarLabel: t('navigation.tab_artifacts'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated ? () => null : undefined,
        }}
      />
      <Tab.Screen
        name="MapTiles"
        component={MapTilesScreenWithAuth}
        options={{
          title: t('navigation.map_tiles'),
          tabBarLabel: t('navigation.tab_map_tiles'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated ? () => null : undefined,
        }}
      />
      <Tab.Screen
        name="Series"
        component={SeriesListScreenWithAuth}
        options={{
          title: 'Series',
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="SeriesDetail"
        component={SeriesDetailScreenWithAuth}
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
        component={StoryReaderScreenWithAuth}
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
        name="AuthorProfile"
        component={AuthorProfileScreen}
        options={{
          title: 'Author',
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
      <Tab.Screen
        name="Children"
        component={ChildrenScreenWithAuth}
        options={{
          title: t('navigation.children'),
          tabBarLabel: t('navigation.tab_children'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated || isChildSession ? () => null : undefined,
        }}
      />
      <Tab.Screen
        name="ChildDetail"
        component={ChildDetailScreenWithAuth}
        options={{
          title: t('navigation.children'),
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="Characters"
        component={CharactersScreenWithAuth}
        options={{
          title: t('navigation.characters'),
          tabBarLabel: t('navigation.tab_characters'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="body-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated ? () => null : undefined,
        }}
      />
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
        component={PlansScreenWithAccess}
        options={{
          title: t('navigation.plans'),
          tabBarLabel: t('navigation.tab_plans'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="diamond-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated || isChildSession ? () => null : undefined,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreenWithAuth}
        options={{
          title: t('navigation.profile'),
          tabBarLabel: t('navigation.tab_profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          tabBarButton: !isAuthenticated || isChildSession ? () => null : undefined,
        }}
      />
      <Tab.Screen
        name="LanguageSettings"
        component={LanguageSettingsScreenWithAuth}
        options={{
          title: t('profile.language_settings'),
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="ThemeSettings"
        component={ThemeSettingsScreenWithAuth}
        options={{
          title: t('profile.theme_settings'),
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
    <TouchableOpacity onPress={toggle} style={{ paddingHorizontal: 16 }}>
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
  const { isAuthenticated, sessionMode, activeChild } = useAuthStore();
  const collapsed = useDrawerCollapsedStore((s) => s.collapsed);
  const isChildSession = isAuthenticated && sessionMode === 'child';
  const childCanReadPublicStories =
    isChildSession && activeChild?.childMode?.childModeSettings?.publicStoriesEnabled === true;
  const childCanReadFamilyStories =
    isChildSession && activeChild?.childMode?.childModeSettings?.allowSharedFamilyStories === true;

  const drawerWidth = collapsed
    ? theme.layout.drawer.widthCollapsed
    : isDesktop
      ? theme.layout.drawer.widthDesktop
      : theme.layout.drawer.widthTablet;

  return (
    <Drawer.Navigator
      key={isChildSession ? 'child' : isAuthenticated ? 'auth' : 'public'}
      initialRouteName={isAuthenticated ? 'Dashboard' : 'Welcome'}
      backBehavior="history"
      drawerContent={(props) => <CollapsibleDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        drawerType: isDesktop ? 'permanent' : 'front',
        drawerActiveTintColor: theme.colors.interactive.primary,
        drawerInactiveTintColor: theme.colors.text.tertiary,
        drawerStyle: { width: drawerWidth, backgroundColor: modernColors.surfaceRaised },
        headerStyle: {
          backgroundColor: modernColors.surfaceRaised,
        },
        headerShadowVisible: false,
        headerLeftContainerStyle: isDesktop ? { paddingLeft: theme.spacing[4] } : undefined,
        headerRightContainerStyle: isDesktop ? { paddingRight: theme.spacing[5] } : undefined,
        headerLeft: isTablet || isDesktop ? () => <DrawerBurgerButton /> : undefined,
      }}
    >
      <Drawer.Screen
        name="Welcome"
        component={WelcomeScreen}
        options={{
          title: t('auth.welcome'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
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
        name="ChildModeRecovery"
        component={ChildModeRecoveryScreen}
        options={{
          title: t('child_mode.recovery_complete_title', {
            defaultValue: 'Opening parent area',
          }),
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
        component={DashboardScreenWithAuth}
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
        component={WizardScreenWithAuth}
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
        component={LibraryScreenWithAuth}
        options={{
          title: t('navigation.library'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen
        name="Artifacts"
        component={ArtifactsScreenWithAuth}
        options={{
          title: t('navigation.artifacts'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen
        name="MapTiles"
        component={MapTilesScreenWithAuth}
        options={{
          title: t('navigation.map_tiles'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen
        name="Series"
        component={SeriesListScreenWithAuth}
        options={{
          title: t('navigation.series'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="layers-outline" size={size} color={color} />
          ),
          drawerItemStyle:
            !isAuthenticated || (isChildSession && !childCanReadFamilyStories)
              ? { display: 'none' }
              : undefined,
        }}
      />
      <Drawer.Screen
        name="SeriesDetail"
        component={SeriesDetailScreenWithAuth}
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
        component={StoryReaderScreenWithAuth}
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
          drawerItemStyle:
            isChildSession && !childCanReadPublicStories ? { display: 'none' } : undefined,
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
        name="AuthorProfile"
        component={AuthorProfileScreen}
        options={{
          title: 'Author',
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
      <Drawer.Screen
        name="Children"
        component={ChildrenScreenWithAuth}
        options={{
          title: t('navigation.children'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated || isChildSession ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen
        name="ChildDetail"
        component={ChildDetailScreenWithAuth}
        options={{
          title: t('navigation.children'),
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="Characters"
        component={CharactersScreenWithAuth}
        options={{
          title: t('navigation.characters'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="body-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated ? { display: 'none' } : undefined,
        }}
      />
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
        component={PlansScreenWithAccess}
        options={{
          title: t('navigation.plans'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="diamond-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated || isChildSession ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen
        name="Profile"
        component={ProfileScreenWithAuth}
        options={{
          title: t('navigation.profile'),
          drawerIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          drawerItemStyle: !isAuthenticated || isChildSession ? { display: 'none' } : undefined,
        }}
      />
      <Drawer.Screen
        name="LanguageSettings"
        component={LanguageSettingsScreenWithAuth}
        options={{
          title: t('profile.language_settings'),
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="ThemeSettings"
        component={ThemeSettingsScreenWithAuth}
        options={{
          title: t('profile.theme_settings'),
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
