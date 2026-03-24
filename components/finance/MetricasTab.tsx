'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { Account, Transaction, MonthlyMetric } from '@/lib/finance-types';
import { EXCHANGE_RATES } from '@/lib/finance-types';
import KpiCard from '@/components/growth/KpiCard';
import CacEvolutionChart from '@/components/CacEvolutionChart';
import {
  BanknotesIcon,
  FireIcon,
  ClockIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ShoppingCartIcon,
} from '@heroicons/react/24/outline';

interface MetricasTabProps {
  accounts: Account[];
  allTransactions: Transaction[];
  filteredTransactions: Transaction[];
  dateRangeISO: { start: string; end: string };
  monthlyMetrics: MonthlyMetric[];
}

interface RevenueByMonth {
  month: string;
  nuevo: number;
  renovacion: number;
  total: number;
}

interface AutoCustomers {
  month: string;
  count: number;
}

const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtUSD2 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(n);

export default function MetricasTab({ accounts, allTransactions, filteredTransactions, dateRangeISO, monthlyMetrics }: MetricasTabProps) {
  const { supabase } = useAuth();

  // Revenue from rev_orders
  const [revenueByMonth, setRevenueByMonth] = useState<RevenueByMonth[]>([]);
  const [revLoading, setRevLoading] = useState(true);

  // New customers from rev_orders (first payment per unique customer)
  const [autoCustomers, setAutoCustomers] = useState<AutoCustomers[]>([]);
  const [allAutoCustomers, setAllAutoCustomers] = useState<AutoCustomers[]>([]);
  const [custLoading, setCustLoading] = useState(true);

  // Fetch rev_orders
  useEffect(() => {
    if (!supabase) return;

    const fetchRevenue = async () => {
      setRevLoading(true);
      const { data } = await supabase
        .from('rev_orders')
        .select('amount_usd, client_type, created_at')
        .gte('created_at', `${dateRangeISO.start}T00:00:00`)
        .lte('created_at', `${dateRangeISO.end}T23:59:59`);

      if (data && data.length > 0) {
        const byMonth = new Map<string, { nuevo: number; renovacion: number }>();
        for (const row of data) {
          const month = row.created_at.substring(0, 7);
          const existing = byMonth.get(month) || { nuevo: 0, renovacion: 0 };
          const amount = Number(row.amount_usd) || 0;
          const clientType = (row.client_type || '').toLowerCase();
          if (clientType.includes('nuevo')) existing.nuevo += amount;
          else existing.renovacion += amount;
          byMonth.set(month, existing);
        }
        const result: RevenueByMonth[] = Array.from(byMonth.entries())
          .map(([month, v]) => ({ month, nuevo: v.nuevo, renovacion: v.renovacion, total: v.nuevo + v.renovacion }))
          .sort((a, b) => a.month.localeCompare(b.month));
        setRevenueByMonth(result);
      } else {
        setRevenueByMonth([]);
      }
      setRevLoading(false);
    };

    fetchRevenue();
  }, [supabase, dateRangeISO.start, dateRangeISO.end]);

  // Fetch new unique paying customers from rev_orders (first payment per customer)
  useEffect(() => {
    if (!supabase) return;

    const fetchCustomers = async () => {
      setCustLoading(true);
      // Fetch all rev_orders to compute first payment per unique customer
      const { data } = await supabase
        .from('rev_orders')
        .select('user_bubble_id, created_at');

      if (data && data.length > 0) {
        // Find first payment date per unique customer
        const firstPayment = new Map<string, string>();
        for (const row of data) {
          const uid = row.user_bubble_id;
          if (!uid) continue;
          const existing = firstPayment.get(uid);
          if (!existing || row.created_at < existing) {
            firstPayment.set(uid, row.created_at);
          }
        }

        // Group ALL first payments by month (for chart, unfiltered)
        const allByMonth = new Map<string, number>();
        // Filter by date range and group by month (for KPI cards)
        const filteredByMonth = new Map<string, number>();

        for (const [, firstDate] of firstPayment) {
          const month = firstDate.substring(0, 7);
          allByMonth.set(month, (allByMonth.get(month) || 0) + 1);

          const dateStr = firstDate.substring(0, 10);
          if (dateStr >= dateRangeISO.start && dateStr <= dateRangeISO.end) {
            filteredByMonth.set(month, (filteredByMonth.get(month) || 0) + 1);
          }
        }

        const toArray = (map: Map<string, number>) =>
          Array.from(map.entries())
            .map(([month, count]) => ({ month, count }))
            .sort((a, b) => a.month.localeCompare(b.month));

        setAutoCustomers(toArray(filteredByMonth));
        setAllAutoCustomers(toArray(allByMonth));
      } else {
        setAutoCustomers([]);
        setAllAutoCustomers([]);
      }
      setCustLoading(false);
    };

    fetchCustomers();
  }, [supabase, dateRangeISO.start, dateRangeISO.end]);

  // Runway calculation
  const { runway, monthlyBurn, totalCash } = useMemo(() => {
    const cash = accounts.reduce((acc, curr) => {
      const rate = EXCHANGE_RATES[curr.currency] || 1;
      const val = Number(curr.balance) / rate;
      return acc + (val || 0);
    }, 0);

    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);

    const fixedExpenses = allTransactions.filter((t) => {
      if (!t.is_fixed_expense) return false;
      if (t.fin_categories?.type !== 'expense') return false;
      const d = new Date(t.transaction_date);
      return d >= threeMonthsAgo && d <= now;
    });

    const totalFixed = fixedExpenses.reduce((s, t) => s + Math.abs(Number(t.amount_usd)), 0);
    const monthsInRange = new Set(fixedExpenses.map((t) => t.transaction_date.substring(0, 7))).size || 1;
    const burn = totalFixed / monthsInRange;
    const runwayMonths = burn > 0 ? cash / burn : 999;

    return { runway: runwayMonths, monthlyBurn: burn, totalCash: cash };
  }, [accounts, allTransactions]);

  // CAC calculation (hybrid: auto + manual override)
  const { cac, marketingSpend, totalNewCustomers, isAutoSource } = useMemo(() => {
    const mktSpend = filteredTransactions
      .filter((t) => t.is_cac_related && t.fin_categories?.type === 'expense')
      .reduce((s, t) => s + Math.abs(Number(t.amount_usd)), 0);

    // Build monthly customer count: manual override > auto
    const manualMap = new Map<string, number>();
    for (const m of monthlyMetrics) {
      if (m.new_customers_count > 0) {
        const month = m.month_date.substring(0, 7);
        manualMap.set(month, m.new_customers_count);
      }
    }

    const autoMap = new Map<string, number>();
    for (const ac of autoCustomers) {
      autoMap.set(ac.month, ac.count);
    }

    // Merge: manual overrides auto
    const allMonths = new Set([...manualMap.keys(), ...autoMap.keys()]);
    let total = 0;
    let usedAuto = true;
    for (const month of allMonths) {
      if (manualMap.has(month)) {
        total += manualMap.get(month)!;
        usedAuto = false;
      } else {
        total += autoMap.get(month) || 0;
      }
    }

    const cacValue = total > 0 ? mktSpend / total : 0;
    return { cac: cacValue, marketingSpend: mktSpend, totalNewCustomers: total, isAutoSource: usedAuto };
  }, [filteredTransactions, monthlyMetrics, autoCustomers]);

  // Cash flow (ingresos manuales + rev_orders, gastos de fin_transactions)
  const { totalIncome, totalExpense } = useMemo(() => {
    const manualInc = filteredTransactions.filter((t) => t.fin_categories?.type === 'income').reduce((s, t) => s + Number(t.amount_usd), 0);
    const revOrdersInc = revenueByMonth.reduce((s, r) => s + r.total, 0);
    const expense = filteredTransactions.filter((t) => t.fin_categories?.type === 'expense').reduce((s, t) => s + Number(t.amount_usd), 0);
    return { totalIncome: manualInc + revOrdersInc, totalExpense: expense };
  }, [filteredTransactions, revenueByMonth]);

  // Manual income from fin_transactions
  const manualIncome = useMemo(() => {
    return filteredTransactions.filter((t) => t.fin_categories?.type === 'income').reduce((s, t) => s + Number(t.amount_usd), 0);
  }, [filteredTransactions]);

  // Revenue totals
  const platformRevenue = revenueByMonth.reduce((s, r) => s + r.total, 0);
  const combinedRevenue = platformRevenue + manualIncome;

  const loading = revLoading || custLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Runway"
          value={`${Math.round(runway)} meses`}
          icon={ClockIcon}
          colorClass={runway < 6 ? 'bg-red-500' : 'bg-green-500'}
        />
        <KpiCard title="CAC" value={fmtUSD2(cac)} icon={UserGroupIcon} colorClass="bg-purple-500" />
        <KpiCard
          title="Flujo Neto"
          value={fmtUSD(totalIncome - totalExpense)}
          icon={ArrowTrendingUpIcon}
          colorClass={totalIncome - totalExpense >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
        />
        <KpiCard title="Caja Total" value={fmtUSD(totalCash)} icon={BanknotesIcon} colorClass="bg-blue-500" />
      </div>

      {/* KPI detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Runway detail */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Runway</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Caja total (USD equiv.)</span>
              <span className="font-semibold text-gray-800">{fmtUSD(totalCash)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Burn mensual (gastos fijos, 3m avg)</span>
              <span className="font-semibold text-gray-800">{fmtUSD(monthlyBurn)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Runway estimado</span>
              <span className={`font-bold ${runway < 6 ? 'text-red-600' : 'text-green-600'}`}>{Math.round(runway)} meses</span>
            </div>
          </div>
        </div>

        {/* CAC detail */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
            CAC
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${isAutoSource ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
              {isAutoSource ? 'Auto' : 'Manual override'}
            </span>
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Gasto marketing (is_cac_related)</span>
              <span className="font-semibold text-gray-800">{fmtUSD(marketingSpend)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Nuevos clientes pagos</span>
              <span className="font-semibold text-gray-800">{fmtNum(totalNewCustomers)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">CAC</span>
              <span className="font-bold text-purple-600">{fmtUSD2(cac)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Revenue</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <KpiCard title="Revenue Plataforma" value={fmtUSD(platformRevenue)} icon={CurrencyDollarIcon} colorClass="bg-emerald-500" />
          <KpiCard title="Otros Ingresos" value={fmtUSD(manualIncome)} icon={ShoppingCartIcon} colorClass="bg-amber-500" />
          <KpiCard title="Revenue Total" value={fmtUSD(combinedRevenue)} icon={BanknotesIcon} colorClass="bg-blue-600" />
        </div>

        {revenueByMonth.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th className="text-left py-2 px-3">Mes</th>
                  <th className="text-right py-2 px-3">Nuevo</th>
                  <th className="text-right py-2 px-3">Renovación</th>
                  <th className="text-right py-2 px-3 font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {revenueByMonth.map((r) => (
                  <tr key={r.month} className="hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-700 font-medium">{r.month}</td>
                    <td className="py-2 px-3 text-right text-green-600">{fmtUSD(r.nuevo)}</td>
                    <td className="py-2 px-3 text-right text-blue-600">{fmtUSD(r.renovacion)}</td>
                    <td className="py-2 px-3 text-right font-bold text-gray-800">{fmtUSD(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Sin datos de revenue en este período</p>
        )}
      </div>

      {/* CAC Evolution */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Evolución CAC</h3>
        <div className="h-[350px]">
          <CacEvolutionChart transactions={allTransactions} metrics={monthlyMetrics} autoCustomers={allAutoCustomers} />
        </div>
      </div>
    </div>
  );
}
