'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

// Meta rates — default Peru (80% audiencia). Se actualizan desde comm_whatsapp_rates.
const DEFAULT_RATES = { utility: 0.0200, marketing: 0.0703 };

interface OverallStats {
  total: number;
  enviados: number;
  entregados: number;
  leidos: number;
  fallidos: number;
}

interface CategoryStat {
  categoria: 'utility' | 'marketing' | null;
  enviados: number;
  fallidos: number;
}

interface BroadcastStat {
  id: number;
  nombre: string;
  created_at: string;
  template_nombre: string;
  template_categoria: 'utility' | 'marketing' | null;
  total: number;
  enviados: number;
  entregados: number;
  leidos: number;
  fallidos: number;
}

interface AutomationRule {
  regla_id: number;
  regla_nombre: string;
  template_categoria: 'utility' | 'marketing' | null;
  enviados: number;
  entregados: number;
  leidos: number;
  fallidos: number;
}

interface MetricsData {
  overall: OverallStats;
  by_category: CategoryStat[];
  broadcasts: BroadcastStat[];
  automations: OverallStats;
  by_rule: AutomationRule[];
}

function pct(num: number, den: number) {
  if (!den) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

function usd(amount: number) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcCost(sent: number, categoria: 'utility' | 'marketing' | null, rates = DEFAULT_RATES) {
  return sent * (rates[categoria ?? 'utility']);
}

function KpiCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs font-semibold text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function PctBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{Math.round(value)}%</span>
    </div>
  );
}

type DateFilter = 'semana' | 'mes' | 'custom';

function getDateRange(filter: DateFilter, customFrom: string, customTo: string) {
  const now = new Date();
  if (filter === 'semana') {
    const from = new Date(now);
    from.setDate(now.getDate() - 7);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  if (filter === 'mes') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  return {
    from: customFrom ? new Date(customFrom).toISOString() : null,
    to:   customTo   ? new Date(customTo + 'T23:59:59').toISOString() : null,
  };
}

export default function Metricas() {
  const { supabase } = useAuth();
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('mes');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rates, setRates] = useState(DEFAULT_RATES);

  // Load weighted rates from DB (Peru = 80% of audience, used as default)
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('comm_whatsapp_rates')
      .select('country, marketing, utility')
      .eq('country', 'Perú')
      .single()
      .then(({ data: row }) => {
        if (row) setRates({ marketing: row.marketing, utility: row.utility });
      });
  }, [supabase]);

  const fetchMetrics = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { from, to } = getDateRange(dateFilter, customFrom, customTo);
    const { data: result, error } = await supabase.rpc('get_comm_metrics', {
      p_from: from ?? null,
      p_to:   to   ?? null,
    });
    if (error) {
      toast.error('Error al cargar métricas');
      console.error(error);
    } else {
      setData(result as MetricsData);
    }
    setLoading(false);
  }, [supabase, dateFilter, customFrom, customTo]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Cargando métricas...
      </div>
    );
  }

  if (!data) return null;

  const { overall, by_category = [], broadcasts = [], automations, by_rule = [] } = data;

  // Cost calculations (using Peru rates — 80% of audience)
  const costByCategory = by_category.reduce((acc, c) => {
    const cost = calcCost(c.enviados, c.categoria, rates);
    acc[c.categoria ?? 'utility'] = cost;
    return acc;
  }, {} as Record<string, number>);

  const campaignSent = broadcasts.reduce((s, b) => s + (b.enviados ?? 0), 0);
  const autoSent     = automations?.enviados ?? 0;
  const totalCost    = Object.values(costByCategory).reduce((a, b) => a + b, 0);
  const utilityCost  = costByCategory['utility']  ?? 0;
  const marketingCost = costByCategory['marketing'] ?? 0;

  const deliveryPct = overall.enviados ? (overall.entregados / overall.enviados) * 100 : 0;
  const readPct     = overall.enviados ? (overall.leidos     / overall.enviados) * 100 : 0;
  const failPct     = overall.total    ? (overall.fallidos   / overall.total)    * 100 : 0;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#383838]">Métricas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Rendimiento y costos de campañas y automatizaciones WhatsApp
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
        >
          <span>↻</span> Actualizar
        </button>
      </div>

      {/* Date filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {(['semana', 'mes'] as DateFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setDateFilter(f)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              dateFilter === f
                ? 'bg-[#3c527a] text-white'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {f === 'semana' ? 'Últimos 7 días' : 'Este mes'}
          </button>
        ))}
        <button
          onClick={() => setDateFilter('custom')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            dateFilter === 'custom'
              ? 'bg-[#3c527a] text-white'
              : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Personalizado
        </button>
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#3c527a] transition-colors"
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#3c527a] transition-colors"
            />
          </div>
        )}
      </div>

      {/* ── PANEL DE COSTOS ─────────────────────────────── */}
      <div className="bg-[#3c527a] rounded-2xl p-6 text-white">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-200 mb-4">Costo estimado total</p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-3xl font-black">{usd(totalCost)}</p>
            <p className="text-xs text-blue-200 mt-1">Total histórico</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <p className="text-xl font-black">{usd(utilityCost)}</p>
            <p className="text-xs text-blue-200 mt-1">Utility</p>
            <p className="text-xs text-blue-300 mt-0.5">@ ${rates.utility.toFixed(4)}/msg</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <p className="text-xl font-black">{usd(marketingCost)}</p>
            <p className="text-xs text-blue-200 mt-1">Marketing</p>
            <p className="text-xs text-blue-300 mt-0.5">@ ${rates.marketing.toFixed(4)}/msg</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-blue-200">Campañas</p>
              <p className="text-sm font-bold">{campaignSent.toLocaleString()}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-blue-200">Automatizaciones</p>
              <p className="text-sm font-bold">{autoSent.toLocaleString()}</p>
            </div>
            <div className="border-t border-white/20 mt-2 pt-2 flex items-center justify-between">
              <p className="text-xs text-blue-200">Total enviados</p>
              <p className="text-sm font-bold">{(campaignSent + autoSent).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-blue-300 mt-3 italic">
          * Tarifas Meta oficiales para Perú (80% de audiencia). Editables en Configuración → comm_whatsapp_rates.
        </p>
      </div>

      {/* ── KPIs GENERALES ──────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Resumen general</p>
        <div className="grid grid-cols-5 gap-3">
          <KpiCard label="Total mensajes" value={overall.total?.toLocaleString() ?? 0} color="text-[#383838]" />
          <KpiCard label="Enviados" value={overall.enviados?.toLocaleString() ?? 0} color="text-blue-600"
            sub={pct(overall.enviados, overall.total)} />
          <KpiCard label="Entregados" value={overall.entregados?.toLocaleString() ?? 0} color="text-green-600"
            sub={pct(overall.entregados, overall.enviados)} />
          <KpiCard label="Leídos" value={overall.leidos?.toLocaleString() ?? 0} color="text-purple-600"
            sub={pct(overall.leidos, overall.enviados)} />
          <KpiCard label="Fallidos" value={overall.fallidos?.toLocaleString() ?? 0} color="text-red-500"
            sub={pct(overall.fallidos, overall.total)} />
        </div>

        {/* Barras de tasas */}
        {overall.total > 0 && (
          <div className="mt-3 bg-white rounded-xl border border-gray-200 p-4 space-y-2.5">
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500 w-24 flex-shrink-0">Tasa entrega</span>
              <PctBar value={deliveryPct} color="bg-green-400" />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500 w-24 flex-shrink-0">Tasa lectura</span>
              <PctBar value={readPct} color="bg-purple-400" />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500 w-24 flex-shrink-0">Tasa fallo</span>
              <PctBar value={failPct} color="bg-red-400" />
            </div>
          </div>
        )}
      </div>

      {/* ── CAMPAÑAS ────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Por campaña</p>
        {broadcasts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center py-10 text-gray-400 text-sm">
            No hay campañas enviadas aún
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Campaña', 'Template', 'Enviados', 'Entregados', 'Leídos', 'Fallidos', 'Costo est.', 'Fecha'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {broadcasts.map(b => {
                  const cost = calcCost(b.enviados ?? 0, b.template_categoria, rates);
                  return (
                    <tr key={b.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[#383838]">{b.nombre}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600 truncate max-w-[140px]">{b.template_nombre}</p>
                        {b.template_categoria && (
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                            b.template_categoria === 'utility'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-purple-50 text-purple-600'
                          }`}>
                            {b.template_categoria}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{(b.enviados ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{(b.entregados ?? 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{pct(b.entregados, b.enviados)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{(b.leidos ?? 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{pct(b.leidos, b.enviados)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`text-sm font-semibold ${b.fallidos > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {(b.fallidos ?? 0).toLocaleString()}
                        </p>
                        {b.fallidos > 0 && (
                          <p className="text-xs text-red-400">{pct(b.fallidos, b.total)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#3c527a]">{usd(cost)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(b.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── AUTOMATIZACIONES ────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Automatizaciones</p>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <KpiCard label="Enviados" value={automations?.enviados?.toLocaleString() ?? 0} color="text-blue-600"
            sub="automatizaciones" />
          <KpiCard label="Entregados" value={automations?.entregados?.toLocaleString() ?? 0} color="text-green-600"
            sub={pct(automations?.entregados, automations?.enviados)} />
          <KpiCard label="Leídos" value={automations?.leidos?.toLocaleString() ?? 0} color="text-purple-600"
            sub={pct(automations?.leidos, automations?.enviados)} />
          <KpiCard label="Fallidos" value={automations?.fallidos?.toLocaleString() ?? 0} color="text-red-500"
            sub={pct(automations?.fallidos, automations?.total)} />
        </div>

        {by_rule.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Regla', 'Tipo', 'Enviados', 'Entregados', 'Leídos', 'Fallidos', 'Costo est.'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {by_rule.map(r => {
                  const cost = calcCost(r.enviados ?? 0, r.template_categoria, rates);
                  return (
                    <tr key={r.regla_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[#383838]">{r.regla_nombre}</p>
                      </td>
                      <td className="px-4 py-3">
                        {r.template_categoria && (
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                            r.template_categoria === 'utility'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-purple-50 text-purple-600'
                          }`}>
                            {r.template_categoria}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{(r.enviados ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{(r.entregados ?? 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{pct(r.entregados, r.enviados)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{(r.leidos ?? 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{pct(r.leidos, r.enviados)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`text-sm font-semibold ${r.fallidos > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {(r.fallidos ?? 0).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#3c527a]">{usd(cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
