'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExclamationTriangleIcon, CalendarDaysIcon, EnvelopeIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { fmtNum, fmtPct } from './formatters';
import WeekSelector, { getCurrentWeekStart, toDateStr } from './WeekSelector';

interface ChurnWeek {
  weekLabel: string;
  startingUsers: number;
  newPaid: number;
  renewed: number;
  churnedUsers: number;
  churnRate: number;
  netUsers: number;
  growthRate: number;
}

interface RenewalWeek {
  weekLabel: string;
  dueToRenew: number;
  renewed: number;
  renewalRate: number;
}

interface UpcomingRenewal {
  id: string;
  email: string;
  plan_id: string;
  country: string;
  subscription_end: string;
  days_left: number;
}

interface ChurnData {
  has_data: boolean;
  plan_options?: string[];
  churn_weeks?: ChurnWeek[];
  renewal_weeks?: RenewalWeek[];
  upcoming_renewals?: UpcomingRenewal[];
}

const UPCOMING_DAYS_OPTIONS = [7, 14, 21] as const;

export default function ChurnRenewal() {
  const { supabase } = useAuth();
  const [data, setData] = useState<ChurnData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);
  const [planFilter, setPlanFilter] = useState('all');
  const [upcomingDays, setUpcomingDays] = useState<number>(7);
  const [upcomingPlanFilter, setUpcomingPlanFilter] = useState('all');
  const [upcomingCountryFilter, setUpcomingCountryFilter] = useState('all');

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      const weekStr = toDateStr(weekStart);
      const { data: result, error } = await supabase.rpc('get_churn_renewal', {
        p_week_start: weekStr,
        p_weeks: 8,
        p_plan_filter: planFilter,
        p_upcoming_days: upcomingDays,
      });
      if (error) {
        console.error('RPC get_churn_renewal error:', error);
        setData({ has_data: false });
      } else if (result) {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        setData(parsed as ChurnData);
      } else {
        setData({ has_data: false });
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase, weekStart, planFilter, upcomingDays]);

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
            Este tab necesita datos de la tabla <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">growth_users</code> para calcular churn, renewal y proximas renovaciones.
            Configura el pipeline de Bubble Users en n8n para habilitar esta seccion.
          </p>
        </div>
      </div>
    );
  }

  const churnWeeks = data.churn_weeks || [];
  const renewalWeeks = data.renewal_weeks || [];
  const upcomingRenewals = data.upcoming_renewals || [];
  const planOptions = data.plan_options || [];

  // Opciones únicas para filtros de renovaciones próximas
  const upcomingPlanOptions = Array.from(new Set(upcomingRenewals.map(u => u.plan_id).filter(Boolean))).sort();
  const upcomingCountryOptions = Array.from(new Set(upcomingRenewals.map(u => u.country).filter(Boolean))).sort();

  const filteredUpcomingRenewals = upcomingRenewals.filter(u => {
    if (upcomingPlanFilter !== 'all' && u.plan_id !== upcomingPlanFilter) return false;
    if (upcomingCountryFilter !== 'all' && u.country !== upcomingCountryFilter) return false;
    return true;
  });

  const downloadCSV = () => {
    const rows = filteredUpcomingRenewals;
    if (rows.length === 0) return;
    const headers = ['Email', 'Plan', 'Pais', 'Vence', 'Dias restantes'];
    const csvRows = rows.map(u => [
      u.email || 'Sin email',
      u.plan_id || 'N/A',
      u.country || '-',
      u.subscription_end ? new Date(u.subscription_end).toLocaleDateString('es-ES') : '-',
      u.days_left.toString(),
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `renovaciones-proximas-${upcomingDays}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header with week selector and plan filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-800">Churn & Renovacion</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">Todos los planes</option>
            {planOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <WeekSelector weekStart={weekStart} onWeekChange={setWeekStart} />
        </div>
      </div>

      {/* Churn Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-700">Churn Semanal</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr>
                <th className="px-4 py-3 text-left">Semana</th>
                <th className="px-4 py-3 text-right">Pagados Inicio</th>
                <th className="px-4 py-3 text-right">Nuevos Pagados</th>
                <th className="px-4 py-3 text-right">Renovaron</th>
                <th className="px-4 py-3 text-right">Churned</th>
                <th className="px-4 py-3 text-right">Churn Rate</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-right">Growth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {churnWeeks.map((w, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{w.weekLabel}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtNum(w.startingUsers)}</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-medium">+{fmtNum(w.newPaid)}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">+{fmtNum(w.renewed)}</td>
                  <td className="px-4 py-3 text-right text-red-600 font-medium">{w.churnedUsers > 0 ? `-${fmtNum(w.churnedUsers)}` : '0'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.churnRate > 5 ? 'bg-red-50 text-red-700' : w.churnRate > 2 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                      {fmtPct(w.churnRate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtNum(w.netUsers)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xs font-medium ${w.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {w.growthRate >= 0 ? '+' : ''}{fmtPct(w.growthRate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Renewal Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-700">Tasa de Renovacion</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr>
                <th className="px-4 py-3 text-left">Semana</th>
                <th className="px-4 py-3 text-right">Debian Renovar</th>
                <th className="px-4 py-3 text-right">Renovaron</th>
                <th className="px-4 py-3 text-right">Renewal Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {renewalWeeks.map((w, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{w.weekLabel}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtNum(w.dueToRenew)}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">{fmtNum(w.renewed)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.renewalRate >= 80 ? 'bg-green-50 text-green-700' : w.renewalRate >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                      {fmtPct(w.renewalRate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upcoming Renewals */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-amber-50">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-semibold text-amber-800 flex items-center gap-2">
                <CalendarDaysIcon className="w-5 h-5" />
                Renovaciones proximas
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white border border-amber-200 rounded-lg overflow-hidden">
                  {UPCOMING_DAYS_OPTIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setUpcomingDays(d)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        upcomingDays === d
                          ? 'bg-amber-600 text-white'
                          : 'text-amber-700 hover:bg-amber-100'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
                <span className="text-sm font-bold text-amber-700">
                  {fmtNum(filteredUpcomingRenewals.length)}
                  {filteredUpcomingRenewals.length !== upcomingRenewals.length && (
                    <span className="font-normal text-amber-600"> de {fmtNum(upcomingRenewals.length)}</span>
                  )}
                  {' '}usuarios
                </span>
                {filteredUpcomingRenewals.length > 0 && (
                  <button
                    onClick={downloadCSV}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    CSV
                  </button>
                )}
              </div>
            </div>
            {/* Filtros de país y plan */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={upcomingCountryFilter}
                onChange={(e) => setUpcomingCountryFilter(e.target.value)}
                className="text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              >
                <option value="all">Todos los paises</option>
                {upcomingCountryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={upcomingPlanFilter}
                onChange={(e) => setUpcomingPlanFilter(e.target.value)}
                className="text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              >
                <option value="all">Todos los planes</option>
                {upcomingPlanOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {filteredUpcomingRenewals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-left">Pais</th>
                  <th className="px-4 py-3 text-left">Vence</th>
                  <th className="px-4 py-3 text-right">Dias restantes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUpcomingRenewals.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900 font-medium flex items-center gap-2">
                      <EnvelopeIcon className="w-4 h-4 text-gray-400" />
                      {u.email || 'Sin email'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {u.plan_id || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.country || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(u.subscription_end).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${u.days_left <= 2 ? 'bg-red-100 text-red-700' : u.days_left <= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                        {u.days_left} {u.days_left === 1 ? 'dia' : 'dias'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            {upcomingRenewals.length > 0
              ? 'No hay resultados con los filtros aplicados'
              : `No hay renovaciones pendientes en los proximos ${upcomingDays} dias`}
          </div>
        )}
      </div>
    </div>
  );
}
