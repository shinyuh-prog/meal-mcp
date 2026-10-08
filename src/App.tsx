/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  TabType,
  ShoppingItem,
  CategoryGroup,
  HouseholdPreferences,
  MenuItem,
  ApiHealthResponse,
} from './types';
import {
  initialCategories,
  initialPreferences,
  initialWeeklyMenu,
} from './data/initialData';
import { Header } from './components/Header';
import { ShoppingListScreen } from './components/ShoppingListScreen';
import { PreferencesScreen } from './components/PreferencesScreen';
import { WeeklyMenuScreen } from './components/WeeklyMenuScreen';
import { AddCustomItemModal } from './components/AddCustomItemModal';
import { EditQtyModal } from './components/EditQtyModal';
import { GenerateMenuModal } from './components/GenerateMenuModal';
import { ApiHealthModal } from './components/ApiHealthModal';
import { Toast } from './components/Toast';
import { consolidateShoppingList } from '../lib/grocery-calculator.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('shopping');

  // Persistence in localStorage
  const [categories, setCategories] = useState<CategoryGroup[]>(() => {
    const saved = localStorage.getItem('heirloom_categories');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return initialCategories;
  });

  const [preferences, setPreferences] = useState<HouseholdPreferences>(() => {
    const saved = localStorage.getItem('heirloom_preferences');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return initialPreferences;
  });

  const [weeklyMenu, setWeeklyMenu] = useState<MenuItem[]>(() => {
    const saved = localStorage.getItem('heirloom_menu');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return initialWeeklyMenu;
  });

  // Modal and dialog states
  const [isAddCustomOpen, setIsAddCustomOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // API Generation states
  const [isGeneratingMenu, setIsGeneratingMenu] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // API Health states
  const [healthStatus, setHealthStatus] = useState<ApiHealthResponse | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('heirloom_categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('heirloom_preferences', JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem('heirloom_menu', JSON.stringify(weeklyMenu));
  }, [weeklyMenu]);

  // Check APIs health endpoint
  const handleCheckApis = async () => {
    setIsHealthLoading(true);
    setIsHealthOpen(true);
    try {
      const res = await fetch('/api/health');
      const contentType = res.headers.get('content-type') || '';

      // 1. Distinguish API route not found (404)
      if (res.status === 404) {
        const notFoundMsg = 'API route not found (/api/health returned 404). Check Vercel serverless function deployment.';
        setHealthStatus({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          providers: {
            spoonacular: { status: 'error', responseTimeMs: null, error: notFoundMsg },
            gemini: { status: 'error', responseTimeMs: null, error: notFoundMsg },
          },
        });
        setToastMessage(notFoundMsg);
        return;
      }

      // 2. Distinguish HTML returned instead of JSON (SPA rewrite issue)
      if (!contentType.includes('application/json')) {
        const text = await res.text().catch(() => '');
        const isHtml = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
        const htmlMsg = isHtml
          ? 'Backend returned HTML instead of JSON. Ensure Vercel does not rewrite /api/* to index.html.'
          : `Backend returned unexpected content type: ${contentType || 'unknown'} (HTTP ${res.status}).`;

        setHealthStatus({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          providers: {
            spoonacular: { status: 'error', responseTimeMs: null, error: htmlMsg },
            gemini: { status: 'error', responseTimeMs: null, error: htmlMsg },
          },
        });
        setToastMessage(htmlMsg);
        return;
      }

      // 3. Parse JSON response
      let data: ApiHealthResponse;
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        const parseMsg = `JSON parsing error: ${jsonErr.message}`;
        setHealthStatus({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          providers: {
            spoonacular: { status: 'error', responseTimeMs: null, error: parseMsg },
            gemini: { status: 'error', responseTimeMs: null, error: parseMsg },
          },
        });
        setToastMessage(parseMsg);
        return;
      }

      // 4. Distinguish backend execution failure (500 without structured providers)
      if (res.status === 500 && (!data.providers || !data.providers.gemini)) {
        const execMsg = (data as any).error || 'Backend execution failure (HTTP 500)';
        setHealthStatus({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          providers: {
            spoonacular: { status: 'error', responseTimeMs: null, error: execMsg },
            gemini: { status: 'error', responseTimeMs: null, error: execMsg },
          },
        });
        setToastMessage(`Backend execution failure (HTTP 500): ${execMsg}`);
        return;
      }

      // 5. Preserve provider-specific data and error messages from valid health JSON (including 503)
      setHealthStatus(data);

      const geminiProv = data.providers?.gemini;
      const spoonProv = data.providers?.spoonacular;

      // Build accurate diagnostic message without conflating providers
      if (res.status === 200 && geminiProv?.status === 'ok' && spoonProv?.status === 'ok') {
        setToastMessage('All APIs operational: Gemini and Spoonacular verified!');
      } else {
        const diagnostics: string[] = [];

        // Evaluate Gemini provider specifically
        if (geminiProv) {
          if (geminiProv.status === 'ok') {
            diagnostics.push('Gemini connected');
          } else if (geminiProv.status === 'not_configured') {
            diagnostics.push('GEMINI_API_KEY not configured');
          } else if (geminiProv.error?.includes('401') || geminiProv.error?.includes('403') || geminiProv.error?.includes('credentials')) {
            diagnostics.push('Gemini invalid credentials');
          } else if (geminiProv.error?.includes('429') || geminiProv.error?.includes('Quota')) {
            diagnostics.push('Gemini quota limit exceeded');
          } else if (geminiProv.error?.includes('timed out') || geminiProv.error?.includes('504')) {
            diagnostics.push('Gemini timeout');
          } else {
            diagnostics.push(`Gemini: ${geminiProv.error || 'error'}`);
          }
        }

        // Evaluate Spoonacular provider specifically
        if (spoonProv) {
          if (spoonProv.status === 'ok') {
            diagnostics.push('Spoonacular operational');
          } else if (spoonProv.status === 'not_configured') {
            diagnostics.push('Spoonacular not configured (Demo catalog)');
          } else if (spoonProv.error?.includes('401') || spoonProv.error?.includes('403')) {
            diagnostics.push('Spoonacular invalid key');
          } else if (spoonProv.error?.includes('402') || spoonProv.error?.includes('quota') || spoonProv.error?.includes('429')) {
            diagnostics.push('Spoonacular quota exceeded');
          } else if (spoonProv.error?.includes('timed out')) {
            diagnostics.push('Spoonacular timeout');
          } else {
            diagnostics.push(`Spoonacular: ${spoonProv.error || 'error'}`);
          }
        }

        setToastMessage(diagnostics.join(' • '));
      }
    } catch (networkErr: any) {
      const netMsg = networkErr.name === 'AbortError'
        ? 'API check timed out'
        : `Network connection error: ${networkErr.message || 'Server unreachable'}`;

      setHealthStatus({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        providers: {
          spoonacular: { status: 'error', responseTimeMs: null, error: netMsg },
          gemini: { status: 'error', responseTimeMs: null, error: netMsg },
        },
      });
      setToastMessage(netMsg);
    } finally {
      setIsHealthLoading(false);
    }
  };

  // Generate Weekly Menu from /api/meal-plan
  const handleGenerateMealPlan = async (swapDay?: string) => {
    setIsGeneratingMenu(true);
    setGenerationError(null);

    try {
      const lockedDays = weeklyMenu
        .filter((m) => m.isLocked && m.day !== swapDay)
        .map((m) => m.day);

      const payload = {
        householdSize: { adults: preferences.adults, children: preferences.children },
        appetiteSettings: preferences.members,
        dietaryRestrictions: preferences.dietaryRestrictions,
        dislikedIngredients: preferences.dislikedIngredients,
        cookingTimePreferences: preferences.maxCookingTime,
        primaryCuisines: preferences.primaryCuisines.filter((c) => c.active).map((c) => c.name),
        lockedDays,
        existingMenu: weeklyMenu,
        swapDay: swapDay || null,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server returned HTML/non-JSON (${response.status}). Check Vercel API routing.`);
      }

      const data = await response.json();

      // A failed provider call must not replace the current plan with fallback recipes
      if (data.success === false) {
        throw new Error(data.error || 'Meal plan service failed');
      }

      if (data.menu && Array.isArray(data.menu)) {
        // Preserve lock flags
        const nextMenu: MenuItem[] = data.menu.map((m: MenuItem) => {
          const oldMeal = weeklyMenu.find((o) => o.day === m.day);
          return {
            ...m,
            isLocked: oldMeal?.isLocked || false,
          };
        });

        setWeeklyMenu(nextMenu);

        // Recalculate shopping list from new weekly menu & preferences
        // Preserve any custom items user added
        const customItems = categories
          .flatMap((c) => c.items)
          .filter((i) => i.id.startsWith('item-custom-'));

        const newConsolidated = consolidateShoppingList(nextMenu, preferences, categories);

        if (customItems.length > 0) {
          // Merge custom items into respective categories
          customItems.forEach((custom) => {
            const cat = newConsolidated.find((c: CategoryGroup) => c.id === custom.category);
            if (cat) cat.items.unshift(custom);
          });
        }

        setCategories(newConsolidated);

        if (data.isDemo) {
          setIsDemoMode(true);
          setToastMessage(
            swapDay
              ? `Replaced ${swapDay}'s dinner with curated recipe candidate.`
              : 'Weekly menu generated using curated culinary catalog (Demo Mode).'
          );
        } else {
          setIsDemoMode(false);
          setToastMessage(
            swapDay
              ? `Replaced ${swapDay}'s recipe via Gemini & Spoonacular!`
              : 'Weekly menu optimized via Gemini & Spoonacular!'
          );
        }

        setIsGenerateOpen(false);
        setActiveTab('menu');
      } else {
        throw new Error(data.error || 'Failed to assemble weekly menu');
      }
    } catch (err: any) {
      console.error('Menu generation error:', err);
      const errMsg = err.name === 'AbortError' ? 'Request timed out after 20s' : (err.message || 'Service unavailable');
      setGenerationError(errMsg);
      setToastMessage(`Notice: ${errMsg}. Current menu kept safely.`);
    } finally {
      setIsGeneratingMenu(false);
    }
  };

  // Toggle lock status on a meal
  const handleToggleLockDay = (dayName: string) => {
    setWeeklyMenu((prev) =>
      prev.map((item) =>
        item.day === dayName ? { ...item, isLocked: !item.isLocked } : item
      )
    );
    const target = weeklyMenu.find((m) => m.day === dayName);
    setToastMessage(
      target?.isLocked
        ? `Unlocked ${dayName}'s dinner for regeneration.`
        : `Locked ${dayName}'s dinner. It will remain untouched when generating.`
    );
  };

  // Shopping list item toggling
  const handleToggleItem = (itemId: string) => {
    setCategories((prev) =>
      prev.map((cat) => ({
        ...cat,
        items: cat.items.map((item) =>
          item.id === itemId
            ? { ...item, isChecked: !item.isChecked }
            : item
        ),
      }))
    );
  };

  // Edit quantity & price
  const handleSaveEditQty = (
    itemId: string,
    updatedQty: string,
    updatedPrice?: number,
    updatedCalc?: string
  ) => {
    setCategories((prev) =>
      prev.map((cat) => ({
        ...cat,
        items: cat.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                quantityNote: updatedQty,
                price: updatedPrice,
                calcNote: updatedCalc,
              }
            : item
        ),
      }))
    );
    setToastMessage('Item quantity and pricing updated!');
  };

  // Add custom grocery item
  const handleAddCustomItem = (newItem: ShoppingItem, categoryId: string) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? { ...cat, items: [newItem, ...cat.items] }
          : cat
      )
    );
    setToastMessage(`Added "${newItem.name}" to shopping list!`);
  };

  // Copy plain text list
  const handleCopyList = () => {
    const lines: string[] = [
      '🛒 HEIRLOOM TABLE • CONSOLIDATED GROCERY LIST',
      `Calculated for Oct 21 – Oct 27 (2 Adults + 1 Child)\n`,
    ];

    categories.forEach((cat) => {
      const activeItems = cat.items.filter((i) => !i.isChecked);
      if (activeItems.length > 0) {
        lines.push(`\n📁 ${cat.title}:`);
        activeItems.forEach((i) => {
          const priceStr = i.price ? ` [SGD $${i.price.toFixed(2)}]` : '';
          lines.push(`  • ${i.name} (${i.quantityNote})${priceStr}`);
          if (i.calcNote) lines.push(`    ↳ ${i.calcNote}`);
        });
      }
    });

    const text = lines.join('\n');
    navigator.clipboard.writeText(text);
    setToastMessage('Shopping list copied to clipboard!');
  };

  // Export to WhatsApp format
  const handleExportWhatsApp = () => {
    const lines: string[] = [
      '*🥬 HEIRLOOM TABLE • GROCERY RUN*',
      '_Oct 21 – Oct 27 (Household Yield 2.75x)_\n',
    ];

    categories.forEach((cat) => {
      const toBuy = cat.items.filter((i) => !i.isChecked && !i.pantryDeducted);
      if (toBuy.length > 0) {
        lines.push(`*${cat.title.toUpperCase()}*`);
        toBuy.forEach((i) => {
          const price = i.price ? ` ~ SGD $${i.price.toFixed(2)}` : '';
          lines.push(`▫️ ${i.name} - *${i.quantityNote}*${price}`);
        });
        lines.push('');
      }
    });

    const text = lines.join('\n');
    navigator.clipboard.writeText(text);

    const encoded = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/?text=${encoded}`;
    setToastMessage('Exported to WhatsApp! Text copied to clipboard.');
    window.open?.(whatsappUrl, '_blank');
  };

  // Print list
  const handlePrintList = () => {
    window.print();
  };

  // Toggle pantry math
  const handleTogglePantryMath = () => {
    setPreferences((prev) => ({
      ...prev,
      showPantryDeductionsMath: !prev.showPantryDeductionsMath,
    }));
  };

  // Update preferences & auto-recalculate grocery list
  const handleUpdatePreferences = (updated: HouseholdPreferences) => {
    setPreferences(updated);
    // Recalculate grocery list with updated portion multiplier or pantry
    const customItems = categories
      .flatMap((c) => c.items)
      .filter((i) => i.id.startsWith('item-custom-'));

    const recomputed = consolidateShoppingList(weeklyMenu, updated, categories);
    if (customItems.length > 0) {
      customItems.forEach((custom) => {
        const cat = recomputed.find((c: CategoryGroup) => c.id === custom.category);
        if (cat) cat.items.unshift(custom);
      });
    }
    setCategories(recomputed);
  };

  // Reset to original defaults
  const handleResetDefaults = () => {
    if (window.confirm('Reset all groceries and preferences to defaults?')) {
      setCategories(initialCategories);
      setPreferences(initialPreferences);
      setWeeklyMenu(initialWeeklyMenu);
      setToastMessage('Restored kitchen blueprint defaults!');
    }
  };

  const handleSavePreferences = () => {
    setToastMessage('Preferences successfully saved!');
  };

  // Count of unchecked shopping items
  const activeCartCount = categories.flatMap((c) => c.items).filter((i) => !i.isChecked).length;

  return (
    <div className="min-h-screen bg-[#F8F9F5] flex flex-col font-sans selection:bg-[#233F33] selection:text-white">
      {/* Top Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onGenerateClick={() => setIsGenerateOpen(true)}
        onRefreshClick={() => {
          // Re-sync menu & grocery list
          const recomputed = consolidateShoppingList(weeklyMenu, preferences, categories);
          setCategories(recomputed);
          setToastMessage('Pantry inventory & recipe math synchronized!');
        }}
        onCheckApisClick={handleCheckApis}
        cartCount={activeCartCount}
      />

      {/* Screen View Switcher */}
      <main className="flex-1">
        {activeTab === 'shopping' && (
          <ShoppingListScreen
            categories={categories}
            preferences={preferences}
            onToggleItem={handleToggleItem}
            onEditQty={(item) => setEditingItem(item)}
            onAddItem={() => setIsAddCustomOpen(true)}
            onCopyList={handleCopyList}
            onExportWhatsApp={handleExportWhatsApp}
            onPrintList={handlePrintList}
            onTogglePantryMath={handleTogglePantryMath}
          />
        )}

        {activeTab === 'preferences' && (
          <PreferencesScreen
            preferences={preferences}
            onUpdatePreferences={handleUpdatePreferences}
            onSavePreferences={handleSavePreferences}
            onResetDefaults={handleResetDefaults}
          />
        )}

        {activeTab === 'menu' && (
          <WeeklyMenuScreen
            menuItems={weeklyMenu}
            preferences={preferences}
            onGenerateClick={() => setIsGenerateOpen(true)}
            onViewShoppingList={() => setActiveTab('shopping')}
            onSwapMeal={(dayName) => handleGenerateMealPlan(dayName)}
            onToggleLockDay={handleToggleLockDay}
            onRegenerateUnlocked={() => handleGenerateMealPlan()}
            isLoading={isGeneratingMenu}
          />
        )}
      </main>

      {/* Modals & Dialogs */}
      <AddCustomItemModal
        isOpen={isAddCustomOpen}
        onClose={() => setIsAddCustomOpen(false)}
        categories={categories}
        onAdd={handleAddCustomItem}
      />

      <EditQtyModal
        isOpen={Boolean(editingItem)}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleSaveEditQty}
      />

      <GenerateMenuModal
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        preferences={preferences}
        onGenerate={() => handleGenerateMealPlan()}
        isGenerating={isGeneratingMenu}
        error={generationError}
        isDemo={isDemoMode}
      />

      <ApiHealthModal
        isOpen={isHealthOpen}
        onClose={() => setIsHealthOpen(false)}
        health={healthStatus}
        isLoading={isHealthLoading}
        onCheck={handleCheckApis}
      />

      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
}
