export type TabType = 'menu' | 'shopping' | 'preferences';

export interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  quantityNote: string;
  calcNote?: string;
  inPantryNote?: string;
  pantryDeducted?: boolean;
  price?: number;
  savedPrice?: number;
  isChecked: boolean;
  storeName?: string;
  subCategory?: string;
  warningNote?: string;
  checkedNote?: string;
}

export interface CategoryGroup {
  id: string;
  title: string;
  iconName: string;
  items: ShoppingItem[];
}

export interface HouseholdMember {
  id: string;
  initial: string;
  name: string;
  badge?: string;
  badgeColor?: 'orange' | 'green' | 'default';
  roleDescription: string;
  appetite: 'Small' | 'Normal' | 'Big';
  multiplier: number;
  dailyCalorieTarget?: number;
}

export interface RecurringItem {
  id: string;
  name: string;
  frequency: string;
  icon: string;
}

export interface TrackedPantryItem {
  id: string;
  name: string;
  location: string;
  quantity: string;
  reorderSoon?: boolean;
}

export interface HouseholdPreferences {
  adults: number;
  children: number;
  members: HouseholdMember[];
  preferredFruits: string[];
  recurringItems: RecurringItem[];
  primaryCuisines: { name: string; isDefault?: boolean; active: boolean }[];
  dietaryRestrictions: string[];
  dislikedIngredients: { name: string; byWhom: string }[];
  maxCookingTime: number;
  weeklyBudget: number;
  showBudgetTracking: boolean;
  showPantryDeductionsMath: boolean;
  evergreenStaples: { name: string; inStock: boolean }[];
  trackedInventory: TrackedPantryItem[];
}

export interface MenuItem {
  id: string;
  recipeId?: string;
  day: string;
  mealName: string;
  subName: string;
  description: string;
  prepTimeMinutes: number | null;
  timeIsEstimate?: boolean;
  recipeServings?: number | null;
  servingsIsEstimate?: boolean;
  source?: 'spoonacular' | 'themealdb' | 'gemini' | 'demo';
  sourceUrl?: string | null;
  cuisine: string;
  image: string;
  tags: string[];
  servings: number;
  isLocked?: boolean;
  nutritionEstimate?: {
    caloriesPerServing: number;
    proteinGrams: number | null;
    carbsGrams: number | null;
    fatGrams: number | null;
    servingsBasis: number;
  };
  ingredients: { name: string; qty: string; originalQty?: string; qtyIsEstimate?: boolean; status: 'in-pantry' | 'buy' }[];
}

export interface ApiProviderHealth {
  status: 'ok' | 'degraded' | 'error' | 'not_configured';
  responseTimeMs: number | null;
  upstreamHttpStatus?: number | null;
  authVerified?: boolean;
  generationVerified?: boolean;
  message?: string | null;
  model?: string;
  error: string | null;
}

export interface McpProviderHealth {
  status: 'ok' | 'error' | 'not_configured';
  endpointConfigured: boolean;
  keyConfigured: boolean;
  upstreamHttpStatus: number | null;
  responseTimeMs: number | null;
  connectivityVerified: boolean;
  authVerified: boolean;
  discoveryVerified: boolean;
  mappedTool: string;
  mappedToolAvailable: boolean;
  operationVerified: boolean;
  message: string | null;
  error: string | null;
}

export interface ApiHealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  providers: {
    spoonacular: ApiProviderHealth;
    gemini: ApiProviderHealth;
    nutribalance?: McpProviderHealth | null;
  };
}

// Inputs for the mapped NutriBalance tool (calculate_tdee)
export interface NutritionProfile {
  age: number;
  gender: 'male' | 'female';
  height_cm: number;
  weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
}

export interface NutritionTargetResult {
  source: 'nutribalance-mcp' | 'demo';
  tool: string | null;
  dailyCalories: number;
  calorieBasis: 'target' | 'tdee' | null;
  macros: {
    proteinGrams: number | null;
    carbsGrams: number | null;
    fatGrams: number | null;
  };
}

