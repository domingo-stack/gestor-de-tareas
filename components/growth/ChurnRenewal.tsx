'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExclamationTriangleIcon, CalendarDaysIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { fmtNum, fmtPct } from './formatters';
import WeekSelector, { getCurrentWeekStart } from './WeekSelector';

interface GrowthUser {
  id: string;
  email: string;
  country: string;
  origin: string;
  created_date: string;
  last_login: string;
  subscription_start: string;
  subscription_end: string;
  plan_free: boolean;
  plan_paid: boolean;
  cancelled: boolean;
  plan_id: string;
  eventos_valor: number;
}

interface WeeklyChurnRow {
  weekLabel: string;
  weekStart: Date;
  startingUsers: number;
  newUsers: number;
  churnedUsers: number;
  churnRate: number;
  netUsers: number;
  growthRate: number;
}

interface RenewalRow {
  weekLabel: string;
  dueToRenew: number;
  renewed: number;
  renewalRate: number;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekLabel(d: Date): string {
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return `${d.getDate()}/${d.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`;
}

export default function ChurnRenewal() {
  const { supabase } = useAuth();
  const [users, setUsers] = useState<GrowthUser[]>([]);
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);

  useEffect(() => {
    if (!supabase) return;
    const fetchUsers = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('growth_users').select('*');
      if (!error && data && data.length > 0) {
        setUsers(data);
        setHasData(true);
      } else {
        setHasData(false);
      }
      setLoading(false);
    };
    fetchUsers();
  }, [supabase]);

  // Build 8 weeks of churn data ending at selected week
  const churnWeeks = useMemo(() => {
    if (!users.length) return [];

    const weeks: WeeklyChurnRow[] = [];
    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(weekStart);
      wStart.setDate(wStart.getDate() - i * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      wEnd.setHours(23, 59, 59, 999);

      // Starting users: paid users whose subscription was active at start of week
      const startingUsers = users.filter(u =>
        u.plan_paid &&
        new Date(u.subscription_start) <= wStart &&
        new Date(u.subscription_end) >= wStart &&
        !u.cancelled
      ).length;

      // New users: registered this week
      const newUsers = users.filter(u => {
        const created = new Date(u.created_date);
        return created >= wStart && created <= wEnd;
      }).length;

      // Churned: subscription ended this week AND cancelled or not renewed
      const churnedUsers = users.filter(u => {
        const subEnd = new Date(u.subscription_end);
        return subEnd >= wStart && subEnd <= wEnd && (u.cancelled || !u.plan_paid);
      }).length;

      const churnRate = startingUsers > 0 ? (churnedUsers / startingUsers) * 100 : 0;
      const netUsers = startingUsers + newUsers - churnedUsers;
      const growthRate = startingUsers > 0 ? ((netUsers - startingUsers) / startingUsers) * 100 : 0;

      weeks.push({
        weekLabel: formatWeekLabel(wStart),
        weekStart: wStart,
        startingUsers,
        newUsers,
        churnedUsers,
        churnRate,
        netUsers,
        growthRate,
      });
    }
    return weeks;
  }, [users, weekStart]);

  // Renewal data: same 8 weeks
  const renewalWeeks = useMemo(() => {
    if (!users.length) return [];

    const weeks: RenewalRow[] = [];
    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(weekStart);
      wStart.setDate(wStart.getDate() - i * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      wEnd.setHours(23, 59, 59, 999);

      // Due to renew: subscription_end falls in this week
      const dueToRenew = users.filter(u => {
        const subEnd = new Date(u.subscription_end);
        return u.plan_paid && subEnd >= wStart && subEnd <= wEnd;
      });

      // Renewed: among those, still paid and not cancelled
      const renewed = dueToRenew.filter(u => !u.cancelled && u.plan_paid);

      weeks.push({
        weekLabel: formatWeekLabel(wStart),
        dueToRenew: dueToRenew.length,
        renewed: renewed.length,
        renewalRate: dueToRenew.length > 0 ? (renewed.length / dueToRenew.length) * 100 : 0,
      });
    }
    return weeks;
  }, [users, weekStart]);

  // Upcoming renewals (next 7 days)
  const upcomingRenewals = useMemo(() => {
    if (!users.length) return [];
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    return users
      .filter(u => {
        if (!u.subscription_end || u.cancelled) return false;
        const subEnd = new Date(u.subscription_end);
        return subEnd >= now && subEnd <= nextWeek && u.plan_paid;
      })
      .sort((a, b) => new Date(a.subscription_end).getTime() - new Date(b.subscription_end).getTime());
  }, [users]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (!hasData) {
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
                {upcomingRenewals.map((u) => {
                  const daysLeft = Math.ceil((new Date(u.subscription_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${daysLeft <= 2 ? 'bg-red-100 text-red-700' : daysLeft <= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
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
