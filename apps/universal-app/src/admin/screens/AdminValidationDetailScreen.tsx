import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAdminImageValidation, useAdminRegenerateSceneImage } from '@/admin/api/admin';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';
import { formatAssetUrl } from '@/utils/assetUrl';

function toLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toUpperCase();
}

function isScalarValue(value: unknown): boolean {
  return (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function renderCharacterCards(characters: unknown[], keyPrefix: string): React.ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.characterRow}
    >
      {characters.map((character, index) => {
        const entries =
          character && typeof character === 'object' && !Array.isArray(character)
            ? Object.entries(character as Record<string, unknown>)
            : [['value', character]];

        return (
          <View key={`${keyPrefix}-${index}`} style={styles.characterCard}>
            <Text style={styles.characterCardTitle}>
              {typeof (character as Record<string, unknown>)?.name === 'string'
                ? String((character as Record<string, unknown>).name).toUpperCase()
                : `CHARACTER ${index + 1}`}
            </Text>
            <View style={styles.valueGroup}>
              {entries
                .filter(([key]) => key !== 'name')
                .map(([key, entry]) =>
                  isScalarValue(entry) ? (
                    <View key={`${keyPrefix}-${index}-${key}`} style={styles.booleanFieldRow}>
                      <Text style={styles.valueKey}>{toLabel(String(key))}</Text>
                      {renderStructuredValue(entry, `${keyPrefix}-${index}-${key}`)}
                    </View>
                  ) : (
                    <View key={`${keyPrefix}-${index}-${key}`} style={styles.valueRow}>
                      <Text style={styles.valueKey}>{toLabel(String(key))}</Text>
                      {renderStructuredValue(entry, `${keyPrefix}-${index}-${key}`)}
                    </View>
                  )
                )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function renderStructuredValue(value: unknown, keyPrefix: string = 'root'): React.ReactNode {
  if (value == null) return <Text style={styles.valueText}>n/a</Text>;
  if (typeof value === 'boolean') {
    return (
      <Ionicons
        name={value ? 'checkmark-circle' : 'close-circle'}
        size={18}
        color={value ? theme.colors.status.success : theme.colors.status.error}
      />
    );
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return <Text style={styles.valueText}>{String(value)}</Text>;
  }
  if (Array.isArray(value)) {
    const shouldRenderCharactersAsCards =
      keyPrefix.toLowerCase().includes('characters') &&
      value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));

    if (shouldRenderCharactersAsCards) {
      return renderCharacterCards(value, keyPrefix);
    }

    return (
      <View style={styles.valueGroup}>
        {value.map((entry, index) =>
          isScalarValue(entry) ? (
            <View key={`${keyPrefix}-${index}`} style={styles.booleanFieldRow}>
              <Text style={styles.valueKey}>{String(index + 1).padStart(2, '0')}</Text>
              {renderStructuredValue(entry, `${keyPrefix}-${index}`)}
            </View>
          ) : (
            <View key={`${keyPrefix}-${index}`} style={styles.valueRow}>
              <Text style={styles.valueKey}>{String(index + 1).padStart(2, '0')}</Text>
              {renderStructuredValue(entry, `${keyPrefix}-${index}`)}
            </View>
          )
        )}
      </View>
    );
  }
  return (
    <View style={styles.valueGroup}>
      {Object.entries(value as Record<string, unknown>).map(([key, entry]) =>
        key === 'identityComparisonSummary' ? (
          <View key={`${keyPrefix}-${key}`} style={styles.valueRow}>
            <Text style={styles.valueKey}>{toLabel(key)}</Text>
            {renderStructuredValue(entry, `${keyPrefix}-${key}`)}
          </View>
        ) : isScalarValue(entry) ? (
          <View key={`${keyPrefix}-${key}`} style={styles.booleanFieldRow}>
            <Text style={styles.valueKey}>{toLabel(key)}</Text>
            {renderStructuredValue(entry, `${keyPrefix}-${key}`)}
          </View>
        ) : (
          <View key={`${keyPrefix}-${key}`} style={styles.inlineFieldRow}>
            <Text style={styles.valueKey}>{toLabel(key)}</Text>
            <View style={styles.inlineFieldValue}>
              {renderStructuredValue(entry, `${keyPrefix}-${key}`)}
            </View>
          </View>
        )
      )}
    </View>
  );
}

function DetailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={18} color={theme.colors.interactive.primary} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function AdminValidationDetailScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const route = useRoute<any>();
  const id = route.params?.id as string | undefined;
  const query = useAdminImageValidation(id);
  const regenerateMutation = useAdminRegenerateSceneImage();
  const item = query.data;
  const resultObject =
    item?.result && typeof item.result === 'object' && !Array.isArray(item.result)
      ? (item.result as Record<string, unknown>)
      : null;
  const resultCharacters = Array.isArray(resultObject?.characters) ? resultObject.characters : null;
  const resultSummary =
    resultObject && resultCharacters
      ? Object.fromEntries(Object.entries(resultObject).filter(([key]) => key !== 'characters'))
      : item?.result;

  return (
    <AdminLayout
      navigation={navigation}
      activeRoute="AdminValidations"
      title="Admin / Validation Detail"
    >
      <View style={styles.headerRow}>
        <Text style={styles.recordId}>{id ?? 'n/a'}</Text>
        <View style={styles.headerActions}>
          {item ? (
            <>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('AdminScenesStory', { storyId: item.storyId })}
              >
                <Text style={styles.secondaryButtonText}>Open story scenes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                disabled={regenerateMutation.isPending}
                onPress={() =>
                  regenerateMutation.mutate({
                    storyId: item.storyId,
                    sceneId: item.sceneIndex,
                  })
                }
              >
                <Text style={styles.primaryButtonText}>
                  {regenerateMutation.isPending
                    ? 'Queueing...'
                    : `Regenerate scene ${item.sceneIndex}`}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('AdminValidations')}
          >
            <Text style={styles.backButtonText}>Back to validations</Text>
          </TouchableOpacity>
        </View>
      </View>

      {regenerateMutation.isSuccess && item ? (
        <Text style={styles.statusSuccess}>
          Regeneration queued for story {item.storyId}, scene {item.sceneIndex}.
        </Text>
      ) : null}
      {regenerateMutation.error ? (
        <Text style={styles.statusError}>{(regenerateMutation.error as Error).message}</Text>
      ) : null}

      {query.isLoading ? <AdminLoadingState /> : null}
      {query.error ? <AdminErrorState message={(query.error as Error).message} /> : null}

      {item && !query.isLoading && !query.error ? (
        <ScrollView contentContainerStyle={styles.content}>
          <DetailCard title="Image" icon="image-outline">
            <Image
              source={{ uri: formatAssetUrl(item.imageUrl) ?? item.imageUrl }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            <View style={styles.valueGroup}>
              <View style={styles.booleanFieldRow}>
                <Text style={styles.valueKey}>STORY ID</Text>
                <Text style={styles.valueText}>{item.storyId}</Text>
              </View>
              <View style={styles.booleanFieldRow}>
                <Text style={styles.valueKey}>IMAGE STORAGE PATH</Text>
                <Text style={styles.valueText}>{item.imageStoragePath}</Text>
              </View>
            </View>
          </DetailCard>

          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <DetailCard title="Attempt" icon="analytics-outline">
                <View style={styles.valueGroup}>
                  <View style={styles.booleanFieldRow}>
                    <Text style={styles.valueKey}>SCENE</Text>
                    <Text style={styles.valueText}>{item.sceneIndex}</Text>
                  </View>
                  <View style={styles.booleanFieldRow}>
                    <Text style={styles.valueKey}>ATTEMPT</Text>
                    <Text style={styles.valueText}>{item.attempt}</Text>
                  </View>
                  <View style={styles.booleanFieldRow}>
                    <Text style={styles.valueKey}>VALIDATION SCORE</Text>
                    <Text style={styles.valueText}>{item.validationScore}</Text>
                  </View>
                  <View style={styles.booleanFieldRow}>
                    <Text style={styles.valueKey}>VISION MODEL</Text>
                    <Text style={styles.valueText}>{item.visionModel ?? 'n/a'}</Text>
                  </View>
                  <View style={styles.booleanFieldRow}>
                    <Text style={styles.valueKey}>COST</Text>
                    <Text style={styles.valueText}>
                      {item.usage?.costUsd != null ? `$${item.usage.costUsd.toFixed(8)}` : 'n/a'}
                    </Text>
                  </View>
                  <View style={styles.booleanFieldRow}>
                    <Text style={styles.valueKey}>DURATION</Text>
                    <Text style={styles.valueText}>
                      {item.usage?.durationMs != null ? `${item.usage.durationMs} ms` : 'n/a'}
                    </Text>
                  </View>
                  <View style={styles.booleanFieldRow}>
                    <Text style={styles.valueKey}>USAGE MATCH</Text>
                    <Text style={styles.valueText}>
                      {item.usage ? `${item.usage.matchedDeltaMs} ms` : 'n/a'}
                    </Text>
                  </View>
                  <View style={styles.booleanFieldRow}>
                    <Text style={styles.valueKey}>CREATED</Text>
                    <Text style={styles.valueText}>
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </DetailCard>
            </View>

            <View style={styles.column}>
              <DetailCard title="Result Summary" icon="document-text-outline">
                {renderStructuredValue(resultSummary, 'validation-result')}
              </DetailCard>
            </View>
          </View>

          {resultCharacters && resultCharacters.length > 0 ? (
            <DetailCard title="Characters" icon="people-outline">
              {renderCharacterCards(resultCharacters, 'validation-result-characters')}
            </DetailCard>
          ) : null}
        </ScrollView>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  recordId: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  backButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.secondary,
  },
  backButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  secondaryButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  primaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '700',
    fontSize: 14,
  },
  statusSuccess: {
    fontSize: 14,
    color: theme.colors.status.success,
  },
  statusError: {
    fontSize: 14,
    color: theme.colors.status.error,
  },
  content: {
    gap: 20,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  column: {
    flex: 1,
    minWidth: 320,
  },
  card: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    padding: 20,
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: theme.colors.background.secondary,
  },
  valueGroup: {
    gap: 12,
  },
  valueRow: {
    gap: 6,
  },
  valueKey: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.secondary,
    letterSpacing: 0.4,
  },
  valueText: {
    fontSize: 15,
    lineHeight: 23,
    color: theme.colors.text.primary,
  },
  booleanFieldRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineFieldRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineFieldValue: {
    flex: 1,
    alignItems: 'flex-end',
  },
  characterRow: {
    gap: 12,
    paddingRight: 8,
  },
  characterCard: {
    width: 260,
    flexShrink: 0,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    gap: 10,
  },
  characterCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.interactive.primary,
    letterSpacing: 0.4,
  },
});
