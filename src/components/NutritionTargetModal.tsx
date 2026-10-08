import React, { useState } from 'react';
import { HouseholdMember, NutritionProfile, NutritionTargetResult } from '../types';
import { Calculator, X, AlertTriangle, Check, FlaskConical } from 'lucide-react';

interface NutritionTargetModalProps {
  member: HouseholdMember | null;
  currentTarget: number;
  onClose: () => void;
  onUseTarget: (memberId: string, kcal: number) => void;
}

// Display hints only — the server validates the same limits before any upstream call.
const ACTIVITY_OPTIONS: { value: NutritionProfile['activity_level']; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];

const GOAL_OPTIONS: { value: NutritionProfile['goal']; label: string }[] = [
  { value: 'maintain', label: 'Maintain weight' },
  { value: 'lose', label: 'Lose weight' },
  { value: 'gain', label: 'Gain muscle/weight' },
];

const ACTIVITY_FACTORS: Record<NutritionProfile['activity_level'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Demo Mode only: local maintenance estimate (Mifflin-St Jeor). Not a NutriBalance result.
function buildDemoResult(profile: NutritionProfile): NutritionTargetResult {
  const bmr =
    10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + (profile.gender === 'male' ? 5 : -161);
  return {
    source: 'demo',
    tool: null,
    dailyCalories: Math.round(bmr * ACTIVITY_FACTORS[profile.activity_level]),
    calorieBasis: 'tdee',
    macros: { proteinGrams: null, carbsGrams: null, fatGrams: null },
  };
}

export function NutritionTargetModal({ member, currentTarget, onClose, onUseTarget }: NutritionTargetModalProps) {
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<NutritionProfile['gender'] | ''>('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activity, setActivity] = useState<NutritionProfile['activity_level'] | ''>('');
  const [goal, setGoal] = useState<NutritionProfile['goal']>('maintain');

  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [result, setResult] = useState<NutritionTargetResult | null>(null);

  if (!member) return null;

  const buildProfile = (): NutritionProfile | null => {
    const errors: string[] = [];
    const ageNum = Number(age);
    const heightNum = Number(heightCm);
    const weightNum = Number(weightKg);

    if (age.trim() === '' || !Number.isInteger(ageNum) || ageNum < 18 || ageNum > 100) {
      errors.push('Age must be a whole number from 18 to 100 (adults only).');
    }
    if (gender === '') errors.push('Select the sex used for the BMR calculation.');
    if (heightCm.trim() === '' || !Number.isFinite(heightNum) || heightNum < 100 || heightNum > 250) {
      errors.push('Height must be between 100 and 250 cm.');
    }
    if (weightKg.trim() === '' || !Number.isFinite(weightNum) || weightNum < 30 || weightNum > 300) {
      errors.push('Weight must be between 30 and 300 kg.');
    }
    if (activity === '') errors.push('Select an activity level.');

    setFormErrors(errors);
    if (errors.length > 0 || gender === '' || activity === '') return null;

    return {
      age: ageNum,
      gender,
      height_cm: heightNum,
      weight_kg: weightNum,
      activity_level: activity,
      goal,
    };
  };

  const handleCalculate = async () => {
    const profile = buildProfile();
    if (!profile) return;

    setIsLoading(true);
    setLiveError(null);
    setResult(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/nutrition-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server returned non-JSON (HTTP ${res.status}). Check API routing.`);
      }

      const data = await res.json();
      if (!res.ok) {
        const details = Array.isArray(data.details) ? ` ${data.details.join('; ')}` : '';
        throw new Error(`${data.error || `Request failed (HTTP ${res.status})`}${details}`);
      }
      if (typeof data.dailyCalories !== 'number' || !Number.isFinite(data.dailyCalories)) {
        throw new Error('The service did not return a usable calorie figure.');
      }

      setResult(data as NutritionTargetResult);
    } catch (err: any) {
      setLiveError(err.name === 'AbortError' ? 'Request timed out after 15s.' : err.message || 'Service unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowDemo = () => {
    const profile = buildProfile();
    if (!profile) return;
    setLiveError(null);
    setResult(buildDemoResult(profile));
  };

  const renderMacro = (label: string, grams: number | null) => (
    <div className="flex-1 p-2 bg-white border border-stone-200 rounded-lg text-center">
      <div className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-mono font-bold text-stone-800 mt-0.5">
        {grams !== null ? `${grams} g` : 'Unavailable'}
      </div>
    </div>
  );

  const inputClass =
    'w-full px-2.5 py-1.5 text-xs font-mono text-stone-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#233F33]';
  const labelClass = 'block text-[11px] font-semibold text-stone-600 mb-1';
  const isDemoResult = result?.source === 'demo';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#233F33] text-white rounded-lg">
              <Calculator className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <h2 className="font-editorial text-xl font-bold text-stone-900">Calculate Suggested Target</h2>
              <p className="text-xs text-stone-500">
                {member.name} • current manual target {currentTarget > 0 ? `${currentTarget} kcal` : 'not set'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600 leading-relaxed">
          Adults only. These details are sent to the NutriBalance nutrition tool through this app's server to
          calculate a suggestion, and are not saved. Your manual target changes only if you choose{' '}
          <span className="font-semibold">Use This Target</span>.
        </div>

        {/* Inputs required by the mapped tool */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="nt-age">Age (years)</label>
            <input id="nt-age" type="number" min="18" max="100" step="1" value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="nt-gender">Sex (for BMR)</label>
            <select id="nt-gender" value={gender} onChange={(e) => setGender(e.target.value as NutritionProfile['gender'] | '')} className={inputClass}>
              <option value="">Select…</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="nt-height">Height (cm)</label>
            <input id="nt-height" type="number" min="100" max="250" step="0.5" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="nt-weight">Weight (kg)</label>
            <input id="nt-weight" type="number" min="30" max="300" step="0.5" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="nt-activity">Activity level</label>
            <select id="nt-activity" value={activity} onChange={(e) => setActivity(e.target.value as NutritionProfile['activity_level'] | '')} className={inputClass}>
              <option value="">Select…</option>
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="nt-goal">Goal</label>
            <select id="nt-goal" value={goal} onChange={(e) => setGoal(e.target.value as NutritionProfile['goal'])} className={inputClass}>
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {formErrors.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-xs text-rose-700" role="alert">
            {formErrors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}

        {/* Live failure — never replaced by a sample automatically */}
        {liveError && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800" role="alert">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Live calculation unavailable</p>
                <p className="mt-0.5">{liveError}</p>
                <p className="mt-1 text-rose-700">Your manual target is unchanged and can still be edited directly.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleShowDemo}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Show Demo Mode sample instead
            </button>
          </div>
        )}

        {/* Result for review */}
        {result && (
          <div
            className={`mt-4 p-4 rounded-xl border ${
              isDemoResult ? 'bg-amber-50 border-amber-200' : 'bg-[#EEF4F0] border-[#D5E5DB]'
            }`}
          >
            {isDemoResult && (
              <p className="mb-2 inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-bold uppercase tracking-wide">
                <FlaskConical className="w-3 h-3" />
                Demo Mode — illustrative demo data
              </p>
            )}
            <p className="text-[11px] font-semibold text-stone-600">
              {result.calorieBasis === 'tdee'
                ? 'Suggested daily calories (estimated maintenance / TDEE)'
                : 'Suggested daily calorie target'}
            </p>
            <p className="font-editorial text-3xl font-bold text-[#1E3027] mt-0.5">
              {result.dailyCalories} <span className="text-sm font-sans font-semibold text-stone-500">kcal / day</span>
            </p>

            <div className="flex gap-2 mt-3">
              {renderMacro('Protein', result.macros.proteinGrams)}
              {renderMacro('Carbs', result.macros.carbsGrams)}
              {renderMacro('Fat', result.macros.fatGrams)}
            </div>

            <p className="text-[11px] text-stone-500 mt-3">
              {isDemoResult
                ? 'Calculated locally from a standard formula for demonstration. Not a NutriBalance result.'
                : `Source: NutriBalance MCP • tool ${result.tool}`}
            </p>
            <p className="text-[11px] text-stone-500 mt-1">
              A suggestion for review, not medical or dietary advice.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-5 mt-4 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
          >
            {result ? 'Keep Current Target' : 'Cancel'}
          </button>
          <button
            onClick={handleCalculate}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all active:scale-[0.98] disabled:opacity-70 ${
              result
                ? 'text-stone-700 bg-white border border-stone-200 hover:bg-stone-50'
                : 'text-white bg-[#233F33] hover:bg-[#192F26] shadow-2xs'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            {isLoading ? 'Calculating…' : result ? 'Recalculate' : 'Calculate'}
          </button>
          {result && (
            <button
              onClick={() => {
                onUseTarget(member.id, result.dailyCalories);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#233F33] hover:bg-[#192F26] rounded-lg shadow-2xs transition-all active:scale-[0.98]"
            >
              <Check className="w-3.5 h-3.5" />
              Use This Target
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
