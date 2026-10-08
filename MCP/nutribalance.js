/**
 * MCP/nutribalance.js
 * NutriBalance adapter: the one mapped tool, profile validation, live tool
 * discovery, the tool call, and result normalisation.
 *
 * Tool name and input fields below come from the server's public Smithery
 * registry listing (registry.smithery.ai/servers/NutriBalance/nutribalance-mcp).
 * They are re-checked against live `tools/list` on every call, so a renamed
 * tool or changed schema fails loudly instead of sending guessed arguments.
 *
 * The RESULT format of calculate_tdee is not published and has not been
 * observed live yet. mapToolResult() accepts structured or text output and
 * returns an upstream-result error when no calorie figure can be read.
 */

import { McpSession, McpError, requireMcpConfig, readMcpConfig, MCP_DEFAULT_TIMEOUT_MS } from './client.js';

/** The only tool this app is allowed to invoke. */
export const MAPPED_TOOL = 'calculate_tdee';

const HEALTH_TIMEOUT_MS = 6000;

// Adults only in this MVP: the tool accepts 16+, the app requires 18+.
export const PROFILE_FIELDS = {
  age: { type: 'integer', min: 18, max: 100 },
  gender: { type: 'enum', values: ['male', 'female'] },
  height_cm: { type: 'number', min: 100, max: 250 },
  weight_kg: { type: 'number', min: 30, max: 300 },
  activity_level: { type: 'enum', values: ['sedentary', 'light', 'moderate', 'active', 'very_active'] },
  goal: { type: 'enum', values: ['lose', 'maintain', 'gain'] },
};

/**
 * Validate the exact profile fields. Returns { profile } or { errors }.
 * No coercion: numbers must arrive as JSON numbers.
 */
export function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['profile must be an object'] };
  }

  const errors = [];
  const profile = {};

  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(PROFILE_FIELDS, key)) {
      errors.push(`${key} is not an accepted profile field`);
    }
  }

  for (const [key, rule] of Object.entries(PROFILE_FIELDS)) {
    const value = input[key];
    if (value === undefined || value === null || value === '') {
      errors.push(`${key} is required`);
      continue;
    }
    if (rule.type === 'enum') {
      if (typeof value !== 'string' || !rule.values.includes(value)) {
        errors.push(`${key} must be one of: ${rule.values.join(', ')}`);
        continue;
      }
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${key} must be a number`);
        continue;
      }
      if (rule.type === 'integer' && !Number.isInteger(value)) {
        errors.push(`${key} must be a whole number`);
        continue;
      }
      if (value < rule.min || value > rule.max) {
        errors.push(`${key} must be between ${rule.min} and ${rule.max}`);
        continue;
      }
    }
    profile[key] = value;
  }

  return errors.length ? { errors } : { profile };
}

/**
 * Find the mapped tool in a live tools/list result. A Smithery namespace
 * endpoint prefixes tool names with the connection id ("<connection>.<tool>"),
 * so an exact match or a single ".calculate_tdee" suffix match is accepted.
 */
export function findMappedTool(tools) {
  const named = tools.filter((t) => t && typeof t.name === 'string');
  const exact = named.find((t) => t.name === MAPPED_TOOL);
  if (exact) return exact;
  const suffixed = named.filter((t) => t.name.endsWith(`.${MAPPED_TOOL}`));
  return suffixed.length === 1 ? suffixed[0] : null;
}

function schemaAcceptsProfile(tool) {
  const properties = tool.inputSchema && tool.inputSchema.properties;
  if (!properties || typeof properties !== 'object') return false;
  return Object.keys(PROFILE_FIELDS).every((key) => Object.prototype.hasOwnProperty.call(properties, key));
}

function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Goal-adjusted target keys are preferred over plain TDEE keys.
const TARGET_CALORIE_KEYS = ['target_calories', 'targetcalories', 'daily_calories', 'dailycalories', 'calorie_target', 'goal_calories', 'calories'];
const TDEE_KEYS = ['tdee'];
const MACRO_KEYS = {
  proteinGrams: ['protein_g', 'protein_grams', 'proteingrams', 'protein'],
  carbsGrams: ['carbs_g', 'carbs_grams', 'carbsgrams', 'carbs', 'carbohydrates_g', 'carbohydrates'],
  fatGrams: ['fat_g', 'fat_grams', 'fatgrams', 'fat'],
};

/** Look up the first matching key at the top level, then one level down. */
function pickNumber(obj, keys) {
  const scan = (source) => {
    for (const [key, value] of Object.entries(source)) {
      if (keys.includes(key.toLowerCase())) {
        const n = toFiniteNumber(value && typeof value === 'object' ? value.grams ?? value.value ?? value.g : value);
        if (n !== null) return n;
      }
    }
    return null;
  };

  const direct = scan(obj);
  if (direct !== null) return direct;
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = scan(value);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function pickFromText(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const n = toFiniteNumber(match[1]);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Normalise a tools/call result into the app response. Throws an
 * upstream-result error rather than returning a missing or invalid figure.
 */
export function mapToolResult(result, toolName) {
  const badResult = (message) =>
    new McpError('UPSTREAM_RESULT', message, { httpStatus: 502, stage: 'tool' });

  if (result.isError) {
    throw new McpError('UPSTREAM_TOOL_ERROR', 'NutriBalance reported a tool error for this profile.', {
      httpStatus: 502,
      stage: 'tool',
    });
  }

  const text = Array.isArray(result.content)
    ? result.content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
    : '';

  let data = null;
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    data = result.structuredContent;
  } else if (text.trim().startsWith('{')) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
  }

  let dailyCalories = null;
  let calorieBasis = null;
  const macros = { proteinGrams: null, carbsGrams: null, fatGrams: null };

  if (data && !Array.isArray(data)) {
    dailyCalories = pickNumber(data, TARGET_CALORIE_KEYS);
    calorieBasis = dailyCalories !== null ? 'target' : null;
    if (dailyCalories === null) {
      dailyCalories = pickNumber(data, TDEE_KEYS);
      calorieBasis = dailyCalories !== null ? 'tdee' : null;
    }
    for (const [field, keys] of Object.entries(MACRO_KEYS)) {
      macros[field] = pickNumber(data, keys);
    }
  } else if (text) {
    dailyCalories = pickFromText(text, [
      /(?:target|daily|goal|recommended)[^\n\d]{0,40}calories?[^\n\d]{0,20}([\d,]+(?:\.\d+)?)/i,
      /calories?[^\n\d]{0,10}(?:target|goal)[^\n\d]{0,20}([\d,]+(?:\.\d+)?)/i,
    ]);
    calorieBasis = dailyCalories !== null ? 'target' : null;
    if (dailyCalories === null) {
      dailyCalories = pickFromText(text, [/tdee[^\n\d]{0,40}([\d,]+(?:\.\d+)?)/i]);
      calorieBasis = dailyCalories !== null ? 'tdee' : null;
    }
    macros.proteinGrams = pickFromText(text, [/protein[^\n\d]{0,20}([\d,]+(?:\.\d+)?)\s*g/i]);
    macros.carbsGrams = pickFromText(text, [/carb(?:s|ohydrates)?[^\n\d]{0,20}([\d,]+(?:\.\d+)?)\s*g/i]);
    macros.fatGrams = pickFromText(text, [/fats?[^\n\d]{0,20}([\d,]+(?:\.\d+)?)\s*g/i]);
  } else {
    throw badResult('NutriBalance returned an empty tool result.');
  }

  if (dailyCalories === null || dailyCalories < 800 || dailyCalories > 6000) {
    throw badResult('NutriBalance did not return a usable daily calorie figure.');
  }

  for (const field of Object.keys(macros)) {
    const value = macros[field];
    macros[field] = value !== null && value >= 0 && value <= 1000 ? Math.round(value) : null;
  }

  return {
    source: 'nutribalance-mcp',
    tool: toolName,
    dailyCalories: Math.round(dailyCalories),
    calorieBasis,
    macros,
  };
}

/**
 * Full exchange for one adult profile: config check (no upstream call when
 * missing) -> initialize -> discover -> call the mapped tool -> normalise.
 * `profile` must already have passed validateProfile().
 */
export async function calculateNutritionTarget(profile, { timeoutMs = MCP_DEFAULT_TIMEOUT_MS } = {}) {
  const config = requireMcpConfig();
  const session = new McpSession({ url: config.url, apiKey: config.apiKey, timeoutMs });

  await session.initialize();
  const tools = await session.listTools();
  const tool = findMappedTool(tools);

  if (!tool) {
    throw new McpError('TOOL_NOT_FOUND', `NutriBalance tool "${MAPPED_TOOL}" was not offered by the configured endpoint.`, {
      httpStatus: 502,
      stage: 'discovery',
    });
  }
  if (!schemaAcceptsProfile(tool)) {
    throw new McpError('TOOL_SCHEMA_MISMATCH', `NutriBalance tool "${MAPPED_TOOL}" no longer accepts the mapped profile fields.`, {
      httpStatus: 502,
      stage: 'discovery',
    });
  }

  const result = await session.callTool(tool.name, profile);
  return mapToolResult(result, tool.name);
}

/**
 * Lightweight health probe: initialize + tools/list only. It never runs the
 * nutrition tool, so operationVerified is always false here.
 */
export async function checkNutriBalanceHealth() {
  const config = readMcpConfig();
  const health = {
    status: 'not_configured',
    endpointConfigured: config.endpointConfigured,
    keyConfigured: config.keyConfigured,
    upstreamHttpStatus: null,
    responseTimeMs: null,
    connectivityVerified: false,
    authVerified: false,
    discoveryVerified: false,
    mappedTool: MAPPED_TOOL,
    mappedToolAvailable: false,
    operationVerified: false,
    message: null,
    error: null,
  };

  let checked;
  try {
    checked = requireMcpConfig();
  } catch (err) {
    health.status = err.code === 'CONFIG_INVALID' ? 'error' : 'not_configured';
    health.error = err.message;
    return health;
  }

  const started = Date.now();
  const session = new McpSession({ url: checked.url, apiKey: checked.apiKey, timeoutMs: HEALTH_TIMEOUT_MS });

  try {
    await session.initialize();
    health.connectivityVerified = true;
    health.authVerified = true;

    const tools = await session.listTools();
    health.discoveryVerified = true;

    const tool = findMappedTool(tools);
    health.mappedToolAvailable = Boolean(tool) && schemaAcceptsProfile(tool);

    if (health.mappedToolAvailable) {
      health.status = 'ok';
      health.message = 'Connected and tool discovered. Tool execution is not run by the health check.';
    } else {
      health.status = 'error';
      health.error = `Connected, but tool "${MAPPED_TOOL}" was not offered with the expected inputs.`;
    }
  } catch (err) {
    health.status = 'error';
    health.error = err instanceof McpError ? err.message : 'NutriBalance MCP check failed unexpectedly.';
    // Any HTTP response at all proves the endpoint was reached.
    if (session.lastHttpStatus !== null) health.connectivityVerified = true;
  } finally {
    health.upstreamHttpStatus = session.lastHttpStatus;
    health.responseTimeMs = Date.now() - started;
  }

  return health;
}
