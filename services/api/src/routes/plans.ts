import { Router } from 'express';
import * as planService from '../services/planService';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/v1/plans - List all active plans (public)
router.get('/', async (req, res) => {
  try {
    const plans = await planService.getActivePlans();
    
    res.json({
      status: 'success',
      plans
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching plans');
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch plans'
    });
  }
});

export default router;
