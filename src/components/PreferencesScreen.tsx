import React, { useState } from 'react';
import {
  HouseholdPreferences,
  HouseholdMember,
  RecurringItem,
  TrackedPantryItem,
} from '../types';
import { getDailyCalorieTarget } from '../data/sampleCalories';
import { ImgWithFallback } from './ImgWithFallback';
import { NutritionTargetModal } from './NutritionTargetModal';
import {
  Users,
  UtensilsCrossed,
  Package,
  Boxes,
  Check,
  Plus,
  X,
  RotateCcw,
  Sparkles,
  Calculator,
  Milk,
  Egg,
  Croissant,
  Soup,
  Home,
  AlertCircle,
  Clock,
  ArrowRight,
  Minus,
} from 'lucide-react';

interface PreferencesScreenProps {
  preferences: HouseholdPreferences;
  onUpdatePreferences: (updated: HouseholdPreferences) => void;
  onSavePreferences: () => void;
  onResetDefaults: () => void;
}

export function PreferencesScreen({
  preferences: initialPrefs,
  onUpdatePreferences,
  onSavePreferences,
  onResetDefaults,
}: PreferencesScreenProps) {
  const [prefs, setPrefs] = useState<HouseholdPreferences>(initialPrefs);
  const [isSavedRecently, setIsSavedRecently] = useState(true);

  // Modals / inline input states
  const [showAddFruit, setShowAddFruit] = useState(false);
  const [newFruitName, setNewFruitName] = useState('');

  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [newRecurringName, setNewRecurringName] = useState('');
  const [newRecurringFreq, setNewRecurringFreq] = useState('');

  const [showAddCuisine, setShowAddCuisine] = useState(false);
  const [newCuisineName, setNewCuisineName] = useState('');

  const [showAddRestriction, setShowAddRestriction] = useState(false);
  const [newRestrictionName, setNewRestrictionName] = useState('');

  const [showAddDisliked, setShowAddDisliked] = useState(false);
  const [newDislikedName, setNewDislikedName] = useState('');
  const [newDislikedWhom, setNewDislikedWhom] = useState('');

  const [showAddPantry, setShowAddPantry] = useState(false);
  const [newPantryName, setNewPantryName] = useState('');
  const [newPantryLoc, setNewPantryLoc] = useState('');
  const [newPantryQty, setNewPantryQty] = useState('');

  // Member whose suggested calorie target is being calculated (adults only)
  const [targetMemberId, setTargetMemberId] = useState<string | null>(null);
  const targetMember = prefs.members.find((m) => m.id === targetMemberId) || null;

  const isChildMember = (m: HouseholdMember) =>
    m.roleDescription.startsWith('Child') || m.name.includes('Leo');

  // Formula calculation based on members
  const memberMultipliers = prefs.members.map((m) => {
    let mult = 1.0;
    if (m.appetite === 'Small') mult = m.name.includes('Child') || m.name.includes('Leo') ? 0.5 : 0.8;
    else if (m.appetite === 'Big') mult = 1.25;
    return { ...m, calculatedMult: mult };
  });

  const totalMultiplier = memberMultipliers.reduce((acc, m) => acc + m.calculatedMult, 0);

  const handleUpdate = (next: HouseholdPreferences) => {
    setPrefs(next);
    setIsSavedRecently(false);
    onUpdatePreferences(next);
  };

  const handleMemberAppetite = (id: string, appetite: 'Small' | 'Normal' | 'Big') => {
    const updatedMembers = prefs.members.map((m) => {
      if (m.id === id) {
        let mult = 1.0;
        let badge = m.badge;
        let badgeColor = m.badgeColor;

        if (appetite === 'Big') {
          mult = 1.25;
          badge = '+25% portion multiplier';
          badgeColor = 'orange';
        } else if (appetite === 'Small') {
          mult = 0.5;
          badge = '0.5x portion multiplier';
          badgeColor = 'green';
        } else {
          mult = 1.0;
          badge = m.name.includes('Sarah') ? 'Primary Cook' : 'Standard portion';
          badgeColor = 'default';
        }

        return { ...m, appetite, multiplier: mult, badge, badgeColor };
      }
      return m;
    });

    handleUpdate({ ...prefs, members: updatedMembers });
  };

  const handleMemberCalorieTarget = (id: string, value: string) => {
    const target = Math.max(0, Math.round(Number(value) || 0));
    handleUpdate({
      ...prefs,
      members: prefs.members.map((m) =>
        m.id === id ? { ...m, dailyCalorieTarget: target } : m
      ),
    });
  };

  const handleAdultsCount = (delta: number) => {
    const next = Math.max(1, prefs.adults + delta);
    handleUpdate({ ...prefs, adults: next });
  };

  const handleChildrenCount = (delta: number) => {
    const next = Math.max(0, prefs.children + delta);
    handleUpdate({ ...prefs, children: next });
  };

  const toggleFruit = (fruit: string) => {
    const exists = prefs.preferredFruits.includes(fruit);
    const nextFruits = exists
      ? prefs.preferredFruits.filter((f) => f !== fruit)
      : [...prefs.preferredFruits, fruit];
    handleUpdate({ ...prefs, preferredFruits: nextFruits });
  };

  const addFruit = () => {
    if (!newFruitName.trim()) return;
    handleUpdate({ ...prefs, preferredFruits: [...prefs.preferredFruits, newFruitName.trim()] });
    setNewFruitName('');
    setShowAddFruit(false);
  };

  const addRecurringItem = () => {
    if (!newRecurringName.trim()) return;
    const newItem: RecurringItem = {
      id: `rec-${Date.now()}`,
      name: newRecurringName.trim(),
      frequency: newRecurringFreq.trim() || 'Weekly',
      icon: 'drop',
    };
    handleUpdate({ ...prefs, recurringItems: [...prefs.recurringItems, newItem] });
    setNewRecurringName('');
    setNewRecurringFreq('');
    setShowAddRecurring(false);
  };

  const removeRecurringItem = (id: string) => {
    handleUpdate({
      ...prefs,
      recurringItems: prefs.recurringItems.filter((i) => i.id !== id),
    });
  };

  const toggleCuisine = (name: string) => {
    const updated = prefs.primaryCuisines.map((c) =>
      c.name === name ? { ...c, active: !c.active } : c
    );
    handleUpdate({ ...prefs, primaryCuisines: updated });
  };

  const addCuisine = () => {
    if (!newCuisineName.trim()) return;
    handleUpdate({
      ...prefs,
      primaryCuisines: [...prefs.primaryCuisines, { name: newCuisineName.trim(), active: true }],
    });
    setNewCuisineName('');
    setShowAddCuisine(false);
  };

  const removeRestriction = (item: string) => {
    handleUpdate({
      ...prefs,
      dietaryRestrictions: prefs.dietaryRestrictions.filter((r) => r !== item),
    });
  };

  const addRestriction = () => {
    if (!newRestrictionName.trim()) return;
    handleUpdate({
      ...prefs,
      dietaryRestrictions: [...prefs.dietaryRestrictions, newRestrictionName.trim()],
    });
    setNewRestrictionName('');
    setShowAddRestriction(false);
  };

  const removeDisliked = (name: string) => {
    handleUpdate({
      ...prefs,
      dislikedIngredients: prefs.dislikedIngredients.filter((d) => d.name !== name),
    });
  };

  const addDisliked = () => {
    if (!newDislikedName.trim()) return;
    handleUpdate({
      ...prefs,
      dislikedIngredients: [
        ...prefs.dislikedIngredients,
        {
          name: newDislikedName.trim(),
          byWhom: newDislikedWhom.trim() ? `Disliked by ${newDislikedWhom.trim()}` : 'Sensory filter',
        },
      ],
    });
    setNewDislikedName('');
    setNewDislikedWhom('');
    setShowAddDisliked(false);
  };

  const toggleStaple = (name: string) => {
    const updated = prefs.evergreenStaples.map((s) =>
      s.name === name ? { ...s, inStock: !s.inStock } : s
    );
    handleUpdate({ ...prefs, evergreenStaples: updated });
  };

  const addPantryItem = () => {
    if (!newPantryName.trim()) return;
    const newItem: TrackedPantryItem = {
      id: `inv-${Date.now()}`,
      name: newPantryName.trim(),
      location: newPantryLoc.trim() || 'Pantry Shelf',
      quantity: newPantryQty.trim() || '1 pack',
    };
    handleUpdate({ ...prefs, trackedInventory: [...prefs.trackedInventory, newItem] });
    setNewPantryName('');
    setNewPantryLoc('');
    setNewPantryQty('');
    setShowAddPantry(false);
  };

  const getRecurringIcon = (icon: string) => {
    switch (icon) {
      case 'drop':
        return <Milk className="w-3.5 h-3.5 text-stone-500" />;
      case 'egg':
        return <Egg className="w-3.5 h-3.5 text-stone-500" />;
      case 'bread':
        return <Croissant className="w-3.5 h-3.5 text-stone-500" />;
      case 'cup':
        return <Soup className="w-3.5 h-3.5 text-stone-500" />;
      default:
        return <Package className="w-3.5 h-3.5 text-stone-500" />;
    }
  };

  return (
    <div className="pb-32 pt-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Top Banner Tag */}
      <div className="mb-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EEF4F0] text-[#244E3B] rounded-full text-xs font-semibold tracking-tight border border-[#D5E5DB]">
          <Home className="w-3.5 h-3.5 text-[#244E3B]" />
          FAMILY KITCHEN OPERATING BLUEPRINT
        </span>
      </div>

      {/* Header Row: Title & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-editorial text-3xl sm:text-4xl text-[#1E3027] tracking-tight">
            Household & Food Preferences
          </h1>
          <p className="text-sm text-stone-500 mt-1 max-w-2xl">
            Configure family appetites, cooking schedules, dietary restrictions, and kitchen pantry inventory.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start lg:self-end">
          <div className="flex items-center gap-2 text-xs text-stone-500 font-medium bg-stone-100/80 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>All changes auto-saved 2 mins ago</span>
          </div>

          <button
            onClick={() => {
              onSavePreferences();
              setIsSavedRecently(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#233F33] hover:bg-[#192F26] rounded-lg shadow-2xs transition-all active:scale-[0.98]"
          >
            <Check className="w-3.5 h-3.5" />
            Save Preferences
          </button>
        </div>
      </div>

      {/* 2x2 Grid of Main Configuration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* CARD 1: Household Members & Appetites */}
        <div className="bg-white border border-stone-200/80 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-stone-100 rounded-lg text-stone-700 mt-0.5">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-editorial text-lg font-bold text-stone-900 tracking-tight">
                    Household Members & Appetites
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Calibrates exact meal portion sizes and grocery procurement volumes.
                  </p>
                </div>
              </div>

              {/* Adults / Children Stepper */}
              <div className="flex items-center gap-2 text-xs font-medium text-stone-600 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 shrink-0">
                <span>Adults</span>
                <button
                  onClick={() => handleAdultsCount(-1)}
                  className="w-5 h-5 rounded hover:bg-stone-200 flex items-center justify-center font-bold"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <span className="font-mono font-bold text-stone-900 px-1">{prefs.adults}</span>
                <button
                  onClick={() => handleAdultsCount(1)}
                  className="w-5 h-5 rounded hover:bg-stone-200 flex items-center justify-center font-bold"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
                <span className="text-stone-300">|</span>
                <span>Children</span>
                <button
                  onClick={() => handleChildrenCount(-1)}
                  className="w-5 h-5 rounded hover:bg-stone-200 flex items-center justify-center font-bold"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <span className="font-mono font-bold text-stone-900 px-1">{prefs.children}</span>
                <button
                  onClick={() => handleChildrenCount(1)}
                  className="w-5 h-5 rounded hover:bg-stone-200 flex items-center justify-center font-bold"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>

            {/* Members Rows */}
            <div className="space-y-3 mb-6">
              {prefs.members.map((member) => (
                <div
                  key={member.id}
                  className="p-3.5 bg-stone-50/70 border border-stone-200/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center font-editorial font-bold text-stone-700 shadow-2xs shrink-0">
                      {member.initial}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-stone-800">
                          {member.name}
                        </span>
                        {member.badge && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-tight ${
                              member.badgeColor === 'orange'
                                ? 'bg-[#FFF2EB] text-[#C2410C] border border-[#FED7C2]'
                                : member.badgeColor === 'green'
                                ? 'bg-[#EBF2ED] text-[#2D5A43] border border-[#C8DACF]'
                                : 'bg-stone-200/70 text-stone-700'
                            }`}
                          >
                            {member.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {member.roleDescription}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 flex-wrap self-end sm:self-center">
                    {/* Daily Calorie Target */}
                    <label className="flex items-center gap-2 text-[11px] font-medium text-stone-500">
                      <span>Daily calorie target (kcal)</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={getDailyCalorieTarget(member) || ''}
                        onChange={(e) => handleMemberCalorieTarget(member.id, e.target.value)}
                        className="w-20 px-2 py-1 text-xs font-mono text-stone-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#233F33]"
                      />
                    </label>

                    {!isChildMember(member) && (
                      <button
                        type="button"
                        onClick={() => setTargetMemberId(member.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#244E3B] bg-[#EEF4F0] border border-[#D5E5DB] rounded-lg hover:bg-[#E2EDE6] transition-colors"
                      >
                        <Calculator className="w-3 h-3" />
                        Calculate Suggested Target
                      </button>
                    )}

                    {/* Appetite Selector Buttons */}
                    <div className="flex items-center gap-1 bg-stone-200/60 p-1 rounded-lg">
                      <span className="text-[11px] font-medium text-stone-500 px-2 sm:hidden">
                        Appetite:
                      </span>
                      {(['Small', 'Normal', 'Big'] as const).map((appLevel) => (
                        <button
                          key={appLevel}
                          type="button"
                          onClick={() => handleMemberAppetite(member.id, appLevel)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                            member.appetite === appLevel
                              ? 'bg-[#1E3027] text-white shadow-2xs'
                              : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          {appLevel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Formula calculation callout */}
          <div className="p-3.5 bg-[#FAFBF9] border border-[#E3E8E4] rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-stone-200/80 rounded-md text-stone-700">
                <Calculator className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-stone-900 tracking-tight">
                  Total Household Serving Multiplier
                </p>
                <p className="text-xs text-stone-600 font-mono mt-0.5">
                  1.0 (Sarah) + 1.25 (David) + 0.50 (Leo) ={' '}
                  <span className="font-bold text-[#1F3329]">
                    {totalMultiplier.toFixed(2)}x standard recipe yield
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={() => alert(`Active household yield is calibrated at ${totalMultiplier.toFixed(2)}x standard yield. All recipe weights are multiplied automatically.`)}
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1 whitespace-nowrap"
            >
              Adjust Formula
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* CARD 2: Fruit & Recurring Groceries */}
        <div className="bg-white border border-stone-200/80 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-stone-100 rounded-lg text-stone-700 mt-0.5">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-editorial text-lg font-bold text-stone-900 tracking-tight">
                  Fruit & Recurring Groceries
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Pantry essentials auto-added to every weekend cart.
                </p>
              </div>
            </div>

            {/* Preferred Fruits */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-stone-800">
                  Household Preferred Fruits
                </span>
                <span className="text-[11px] text-stone-500 font-mono">
                  2 portions / person / day (~42 wk)
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {prefs.preferredFruits.map((fruit) => (
                  <button
                    key={fruit}
                    type="button"
                    onClick={() => toggleFruit(fruit)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E8F4EC] text-[#20523C] border border-[#CDE5D6] rounded-full text-xs font-semibold hover:bg-[#DDF0E3] transition-colors"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    {fruit}
                  </button>
                ))}

                {showAddFruit ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newFruitName}
                      onChange={(e) => setNewFruitName(e.target.value)}
                      placeholder="Fruit name..."
                      className="px-2.5 py-1 text-xs border border-stone-300 rounded-full focus:outline-none focus:ring-1 focus:ring-[#233F33]"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && addFruit()}
                    />
                    <button
                      onClick={addFruit}
                      className="p-1 bg-[#233F33] text-white rounded-full hover:bg-stone-800"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddFruit(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-stone-300 rounded-full text-xs font-medium text-stone-600 hover:border-stone-400 hover:text-stone-800 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Fruit
                  </button>
                )}
              </div>
            </div>

            {/* Standing Replenishment */}
            <div>
              <div className="text-xs font-bold text-stone-800 mb-2.5">
                Weekly Standing Replenishment
              </div>

              <div className="space-y-2">
                {prefs.recurringItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 bg-stone-50/80 border border-stone-200/60 rounded-lg flex items-center justify-between text-xs group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1 bg-stone-100 rounded text-stone-600">
                        {getRecurringIcon(item.icon)}
                      </div>
                      <span className="font-semibold text-stone-800">
                        {item.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded font-mono text-[11px]">
                        {item.frequency}
                      </span>
                      <button
                        onClick={() => removeRecurringItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 transition-opacity"
                        title="Remove recurring"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Add Recurring Item Button */}
          <div className="mt-5">
            {showAddRecurring ? (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Item name (e.g. Sourdough Loaf)"
                  value={newRecurringName}
                  onChange={(e) => setNewRecurringName(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded"
                />
                <input
                  type="text"
                  placeholder="Frequency (e.g. 1 loaf per week)"
                  value={newRecurringFreq}
                  onChange={(e) => setNewRecurringFreq(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded"
                />
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    onClick={() => setShowAddRecurring(false)}
                    className="px-2.5 py-1 text-xs text-stone-600 hover:text-stone-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addRecurringItem}
                    className="px-3 py-1 bg-[#233F33] text-white text-xs font-medium rounded hover:bg-stone-800"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddRecurring(true)}
                className="w-full py-2.5 border border-dashed border-stone-300 rounded-xl text-xs font-semibold text-stone-600 hover:border-stone-400 hover:text-stone-900 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Recurring Item
              </button>
            )}
          </div>
        </div>

        {/* CARD 3: Food & Cuisine Preferences */}
        <div className="bg-white border border-stone-200/80 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-stone-100 rounded-lg text-stone-700 mt-0.5">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-editorial text-lg font-bold text-stone-900 tracking-tight">
                  Food & Cuisine Preferences
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Guides AI recipe suggestion engine and ingredient substitutions.
                </p>
              </div>
            </div>

            {/* Primary Cuisine Styles */}
            <div className="mb-5">
              <div className="text-xs font-bold text-stone-800 mb-2">
                Primary Cuisine Styles (Weekly Rotation)
              </div>
              <div className="flex flex-wrap gap-2">
                {prefs.primaryCuisines.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => toggleCuisine(c.name)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      c.active
                        ? 'bg-[#E8F4EC] text-[#20523C] border border-[#CDE5D6]'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {c.active && <Check className="w-3 h-3 stroke-[2.5]" />}
                    {c.name}
                  </button>
                ))}

                {showAddCuisine ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newCuisineName}
                      onChange={(e) => setNewCuisineName(e.target.value)}
                      placeholder="Cuisine style..."
                      className="px-2.5 py-1 text-xs border border-stone-300 rounded-full"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && addCuisine()}
                    />
                    <button
                      onClick={addCuisine}
                      className="p-1 bg-[#233F33] text-white rounded-full hover:bg-stone-800"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddCuisine(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-stone-300 rounded-full text-xs font-medium text-stone-600 hover:border-stone-400 hover:text-stone-800 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Cuisine
                  </button>
                )}
              </div>
            </div>

            {/* Dietary Restrictions */}
            <div className="mb-5">
              <div className="text-xs font-bold text-stone-800 mb-2">
                Dietary Restrictions & Allergies
              </div>
              <div className="flex flex-wrap gap-2">
                {prefs.dietaryRestrictions.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FFF0E8] text-[#C2410C] border border-[#FED7C2] rounded-full text-xs font-semibold"
                  >
                    <AlertCircle className="w-3 h-3" />
                    {item}
                    <button
                      onClick={() => removeRestriction(item)}
                      className="hover:text-red-700 ml-1 text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {showAddRestriction ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newRestrictionName}
                      onChange={(e) => setNewRestrictionName(e.target.value)}
                      placeholder="Restriction (e.g. Gluten Free)"
                      className="px-2 py-0.5 text-xs border border-stone-300 rounded-full"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && addRestriction()}
                    />
                    <button
                      onClick={addRestriction}
                      className="p-1 bg-[#233F33] text-white rounded-full"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddRestriction(true)}
                    className="inline-flex items-center gap-1 px-3 py-1 border border-dashed border-[#FED7C2] text-[#C2410C] bg-[#FFF8F5] rounded-full text-xs font-medium hover:bg-[#FFF0E8] transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add restriction
                  </button>
                )}
              </div>
            </div>

            {/* Disliked Ingredients */}
            <div className="mb-5">
              <div className="text-xs font-bold text-stone-800 mb-2">
                Disliked Ingredients & Sensory Filters
              </div>
              <div className="flex flex-wrap gap-2">
                {prefs.dislikedIngredients.map((item) => (
                  <span
                    key={item.name}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-100 text-stone-700 border border-stone-200 rounded-full text-xs font-medium"
                  >
                    <span className="w-2 h-2 rounded-full bg-stone-400" />
                    {item.name} ({item.byWhom})
                    <button
                      onClick={() => removeDisliked(item.name)}
                      className="hover:text-stone-900 ml-1 text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {showAddDisliked ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newDislikedName}
                      onChange={(e) => setNewDislikedName(e.target.value)}
                      placeholder="Ingredient..."
                      className="px-2 py-0.5 text-xs border border-stone-300 rounded-full"
                    />
                    <input
                      type="text"
                      value={newDislikedWhom}
                      onChange={(e) => setNewDislikedWhom(e.target.value)}
                      placeholder="By whom..."
                      className="px-2 py-0.5 text-xs border border-stone-300 rounded-full"
                      onKeyDown={(e) => e.key === 'Enter' && addDisliked()}
                    />
                    <button
                      onClick={addDisliked}
                      className="p-1 bg-[#233F33] text-white rounded-full"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddDisliked(true)}
                    className="inline-flex items-center gap-1 px-3 py-1 border border-dashed border-stone-300 text-stone-600 rounded-full text-xs font-medium hover:border-stone-400 hover:text-stone-800 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add ingredient
                  </button>
                )}
              </div>
            </div>

            {/* Max Weekday Cooking Time */}
            <div className="mb-5 pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-stone-800">
                  Max Weekday Cooking Time
                </span>
                <span className="px-2.5 py-0.5 bg-stone-100 text-stone-800 font-mono text-xs font-bold rounded-md">
                  {prefs.maxCookingTime} mins max
                </span>
              </div>

              <input
                type="range"
                min="15"
                max="90"
                step="5"
                value={prefs.maxCookingTime}
                onChange={(e) =>
                  handleUpdate({ ...prefs, maxCookingTime: Number(e.target.value) })
                }
                className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-[#233F33]"
              />

              <div className="flex justify-between items-center text-[11px] text-stone-500 mt-2 font-medium">
                <span>15 min express</span>
                <span className="text-[#C2410C] font-semibold">
                  Quick 30-min meals preferred on Wed/Thu
                </span>
                <span>90 min slow simmer</span>
              </div>
            </div>
          </div>

          {/* Weekly Grocery Budget */}
          <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-stone-800 block mb-1">
                Weekly Grocery Budget
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-stone-500">SGD $</span>
                <input
                  type="number"
                  value={prefs.weeklyBudget}
                  onChange={(e) =>
                    handleUpdate({ ...prefs, weeklyBudget: Number(e.target.value) || 0 })
                  }
                  className="w-24 px-2 py-1 text-xs font-mono font-bold bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#233F33]"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-stone-600">
              <button
                type="button"
                role="switch"
                aria-checked={prefs.showBudgetTracking}
                onClick={() =>
                  handleUpdate({ ...prefs, showBudgetTracking: !prefs.showBudgetTracking })
                }
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  prefs.showBudgetTracking ? 'bg-[#233F33]' : 'bg-stone-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    prefs.showBudgetTracking ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span>Show budget tracking in Shopping List</span>
            </label>
          </div>
        </div>

        {/* CARD 4: Home Pantry & Staple Inventory */}
        <div className="bg-white border border-stone-200/80 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-stone-100 rounded-lg text-stone-700 mt-0.5">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-editorial text-lg font-bold text-stone-900 tracking-tight">
                  Home Pantry & Staple Inventory
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Prevents duplicate ingredient purchases during recipe generation.
                </p>
              </div>
            </div>

            {/* Evergreen Staples in Stock */}
            <div className="mb-6">
              <div className="text-xs font-bold text-stone-800 mb-2.5">
                Evergreen Staples in Stock
              </div>
              <div className="flex flex-wrap gap-2">
                {prefs.evergreenStaples.map((staple) => (
                  <button
                    key={staple.name}
                    type="button"
                    onClick={() => toggleStaple(staple.name)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      staple.inStock
                        ? 'bg-[#E8F4EC] text-[#20523C] border border-[#CDE5D6]'
                        : 'bg-stone-100 text-stone-400 line-through'
                    }`}
                  >
                    {staple.inStock && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    {staple.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Tracked Dry & Aromatics Inventory */}
            <div>
              <div className="text-xs font-bold text-stone-800 mb-2.5">
                Tracked Dry & Aromatics Inventory
              </div>

              <div className="space-y-2">
                {prefs.trackedInventory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-stone-50/80 border border-stone-200/60 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-800">
                          {item.name}
                        </span>
                        {item.reorderSoon && (
                          <span className="px-2 py-0.5 bg-[#FFF2EB] text-[#C2410C] border border-[#FED7C2] rounded text-[10px] font-bold">
                            Reorder soon
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        {item.location}
                      </p>
                    </div>

                    <div className="font-mono font-bold text-stone-700 bg-white px-2.5 py-1 rounded-md border border-stone-200">
                      {item.quantity}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Add Pantry Item Button */}
          <div className="mt-5">
            {showAddPantry ? (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Item name (e.g. Shaoxing Wine)"
                  value={newPantryName}
                  onChange={(e) => setNewPantryName(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded"
                />
                <input
                  type="text"
                  placeholder="Location (e.g. Pantry Bin #2)"
                  value={newPantryLoc}
                  onChange={(e) => setNewPantryLoc(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded"
                />
                <input
                  type="text"
                  placeholder="Quantity (e.g. 500ml)"
                  value={newPantryQty}
                  onChange={(e) => setNewPantryQty(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded"
                />
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    onClick={() => setShowAddPantry(false)}
                    className="px-2.5 py-1 text-xs text-stone-600 hover:text-stone-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addPantryItem}
                    className="px-3 py-1 bg-[#233F33] text-white text-xs font-medium rounded hover:bg-stone-800"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddPantry(true)}
                className="w-full py-2.5 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 hover:bg-stone-50 flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Pantry Item
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Household Flavor Profile Synergy Banner */}
      <div className="bg-white border border-[#E3E9E5] rounded-xl p-5 mb-8 shadow-2xs overflow-hidden">
        <div className="flex flex-col md:flex-row items-center gap-6">
          {/* Dish Image with corner tags */}
          <div className="relative w-full md:w-56 h-36 rounded-xl overflow-hidden shrink-0 border border-stone-200/70 shadow-2xs">
            <ImgWithFallback
              src="https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=500&q=80"
              alt="Homestyle Poached Cantonese Chicken"
              className="w-full h-full object-cover"
              fallbackText="Poached Chicken"
            />
            <div className="absolute top-2 left-2 flex gap-1">
              <span className="px-1.5 py-0.5 bg-black/70 backdrop-blur-xs text-white text-[10px] font-semibold rounded">
                Menu
              </span>
              <span className="px-1.5 py-0.5 bg-[#233F33]/80 backdrop-blur-xs text-emerald-200 text-[10px] font-semibold rounded">
                Target
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="flex-1">
            <div className="flex items-center gap-2 text-stone-500 font-bold text-xs uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#233F33]" />
              <span>HOUSEHOLD FLAVOR PROFILE SYNERGY</span>
            </div>
            <h3 className="font-editorial text-xl sm:text-2xl text-[#1E3027] font-semibold tracking-tight">
              Homestyle Cantonese Poached & Steamed Comforts
            </h3>
            <p className="text-xs text-stone-600 mt-2 leading-relaxed">
              Based on Sarah's preference for mild ginger-scallion profiles, Leo's gentle spice tolerance, and David's elevated protein portion, next week's recommended weekly rotation automatically weights soothing steamed whole fish, clear double-boiled broths, and sesame chicken.
            </p>
          </div>
        </div>
      </div>

      <NutritionTargetModal
        key={targetMember?.id || 'none'}
        member={targetMember}
        currentTarget={targetMember ? getDailyCalorieTarget(targetMember) : 0}
        onClose={() => setTargetMemberId(null)}
        onUseTarget={(memberId, kcal) => handleMemberCalorieTarget(memberId, String(kcal))}
      />

      {/* Sticky Bottom Footer Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-lg px-4 sm:px-6 py-3 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <button
              onClick={onResetDefaults}
              className="flex items-center gap-1.5 hover:text-stone-800 transition-colors font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to Defaults
            </button>
            <span className="text-stone-300">•</span>
            <span className="hidden sm:inline">Unsaved drafts persist locally</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setPrefs(initialPrefs);
                onUpdatePreferences(initialPrefs);
              }}
              className="px-4 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSavePreferences();
                setIsSavedRecently(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#233F33] hover:bg-[#192F26] rounded-lg shadow-2xs transition-all active:scale-[0.98]"
            >
              <Check className="w-3.5 h-3.5" />
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
