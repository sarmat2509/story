import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../middleware/authMiddleware';
import { storyJobQueue } from '../jobs/storyJobProcessor';
import { getStoryRepository } from '../repositories';
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
  category: z.enum(['bug', 'feature', 'other']).optional(),
  hasScreenshot: z.coerce.boolean().optional(),
});

const DashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(3650).default(30),
});

const StoryIdParamsSchema = z.object({
  storyId: z.string().uuid(),
});

const UserIdParamsSchema = z.object({
  userId: z.string().uuid(),
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

const AdminRegenerateSceneImageBodySchema = z.object({
  visualPrompt: z.string().trim().min(1).optional(),
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
  planSlug: z.string().trim().min(1).optional(),
  storiesUsedCurrentPeriod: z.coerce.number().int().min(0).optional(),
  audioStoriesUsedCurrentPeriod: z.coerce.number().int().min(0).optional(),
}).refine(
  (value) =>
    value.role !== undefined ||
    value.planSlug !== undefined ||
    value.storiesUsedCurrentPeriod !== undefined ||
    value.audioStoriesUsedCurrentPeriod !== undefined,
  {
    message: 'At least one field is required',
  }
);

const UpdateAdminStoryBodySchema = z.object({
  showOnHomePage: z.boolean(),
}).strict();

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

    const { limit, offset, search, category, hasScreenshot } = parsed.data;
    const data = await listAdminFeedback({ limit, offset, search, category, hasScreenshot });

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
      planSlug: parsedBody.data.planSlug,
      storiesUsedCurrentPeriod: parsedBody.data.storiesUsedCurrentPeriod,
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
