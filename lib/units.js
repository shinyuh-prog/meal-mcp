/**
 * Convert free-text recipe measures (e.g. "1/2 lb", "3 tbs") to metric.
 * Weight units convert exactly. Volume units convert only for liquid
 * ingredients; a cup of a solid is left as written rather than guessed.
 */

const WEIGHT_TO_GRAMS = {
  lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  kg: 1000, kgs: 1000,
  g: 1, gram: 1, grams: 1,
};

const VOLUME_TO_ML = {
  cup: 240, cups: 240,
  tbsp: 15, tbs: 15, tblsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  ml: 1,
  l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
};

const LIQUID_WORDS = /\b(water|oil|sauce|vinegar|wine|stock|broth|milk|cream|juice|sake|mirin|syrup|honey|cordial)\b/i;

function parseLeadingNumber(text) {
  const match = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return null;

  const raw = match[1];
  let value;
  if (raw.includes('/')) {
    const parts = raw.split(/\s+/);
    const [num, den] = parts[parts.length - 1].split('/').map(Number);
    if (!den) return null;
    value = (parts.length > 1 ? Number(parts[0]) : 0) + num / den;
  } else {
    value = Number(raw);
  }

  return Number.isFinite(value) && value > 0 ? { value, rest: match[2] } : null;
}

function roundAmount(amount) {
  if (amount >= 20) return Math.round(amount / 5) * 5;
  return Math.round(amount * 10) / 10;
}

/**
 * @returns {{ qty: string, converted: boolean }}
 */
export function toMetricQty(measure, ingredientName = '') {
  const text = String(measure || '').trim();
  const parsed = parseLeadingNumber(text);
  if (!parsed) return { qty: text, converted: false };

  const unitMatch = parsed.rest.match(/^([a-zA-Z]+)\.?\s*(.*)$/);
  if (!unitMatch) return { qty: text, converted: false };

  const unit = unitMatch[1].toLowerCase();
  const descriptor = unitMatch[2].trim();
  const suffix = descriptor ? ` ${descriptor}` : '';

  if (Object.prototype.hasOwnProperty.call(WEIGHT_TO_GRAMS, unit)) {
    const grams = roundAmount(parsed.value * WEIGHT_TO_GRAMS[unit]);
    return { qty: `${grams}g${suffix}`, converted: WEIGHT_TO_GRAMS[unit] !== 1 };
  }

  if (Object.prototype.hasOwnProperty.call(VOLUME_TO_ML, unit) && LIQUID_WORDS.test(ingredientName)) {
    const ml = roundAmount(parsed.value * VOLUME_TO_ML[unit]);
    return { qty: `${ml}ml${suffix}`, converted: VOLUME_TO_ML[unit] !== 1 };
  }

  return { qty: text, converted: false };
}
