'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExclamationTriangleIcon, EyeIcon } from '@heroicons/react/24/outline';
import { fmtNum, fmtPct } from './formatters';
import WeekSelector, { getCurrentWeekStart, toDateStr } from './WeekSelector';

interface CrossTableRow {
  key: string;
  pago: number;
  gratisActivado: number;
  noActivado: number;
  total: number;
  conversionPct: number;
  pctOfGrandTotal: number;
}

interface ChannelPlanRow {
  channel: string;
  plans: Record<string, number>;
  total: number;
}

interface AcquisitionData {
  has_data: boolean;
  summary?: {
    total_users: number;
    paid_users: number;
    top_country: string;
    top_channel: string;
    best_conv_channel: string;
    best_conv_pct: number;
  };
  country_table?: CrossTableRow[];
  channel_table?: CrossTableRow[];
  channel_plan_table?: ChannelPlanRow[];
  plan_names?: string[];
}


export default function AcquisitionTab() {
  const { supabase } = useAuth();
  const [data, setData] = useState<AcquisitionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(getCurrentWeekStart);
  const [showAllTime, setShowAllTime] = useState(false);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const params: Record<string, string | null> = {
      p_week_start: showAllTime ? null : toDateStr(weekStart),
    };
    const { data: result, error } = await supabase.rpc('get_acquisition_stats', params);
    if (error) {
      console.error('RPC get_acquisition_stats error:', error);
      setData({ has_data: false });
    } else if (result) {
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      setData(parsed as AcquisitionData);
    } else {
      setData({ has_data: false });
    }
    setLoading(false);
  }, [supabase, weekStart, showAllTime]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (!data?.has_data) {
    return (
      <div className="space-y-6">
        {/* Header even when no data */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-800">Adquisicion</h2>
          <div className="flex items-center gap-4">
            {!showAllTime && (
              <WeekSelector weekStart={weekStart} onWeekChange={setWeekStart} />
            )}
            <button
              onClick={() => setShowAllTime(!showAllTime)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${showAllTime ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {showAllTime ? 'Ver semanal' : 'Ver acumulado'}
            </button>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <ExclamationTriangleIcon className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-amber-800 mb-2">Datos pendientes</h3>
          <p className="text-sm text-amber-600 max-w-md mx-auto">
            Este tab necesita datos de <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">growth_users</code> para analizar canales de adquisicion.
          </p>
        </div>
      </div>
    );
  }

  const summary = data.summary!;
  const countryTable = data.country_table || [];
  const channelTable = data.channel_table || [];
  const channelPlanRows = data.channel_plan_table || [];
  const planNames = data.plan_names || [];

  const StatusTable = ({ title, tableData }: { title: string; tableData: CrossTableRow[] }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 font-medium border-b">
            <tr>
              <th className="px-4 py-3 text-left">{title.includes('Pais') ? 'Pais' : 'Canal'}</th>
              <th className="px-4 py-3 text-right">Pago</th>
              <th className="px-4 py-3 text-right">Gratis Activado</th>
              <th className="px-4 py-3 text-right">No Activado</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">% Total</th>
              <th className="px-4 py-3 text-right">% Conversion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tableData.map((row) => (
              <tr key={row.key} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{row.key}</td>
                <td className="px-4 py-3 text-right text-green-600 font-medium">{fmtNum(row.pago)}</td>
                <td className="px-4 py-3 text-right text-purple-600">{fmtNum(row.gratisActivado)}</td>
                <td className="px-4 py-3 text-right text-gray-400">{fmtNum(row.noActivado)}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtNum(row.total)}</td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs text-gray-500">{row.pctOfGrandTotal != null ? `${row.pctOfGrandTotal}%` : '-'}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.conversionPct >= 10 ? 'bg-green-50 text-green-700' : row.conversionPct >= 5 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                    {fmtPct(row.conversionPct)}
                  </span>
                </td>
              </tr>
            ))}
            {/* Totals */}
            <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
              <td className="px-4 py-3 text-gray-900">Total</td>
              <td className="px-4 py-3 text-right text-green-700">{fmtNum(tableData.reduce((s, r) => s + r.pago, 0))}</td>
              <td className="px-4 py-3 text-right text-purple-700">{fmtNum(tableData.reduce((s, r) => s + r.gratisActivado, 0))}</td>
              <td className="px-4 py-3 text-right text-gray-500">{fmtNum(tableData.reduce((s, r) => s + r.noActivado, 0))}</td>
              <td className="px-4 py-3 text-right text-gray-900">{fmtNum(tableData.reduce((s, r) => s + r.total, 0))}</td>
              <td className="px-4 py-3 text-right text-xs text-gray-500">100%</td>
              <td className="px-4 py-3 text-right">
                {(() => {
                  const totalAll = tableData.reduce((s, r) => s + r.total, 0);
                  const totalPago = tableData.reduce((s, r) => s + r.pago, 0);
                  return <span className="text-xs font-medium text-gray-600">{fmtPct(totalAll > 0 ? (totalPago / totalAll) * 100 : 0)}</span>;
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header with WeekSelector + toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-800">Adquisicion</h2>
        <div className="flex items-center gap-4">
          {!showAllTime && (
            <WeekSelector weekStart={weekStart} onWeekChange={setWeekStart} />
          )}
          <button
            onClick={() => setShowAllTime(!showAllTime)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${showAllTime ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {showAllTime ? 'Ver semanal' : 'Ver acumulado'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">Total Usuarios</p>
          <p className="text-2xl font-bold text-gray-900">{fmtNum(summary.total_users)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">Usuarios Pagados</p>
          <p className="text-2xl font-bold text-green-600">{fmtNum(summary.paid_users)}</p>
          <p className="text-xs text-gray-400">{fmtPct(summary.total_users > 0 ? (summary.paid_users / summary.total_users) * 100 : 0)} del total</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">Top Pais</p>
          <p className="text-2xl font-bold text-gray-900">{summary.top_country || '-'}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">Mejor Canal (conv.)</p>
          <p className="text-2xl font-bold text-gray-900">{summary.best_conv_channel || '-'}</p>
          <p className="text-xs text-gray-400">{fmtPct(summary.best_conv_pct)} conversion</p>
        </div>
      </div>

      {/* Country x Status */}
      <StatusTable title="Pais x Status" tableData={countryTable} />

      {/* Channel x Status */}
      <StatusTable title="Canal x Status" tableData={channelTable} />

      {/* Channel x Plan */}
      {channelPlanRows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-700">Canal x Plan (solo pagados)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Canal</th>
                  {planNames.map(p => (
                    <th key={p} className="px-4 py-3 text-right">{p}</th>
                  ))}
                  <th className="px-4 py-3 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {channelPlanRows.map((row) => (
                  <tr key={row.channel} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.channel}</td>
                    {planNames.map(p => (
                      <td key={p} className="px-4 py-3 text-right text-gray-700">
                        {row.plans[p] ? fmtNum(row.plans[p]) : <span className="text-gray-300">-</span>}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtNum(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mixpanel placeholder */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <EyeIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-600">Journeys de adquisicion (Mixpanel)</p>
        <p className="text-xs text-gray-400 mt-1">Los journeys detallados de adquisicion estaran disponibles cuando se configure el pipeline de Mixpanel (Fase 3).</p>
      </div>
    </div>
  );
}
