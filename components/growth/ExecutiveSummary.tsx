'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  UsersIcon,
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ChartBarIcon,
  UserPlusIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import KpiCard from './KpiCard';
import WeekSelector, { getCurrentWeekStart } from './WeekSelector';
import { fmtUSD, fmtNum, fmtPct } from './formatters';

export default function ExecutiveSummary() {
  const { supabase } = useAuth();
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [prevWeekRevenue, setPrevWeekRevenue] = useState<any[]>([]);
  const [growthUsers, setGrowthUsers] = useState<any[]>([]);
  const [hasGrowthUsers, setHasGrowthUsers] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const prevStart = new Date(weekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(weekStart);
    prevEnd.setMilliseconds(-1);

    const fetchData = async () => {
      setLoading(true);
      try {
        const [revRes, prevRevRes, usersRes] = await Promise.all([
          supabase.from('rev_orders').select('amount_usd, plan_type, client_type, created_at').gte('created_at', weekStart.toISOString()).lte('created_at', weekEnd.toISOString()),
          supabase.from('rev_orders').select('amount_usd').gte('created_at', prevStart.toISOString()).lte('created_at', prevEnd.toISOString()),
          supabase.from('growth_users').select('*').limit(1),
        ]);

        setRevenueData(revRes.data || []);
        setPrevWeekRevenue(prevRevRes.data || []);
        setHasGrowthUsers(!usersRes.error && (usersRes.data?.length || 0) > 0);

        if (!usersRes.error && (usersRes.data?.length || 0) > 0) {
          const { data: allUsers } = await supabase.from('growth_users').select('*');
          setGrowthUsers(allUsers || []);
        }
      } catch (err) {
        console.error('Error fetching executive summary:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [supabase, weekStart]);

  const kpis = useMemo(() => {
    const totalRev = revenueData.reduce((s, o) => s + (o.amount_usd || 0), 0);
    const prevRev = prevWeekRevenue.reduce((s, o) => s + (o.amount_usd || 0), 0);
    const revGrowth = prevRev > 0 ? ((totalRev - prevRev) / prevRev) * 100 : totalRev > 0 ? 100 : 0;

    const newOrders = revenueData.filter(o => (o.client_type || o.plan_type || '').toLowerCase().includes('nuevo'));
    const renewOrders = revenueData.filter(o => (o.client_type || o.plan_type || '').toLowerCase().includes('renova'));

    // Growth users KPIs (only if data exists)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekUsers = growthUsers.filter(u => {
      const created = new Date(u.created_date);
      return created >= weekStart && created <= weekEnd;
    });
    const activatedUsers = growthUsers.filter(u => (u.eventos_valor || 0) >= 1);
    const paidUsers = growthUsers.filter(u => u.plan_paid);
    const totalUsers = growthUsers.length;

    return {
      revenue: totalRev,
      revGrowth: { percent: Math.abs(revGrowth), isPositive: revGrowth >= 0 },
      transactions: revenueData.length,
      revenueNew: newOrders.reduce((s, o) => s + (o.amount_usd || 0), 0),
      revenueRecurring: renewOrders.reduce((s, o) => s + (o.amount_usd || 0), 0),
      arpu: paidUsers.length > 0 ? totalRev / paidUsers.length : revenueData.length > 0 ? totalRev / revenueData.length : 0,
      newUsers: weekUsers.length,
      totalUsers,
      activationPct: totalUsers > 0 ? (activatedUsers.length / totalUsers * 100) : 0,
      conversionPct: totalUsers > 0 ? (paidUsers.length / totalUsers * 100) : 0,
      paidUsers: paidUsers.length,
    };
  }, [revenueData, prevWeekRevenue, growthUsers, weekStart]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-800">Resumen Semanal</h2>
        <WeekSelector weekStart={weekStart} onWeekChange={setWeekStart} />
      </div>

      {/* Revenue KPIs (always available) */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Revenue</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Revenue Total" value={fmtUSD(kpis.revenue)} growth={kpis.revGrowth} icon={BanknotesIcon} colorClass="bg-green-500" loading={loading} />
          <KpiCard title="Revenue Nuevo" value={fmtUSD(kpis.revenueNew)} subtext="Clientes nuevos" icon={UserPlusIcon} colorClass="bg-blue-500" loading={loading} />
          <KpiCard title="Revenue Recurrente" value={fmtUSD(kpis.revenueRecurring)} subtext="Renovaciones" icon={ArrowPathIcon} colorClass="bg-emerald-500" loading={loading} />
          <KpiCard title="ARPU" value={fmtUSD(kpis.arpu)} subtext="Promedio por usuario" icon={CurrencyDollarIcon} colorClass="bg-purple-500" loading={loading} />
        </div>
      </div>

      {/* Users KPIs (from growth_users) */}
      {hasGrowthUsers ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Usuarios</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Nuevos Registros" value={fmtNum(kpis.newUsers)} subtext="Esta semana" icon={UserPlusIcon} colorClass="bg-blue-500" loading={loading} />
            <KpiCard title="Total Registrados" value={fmtNum(kpis.totalUsers)} subtext="Acumulado" icon={UsersIcon} colorClass="bg-gray-500" loading={loading} />
            <KpiCard title="% Activacion" value={fmtPct(kpis.activationPct)} subtext="1+ evento de valor" icon={ArrowTrendingUpIcon} colorClass="bg-amber-500" loading={loading} />
            <KpiCard title="% Conversion" value={fmtPct(kpis.conversionPct)} subtext="Registrados que pagaron" icon={ChartBarIcon} colorClass="bg-red-500" loading={loading} />
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <UsersIcon className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-amber-800">Datos de usuarios pendientes</p>
          <p className="text-xs text-amber-600 mt-1">Se necesita sincronizar la tabla <code className="bg-amber-100 px-1 rounded">growth_users</code> desde Bubble para mostrar KPIs de usuarios, activacion y conversion.</p>
        </div>
      )}

      {/* Mixpanel placeholder */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <EyeIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-600">Metricas de comportamiento (Mixpanel)</p>
        <p className="text-xs text-gray-400 mt-1">DAU, WAU, MAU y Paywall Views estaran disponibles cuando se configure el pipeline de Mixpanel.</p>
      </div>
    </div>
  );
}
