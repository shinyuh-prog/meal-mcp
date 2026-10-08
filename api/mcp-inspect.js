/**
 * /api/mcp-inspect.js
 * TEMPORARY diagnostic route — removed once the nutrition lookup is mapped.
 * Runs one fixed read-only NutriBalance food lookup and returns the raw result.
 */

import { McpSession, McpError, requireMcpConfig } from '../MCP/client.js';

const FOODS = ['chicken thigh', 'jasmine rice', 'ground pork', 'bean sprouts', 'zzzz-not-a-food'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  const send = (code, data) => {
    res.statusCode = code;
    res.end(JSON.stringify(data));
  };
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(405, { error: 'Use GET.' });
  }
  const index = Number(new URL(req.url, 'http://localhost').searchParams.get('food') || 0);
  const food = FOODS[index] || FOODS[0];
  try {
    const config = requireMcpConfig();
    const session = new McpSession({ url: config.url, apiKey: config.apiKey, timeoutMs: 25000 });
    await session.initialize();
    const tools = await session.listTools();
    const matches = tools.filter((t) => t.name.endsWith('.lookup_nutrition'));
    if (matches.length !== 1) return send(502, { error: `lookup_nutrition matched ${matches.length} tools.` });
    const started = Date.now();
    const result = await session.callTool(matches[0].name, { food_name: food, amount_grams: 250 });
    return send(200, { tool: matches[0].name, food, callMs: Date.now() - started, result });
  } catch (err) {
    if (err instanceof McpError) return send(err.httpStatus, { error: err.message, code: err.code, stage: err.stage });
    return send(500, { error: 'Unexpected error.' });
  }
}
