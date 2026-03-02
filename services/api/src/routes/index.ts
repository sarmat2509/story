import { Router, Request, Response } from 'express';
import config from '../config';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'WonderTales API',
    version: 'v1',
    description: 'Personalized illustrated fairy tales with pedagogy and premium voice',
    documentation: '/api/v1/docs',
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      user: '/api/v1/me',
    },
  });
});

export default router;
