'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  UsersIcon,
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ChartBarIcon,
  UserPlusIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
  GlobeAltIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import KpiCard from './KpiCard';
import WeekSelector, { getCurrentWeekStart, toDateStr } from './WeekSelector';
import { fmtUSD, fmtNum, fmtPct } from './formatters';

interface WeeklyTrend {
  weekLabel: string;
  registrations: number;
  revenue_new: number;
  revenue_renewal: number;
  tx_new: number;
  tx_renewal: number;
}

interface CountryRegistration {
  country: string;
  registrations: number;
  paid: number;
  conversion_pct: number;
}

interface SummaryData {
  revenue: number;
  prev_revenue: number;
  rev_growth_pct: number;
  rev_growth_positive: boolean;
  revenue_new: number;
  revenue_recurring: number;
  transactions: number;
  arpu: number;
  total_users: number;
  new_users: number;
  paid_users: number;
  activated_users: number;
  activation_pct: number;
  conversion_pct: number;
  has_growth_users: boolean;
  nsm_activated_week: number;
  nsm_total: number;
  nsm_prev_total: number;
  weekly_trend: WeeklyTrend[];
  country_registrations: CountryRegistration[];
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload || !payload.length) return null;
  const revNew = payload.find(p => p.name === 'Rev. Nuevo');
  const revRenew = payload.find(p => p.name === 'Rev. Renovacion');
  const regs = payload.find(p => p.name === 'Registros');

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {revNew && (
        <p className="text-blue-600">Rev. Nuevo: {fmtUSD(revNew.value)}</p>
      )}
      {revRenew && (
        <p className="text-emerald-600">Rev. Renovacion: {fmtUSD(revRenew.value)}</p>
      )}
      {(revNew || revRenew) && (
        <p className="text-gray-500 text-xs mt-1">Total: {fmtUSD((revNew?.value || 0) + (revRenew?.value || 0))}</p>
      )}
      {regs && (
        <p className="text-amber-600 mt-1">Registros: {fmtNum(regs.value)}</p>
      )}
    </div>
  );
}

function conversionColor(pct: number): string {
  if (pct >= 10) return 'text-green-600';
  if (pct >= 5) return 'text-amber-600';
  return 'text-red-600';
}

export default function ExecutiveSummary() {
  const { supabase } = useAuth();
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummaryData | null>(null);
  const [nsmDirect, setNsmDirect] = useState<{ total: number; weekNew: number; prevWeekNew: number }>({ total: 0, weekNew: 0, prevWeekNew: 0 });
  const [syncStatus, setSyncStatus] = useState<{ users: { date: string; count: number } | null; payments: { date: string; count: number } | null }>({ users: null, payments: null });

  useEffect(() => {
    if (!supabase) return;
    supabase.from('sync_logs').select('*').eq('source', 'users_platform').order('created_at', { ascending: false }).limit(1).single()
      .then(({ data }) => {
        if (data) setSyncStatus(prev => ({ ...prev, users: { date: data.created_at, count: data.records_processed } }));
      });
    supabase.from('sync_logs').select('*').eq('source', 'payments_platform').order('created_at', { ascending: false }).limit(1).single()
      .then(({ data }) => {
        if (data) setSyncStatus(prev => ({ ...prev, payments: { date: data.created_at, count: data.records_processed } }));
      });
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const weekStr = toDateStr(weekStart);
        const { data: result, error } = await supabase.rpc('get_executive_summary', { p_week_start: weekStr });
        if (error) {
          console.error('RPC get_executive_summary error:', error);
        } else if (result) {
          const parsed = typeof result === 'string' ? JSON.parse(result) : result;
          setData(parsed as SummaryData);
        }
      } catch (err) {
        console.error('Error fetching executive summary:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [supabase, weekStart]);

  // NSM: traer dato directo de growth_users (no depende del RPC)
  useEffect(() => {
    if (!supabase) return;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(prevWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);

    Promise.all([
      supabase.from('growth_users').select('id', { count: 'exact', head: true })
        .gte('eventos_valor', 7),
      supabase.from('growth_users').select('id', { count: 'exact', head: true })
        .gte('eventos_valor', 7)
        .gte('created_date', toDateStr(weekStart))
        .lte('created_date', toDateStr(weekEnd)),
      supabase.from('growth_users').select('id', { count: 'exact', head: true })
        .gte('eventos_valor', 7)
        .gte('created_date', toDateStr(prevWeekStart))
        .lte('created_date', toDateStr(prevWeekEnd)),
    ]).then(([totalRes, weekRes, prevWeekRes]) => {
      setNsmDirect({
        total: totalRes.count || 0,
        weekNew: weekRes.count || 0,
        prevWeekNew: prevWeekRes.count || 0,
      });
    });
  }, [supabase, weekStart]);

  const d = data || {
    revenue: 0, prev_revenue: 0, rev_growth_pct: 0, rev_growth_positive: true,
    revenue_new: 0, revenue_recurring: 0, transactions: 0, arpu: 0,
    total_users: 0, new_users: 0, paid_users: 0, activated_users: 0,
    activation_pct: 0, conversion_pct: 0, has_growth_users: false,
    nsm_activated_week: 0, nsm_total: 0, nsm_prev_total: 0,
    weekly_trend: [], country_registrations: [],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-800">Resumen Semanal</h2>
          {syncStatus.users && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-full text-[11px] text-blue-700">
              <ArrowPathIcon className="w-3 h-3 text-blue-500" />
              <span className="font-medium">Usuarios: {new Date(syncStatus.users.date).toLocaleDateString()} {new Date(syncStatus.users.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="w-1 h-1 rounded-full bg-blue-300"></span>
              <span>+{fmtNum(syncStatus.users.count)}</span>
            </div>
          )}
          {syncStatus.payments && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-[11px] text-emerald-700">
              <ArrowPathIcon className="w-3 h-3 text-emerald-500" />
              <span className="font-medium">Pagos: {new Date(syncStatus.payments.date).toLocaleDateString()} {new Date(syncStatus.payments.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="w-1 h-1 rounded-full bg-emerald-300"></span>
              <span>+{fmtNum(syncStatus.payments.count)}</span>
            </div>
          )}
        </div>
        <WeekSelector weekStart={weekStart} onWeekChange={setWeekStart} />
      </div>

      {/* Revenue KPIs */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Revenue</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Revenue Total" value={fmtUSD(d.revenue)} growth={{ percent: Math.abs(d.rev_growth_pct), isPositive: d.rev_growth_positive }} icon={BanknotesIcon} colorClass="bg-green-500" loading={loading} />
          <KpiCard title="Revenue Nuevo" value={fmtUSD(d.revenue_new)} subtext="Clientes nuevos" icon={UserPlusIcon} colorClass="bg-blue-500" loading={loading} />
          <KpiCard title="Revenue Recurrente" value={fmtUSD(d.revenue_recurring)} subtext="Renovaciones" icon={ArrowPathIcon} colorClass="bg-emerald-500" loading={loading} />
          <KpiCard title="ARPU" value={fmtUSD(d.arpu)} subtext="Promedio por usuario" icon={CurrencyDollarIcon} colorClass="bg-purple-500" loading={loading} />
        </div>
      </div>

      {/* Users KPIs + NSM Highlight */}
      {d.has_growth_users ? (
        <div className="space-y-4">
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Usuarios</h3>
            <span className="text-sm text-gray-400">{fmtNum(d.total_users)} registrados</span>
          </div>

          {/* NSM Hero Card */}
          <div className="relative overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-green-600/20">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <StarIcon className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">North Star Metric — Activados 7+ esta semana</p>
                  <div className="flex items-baseline gap-3 mt-0.5">
                    <p className="text-4xl font-bold">+{fmtNum(nsmDirect.weekNew)}</p>
                    {nsmDirect.prevWeekNew > 0 && (() => {
                      const pct = Math.round(((nsmDirect.weekNew - nsmDirect.prevWeekNew) / nsmDirect.prevWeekNew) * 100 * 10) / 10;
                      return (
                        <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${pct >= 0 ? 'bg-green-400/30 text-green-100' : 'bg-red-400/30 text-red-200'}`}>
                          {pct >= 0 ? '+' : ''}{pct}% vs sem. ant.
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-white/70">Total acumulado</p>
                  <p className="text-lg font-semibold">{fmtNum(nsmDirect.total)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/70">% de la base</p>
                  <p className="text-lg font-semibold">{nsmDirect.total > 0 ? fmtPct((nsmDirect.total / (d.total_users || 1)) * 100) : '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Regular KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard title="Nuevos Registros" value={fmtNum(d.new_users)} subtext="Esta semana" icon={UserPlusIcon} colorClass="bg-blue-500" loading={loading} />
            <KpiCard title="% Activacion (7+)" value={fmtPct(d.activation_pct)} subtext="7+ eventos de valor (NSM)" icon={ArrowTrendingUpIcon} colorClass="bg-amber-500" loading={loading} />
            <KpiCard title="% Conversion" value={fmtPct(d.conversion_pct)} subtext="Registrados que pagaron" icon={ChartBarIcon} colorClass="bg-red-500" loading={loading} />
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <UsersIcon className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-amber-800">Datos de usuarios pendientes</p>
          <p className="text-xs text-amber-600 mt-1">Se necesita sincronizar la tabla <code className="bg-amber-100 px-1 rounded">growth_users</code> desde Bubble para mostrar KPIs de usuarios, activacion y conversion.</p>
        </div>
      )}

      {/* Weekly Trend Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-700 mb-6">Tendencia Semanal</h3>
        <div className="h-72 w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400">Cargando...</div>
          ) : d.weekly_trend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.weekly_trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="weekLabel" stroke="#9CA3AF" fontSize={11} />
                <YAxis
                  yAxisId="left"
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={(val: number) => `$${fmtNum(val)}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#F59E0B"
                  fontSize={12}
                  tickFormatter={(val: number) => fmtNum(val)}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ fill: '#F3F4F6' }} />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
                />
                <Bar yAxisId="left" dataKey="revenue_new" stackId="rev" fill="#3B82F6" barSize={28} name="Rev. Nuevo" />
                <Bar yAxisId="left" dataKey="revenue_renewal" stackId="rev" fill="#10B981" radius={[4, 4, 0, 0]} barSize={28} name="Rev. Renovacion" />
                <Line yAxisId="right" type="monotone" dataKey="registrations" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 4, fill: '#F59E0B' }} name="Registros" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Sin datos de tendencia</div>
          )}
        </div>
      </div>

      {/* Country Registrations Table */}
      {d.has_growth_users && d.country_registrations.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 pb-3 flex items-center gap-2">
            <GlobeAltIcon className="w-5 h-5 text-gray-400" />
            <h3 className="font-semibold text-gray-700">Registros por Pais esta semana</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Pais</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Registros</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Pagaron</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Conv %</th>
                </tr>
              </thead>
              <tbody>
                {d.country_registrations.map((row, idx) => (
                  <tr key={row.country} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-6 py-2.5 text-gray-800 font-medium">{row.country}</td>
                    <td className="px-6 py-2.5 text-right text-gray-700">{fmtNum(row.registrations)}</td>
                    <td className="px-6 py-2.5 text-right text-gray-700">{fmtNum(row.paid)}</td>
                    <td className={`px-6 py-2.5 text-right font-semibold ${conversionColor(row.conversion_pct)}`}>
                      {fmtPct(row.conversion_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mixpanel — se muestra en tab Comportamiento */}
    </div>
  );
}
