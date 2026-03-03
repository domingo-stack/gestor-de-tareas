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
  EyeIcon,
} from '@heroicons/react/24/outline';
import KpiCard from './KpiCard';
import WeekSelector, { getCurrentWeekStart } from './WeekSelector';
import { fmtUSD, fmtNum, fmtPct } from './formatters';

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
}

export default function ExecutiveSummary() {
  const { supabase } = useAuth();
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummaryData | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const weekStr = weekStart.toISOString().split('T')[0];
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

  const d = data || {
    revenue: 0, prev_revenue: 0, rev_growth_pct: 0, rev_growth_positive: true,
    revenue_new: 0, revenue_recurring: 0, transactions: 0, arpu: 0,
    total_users: 0, new_users: 0, paid_users: 0, activated_users: 0,
    activation_pct: 0, conversion_pct: 0, has_growth_users: false,
  };

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
          <KpiCard title="Revenue Total" value={fmtUSD(d.revenue)} growth={{ percent: Math.abs(d.rev_growth_pct), isPositive: d.rev_growth_positive }} icon={BanknotesIcon} colorClass="bg-green-500" loading={loading} />
          <KpiCard title="Revenue Nuevo" value={fmtUSD(d.revenue_new)} subtext="Clientes nuevos" icon={UserPlusIcon} colorClass="bg-blue-500" loading={loading} />
          <KpiCard title="Revenue Recurrente" value={fmtUSD(d.revenue_recurring)} subtext="Renovaciones" icon={ArrowPathIcon} colorClass="bg-emerald-500" loading={loading} />
          <KpiCard title="ARPU" value={fmtUSD(d.arpu)} subtext="Promedio por usuario" icon={CurrencyDollarIcon} colorClass="bg-purple-500" loading={loading} />
        </div>
      </div>

      {/* Users KPIs (from growth_users) */}
      {d.has_growth_users ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Usuarios</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Nuevos Registros" value={fmtNum(d.new_users)} subtext="Esta semana" icon={UserPlusIcon} colorClass="bg-blue-500" loading={loading} />
            <KpiCard title="Total Registrados" value={fmtNum(d.total_users)} subtext="Acumulado" icon={UsersIcon} colorClass="bg-gray-500" loading={loading} />
            <KpiCard title="% Activacion" value={fmtPct(d.activation_pct)} subtext="1+ evento de valor" icon={ArrowTrendingUpIcon} colorClass="bg-amber-500" loading={loading} />
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

      {/* Mixpanel placeholder */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <EyeIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-600">Metricas de comportamiento (Mixpanel)</p>
        <p className="text-xs text-gray-400 mt-1">DAU, WAU, MAU y Paywall Views estaran disponibles cuando se configure el pipeline de Mixpanel.</p>
      </div>
    </div>
  );
}
