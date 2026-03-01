'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExclamationTriangleIcon, EyeIcon } from '@heroicons/react/24/outline';
import { fmtNum, fmtPct } from './formatters';

interface GrowthUser {
  id: string;
  email: string;
  country: string;
  origin: string;
  plan_free: boolean;
  plan_paid: boolean;
  cancelled: boolean;
  plan_id: string;
  eventos_valor: number;
}

type UserStatus = 'Pago' | 'Gratis Activado' | 'No Activado';

function getUserStatus(u: GrowthUser): UserStatus {
  if (u.plan_paid) return 'Pago';
  if ((u.eventos_valor || 0) >= 1) return 'Gratis Activado';
  return 'No Activado';
}

interface CrossTableRow {
  key: string;
  pago: number;
  gratisActivado: number;
  noActivado: number;
  total: number;
  conversionPct: number;
}

export default function AcquisitionTab() {
  const { supabase } = useAuth();
  const [users, setUsers] = useState<GrowthUser[]>([]);
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    const fetchUsers = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('growth_users')
        .select('id, email, country, origin, plan_free, plan_paid, cancelled, plan_id, eventos_valor');
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

  // Cross-table: Country x Status
  const countryTable = useMemo((): CrossTableRow[] => {
    if (!users.length) return [];
    const map = new Map<string, { pago: number; gratisActivado: number; noActivado: number }>();

    users.forEach(u => {
      const country = u.country || 'Sin pais';
      if (!map.has(country)) map.set(country, { pago: 0, gratisActivado: 0, noActivado: 0 });
      const entry = map.get(country)!;
      const status = getUserStatus(u);
      if (status === 'Pago') entry.pago++;
      else if (status === 'Gratis Activado') entry.gratisActivado++;
      else entry.noActivado++;
    });

    return Array.from(map.entries())
      .map(([key, v]) => {
        const total = v.pago + v.gratisActivado + v.noActivado;
        return { key, ...v, total, conversionPct: total > 0 ? (v.pago / total) * 100 : 0 };
      })
      .sort((a, b) => b.total - a.total);
  }, [users]);

  // Cross-table: Channel (Origin) x Plan
  const channelTable = useMemo((): CrossTableRow[] => {
    if (!users.length) return [];
    const map = new Map<string, { pago: number; gratisActivado: number; noActivado: number }>();

    users.forEach(u => {
      const origin = u.origin || 'Sin canal';
      if (!map.has(origin)) map.set(origin, { pago: 0, gratisActivado: 0, noActivado: 0 });
      const entry = map.get(origin)!;
      const status = getUserStatus(u);
      if (status === 'Pago') entry.pago++;
      else if (status === 'Gratis Activado') entry.gratisActivado++;
      else entry.noActivado++;
    });

    return Array.from(map.entries())
      .map(([key, v]) => {
        const total = v.pago + v.gratisActivado + v.noActivado;
        return { key, ...v, total, conversionPct: total > 0 ? (v.pago / total) * 100 : 0 };
      })
      .sort((a, b) => b.total - a.total);
  }, [users]);

  // Channel x Plan breakdown
  const channelPlanTable = useMemo(() => {
    if (!users.length) return { rows: [] as { channel: string; plans: Record<string, number>; total: number }[], planNames: [] as string[] };

    const planSet = new Set<string>();
    const map = new Map<string, Record<string, number>>();

    users.filter(u => u.plan_paid).forEach(u => {
      const origin = u.origin || 'Sin canal';
      const plan = u.plan_id || 'Sin plan';
      planSet.add(plan);
      if (!map.has(origin)) map.set(origin, {});
      const entry = map.get(origin)!;
      entry[plan] = (entry[plan] || 0) + 1;
    });

    const planNames = Array.from(planSet).sort();
    const rows = Array.from(map.entries())
      .map(([channel, plans]) => ({
        channel,
        plans,
        total: Object.values(plans).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total);

    return { rows, planNames };
  }, [users]);

  // Summary KPIs
  const summary = useMemo(() => {
    const totalUsers = users.length;
    const paidUsers = users.filter(u => u.plan_paid).length;
    const topCountry = countryTable[0];
    const topChannel = channelTable[0];
    const bestConvChannel = [...channelTable].filter(r => r.total >= 10).sort((a, b) => b.conversionPct - a.conversionPct)[0];
    return { totalUsers, paidUsers, topCountry, topChannel, bestConvChannel };
  }, [users, countryTable, channelTable]);

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
            Este tab necesita datos de <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">growth_users</code> para analizar canales de adquisicion.
          </p>
        </div>
      </div>
    );
  }

  const StatusTable = ({ title, data }: { title: string; data: CrossTableRow[] }) => (
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
              <th className="px-4 py-3 text-right">% Conversion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row) => (
              <tr key={row.key} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{row.key}</td>
                <td className="px-4 py-3 text-right text-green-600 font-medium">{fmtNum(row.pago)}</td>
                <td className="px-4 py-3 text-right text-purple-600">{fmtNum(row.gratisActivado)}</td>
                <td className="px-4 py-3 text-right text-gray-400">{fmtNum(row.noActivado)}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtNum(row.total)}</td>
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
              <td className="px-4 py-3 text-right text-green-700">{fmtNum(data.reduce((s, r) => s + r.pago, 0))}</td>
              <td className="px-4 py-3 text-right text-purple-700">{fmtNum(data.reduce((s, r) => s + r.gratisActivado, 0))}</td>
              <td className="px-4 py-3 text-right text-gray-500">{fmtNum(data.reduce((s, r) => s + r.noActivado, 0))}</td>
              <td className="px-4 py-3 text-right text-gray-900">{fmtNum(data.reduce((s, r) => s + r.total, 0))}</td>
              <td className="px-4 py-3 text-right">
                {(() => {
                  const totalAll = data.reduce((s, r) => s + r.total, 0);
                  const totalPago = data.reduce((s, r) => s + r.pago, 0);
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
      <h2 className="text-lg font-semibold text-gray-800">Adquisicion</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">Total Usuarios</p>
          <p className="text-2xl font-bold text-gray-900">{fmtNum(summary.totalUsers)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">Usuarios Pagados</p>
          <p className="text-2xl font-bold text-green-600">{fmtNum(summary.paidUsers)}</p>
          <p className="text-xs text-gray-400">{fmtPct(summary.totalUsers > 0 ? (summary.paidUsers / summary.totalUsers) * 100 : 0)} del total</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">Top Pais</p>
          <p className="text-2xl font-bold text-gray-900">{summary.topCountry?.key || '-'}</p>
          <p className="text-xs text-gray-400">{fmtNum(summary.topCountry?.total || 0)} usuarios</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">Mejor Canal (conv.)</p>
          <p className="text-2xl font-bold text-gray-900">{summary.bestConvChannel?.key || '-'}</p>
          <p className="text-xs text-gray-400">{fmtPct(summary.bestConvChannel?.conversionPct || 0)} conversion</p>
        </div>
      </div>

      {/* Country x Status */}
      <StatusTable title="Pais x Status" data={countryTable} />

      {/* Channel x Status */}
      <StatusTable title="Canal x Status" data={channelTable} />

      {/* Channel x Plan */}
      {channelPlanTable.rows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-700">Canal x Plan (solo pagados)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Canal</th>
                  {channelPlanTable.planNames.map(p => (
                    <th key={p} className="px-4 py-3 text-right">{p}</th>
                  ))}
                  <th className="px-4 py-3 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {channelPlanTable.rows.map((row) => (
                  <tr key={row.channel} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.channel}</td>
                    {channelPlanTable.planNames.map(p => (
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
