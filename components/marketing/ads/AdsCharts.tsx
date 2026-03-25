'use client';

import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Cell, ReferenceLine,
  LineChart,
} from 'recharts';
import { AdsTrendPoint, CampaignSummary } from '../shared/useMarketingData';
import { fmtUSD, fmtNum } from '@/components/growth/formatters';

// ─── Tooltip ───
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-bold text-gray-800">
            {p.name.includes('Gasto') || p.name.includes('CPA') ? fmtUSD(p.value) : fmtNum(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── 1. Spend vs Registros (diario) ───
export function AdsSpendChart({ data }: { data: AdsTrendPoint[] }) {
  if (data.length === 0) return null;

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">Gasto vs Registros (diario)</h4>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="spend" fill="#3B82F6" name="Gasto (USD)" barSize={20} radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} name="Registros" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── 2. CPA Evolution ───
export function AdsCpaChart({ data }: { data: AdsTrendPoint[] }) {
  const cpaData = useMemo(() => data.filter(d => d.conversions > 0), [data]);
  const avgCpa = useMemo(() => {
    const totalSpend = data.reduce((s, d) => s + d.spend, 0);
    const totalConv = data.reduce((s, d) => s + d.conversions, 0);
    return totalConv > 0 ? totalSpend / totalConv : 0;
  }, [data]);

  if (cpaData.length === 0) return null;

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-700">Evolución del CPA</h4>
        <span className="text-xs text-gray-400">Promedio: {fmtUSD(avgCpa)}</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={cpaData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={avgCpa} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: `Prom. ${fmtUSD(avgCpa)}`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
            <Line type="monotone" dataKey="cpa" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} name="CPA" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── 3. Campaign CPA Bar (horizontal) ───
export function CampaignCpaBar({ campaigns }: { campaigns: CampaignSummary[] }) {
  const sorted = useMemo(() => {
    return [...campaigns]
      .filter(c => c.conversions > 0)
      .sort((a, b) => a.cpa - b.cpa);
  }, [campaigns]);

  const avgCpa = useMemo(() => {
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalConv = campaigns.reduce((s, c) => s + c.conversions, 0);
    return totalConv > 0 ? totalSpend / totalConv : 0;
  }, [campaigns]);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-700">CPA por Campaña</h4>
        <span className="text-xs text-gray-400">Promedio: {fmtUSD(avgCpa)}</span>
      </div>
      <div style={{ height: Math.max(sorted.length * 48, 120) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload as CampaignSummary;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-xs">
                  <p className="font-semibold text-gray-700 mb-1">{d.name}</p>
                  <p className="text-gray-500">CPA: <span className="font-bold">{fmtUSD(d.cpa)}</span></p>
                  <p className="text-gray-500">Gasto: {fmtUSD(d.spend)} · Registros: {fmtNum(d.conversions)}</p>
                </div>
              );
            }} />
            <ReferenceLine x={avgCpa} stroke="#94a3b8" strokeDasharray="4 4" />
            <Bar dataKey="cpa" name="CPA" radius={[0, 4, 4, 0]} barSize={24}>
              {sorted.map((c, i) => (
                <Cell key={i} fill={c.cpa <= avgCpa ? '#10B981' : '#EF4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
