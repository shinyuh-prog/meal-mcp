/**
 * /api/mcp-inspect.js
 * TEMPORARY diagnostic route — remove once the Savor Dish mapping is verified.
 * Runs one of a fixed list of read-only MCP lookups and returns the raw tool
 * result so the response format can be mapped from real output.
 */

import { McpSession, McpError, requireMcpConfig } from '../MCP/client.js';

const STEPS = {
  tools: null,
  status: { tool: 'get_toolbox_status', args: () => ({}) },
  cuisines: { tool: 'cuisines_explore', args: () => ({ minRecipes: 1 }) },
  list: { tool: 'recipes_list_by_cuisine', args: (q) => ({ cuisine: q.cuisine, limit: 3 }) },
  search: { tool: 'recipes_search', args: (q) => ({ query: q.query, mealType: 'dinner', limit: 3 }) },
  quick: { tool: 'recipes_get_quick', args: () => ({ maxMinutes: 45, mealType: 'dinner', limit: 3 }) },
  get: { tool: 'recipes_get', args: (q) => ({ slugOrId: q.slug }) },
  nutrition: { tool: 'recipes_get_nutrition', args: (q) => ({ recipeSlug: q.slug }) },
  mealplan: {
    tool: 'generate_meal_plan',
    args: (q) => ({ goal: 'maintain', target_calories: 2000, dietary_preference: q.diet }),
  },
  tdee: {
    tool: 'calculate_tdee',
    args: (q) => ({ age: 34, gender: 'female', height_cm: 165, weight_kg: 60, activity_level: 'moderate', goal: q.goal }),
  },
};

const SAFE = /^[A-Za-z0-9 _-]{1,80}$/;

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

  const params = new URL(req.url, 'http://localhost').searchParams;
  const step = params.get('step') || 'tools';
  if (!Object.prototype.hasOwnProperty.call(STEPS, step)) {
    return send(400, { error: `step must be one of: ${Object.keys(STEPS).join(', ')}` });
  }

  const q = {
    cuisine: params.get('cuisine') || 'Chinese',
    query: params.get('query') || 'chicken',
    slug: params.get('slug') || '',
    diet: ['standard', 'vegetarian', 'vegan', 'keto', 'high_protein'].includes(params.get('diet')) ? params.get('diet') : 'standard',
    goal: ['lose', 'maintain', 'gain'].includes(params.get('goal')) ? params.get('goal') : 'gain',
  };
  if (![q.cuisine, q.query].every((v) => SAFE.test(v)) || (q.slug && !SAFE.test(q.slug))) {
    return send(400, { error: 'Invalid parameter.' });
  }

  try {
    const config = requireMcpConfig();
    const session = new McpSession({ url: config.url, apiKey: config.apiKey, timeoutMs: 25000 });
    await session.initialize();
    const tools = await session.listTools();

    if (step === 'tools') {
      return send(200, {
        tools: tools.map((t) => ({ name: t.name, hasOutputSchema: Boolean(t.outputSchema) })),
        builtIn: tools.filter((t) => !t.name.includes('.')).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });
    }

    const spec = STEPS[step];
    const matches = tools.filter((t) => t.name === spec.tool || t.name.endsWith(`.${spec.tool}`));
    if (matches.length !== 1) {
      return send(502, { error: `Tool ${spec.tool} matched ${matches.length} tools.` });
    }

    const result = await session.callTool(matches[0].name, spec.args(q));

    // Toolbox status carries credential-bearing setup URLs: return server names and states only.
    if (step === 'status') {
      let servers = null;
      try {
        const parsed = JSON.parse(result.content[0].text);
        servers = parsed.map((entry) => ({ server: entry.server, name: entry.name, state: entry.state }));
      } catch (e) {
        servers = null;
      }
      return send(200, { servers, parsed: servers !== null });
    }
    return send(200, { tool: matches[0].name, outputSchema: matches[0].outputSchema || null, result });
  } catch (err) {
    if (err instanceof McpError) {
      return send(err.httpStatus, { error: err.message, code: err.code, stage: err.stage, detail: err.detail });
    }
    return send(500, { error: 'Unexpected error.' });
  }
}
