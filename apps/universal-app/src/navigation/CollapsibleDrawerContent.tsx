import React, { useEffect, useRef } from 'react';
import {
  Animated,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
  View,
} from 'react-native';
import {
  CommonActions,
  DrawerActions,
  useLinkBuilder,
} from '@react-navigation/native';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { PlatformPressable, Text } from '@react-navigation/elements';
import Color from 'color';
import type { Route } from '@react-navigation/native';
import { useDrawerCollapsedStore } from '@/store/drawerCollapsedStore';
import { theme } from '@/theme';

const LABEL_ANIMATION_DURATION = 250;
const COLLAPSED_HIGHLIGHT_SIZE = 48; // icon 24 + padding 12 each side

function isItemHidden(
  drawerItemStyle?: StyleProp<ViewStyle>
): boolean {
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
  onPress: () => void;
  href?: string;
};

function CollapsibleDrawerItem({
  route,
  focused,
  descriptors,
  state,
  navigation,
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
  const inactiveTintColor =
    drawerInactiveTintColor ?? theme.colors.text.tertiary;
  const color = focused ? activeTintColor : inactiveTintColor;
  const activeBackgroundColor =
    drawerActiveBackgroundColor ??
    Color(activeTintColor).alpha(0.12).rgb().string();
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

  const iconNode = drawerIcon
    ? drawerIcon({ size: 24, focused, color })
    : null;

  return (
    <View
      style={[
        styles.itemContainer,
        { backgroundColor },
        collapsed && {
          alignSelf: 'center',
          justifyContent: 'center',
          alignItems: 'center',
        },
        drawerItemStyle,
      ]}
    >
      <PlatformPressable
        onPress={onPress}
        role="button"
        href={href}
        pressColor={undefined}
        pressOpacity={0.7}
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
                numberOfLines={1}
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
  const focusedRoute = state.routes[state.index];
  const focusedDescriptor = descriptors[focusedRoute.key];
  const focusedOptions = focusedDescriptor.options;
  const { drawerContentStyle, drawerContentContainerStyle } = focusedOptions;
  const { buildHref } = useLinkBuilder();

  const visibleRoutes = state.routes.filter(
    (route) => !isItemHidden(descriptors[route.key].options.drawerItemStyle)
  );

  return (
    <DrawerContentScrollView
      {...rest}
      contentContainerStyle={drawerContentContainerStyle}
      style={drawerContentStyle}
    >
      {visibleRoutes.map((route, i) => {
        const focused = state.routes[state.index].key === route.key;
        const onPress = () => {
          const event = navigation.emit({
            type: 'drawerItemPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!event.defaultPrevented) {
            navigation.dispatch({
              ...(focused
                ? DrawerActions.closeDrawer()
                : CommonActions.navigate(route)),
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
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    borderRadius: COLLAPSED_HIGHLIGHT_SIZE / 2,
    overflow: 'hidden',
  },
  itemWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing[3],
  },
  itemWrapperCollapsed: {
    justifyContent: 'center',
  },
  labelContainer: {
    flex: 1,
    marginEnd: 12,
    marginVertical: 4,
    overflow: 'hidden',
  },
  labelContainerCollapsed: {
    flex: 0,
    width: 0,
    marginEnd: 0,
    marginStart: 0,
  },
  labelText: {
    lineHeight: 24,
    textAlignVertical: 'center',
    fontSize: theme.typography.fontSize.base,
  },
});
