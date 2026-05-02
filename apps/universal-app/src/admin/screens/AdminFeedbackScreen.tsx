import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  LayoutAnimation,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { FEEDBACK_TOPICS, type FeedbackCategory, type FeedbackTopic } from '@wondertales/shared';
import { useAdminFeedback, type AdminFeedbackListItem } from '@/admin/api/admin';
import { AdminPagination, AdminSearchBar } from '@/admin/components/AdminControls';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';
import { formatAssetUrl } from '@/utils/assetUrl';

const PAGE_SIZE = 20;
const CATEGORY_OPTIONS: Array<{ label: string; value: '' | FeedbackCategory }> = [
  { label: 'All', value: '' },
  { label: 'Bug', value: 'bug' },
  { label: 'Feature', value: 'feature' },
  { label: 'Other', value: 'other' },
] as const;

const TOPIC_LABELS: Record<FeedbackTopic, string> = {
  bug: 'Bug',
  feature: 'Feature',
  billing: 'Billing',
  refund: 'Refund',
  unsafe_content: 'Unsafe content',
  generation_failed: 'Generation failed',
  account_privacy: 'Account/privacy',
  other: 'Other',
};

const TOPIC_OPTIONS: Array<{ label: string; value: '' | FeedbackTopic }> = [
  { label: 'All topics', value: '' },
  ...FEEDBACK_TOPICS.map((topic) => ({ label: TOPIC_LABELS[topic], value: topic })),
];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function getCategoryMeta(category: AdminFeedbackListItem['category']) {
  switch (category) {
    case 'bug':
      return {
        label: 'Bug',
        icon: 'bug-outline' as const,
        color: theme.colors.status.error,
        backgroundColor: theme.colors.error[50],
      };
    case 'feature':
      return {
        label: 'Feature',
        icon: 'bulb-outline' as const,
        color: theme.colors.interactive.primary,
        backgroundColor: theme.colors.primary[50],
      };
    default:
      return {
        label: 'Other',
        icon: 'help-circle-outline' as const,
        color: theme.colors.text.secondary,
        backgroundColor: theme.colors.background.primary,
      };
  }
}

function getTopicMeta(topic: string | null | undefined, fallbackCategory: string) {
  switch (topic ?? fallbackCategory) {
    case 'billing':
      return {
        label: 'Billing',
        icon: 'card-outline' as const,
        color: theme.colors.interactive.primary,
        backgroundColor: theme.colors.primary[50],
      };
    case 'refund':
      return {
        label: 'Refund',
        icon: 'receipt-outline' as const,
        color: theme.colors.status.warning,
        backgroundColor: theme.colors.warning[50],
      };
    case 'unsafe_content':
      return {
        label: 'Unsafe content',
        icon: 'shield-checkmark-outline' as const,
        color: theme.colors.status.error,
        backgroundColor: theme.colors.error[50],
      };
    case 'generation_failed':
      return {
        label: 'Generation failed',
        icon: 'sparkles-outline' as const,
        color: theme.colors.status.error,
        backgroundColor: theme.colors.error[50],
      };
    case 'account_privacy':
      return {
        label: 'Account/privacy',
        icon: 'person-circle-outline' as const,
        color: theme.colors.text.secondary,
        backgroundColor: theme.colors.background.primary,
      };
    default:
      return getCategoryMeta(fallbackCategory);
  }
}

function truncateMessage(message: string, maxLength = 30) {
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function getScreenshotSource(url: string | null) {
  if (!url) return null;
  return { uri: formatAssetUrl(url) ?? url };
}

function FeedbackCard({ item }: { item: AdminFeedbackListItem }) {
  const screenshotSource = getScreenshotSource(item.screenshotUrl);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const topicMeta = getTopicMeta(item.context.supportTopic, item.category);
  const headerTitle = truncateMessage(item.message);
  const headerDate = new Date(item.createdAt).toLocaleDateString();
  const contextRows = [
    { label: 'Support topic', value: item.context.supportTopic },
    { label: 'Category', value: item.category },
    { label: 'Reported screen', value: item.context.reportedScreen },
    { label: 'Platform', value: item.context.platform },
    { label: 'URL', value: item.context.url },
    { label: 'User ID', value: item.userId },
    { label: 'User Email', value: item.userEmail },
    { label: 'Contact Email', value: item.userEmail ? null : item.email },
    { label: 'User Agent', value: item.context.userAgent },
  ].filter((row) => Boolean(row.value));

  useEffect(() => {
    setImageAspectRatio(null);

    if (!screenshotSource?.uri) {
      return;
    }

    Image.getSize(
      screenshotSource.uri,
      (width, height) => {
        if (width > 0 && height > 0) {
          setImageAspectRatio(width / height);
        }
      },
      () => {
        // Ignore preload sizing failures and let onLoad provide dimensions if available.
      }
    );
  }, [screenshotSource?.uri]);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((current) => !current);
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.accordionHeader} onPress={toggleExpanded} activeOpacity={0.8}>
        <View style={styles.accordionHeaderLeft}>
          <View style={[styles.categoryBadge, { backgroundColor: topicMeta.backgroundColor }]}>
            <Ionicons name={topicMeta.icon} size={14} color={topicMeta.color} />
            <Text style={[styles.categoryBadgeText, { color: topicMeta.color }]}>
              {topicMeta.label}
            </Text>
          </View>
          {!isExpanded ? <Text style={styles.accordionMeta}>{headerDate}</Text> : null}
          {!isExpanded ? (
            <Text style={styles.accordionTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.text.tertiary}
        />
      </TouchableOpacity>

      {isExpanded ? (
        <View style={styles.cardDetails}>
          <View style={styles.cardHeader}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.metaText}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Message</Text>
            <Text style={styles.messageText}>{item.message}</Text>
          </View>

          {contextRows.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>User Details</Text>
              <View style={styles.contextBlock}>
                {contextRows.map((row) => (
                  <View key={row.label} style={styles.contextRow}>
                    <Text style={styles.contextLabel}>{row.label}</Text>
                    <Text style={styles.contextValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {screenshotSource ? (
            <View style={styles.sectionBlock}>
              <View style={styles.screenshotHeader}>
                <Text style={styles.screenshotTitle}>Screenshot</Text>
                {item.screenshotUrl ? (
                  <TouchableOpacity onPress={() => Linking.openURL(screenshotSource.uri)}>
                    <Text style={styles.openLinkText}>Open full size</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Image
                source={screenshotSource}
                style={[
                  styles.screenshotImage,
                  imageAspectRatio ? { aspectRatio: imageAspectRatio } : styles.screenshotImagePending,
                ]}
                resizeMode="contain"
                onLoad={(event) => {
                  const source = event.nativeEvent.source;
                  if (source?.width && source?.height) {
                    setImageAspectRatio(source.width / source.height);
                  }
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function AdminFeedbackScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState<'' | FeedbackCategory>('');
  const [supportTopic, setSupportTopic] = useState<'' | FeedbackTopic>('');
  const [hasScreenshot, setHasScreenshot] = useState(false);
  const { data, isLoading, error } = useAdminFeedback({
    limit: PAGE_SIZE,
    offset,
    search,
    category: category || undefined,
    supportTopic: supportTopic || undefined,
    hasScreenshot,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  return (
    <AdminLayout navigation={navigation} activeRoute="AdminFeedback" title="Admin / Feedback">
      <AdminSearchBar
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setOffset(0);
        }}
        placeholder="Search by message, email, category, screen"
      />

      <View style={styles.filtersRow}>
        <View style={styles.filterGroup}>
          {CATEGORY_OPTIONS.map((option) => {
            const isActive = category === option.value;
            return (
              <TouchableOpacity
                key={option.value || 'all'}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => {
                  setCategory(option.value);
                  setOffset(0);
                }}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.filterGroup}>
          {TOPIC_OPTIONS.map((option) => {
            const isActive = supportTopic === option.value;
            return (
              <TouchableOpacity
                key={option.value || 'all_topics'}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => {
                  setSupportTopic(option.value);
                  setOffset(0);
                }}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.filterChip, hasScreenshot && styles.filterChipActive]}
          onPress={() => {
            setHasScreenshot((current) => !current);
            setOffset(0);
          }}
        >
          <Text style={[styles.filterChipText, hasScreenshot && styles.filterChipTextActive]}>
            With screenshot only
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? <AdminLoadingState /> : null}
      {error ? <AdminErrorState message={(error as Error).message} /> : null}

      {!isLoading && !error ? (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>{data?.meta.total ?? 0} feedback items</Text>
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No feedback found.</Text>
            </View>
          ) : (
            <View style={styles.cardsList}>
              {items.map((item) => (
                <FeedbackCard key={item.id} item={item} />
              ))}
            </View>
          )}

          <AdminPagination
            limit={PAGE_SIZE}
            offset={offset}
            total={data?.meta.total ?? 0}
            onChange={setOffset}
          />
        </>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filtersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  filterGroup: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.primary,
  },
  filterChipActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  filterChipText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: theme.colors.interactive.primary,
  },
  summaryText: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  cardsList: {
    gap: 16,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    overflow: 'hidden',
  },
  accordionHeader: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  accordionHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerTextBlock: {
    gap: 4,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexShrink: 0,
  },
  categoryBadgeText: {
    fontWeight: '700',
    textTransform: 'uppercase',
    fontSize: 11,
  },
  accordionTitle: {
    flex: 1,
    color: theme.colors.text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  accordionMeta: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 0,
  },
  metaText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
  },
  messageText: {
    color: theme.colors.text.primary,
    fontSize: 15,
    lineHeight: 22,
    padding: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.background.primary,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  contextBlock: {
    gap: 8,
  },
  contextRow: {
    flexDirection: 'row',
    gap: 10,
  },
  contextLabel: {
    width: 120,
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  contextValue: {
    flex: 1,
    color: theme.colors.text.secondary,
    fontSize: 13,
  },
  screenshotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  screenshotTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  openLinkText: {
    color: theme.colors.interactive.primary,
    fontWeight: '600',
  },
  screenshotImage: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: theme.colors.background.primary,
    alignSelf: 'flex-start',
  },
  screenshotImagePending: {
    minHeight: 160,
  },
  cardDetails: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    backgroundColor: theme.colors.background.secondary,
  },
  emptyText: {
    color: theme.colors.text.secondary,
    fontSize: 14,
  },
});
