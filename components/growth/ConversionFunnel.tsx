'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExclamationTriangleIcon, EyeIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { fmtNum, fmtPct } from './formatters';
import WeekSelector, { getCurrentWeekStart, toDateStr } from './WeekSelector';

interface FunnelStep {
  label: string;
  count: number;
  pctOfTotal: number;
  pctOfPrev: number;
}

interface FunnelGeneral {
  total: number;
  activated: number;
  paid: number;
  activationPct: number;
  conversionPct: number;
}

interface WeeklyRow {
  weekLabel: string;
  registered: number;
  ev1: number;
  ev2: number;
  ev3: number;
  activated: number;
  ev5plus: number;
  ev10plus: number;
  paid: number;
  free: number;
  activationPct: number;
  conversionPct: number;
}

interface ConversionData {
  has_data: boolean;
  plan_options?: string[];
  funnel_week?: FunnelStep[];
  funnel_general?: FunnelGeneral;
  weekly?: WeeklyRow[];
}

// 8-step funnel colors — warm gradient ending in green for $
const FUNNEL_COLORS = [
  { bg: '#3B82F6', light: '#EFF6FF' }, // blue
  { bg: '#6366F1', light: '#EEF2FF' }, // indigo
  { bg: '#7C3AED', light: '#F5F3FF' }, // violet
  { bg: '#9333EA', light: '#FAF5FF' }, // purple
  { bg: '#A855F7', light: '#FAF5FF' }, // purple light
  { bg: '#D946EF', light: '#FDF4FF' }, // fuchsia
  { bg: '#EC4899', light: '#FDF2F8' }, // pink
  { bg: '#10B981', light: '#ECFDF5' }, // emerald
];

const EVENTOS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: '0', label: '0 eventos' },
  { value: '1', label: '1 evento' },
  { value: '2', label: '2 eventos' },
  { value: '3', label: '3 eventos' },
  { value: '4', label: '4 eventos' },
  { value: '5+', label: '5+ eventos' },
];

const PLAN_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'free', label: 'Gratuitos' },
  { value: 'paid', label: 'Pagados' },
  { value: 'cancelled', label: 'Cancelados' },
];

export default function ConversionFunnel() {
  const { supabase } = useAuth();
  const [data, setData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);

  const [eventosFilter, setEventosFilter] = useState('all');
  const [planStatus, setPlanStatus] = useState('all');
  const [planId, setPlanId] = useState('all');

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      const weekStr = toDateStr(weekStart);
      const { data: result, error } = await supabase.rpc('get_conversion_funnel', {
        p_week_start: weekStr,
        p_weeks: 8,
        p_eventos_filter: eventosFilter,
        p_plan_status: planStatus,
        p_plan_id: planStatus === 'paid' ? planId : 'all',
      });
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
  }, [supabase, weekStart, eventosFilter, planStatus, planId]);

  useEffect(() => {
    if (planStatus !== 'paid') setPlanId('all');
  }, [planStatus]);

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

  const funnelWeek = data.funnel_week || [];
  const funnelGeneral = data.funnel_general;
  const weeklyData = data.weekly || [];
  const planOptions = data.plan_options || [];

  // Calculate key conversion metrics for summary cards
  const totalReg = funnelWeek[0]?.count || 0;
  const activatedCount = funnelWeek[4]?.count || 0;
  const paidCount = funnelWeek[7]?.count || 0;
  const activationRate = totalReg > 0 ? (activatedCount / totalReg) * 100 : 0;
  const conversionRate = totalReg > 0 ? (paidCount / totalReg) * 100 : 0;
  const activatedToPayRate = activatedCount > 0 ? (paidCount / activatedCount) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header + WeekSelector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-800">Funnel de Conversion</h2>
        <WeekSelector weekStart={weekStart} onWeekChange={setWeekStart} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-500">Filtros:</span>
        <select value={eventosFilter} onChange={(e) => setEventosFilter(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          {EVENTOS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={planStatus} onChange={(e) => setPlanStatus(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          {PLAN_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {planStatus === 'paid' && planOptions.length > 0 && (
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="all">Todos los planes</option>
            {planOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {/* ===== Visual Funnel ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 pb-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-gray-700">Funnel Semanal</h3>
          {funnelGeneral && (
            <span className="text-xs text-gray-400">
              Acumulado: {fmtNum(funnelGeneral.total)} reg · {fmtPct(funnelGeneral.activationPct)} activ · {fmtPct(funnelGeneral.conversionPct)} conv
            </span>
          )}
        </div>

        <div className="flex flex-col items-center">
          {funnelWeek.map((step, i) => {
            const color = FUNNEL_COLORS[i] || FUNNEL_COLORS[0];
            const widthPct = Math.max(step.pctOfTotal * 0.82 + 18, 18);
            const isActivated = i === 4;
            const isPaid = i === funnelWeek.length - 1;
            const dropOff = i > 0 ? funnelWeek[i - 1].count - step.count : 0;
            const dropOffPct = i > 0 && funnelWeek[i - 1].count > 0
              ? ((dropOff / funnelWeek[i - 1].count) * 100)
              : 0;

            return (
              <div key={i} className="w-full flex flex-col items-center">
                {i > 0 && dropOff > 0 && (
                  <div className="flex items-center gap-1.5 py-0.5">
                    <ChevronDownIcon className="w-3 h-3 text-gray-300" />
                    <span className="text-[10px] text-gray-400">
                      -{fmtNum(dropOff)} ({fmtPct(dropOffPct)})
                    </span>
                  </div>
                )}
                {i > 0 && dropOff === 0 && <div className="h-1" />}

                <div
                  className="relative flex items-center justify-between px-5 transition-all duration-500"
                  style={{
                    width: `${widthPct}%`,
                    minHeight: '44px',
                    backgroundColor: color.bg,
                    borderRadius: i === 0 ? '12px 12px 4px 4px' : isPaid ? '4px 4px 12px 12px' : '4px',
                    border: isActivated ? '2px solid rgba(255,255,255,0.5)' : undefined,
                    boxShadow: isActivated
                      ? `0 0 0 2px ${color.bg}, inset 0 1px 0 rgba(255,255,255,0.2)`
                      : isPaid
                        ? `0 4px 12px ${color.bg}40`
                        : undefined,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent rounded-[inherit]" />
                  <div className="relative flex items-center gap-2">
                    {isActivated && (
                      <span className="text-[9px] uppercase tracking-wider font-bold text-white/70 bg-white/20 px-1.5 py-0.5 rounded">activ.</span>
                    )}
                    {isPaid && (
                      <span className="text-[9px] uppercase tracking-wider font-bold text-white/70 bg-white/20 px-1.5 py-0.5 rounded">$</span>
                    )}
                    <span className="text-sm font-medium text-white drop-shadow-sm">{step.label}</span>
                  </div>
                  <div className="relative flex items-center gap-3">
                    <span className="text-lg font-bold text-white drop-shadow-sm">{fmtNum(step.count)}</span>
                    <span className="text-xs text-white/75 font-medium min-w-[45px] text-right">{fmtPct(step.pctOfTotal)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Inline conversion summary — bottom left */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#A855F7' }} />
            <span className="text-[11px] text-gray-500">Reg→Activ</span>
            <span className="text-[11px] font-bold text-gray-700">{fmtPct(activationRate)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#10B981' }} />
            <span className="text-[11px] text-gray-500">Reg→Pago</span>
            <span className="text-[11px] font-bold text-gray-700">{fmtPct(conversionRate)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3c527a' }} />
            <span className="text-[11px] text-gray-500">Activ→Pago</span>
            <span className="text-[11px] font-bold text-gray-700">{fmtPct(activatedToPayRate)}</span>
          </div>
        </div>
      </div>

      {/* ===== Weekly Conversion Table ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-700">Conversion Semanal (por cohorte de registro)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr>
                <th className="px-3 py-3 text-left whitespace-nowrap">Semana</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Registr.</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">1 ev</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">2 ev</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">3 ev</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Activ. (4+)</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">5+ ev</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">10+ ev</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Pagaron</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">% Activ.</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">% Conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {weeklyData.map((w, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{w.weekLabel}</td>
                  <td className="px-3 py-3 text-right text-gray-700 font-medium">{fmtNum(w.registered)}</td>
                  <td className="px-3 py-3 text-right text-indigo-600">{fmtNum(w.ev1)}</td>
                  <td className="px-3 py-3 text-right text-violet-600">{fmtNum(w.ev2)}</td>
                  <td className="px-3 py-3 text-right text-purple-600">{fmtNum(w.ev3)}</td>
                  <td className="px-3 py-3 text-right text-purple-700 font-medium">{fmtNum(w.activated)}</td>
                  <td className="px-3 py-3 text-right text-fuchsia-600">{fmtNum(w.ev5plus)}</td>
                  <td className="px-3 py-3 text-right text-pink-600">{fmtNum(w.ev10plus)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-medium">{fmtNum(w.paid)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.activationPct >= 50 ? 'bg-green-50 text-green-700' : w.activationPct >= 25 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                      {fmtPct(w.activationPct)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.conversionPct >= 10 ? 'bg-green-50 text-green-700' : w.conversionPct >= 5 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                      {fmtPct(w.conversionPct)}
                    </span>
                  </td>
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
