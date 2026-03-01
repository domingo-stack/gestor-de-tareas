'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fmtUSD, fmtUSDShort, fmtNum } from './formatters';

type ViewMode = 'monthly' | 'weekly' | 'daily';

interface CountryRow {
  country: string;
  periods: Record<string, number>;
  total: number;
}

export default function RevenueByCountry() {
  const { supabase } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showYoY, setShowYoY] = useState(false);
  const [prevYearOrders, setPrevYearOrders] = useState<any[]>([]);

  // Fetch orders for selected year + previous year for YoY
  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const startCurrent = `${selectedYear}-01-01T00:00:00`;
        const endCurrent = `${selectedYear}-12-31T23:59:59`;
        const startPrev = `${selectedYear - 1}-01-01T00:00:00`;
        const endPrev = `${selectedYear - 1}-12-31T23:59:59`;

        const [currentRes, prevRes] = await Promise.all([
          supabase.from('rev_orders').select('amount_usd, country, created_at').gte('created_at', startCurrent).lte('created_at', endCurrent).order('created_at', { ascending: true }),
          supabase.from('rev_orders').select('amount_usd, country, created_at').gte('created_at', startPrev).lte('created_at', endPrev).order('created_at', { ascending: true }),
        ]);

        setAllOrders(currentRes.data || []);
        setPrevYearOrders(prevRes.data || []);
      } catch (err) {
        console.error('Error fetching country data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [supabase, selectedYear]);

  // Compute table data
  const { rows, periodKeys, totalsRow, prevYearMap } = useMemo(() => {
    const getPeriodKey = (dateStr: string): string => {
      const d = new Date(dateStr);
      if (viewMode === 'monthly') {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else if (viewMode === 'weekly') {
        const start = new Date(d);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
        return start.toISOString().split('T')[0];
      }
      return d.toISOString().split('T')[0];
    };

    // Build country→period map
    const countryMap = new Map<string, Record<string, number>>();
    const allPeriods = new Set<string>();

    allOrders.forEach((order) => {
      const country = order.country || 'Desconocido';
      const period = getPeriodKey(order.created_at);
      allPeriods.add(period);
      if (!countryMap.has(country)) countryMap.set(country, {});
      const entry = countryMap.get(country)!;
      entry[period] = (entry[period] || 0) + (order.amount_usd || 0);
    });

    const periodKeys = Array.from(allPeriods).sort();

    // Build prev year map for YoY
    const prevMap = new Map<string, Record<string, number>>();
    prevYearOrders.forEach((order) => {
      const country = order.country || 'Desconocido';
      const period = getPeriodKey(order.created_at);
      if (!prevMap.has(country)) prevMap.set(country, {});
      const entry = prevMap.get(country)!;
      entry[period] = (entry[period] || 0) + (order.amount_usd || 0);
    });

    // Build rows
    const rows: CountryRow[] = Array.from(countryMap.entries()).map(([country, periods]) => ({
      country,
      periods,
      total: Object.values(periods).reduce((s, v) => s + v, 0),
    })).sort((a, b) => b.total - a.total);

    // Totals row
    const totalsRow: Record<string, number> = {};
    periodKeys.forEach((p) => {
      totalsRow[p] = rows.reduce((s, r) => s + (r.periods[p] || 0), 0);
    });

    return { rows, periodKeys, totalsRow, prevYearMap: prevMap };
  }, [allOrders, prevYearOrders, viewMode]);

  const formatPeriodLabel = (key: string): string => {
    if (viewMode === 'monthly') {
      const [, m] = key.split('-');
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return months[parseInt(m) - 1] || key;
    }
    if (viewMode === 'weekly') {
      const d = new Date(key);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    }
    const d = new Date(key);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  const getYoYGrowth = (country: string, period: string): number | null => {
    if (!showYoY) return null;
    const current = rows.find(r => r.country === country)?.periods[period] || 0;
    // Map period to previous year
    const prevPeriod = period.replace(String(selectedYear), String(selectedYear - 1));
    const prev = prevYearMap.get(country)?.[prevPeriod] || 0;
    if (prev === 0 && current === 0) return null;
    if (prev === 0) return 100;
    return ((current - prev) / prev) * 100;
  };

  const years = [2024, 2025, 2026];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1 rounded-lg border border-gray-200 flex gap-1 shadow-sm">
            {(['monthly', 'weekly', 'daily'] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setViewMode(v)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === v ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                {v === 'monthly' ? 'Mensual' : v === 'weekly' ? 'Semanal' : 'Diario'}
              </button>
            ))}
          </div>
          <div className="bg-white p-1 rounded-lg border border-gray-200 flex gap-1 shadow-sm">
            {years.map((y) => (
              <button key={y} onClick={() => setSelectedYear(y)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${selectedYear === y ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                {y}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showYoY} onChange={(e) => setShowYoY(e.target.checked)} className="rounded text-blue-600 border-gray-300" />
          Mostrar % YoY
        </label>
      </div>

      {/* Matrix table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div><p className="text-gray-500">Cargando...</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-4 py-3 text-left sticky left-0 bg-gray-50 z-10 min-w-[140px]">Pais</th>
                  {periodKeys.map((pk) => (
                    <th key={pk} className="px-3 py-3 text-right whitespace-nowrap min-w-[90px]">{formatPeriodLabel(pk)}</th>
                  ))}
                  <th className="px-4 py-3 text-right font-bold min-w-[100px]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.country} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white z-10">{row.country}</td>
                    {periodKeys.map((pk) => {
                      const val = row.periods[pk] || 0;
                      const yoy = getYoYGrowth(row.country, pk);
                      return (
                        <td key={pk} className="px-3 py-3 text-right text-gray-700">
                          <div>{val > 0 ? fmtUSDShort(val) : <span className="text-gray-300">-</span>}</div>
                          {yoy !== null && (
                            <div className={`text-[10px] font-medium ${yoy >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {yoy >= 0 ? '+' : ''}{yoy.toFixed(0)}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtUSD(row.total)}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                  <td className="px-4 py-3 text-gray-900 sticky left-0 bg-gray-50 z-10">Total</td>
                  {periodKeys.map((pk) => (
                    <td key={pk} className="px-3 py-3 text-right text-gray-900">{fmtUSDShort(totalsRow[pk] || 0)}</td>
                  ))}
                  <td className="px-4 py-3 text-right text-gray-900">{fmtUSD(rows.reduce((s, r) => s + r.total, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary stats */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-medium text-gray-500 mb-1">Paises activos</p>
            <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-medium text-gray-500 mb-1">Top pais</p>
            <p className="text-2xl font-bold text-gray-900">{rows[0]?.country}</p>
            <p className="text-xs text-gray-400">{fmtUSD(rows[0]?.total || 0)}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-medium text-gray-500 mb-1">Ingreso total {selectedYear}</p>
            <p className="text-2xl font-bold text-gray-900">{fmtUSD(rows.reduce((s, r) => s + r.total, 0))}</p>
          </div>
        </div>
      )}
    </div>
  );
}
