import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

type AdminRouteName =
  | 'AdminDashboard'
  | 'AdminStories'
  | 'AdminUsers'
  | 'AdminDiscountCodes'
  | 'AdminFeedback'
  | 'AdminPrivacyRequests'
  | 'AdminValidations'
  | 'AdminContentConfig'
  | 'AdminVoices';

const sections: Array<{
  title: string;
  items: Array<{ key: AdminRouteName; label: string; routeName: AdminRouteName }>;
}> = [
  {
    title: 'Operations',
    items: [
      { key: 'AdminDashboard', label: 'Dashboard', routeName: 'AdminDashboard' },
      { key: 'AdminStories', label: 'Stories', routeName: 'AdminStories' },
      { key: 'AdminUsers', label: 'Users', routeName: 'AdminUsers' },
      { key: 'AdminDiscountCodes', label: 'Discounts', routeName: 'AdminDiscountCodes' },
      { key: 'AdminFeedback', label: 'Feedback', routeName: 'AdminFeedback' },
      { key: 'AdminPrivacyRequests', label: 'Privacy Requests', routeName: 'AdminPrivacyRequests' },
      { key: 'AdminValidations', label: 'Validations', routeName: 'AdminValidations' },
    ],
  },
  {
    title: 'Content',
    items: [
      { key: 'AdminContentConfig', label: 'Content Config', routeName: 'AdminContentConfig' },
      { key: 'AdminVoices', label: 'Voices', routeName: 'AdminVoices' },
    ],
  },
];

export function AdminLayout({
  navigation,
  activeRoute,
  title,
  children,
  panelStyle,
}: {
  navigation: NavigationProp<AdminStackParamList>;
  activeRoute: AdminRouteName;
  title: string;
  children: React.ReactNode;
  panelStyle?: object;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title}</Text>

      <View style={[styles.shell, Platform.OS === 'web' && styles.shellWeb]}>
        <View style={styles.sidebar}>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionLinks}>
                {section.items.map((item) => {
                  const isActive = activeRoute === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.navButton, isActive && styles.navButtonActive]}
                      onPress={() => navigation.navigate(item.routeName as never)}
                    >
                      <Text style={[styles.navText, isActive && styles.navTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.panel, panelStyle]}>{children}</View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
  },
  content: {
    padding: 24,
    gap: 16,
    flexGrow: 1,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 20,
    flex: 1,
    minHeight: 0,
  },
  shellWeb: {
    // @ts-ignore - viewport units are web-only
    minHeight: 'calc(100vh - 120px)',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    backgroundColor: theme.colors.background.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionLinks: {
    gap: 8,
  },
  navButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  navButtonActive: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  navText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  navTextActive: {
    color: theme.colors.text.inverse,
  },
  panel: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.background.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    padding: 20,
    gap: 16,
  },
});
