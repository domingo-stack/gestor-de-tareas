'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExclamationTriangleIcon, EyeIcon } from '@heroicons/react/24/outline';
import { fmtNum, fmtPct } from './formatters';
import WeekSelector, { getCurrentWeekStart } from './WeekSelector';

interface FunnelStep {
  label: string;
  count: number;
  pctOfTotal: number;
  pctOfPrev: number;
}

interface WeeklyRow {
  weekLabel: string;
  registered: number;
  activated: number;
  paid: number;
  free: number;
  activationPct: number;
  conversionPct: number;
}

interface ConversionData {
  has_data: boolean;
  funnel?: FunnelStep[];
  weekly?: WeeklyRow[];
}

const FUNNEL_COLORS = ['#3B82F6', '#8B5CF6', '#10B981'];

export default function ConversionFunnel() {
  const { supabase } = useAuth();
  const [data, setData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      const weekStr = weekStart.toISOString().split('T')[0];
      const { data: result, error } = await supabase.rpc('get_conversion_funnel', { p_week_start: weekStr, p_weeks: 8 });
      if (error) {
        console.error('RPC get_conversion_funnel error:', error);
        setData({ has_data: false });
      } else if (result) {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        setData(parsed as ConversionData);
      } else {
        setData({ has_data: false });
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase, weekStart]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (!data?.has_data) {
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <ExclamationTriangleIcon className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-amber-800 mb-2">Datos pendientes</h3>
          <p className="text-sm text-amber-600 max-w-md mx-auto">
            Este tab necesita datos de <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">growth_users</code> para mostrar el funnel de conversion.
          </p>
        </div>
      </div>
    );
  }

  const funnel = data.funnel || [];
  const weeklyData = data.weekly || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-800">Funnel de Conversion</h2>
        <WeekSelector weekStart={weekStart} onWeekChange={setWeekStart} />
      </div>

      {/* Visual Funnel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-700 mb-6">Funnel General (acumulado)</h3>
        <div className="flex items-end justify-center gap-6 h-64">
          {funnel.map((step, i) => {
            const heightPct = Math.max(step.pctOfTotal, 5);
            return (
              <div key={i} className="flex flex-col items-center gap-2 flex-1 max-w-[200px]">
                <div className="text-center mb-1">
                  <p className="text-2xl font-bold text-gray-900">{fmtNum(step.count)}</p>
                  <p className="text-xs text-gray-500">{fmtPct(step.pctOfTotal)} del total</p>
                  {i > 0 && (
                    <p className="text-xs font-medium text-blue-600">{fmtPct(step.pctOfPrev)} del paso anterior</p>
                  )}
                </div>
                <div
                  className="w-full rounded-t-lg transition-all duration-500"
                  style={{ height: `${heightPct * 1.8}px`, backgroundColor: FUNNEL_COLORS[i], opacity: 0.85 }}
                />
                <p className="text-sm font-medium text-gray-700 text-center">{step.label}</p>
              </div>
            );
          })}
        </div>

        {/* Arrows between steps */}
        <div className="flex justify-center gap-4 mt-4">
          {funnel.length > 1 && funnel.slice(1).map((step, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full">
              <span className="text-xs text-gray-500">{funnel[i].label} → {step.label}:</span>
              <span className="text-xs font-bold text-gray-700">{fmtPct(step.pctOfPrev)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Conversion Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-700">Conversion Semanal (por cohorte de registro)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr>
                <th className="px-4 py-3 text-left">Semana</th>
                <th className="px-4 py-3 text-right">Registrados</th>
                <th className="px-4 py-3 text-right">Activados</th>
                <th className="px-4 py-3 text-right">% Activacion</th>
                <th className="px-4 py-3 text-right">Pagaron</th>
                <th className="px-4 py-3 text-right">% Conversion</th>
                <th className="px-4 py-3 text-right">Gratis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {weeklyData.map((w, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{w.weekLabel}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtNum(w.registered)}</td>
                  <td className="px-4 py-3 text-right text-purple-600 font-medium">{fmtNum(w.activated)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.activationPct >= 50 ? 'bg-green-50 text-green-700' : w.activationPct >= 25 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                      {fmtPct(w.activationPct)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">{fmtNum(w.paid)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.conversionPct >= 10 ? 'bg-green-50 text-green-700' : w.conversionPct >= 5 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                      {fmtPct(w.conversionPct)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{fmtNum(w.free)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mixpanel placeholder */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <EyeIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-600">Funnel de Onboarding (Mixpanel)</p>
        <p className="text-xs text-gray-400 mt-1">El funnel detallado de onboarding (paso a paso) y el funnel Paywall View → Pago estaran disponibles cuando se configure el pipeline de Mixpanel (Fase 3).</p>
      </div>
    </div>
  );
}
