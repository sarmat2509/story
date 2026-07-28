import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AdminGenerationStageEvent, AdminTextValidationPayload } from '@/admin/api/admin';
import { theme } from '@/theme';

type TimelineStageKind =
  | 'text'
  | 'validation'
  | 'planning'
  | 'images'
  | 'imagesAfterReady'
  | 'audio';

type TimelineStage = {
  event: AdminGenerationStageEvent;
  kind: TimelineStageKind;
  label: string;
  color: string;
};

const STAGE_COLORS: Record<TimelineStageKind, string> = {
  text: '#7C5CFC',
  validation: '#F59E0B',
  planning: '#14B8A6',
  images: '#3B82F6',
  imagesAfterReady: '#94A3B8',
  audio: '#EC4899',
};

const TOP_LEVEL_STAGE: Record<string, { kind: TimelineStageKind; label: string }> = {
  writer_text: { kind: 'text', label: 'Text generation' },
  graphic_novel_script: { kind: 'text', label: 'Comic script' },
  mixed_story_script: { kind: 'text', label: 'Mixed story script' },
  text_validation: { kind: 'validation', label: 'Text validation' },
  director_scenes: { kind: 'planning', label: 'Visual planning' },
  graphic_novel_layout: { kind: 'planning', label: 'Page planning' },
  mixed_story_layout: { kind: 'planning', label: 'Page planning' },
  image_batch: { kind: 'images', label: 'Image generation' },
  comic_page_batch: { kind: 'images', label: 'Page generation' },
};

const DETAIL_OPERATIONS = new Set([
  'scene_image_validation_segmented',
  'scene_image_edit_repair',
  'graphic_novel_panel_crop_validation_original',
  'graphic_novel_panel_crop_validation_edit',
]);

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function humanizeOperation(operation: string): string {
  return operation
    .split('_')
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function hasTextRepair(validation: AdminTextValidationPayload | null | undefined): boolean {
  return (
    validation?.attempts?.some(
      (attempt) => attempt.phase === 'revalidation' || attempt.attempt > 1
    ) ?? false
  );
}

function findStoryReadyEvent(
  events: AdminGenerationStageEvent[]
): AdminGenerationStageEvent | undefined {
  return events
    .filter((event) => event.operation === 'story_ready')
    .sort(
      (left, right) => new Date(left.completedAt).getTime() - new Date(right.completedAt).getTime()
    )[0];
}

function buildTimelineStages(
  events: AdminGenerationStageEvent[],
  textValidation: AdminTextValidationPayload | null | undefined
): TimelineStage[] {
  const repairedText = hasTextRepair(textValidation);
  const readyAt = findStoryReadyEvent(events)?.completedAt;
  const readyAtMs = readyAt ? new Date(readyAt).getTime() : null;

  return events
    .filter((event) => TOP_LEVEL_STAGE[event.operation] && event.durationMs >= 0)
    .flatMap((event): TimelineStage[] => {
      const definition = TOP_LEVEL_STAGE[event.operation];
      const defaultStage: TimelineStage = {
        event,
        kind: definition.kind,
        label:
          event.operation === 'text_validation' && repairedText
            ? 'Text validation & repair'
            : definition.label,
        color: STAGE_COLORS[definition.kind],
      };

      if (definition.kind !== 'images' || readyAtMs == null) {
        return [defaultStage];
      }

      const startedAtMs = new Date(event.startedAt).getTime();
      const completedAtMs = new Date(event.completedAt).getTime();
      if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs)) {
        return [defaultStage];
      }

      if (completedAtMs <= readyAtMs) {
        return [{ ...defaultStage, label: `${definition.label} before ready` }];
      }
      if (startedAtMs >= readyAtMs) {
        return [
          {
            ...defaultStage,
            kind: 'imagesAfterReady',
            label: `${definition.label} after ready`,
            color: STAGE_COLORS.imagesAfterReady,
          },
        ];
      }

      const readyAtIso = new Date(readyAtMs).toISOString();
      return [
        {
          ...defaultStage,
          event: {
            ...event,
            id: `${event.id}:before-ready`,
            completedAt: readyAtIso,
            durationMs: readyAtMs - startedAtMs,
          },
          label: `${definition.label} before ready`,
        },
        {
          ...defaultStage,
          event: {
            ...event,
            id: `${event.id}:after-ready`,
            startedAt: readyAtIso,
            durationMs: completedAtMs - readyAtMs,
          },
          kind: 'imagesAfterReady',
          label: `${definition.label} after ready`,
          color: STAGE_COLORS.imagesAfterReady,
        },
      ];
    })
    .sort(
      (left, right) =>
        new Date(left.event.startedAt).getTime() - new Date(right.event.startedAt).getTime()
    );
}

export function AdminGenerationTimeline({
  events,
  textValidation,
}: {
  events: AdminGenerationStageEvent[];
  textValidation?: AdminTextValidationPayload | null;
}) {
  const stages = useMemo(
    () => buildTimelineStages(events, textValidation),
    [events, textValidation]
  );
  const details = useMemo(() => {
    const byOperation = new Map<string, { count: number; durationMs: number }>();
    events
      .filter((event) => DETAIL_OPERATIONS.has(event.operation))
      .forEach((event) => {
        const current = byOperation.get(event.operation) ?? { count: 0, durationMs: 0 };
        byOperation.set(event.operation, {
          count: current.count + 1,
          durationMs: current.durationMs + event.durationMs,
        });
      });
    return Array.from(byOperation, ([operation, summary]) => ({ operation, ...summary })).sort(
      (left, right) => right.durationMs - left.durationMs
    );
  }, [events]);
  const totalStageMs = stages.reduce((sum, stage) => sum + stage.event.durationMs, 0);
  const pipelineStartedAt =
    stages.length > 0
      ? Math.min(...stages.map((stage) => new Date(stage.event.startedAt).getTime()))
      : null;
  const pipelineCompletedAt =
    stages.length > 0
      ? Math.max(...stages.map((stage) => new Date(stage.event.completedAt).getTime()))
      : null;
  const pipelineWallMs =
    pipelineStartedAt != null && pipelineCompletedAt != null
      ? Math.max(0, pipelineCompletedAt - pipelineStartedAt)
      : totalStageMs;
  const storyReady = findStoryReadyEvent(events);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>GENERATION TIMELINE</Text>
          <Text style={styles.title}>Story creation time</Text>
        </View>
        <View style={styles.totalWrap}>
          <Text style={styles.totalValue}>{formatDuration(pipelineWallMs)}</Text>
          <Text style={styles.totalLabel}>full pipeline</Text>
          {storyReady && Math.abs(storyReady.durationMs - pipelineWallMs) > 1000 ? (
            <Text style={styles.readyLabel}>
              ready to read in {formatDuration(storyReady.durationMs)}
            </Text>
          ) : null}
        </View>
      </View>

      {stages.length > 0 ? (
        <>
          <View
            style={styles.timeline}
            accessibilityRole="summary"
            accessibilityLabel={`Story generation took ${formatDuration(pipelineWallMs)}`}
          >
            {stages.map((stage) => (
              <View
                key={stage.event.id}
                accessibilityLabel={`${stage.label}: ${formatDuration(stage.event.durationMs)}`}
                style={[
                  styles.segment,
                  {
                    backgroundColor: stage.color,
                    flexGrow: Math.max(stage.event.durationMs, totalStageMs * 0.015),
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.legend}>
            {stages.map((stage) => {
              const percentage =
                totalStageMs > 0 ? Math.round((stage.event.durationMs / totalStageMs) * 100) : 0;
              return (
                <View key={`${stage.event.id}-legend`} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: stage.color }]} />
                  <View style={styles.legendText}>
                    <Text style={styles.stageLabel}>{stage.label}</Text>
                    <Text style={styles.stageMeta}>
                      {formatDuration(stage.event.durationMs)} · {percentage}%
                      {stage.event.status !== 'completed' ? ` · ${stage.event.status}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {Math.abs(pipelineWallMs - totalStageMs) > 1000 ? (
            <Text style={styles.note}>
              Colored sectors show measured top-level work ({formatDuration(totalStageMs)}). Full
              pipeline time also includes queueing, persistence, and hand-offs between stages.
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.empty}>
          No stage timing events were recorded for this story. New generations will appear here.
        </Text>
      )}

      {details.length > 0 ? (
        <View style={styles.details}>
          <Text style={styles.detailsTitle}>Validation and repair inside image generation</Text>
          {details.map((detail) => (
            <View key={detail.operation} style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {humanizeOperation(detail.operation)} · {detail.count}{' '}
                {detail.count === 1 ? 'run' : 'runs'}
              </Text>
              <Text style={styles.detailDuration}>{formatDuration(detail.durationMs)}</Text>
            </View>
          ))}
          <Text style={styles.detailHint}>
            Recorded work time; parallel validation runs can overlap.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    borderRadius: 16,
    backgroundColor: theme.colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  eyebrow: {
    color: theme.colors.interactive.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 4,
    color: theme.colors.text.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  totalWrap: {
    alignItems: 'flex-end',
  },
  totalValue: {
    color: theme.colors.text.primary,
    fontSize: 24,
    fontWeight: '800',
  },
  totalLabel: {
    color: theme.colors.text.secondary,
    fontSize: 11,
  },
  readyLabel: {
    marginTop: 2,
    color: theme.colors.interactive.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  timeline: {
    flexDirection: 'row',
    width: '100%',
    height: 28,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: theme.colors.background.secondary,
    gap: 2,
  },
  segment: {
    flexBasis: 0,
    minWidth: 4,
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    minWidth: 180,
    flexGrow: 1,
    flexBasis: 180,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    marginTop: 4,
    borderRadius: 5,
  },
  legendText: {
    flex: 1,
  },
  stageLabel: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  stageMeta: {
    marginTop: 2,
    color: theme.colors.text.secondary,
    fontSize: 12,
  },
  note: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    color: theme.colors.text.secondary,
    fontSize: 14,
  },
  details: {
    gap: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
  },
  detailsTitle: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    flex: 1,
    color: theme.colors.text.secondary,
    fontSize: 12,
  },
  detailDuration: {
    color: theme.colors.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  detailHint: {
    color: theme.colors.text.secondary,
    fontSize: 11,
  },
});
