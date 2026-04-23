'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  StarIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart, Bar, LineChart, Line, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import KpiCard from './KpiCard';
import { fmtNum, fmtPct } from './formatters';

interface BucketItem {
  bucket: string;
  count: number;
  pct: number;
}

interface TimeRange {
  range: string;
  count: number;
  pct: number;
}

interface WeeklyTrendItem {
  week: string;
  registered: number;
  new_activated: number;
  total_accumulated: number;
  activation_rate: number;
}

interface CohortItem {
  cohort_week: string;
  registered: number;
  w1_pct: number;
  w2_pct: number;
  w3_pct: number;
  w4_pct: number;
}

interface NsmData {
  distribution: BucketItem[];
  time_to_activation: {
    median_days: number;
    avg_days: number;
    total_activated: number;
    distribution: TimeRange[];
  };
  weekly_trend: WeeklyTrendItem[];
  cohort_activation: CohortItem[];
  summary: {
    total_users: number;
    total_7plus: number;
    pct_7plus: number;
    nsm_this_week: number;
    nsm_prev_week: number;
    nsm_growth_pct: number;
  };
}

const BUCKET_COLORS: Record<string, string> = {
  '0 eventos': '#EF4444',
  '1-2': '#F97316',
  '3-4': '#F59E0B',
  '5-6': '#EAB308',
  '7-9 (NSM+)': '#22C55E',
  '10-14': '#16A34A',
  '15+': '#15803D',
};

function cohortColor(pct: number): string {
  if (pct >= 15) return 'bg-green-600 text-white';
  if (pct >= 10) return 'bg-green-400 text-white';
  if (pct >= 5) return 'bg-green-200 text-green-900';
  if (pct >= 2) return 'bg-yellow-100 text-yellow-800';
  if (pct > 0) return 'bg-red-50 text-red-700';
  return 'bg-gray-50 text-gray-400';
}

export default function NsmAnalysis() {
  const { supabase } = useAuth();
  const [data, setData] = useState<NsmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countryFilter, setCountryFilter] = useState('all');
  const [period, setPeriod] = useState('all');
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [trendSeries, setTrendSeries] = useState<Set<string>>(new Set(['new_activated', 'total_accumulated', 'activation_rate']));

  useEffect(() => {
    if (!supabase) return;
    // Fetch country options once
    supabase.from('growth_users').select('country').not('country', 'is', null)
      .then(({ data: rows }) => {
        if (rows) {
          const counts: Record<string, number> = {};
          rows.forEach((r: { country: string }) => { counts[r.country] = (counts[r.country] || 0) + 1; });
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([c]) => c);
          setCountryOptions(sorted);
        }
      });
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: result, error } = await supabase.rpc('get_nsm_analysis', {
          p_country_filter: countryFilter === 'all' ? null : countryFilter,
          p_registration_period: period,
        });
        if (error) {
          console.error('RPC get_nsm_analysis error:', error);
        } else if (result) {
          setData(typeof result === 'string' ? JSON.parse(result) : result);
        }
      } catch (err) {
        console.error('Error fetching NSM analysis:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [supabase, countryFilter, period]);

  const s = data?.summary || { total_users: 0, total_7plus: 0, pct_7plus: 0, nsm_this_week: 0, nsm_prev_week: 0, nsm_growth_pct: 0 };

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <StarIcon className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-800">North Star Metric: Activados 7+</h2>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Usuarios que alcanzaron 7+ eventos de valor</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white">
            <option value="all">Todos los países</option>
            {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white">
            <option value="all">Todo el tiempo</option>
            <option value="30d">Últimos 30 días</option>
            <option value="90d">Últimos 90 días</option>
            <option value="180d">Últimos 180 días</option>
          </select>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Activados 7+" value={fmtNum(s.total_7plus)} subtext={`${fmtPct(s.pct_7plus)} de la base`}
          icon={StarIcon} colorClass="bg-green-600" loading={loading} />
        <KpiCard title="NSM esta semana" value={fmtNum(s.nsm_this_week)}
          growth={s.nsm_prev_week > 0 ? { percent: Math.abs(s.nsm_growth_pct), isPositive: s.nsm_growth_pct >= 0 } : undefined}
          icon={ArrowTrendingUpIcon} colorClass="bg-green-500" loading={loading} />
        <KpiCard title="Tiempo a activación" value={`${data?.time_to_activation?.median_days ?? '—'}d`}
          subtext="Mediana (proxy: último login)" icon={ClockIcon} colorClass="bg-blue-500" loading={loading} />
        <KpiCard title="Base total" value={fmtNum(s.total_users)}
          subtext={`${fmtNum(s.total_users - s.total_7plus)} sin activar`}
          icon={UsersIcon} colorClass="bg-gray-500" loading={loading} />
      </div>

      {/* NSM Highlight Banner */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center">
            <StarIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-900">North Star: {fmtPct(s.pct_7plus)} de usuarios con 7+ eventos</p>
            <p className="text-xs text-green-700">{fmtNum(s.total_7plus)} activados de {fmtNum(s.total_users)} totales. Meta: llegar a 15-20%.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-green-700">{fmtNum(s.nsm_this_week)}</p>
          <p className="text-xs text-green-600">nuevos esta semana</p>
        </div>
      </div>

      {/* Distribution */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-700 mb-4">Distribución por eventos de valor</h3>
        <div className="h-64">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400">Cargando...</div>
          ) : data?.distribution && data.distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution} layout="vertical" margin={{ left: 80, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" tickFormatter={(v: number) => fmtNum(v)} fontSize={11} />
                <YAxis dataKey="bucket" type="category" fontSize={12} width={80} />
                <Tooltip formatter={(v: number, _: string, props: { payload: BucketItem }) =>
                  [`${fmtNum(v)} (${fmtPct(props.payload.pct)})`, 'Usuarios']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}
                  fill="#3B82F6"
                  label={{ position: 'right', fontSize: 11, formatter: (v: number) => fmtNum(v) }}
                >
                  {data.distribution.map((entry, idx) => (
                    <rect key={idx} fill={BUCKET_COLORS[entry.bucket] || '#6B7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Sin datos</div>
          )}
        </div>
      </div>

      {/* Time to Activation */}
      {data?.time_to_activation?.distribution && data.time_to_activation.distribution.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-700 mb-1">Tiempo a activación (7+ eventos)</h3>
          <p className="text-xs text-gray-400 mb-4">Proxy: días entre registro y último login. Mediana: {data.time_to_activation.median_days} días, Promedio: {data.time_to_activation.avg_days} días</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.time_to_activation.distribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="range" fontSize={11} />
                <YAxis tickFormatter={(v: number) => fmtNum(v)} fontSize={11} />
                <Tooltip formatter={(v: number, _: string, props: { payload: TimeRange }) =>
                  [`${fmtNum(v)} (${fmtPct(props.payload.pct)})`, 'Usuarios']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Weekly Trend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">Tendencia NSM semanal (12 semanas)</h3>
          <div className="flex gap-2">
            {[
              { key: 'new_activated', label: 'Nuevos 7+', color: '#22C55E' },
              { key: 'total_accumulated', label: 'Acumulado', color: '#3B82F6' },
              { key: 'activation_rate', label: 'Tasa %', color: '#F59E0B' },
            ].map(({ key, label, color }) => {
              const active = trendSeries.has(key);
              return (
                <button
                  key={key}
                  onClick={() => setTrendSeries(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  })}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                    active ? 'border-transparent text-white' : 'border-gray-200 text-gray-500 bg-white hover:bg-gray-50'
                  }`}
                  style={active ? { backgroundColor: color } : {}}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color, opacity: active ? 1 : 0.4 }} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="h-72">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400">Cargando...</div>
          ) : data?.weekly_trend && data.weekly_trend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.weekly_trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="week" fontSize={11} />
                <YAxis yAxisId="left" fontSize={11} tickFormatter={(v: number) => fmtNum(v)} />
                {trendSeries.has('total_accumulated') && (
                  <YAxis yAxisId="right" orientation="right" fontSize={11} tickFormatter={(v: number) => fmtNum(v)} />
                )}
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                {trendSeries.has('new_activated') && (
                  <Bar yAxisId="left" dataKey="new_activated" fill="#22C55E" barSize={20} radius={[4, 4, 0, 0]} name="Nuevos 7+ (semana)" />
                )}
                {trendSeries.has('total_accumulated') && (
                  <Line yAxisId="right" type="monotone" dataKey="total_accumulated" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} name="Total acumulado 7+" />
                )}
                {trendSeries.has('activation_rate') && (
                  <Area yAxisId={trendSeries.has('total_accumulated') ? 'left' : 'left'} type="monotone" dataKey="activation_rate" fill="#F59E0B22" stroke="#F59E0B" strokeWidth={1.5} name="Tasa activación (%)" />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Sin datos</div>
          )}
        </div>
      </div>

      {/* Cohort Activation Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 pb-3">
          <h3 className="font-semibold text-gray-700">Tasa de activación por cohorte</h3>
          <p className="text-xs text-gray-400 mt-1">% de cada cohorte semanal que alcanzó 7+ eventos en las semanas siguientes</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Cohorte</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Registrados</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Sem 1</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Sem 2</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Sem 3</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Sem 4</th>
              </tr>
            </thead>
            <tbody>
              {data?.cohort_activation?.map((row, idx) => (
                <tr key={row.cohort_week} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{row.cohort_week}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{fmtNum(row.registered)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cohortColor(row.w1_pct)}`}>
                      {fmtPct(row.w1_pct)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cohortColor(row.w2_pct)}`}>
                      {fmtPct(row.w2_pct)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cohortColor(row.w3_pct)}`}>
                      {fmtPct(row.w3_pct)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cohortColor(row.w4_pct)}`}>
                      {fmtPct(row.w4_pct)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
