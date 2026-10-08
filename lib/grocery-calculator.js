/**
 * Core Grocery Shopping List Consolidation Algorithm
 * Integrates household portion multipliers, family-style shared dishes,
 * cross-week ingredient combining, recurring staples, and pantry deductions.
 */

// Category dictionary for auto-sorting ingredients
const CATEGORY_MAP = {
  // Meat & Seafood
  chicken: 'meat-seafood',
  pork: 'meat-seafood',
  beef: 'meat-seafood',
  fish: 'meat-seafood',
  'sea bass': 'meat-seafood',
  salmon: 'meat-seafood',
  shrimp: 'meat-seafood',
  prawns: 'meat-seafood',
  ribs: 'meat-seafood',
  spare: 'meat-seafood',

  // Vegetables & Herbs
  broccoli: 'veggies-herbs',
  scallion: 'veggies-herbs',
  'spring onion': 'veggies-herbs',
  ginger: 'veggies-herbs',
  cabbage: 'veggies-herbs',
  tomato: 'veggies-herbs',
  'winter melon': 'veggies-herbs',
  'bok choy': 'veggies-herbs',
  'xiao bai cai': 'veggies-herbs',
  garlic: 'veggies-herbs',
  potato: 'veggies-herbs',
  onion: 'veggies-herbs',
  spinach: 'veggies-herbs',
  mushroom: 'veggies-herbs',
  shiitake: 'veggies-herbs',

  // Fruit
  apple: 'fruit',
  banana: 'fruit',
  grape: 'fruit',
  papaya: 'fruit',
  orange: 'fruit',
  berry: 'fruit',

  // Dairy & Eggs & Tofu
  egg: 'dairy-tofu',
  tofu: 'dairy-tofu',
  milk: 'dairy-tofu',
  yoghurt: 'dairy-tofu',
  yogurt: 'dairy-tofu',
  cheese: 'dairy-tofu',

  // Rice, Noodles & Pantry
  rice: 'rice-noodles-pantry',
  'soy sauce': 'rice-noodles-pantry',
  'sesame oil': 'rice-noodles-pantry',
  shaoxing: 'rice-noodles-pantry',
  cornstarch: 'rice-noodles-pantry',
  noodle: 'rice-noodles-pantry',
  oil: 'rice-noodles-pantry',
  salt: 'rice-noodles-pantry',
  sugar: 'rice-noodles-pantry',
};

// Benchmark price estimates in SGD for Singapore fair shopping
const BENCHMARK_PRICES = {
  'chicken thighs': 8.50,
  'sea bass': 11.20,
  'minced pork': 5.80,
  'salmon fillets': 9.90,
  'pork spare ribs': 6.80,
  broccoli: 3.80,
  'scallions / spring onions': 1.60,
  'ginger root': 1.20,
  'round cabbage': 2.20,
  'roma tomatoes': 2.90,
  'winter melon': 2.10,
  'bok choy / xiao bai cai': 2.00,
  'fresh garlic bulbs': 1.80,
  'fuji apples': 5.50,
  'cavendish bananas': 3.20,
  'seedless grapes': 4.80,
  papaya: 3.20,
  'fresh farm eggs': 3.95,
  'silken tofu': 2.40,
  'fresh whole milk': 6.80,
  'greek yoghurt': 7.50,
  'jasmine fragrant rice': 14.80,
  'shaoxing cooking wine': 4.20,
  'kitchen paper towels': 4.50,
  'aluminium foil': 3.20,
};

/**
 * Identify target category based on name
 */
export function categorizeIngredient(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, category] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return category;
  }
  return 'household-other';
}

/**
 * Generate consolidated shopping list from weekly menu & household preferences
 */
export function consolidateShoppingList(weeklyMenu, preferences, existingCategories = []) {
  // 1. Calculate active household multiplier (Sarah: 1.0, David: 1.25, Leo: 0.5 -> 2.75x)
  const householdMultiplier = preferences.members.reduce((acc, m) => {
    let mult = 1.0;
    if (m.appetite === 'Small') mult = (m.name.includes('Leo') || m.name.includes('Child')) ? 0.5 : 0.8;
    else if (m.appetite === 'Big') mult = 1.25;
    return acc + mult;
  }, 0);

  // Map to collect and combine raw ingredients across all days
  const ingredientMap = new Map();

  // Helper to parse numeric amount & unit from string like "400g" or "2 heads"
  function parseQty(qtyStr) {
    if (!qtyStr) return { num: 1, unit: 'item', raw: '' };
    const match = String(qtyStr).match(/^([\d.]+)\s*([a-zA-Z%]+)?/);
    if (match) {
      return {
        num: parseFloat(match[1]) || 1,
        unit: (match[2] || 'item').toLowerCase(),
        raw: qtyStr,
      };
    }
    return { num: 1, unit: 'item', raw: qtyStr };
  }

  // 2. Iterate weekly menu meals and extract ingredients
  (weeklyMenu || []).forEach((meal) => {
    const day = meal.day;
    const mealDishCount = (meal.mealName.includes('&') || meal.mealName.includes('+')) ? 2 : 1;
    // Family-style shared dish factor: accounts for multiple shared dishes at table
    const familySharedFactor = mealDishCount > 1 ? 0.85 : 1.0;
    const recipeScale = (householdMultiplier / 4) * familySharedFactor;

    (meal.ingredients || []).forEach((ing) => {
      const normName = normalizeIngredientName(ing.name);
      const parsed = parseQty(ing.qty);
      const scaledAmount = Math.round(parsed.num * recipeScale * 10) / 10;

      if (!ingredientMap.has(normName)) {
        ingredientMap.set(normName, {
          displayName: ing.name,
          normName,
          category: categorizeIngredient(ing.name),
          uses: [{ day, mealName: meal.mealName, qtyStr: ing.qty, amount: scaledAmount, unit: parsed.unit }],
          hasEstimatedQty: Boolean(ing.qtyIsEstimate),
          totalAmount: scaledAmount,
          unit: parsed.unit,
          status: ing.status,
        });
      } else {
        const existing = ingredientMap.get(normName);
        existing.uses.push({ day, mealName: meal.mealName, qtyStr: ing.qty, amount: scaledAmount, unit: parsed.unit });
        if (ing.qtyIsEstimate) existing.hasEstimatedQty = true;
        // If units are compatible (e.g. g, kg, ml), combine
        if (existing.unit === parsed.unit) {
          existing.totalAmount += scaledAmount;
        } else {
          existing.hasUnitMismatch = true;
        }
      }
    });
  });

  // 3. Match against pantry and tracked inventory
  const consolidatedItems = [];

  // Check pantry stock
  const pantryItems = preferences.trackedInventory || [];
  const evergreenStaples = preferences.evergreenStaples || [];

  ingredientMap.forEach((entry, normName) => {
    let inPantryAmount = 0;
    let inPantryNote = '';
    let isFullyInPantry = false;
    let warningNote = undefined;

    // Check evergreen staples
    const matchedEvergreen = evergreenStaples.find((s) =>
      normName.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(normName)
    );
    if (matchedEvergreen && matchedEvergreen.inStock) {
      isFullyInPantry = true;
      inPantryNote = `Deducted from Pantry (Staple in stock)`;
    }

    // Check tracked dry inventory
    const matchedTracked = pantryItems.find((p) =>
      normName.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(normName)
    );
    if (matchedTracked) {
      if (matchedTracked.reorderSoon) {
        warningNote = `Review quantity: Pantry has ~${matchedTracked.quantity} left`;
      }
      inPantryNote = `In Pantry (${matchedTracked.location}: ${matchedTracked.quantity})`;
    }

    // Build user calculation note
    const dayLabels = entry.uses.map((u) => `${u.day.slice(0, 3)}`).join(' & ');
    let calcNote = '';
    let quantityNote = '';

    if (entry.unit === 'g') {
      const rounded = Math.round(entry.totalAmount / 50) * 50 || Math.round(entry.totalAmount);
      quantityNote = `${rounded}g`;
      if (entry.uses.length > 1) {
        calcNote = `Needed for ${dayLabels}: ${rounded}g`;
      }
    } else if (entry.unit === 'ml') {
      const rounded = Math.round(entry.totalAmount / 5) * 5 || Math.round(entry.totalAmount);
      quantityNote = `${rounded}ml`;
      if (entry.uses.length > 1) {
        calcNote = `Needed for ${dayLabels}: ${rounded}ml`;
      }
    } else if (entry.unit === 'pieces' || entry.unit === 'pcs') {
      quantityNote = `${Math.ceil(entry.totalAmount)} pcs`;
    } else {
      quantityNote = entry.uses[0].qtyStr;
    }

    // Different units across recipes cannot be added up: flag it rather than guess
    if (entry.hasUnitMismatch) {
      const allQty = entry.uses.map((u) => `${u.day.slice(0, 3)} ${u.qtyStr}`).join(' + ');
      calcNote = `Mixed units, not combined: ${allQty}`;
    }

    // Weights estimated by AI from a volume measure are marked, not presented as recipe data
    if (entry.hasEstimatedQty) {
      if (entry.unit === 'g') quantityNote = `~${quantityNote}`;
      calcNote = calcNote ? `${calcNote} • includes AI-estimated weight` : 'Includes AI-estimated weight';
    }

    if (isFullyInPantry) {
      quantityNote = 'Fully in Pantry';
      calcNote = inPantryNote;
    } else if (warningNote) {
      calcNote = `Recommended to restock before weekend family gathering`;
    }

    const price = getBenchmarkPrice(entry.displayName);

    consolidatedItems.push({
      id: `gen-${normName.replace(/\s+/g, '-')}`,
      name: entry.displayName,
      category: entry.category,
      quantityNote,
      calcNote: calcNote || undefined,
      warningNote,
      pantryDeducted: isFullyInPantry,
      savedPrice: isFullyInPantry ? (price || 3.20) : undefined,
      price: isFullyInPantry ? undefined : price,
      isChecked: isFullyInPantry,
      storeName: price ? 'FairPrice' : undefined,
    });
  });

  // 4. Add Fruit & Recurring items from Preferences
  (preferences.preferredFruits || []).forEach((fruit) => {
    const exists = consolidatedItems.some((i) => i.name.toLowerCase().includes(fruit.toLowerCase()));
    if (!exists) {
      consolidatedItems.push({
        id: `fruit-${fruit.toLowerCase().replace(/\s+/g, '-')}`,
        name: fruit,
        category: 'fruit',
        quantityNote: fruit.includes('Apple') ? '6 pcs' : fruit.includes('Banana') ? '1 comb (~1.2kg)' : '500g',
        calcNote: 'Household standing fruit weekly cart',
        price: getBenchmarkPrice(fruit) || 4.20,
        isChecked: fruit.includes('Grape') || fruit.includes('Papaya'),
      });
    }
  });

  // Recurring standing groceries
  (preferences.recurringItems || []).forEach((rec) => {
    const exists = consolidatedItems.some((i) => i.name.toLowerCase().includes(rec.name.toLowerCase()));
    if (!exists) {
      const cat = categorizeIngredient(rec.name);
      consolidatedItems.push({
        id: `rec-${rec.id}`,
        name: rec.name,
        category: cat,
        quantityNote: rec.frequency.replace(' per week', ''),
        calcNote: `Standing weekly replenishment: ${rec.frequency}`,
        price: getBenchmarkPrice(rec.name) || 5.50,
        isChecked: true, // checked by default if bought early in week
      });
    }
  });

  // Group into standard UI categories
  const categoryTemplates = [
    { id: 'meat-seafood', title: 'Meat & Seafood', iconName: 'meat' },
    { id: 'veggies-herbs', title: 'Vegetables & Fresh Herbs', iconName: 'sprout' },
    { id: 'fruit', title: 'Fruit', iconName: 'apple' },
    { id: 'dairy-tofu', title: 'Dairy, Tofu & Eggs', iconName: 'egg' },
    { id: 'rice-noodles-pantry', title: 'Rice, Noodles & Pantry', iconName: 'bowl' },
    { id: 'household-other', title: 'Other Groceries & Household Items', iconName: 'box' },
  ];

  return categoryTemplates.map((template) => {
    const matched = consolidatedItems.filter((i) => i.category === template.id);
    return {
      id: template.id,
      title: template.title,
      iconName: template.iconName,
      items: matched,
    };
  });
}

function normalizeIngredientName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[0-9]/g, '')
    .replace(/fresh|lean|boneless|cleaned|sliced|diced|cloves|tbsp|tsp|pieces|whole/g, '')
    .trim();
}

function getBenchmarkPrice(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, price] of Object.entries(BENCHMARK_PRICES)) {
    if (lower.includes(key)) return price;
  }
  return undefined;
}
