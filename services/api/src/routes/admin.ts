import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { FEEDBACK_CATEGORIES, FEEDBACK_TOPICS } from '@wondertales/shared';
import { requireAdmin, requireAuth } from '../middleware/authMiddleware';
import { storyJobQueue } from '../jobs/storyJobProcessor';
import { getAssetRepository, getGraphicNovelRepository, getStoryRepository } from '../repositories';
import {
  createAdminConfigItem,
  deleteAdminConfigItem,
  getAdminDashboard,
  listAdminFeedback,
  getAdminImageValidation,
  listAdminConfigItems,
  listAdminDirectorScenes,
  listAdminImageValidations,
  listAdminStories,
  adminResetStoryAudio,
  listAdminUsers,
  listAdminVoices,
  updateAdminStoryHomePageFlag,
  updateAdminConfigItem,
  updateAdminVoiceActive,
} from '../services/adminService';
import { updateAdminUserSettings } from '../services/adminUserService';
import {
  DATA_PRIVACY_REQUEST_STATUSES,
  DATA_PRIVACY_REQUEST_TYPES,
  buildAdminDataExportForPrivacyRequest,
  buildDataExportDownloadFilename,
  listAdminDataPrivacyRequests,
  updateAdminDataPrivacyRequest,
} from '../services/dataPrivacyRequestService';
import { listAdminModerationDecisionEvents } from '../services/moderationDecisionService';
import { MAP_TILE_MASK_VARIANTS } from '../domain/story/mapTileMasks';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireAuth, requireAdmin);

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().optional(),
  publishedStatus: z.enum(['all', 'published', 'unlisted', 'draft']).optional().default('all'),
});

const FeedbackListQuerySchema = ListQuerySchema.extend({
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  supportTopic: z.enum(FEEDBACK_TOPICS).optional(),
  hasScreenshot: z.coerce.boolean().optional(),
});

const DataPrivacyRequestListQuerySchema = ListQuerySchema.extend({
  requestType: z.enum(DATA_PRIVACY_REQUEST_TYPES).optional(),
  status: z.enum(DATA_PRIVACY_REQUEST_STATUSES).optional(),
});

const ModerationDecisionListQuerySchema = ListQuerySchema.extend({
  decision: z.string().trim().min(1).max(40).optional(),
  stage: z.string().trim().min(1).max(80).optional(),
  userId: z.string().uuid().optional(),
  storyId: z.string().uuid().optional(),
});

const UpdateDataPrivacyRequestBodySchema = z
  .object({
    status: z.enum(DATA_PRIVACY_REQUEST_STATUSES),
    adminNotes: z.string().max(2000).nullable().optional(),
  })
  .strict();

const DashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(3650).default(30),
});

const StoryIdParamsSchema = z.object({
  storyId: z.string().uuid(),
});

const MapTileMaskImageParamsSchema = z.object({
  maskId: z.string().trim().min(1).max(180).regex(/^[a-z0-9-]+$/),
});

const AdminAssetImageParamsSchema = z.object({
  assetId: z.string().uuid(),
});

const UserIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const DataPrivacyRequestIdParamsSchema = z.object({
  requestId: z.string().uuid(),
});

const VoiceIdParamsSchema = z.object({
  voiceId: z.string().uuid(),
});

const AdminVoicesListQuerySchema = ListQuerySchema.extend({
  provider: z.string().trim().min(1).max(50).optional(),
});

const UpdateAdminVoiceBodySchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

const ValidationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const StorySceneParamsSchema = z.object({
  storyId: z.string().uuid(),
  sceneId: z.coerce.number().int().min(1),
});

const StoryGraphicNovelPageParamsSchema = z.object({
  storyId: z.string().uuid(),
  pageNumber: z.coerce.number().int().min(1).max(100),
});

const AdminRegenerateSceneImageBodySchema = z.object({
  visualPrompt: z.string().trim().min(1).optional(),
}).strict();

const AdminRegenerateGraphicNovelPageImageBodySchema = z.object({
  preferredTemplateId: z.string().trim().min(1).max(20).optional(),
  style: z.string().trim().min(1).max(400).optional(),
}).strict();

const AdminResetStoryAudioBodySchema = z
  .object({
    /** When true, enqueue `audio_generation` after DB/storage cleanup (full rebuild from scratch). */
    regenerate: z.boolean().optional(),
    voiceId: z.string().uuid().optional(),
    speed: z.coerce.number().min(0.5).max(2).optional(),
    nightMode: z.boolean().optional(),
  })
  .strict();

const AdminConfigResourceSchema = z.enum([
  'plans',
  'features',
  'planFeatures',
  'translations',
  'storyGoals',
  'contentPolicyRules',
  'ageEngineRules',
  'scenarioCards',
  'scenarioPlotExamples',
  'scenarioWorldRules',
]);

const AdminConfigParamsSchema = z.object({
  resource: AdminConfigResourceSchema,
  id: z.string().trim().min(1),
});

const UpdateAdminUserBodySchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  suspendedReason: z.string().trim().max(1000).nullable().optional(),
  planSlug: z.string().trim().min(1).optional(),
  storiesUsedCurrentPeriod: z.coerce.number().int().min(0).optional(),
  graphicNovelsUsedCurrentPeriod: z.coerce.number().int().min(0).optional(),
  audioStoriesUsedCurrentPeriod: z.coerce.number().int().min(0).optional(),
}).refine(
  (value) =>
    value.role !== undefined ||
    value.status !== undefined ||
    value.suspendedReason !== undefined ||
    value.planSlug !== undefined ||
    value.storiesUsedCurrentPeriod !== undefined ||
    value.graphicNovelsUsedCurrentPeriod !== undefined ||
    value.audioStoriesUsedCurrentPeriod !== undefined,
  {
    message: 'At least one field is required',
  }
);

const UpdateAdminStoryBodySchema = z.object({
  showOnHomePage: z.boolean(),
}).strict();

const UPLOADS_DIR_CANDIDATES = [
  path.resolve(process.cwd(), 'uploads'),
  path.resolve(process.cwd(), 'services', 'api', 'uploads'),
  path.resolve(__dirname, '..', '..', 'uploads'),
];

async function resolveUploadFilePath(storagePath: string): Promise<string | null> {
  for (const uploadsDir of UPLOADS_DIR_CANDIDATES) {
    const fullPath = path.resolve(uploadsDir, storagePath);
    const safe = fullPath === uploadsDir || fullPath.startsWith(uploadsDir + path.sep);
    if (!safe) continue;

    try {
      await fs.access(fullPath);
      return fullPath;
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return null;
}

async function resolveMapTileMaskImagePath(maskId: string): Promise<string | null> {
  const relative = path.join('assets', 'map-tile-mask-library', `${maskId}.png`);
  const candidates = [
    path.resolve(process.cwd(), relative),
    path.resolve(process.cwd(), 'services', 'api', relative),
    path.resolve(__dirname, '..', '..', relative),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return null;
}

const StoryGoalPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  promptGuidance: z.string().trim().min(1).optional(),
  minAge: z.coerce.number().int().min(0).optional(),
  sortOrder: z.coerce.number().int().optional(),
}).strict();

const PlanPatchSchema = z.object({
  slug: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  priceMonthly: z.coerce.number().int().min(0).optional(),
  pricingCurrency: z.string().trim().min(1).optional(),
  billingPeriod: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  metadata: z.string().trim().optional(),
}).strict();

const PlanCreateSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  priceMonthly: z.coerce.number().int().min(0).default(0),
  pricingCurrency: z.string().trim().min(1).default('UAH'),
  billingPeriod: z.string().trim().min(1).default('monthly'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  metadata: z.string().trim().optional(),
}).strict();

const FeaturePatchSchema = z.object({
  slug: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  featureType: z.string().trim().min(1).optional(),
  defaultValue: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
}).strict();

const FeatureCreateSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  featureType: z.string().trim().min(1),
  defaultValue: z.string().trim().min(1),
  category: z.string().trim().min(1),
}).strict();

const PlanFeaturePatchSchema = z.object({
  planId: z.string().uuid().optional(),
  featureId: z.string().uuid().optional(),
  value: z.string().trim().min(1).optional(),
}).strict();

const PlanFeatureCreateSchema = z.object({
  planId: z.string().uuid(),
  featureId: z.string().uuid(),
  value: z.string().trim().min(1),
}).strict();

const TranslationPatchSchema = z.object({
  entityType: z.string().trim().min(1).max(50).optional(),
  entityId: z.string().trim().min(1).max(100).optional(),
  locale: z.string().trim().min(2).max(5).optional(),
  fieldName: z.string().trim().min(1).max(50).optional(),
  value: z.string().trim().min(1).optional(),
}).strict();

const TranslationCreateSchema = z.object({
  entityType: z.string().trim().min(1).max(50),
  entityId: z.string().trim().min(1).max(100),
  locale: z.string().trim().min(2).max(5),
  fieldName: z.string().trim().min(1).max(50),
  value: z.string().trim().min(1),
}).strict();

const StoryGoalCreateSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  promptGuidance: z.string().trim().min(1),
  minAge: z.coerce.number().int().min(0),
  sortOrder: z.coerce.number().int().default(0),
}).strict();

const ContentPolicyRulePatchSchema = z.object({
  category: z.string().trim().min(1).optional(),
  promptGuidance: z.string().trim().min(1).optional(),
  sortOrder: z.coerce.number().int().optional(),
}).strict();

const ContentPolicyRuleCreateSchema = z.object({
  id: z.string().trim().min(1),
  category: z.string().trim().min(1),
  promptGuidance: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().default(0),
}).strict();

const AgeEngineRulePatchSchema = z.object({
  sceneCount: z.coerce.number().int().min(1).optional(),
  wordRangeMin: z.coerce.number().int().min(0).optional(),
  wordRangeMax: z.coerce.number().int().min(0).optional(),
  maxSentenceLength: z.coerce.number().int().min(1).optional(),
  dialogRatio: z.coerce.string().trim().min(1).optional(),
  allowedConflicts: z.string().trim().min(1).optional(),
  additionalRules: z.string().trim().min(1).optional(),
}).strict();

const AgeEngineRuleCreateSchema = z.object({
  ageGroup: z.string().trim().min(1),
  sceneCount: z.coerce.number().int().min(1),
  wordRangeMin: z.coerce.number().int().min(0),
  wordRangeMax: z.coerce.number().int().min(0),
  maxSentenceLength: z.coerce.number().int().min(1),
  dialogRatio: z.coerce.string().trim().min(1),
  allowedConflicts: z.string().trim().min(1),
  additionalRules: z.string().trim().min(1),
}).strict();

const ScenarioCardPatchSchema = z.object({
  nameKey: z.string().trim().min(1).optional(),
  descriptionKey: z.string().trim().min(1).optional(),
  icon: z.string().trim().nullable().optional(),
  promptGuidance: z.string().trim().min(1).optional(),
  suggestedGoals: z.string().trim().min(1).optional(),
  ageGroups: z.string().trim().min(1).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
}).strict();

const ScenarioCardCreateSchema = z.object({
  id: z.string().trim().min(1),
  nameKey: z.string().trim().min(1),
  descriptionKey: z.string().trim().min(1),
  icon: z.string().trim().nullable().optional(),
  promptGuidance: z.string().trim().min(1),
  suggestedGoals: z.string().trim().min(1),
  ageGroups: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
}).strict();

const ScenarioPlotExamplePatchSchema = z.object({
  scenarioCardId: z.string().trim().min(1).optional(),
  setting: z.string().trim().min(1).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
}).strict();

const ScenarioPlotExampleCreateSchema = z.object({
  scenarioCardId: z.string().trim().min(1),
  setting: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
}).strict();

const ScenarioWorldRulePatchSchema = z.object({
  scenarioCardId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
}).strict();

const ScenarioWorldRuleCreateSchema = z.object({
  scenarioCardId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
}).strict();

function getAdminConfigPatchSchema(resource: z.infer<typeof AdminConfigResourceSchema>) {
  switch (resource) {
    case 'plans':
      return PlanPatchSchema;
    case 'features':
      return FeaturePatchSchema;
    case 'planFeatures':
      return PlanFeaturePatchSchema;
    case 'translations':
      return TranslationPatchSchema;
    case 'storyGoals':
      return StoryGoalPatchSchema;
    case 'contentPolicyRules':
      return ContentPolicyRulePatchSchema;
    case 'ageEngineRules':
      return AgeEngineRulePatchSchema;
    case 'scenarioCards':
      return ScenarioCardPatchSchema;
    case 'scenarioPlotExamples':
      return ScenarioPlotExamplePatchSchema;
    case 'scenarioWorldRules':
      return ScenarioWorldRulePatchSchema;
  }
}

function getAdminConfigCreateSchema(resource: z.infer<typeof AdminConfigResourceSchema>) {
  switch (resource) {
    case 'plans':
      return PlanCreateSchema;
    case 'features':
      return FeatureCreateSchema;
    case 'planFeatures':
      return PlanFeatureCreateSchema;
    case 'translations':
      return TranslationCreateSchema;
    case 'storyGoals':
      return StoryGoalCreateSchema;
    case 'contentPolicyRules':
      return ContentPolicyRuleCreateSchema;
    case 'ageEngineRules':
      return AgeEngineRuleCreateSchema;
    case 'scenarioCards':
      return ScenarioCardCreateSchema;
    case 'scenarioPlotExamples':
      return ScenarioPlotExampleCreateSchema;
    case 'scenarioWorldRules':
      return ScenarioWorldRuleCreateSchema;
  }
}

function hasOwnKeys(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}

function parseJsonFieldIfPresent(payload: Record<string, unknown>, key: string) {
  if (typeof payload[key] !== 'string') return;
  const raw = (payload[key] as string).trim();
  if (!raw) {
    payload[key] = null;
    return;
  }
  payload[key] = JSON.parse(raw);
}

function normalizeAdminConfigPayload(
  resource: z.infer<typeof AdminConfigResourceSchema>,
  payload: Record<string, unknown>,
) {
  if (resource === 'plans') {
    parseJsonFieldIfPresent(payload, 'metadata');
  }
  if (resource === 'features') {
    parseJsonFieldIfPresent(payload, 'defaultValue');
  }
  if (resource === 'planFeatures') {
    parseJsonFieldIfPresent(payload, 'value');
  }
  return payload;
}

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const parsed = DashboardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }

    const data = await getAdminDashboard(parsed.data.days);

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin dashboard fetch failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to load dashboard',
    });
  }
});

router.get('/stories', async (req: Request, res: Response) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }

    const { limit, offset, search, publishedStatus } = parsed.data;
    const data = await listAdminStories({ limit, offset, search, publishedStatus });

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin stories list failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list stories',
    });
  }
});

router.patch('/stories/:storyId', async (req: Request, res: Response) => {
  try {
    const parsedParams = StoryIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid story id',
        details: parsedParams.error.flatten(),
      });
    }

    const parsedBody = UpdateAdminStoryBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request body',
        details: parsedBody.error.flatten(),
      });
    }

    const data = await updateAdminStoryHomePageFlag(parsedParams.data.storyId, parsedBody.data.showOnHomePage);
    if (!data) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.storyId }, 'Admin story update failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update story',
    });
  }
});

router.get('/users', async (req: Request, res: Response) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }

    const { limit, offset, search } = parsed.data;
    const data = await listAdminUsers({ limit, offset, search });

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin users list failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list users',
    });
  }
});

router.get('/voices', async (req: Request, res: Response) => {
  try {
    const parsed = AdminVoicesListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }

    const { limit, offset, search, provider } = parsed.data;
    const data = await listAdminVoices({ limit, offset, search, provider });

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin voices list failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list voices',
    });
  }
});

router.patch('/voices/:voiceId', async (req: Request, res: Response) => {
  try {
    const parsedParams = VoiceIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const parsedBody = UpdateAdminVoiceBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid body',
        details: parsedBody.error.flatten(),
      });
    }

    const data = await updateAdminVoiceActive(parsedParams.data.voiceId, parsedBody.data.isActive);
    if (!data) {
      return res.status(404).json({
        status: 'error',
        message: 'Voice not found',
      });
    }

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin voice update failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update voice',
    });
  }
});

router.get('/feedback', async (req: Request, res: Response) => {
  try {
    const parsed = FeedbackListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }

    const { limit, offset, search, category, supportTopic, hasScreenshot } = parsed.data;
    const data = await listAdminFeedback({
      limit,
      offset,
      search,
      category,
      supportTopic,
      hasScreenshot,
    });

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin feedback list failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list feedback',
    });
  }
});

router.get('/moderation-decisions', async (req: Request, res: Response) => {
  try {
    const parsed = ModerationDecisionListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }

    const { limit, offset, decision, stage, userId, storyId } = parsed.data;
    const data = await listAdminModerationDecisionEvents({
      limit,
      offset,
      decision,
      stage,
      userId,
      storyId,
    });

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin moderation decisions list failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list moderation decisions',
    });
  }
});

router.get('/privacy-requests', async (req: Request, res: Response) => {
  try {
    const parsed = DataPrivacyRequestListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }

    const { limit, offset, requestType, status, search } = parsed.data;
    const data = await listAdminDataPrivacyRequests({
      limit,
      offset,
      requestType,
      status,
      search,
    });

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin privacy requests list failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list privacy requests',
    });
  }
});

router.get('/privacy-requests/:requestId/export', async (req: Request, res: Response) => {
  try {
    const parsedParams = DataPrivacyRequestIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const result = await buildAdminDataExportForPrivacyRequest(parsedParams.data.requestId);
    if (result.outcome === 'not_found') {
      return res.status(404).json({
        status: 'error',
        message: 'Privacy request not found',
      });
    }
    if (result.outcome === 'wrong_type') {
      return res.status(400).json({
        status: 'error',
        message: 'Privacy request is not an export request',
        data: { request: result.request },
      });
    }
    if (result.outcome === 'detached_user') {
      return res.status(409).json({
        status: 'error',
        message: 'Privacy request is no longer attached to a user',
        data: { request: result.request },
      });
    }
    if (result.outcome === 'user_not_found') {
      return res.status(404).json({
        status: 'error',
        message: 'User for privacy request not found',
        data: { request: result.request },
      });
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${buildDataExportDownloadFilename(result.request.id)}"`
    );

    logger.info({
      adminUserId: req.user?.id,
      requestId: result.request.id,
      exportedUserId: result.exportPackage.userId,
    }, 'Admin data privacy export generated');

    return res.json({
      status: 'success',
      data: {
        request: result.request,
        export: result.exportPackage,
      },
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin privacy request export failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to build privacy export',
    });
  }
});

router.patch('/privacy-requests/:requestId', async (req: Request, res: Response) => {
  try {
    const parsedParams = DataPrivacyRequestIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const parsedBody = UpdateDataPrivacyRequestBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid body',
        details: parsedBody.error.flatten(),
      });
    }

    const data = await updateAdminDataPrivacyRequest({
      requestId: parsedParams.data.requestId,
      status: parsedBody.data.status,
      adminNotes: parsedBody.data.adminNotes,
      actorUserId: req.user!.id,
    });

    if (!data) {
      return res.status(404).json({
        status: 'error',
        message: 'Privacy request not found',
      });
    }

    logger.info({
      adminUserId: req.user?.id,
      requestId: data.id,
      status: data.status,
    }, 'Admin privacy request updated');

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin privacy request update failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update privacy request',
    });
  }
});

router.patch('/users/:userId', async (req: Request, res: Response) => {
  try {
    const parsedParams = UserIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const parsedBody = UpdateAdminUserBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid body',
        details: parsedBody.error.flatten(),
      });
    }

    const updatedUser = await updateAdminUserSettings({
      userId: parsedParams.data.userId,
      actorUserId: req.user?.id,
      role: parsedBody.data.role,
      status: parsedBody.data.status,
      suspendedReason: parsedBody.data.suspendedReason,
      planSlug: parsedBody.data.planSlug,
      storiesUsedCurrentPeriod: parsedBody.data.storiesUsedCurrentPeriod,
      graphicNovelsUsedCurrentPeriod: parsedBody.data.graphicNovelsUsedCurrentPeriod,
      audioStoriesUsedCurrentPeriod: parsedBody.data.audioStoriesUsedCurrentPeriod,
    });

    if (!updatedUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    return res.json({
      status: 'success',
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status,
        suspendedReason: updatedUser.suspendedReason,
      },
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin user update failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update user',
    });
  }
});

router.get('/image-validations', async (req: Request, res: Response) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }

    const { limit, offset } = parsed.data;
    const data = await listAdminImageValidations({ limit, offset });

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin image validations list failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list image validations',
    });
  }
});

router.get('/image-validations/:id', async (req: Request, res: Response) => {
  try {
    const parsedParams = ValidationIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const data = await getAdminImageValidation(parsedParams.data.id);
    if (!data) {
      return res.status(404).json({
        status: 'error',
        message: 'Validation not found',
      });
    }

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin image validation detail failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get image validation',
    });
  }
});

router.post('/stories/:storyId/audio/reset', async (req: Request, res: Response) => {
  try {
    const parsedParams = StoryIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const parsedBody = AdminResetStoryAudioBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid body',
        details: parsedBody.error.flatten(),
      });
    }

    const story = await getStoryRepository().findById(parsedParams.data.storyId);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    const data = await adminResetStoryAudio(parsedParams.data.storyId, {
      regenerate: parsedBody.data.regenerate === true,
      voiceId: parsedBody.data.voiceId,
      speed: parsedBody.data.speed,
      nightMode: parsedBody.data.nightMode,
    });

    logger.info(
      {
        adminUserId: req.user?.id,
        storyId: parsedParams.data.storyId,
        regenerate: parsedBody.data.regenerate === true,
        jobId: data.jobId,
      },
      'Admin story audio reset',
    );

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin story audio reset failed');
    return res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to reset story audio',
    });
  }
});

router.get('/assets/:assetId/image', async (req: Request, res: Response) => {
  try {
    const parsedParams = AdminAssetImageParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const asset = await getAssetRepository().findById(parsedParams.data.assetId);
    if (!asset || asset.assetType !== 'image') {
      return res.status(404).json({
        status: 'error',
        message: 'Asset not found',
      });
    }

    const filePath = await resolveUploadFilePath(asset.storagePath);
    if (!filePath) {
      return res.status(404).json({
        status: 'error',
        message: 'Asset file not found',
      });
    }

    res.setHeader('Content-Type', asset.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(filePath);
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin asset image failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to load asset image',
    });
  }
});

router.get('/map-tile-masks/:maskId/image', async (req: Request, res: Response) => {
  try {
    const parsedParams = MapTileMaskImageParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const mask = MAP_TILE_MASK_VARIANTS.find((item) => item.id === parsedParams.data.maskId);
    if (!mask) {
      return res.status(404).json({
        status: 'error',
        message: 'Map tile mask not found',
      });
    }

    const filePath = await resolveMapTileMaskImagePath(mask.id);
    if (!filePath) {
      return res.status(404).json({
        status: 'error',
        message: 'Map tile mask image not found',
      });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(filePath);
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin map tile mask image failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to load map tile mask image',
    });
  }
});

router.get('/stories/:storyId/director-scenes', async (req: Request, res: Response) => {
  try {
    const parsedParams = StoryIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const data = await listAdminDirectorScenes(parsedParams.data.storyId);
    if (!data) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Admin director scenes list failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list director scenes',
    });
  }
});

router.post('/stories/:storyId/scenes/:sceneId/regenerate-image', async (req: Request, res: Response) => {
  try {
    const parsedParams = StorySceneParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const parsedBody = AdminRegenerateSceneImageBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid body',
        details: parsedBody.error.flatten(),
      });
    }

    const story = await getStoryRepository().findById(parsedParams.data.storyId);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    const scene = (story.scenes as Array<Record<string, unknown>> | null)?.find(
      (item) => Number(item?.sceneId) === parsedParams.data.sceneId,
    );

    if (!scene) {
      return res.status(404).json({
        status: 'error',
        message: 'Scene not found',
      });
    }

    const fallbackPrompt =
      typeof scene.visualPrompt === 'string' && scene.visualPrompt.trim() !== ''
        ? scene.visualPrompt
        : undefined;

    const jobId = await storyJobQueue.addJob({
      type: 'regenerate_scene_image',
      storyId: parsedParams.data.storyId,
      sceneId: parsedParams.data.sceneId,
      visualPrompt: parsedBody.data.visualPrompt ?? fallbackPrompt,
    });

    logger.info({
      adminUserId: req.user?.id,
      storyId: parsedParams.data.storyId,
      sceneId: parsedParams.data.sceneId,
      jobId,
    }, 'Admin scene image regeneration started');

    return res.json({
      status: 'success',
      data: {
        jobId,
        storyId: parsedParams.data.storyId,
        sceneId: parsedParams.data.sceneId,
      },
      message: 'Regeneration started',
    });
  } catch (error) {
    logger.error({
      err: error,
      adminUserId: req.user?.id,
      storyId: req.params.storyId,
      sceneId: req.params.sceneId,
    }, 'Admin scene image regeneration failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to start regeneration',
    });
  }
});

router.post('/stories/:storyId/graphic-novel-pages/:pageNumber/regenerate-image', async (req: Request, res: Response) => {
  try {
    const parsedParams = StoryGraphicNovelPageParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const parsedBody = AdminRegenerateGraphicNovelPageImageBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid body',
        details: parsedBody.error.flatten(),
      });
    }

    const story = await getStoryRepository().findById(parsedParams.data.storyId);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    const metadata = (story.metadata as Record<string, unknown> | null) || {};
    if (metadata.storyFormat !== 'graphic_novel') {
      return res.status(409).json({
        status: 'error',
        message: 'Story is not a graphic novel',
      });
    }

    const project = await getGraphicNovelRepository().findProjectByStoryId(parsedParams.data.storyId);
    if (!project) {
      return res.status(404).json({
        status: 'error',
        message: 'Graphic novel project not found',
      });
    }

    const page = await getGraphicNovelRepository().findPageByProjectAndNumber(
      project.id,
      parsedParams.data.pageNumber
    );
    if (!page) {
      return res.status(404).json({
        status: 'error',
        message: 'Graphic novel page not found',
      });
    }

    const jobId = await storyJobQueue.addJob({
      type: 'regenerate_graphic_novel_page_image',
      storyId: parsedParams.data.storyId,
      pageNumber: parsedParams.data.pageNumber,
      preferredTemplateId: parsedBody.data.preferredTemplateId,
      style: parsedBody.data.style,
    });

    logger.info({
      adminUserId: req.user?.id,
      storyId: parsedParams.data.storyId,
      pageNumber: parsedParams.data.pageNumber,
      preferredTemplateId: parsedBody.data.preferredTemplateId,
      jobId,
    }, 'Admin graphic novel page image regeneration started');

    return res.json({
      status: 'success',
      data: {
        jobId,
        storyId: parsedParams.data.storyId,
        pageNumber: parsedParams.data.pageNumber,
      },
      message: 'Graphic novel page regeneration started',
    });
  } catch (error) {
    logger.error({
      err: error,
      adminUserId: req.user?.id,
      storyId: req.params.storyId,
      pageNumber: req.params.pageNumber,
    }, 'Admin graphic novel page image regeneration failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to start graphic novel page regeneration',
    });
  }
});

router.get('/content-config/:resource', async (req: Request, res: Response) => {
  try {
    const parsed = AdminConfigResourceSchema.safeParse(req.params.resource);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid resource',
        details: parsed.error.flatten(),
      });
    }

    const data = await listAdminConfigItems(parsed.data);
    return res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, resource: req.params.resource }, 'Admin content config list failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to load content config',
    });
  }
});

router.post('/content-config/:resource', async (req: Request, res: Response) => {
  try {
    const parsedResource = AdminConfigResourceSchema.safeParse(req.params.resource);
    if (!parsedResource.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid resource',
        details: parsedResource.error.flatten(),
      });
    }

    const bodySchema = getAdminConfigCreateSchema(parsedResource.data);
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid body',
        details: parsedBody.error.flatten(),
      });
    }

    const created = await createAdminConfigItem(
      parsedResource.data,
      normalizeAdminConfigPayload(parsedResource.data, { ...parsedBody.data }),
    );
    return res.status(201).json({
      status: 'success',
      data: created,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, resource: req.params.resource }, 'Admin content config create failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create content config',
    });
  }
});

router.patch('/content-config/:resource/:id', async (req: Request, res: Response) => {
  try {
    const parsedParams = AdminConfigParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const bodySchema = getAdminConfigPatchSchema(parsedParams.data.resource);
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid body',
        details: parsedBody.error.flatten(),
      });
    }
    if (!hasOwnKeys(parsedBody.data)) {
      return res.status(400).json({
        status: 'error',
        message: 'At least one field is required',
      });
    }

    const updated = await updateAdminConfigItem(
      parsedParams.data.resource,
      parsedParams.data.id,
      normalizeAdminConfigPayload(parsedParams.data.resource, { ...parsedBody.data }),
    );

    if (!updated) {
      return res.status(404).json({
        status: 'error',
        message: 'Config item not found',
      });
    }

    return res.json({
      status: 'success',
      data: updated,
    });
  } catch (error) {
    logger.error(
      { err: error, userId: req.user?.id, resource: req.params.resource, id: req.params.id },
      'Admin content config update failed',
    );
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update content config',
    });
  }
});

router.delete('/content-config/:resource/:id', async (req: Request, res: Response) => {
  try {
    const parsedParams = AdminConfigParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid params',
        details: parsedParams.error.flatten(),
      });
    }

    const deleted = await deleteAdminConfigItem(
      parsedParams.data.resource,
      parsedParams.data.id,
    );

    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'Config item not found',
      });
    }

    return res.json({
      status: 'success',
      data: { deleted: true },
    });
  } catch (error) {
    logger.error(
      { err: error, userId: req.user?.id, resource: req.params.resource, id: req.params.id },
      'Admin content config delete failed',
    );
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete content config',
    });
  }
});

export default router;
