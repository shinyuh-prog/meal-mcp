import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dotenv from 'dotenv';
import { defineConfig, Plugin } from 'vite';

dotenv.config();

function apiServerPlugin(): Plugin {
  return {
    name: 'api-server-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
          const pathname = url.pathname;

          try {
            let handlerModule: any;
            if (pathname === '/api/health' || pathname === '/api/health.js') {
              handlerModule = await import('./api/health.js');
            } else if (pathname === '/api/recipes' || pathname === '/api/recipes.js') {
              handlerModule = await import('./api/recipes.js');
            } else if (pathname === '/api/meal-plan' || pathname === '/api/meal-plan.js') {
              handlerModule = await import('./api/meal-plan.js');
            } else if (pathname === '/api/nutrition-targets' || pathname === '/api/nutrition-targets.js') {
              handlerModule = await import('./api/nutrition-targets.js');
            }

            if (handlerModule && handlerModule.default) {
              return await handlerModule.default(req, res);
            }
          } catch (err: any) {
            console.error('API Middleware Error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Internal API Error' }));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiServerPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
