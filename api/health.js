/**
 * /api/health.js
 * Comprehensive diagnostic health check for Gemini and Spoonacular APIs,
 * plus a lightweight NutriBalance MCP connection and tool-discovery check.
 * Separately inspects authentication, model discovery, generation readiness,
 * and upstream HTTP status codes.
 * Compatible with Vercel serverless functions and Express/Node.
 */

import { GoogleGenAI } from '@google/genai';
import { fetchWithTimeout, sanitizeErrorMessage, getGeminiModel } from '../lib/api-client.js';
import { checkNutriBalanceHealth } from '../MCP/nutribalance.js';

export default async function handler(req, res) {
  // Ensure res has standard helper methods if running in pure Node http
  if (typeof res.status !== 'function') {
    res.status = function (code) {
      res.statusCode = code;
      return res;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = function (data) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
      return res;
    };
  }

  res.setHeader('Cache-Control', 'no-store');

  const configuredModel = getGeminiModel();

  const results = {
    status: 'unhealthy',
    timestamp: new Date().toISOString(),
    providers: {
      spoonacular: {
        status: 'not_configured',
        keyConfigured: Boolean((process.env.SPOONACULAR_API_KEY || '').trim()),
        upstreamHttpStatus: null,
        responseTimeMs: null,
        error: null,
      },
      gemini: {
        status: 'not_configured',
        keyConfigured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
        upstreamHttpStatus: null,
        responseTimeMs: null,
        authVerified: false,
        message: null,
        error: null,
        model: configuredModel,
      },
      nutribalance: null,
    },
  };

  // 1. Check Spoonacular API
  const spoonacularKey = process.env.SPOONACULAR_API_KEY;
  if (!spoonacularKey) {
    results.providers.spoonacular.status = 'not_configured';
  } else {
    const spoonStart = Date.now();
    try {
      const spoonUrl = `https://api.spoonacular.com/recipes/complexSearch?number=1&apiKey=${encodeURIComponent(spoonacularKey)}`;
      const spoonRes = await fetchWithTimeout(spoonUrl, {}, 6000);
      results.providers.spoonacular.responseTimeMs = Date.now() - spoonStart;
      results.providers.spoonacular.upstreamHttpStatus = spoonRes.status;

      if (spoonRes.ok) {
        results.providers.spoonacular.status = 'ok';
      } else {
        results.providers.spoonacular.status = 'error';
        if (spoonRes.status === 401 || spoonRes.status === 403) {
          results.providers.spoonacular.error = 'Invalid Spoonacular API key or unauthorized (401/403)';
        } else if (spoonRes.status === 402) {
          results.providers.spoonacular.error = 'Spoonacular daily API request quota exceeded (402)';
        } else if (spoonRes.status === 429) {
          results.providers.spoonacular.error = 'Spoonacular rate limit exceeded (429)';
        } else {
          results.providers.spoonacular.error = `HTTP ${spoonRes.status}: ${spoonRes.statusText}`;
        }
      }
    } catch (err) {
      results.providers.spoonacular.responseTimeMs = Date.now() - spoonStart;
      results.providers.spoonacular.status = 'error';
      results.providers.spoonacular.error = sanitizeErrorMessage(err);
    }
  }

  // 2. Check Gemini API via lightweight authenticated model-list request
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    results.providers.gemini.status = 'not_configured';
  } else {
    const geminiStart = Date.now();
    let timer = null;

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Lightweight authenticated model list with guaranteed timeout race
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error('Gemini API health check timed out after 8000ms');
          timeoutErr.status = 504;
          reject(timeoutErr);
        }, 8000);
      });

      const listPromise = (async () => {
        const modelList = await ai.models.list({ pageSize: 1 });
        for await (const _ of modelList) {
          return true;
        }
        return true;
      })();

      await Promise.race([listPromise, timeoutPromise]);

      results.providers.gemini.status = 'ok';
      results.providers.gemini.authVerified = true;
      results.providers.gemini.upstreamHttpStatus = 200;
      results.providers.gemini.message = 'Authentication & connectivity verified';
      results.providers.gemini.error = null;
    } catch (err) {
      const errStatus = err.status || err.code || 500;
      results.providers.gemini.upstreamHttpStatus = errStatus;
      results.providers.gemini.status = 'error';
      results.providers.gemini.authVerified = false;

      if (errStatus === 400 || errStatus === 401 || errStatus === 403) {
        results.providers.gemini.error = 'Invalid credentials: GEMINI_API_KEY was rejected by Google API (401/403)';
      } else if (errStatus === 429) {
        results.providers.gemini.error = 'Quota limit reached: Rate limit or daily quota exceeded (429).';
      } else if (errStatus === 504) {
        results.providers.gemini.error = 'Connection timed out while reaching Gemini API (504).';
      } else {
        results.providers.gemini.error = `Authentication check failed (${errStatus}): ${sanitizeErrorMessage(err)}`;
      }
    } finally {
      // Ensure timeout timer cleanup ALWAYS happens in finally
      if (timer) {
        clearTimeout(timer);
      }
      results.providers.gemini.responseTimeMs = Date.now() - geminiStart;
    }
  }

  // 3. Check NutriBalance MCP (initialize + tool discovery only; the nutrition tool is never run here)
  results.providers.nutribalance = await checkNutriBalanceHealth();

  // 4. Determine Overall System Status
  // NutriBalance is optional (manual calorie entry still works), so it does not change the overall status.
  const isSpoonOk = results.providers.spoonacular.status === 'ok';
  const isGeminiOk = results.providers.gemini.status === 'ok';

  if (isSpoonOk && isGeminiOk) {
    results.status = 'healthy';
    return res.status(200).json(results);
  } else {
    results.status = 'unhealthy';
    return res.status(503).json(results);
  }
}
