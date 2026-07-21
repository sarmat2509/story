import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppReleaseChange,
  AppReleaseEmailBlock,
  AppReleaseInput,
  AppReleaseStatus,
  FeedbackCategory,
  FeedbackTopic,
} from '@wondertales/shared';
import apiClient from '@/api/client';

export type AdminStoryListItem = {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  isPublished: boolean | null;
  visibility: string | null;
  showOnHomePage: boolean;
  publishedSlug?: string | null;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  suspendedAt: string | null;
  suspendedReason: string | null;
  planSlug: string | null;
  planName: string | null;
  createdAt: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  storiesUsedCurrentPeriod: number;
  graphicNovelsUsedCurrentPeriod: number;
  audioStoriesUsedCurrentPeriod: number;
};

export type AdminDiscountCode = {
  id: string;
  code: string;
  kind: 'subscription' | 'bundle';
  percentOff: number;
  durationMonths: number | null;
  planId: string | null;
  planSlug: string | null;
  planName: string | null;
  bundleId: string | null;
  bundleSlug: string | null;
  bundleName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  assignments: Array<{
    id: string;
    userId: string;
    email: string;
    displayName: string | null;
    notificationSentAt: string | null;
  }>;
};

export type AdminDiscountCodeInput = {
  kind: 'subscription' | 'bundle';
  percentOff: number;
  durationMonths: number | null;
  planId: string | null;
  bundleId: string | null;
  isActive: boolean;
  assignedUserEmails: string[];
};

export type AdminDiscountOptions = {
  plans: Array<{ id: string; slug: string; name: string }>;
  bundles: Array<{ id: string; slug: string; name: string }>;
};

export type AdminAppReleaseListItem = {
  id: string;
  version: string | null;
  releaseDate: string;
  status: AppReleaseStatus;
  publishedAt: string | null;
  contentRevision: number;
  translationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminAppReleaseMedia = {
  id: string;
  releaseId: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  fileSize: number;
  createdAt: string;
};

export type AdminAppReleaseDetail = Omit<AdminAppReleaseListItem, 'translationCount'> & {
  translations: Array<{
    locale: string;
    title: string;
    changes: AppReleaseChange[];
    emailSubject: string;
    emailPreheader: string;
    emailBody: AppReleaseEmailBlock[];
  }>;
  media: AdminAppReleaseMedia[];
};

export function useAdminAppReleases() {
  return useQuery({
    queryKey: ['admin', 'app-releases'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: AdminAppReleaseListItem[] }>(
        '/api/v1/admin/app-releases'
      );
      return response.data.data;
    },
  });
}

export function useAdminAppRelease(id?: string) {
  return useQuery({
    queryKey: ['admin', 'app-release', id ?? ''],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: AdminAppReleaseDetail }>(
        `/api/v1/admin/app-releases/${id}`
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateAdminAppRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AppReleaseInput) => {
      const response = await apiClient.post<{ status: string; data: AdminAppReleaseDetail }>(
        '/api/v1/admin/app-releases', input
      );
      return response.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'app-releases'] }),
  });
}

export function useUpdateAdminAppRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AppReleaseInput }) => {
      const response = await apiClient.put<{ status: string; data: AdminAppReleaseDetail }>(
        `/api/v1/admin/app-releases/${id}`, input
      );
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'app-releases'] });
      queryClient.setQueryData(['admin', 'app-release', data.id], data);
    },
  });
}

export function useUploadAdminAppReleaseMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ releaseId, formData }: { releaseId: string; formData: FormData }) => {
      const response = await apiClient.post<{ status: string; data: AdminAppReleaseMedia }>(
        `/api/v1/admin/app-releases/${releaseId}/media`, formData
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'app-release', variables.releaseId] });
    },
  });
}

export function useDeleteAdminAppReleaseMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ releaseId, mediaId }: { releaseId: string; mediaId: string }) => {
      await apiClient.delete(`/api/v1/admin/app-releases/${releaseId}/media/${mediaId}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'app-release', variables.releaseId] });
    },
  });
}

export async function fetchAdminAppReleaseEmailPreview(id: string, locale: string): Promise<string> {
  const response = await apiClient.get<string>(
    `/api/v1/admin/app-releases/${id}/email-preview/${locale}`
  );
  return response.data;
}

export type AdminFeedbackListItem = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  category: FeedbackCategory | string;
  message: string;
  email: string | null;
  screenshotUrl: string | null;
  context: {
    platform: string | null;
    userAgent: string | null;
    url: string | null;
    reportedScreen: string | null;
    supportTopic: FeedbackTopic | string | null;
    storyId: string | null;
    storySlug: string | null;
    shareToken: string | null;
    sceneId: number | null;
    contentType: string | null;
    contentReviewStatus: string | null;
    contentReviewQueued: boolean | null;
    contentQuarantined: boolean | null;
    quarantinedStoryId: string | null;
  };
  createdAt: string;
};

export type AdminDataPrivacyRequestType = 'export' | 'deletion';
export type AdminDataPrivacyRequestStatus =
  | 'open'
  | 'in_review'
  | 'fulfilled'
  | 'rejected'
  | 'canceled';

export type AdminDataPrivacyRequestItem = {
  id: string;
  userId: string | null;
  requesterEmail: string | null;
  requestType: AdminDataPrivacyRequestType | string;
  status: AdminDataPrivacyRequestStatus | string;
  message: string | null;
  adminNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminDataPrivacyExportPayload = {
  request: AdminDataPrivacyRequestItem;
  export: Record<string, unknown>;
};

export type AdminJobStatusPayload = {
  job: {
    id: string;
    type: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    retries: number;
    createdAt: string;
    startedAt: number | null;
    actualDurationMs: number | null;
    error: string | null;
  };
  queue: {
    jobStatus: 'queued' | 'processing' | null;
    queuePosition: number | null;
    activeJobsCount: number;
    maxConcurrency: number;
    totalWaiting: number;
    estimatedWaitMs: number | null;
    processingStartedAt: number | null;
    estimatedProcessingMs: number | null;
  };
};

export type AdminImageValidationItem = {
  id: string;
  storyId: string;
  storyFormat?: string | null;
  sceneIndex: number;
  sourceSceneIndex?: number;
  imageTargetKind?: 'scene' | 'graphic_novel_page' | 'none';
  graphicNovelPageNumber?: number | null;
  mixedStoryScreenOrder?: number | null;
  subjectType?: string | null;
  pageNumber?: number | null;
  panelIndex?: number | null;
  panelId?: string | null;
  cropRect?: unknown | null;
  attempt: number;
  imageStoragePath: string;
  imageUrl: string;
  validationScore: number | null;
  validationStatus: string;
  visionModel: string | null;
  requestManifest: unknown;
  providerError: string | null;
  result: unknown;
  usage?: AdminImageValidationUsage | null;
  createdAt: string;
};

export type AdminImageValidationUsage = {
  provider: string;
  operation: string;
  model: string | null;
  inputUnits: number | null;
  outputUnits: number | null;
  costUsd: number | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  matchedDeltaMs: number;
  eventCount: number;
  operations: string[];
};

export type AdminImageValidationDetail = AdminImageValidationItem & {
  usage: AdminImageValidationUsage | null;
};

export type AdminSceneImageValidationCandidateComparison = {
  id: string;
  attempt: number;
  imageStoragePath: string;
  score: number;
  validationStatus: string;
  missingCharacters: string[];
  selected: boolean;
  createdAt: string;
};

export type AdminApplyBestSceneImageValidationCandidateResult = {
  storyId: string;
  sceneIndex: number;
  previousImageStoragePath: string | null;
  selectedValidationId: string;
  selectedAttempt: number;
  selectedScore: number;
  selectedImageStoragePath: string;
  selectedAssetId: string;
  compared: AdminSceneImageValidationCandidateComparison[];
  changed: boolean;
};

export type AdminDirectorSceneItem = {
  id: string;
  storyId: string;
  sceneIndex: number;
  storyText: string;
  environmentId: string | null;
  characterOutfitIds: Record<string, string> | null;
  sceneVisual: unknown;
  illustrationBlockIndex: number;
  isBlockAnchor: boolean;
  createdAt: string;
};

export type AdminStorySceneItem = {
  sceneIndex: number;
  storyText: string;
  mixedStoryBlockKind?: string | null;
  mixedStoryScreenOrder?: number | null;
  graphicNovelPageNumber?: number | null;
  imageTargetKind?: 'scene' | 'graphic_novel_page' | 'none';
  hasImage: boolean;
  imageUrl: string | null;
  imageStoragePath: string | null;
  imageRequestManifest: unknown | null;
};

export type AdminStoryValidationItem = {
  id: string;
  storyId: string;
  sceneIndex: number;
  sourceSceneIndex?: number;
  imageTargetKind?: 'scene' | 'graphic_novel_page' | 'none';
  graphicNovelPageNumber?: number | null;
  mixedStoryScreenOrder?: number | null;
  subjectType?: string | null;
  pageNumber?: number | null;
  panelIndex?: number | null;
  panelId?: string | null;
  cropRect?: unknown | null;
  attempt: number;
  imageStoragePath: string;
  imageUrl: string;
  validationScore: number | null;
  validationStatus: string;
  visionModel: string | null;
  requestManifest: unknown;
  providerError: string | null;
  result: unknown;
  usage?: AdminImageValidationUsage | null;
  createdAt: string;
};

export type AdminStoryCostBreakdownItem = {
  provider: string;
  operation: string;
  model: string | null;
  costUsd: number;
  createdAt: string;
};

export type AdminTextValidationAttempt = {
  sceneId: number;
  attempt: number;
  phase: string;
  durationMs: number;
  isValid: boolean;
  score: number;
  result: unknown;
  rawResult: unknown;
  rawManifest: Record<string, unknown> | null;
};

export type AdminTextValidationPayload = {
  version?: number;
  status?: string;
  score?: number;
  sceneCount?: number;
  attemptCount?: number;
  validationTimeMs?: number;
  passedSceneIds?: number[];
  failedSceneIds?: number[];
  attempts?: AdminTextValidationAttempt[];
};

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
  costByStoryFormat: Array<{
    format: 'story' | 'graphic_novel' | 'mixed_story';
    storyCount: number;
    costTrackedStoryCount: number;
    unpricedStoryCount: number;
    totalCostUsd: number;
    avgCostUsd: number;
  }>;
};

export type AdminDashboardStatus = 'healthy' | 'warning' | 'critical';

export type AdminDashboardCostControls = {
  status: AdminDashboardStatus;
  thresholds: {
    storyWarnUsd: number;
    graphicNovelWarnUsd: number;
    mixedStoryWarnUsd: number;
    dailyWarnUsd: number;
    monthlyWarnUsd: number;
    userDailyWarnUsd: number;
    queueDepthWarn: number;
  };
  dailyAverageCostUsd: number;
  projectedMonthlyCostUsd: number;
  highCostStoryCount: number;
  maxStoryCostUsd: number;
  storyCostsByFormat: Array<{
    format: 'story' | 'graphic_novel' | 'mixed_story';
    storyCount: number;
    avgCostUsd: number;
    highCostStoryCount: number;
    maxStoryCostUsd: number;
  }>;
  unpricedEventCount: number;
  topUser24hUserId: string | null;
  topUser24hCostUsd: number;
  topUser24hEventCount: number;
  topUser24hStoryCount: number;
  alerts: Array<{
    key: string;
    severity: Exclude<AdminDashboardStatus, 'healthy'>;
    title: string;
    detail: string;
    action: string;
    reviewUrl: string;
    metricValue: number;
    thresholdValue: number;
  }>;
};

export type AdminDashboardQueueHealth = {
  status: AdminDashboardStatus;
  thresholdQueued: number;
  totalQueued: number;
  totalProcessing: number;
  totalFailed: number;
  queues: Array<{
    name: string;
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    maxConcurrency: number;
  }>;
};

export type AdminDashboardQualityReview = {
  status: AdminDashboardStatus;
  thresholds: {
    failedRequestRateWarn: number;
    imageRetryRateWarn: number;
    unsafeReportCritical: number;
    moderationFailureCritical: number;
    generationFeedbackWarn: number;
    publicReportWarn: number;
  };
  failedRequestRate: number;
  imageRetryStoryRate: number;
  moderationFailureCount: number;
  unsafeReportCount: number;
  generationFailureReportCount: number;
  publicStoryReportCount: number;
  sampleCandidateCount: number;
  queues: Array<{
    key: string;
    label: string;
    count: number;
    priority: 'low' | 'medium' | 'high' | 'critical';
    reviewUrl: string;
    helper: string;
  }>;
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

export type AdminDashboardOperationBreakdown = {
  operation: string;
  eventCount: number;
  storyCount: number;
  totalCostUsd: number;
};

export type AdminDashboardTimingPercentile = {
  generationKind: string;
  pipelinePhase: string;
  operation: string;
  eventCount: number;
  storyCount: number;
  failedEventCount: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p75DurationMs: number;
  p90DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
};

export type AdminDashboardReadinessHistogramPoint = {
  generationKind: string;
  eventCount: number;
  storyCount: number;
  bucketStartMs: number;
  bucketEndMs: number | null;
  avgDurationMs: number;
};

export type AdminDashboardBreakdownItem = {
  value: string;
  storyCount: number;
  totalCostUsd: number;
  avgCostUsd: number;
  share: number;
};

export type AdminDashboardData = {
  rangeDays: number;
  overview: AdminDashboardOverview;
  costControls: AdminDashboardCostControls;
  queueHealth: AdminDashboardQueueHealth;
  qualityReview: AdminDashboardQualityReview;
  daily: AdminDashboardDailyPoint[];
  costByImageCount: AdminDashboardImageBucket[];
  costByOperation: AdminDashboardOperationBreakdown[];
  timingByOperation: AdminDashboardTimingPercentile[];
  storyReadinessHistogram: AdminDashboardReadinessHistogramPoint[];
  languages: AdminDashboardBreakdownItem[];
  imageStyles: AdminDashboardBreakdownItem[];
};

export type AdminStoryCacheStats = {
  totalCachedInputUnits: number;
  totalEffectiveInputUnits: number;
  cacheHitCount: number;
  cachedOperationCount: number;
};

export type AdminEnvironmentItem = {
  id: string;
  name?: string;
  description?: string;
  imageUrl?: string | null;
};

export type AdminOutfitItem = {
  id: string;
  characterName?: string;
  description?: string;
  imageUrl?: string | null;
};

export type AdminContentConfigResource =
  | 'plans'
  | 'features'
  | 'planFeatures'
  | 'translations'
  | 'storyGoals'
  | 'contentPolicyRules'
  | 'ageEngineRules'
  | 'scenarioCards'
  | 'scenarioPlotExamples'
  | 'scenarioWorldRules';

export type AdminContentConfigItem = Record<string, unknown>;

type PaginatedResponse<T> = {
  status: string;
  data: {
    items: T[];
    meta: {
      limit?: number;
      offset?: number;
      total: number;
    };
  };
};

export function useAdminDashboard(days: number) {
  return useQuery({
    queryKey: ['admin', 'dashboard', days],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: AdminDashboardData }>(
        '/api/v1/admin/dashboard',
        {
          params: { days },
        }
      );
      return response.data.data;
    },
  });
}

export function useAdminJobStatus(jobId?: string | null) {
  return useQuery({
    queryKey: ['admin', 'job-status', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        data: AdminJobStatusPayload;
      }>(`/api/v1/admin/jobs/${encodeURIComponent(jobId ?? '')}`);
      return response.data.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status === 'queued' || status === 'processing' ? 2000 : false;
    },
  });
}

export function useAdminStories(params: {
  limit: number;
  offset: number;
  search?: string;
  publishedStatus?: 'all' | 'published' | 'unlisted' | 'draft';
}) {
  const { limit, offset, search, publishedStatus = 'all' } = params;
  return useQuery({
    queryKey: ['admin', 'stories', limit, offset, search ?? '', publishedStatus],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminStoryListItem>>(
        '/api/v1/admin/stories',
        {
          params: { limit, offset, search: search || undefined, publishedStatus },
        }
      );
      return response.data.data;
    },
  });
}

export function useUpdateAdminStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { storyId: string; showOnHomePage: boolean }) => {
      const response = await apiClient.patch<{
        status: string;
        data: {
          id: string;
          showOnHomePage: boolean;
          isPublished: boolean | null;
          visibility: string | null;
          publishedSlug?: string | null;
        };
      }>(`/api/v1/admin/stories/${params.storyId}`, {
        showOnHomePage: params.showOnHomePage,
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'stories'] });
    },
  });
}

export type AdminOutfitCatalogItem = {
  id: string;
  description: string;
  imageUrl: string;
  storagePath: string;
  catalogSource: string | null;
  imageStyle: string;
  ageGroup: string;
  formality: string | null;
  presentationGroups: string[];
  purposeTags: string[];
  seasonTags: string[];
  climateTags: string[];
  settingTags: string[];
  activityTags: string[];
  silhouetteTags: string[];
  footwearTags: string[];
  componentTags: string[];
  colorPalette: string[];
  materials: string[];
  patterns: string[];
  detailTags: string[];
  coverageTags: string[];
  createdAt: string;
};

export type AdminOutfitSearchItem = {
  id: string;
  description: string;
  imageUrl: string;
  storagePath: string;
  catalogSource: string | null;
  score: number;
  tagScore: number;
  meetsThreshold: boolean;
};

export type AdminOutfitSearchResult = {
  description: string;
  threshold: number;
  filters: Record<string, string | string[]>;
  items: AdminOutfitSearchItem[];
};

export function useAdminOutfits(params: { limit: number; offset: number }) {
  const { limit, offset } = params;
  return useQuery({
    queryKey: ['admin', 'outfits', limit, offset],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminOutfitCatalogItem>>(
        '/api/v1/admin/outfits',
        { params: { limit, offset } }
      );
      return response.data.data;
    },
  });
}

export function useSearchAdminOutfits() {
  return useMutation({
    mutationFn: async (params: { description: string; limit?: number }) => {
      const response = await apiClient.post<{ status: string; data: AdminOutfitSearchResult }>(
        '/api/v1/admin/outfits/search',
        { description: params.description, limit: params.limit ?? 20 }
      );
      return response.data.data;
    },
  });
}

export type AdminVoiceListItem = {
  id: string;
  provider: string;
  providerVoiceId: string;
  name: string;
  displayName: string;
  language: string;
  isActive: boolean;
  isPremium: boolean;
  updatedAt: string;
};

export function useAdminVoices(params: {
  limit: number;
  offset: number;
  search?: string;
  provider?: string;
}) {
  const { limit, offset, search, provider } = params;
  return useQuery({
    queryKey: ['admin', 'voices', limit, offset, search ?? '', provider ?? ''],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminVoiceListItem>>(
        '/api/v1/admin/voices',
        {
          params: { limit, offset, search: search || undefined, provider: provider || undefined },
        }
      );
      return response.data.data;
    },
  });
}

export function useUpdateAdminVoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { voiceId: string; isActive: boolean }) => {
      const response = await apiClient.patch<{ status: string; data: AdminVoiceListItem }>(
        `/api/v1/admin/voices/${params.voiceId}`,
        { isActive: params.isActive }
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'voices'] });
    },
  });
}

export function useAdminUsers(params: { limit: number; offset: number; search?: string }) {
  const { limit, offset, search } = params;
  return useQuery({
    queryKey: ['admin', 'users', limit, offset, search ?? ''],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminUserListItem>>(
        '/api/v1/admin/users',
        {
          params: { limit, offset, search: search || undefined },
        }
      );
      return response.data.data;
    },
  });
}

export function useAdminDiscountCodes() {
  return useQuery({
    queryKey: ['admin', 'discount-codes'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: AdminDiscountCode[] }>(
        '/api/v1/admin/discount-codes'
      );
      return response.data.data;
    },
  });
}

export function useAdminDiscountOptions() {
  return useQuery({
    queryKey: ['admin', 'discount-codes', 'options'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: AdminDiscountOptions }>(
        '/api/v1/admin/discount-codes/options'
      );
      return response.data.data;
    },
  });
}

export function useCreateAdminDiscountCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdminDiscountCodeInput) => {
      const response = await apiClient.post<{ status: string; data: AdminDiscountCode }>(
        '/api/v1/admin/discount-codes',
        input
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'discount-codes'] });
    },
  });
}

export function useUpdateAdminDiscountCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; input: AdminDiscountCodeInput }) => {
      const response = await apiClient.patch<{ status: string; data: AdminDiscountCode }>(
        `/api/v1/admin/discount-codes/${params.id}`,
        params.input
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'discount-codes'] });
    },
  });
}

export function useAdminFeedback(params: {
  limit: number;
  offset: number;
  search?: string;
  category?: FeedbackCategory;
  supportTopic?: FeedbackTopic;
  hasScreenshot?: boolean;
}) {
  const { limit, offset, search, category, supportTopic, hasScreenshot } = params;
  return useQuery({
    queryKey: [
      'admin',
      'feedback',
      limit,
      offset,
      search ?? '',
      category ?? '',
      supportTopic ?? '',
      hasScreenshot ?? false,
    ],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminFeedbackListItem>>(
        '/api/v1/admin/feedback',
        {
          params: {
            limit,
            offset,
            search: search || undefined,
            category: category || undefined,
            supportTopic: supportTopic || undefined,
            hasScreenshot: hasScreenshot || undefined,
          },
        }
      );
      return response.data.data;
    },
  });
}

export function useAdminDataPrivacyRequests(params: {
  limit: number;
  offset: number;
  search?: string;
  requestType?: AdminDataPrivacyRequestType;
  status?: AdminDataPrivacyRequestStatus;
}) {
  const { limit, offset, search, requestType, status } = params;
  return useQuery({
    queryKey: [
      'admin',
      'privacy-requests',
      limit,
      offset,
      search ?? '',
      requestType ?? '',
      status ?? '',
    ],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminDataPrivacyRequestItem>>(
        '/api/v1/admin/privacy-requests',
        {
          params: {
            limit,
            offset,
            search: search || undefined,
            requestType: requestType || undefined,
            status: status || undefined,
          },
        }
      );
      return response.data.data;
    },
  });
}

export function useUpdateAdminDataPrivacyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      status: AdminDataPrivacyRequestStatus;
      adminNotes?: string | null;
    }) => {
      const response = await apiClient.patch<{ status: string; data: AdminDataPrivacyRequestItem }>(
        `/api/v1/admin/privacy-requests/${params.requestId}`,
        {
          status: params.status,
          adminNotes: params.adminNotes ?? null,
        }
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'privacy-requests'] });
    },
  });
}

export function useBuildAdminDataPrivacyExport() {
  return useMutation({
    mutationFn: async (params: { requestId: string }) => {
      const response = await apiClient.get<{ status: string; data: AdminDataPrivacyExportPayload }>(
        `/api/v1/admin/privacy-requests/${params.requestId}/export`
      );
      return response.data.data;
    },
  });
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      role?: 'user' | 'admin';
      status?: 'active' | 'suspended';
      suspendedReason?: string | null;
      planSlug?: string;
      storiesUsedCurrentPeriod?: number;
      graphicNovelsUsedCurrentPeriod?: number;
      audioStoriesUsedCurrentPeriod?: number;
    }) => {
      const response = await apiClient.patch<{
        status: string;
        data: {
          id: string;
          email: string;
          role: 'user' | 'admin';
          status: 'active' | 'suspended';
          suspendedReason: string | null;
        };
      }>(`/api/v1/admin/users/${params.userId}`, {
        role: params.role,
        status: params.status,
        suspendedReason: params.suspendedReason,
        planSlug: params.planSlug,
        storiesUsedCurrentPeriod: params.storiesUsedCurrentPeriod,
        graphicNovelsUsedCurrentPeriod: params.graphicNovelsUsedCurrentPeriod,
        audioStoriesUsedCurrentPeriod: params.audioStoriesUsedCurrentPeriod,
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAdminImageValidations(params: { limit: number; offset: number }) {
  const { limit, offset } = params;
  return useQuery({
    queryKey: ['admin', 'image-validations', limit, offset],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminImageValidationItem>>(
        '/api/v1/admin/image-validations',
        {
          params: { limit, offset },
        }
      );
      return response.data.data;
    },
  });
}

export function useAdminImageValidation(id?: string) {
  return useQuery({
    queryKey: ['admin', 'image-validation', id ?? ''],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: AdminImageValidationDetail }>(
        `/api/v1/admin/image-validations/${id}`
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useAdminApplyBestSceneImageValidationCandidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { validationId: string }) => {
      const response = await apiClient.post<{
        status: string;
        data: AdminApplyBestSceneImageValidationCandidateResult;
      }>(`/api/v1/admin/image-validations/${params.validationId}/apply-best-scene-image`);
      return response.data.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validation'] });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'image-validation', variables.validationId],
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'director-scenes', data.storyId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stories'] });
    },
  });
}

export type AdminResetStoryAudioClearedPayload = {
  storyId: string;
  userId: string;
  audioAssetRowsRemoved: boolean;
  audioFileAssetsRemoved: boolean;
  alignmentRemoved: boolean;
  storageFilesAttempted: number;
  storageFilesDeleted: number;
};

export type AdminResetStoryAudioResponse = {
  cleared: AdminResetStoryAudioClearedPayload;
  jobId?: string;
};

export function useAdminResetStoryAudio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      storyId: string;
      regenerate?: boolean;
      voiceId?: string;
      speed?: number;
      nightMode?: boolean;
    }) => {
      const response = await apiClient.post<{ status: string; data: AdminResetStoryAudioResponse }>(
        `/api/v1/admin/stories/${params.storyId}/audio/reset`,
        {
          regenerate: params.regenerate === true,
          voiceId: params.voiceId,
          speed: params.speed,
          nightMode: params.nightMode,
        }
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'director-scenes', variables.storyId] });
    },
  });
}

export function useAdminRegenerateSceneImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { storyId: string; sceneId: number; visualPrompt?: string }) => {
      const response = await apiClient.post<{
        status: string;
        message: string;
        data: {
          jobId: string;
          storyId: string;
          sceneId: number;
        };
      }>(`/api/v1/admin/stories/${params.storyId}/scenes/${params.sceneId}/regenerate-image`, {
        visualPrompt: params.visualPrompt,
      });
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validation'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'director-scenes', variables.storyId] });
    },
  });
}

export function useAdminRegenerateGraphicNovelPageImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      storyId: string;
      pageNumber: number;
      style?: string;
    }) => {
      const response = await apiClient.post<{
        status: string;
        message: string;
        data: {
          jobId: string;
          storyId: string;
          pageNumber: number;
        };
      }>(`/api/v1/admin/stories/${params.storyId}/graphic-novel-pages/${params.pageNumber}/regenerate-image`, {
        style: params.style,
      });
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validation'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'director-scenes', variables.storyId] });
    },
  });
}

export type AdminGraphicNovelPanelRepairIssueKind =
  | 'presence'
  | 'duplicate'
  | 'head'
  | 'face'
  | 'hair'
  | 'age'
  | 'body'
  | 'design'
  | 'silhouette'
  | 'colors'
  | 'outfit'
  | 'unexpected'
  | 'text'
  | 'generic';

export function useAdminRepairGraphicNovelPanels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      storyId: string;
      pageNumber: number;
      panels: Array<{
        panelNumber: number;
        panelId?: string;
        mode?: 'edit' | 'regenerate';
        issues: Array<{
          kind: AdminGraphicNovelPanelRepairIssueKind;
          comment: string;
          characterId?: string;
          characterName?: string;
        }>;
      }>;
      refreshTurnaroundCharacterIds?: string[];
      style?: string;
    }) => {
      const response = await apiClient.post<{
        status: string;
        message: string;
        data: {
          jobId: string;
          storyId: string;
          pageNumber: number;
          panelNumbers: number[];
        };
      }>(
        `/api/v1/admin/stories/${params.storyId}/graphic-novel-pages/${params.pageNumber}/repair-panels`,
        {
          panels: params.panels,
          refreshTurnaroundCharacterIds: params.refreshTurnaroundCharacterIds,
          style: params.style,
        }
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validation'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'director-scenes', variables.storyId] });
    },
  });
}

export type AdminStoryAudioTimingPayload = {
  audioGenerationTimeMs: number | null;
  prosodyTaggingTimeMs: number | null;
  ttsChunksSynthesisTimeMs: number | null;
  ttsBatchWallTimeMs: number | null;
  ttsSynthesisBatchesWallMs: number | null;
  ttsChunksParallelEstimateMs: number | null;
};

export type AdminStoryAudioChunkPayload = {
  groupIndex: number;
  assetId: string | null;
  generationTimeMs: number | null;
};

export type AdminSynthesisTaggedSegment = {
  text: string;
  isMissingChunk: boolean;
};

export type AdminStoryAudioPayload = {
  audioUrl: string | null;
  synthesisTaggedText: string | null;
  /** Present when `audio_metadata.deferredTaggedFullText` exists (deferred prosody); pink UI for `isMissingChunk`. */
  synthesisTaggedSegments: AdminSynthesisTaggedSegment[] | null;
  /** Count of `[` openings excluding `[ID:…]` scene markers — 0 means no inline prosody tags in stored TTS string. */
  synthesisInlineBracketOpenCount: number;
  /** Non-null when stored TTS text is non-empty but has no inline bracket tags (prosody fallback). */
  synthesisProsodyHint: string | null;
  vendorStylePromptEn: string | null;
  durationSeconds: number | null;
  voiceName: string | null;
  timing: AdminStoryAudioTimingPayload;
  chunks: AdminStoryAudioChunkPayload[];
};

export type AdminMapTileAssetPayload = {
  id: string;
  imageUrl: string;
  storagePath: string;
  thumbnailPath: string | null;
  mimeType: string;
  fileSizeBytes: number | null;
  generationTimeMs: number | null;
  createdAt: string;
  mask: {
    id: string;
    label?: string;
    description?: string;
    connectors?: Record<string, string>;
    topology?: string;
    routeGroups?: unknown[];
    features?: string[];
    imageUrl?: string;
  } | null;
  generationParams: Record<string, unknown>;
};

export function useAdminDirectorScenes(storyId?: string) {
  return useQuery({
    queryKey: ['admin', 'director-scenes', storyId ?? ''],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        data: {
          story: {
            id: string;
            title: string;
            storyFormat: string | null;
            mapTile: unknown;
            mapTileAsset: AdminMapTileAssetPayload | null;
            textValidation: AdminTextValidationPayload | null;
            createdAt: string;
          };
          storyScenes: AdminStorySceneItem[];
          items: AdminDirectorSceneItem[];
          validations: AdminStoryValidationItem[];
          cost: {
            costUsd: number;
            cacheStats: AdminStoryCacheStats;
            breakdown: AdminStoryCostBreakdownItem[];
          };
          environments: AdminEnvironmentItem[];
          outfits: AdminOutfitItem[];
          audio: AdminStoryAudioPayload;
          meta: { total: number };
        };
      }>(`/api/v1/admin/stories/${storyId}/director-scenes`);
      return response.data.data;
    },
    enabled: !!storyId,
  });
}

export function useAdminContentConfig(resource: AdminContentConfigResource) {
  return useQuery({
    queryKey: ['admin', 'content-config', resource],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        data: {
          resource: AdminContentConfigResource;
          items: AdminContentConfigItem[];
          meta: { total: number };
        };
      }>(`/api/v1/admin/content-config/${resource}`);
      return response.data.data;
    },
  });
}

export function useUpdateAdminContentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      resource: AdminContentConfigResource;
      id: string;
      patch: Record<string, unknown>;
    }) => {
      const response = await apiClient.patch<{ status: string; data: AdminContentConfigItem }>(
        `/api/v1/admin/content-config/${params.resource}/${params.id}`,
        params.patch
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content-config', variables.resource] });
    },
  });
}

export function useCreateAdminContentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      resource: AdminContentConfigResource;
      payload: Record<string, unknown>;
    }) => {
      const response = await apiClient.post<{ status: string; data: AdminContentConfigItem }>(
        `/api/v1/admin/content-config/${params.resource}`,
        params.payload
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content-config', variables.resource] });
    },
  });
}

export function useDeleteAdminContentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { resource: AdminContentConfigResource; id: string }) => {
      const response = await apiClient.delete<{ status: string; data: { deleted: boolean } }>(
        `/api/v1/admin/content-config/${params.resource}/${params.id}`
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content-config', variables.resource] });
    },
  });
}
