'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AuthGuard from '@/components/AuthGuard';
import ModuleGuard from '@/components/ModuleGuard';
import { useAuth } from '@/context/AuthContext';
import { Toaster, toast } from 'sonner';
import {
  InboxIcon,
  ChartBarSquareIcon,
  PresentationChartBarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

import type { Account, Category, Transaction, MonthlyMetric, DateRangePreset } from '@/lib/finance-types';
import { useFinanceDateRange } from '@/components/finance/useFinanceDateRange';
import InboxTab from '@/components/finance/InboxTab';
import PnLTab from '@/components/finance/PnLTab';
import MetricasTab from '@/components/finance/MetricasTab';
import ConfigTab from '@/components/finance/ConfigTab';

const TABS = [
  { id: 'inbox', label: 'Inbox', icon: InboxIcon },
  { id: 'pnl', label: 'P&L', icon: ChartBarSquareIcon },
  { id: 'metricas', label: 'Métricas', icon: PresentationChartBarIcon },
  { id: 'config', label: 'Config', icon: Cog6ToothIcon },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function FinancePage() {
  const { supabase, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('inbox');
  const [loading, setLoading] = useState(true);

  // Data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [monthlyMetrics, setMonthlyMetrics] = useState<MonthlyMetric[]>([]);

  // Date range
  const {
    dateRange, setDateRange,
    customStart, setCustomStart, customEnd, setCustomEnd,
    tempStart, setTempStart, tempEnd, setTempEnd,
    filterByDate, dateRangeISO,
  } = useFinanceDateRange();

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: cats } = await supabase.from('fin_categories').select('*').order('name');
      if (cats) setCategories(cats);

      const { data: accs } = await supabase.from('fin_accounts').select('*').order('id');
      if (accs) setAccounts(accs);

      const { data: metricsData } = await supabase.from('fin_monthly_metrics').select('*').order('month_date', { ascending: false });
      if (metricsData) setMonthlyMetrics(metricsData);

      const { data: txs, error } = await supabase
        .from('fin_transactions')
        .select('*, fin_categories (name, slug, type, parent_category)')
        .order('transaction_date', { ascending: false });

      if (error) throw error;
      setTransactions(txs as unknown as Transaction[]);
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [supabase, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(filterByDate);
  }, [transactions, filterByDate]);

  const renderTab = () => {
    if (loading && activeTab !== 'config') {
      return <div className="p-10 text-center text-sm text-gray-500">Cargando datos financieros...</div>;
    }

    switch (activeTab) {
      case 'inbox':
        return <InboxTab transactions={transactions} filteredTransactions={filteredTransactions} categories={categories} fetchData={fetchData} />;
      case 'pnl':
        return <PnLTab filteredTransactions={filteredTransactions} dateRangeISO={dateRangeISO} />;
      case 'metricas':
        return <MetricasTab accounts={accounts} allTransactions={transactions} filteredTransactions={filteredTransactions} dateRangeISO={dateRangeISO} monthlyMetrics={monthlyMetrics} />;
      case 'config':
        return <ConfigTab accounts={accounts} monthlyMetrics={monthlyMetrics} fetchData={fetchData} />;
      default:
        return null;
    }
  };

  return (
    <AuthGuard>
      <ModuleGuard module="mod_finanzas">
        <main className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen font-sans">
          <Toaster position="top-right" richColors />

          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Reporte Financiero</h1>
              <p className="text-gray-500 text-sm">Vista CFO & Control de Gestión</p>
            </div>

            {/* Date range filter — hidden on Config tab */}
            {activeTab !== 'config' && (
              <div className="flex items-center gap-2 bg-white p-1 rounded-lg shadow-sm border border-gray-200">
                {(['current_month', 'last_3_months', 'last_6_months', 'last_12_months', 'all'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setDateRange(r)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                      dateRange === r ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {r === 'current_month' ? 'Este Mes' : r === 'last_3_months' ? '3M' : r === 'last_6_months' ? '6M' : r === 'last_12_months' ? '12M' : 'Todo'}
                  </button>
                ))}

                <div className="w-px h-4 bg-gray-300 mx-1"></div>

                <div className="flex items-center">
                  <button
                    onClick={() => {
                      if (dateRange !== 'custom') {
                        setDateRange('custom' as DateRangePreset);
                        const today = new Date().toISOString().split('T')[0];
                        setTempStart(today);
                        setTempEnd(today);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap flex items-center gap-2 ${
                      dateRange === 'custom' ? 'bg-blue-50 text-blue-700 border border-blue-200 font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Custom
                  </button>

                  {dateRange === 'custom' && (
                    <div className="flex items-center gap-2 ml-2">
                      <input type="date" value={tempStart} onChange={(e) => setTempStart(e.target.value)} className="text-[10px] border border-gray-300 rounded px-2 py-1 text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                      <span className="text-gray-400 text-[10px]">-</span>
                      <input type="date" value={tempEnd} onChange={(e) => setTempEnd(e.target.value)} className="text-[10px] border border-gray-300 rounded px-2 py-1 text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                      <button
                        onClick={() => {
                          if (!tempStart || !tempEnd) { toast.error('Ingresa ambas fechas'); return; }
                          setCustomStart(tempStart);
                          setCustomEnd(tempEnd);
                          toast.success('Rango aplicado');
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors shadow-sm"
                      >
                        APLICAR
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tab navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-1 overflow-x-auto" aria-label="Tabs">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group inline-flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <tab.icon className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab content */}
          <div>{renderTab()}</div>
        </main>
      </ModuleGuard>
    </AuthGuard>
  );
}
