import React, { useEffect, useRef } from 'react';
import { Animated, Platform, type StyleProp, StyleSheet, type ViewStyle, View } from 'react-native';
import {
  CommonActions,
  DrawerActions,
  type NavigationProp,
  useLinkBuilder,
} from '@react-navigation/native';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { PlatformPressable, Text } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Route } from '@react-navigation/native';
import { useDrawerCollapsedStore } from '@/store/drawerCollapsedStore';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme';
import { modernColors } from '@/theme/modernTheme';
import { ChildAvatarImage, ChildProfileSwitcher } from '@/navigation/ChildProfileSwitcher';
import type { RootStackParamList } from '@/types/navigation';
import { useProductTour } from '@/features/productTour/ProductTourProvider';
import { useResponsive } from '@/hooks/useResponsive';

const LABEL_ANIMATION_DURATION = 250;
const COLLAPSED_HIGHLIGHT_SIZE = 48; // icon 24 + padding 12 each side
const NAV_ITEM_HEIGHT = 44;

function isItemHidden(drawerItemStyle?: StyleProp<ViewStyle>): boolean {
  if (!drawerItemStyle) return false;
  const flat = StyleSheet.flatten(drawerItemStyle);
  return (flat as { display?: string })?.display === 'none';
}

type CollapsibleDrawerItemProps = {
  route: Route<string>;
  focused: boolean;
  descriptors: DrawerContentComponentProps['descriptors'];
  state: DrawerContentComponentProps['state'];
  navigation: DrawerContentComponentProps['navigation'];
  // state and navigation used by parent, passed for type consistency
  onPress: () => void;
  href?: string;
};

function CollapsibleDrawerItem({
  route,
  focused,
  descriptors,
  state: _state,
  navigation: _navigation,
  onPress,
  href,
}: CollapsibleDrawerItemProps) {
  const collapsed = useDrawerCollapsedStore((s) => s.collapsed);
  const labelOpacity = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(labelOpacity, {
      toValue: collapsed ? 0 : 1,
      duration: LABEL_ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();
  }, [collapsed, labelOpacity]);

  const descriptor = descriptors[route.key];
  const options = descriptor.options;
  const {
    drawerActiveTintColor,
    drawerInactiveTintColor,
    drawerActiveBackgroundColor,
    drawerInactiveBackgroundColor,
    drawerIcon,
    drawerLabel,
    drawerLabelStyle,
    drawerItemStyle,
    drawerAllowFontScaling,
    title,
  } = options;

  const activeTintColor = drawerActiveTintColor ?? theme.colors.interactive.primary;
  const inactiveTintColor = drawerInactiveTintColor ?? theme.colors.text.tertiary;
  const color = focused ? activeTintColor : inactiveTintColor;
  const activeBackgroundColor = drawerActiveBackgroundColor ?? modernColors.accentWash;
  const inactiveBackgroundColor = drawerInactiveBackgroundColor ?? 'transparent';
  const backgroundColor = focused ? activeBackgroundColor : inactiveBackgroundColor;

  const label =
    drawerLabel !== undefined
      ? typeof drawerLabel === 'string'
        ? drawerLabel
        : drawerLabel({ color, focused })
      : title !== undefined
        ? title
        : route.name;

  const iconNode = drawerIcon ? drawerIcon({ size: 24, focused, color }) : null;

  return (
    <View
      style={[
        styles.itemContainer,
        { backgroundColor },
        collapsed && styles.itemContainerCollapsed,
        drawerItemStyle,
      ]}
    >
      <PlatformPressable
        onPress={onPress}
        role="button"
        href={href}
        pressColor={undefined}
        pressOpacity={0.7}
        style={styles.itemPressable}
        testID={`nav-drawer-${route.name}`}
      >
        <View style={[styles.itemWrapper, collapsed && styles.itemWrapperCollapsed]}>
          {iconNode}
          <Animated.View
            style={[
              styles.labelContainer,
              { marginStart: iconNode ? 12 : 0 },
              collapsed && styles.labelContainerCollapsed,
              { opacity: labelOpacity },
            ]}
          >
            {typeof label === 'string' ? (
              <Text
                numberOfLines={2}
                allowFontScaling={drawerAllowFontScaling}
                style={[styles.labelText, { color }, drawerLabelStyle]}
              >
                {label}
              </Text>
            ) : (
              label
            )}
          </Animated.View>
        </View>
      </PlatformPressable>
    </View>
  );
}

export function CollapsibleDrawerContent(props: DrawerContentComponentProps) {
  const { state, navigation, descriptors, ...rest } = props;
  const user = useAuthStore((s) => s.user);
  const sessionMode = useAuthStore((s) => s.sessionMode);
  const activeChild = useAuthStore((s) => s.activeChild);
  const { t } = useTranslation();
  const focusedRoute = state.routes[state.index];
  const focusedDescriptor = descriptors[focusedRoute.key];
  const focusedOptions = focusedDescriptor.options;
  const { drawerContentStyle, drawerContentContainerStyle } = focusedOptions;
  const { buildHref } = useLinkBuilder();
  const collapsed = useDrawerCollapsedStore((s) => s.collapsed);
  const { start: startProductTour } = useProductTour();
  const { isDesktop } = useResponsive();
  const handleAdminPress = () => {
    const rootNavigation = navigation.getParent<NavigationProp<RootStackParamList>>();
    rootNavigation?.navigate('Admin', { screen: 'AdminDashboard' });
  };

  const visibleRoutes = state.routes.filter(
    (route) => !isItemHidden(descriptors[route.key].options.drawerItemStyle)
  );
  const isChildSession = sessionMode === 'child' && activeChild;

  return (
    <DrawerContentScrollView
      {...rest}
      contentContainerStyle={[drawerContentContainerStyle, styles.scrollContent]}
      style={drawerContentStyle}
    >
      <View style={styles.scrollInner}>
        <View>
          {user ? (
            <ChildProfileSwitcher
              autoLoad
              menuStyle={styles.childSwitcherMenu}
              renderTrigger={({ avatarUrl, fallbackInitial, open }) => (
                <PlatformPressable
                  onPress={open}
                  role="button"
                  pressColor={undefined}
                  pressOpacity={0.75}
                >
                  <View
                    style={[styles.childSessionCard, collapsed && styles.childSessionCardCollapsed]}
                  >
                    {avatarUrl ? (
                      <ChildAvatarImage
                        uri={avatarUrl}
                        style={styles.childAvatar}
                      />
                    ) : fallbackInitial ? (
                      <View style={styles.childAvatarFallback}>
                        <Text style={styles.childAvatarInitial}>{fallbackInitial}</Text>
                      </View>
                    ) : (
                      <View style={styles.childAvatarFallback}>
                        <Ionicons
                          name="person-circle-outline"
                          size={28}
                          color={theme.colors.interactive.primary}
                        />
                      </View>
                    )}
                    {!collapsed ? (
                      <View style={styles.childSessionCopy}>
                        <Text style={styles.childSessionLabel} numberOfLines={1}>
                          {isChildSession
                            ? t('child_mode.title')
                            : t('child_mode.switcher_title', { defaultValue: 'Profiles' })}
                        </Text>
                        <Text style={styles.childSessionName} numberOfLines={1}>
                          {isChildSession
                            ? activeChild?.name
                            : user.displayName ||
                              user.email ||
                              t('child_mode.parent_profile', { defaultValue: 'Parent profile' })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </PlatformPressable>
              )}
            />
          ) : null}
          {visibleRoutes.map((route) => {
            const focused = state.routes[state.index].key === route.key;
            const onPress = () => {
              const event = navigation.emit({
                type: 'drawerItemPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!event.defaultPrevented) {
                // A scheduler is an alternate Wizard mode, never the default destination of
                // the main "Create story" navigation item. Explicitly replace its params so
                // returning through the drawer cannot retain scheduler=true from this route.
                const action =
                  route.name === 'Wizard'
                    ? CommonActions.navigate({
                        name: 'Wizard',
                        params: {},
                        merge: false,
                      })
                    : focused
                      ? DrawerActions.closeDrawer()
                      : CommonActions.navigate(route);
                navigation.dispatch({
                  ...action,
                  target: state.key,
                });
              }
            };

            return (
              <CollapsibleDrawerItem
                key={route.key}
                route={route}
                focused={focused}
                descriptors={descriptors}
                state={state}
                navigation={navigation}
                onPress={onPress}
                href={buildHref(route.name, route.params)}
              />
            );
          })}
          {Platform.OS === 'web' && user?.role === 'admin' && !isChildSession ? (
            <View
              style={[
                styles.itemContainer,
                { backgroundColor: 'transparent' },
                collapsed && styles.itemContainerCollapsed,
              ]}
            >
              <PlatformPressable
                onPress={handleAdminPress}
                role="button"
                href="/admin/stories"
                pressColor={undefined}
                pressOpacity={0.7}
                style={styles.itemPressable}
                testID="nav-drawer-Admin"
              >
                <View style={[styles.itemWrapper, collapsed && styles.itemWrapperCollapsed]}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={24}
                    color={theme.colors.interactive.primary}
                  />
                  {!collapsed ? (
                    <View style={[styles.labelContainer, styles.adminLabelContainer]}>
                      <Text numberOfLines={2} style={[styles.labelText, styles.adminLabel]}>
                        {t('navigation.admin', { defaultValue: 'Admin' })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </PlatformPressable>
            </View>
          ) : null}
        </View>
        {__DEV__ ? (
          <View style={[styles.devBadge, collapsed && styles.devBadgeCollapsed]}>
            <Text style={styles.devBadgeText}>DEV</Text>
          </View>
        ) : null}
        {Platform.OS === 'web' && isDesktop && user && !isChildSession ? (
          <View style={styles.productTourItem}>
            <PlatformPressable
              onPress={startProductTour}
              role="button"
              accessibilityLabel={t('product_tour.restart')}
              pressColor={undefined}
              pressOpacity={0.7}
              style={styles.productTourButton}
              testID="nav-drawer-product-tour"
            >
              <Ionicons name="help" size={17} color={theme.colors.interactive.primary} />
            </PlatformPressable>
          </View>
        ) : null}
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  scrollInner: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: '100%',
    paddingBottom: theme.spacing[4],
  },
  itemContainer: {
    height: NAV_ITEM_HEIGHT,
    marginHorizontal: theme.spacing[2],
    marginBottom: 0,
    borderRadius: 18,
    overflow: 'hidden',
  },
  itemPressable: {
    height: '100%',
  },
  itemContainerCollapsed: {
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    width: COLLAPSED_HIGHLIGHT_SIZE,
  },
  itemWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: theme.spacing[3],
  },
  itemWrapperCollapsed: {
    width: COLLAPSED_HIGHLIGHT_SIZE,
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  labelContainer: {
    flex: 1,
    marginEnd: 12,
    overflow: 'hidden',
  },
  labelContainerCollapsed: {
    flex: 0,
    width: 0,
    marginEnd: 0,
    marginStart: 0,
  },
  labelText: {
    lineHeight: 18,
    textAlignVertical: 'center',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  adminLabelContainer: {
    marginStart: 12,
  },
  adminLabel: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  childSessionCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    marginHorizontal: theme.spacing[2],
    marginBottom: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borders.radius.xl,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceMuted,
  },
  childSessionCardCollapsed: {
    width: COLLAPSED_HIGHLIGHT_SIZE,
    height: COLLAPSED_HIGHLIGHT_SIZE,
    minHeight: COLLAPSED_HIGHLIGHT_SIZE,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: COLLAPSED_HIGHLIGHT_SIZE / 2,
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background.tertiary,
  },
  childAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  childAvatarInitial: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
  childSessionCopy: {
    flex: 1,
    minWidth: 0,
  },
  childSessionLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
  },
  childSessionName: {
    marginTop: 2,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  childSwitcherMenu: {
    top: Platform.OS === 'web' ? theme.spacing[3] : 78,
    left: theme.spacing[3],
  },
  devBadge: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    backgroundColor: modernColors.surfaceMuted,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
  },
  productTourItem: {
    alignSelf: 'center',
    marginTop: theme.spacing[2],
  },
  productTourButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceMuted,
  },
  devBadgeCollapsed: {
    alignSelf: 'center',
    minWidth: COLLAPSED_HIGHLIGHT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  devBadgeText: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 0.6,
  },
});
