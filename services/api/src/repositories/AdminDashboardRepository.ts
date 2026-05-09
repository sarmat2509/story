import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { config } from '../config';
import {
  buildCostControlAlerts,
  classifyCostControlStatus,
  normalizeCostControlThresholds,
  type CostControlAlert,
  type CostControlStatus,
  type CostControlThresholds,
} from '../services/costControlService';
import {
  buildQualityReviewSummary,
  type QualityReviewSummary,
} from '../services/qualityReviewService';

export type AdminDashboardOverview = {
  totalStories: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestSuccessRate: number;
  totalCostUsd: number;
  avgCostUsd: number;
  avgGenerationTimeMs: number;
  avgWordCount: number;
  avgSceneCount: number;
  avgImageSceneCount: number;
  requestRetryStories: number;
  imageRetryStories: number;
  bothRetryStories: number;
  anyRetryStories: number;
  extraImageAttempts: number;
  avgValidationAttempts: number;
  firstPassImageRate: number;
  audioStoryCount: number;
  audioAttachRate: number;
};

export type AdminDashboardDailyPoint = {
  date: string;
  storyCount: number;
  totalCostUsd: number;
  retryStoryCount: number;
};

export type AdminDashboardImageBucket = {
  bucket: string;
  bucketSort: number;
  storyCount: number;
  totalCostUsd: number;
  avgCostUsd: number;
  avgGenerationTimeMs: number;
};

export type AdminDashboardCostOperation = {
  operation: string;
  eventCount: number;
  storyCount: number;
  totalCostUsd: number;
};

export type AdminDashboardBreakdownItem = {
  value: string;
  storyCount: number;
  totalCostUsd: number;
  avgCostUsd: number;
  share: number;
};

export type AdminDashboardCostControls = {
  status: CostControlStatus;
  thresholds: CostControlThresholds;
  dailyAverageCostUsd: number;
  projectedMonthlyCostUsd: number;
  highCostStoryCount: number;
  maxStoryCostUsd: number;
  unpricedEventCount: number;
  topUser24hUserId: string | null;
  topUser24hCostUsd: number;
  topUser24hEventCount: number;
  topUser24hStoryCount: number;
  alerts: CostControlAlert[];
};

export type AdminDashboardQualityReview = QualityReviewSummary;

export type AdminDashboardData = {
  rangeDays: number;
  overview: AdminDashboardOverview;
  costControls: AdminDashboardCostControls;
  qualityReview: AdminDashboardQualityReview;
  daily: AdminDashboardDailyPoint[];
  costByImageCount: AdminDashboardImageBucket[];
  costByOperation: AdminDashboardCostOperation[];
  languages: AdminDashboardBreakdownItem[];
  imageStyles: AdminDashboardBreakdownItem[];
};

export class AdminDashboardRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  private buildStoryWhereClause(days: number) {
    return days > 0
      ? sql`WHERE s.created_at >= NOW() - (${days} * INTERVAL '1 day')`
      : sql``;
  }

  private buildRequestWhereClause(days: number) {
    return days > 0
      ? sql`WHERE sr.created_at >= NOW() - (${days} * INTERVAL '1 day')`
      : sql``;
  }

  private buildUnpricedAiUsageWhereClause(days: number) {
    return days > 0
      ? sql`WHERE aue.created_at >= NOW() - (${days} * INTERVAL '1 day') AND aue.cost_usd IS NULL`
      : sql`WHERE aue.cost_usd IS NULL`;
  }

  async getDashboard(days: number): Promise<AdminDashboardData> {
    const storyWhereClause = this.buildStoryWhereClause(days);
    const requestWhereClause = this.buildRequestWhereClause(days);
    const unpricedAiUsageWhereClause = this.buildUnpricedAiUsageWhereClause(days);
    const thresholds = normalizeCostControlThresholds(config.costControls);

    const overviewResult = await this.db.execute(sql`
      WITH story_base AS (
        SELECT
          s.id,
          s.created_at,
          s.generation_time_ms,
          s.word_count,
          s.audio_metadata IS NOT NULL AS has_audio,
          CASE
            WHEN COALESCE(s.metadata->>'sceneCount', '') ~ '^[0-9]+$' THEN (s.metadata->>'sceneCount')::int
            ELSE jsonb_array_length(COALESCE(s.scenes, '[]'::jsonb))
          END AS scene_count,
          COALESCE(NULLIF(s.language, ''), 'unknown') AS language,
          COALESCE(NULLIF((s.metadata->>'imageStyle'), ''), NULLIF(sr.image_style, ''), 'unknown') AS image_style,
          COALESCE(sr.retry_count, 0) AS request_retry_count
        FROM stories s
        LEFT JOIN story_requests sr ON sr.id = s.story_request_id
        ${storyWhereClause}
      ),
      cost_by_story AS (
        SELECT
          sb.id AS story_id,
          COALESCE(SUM(aue.cost_usd), 0)::numeric AS total_cost_usd
        FROM story_base sb
        LEFT JOIN ai_usage_events aue ON aue.story_id = sb.id
        GROUP BY sb.id
      ),
      image_counts AS (
        SELECT
          sc.story_id,
          COUNT(DISTINCT sc.id)::int AS image_scene_count
        FROM scenes sc
        INNER JOIN story_base sb ON sb.id = sc.story_id
        INNER JOIN assets a
          ON a.scene_id = sc.id
          AND a.asset_type = 'image'
          AND a.status = 'completed'
        GROUP BY sc.story_id
      ),
      validation_by_scene AS (
        SELECT
          iv.story_id,
          iv.scene_index,
          MAX(iv.attempt)::int AS max_attempt
        FROM image_validation_results iv
        INNER JOIN story_base sb ON sb.id = iv.story_id
        GROUP BY iv.story_id, iv.scene_index
      ),
      validation_by_story AS (
        SELECT
          v.story_id,
          COUNT(*) FILTER (WHERE v.max_attempt > 1)::int AS retried_scene_count,
          COALESCE(SUM(GREATEST(v.max_attempt - 1, 0)), 0)::int AS extra_attempts,
          COALESCE(AVG(v.max_attempt), 0)::numeric AS avg_validation_attempts
        FROM validation_by_scene v
        GROUP BY v.story_id
      ),
      request_metrics AS (
        SELECT
          COUNT(*)::int AS total_requests,
          COUNT(*) FILTER (WHERE sr.status = 'completed' OR sr.story_id IS NOT NULL)::int AS successful_requests,
          COUNT(*) FILTER (WHERE sr.status = 'failed')::int AS failed_requests
        FROM story_requests sr
        ${requestWhereClause}
      )
      SELECT
        COUNT(sb.id)::int AS total_stories,
        rm.total_requests,
        rm.successful_requests,
        rm.failed_requests,
        COALESCE(SUM(cbs.total_cost_usd), 0)::numeric AS total_cost_usd,
        COALESCE(AVG(cbs.total_cost_usd), 0)::numeric AS avg_cost_usd,
        COALESCE(AVG(sb.generation_time_ms), 0)::numeric AS avg_generation_time_ms,
        COALESCE(AVG(sb.word_count), 0)::numeric AS avg_word_count,
        COALESCE(AVG(sb.scene_count), 0)::numeric AS avg_scene_count,
        COALESCE(AVG(COALESCE(ic.image_scene_count, 0)), 0)::numeric AS avg_image_scene_count,
        COUNT(sb.id) FILTER (WHERE sb.request_retry_count > 0)::int AS request_retry_stories,
        COUNT(sb.id) FILTER (WHERE COALESCE(vbs.retried_scene_count, 0) > 0)::int AS image_retry_stories,
        COUNT(sb.id) FILTER (WHERE sb.request_retry_count > 0 AND COALESCE(vbs.retried_scene_count, 0) > 0)::int AS both_retry_stories,
        COUNT(sb.id) FILTER (WHERE sb.request_retry_count > 0 OR COALESCE(vbs.retried_scene_count, 0) > 0)::int AS any_retry_stories,
        COALESCE(SUM(COALESCE(vbs.extra_attempts, 0)), 0)::int AS extra_image_attempts,
        COALESCE(AVG(NULLIF(vbs.avg_validation_attempts, 0)), 0)::numeric AS avg_validation_attempts,
        COALESCE(
          (
            SELECT AVG(CASE WHEN v.max_attempt = 1 THEN 1.0 ELSE 0.0 END)::numeric
            FROM validation_by_scene v
          ),
          0
        )::numeric AS first_pass_image_rate,
        COUNT(sb.id) FILTER (WHERE sb.has_audio)::int AS audio_story_count
      FROM story_base sb
      CROSS JOIN request_metrics rm
      LEFT JOIN cost_by_story cbs ON cbs.story_id = sb.id
      LEFT JOIN image_counts ic ON ic.story_id = sb.id
      LEFT JOIN validation_by_story vbs ON vbs.story_id = sb.id
      GROUP BY rm.total_requests, rm.successful_requests, rm.failed_requests
    `);

    const dailyResult = await this.db.execute(sql`
      WITH story_base AS (
        SELECT
          s.id,
          s.created_at::date AS story_date,
          COALESCE(sr.retry_count, 0) AS request_retry_count
        FROM stories s
        LEFT JOIN story_requests sr ON sr.id = s.story_request_id
        ${storyWhereClause}
      ),
      cost_by_story AS (
        SELECT
          sb.id AS story_id,
          COALESCE(SUM(aue.cost_usd), 0)::numeric AS total_cost_usd
        FROM story_base sb
        LEFT JOIN ai_usage_events aue ON aue.story_id = sb.id
        GROUP BY sb.id
      ),
      validation_by_scene AS (
        SELECT
          iv.story_id,
          iv.scene_index,
          MAX(iv.attempt)::int AS max_attempt
        FROM image_validation_results iv
        INNER JOIN story_base sb ON sb.id = iv.story_id
        GROUP BY iv.story_id, iv.scene_index
      ),
      validation_by_story AS (
        SELECT
          v.story_id,
          COUNT(*) FILTER (WHERE v.max_attempt > 1)::int AS retried_scene_count
        FROM validation_by_scene v
        GROUP BY v.story_id
      )
      SELECT
        TO_CHAR(sb.story_date, 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS story_count,
        COALESCE(SUM(cbs.total_cost_usd), 0)::numeric AS total_cost_usd,
        SUM(
          CASE
            WHEN sb.request_retry_count > 0 OR COALESCE(vbs.retried_scene_count, 0) > 0 THEN 1
            ELSE 0
          END
        )::int AS retry_story_count
      FROM story_base sb
      LEFT JOIN cost_by_story cbs ON cbs.story_id = sb.id
      LEFT JOIN validation_by_story vbs ON vbs.story_id = sb.id
      GROUP BY sb.story_date
      ORDER BY sb.story_date ASC
    `);

    const costByImageCountResult = await this.db.execute(sql`
      WITH story_base AS (
        SELECT
          s.id,
          s.generation_time_ms
        FROM stories s
        ${storyWhereClause}
      ),
      cost_by_story AS (
        SELECT
          sb.id AS story_id,
          COALESCE(SUM(aue.cost_usd), 0)::numeric AS total_cost_usd
        FROM story_base sb
        LEFT JOIN ai_usage_events aue ON aue.story_id = sb.id
        GROUP BY sb.id
      ),
      image_counts AS (
        SELECT
          sc.story_id,
          COUNT(DISTINCT sc.id)::int AS image_scene_count
        FROM scenes sc
        INNER JOIN story_base sb ON sb.id = sc.story_id
        INNER JOIN assets a
          ON a.scene_id = sc.id
          AND a.asset_type = 'image'
          AND a.status = 'completed'
        GROUP BY sc.story_id
      ),
      story_metrics AS (
        SELECT
          sb.id,
          sb.generation_time_ms,
          COALESCE(cbs.total_cost_usd, 0)::numeric AS total_cost_usd,
          COALESCE(ic.image_scene_count, 0)::int AS image_scene_count
        FROM story_base sb
        LEFT JOIN cost_by_story cbs ON cbs.story_id = sb.id
        LEFT JOIN image_counts ic ON ic.story_id = sb.id
      )
      SELECT
        CASE
          WHEN sm.image_scene_count >= 5 THEN '5+'
          ELSE sm.image_scene_count::text
        END AS bucket,
        CASE
          WHEN sm.image_scene_count >= 5 THEN 5
          ELSE sm.image_scene_count
        END::int AS bucket_sort,
        COUNT(*)::int AS story_count,
        COALESCE(SUM(sm.total_cost_usd), 0)::numeric AS total_cost_usd,
        COALESCE(AVG(sm.total_cost_usd), 0)::numeric AS avg_cost_usd,
        COALESCE(AVG(sm.generation_time_ms), 0)::numeric AS avg_generation_time_ms
      FROM story_metrics sm
      GROUP BY 1, 2
      ORDER BY 2 ASC
    `);

    const costByOperationResult = await this.db.execute(sql`
      WITH story_base AS (
        SELECT s.id
        FROM stories s
        ${storyWhereClause}
      )
      SELECT
        COALESCE(NULLIF(aue.operation, ''), 'unknown') AS operation,
        COUNT(*)::int AS event_count,
        COUNT(DISTINCT aue.story_id)::int AS story_count,
        COALESCE(SUM(aue.cost_usd), 0)::numeric AS total_cost_usd
      FROM ai_usage_events aue
      INNER JOIN story_base sb ON sb.id = aue.story_id
      GROUP BY 1
      ORDER BY total_cost_usd DESC, event_count DESC
      LIMIT 8
    `);

    const languagesResult = await this.db.execute(sql`
      WITH story_base AS (
        SELECT
          s.id,
          COALESCE(NULLIF(s.language, ''), 'unknown') AS value
        FROM stories s
        ${storyWhereClause}
      ),
      cost_by_story AS (
        SELECT
          sb.id AS story_id,
          COALESCE(SUM(aue.cost_usd), 0)::numeric AS total_cost_usd
        FROM story_base sb
        LEFT JOIN ai_usage_events aue ON aue.story_id = sb.id
        GROUP BY sb.id
      )
      SELECT
        sb.value,
        COUNT(*)::int AS story_count,
        COALESCE(SUM(cbs.total_cost_usd), 0)::numeric AS total_cost_usd,
        COALESCE(AVG(cbs.total_cost_usd), 0)::numeric AS avg_cost_usd
      FROM story_base sb
      LEFT JOIN cost_by_story cbs ON cbs.story_id = sb.id
      GROUP BY sb.value
      ORDER BY story_count DESC, total_cost_usd DESC
      LIMIT 8
    `);

    const imageStylesResult = await this.db.execute(sql`
      WITH story_base AS (
        SELECT
          s.id,
          COALESCE(NULLIF((s.metadata->>'imageStyle'), ''), NULLIF(sr.image_style, ''), 'unknown') AS value
        FROM stories s
        LEFT JOIN story_requests sr ON sr.id = s.story_request_id
        ${storyWhereClause}
      ),
      cost_by_story AS (
        SELECT
          sb.id AS story_id,
          COALESCE(SUM(aue.cost_usd), 0)::numeric AS total_cost_usd
        FROM story_base sb
        LEFT JOIN ai_usage_events aue ON aue.story_id = sb.id
        GROUP BY sb.id
      )
      SELECT
        sb.value,
        COUNT(*)::int AS story_count,
        COALESCE(SUM(cbs.total_cost_usd), 0)::numeric AS total_cost_usd,
        COALESCE(AVG(cbs.total_cost_usd), 0)::numeric AS avg_cost_usd
      FROM story_base sb
      LEFT JOIN cost_by_story cbs ON cbs.story_id = sb.id
      GROUP BY sb.value
      ORDER BY story_count DESC, total_cost_usd DESC
      LIMIT 8
    `);

    const costControlResult = await this.db.execute(sql`
      WITH story_base AS (
        SELECT s.id
        FROM stories s
        ${storyWhereClause}
      ),
      cost_by_story AS (
        SELECT
          sb.id AS story_id,
          COALESCE(SUM(aue.cost_usd), 0)::numeric AS total_cost_usd
        FROM story_base sb
        LEFT JOIN ai_usage_events aue ON aue.story_id = sb.id
        GROUP BY sb.id
      ),
      story_costs AS (
        SELECT
          COUNT(*) FILTER (WHERE total_cost_usd >= ${thresholds.storyWarnUsd})::int AS high_cost_story_count,
          COALESCE(MAX(total_cost_usd), 0)::numeric AS max_story_cost_usd
        FROM cost_by_story
      ),
      unpriced_events AS (
        SELECT COUNT(*)::int AS unpriced_event_count
        FROM ai_usage_events aue
        ${unpricedAiUsageWhereClause}
      ),
      top_user_24h AS (
        SELECT
          aue.user_id,
          COALESCE(SUM(aue.cost_usd), 0)::numeric AS total_cost_usd,
          COUNT(*)::int AS event_count,
          COUNT(DISTINCT aue.story_id)::int AS story_count
        FROM ai_usage_events aue
        WHERE aue.user_id IS NOT NULL
          AND aue.created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY aue.user_id
        ORDER BY total_cost_usd DESC, event_count DESC
        LIMIT 1
      )
      SELECT
        sc.high_cost_story_count,
        sc.max_story_cost_usd,
        ue.unpriced_event_count,
        tu.user_id AS top_user_24h_user_id,
        COALESCE(tu.total_cost_usd, 0)::numeric AS top_user_24h_cost_usd,
        COALESCE(tu.event_count, 0)::int AS top_user_24h_event_count,
        COALESCE(tu.story_count, 0)::int AS top_user_24h_story_count
      FROM story_costs sc
      CROSS JOIN unpriced_events ue
      LEFT JOIN top_user_24h tu ON true
    `);

    const qualityReviewResult = await this.db.execute(sql`
      WITH failed_generation AS (
        SELECT
          COUNT(*) FILTER (
            WHERE sr.status = 'failed'
              AND LOWER(COALESCE(sr.error_message, '')) ~ '(unsafe|moderation|policy|content)'
          )::int AS moderation_request_failure_count
        FROM story_requests sr
        WHERE (${days} <= 0 OR sr.created_at >= NOW() - (${days} * INTERVAL '1 day'))
      ),
      story_policy_failures AS (
        SELECT COUNT(*)::int AS story_policy_failure_count
        FROM stories s
        WHERE (${days} <= 0 OR s.created_at >= NOW() - (${days} * INTERVAL '1 day'))
          AND (s.policy_checks->>'textValidated') = 'false'
      ),
      feedback_reports AS (
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(uf.context->>'supportTopic', '') IN (
              'unsafe_content',
              'unsafe_image',
              'unsafe_text',
              'privacy_concern'
            )
          )::int AS unsafe_report_count,
          COUNT(*) FILTER (
            WHERE COALESCE(uf.context->>'supportTopic', '') = 'generation_failed'
          )::int AS generation_failure_report_count,
          COUNT(*) FILTER (
            WHERE COALESCE(uf.context->>'reportedScreen', '') = 'published_story'
          )::int AS public_story_report_count
        FROM user_feedback uf
        WHERE (${days} <= 0 OR uf.created_at >= NOW() - (${days} * INTERVAL '1 day'))
      ),
      sample_candidates AS (
        SELECT COUNT(*)::int AS sample_candidate_count
        FROM stories s
        WHERE (${days} <= 0 OR s.created_at >= NOW() - (${days} * INTERVAL '1 day'))
          AND s.is_published = true
          AND s.visibility = 'public'
          AND s.published_slug IS NOT NULL
          AND s.published_slug <> ''
          AND s.hidden = false
          AND (s.policy_checks->>'textValidated') = 'true'
          AND s.parent_review_status IN ('not_required', 'approved')
          AND s.show_on_home_page = false
      )
      SELECT
        (
          COALESCE(fg.moderation_request_failure_count, 0)
          + COALESCE(spf.story_policy_failure_count, 0)
        )::int AS moderation_failure_count,
        COALESCE(fr.unsafe_report_count, 0)::int AS unsafe_report_count,
        COALESCE(fr.generation_failure_report_count, 0)::int AS generation_failure_report_count,
        COALESCE(fr.public_story_report_count, 0)::int AS public_story_report_count,
        COALESCE(sc.sample_candidate_count, 0)::int AS sample_candidate_count
      FROM failed_generation fg
      CROSS JOIN story_policy_failures spf
      CROSS JOIN feedback_reports fr
      CROSS JOIN sample_candidates sc
    `);

    const overviewRows = (overviewResult.rows ?? []) as Array<Record<string, unknown>>;
    const dailyRows = (dailyResult.rows ?? []) as Array<Record<string, unknown>>;
    const costByImageCountRows = (costByImageCountResult.rows ?? []) as Array<Record<string, unknown>>;
    const costByOperationRows = (costByOperationResult.rows ?? []) as Array<Record<string, unknown>>;
    const languageRows = (languagesResult.rows ?? []) as Array<Record<string, unknown>>;
    const imageStyleRows = (imageStylesResult.rows ?? []) as Array<Record<string, unknown>>;
    const costControlRows = (costControlResult.rows ?? []) as Array<Record<string, unknown>>;
    const qualityReviewRows = (qualityReviewResult.rows ?? []) as Array<Record<string, unknown>>;
    const overviewRow = overviewRows[0] ?? {};
    const costControlRow = costControlRows[0] ?? {};
    const qualityReviewRow = qualityReviewRows[0] ?? {};

    const totalStories = Number(overviewRow.total_stories ?? 0);
    const totalRequests = Number(overviewRow.total_requests ?? 0);
    const successfulRequests = Number(overviewRow.successful_requests ?? 0);
    const audioStoryCount = Number(overviewRow.audio_story_count ?? 0);

    const overview: AdminDashboardOverview = {
      totalStories,
      totalRequests,
      successfulRequests,
      failedRequests: Number(overviewRow.failed_requests ?? 0),
      requestSuccessRate: totalRequests > 0 ? successfulRequests / totalRequests : 0,
      totalCostUsd: Number(overviewRow.total_cost_usd ?? 0),
      avgCostUsd: Number(overviewRow.avg_cost_usd ?? 0),
      avgGenerationTimeMs: Number(overviewRow.avg_generation_time_ms ?? 0),
      avgWordCount: Number(overviewRow.avg_word_count ?? 0),
      avgSceneCount: Number(overviewRow.avg_scene_count ?? 0),
      avgImageSceneCount: Number(overviewRow.avg_image_scene_count ?? 0),
      requestRetryStories: Number(overviewRow.request_retry_stories ?? 0),
      imageRetryStories: Number(overviewRow.image_retry_stories ?? 0),
      bothRetryStories: Number(overviewRow.both_retry_stories ?? 0),
      anyRetryStories: Number(overviewRow.any_retry_stories ?? 0),
      extraImageAttempts: Number(overviewRow.extra_image_attempts ?? 0),
      avgValidationAttempts: Number(overviewRow.avg_validation_attempts ?? 0),
      firstPassImageRate: Number(overviewRow.first_pass_image_rate ?? 0),
      audioStoryCount,
      audioAttachRate: totalStories > 0 ? audioStoryCount / totalStories : 0,
    };

    const daily = dailyRows.map((row) => ({
      date: String(row.date),
      storyCount: Number(row.story_count ?? 0),
      totalCostUsd: Number(row.total_cost_usd ?? 0),
      retryStoryCount: Number(row.retry_story_count ?? 0),
    }));

    const costByImageCount = costByImageCountRows.map((row) => ({
      bucket: String(row.bucket),
      bucketSort: Number(row.bucket_sort ?? 0),
      storyCount: Number(row.story_count ?? 0),
      totalCostUsd: Number(row.total_cost_usd ?? 0),
      avgCostUsd: Number(row.avg_cost_usd ?? 0),
      avgGenerationTimeMs: Number(row.avg_generation_time_ms ?? 0),
    }));

    const costByOperation = costByOperationRows.map((row) => ({
      operation: String(row.operation),
      eventCount: Number(row.event_count ?? 0),
      storyCount: Number(row.story_count ?? 0),
      totalCostUsd: Number(row.total_cost_usd ?? 0),
    }));

    const dailyAverageDenominator = days > 0 ? Math.max(days, 1) : Math.max(dailyRows.length, 1);
    const dailyAverageCostUsd = overview.totalCostUsd / dailyAverageDenominator;
    const projectedMonthlyCostUsd = dailyAverageCostUsd * 30;
    const highCostStoryCount = Number(costControlRow.high_cost_story_count ?? 0);
    const maxStoryCostUsd = Number(costControlRow.max_story_cost_usd ?? 0);
    const unpricedEventCount = Number(costControlRow.unpriced_event_count ?? 0);
    const topUser24hCostUsd = Number(costControlRow.top_user_24h_cost_usd ?? 0);
    const topUser24hUserId =
      typeof costControlRow.top_user_24h_user_id === 'string'
        ? costControlRow.top_user_24h_user_id
        : null;
    const costControlMetrics = {
      projectedMonthlyCostUsd,
      dailyAverageCostUsd,
      highCostStoryCount,
      maxStoryCostUsd,
      unpricedEventCount,
      topUser24hCostUsd,
    };

    const costControls: AdminDashboardCostControls = {
      status: classifyCostControlStatus(costControlMetrics, thresholds),
      thresholds,
      dailyAverageCostUsd,
      projectedMonthlyCostUsd,
      highCostStoryCount,
      maxStoryCostUsd,
      unpricedEventCount,
      topUser24hUserId,
      topUser24hCostUsd,
      topUser24hEventCount: Number(costControlRow.top_user_24h_event_count ?? 0),
      topUser24hStoryCount: Number(costControlRow.top_user_24h_story_count ?? 0),
      alerts: buildCostControlAlerts(costControlMetrics, thresholds, { topUser24hUserId }),
    };

    const qualityReview = buildQualityReviewSummary({
      totalStories,
      totalRequests,
      failedRequests: overview.failedRequests,
      imageRetryStories: overview.imageRetryStories,
      moderationFailureCount: Number(qualityReviewRow.moderation_failure_count ?? 0),
      unsafeReportCount: Number(qualityReviewRow.unsafe_report_count ?? 0),
      generationFailureReportCount: Number(qualityReviewRow.generation_failure_report_count ?? 0),
      publicStoryReportCount: Number(qualityReviewRow.public_story_report_count ?? 0),
      sampleCandidateCount: Number(qualityReviewRow.sample_candidate_count ?? 0),
    });

    const toBreakdown = (rows: any[]): AdminDashboardBreakdownItem[] =>
      rows.map((row) => {
        const storyCount = Number(row.story_count ?? 0);
        return {
          value: String(row.value),
          storyCount,
          totalCostUsd: Number(row.total_cost_usd ?? 0),
          avgCostUsd: Number(row.avg_cost_usd ?? 0),
          share: totalStories > 0 ? storyCount / totalStories : 0,
        };
      });

    return {
      rangeDays: days,
      overview,
      costControls,
      qualityReview,
      daily,
      costByImageCount,
      costByOperation,
      languages: toBreakdown(languageRows),
      imageStyles: toBreakdown(imageStyleRows),
    };
  }
}
