'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExclamationTriangleIcon, EyeIcon, UsersIcon, ChartBarIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import { fmtNum, fmtPct } from './formatters';

// ─── Types ──────────────────────────────────────────────────

interface DailyMetric {
  date: string;
  dau: number;
  wau: number;
  mau: number;
  dau_paid: number;
  dau_free: number;
}

interface RetentionRow {
  cohort_date: string;
  cohort_size: number;
  period_number: number;
  users_count: number;
  retention_pct: number;
}

interface Summary {
  avg_dau: number;
  avg_wau: number;
  avg_mau: number;
  d1_retention_avg: number;
  d7_retention_avg: number;
  d30_retention_avg: number;
}

interface BehaviorData {
  has_data: boolean;
  has_metrics: boolean;
  has_retention: boolean;
  daily_metrics: DailyMetric[];
  retention_weekly: RetentionRow[];
  retention_daily: RetentionRow[];
  summary: Summary;
}

// ─── Helpers ────────────────────────────────────────────────

function retentionColor(pct: number): string {
  if (pct >= 60) return 'bg-green-100 text-green-800';
  if (pct >= 40) return 'bg-green-50 text-green-700';
  if (pct >= 25) return 'bg-amber-50 text-amber-700';
  if (pct >= 10) return 'bg-orange-50 text-orange-700';
  return 'bg-red-50 text-red-700';
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ─── Component ──────────────────────────────────────────────

export default function RetentionCohort() {
  const { supabase } = useAuth();
  const [data, setData] = useState<BehaviorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [daysRange, setDaysRange] = useState(30);

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      const { data: result, error } = await supabase.rpc('get_behavior_metrics', {
        p_days: daysRange,
      });
      if (error) {
        console.error('RPC get_behavior_metrics error:', error);
        setData({ has_data: false, has_metrics: false, has_retention: false, daily_metrics: [], retention_weekly: [], retention_daily: [], summary: { avg_dau: 0, avg_wau: 0, avg_mau: 0, d1_retention_avg: 0, d7_retention_avg: 0, d30_retention_avg: 0 } });
      } else if (result) {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        setData(parsed as BehaviorData);
      } else {
        setData({ has_data: false, has_metrics: false, has_retention: false, daily_metrics: [], retention_weekly: [], retention_daily: [], summary: { avg_dau: 0, avg_wau: 0, avg_mau: 0, d1_retention_avg: 0, d7_retention_avg: 0, d30_retention_avg: 0 } });
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase, daysRange]);

  // Build weekly retention matrix for triangular table
  const retentionMatrix = useMemo(() => {
    if (!data?.retention_weekly?.length) return [];
    const cohorts = new Map<string, { size: number; periods: Map<number, number> }>();
    for (const row of data.retention_weekly) {
      if (!cohorts.has(row.cohort_date)) {
        cohorts.set(row.cohort_date, { size: row.cohort_size, periods: new Map() });
      }
      cohorts.get(row.cohort_date)!.periods.set(row.period_number, row.retention_pct);
    }
    const maxPeriod = Math.max(...data.retention_weekly.map(r => r.period_number));
    return Array.from(cohorts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { size, periods }]) => ({
        date,
        size,
        periods: Array.from({ length: maxPeriod + 1 }, (_, i) => periods.get(i) ?? null),
      }));
  }, [data?.retention_weekly]);

  // Daily retention averages for key days
  const dailyRetentionAvg = useMemo(() => {
    if (!data?.retention_daily?.length) return [];
    const dayMap = new Map<number, number[]>();
    for (const row of data.retention_daily) {
      if (!dayMap.has(row.period_number)) dayMap.set(row.period_number, []);
      dayMap.get(row.period_number)!.push(row.retention_pct);
    }
    return [1, 3, 7, 14, 30]
      .filter(d => dayMap.has(d))
      .map(d => {
        const values = dayMap.get(d)!;
        const avg = values.reduce((s, v) => s + v, 0) / values.length;
        return { day: d, label: `Day ${d}`, avg: Math.round(avg * 10) / 10 };
      });
  }, [data?.retention_daily]);

  // ─── Loading ────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  // ─── No data state ──────────────────────────────────────

  if (!data?.has_data) {
    return (
      <div className="space-y-6">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <ExclamationTriangleIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Requiere Mixpanel (Fase 3)</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Este tab muestra datos de comportamiento que provienen de Mixpanel.
            Configura el pipeline n8n siguiendo la guia en <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">temp-docs/guia-mixpanel-n8n.md</code>.
          </p>
          <div className="mt-4 bg-white rounded-lg p-4 border border-gray-100 max-w-sm mx-auto text-left">
            <p className="text-xs font-medium text-gray-600 mb-2">Metricas que se mostraran:</p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>- DAU / WAU / MAU con tendencia</li>
              <li>- Retencion por cohorte semanal (tabla triangular)</li>
              <li>- Retencion por dias clave (Day 1, 3, 7, 14, 30)</li>
              <li>- Segmentacion pagados vs gratuitos</li>
            </ul>
          </div>
          <div className="mt-4 bg-blue-50 rounded-lg p-3 border border-blue-100 max-w-sm mx-auto">
            <p className="text-xs text-blue-700 font-medium">Pre-requisitos:</p>
            <ul className="text-xs text-blue-600 mt-1 space-y-0.5">
              <li>1. Service Account de Mixpanel</li>
              <li>2. Pipeline n8n configurado</li>
              <li>3. Datos en <code>growth_metrics_daily</code> y <code>growth_retention</code></li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const summary = data.summary;
  const dailyMetrics = data.daily_metrics || [];

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-800">Comportamiento y Retencion</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Periodo:</span>
          <select
            value={daysRange}
            onChange={(e) => setDaysRange(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
        </div>
      </div>

      {/* ===== KPI Cards ===== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiMiniCard label="DAU Promedio" value={fmtNum(summary.avg_dau)} icon={UsersIcon} color="blue" />
        <KpiMiniCard label="WAU Promedio" value={fmtNum(summary.avg_wau)} icon={ChartBarIcon} color="indigo" />
        <KpiMiniCard label="MAU Promedio" value={fmtNum(summary.avg_mau)} icon={ArrowTrendingUpIcon} color="purple" />
        <KpiMiniCard label="Ret. Day 1" value={fmtPct(summary.d1_retention_avg)} icon={ArrowTrendingUpIcon} color="emerald" />
        <KpiMiniCard label="Ret. Day 7" value={fmtPct(summary.d7_retention_avg)} icon={ArrowTrendingUpIcon} color="amber" />
        <KpiMiniCard label="Ret. Day 30" value={fmtPct(summary.d30_retention_avg)} icon={ArrowTrendingUpIcon} color="rose" />
      </div>

      {/* ===== DAU/WAU/MAU Chart ===== */}
      {data.has_metrics && dailyMetrics.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-700 mb-4">Usuarios Activos (DAU / WAU / MAU)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyMetrics} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" stroke="#9CA3AF" fontSize={11} tickFormatter={formatShortDate} />
                <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(v: number) => fmtNum(v)} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as DailyMetric;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
                        <div className="font-semibold text-gray-800 mb-2">{label}</div>
                        <div className="space-y-1">
                          <div className="flex justify-between gap-4"><span className="text-blue-600">DAU</span><span className="font-medium">{fmtNum(row.dau)}</span></div>
                          <div className="flex justify-between gap-4 text-gray-400 text-[10px]"><span>Pagados</span><span>{fmtNum(row.dau_paid)}</span></div>
                          <div className="flex justify-between gap-4 text-gray-400 text-[10px]"><span>Gratuitos</span><span>{fmtNum(row.dau_free)}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-indigo-600">WAU</span><span className="font-medium">{fmtNum(row.wau)}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-purple-600">MAU</span><span className="font-medium">{fmtNum(row.mau)}</span></div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend verticalAlign="top" height={36} formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>} />
                <Bar dataKey="dau" fill="#3B82F6" name="DAU" barSize={8} radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="wau" stroke="#6366F1" strokeWidth={2} dot={false} name="WAU" />
                <Line type="monotone" dataKey="mau" stroke="#9333EA" strokeWidth={2} strokeDasharray="4 4" dot={false} name="MAU" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ===== DAU Pagados vs Gratuitos ===== */}
      {data.has_metrics && dailyMetrics.length > 0 && dailyMetrics.some(d => d.dau_paid > 0 || d.dau_free > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-700 mb-4">DAU: Pagados vs Gratuitos</h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyMetrics} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" stroke="#9CA3AF" fontSize={11} tickFormatter={formatShortDate} />
                <YAxis stroke="#9CA3AF" fontSize={12} />
                <Tooltip />
                <Area type="monotone" dataKey="dau_paid" stackId="1" fill="#10B981" stroke="#10B981" name="Pagados" fillOpacity={0.6} />
                <Area type="monotone" dataKey="dau_free" stackId="1" fill="#93C5FD" stroke="#3B82F6" name="Gratuitos" fillOpacity={0.4} />
                <Legend verticalAlign="top" height={36} formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ===== Weekly Retention Cohort Table (triangular) ===== */}
      {data.has_retention && retentionMatrix.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-700">Retencion por Cohorte Semanal</h3>
            <p className="text-xs text-gray-400 mt-0.5">% de usuarios que vuelven en semana N desde su registro</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Cohorte</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Usuarios</th>
                  {retentionMatrix[0]?.periods.map((_, i) => (
                    <th key={i} className="px-2 py-2 text-center whitespace-nowrap">S{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {retentionMatrix.map((row) => (
                  <tr key={row.date} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{formatShortDate(row.date)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmtNum(row.size)}</td>
                    {row.periods.map((pct, i) => (
                      <td key={i} className="px-1 py-1 text-center">
                        {pct !== null ? (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${retentionColor(pct)}`}>
                            {fmtPct(pct)}
                          </span>
                        ) : (
                          <span className="text-gray-200">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== Daily Retention Summary (key days) ===== */}
      {dailyRetentionAvg.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-700 mb-4">Retencion por Dias Clave (promedio)</h3>
          <div className="flex flex-wrap gap-4">
            {dailyRetentionAvg.map(({ day, label, avg }) => (
              <div key={day} className="flex-1 min-w-[120px] bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${avg >= 30 ? 'text-green-600' : avg >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                  {fmtPct(avg)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== No metrics yet ===== */}
      {!data.has_metrics && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <EyeIcon className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-amber-800">Datos de engagement pendientes</p>
          <p className="text-xs text-amber-600 mt-1">Se necesita el pipeline n8n <code className="bg-amber-100 px-1 rounded">GRW_Sync_Mixpanel_Metrics</code> para DAU/WAU/MAU.</p>
        </div>
      )}

      {/* ===== No retention yet ===== */}
      {!data.has_retention && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <EyeIcon className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-amber-800">Datos de retencion pendientes</p>
          <p className="text-xs text-amber-600 mt-1">Se necesita el pipeline n8n <code className="bg-amber-100 px-1 rounded">GRW_Sync_Mixpanel_Retention</code> para cohortes.</p>
        </div>
      )}
    </div>
  );
}

// ─── Mini KPI Card ──────────────────────────────────────────

function KpiMiniCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  };
  const iconColor = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-800">{value}</p>
    </div>
  );
}
