import React from 'react';
import { ApiHealthResponse } from '../types';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  RotateCw,
  Server,
  Key,
} from 'lucide-react';

interface ApiHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: ApiHealthResponse | null;
  isLoading: boolean;
  onCheck: () => void;
}

export function ApiHealthModal({
  isOpen,
  onClose,
  health,
  isLoading,
  onCheck,
}: ApiHealthModalProps) {
  if (!isOpen) return null;

  const renderStatusBadge = (
    status: 'ok' | 'degraded' | 'error' | 'not_configured',
    responseTime: number | null
  ) => {
    switch (status) {
      case 'ok':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Operational {responseTime !== null && `(${responseTime}ms)`}
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Degraded (503 High Demand)
          </span>
        );
      case 'not_configured':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-xs font-semibold">
            <Key className="w-3.5 h-3.5 text-amber-600" />
            Not Configured (Demo Mode)
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-800 border border-rose-200 rounded-md text-xs font-semibold">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Error
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#233F33] text-white rounded-lg">
              <Activity className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <h2 className="font-editorial text-xl font-bold text-stone-900">
                API Integration Health
              </h2>
              <p className="text-xs text-stone-500">
                Live verification of Spoonacular & Gemini APIs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Callout */}
        <div className="mt-4 p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600 leading-relaxed">
          This manual check verifies server-side credentials and endpoints without background continuous polling. Missing keys seamlessly activate our curated culinary database.
        </div>

        {/* Provider Cards */}
        <div className="mt-4 space-y-3">
          {/* Spoonacular API */}
          <div className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-stone-600" />
                <span className="text-sm font-bold text-stone-800">
                  Spoonacular Recipe API
                </span>
              </div>
              {health ? (
                renderStatusBadge(
                  health.providers.spoonacular.status,
                  health.providers.spoonacular.responseTimeMs
                )
              ) : (
                <span className="text-xs text-stone-400">Not checked</span>
              )}
            </div>
            <p className="text-xs text-stone-500">
              {health?.providers.spoonacular.status === 'ok'
                ? 'Authenticated and ready for recipe search & information queries.'
                : health?.providers.spoonacular.status === 'not_configured'
                ? 'SPOONACULAR_API_KEY is not set in environment. App uses curated recipe catalog.'
                : health?.providers.spoonacular.error || 'Click "Check APIs" below to verify status.'}
            </p>
          </div>

          {/* Gemini API */}
          <div className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-stone-600" />
                <span className="text-sm font-bold text-stone-800">
                  Gemini API (@google/genai SDK)
                </span>
              </div>
              {health ? (
                renderStatusBadge(
                  health.providers.gemini.status,
                  health.providers.gemini.responseTimeMs
                )
              ) : (
                <span className="text-xs text-stone-400">Not checked</span>
              )}
            </div>

            {/* Sub-diagnostic verification badges */}
            {health && health.providers.gemini.status !== 'not_configured' && (
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    health.providers.gemini.authVerified
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  Auth & Connectivity: {health.providers.gemini.authVerified ? 'Verified ✓' : 'Failed ✕'}
                </span>
                {health.providers.gemini.upstreamHttpStatus && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-stone-100 text-stone-700 border border-stone-200">
                    HTTP {health.providers.gemini.upstreamHttpStatus}
                  </span>
                )}
                {health.providers.gemini.model && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-stone-100 text-stone-600 border border-stone-200">
                    Model: {health.providers.gemini.model}
                  </span>
                )}
              </div>
            )}

            <p className="text-xs text-stone-500">
              {health?.providers.gemini.status === 'ok'
                ? (health?.providers.gemini.message || 'Authentication & connectivity verified with Gemini API.')
                : health?.providers.gemini.status === 'not_configured'
                ? 'GEMINI_API_KEY is not set in environment. App uses structured local constraint planner.'
                : health?.providers.gemini.error || 'Click "Check APIs" below to verify status.'}
            </p>
          </div>

          {/* NutriBalance MCP */}
          <div className="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-stone-600" />
                <span className="text-sm font-bold text-stone-800">
                  NutriBalance MCP (optional)
                </span>
              </div>
              {health?.providers.nutribalance ? (
                renderStatusBadge(
                  health.providers.nutribalance.status,
                  health.providers.nutribalance.responseTimeMs
                )
              ) : (
                <span className="text-xs text-stone-400">Not checked</span>
              )}
            </div>

            {health?.providers.nutribalance && (
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {(
                  [
                    ['Endpoint set', health.providers.nutribalance.endpointConfigured],
                    ['Key set', health.providers.nutribalance.keyConfigured],
                    ['Connectivity', health.providers.nutribalance.connectivityVerified],
                    ['Auth', health.providers.nutribalance.authVerified],
                    ['Tool discovery', health.providers.nutribalance.mappedToolAvailable],
                  ] as [string, boolean][]
                ).map(([label, ok]) => (
                  <span
                    key={label}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      ok
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {label}: {ok ? '✓' : '✕'}
                  </span>
                ))}
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-stone-100 text-stone-600 border-stone-200">
                  Tool execution: not tested here
                </span>
                {health.providers.nutribalance.upstreamHttpStatus && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-stone-100 text-stone-700 border border-stone-200">
                    HTTP {health.providers.nutribalance.upstreamHttpStatus}
                  </span>
                )}
              </div>
            )}

            <p className="text-xs text-stone-500">
              {health?.providers.nutribalance
                ? health.providers.nutribalance.error ||
                  health.providers.nutribalance.message ||
                  'Not configured. Manual calorie entry still works.'
                : 'Click "Check APIs" below to verify status. Manual calorie entry works without it.'}
            </p>
          </div>
        </div>

        {/* Overall Status Banner */}
        {health && (
          <div className="mt-4 p-3 rounded-xl border flex items-center justify-between text-xs font-mono font-medium">
            <span>Overall Status Code:</span>
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                health.status === 'healthy'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              HTTP {health.status === 'healthy' ? '200 OK' : '503 Service Unavailable'}
            </span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-5 mt-4 border-t border-stone-100">
          <span className="text-[11px] text-stone-400">
            {health ? `Last checked: ${new Date(health.timestamp).toLocaleTimeString()}` : 'Ready to test'}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              onClick={onCheck}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#233F33] hover:bg-[#192F26] rounded-lg shadow-2xs transition-all active:scale-[0.98] disabled:opacity-70"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Checking APIs...' : 'Check APIs Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
