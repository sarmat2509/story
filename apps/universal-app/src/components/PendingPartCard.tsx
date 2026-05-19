import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';

interface Props {
  partNumber: number;
}

export function PendingPartCard({ partNumber }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.placeholderContainer}>
        <Image
          source={require('../../assets/images/series-pending-placeholder.png')}
          style={styles.placeholderImage}
          resizeMode="cover"
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>{t('series.expecting_part', { number: partNumber })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    overflow: 'hidden',
  },
  placeholderContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.background.tertiary,
    overflow: 'hidden',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
  },
  content: {
    padding: theme.spacing[4],
  },
  label: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
});
