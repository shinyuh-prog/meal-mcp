/**
 * server.ts
 * Express preview server (AI Studio / local). Registers the same API handlers
 * that Vercel serves from api/*.js, then hands everything else to Vite.
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import healthHandler from './api/health.js';
import mealPlanHandler from './api/meal-plan.js';
import recipesHandler from './api/recipes.js';
import nutritionTargetsHandler from './api/nutrition-targets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function start() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  // API routes — registered before the Vite fallback so they never return HTML.
  // Handlers answer unsupported methods themselves where they define a 405.
  app.get('/api/health', healthHandler);
  app.all('/api/meal-plan', mealPlanHandler);
  app.get('/api/recipes', recipesHandler);
  app.post('/api/nutrition-targets', nutritionTargetsHandler);
  app.all('/api/nutrition-targets', nutritionTargetsHandler);

  app.use('/api', (req: express.Request, res: express.Response) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' });
  });

  // Malformed JSON bodies and other API errors stay JSON
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.path.startsWith('/api')) return next(err);
    const status = err?.type === 'entity.parse.failed' ? 400 : err?.status || 500;
    res.status(status).json({
      error: status === 400 ? 'Request body is not valid JSON.' : 'Internal API error',
      code: status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
    });
  });

  if (isProduction) {
    const dist = path.resolve(__dirname, 'dist');
    app.use(express.static(dist));
    app.get('*', (_req: express.Request, res: express.Response) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Heirloom Table preview running on http://localhost:${PORT}`);
  });
}

start();
