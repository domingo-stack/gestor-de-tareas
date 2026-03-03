'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExclamationTriangleIcon, CalendarDaysIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { fmtNum, fmtPct } from './formatters';
import WeekSelector, { getCurrentWeekStart } from './WeekSelector';

interface ChurnWeek {
  weekLabel: string;
  startingUsers: number;
  newUsers: number;
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
  churn_weeks?: ChurnWeek[];
  renewal_weeks?: RenewalWeek[];
  upcoming_renewals?: UpcomingRenewal[];
}

export default function ChurnRenewal() {
  const { supabase } = useAuth();
  const [data, setData] = useState<ChurnData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      const weekStr = weekStart.toISOString().split('T')[0];
      const { data: result, error } = await supabase.rpc('get_churn_renewal', { p_week_start: weekStr, p_weeks: 8 });
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

  return (
    <div className="space-y-8">
      {/* Header with week selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-800">Churn & Renovacion</h2>
        <WeekSelector weekStart={weekStart} onWeekChange={setWeekStart} />
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
                <th className="px-4 py-3 text-right">Usuarios Inicio</th>
                <th className="px-4 py-3 text-right">Nuevos</th>
                <th className="px-4 py-3 text-right">Churned</th>
                <th className="px-4 py-3 text-right">Churn Rate</th>
                <th className="px-4 py-3 text-right">Net Users</th>
                <th className="px-4 py-3 text-right">Growth Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {churnWeeks.map((w, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{w.weekLabel}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtNum(w.startingUsers)}</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-medium">+{fmtNum(w.newUsers)}</td>
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
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-amber-800 flex items-center gap-2">
              <CalendarDaysIcon className="w-5 h-5" />
              Renovaciones proximos 7 dias
            </h3>
            <span className="text-sm font-bold text-amber-700">{fmtNum(upcomingRenewals.length)} usuarios</span>
          </div>
        </div>
        {upcomingRenewals.length > 0 ? (
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
                {upcomingRenewals.map((u) => (
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
            No hay renovaciones pendientes en los proximos 7 dias
          </div>
        )}
      </div>
    </div>
  );
}
