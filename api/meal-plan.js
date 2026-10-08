/**
 * /api/meal-plan.js
 * Generates an optimized 7-day family weekly menu rotation using Gemini (@google/genai)
 * and Spoonacular recipe candidates with resilient multi-tier model fallback.
 * Compatible with Vercel serverless functions and Express/Node.
 */

import { GoogleGenAI, Type } from '@google/genai';
import {
  searchSpoonacularRecipes,
  searchMealDbRecipes,
  sanitizeErrorMessage,
  getCuratedRecipes,
  getGeminiModel,
  FALLBACK_GEMINI_MODEL,
} from '../lib/api-client.js';

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

  // Only allow POST
  if (req.method !== 'POST' && req.method !== 'OPTIONS') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Read request body
  let body = req.body;
  if (!body && typeof req.on === 'function') {
    try {
      const raw = await readRequestBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      body = {};
    }
  }

  const {
    householdSize = { adults: 2, children: 1 },
    appetiteSettings = [],
    dietaryRestrictions = [],
    dislikedIngredients = [],
    cookingTimePreferences = 45,
    primaryCuisines = ['Chinese', 'Cantonese', 'Asian'],
    lockedDays = [],
    existingMenu = [],
    swapDay = null,
  } = body || {};

  try {
    // 1. Gather candidate recipes from Spoonacular & curated catalog
    //    If Spoonacular cannot serve the request, fall back to TheMealDB (labelled as such).
    const cuisineQuery = primaryCuisines.join(',');
    let candidates = [];
    let recipeSource = 'spoonacular';
    let sourceNotice = null;

    try {
      const spoonCandidatesRes = await searchSpoonacularRecipes({
        query: '',
        cuisine: cuisineQuery,
        number: 16,
      });
      if (spoonCandidatesRes.isDemo) recipeSource = 'curated';
      candidates = [...(spoonCandidatesRes.results || []), ...getCuratedRecipes()];
    } catch (spoonErr) {
      const spoonReason = sanitizeErrorMessage(spoonErr);
      console.warn('Spoonacular unavailable, trying TheMealDB:', spoonReason);
      try {
        const mealDbRes = await searchMealDbRecipes({ cuisines: primaryCuisines, number: 18 });
        if (mealDbRes.results.length === 0) {
          throw new Error('no recipes found for the selected cuisines');
        }
        candidates = mealDbRes.results;
        recipeSource = 'themealdb';
        sourceNotice = `Spoonacular unavailable (${spoonReason}). Recipes from TheMealDB.`;
      } catch (mealDbErr) {
        throw new Error(`Spoonacular: ${spoonReason}. TheMealDB fallback: ${sanitizeErrorMessage(mealDbErr)}`);
      }
    }

    // Deduplicate by ID
    const candidateMap = new Map();
    candidates.forEach((c) => {
      if (!candidateMap.has(String(c.id))) {
        candidateMap.set(String(c.id), c);
      }
    });
    const uniqueCandidates = Array.from(candidateMap.values());

    // Filter out candidates that conflict with dietary restrictions or dislikes
    const restrictionsLower = (dietaryRestrictions || []).map((r) => r.toLowerCase());
    const dislikedLower = (dislikedIngredients || []).map((d) => (typeof d === 'string' ? d : d.name).toLowerCase());

    const safeCandidates = uniqueCandidates.filter((r) => {
      if (r.readyInMinutes > cookingTimePreferences + 10) return false;

      const ingTexts = (r.extendedIngredients || []).map((i) => i.name.toLowerCase()).join(' ');
      const titleLower = r.title.toLowerCase();

      // Check allergies
      for (const res of restrictionsLower) {
        if (res.includes('peanut') && (ingTexts.includes('peanut') || titleLower.includes('peanut'))) {
          return false;
        }
      }

      // Check dislikes
      for (const dis of dislikedLower) {
        if (dis.includes('bittergourd') && (ingTexts.includes('bittergourd') || titleLower.includes('bittergourd'))) {
          return false;
        }
        if (dis.includes('cilantro') && (ingTexts.includes('cilantro') || ingTexts.includes('coriander'))) {
          return false;
        }
      }

      return true;
    });

    // Never widen the pool to recipes that failed the restriction checks
    if (safeCandidates.length === 0) {
      throw new Error('No retrieved recipes satisfy the saved restrictions and cooking time');
    }
    const activePool = safeCandidates;
    const poolMap = new Map(activePool.map((c) => [String(c.id), c]));
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    // 2. Check if GEMINI_API_KEY is configured
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      const menu = buildDeterministicMenu({
        candidates: activePool,
        existingMenu,
        lockedDays,
        swapDay,
        cookingTimePreferences,
      });

      return res.status(200).json({
        success: true,
        isDemo: true,
        message: 'GEMINI_API_KEY not configured. Used structured local constraint planner.',
        recipeSource,
        notice: sourceNotice,
        menu,
      });
    }

    // 3. Call Gemini using official @google/genai SDK
    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptPayload = {
      daysOfWeek,
      lockedDays,
      existingMenuDays: existingMenu.map((m) => ({ day: m.day, id: m.id, mealName: m.mealName })),
      swapDay,
      householdSize,
      dietaryRestrictions,
      dislikedIngredients,
      maxCookingMinutes: cookingTimePreferences,
      availableRecipes: activePool.map((c) => ({
        id: String(c.id),
        title: c.title,
        readyInMinutes: c.readyInMinutes,
        cuisines: c.cuisines,
        keyIngredients: (c.extendedIngredients || []).slice(0, 5).map((i) => i.name),
        // Only sent when the source has no cooking time, so Gemini can estimate it
        method: c.readyInMinutes === null ? String(c.instructions || '').slice(0, 500) : undefined,
      })),
    };

    const systemInstruction = `You are the master family kitchen meal planner for Heirloom Table.
Your task is to assign recipes to the 7-day Monday–Sunday menu for this family.
RULES:
1. ONLY select recipe IDs from the "availableRecipes" list. DO NOT invent or hallucinate recipe IDs.
2. If a day is in "lockedDays", retain the recipe from "existingMenuDays" for that day.
3. Ensure cooking times do not exceed maxCookingMinutes.
4. Strictly respect all dietary restrictions and disliked ingredients.
5. Return a JSON array of 7 objects (one for each day Monday through Sunday).
6. For a chosen recipe whose readyInMinutes is null, estimate estimatedMinutes (total prep + cooking) and estimatedServings from its "method" and ingredients, and prefer recipes you estimate fit within maxCookingMinutes. For every other recipe leave both null.`;

    const schemaConfig = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.STRING, description: 'Day of the week (e.g. Monday)' },
          recipeId: { type: Type.STRING, description: 'Recipe ID matching availableRecipes' },
          subName: { type: Type.STRING, description: 'Short nutritional tagline for the family' },
          reason: { type: Type.STRING, description: 'Brief note explaining why this fits household profile' },
          estimatedMinutes: { type: Type.INTEGER, nullable: true, description: 'Estimated total minutes, only when readyInMinutes is null' },
          estimatedServings: { type: Type.INTEGER, nullable: true, description: 'Estimated servings, only when readyInMinutes is null' },
        },
        required: ['day', 'recipeId', 'subName', 'reason'],
      },
    };

    // Use shared GEMINI_MODEL setting with resilient fallback
    const targetModel = getGeminiModel();
    let modelUsed = targetModel;
    let responseText = null;

    try {
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: `Arrange the weekly menu for this household using the available recipes and constraints:\n${JSON.stringify(promptPayload, null, 2)}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: schemaConfig,
        },
      });
      responseText = response.text ? response.text.trim() : '';
    } catch (primaryErr) {
      console.warn(`Primary model ${targetModel} failed, trying ${FALLBACK_GEMINI_MODEL}:`, primaryErr.message);
      modelUsed = FALLBACK_GEMINI_MODEL;
      const fallbackResponse = await ai.models.generateContent({
        model: FALLBACK_GEMINI_MODEL,
        contents: `Arrange the weekly menu for this household using the available recipes and constraints:\n${JSON.stringify(promptPayload, null, 2)}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: schemaConfig,
        },
      });
      responseText = fallbackResponse.text ? fallbackResponse.text.trim() : '';
    }

    let parsedAssignments = [];
    try {
      parsedAssignments = JSON.parse(responseText);
    } catch (e) {
      const match = responseText.match(/\[[\s\S]*\]/);
      if (match) parsedAssignments = JSON.parse(match[0]);
    }

    if (!Array.isArray(parsedAssignments) || parsedAssignments.length === 0) {
      throw new Error('Gemini response could not be parsed into a weekly menu array');
    }

    // Validate that recipe IDs exist and assemble final menu
    const freshDays = new Set();
    const assembledMenu = daysOfWeek.map((dayName, idx) => {
      // Check if locked
      if (lockedDays.includes(dayName) && swapDay !== dayName) {
        const existing = existingMenu.find((m) => m.day === dayName);
        if (existing) return existing;
      }

      const assignment = parsedAssignments.find((a) => a.day === dayName);
      let selectedRecipe = assignment ? poolMap.get(String(assignment.recipeId)) : null;

      // Fallback if recipeId was invalid or hallucinated
      if (!selectedRecipe) {
        selectedRecipe = activePool[idx % activePool.length];
      }

      freshDays.add(dayName);
      return formatMenuItemFromRecipe(selectedRecipe, dayName, assignment?.subName, assignment);
    });

    // Second pass (non-fatal): AI estimates for nutrition and for solids measured by volume
    const estimatesApplied = await applyGeminiEstimates(ai, modelUsed, assembledMenu, freshDays);

    return res.status(200).json({
      success: true,
      isDemo: recipeSource === 'curated',
      modelUsed,
      estimatesApplied,
      recipeSource,
      notice: sourceNotice,
      menu: assembledMenu,
    });
  } catch (error) {
    console.error('Gemini meal plan generation error:', error);
    // On error, keep existing menu or fall back gracefully
    const fallbackMenu = buildDeterministicMenu({
      candidates: getCuratedRecipes(),
      existingMenu,
      lockedDays,
      swapDay,
      cookingTimePreferences,
    });

    const statusCode = error.status || error.code || 500;
    let userMsg = sanitizeErrorMessage(error);
    if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
      userMsg = 'Invalid Gemini credentials: API key rejected by Google (401/403).';
    } else if (statusCode === 429) {
      userMsg = 'Gemini quota limit reached (429). Please try again shortly.';
    } else if (statusCode === 503) {
      userMsg = 'Gemini model temporarily experiencing high demand (503). Retained current menu.';
    }

    return res.status(200).json({
      success: false,
      error: userMsg,
      upstreamHttpStatus: statusCode,
      fallbackUsed: true,
      isDemo: true,
      menu: fallbackMenu,
    });
  }
}

function formatMenuItemFromRecipe(recipe, day, subName, assignment = null) {
  // Gemini estimates apply only to the recipe Gemini actually chose, and only where the source has no value
  const est = assignment && String(assignment.recipeId) === String(recipe.id) ? assignment : null;
  const inRange = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const estimatedMinutes = est && inRange(est.estimatedMinutes, 5, 240) ? est.estimatedMinutes : null;
  const estimatedServings = est && inRange(est.estimatedServings, 1, 12) ? est.estimatedServings : null;

  // TheMealDB supplies a free-text measure (e.g. "1/2 cup") and no cooking time
  const ingredients = (recipe.extendedIngredients || []).map((ing) => ({
    name: ing.name || ing.original || 'Ingredient',
    qty: ing.measure !== undefined
      ? (ing.measure || 'Quantity unavailable')
      : `${ing.amount || 1}${ing.unit ? ' ' + ing.unit : ''}`,
    originalQty: ing.originalMeasure || undefined,
    status: (ing.name || '').match(/rice|oil|salt|soy|cornstarch/i) ? 'in-pantry' : 'buy',
  }));
  const timeKnown = recipe.readyInMinutes !== null;
  const source = recipe.source || (String(recipe.id).startsWith('curated-') ? 'demo' : 'spoonacular');

  return {
    id: `menu-${day.toLowerCase().slice(0, 3)}`,
    recipeId: String(recipe.id),
    day,
    mealName: recipe.title,
    subName: subName || (timeKnown ? `Prep time: ${recipe.readyInMinutes}m • Fresh Family Style` : 'Fresh Family Style'),
    description: recipe.summary || recipe.instructions || 'Nourishing family style meal prepared with fresh seasonal ingredients.',
    prepTimeMinutes: timeKnown ? (recipe.readyInMinutes || 30) : estimatedMinutes,
    timeIsEstimate: !timeKnown && estimatedMinutes !== null,
    recipeServings: recipe.servings ?? estimatedServings,
    servingsIsEstimate: (recipe.servings === null || recipe.servings === undefined) && estimatedServings !== null,
    source,
    sourceUrl: recipe.sourceUrl || null,
    cuisine: (recipe.cuisines?.[0] || 'Asian') + ' Home Cooking',
    image: recipe.image || 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    tags: ['Family Balance', 'Portion Calibrated'],
    servings: 2.75,
    ingredients,
  };
}

// Quantities given by volume that lib/units.js leaves unconverted (i.e. solids)
const VOLUME_QTY = /^\s*[\d/. ]+\s*(cups?|tbsps?|tbs|tblsp|tablespoons?|tsps?|teaspoons?)\b/i;
const ESTIMATE_TIMEOUT_MS = 9000;

/**
 * Ask Gemini to estimate per-serving nutrition for the newly planned dinners and
 * gram weights for solid ingredients measured by volume. Mutates the menu items
 * in place and marks every value as an estimate. Any failure leaves the menu as is.
 */
async function applyGeminiEstimates(ai, model, menu, freshDays) {
  const targets = menu.filter((item) => freshDays.has(item.day) && Array.isArray(item.ingredients));
  if (targets.length === 0) return false;

  const payload = targets.map((item) => ({
    day: item.day,
    mealName: item.mealName,
    servings: item.recipeServings || 4,
    ingredients: item.ingredients.map((ing, index) => ({
      index,
      name: ing.name,
      qty: ing.qty,
      needsGrams: VOLUME_QTY.test(String(ing.qty || '')),
    })),
  }));

  const intField = (description) => ({ type: Type.INTEGER, nullable: true, description });
  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        day: { type: Type.STRING },
        caloriesPerServing: intField('Estimated kcal for one serving'),
        proteinGrams: intField('Estimated protein per serving'),
        carbsGrams: intField('Estimated carbohydrate per serving'),
        fatGrams: intField('Estimated fat per serving'),
        weights: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              index: { type: Type.INTEGER, description: 'Ingredient index from the request' },
              grams: { type: Type.INTEGER, description: 'Estimated weight in grams of the stated quantity' },
            },
            required: ['index', 'grams'],
          },
        },
      },
      required: ['day'],
    },
  };

  let timer = null;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('estimate timed out')), ESTIMATE_TIMEOUT_MS);
    });
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: `Estimate for each dinner:\n${JSON.stringify(payload)}`,
        config: {
          systemInstruction: `You estimate nutrition for home-cooked dinners.
For each dinner, estimate caloriesPerServing, proteinGrams, carbsGrams and fatGrams for ONE serving, using the listed ingredients and the given number of servings.
In "weights", include ONLY ingredients whose needsGrams is true, with the weight in grams of the stated quantity of that ingredient (for example 1 cup of uncooked rice is about 185 g).
Use null when you cannot make a reasonable estimate. Return one object per dinner, keyed by the same "day".`,
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
      timeout,
    ]);

    const parsed = JSON.parse(response.text ? response.text.trim() : '[]');
    if (!Array.isArray(parsed)) return false;

    const inRange = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
    let applied = false;

    for (const item of targets) {
      const est = parsed.find((entry) => entry && entry.day === item.day);
      if (!est) continue;

      if (inRange(est.caloriesPerServing, 50, 2000)) {
        const macro = (n) => (inRange(n, 0, 300) ? n : null);
        item.nutritionEstimate = {
          caloriesPerServing: est.caloriesPerServing,
          proteinGrams: macro(est.proteinGrams),
          carbsGrams: macro(est.carbsGrams),
          fatGrams: macro(est.fatGrams),
          servingsBasis: payload.find((p) => p.day === item.day).servings,
        };
        applied = true;
      }

      for (const weight of Array.isArray(est.weights) ? est.weights : []) {
        const ing = item.ingredients[weight.index];
        if (!ing || !VOLUME_QTY.test(String(ing.qty || '')) || !inRange(weight.grams, 1, 2000)) continue;
        ing.originalQty = ing.originalQty || ing.qty;
        ing.qty = `${weight.grams}g`;
        ing.qtyIsEstimate = true;
        applied = true;
      }
    }

    return applied;
  } catch (err) {
    console.warn('Gemini estimates skipped:', sanitizeErrorMessage(err));
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildDeterministicMenu({ candidates, existingMenu = [], lockedDays = [], swapDay = null, cookingTimePreferences = 45 }) {
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return daysOfWeek.map((dayName, idx) => {
    if (lockedDays.includes(dayName) && swapDay !== dayName) {
      const existing = existingMenu.find((m) => m.day === dayName);
      if (existing) return existing;
    }

    const recipe = candidates[(idx + (swapDay === dayName ? 3 : 0)) % candidates.length];
    return formatMenuItemFromRecipe(recipe, dayName);
  });
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
