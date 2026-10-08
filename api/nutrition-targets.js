/**
 * /api/nutrition-targets.js
 * POST { profile } -> suggested adult daily calorie target from the one mapped
 * NutriBalance MCP tool. All MCP transport lives in ../MCP.
 * Compatible with Vercel serverless functions and Express/Node.
 */

import { validateProfile, calculateNutritionTarget } from '../MCP/nutribalance.js';
import { McpError } from '../MCP/client.js';

export default async function handler(req, res) {
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

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'Method not allowed. Use POST.',
      code: 'METHOD_NOT_ALLOWED',
      provider: 'nutribalance',
    });
  }

  // Read request body (Express/Vercel pre-parse it; raw Node does not)
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = null;
    }
  } else if (body === undefined && typeof req.on === 'function') {
    try {
      const raw = await readRequestBody(req);
      body = raw ? JSON.parse(raw) : null;
    } catch (e) {
      body = null;
    }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      error: 'Request body must be JSON of the form { "profile": { ... } }.',
      code: 'INVALID_REQUEST',
      provider: 'nutribalance',
    });
  }

  const { profile, errors } = validateProfile(body.profile);
  if (errors) {
    return res.status(400).json({
      error: 'Profile is invalid.',
      code: 'INVALID_PROFILE',
      provider: 'nutribalance',
      details: errors,
    });
  }

  try {
    const target = await calculateNutritionTarget(profile);
    return res.status(200).json(target);
  } catch (err) {
    if (err instanceof McpError) {
      return res.status(err.httpStatus).json({
        error: err.message,
        code: err.code,
        provider: 'nutribalance',
        stage: err.stage,
        upstreamHttpStatus: err.upstreamHttpStatus,
      });
    }
    console.error('Nutrition target error:', err && err.name);
    return res.status(500).json({
      error: 'Unexpected error while calculating the nutrition target.',
      code: 'INTERNAL_ERROR',
      provider: 'nutribalance',
    });
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}
