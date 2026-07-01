import { Router } from 'express';
import { getOpsRuntimeStatus } from '../services/opsRuntimeService';
import { logger } from '../utils/logger';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    const ops = await getOpsRuntimeStatus();
    res.json({
      status: 'success',
      ops,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to load ops runtime status');
    res.status(503).json({
      status: 'error',
      code: 'OPS_STATUS_UNAVAILABLE',
      message: 'Service status is temporarily unavailable.',
    });
  }
});

export default router;
