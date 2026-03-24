import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { theme } from '@/theme';

export default function NotFoundScreen() {
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.code}>404</Text>
      <Text style={styles.title}>{t('navigation.page_not_found')}</Text>
      <Text style={styles.message}>{t('navigation.page_not_found_message')}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Welcome')}
      >
        <Text style={styles.buttonText}>{t('navigation.go_home')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background.primary,
  },
  code: {
    fontSize: theme.typography.fontSize['6xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
    textAlign: 'center',
  },
  message: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginBottom: theme.spacing[8],
  },
  button: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
  },
  buttonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
