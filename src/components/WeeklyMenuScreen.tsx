import React, { useState } from 'react';
import { MenuItem, HouseholdPreferences } from '../types';
import {
  getMemberPortion,
  getDailyCalorieTarget,
  getSampleDinnerCalories,
} from '../data/sampleCalories';
import { ImgWithFallback } from './ImgWithFallback';
import {
  Flame,
  Calendar,
  Clock,
  Sparkles,
  Users,
  ShoppingCart,
  ChevronRight,
  ChefHat,
  RefreshCw,
  Lock,
  Unlock,
} from 'lucide-react';

interface WeeklyMenuScreenProps {
  menuItems: MenuItem[];
  preferences: HouseholdPreferences;
  onGenerateClick: () => void;
  onViewShoppingList: () => void;
  onSwapMeal?: (dayName: string) => void;
  onToggleLockDay?: (dayName: string) => void;
  onRegenerateUnlocked?: () => void;
  isLoading?: boolean;
}

export function WeeklyMenuScreen({
  menuItems,
  preferences,
  onGenerateClick,
  onViewShoppingList,
  onSwapMeal,
  onToggleLockDay,
  onRegenerateUnlocked,
  isLoading = false,
}: WeeklyMenuScreenProps) {
  const [selectedDay, setSelectedDay] = useState<string>('Wednesday');

  const [selectedMemberId, setSelectedMemberId] = useState<string>('');

  const selectedMeal = menuItems.find((m) => m.day === selectedDay) || menuItems[0];

  const totalMultiplier = preferences.members.reduce((acc, m) => acc + getMemberPortion(m), 0);

  // Sample calorie estimate for the selected member's portion of the selected dinner
  const selectedMember =
    preferences.members.find((m) => m.id === selectedMemberId) || preferences.members[0];
  const memberPortion = selectedMember ? getMemberPortion(selectedMember) : 1;
  // Prefer the AI estimate for this recipe; older or demo meals fall back to the sample value
  const nutritionEstimate = selectedMeal?.nutritionEstimate || null;
  const memberDinnerCalories = selectedMeal
    ? Math.round(
        (nutritionEstimate ? nutritionEstimate.caloriesPerServing : getSampleDinnerCalories(selectedMeal)) * memberPortion
      )
    : 0;
  const memberMacro = (grams: number | null) =>
    grams !== null ? `${Math.round(grams * memberPortion)} g` : 'Unavailable';
  const memberDailyTarget = selectedMember ? getDailyCalorieTarget(selectedMember) : 0;

  const lockedCount = menuItems.filter((m) => m.isLocked).length;

  return (
    <div className="pb-28 pt-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Top Banner Tag */}
      <div className="mb-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EEF4F0] text-[#244E3B] rounded-full text-xs font-semibold tracking-tight border border-[#D5E5DB]">
          <Calendar className="w-3.5 h-3.5 text-[#244E3B]" />
          OCT 21 – OCT 27 • 7-DAY NUTRITION & PORTION BALANCED ROTATION
        </span>
      </div>

      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-editorial text-3xl sm:text-4xl text-[#1E3027] tracking-tight">
            Weekly Family Menu Plan
          </h1>
          <p className="text-sm text-stone-500 mt-1 max-w-2xl">
            Auto-consolidated based on household portion multiplier (<span className="font-semibold text-stone-700">{totalMultiplier.toFixed(2)}x</span>), pantry stock, and zero-allergen safety.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onRegenerateUnlocked && (
            <button
              onClick={onRegenerateUnlocked}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 shadow-2xs transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-stone-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Regenerate Unlocked ({7 - lockedCount})</span>
            </button>
          )}

          <button
            onClick={onViewShoppingList}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 shadow-2xs transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5 text-stone-500" />
            Consolidated Shopping List
          </button>

          <button
            onClick={onGenerateClick}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#233F33] hover:bg-[#192F26] rounded-lg shadow-2xs transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            Generate New Rotation
          </button>
        </div>
      </div>

      {/* Week Day Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-8">
        {menuItems.map((item) => {
          const isSelected = item.day === selectedDay;
          return (
            <div
              key={item.id}
              className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? 'bg-white border-[#233F33] ring-2 ring-[#233F33]/20 shadow-xs'
                  : 'bg-white/70 border-stone-200 hover:border-stone-300 hover:bg-white'
              }`}
            >
              <div
                onClick={() => setSelectedDay(item.day)}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-stone-500 mb-1">
                  <span>{item.day.slice(0, 3)}</span>
                  <span className="text-[10px] text-stone-400 font-mono">
                    {item.prepTimeMinutes !== null ? `${item.timeIsEstimate ? '~' : ''}${item.prepTimeMinutes}m` : '—'}
                  </span>
                </div>
                <p
                  className={`text-xs font-bold line-clamp-1 leading-snug ${
                    isSelected ? 'text-[#1F3329]' : 'text-stone-800'
                  }`}
                >
                  {item.mealName.split('&')[0]}
                </p>
              </div>

              <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between">
                <span className="text-[10px] text-stone-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {item.cuisine.split(' ')[0]}
                </span>

                {onToggleLockDay && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLockDay(item.day);
                    }}
                    title={item.isLocked ? 'Locked (will not change during generation)' : 'Unlocked'}
                    className={`p-1 rounded hover:bg-stone-100 transition-colors ${
                      item.isLocked ? 'text-[#233F33]' : 'text-stone-400 hover:text-stone-600'
                    }`}
                  >
                    {item.isLocked ? (
                      <Lock className="w-3 h-3 text-[#233F33]" />
                    ) : (
                      <Unlock className="w-3 h-3 text-stone-300 hover:text-stone-500" />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Day Feature Card */}
      {selectedMeal && (
        <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-2xs mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
            {/* Visual Cover */}
            <div className="lg:col-span-5 relative h-64 lg:h-auto min-h-[300px]">
              <ImgWithFallback
                src={selectedMeal.image}
                alt={selectedMeal.mealName}
                className="w-full h-full object-cover"
                fallbackText={selectedMeal.mealName}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent lg:hidden" />
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="px-2.5 py-1 bg-white/90 backdrop-blur-xs text-stone-900 rounded-full text-xs font-bold shadow-2xs">
                  {selectedMeal.day} Dinner
                </span>
                <span className="px-2.5 py-1 bg-[#233F33]/90 backdrop-blur-xs text-emerald-200 rounded-full text-xs font-bold shadow-2xs">
                  {selectedMeal.cuisine}
                </span>
                {selectedMeal.isLocked && (
                  <span className="px-2 py-1 bg-amber-500/90 text-white rounded-full text-xs font-bold shadow-2xs flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </div>
            </div>

            {/* Details Content */}
            <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 text-xs text-stone-500 mb-2 font-mono flex-wrap">
                  <span className="flex items-center gap-1 font-semibold text-stone-700">
                    <Clock className="w-3.5 h-3.5 text-stone-500" />
                    {selectedMeal.prepTimeMinutes === null
                      ? 'Cooking time unavailable'
                      : selectedMeal.timeIsEstimate
                      ? `~${selectedMeal.prepTimeMinutes} mins (AI estimate)`
                      : `${selectedMeal.prepTimeMinutes} mins prep`}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-semibold text-stone-700">
                    <Users className="w-3.5 h-3.5 text-stone-500" />
                    Yield: {totalMultiplier.toFixed(2)}x portions
                  </span>
                  <span>•</span>
                  {selectedMeal.servingsIsEstimate && selectedMeal.recipeServings ? (
                    <>
                      <span className="font-semibold text-stone-700">
                        Recipe serves ~{selectedMeal.recipeServings} (AI estimate)
                      </span>
                      <span>•</span>
                    </>
                  ) : null}
                  {selectedMeal.prepTimeMinutes !== null && selectedMeal.timeIsEstimate ? (
                    <span
                      className={`font-semibold ${
                        selectedMeal.prepTimeMinutes <= preferences.maxCookingTime ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      Estimated {selectedMeal.prepTimeMinutes <= preferences.maxCookingTime ? 'under' : 'over'}{' '}
                      {preferences.maxCookingTime}m target
                    </span>
                  ) : selectedMeal.prepTimeMinutes !== null ? (
                    <span className="text-emerald-700 font-semibold">
                      Under {preferences.maxCookingTime}m target
                    </span>
                  ) : (
                    <span className="text-stone-500 font-semibold">
                      Not checked against {preferences.maxCookingTime}m target
                    </span>
                  )}
                </div>

                <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-[#1E3027] tracking-tight mb-2">
                  {selectedMeal.mealName}
                </h2>

                <p className="text-xs sm:text-sm font-semibold text-[#B45309] mb-3">
                  {selectedMeal.subName}
                </p>

                <p className="text-sm text-stone-600 leading-relaxed mb-6">
                  {selectedMeal.description}
                </p>

                {selectedMeal.source === 'gemini' && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 -mt-3 mb-6">
                    AI-generated recipe (Gemini). It does not come from a recipe database and has not been tested — check
                    the ingredients and method before cooking.
                  </p>
                )}

                {selectedMeal.source === 'themealdb' && (
                  <p className="text-[11px] text-stone-500 -mt-4 mb-6">
                    Recipe data from{' '}
                    <a href="https://www.themealdb.com" target="_blank" rel="noreferrer" className="underline hover:text-stone-800">
                      TheMealDB
                    </a>{' '}
                    (used while Spoonacular is unavailable)
                    {selectedMeal.sourceUrl && (
                      <>
                        {' • '}
                        <a href={selectedMeal.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-stone-800">
                          Original recipe
                        </a>
                      </>
                    )}
                  </p>
                )}

                {/* Calories per person (sample values) */}
                {selectedMember && (
                  <div className="mb-6 p-3.5 bg-[#FAFBF9] border border-[#E3E8E4] rounded-xl">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-[#B45309]" />
                        Calories Per Person
                      </h3>
                      <label className="flex items-center gap-2 text-[11px] font-medium text-stone-500">
                        <span>Member</span>
                        <select
                          value={selectedMember.id}
                          onChange={(e) => setSelectedMemberId(e.target.value)}
                          className="px-2 py-1 text-xs font-semibold text-stone-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#233F33]"
                        >
                          {preferences.members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2.5 bg-white border border-stone-200/70 rounded-lg">
                        <p className="text-[11px] font-medium text-stone-500">
                          This dinner • {selectedMember.name}'s portion ({memberPortion}x)
                        </p>
                        <p className="text-lg font-bold text-stone-900 font-mono">
                          ~{memberDinnerCalories.toLocaleString()} kcal
                        </p>
                        {nutritionEstimate && (
                          <p className="text-[11px] text-stone-500 font-mono mt-0.5">
                            Protein {memberMacro(nutritionEstimate.proteinGrams)} • Carbs{' '}
                            {memberMacro(nutritionEstimate.carbsGrams)} • Fat {memberMacro(nutritionEstimate.fatGrams)}
                          </p>
                        )}
                      </div>
                      <div className="p-2.5 bg-white border border-stone-200/70 rounded-lg">
                        <p className="text-[11px] font-medium text-stone-500">
                          Daily calorie target • whole day
                        </p>
                        <p className="text-lg font-bold text-stone-900 font-mono">
                          {memberDailyTarget > 0 ? `${memberDailyTarget.toLocaleString()} kcal` : 'Not set'}
                        </p>
                      </div>
                    </div>

                    <p className="text-[11px] text-stone-400 mt-2">
                      {nutritionEstimate
                        ? `AI estimate (Gemini) from the ingredient list, assuming the recipe serves ${nutritionEstimate.servingsBasis}. Not measured nutrition data.`
                        : 'Sample estimate.'}{' '}
                      This is one dinner only and is not meant to cover the full daily target.
                    </p>
                  </div>
                )}

                {/* Recipe Ingredients & Pantry Breakdown */}
                <div className="mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 flex items-center justify-between">
                    <span>Key Ingredients Consolidation</span>
                    <span className="text-[11px] font-normal normal-case text-stone-400">
                      Auto-matched with Pantry & Shopping List
                    </span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedMeal.ingredients.map((ing, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-stone-50 border border-stone-200/70 rounded-lg flex items-center justify-between text-xs"
                      >
                        <span className="font-semibold text-stone-800">
                          {ing.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono text-stone-600 font-medium"
                            title={
                              ing.originalQty
                                ? `${ing.qtyIsEstimate ? 'AI-estimated weight. ' : ''}Recipe states: ${ing.originalQty}`
                                : undefined
                            }
                          >
                            {ing.qtyIsEstimate ? '~' : ''}
                            {ing.qty}
                          </span>
                          {ing.status === 'in-pantry' ? (
                            <span className="px-1.5 py-0.5 bg-[#E8F4EC] text-[#2D6A4F] text-[10px] font-semibold rounded">
                              Pantry
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-stone-200 text-stone-700 text-[10px] font-semibold rounded">
                              In Cart
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action row */}
              <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 text-xs text-stone-500">
                  <ChefHat className="w-4 h-4 text-stone-400 shrink-0" />
                  <span>
                    Respects all household allergy & kid-mild restrictions
                  </span>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {onToggleLockDay && (
                    <button
                      onClick={() => onToggleLockDay(selectedMeal.day)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                        selectedMeal.isLocked
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {selectedMeal.isLocked ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Locked</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5 text-stone-400" />
                          <span>Lock Meal</span>
                        </>
                      )}
                    </button>
                  )}

                  {onSwapMeal && (
                    <button
                      onClick={() => onSwapMeal(selectedMeal.day)}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      Swap Recipe
                    </button>
                  )}

                  <button
                    onClick={onViewShoppingList}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#233F33] hover:bg-[#192F26] rounded-lg shadow-2xs transition-colors"
                  >
                    Check Ingredients
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Schedule Overview Table */}
      <div className="bg-white border border-stone-200/80 rounded-xl overflow-hidden shadow-2xs">
        <div className="p-4 bg-[#FAFBF9] border-b border-stone-200/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-stone-600" />
            <h3 className="font-semibold text-sm text-[#1F3329]">
              Full 7-Day Dinner Calendar
            </h3>
          </div>
          <span className="text-xs text-stone-500 font-mono">
            {lockedCount > 0 ? `${lockedCount} day(s) locked` : 'All 7 days customizable'}
          </span>
        </div>

        <div className="divide-y divide-stone-100">
          {menuItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedDay(item.day)}
              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                selectedDay === item.day ? 'bg-[#FAFBF9]' : 'hover:bg-stone-50/60'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="w-24 text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                  {item.day}
                  {item.isLocked && <Lock className="w-3 h-3 text-[#233F33]" />}
                </span>
                <div>
                  <h4 className="text-sm font-bold text-stone-800">
                    {item.mealName}
                  </h4>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {item.cuisine}{item.prepTimeMinutes !== null ? ` • ${item.timeIsEstimate ? '~' : ''}${item.prepTimeMinutes} mins` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <span className="px-2 py-0.5 bg-stone-100 text-stone-600 text-xs rounded font-mono">
                  {item.ingredients.length} ingredients
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
