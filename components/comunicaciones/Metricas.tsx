'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const DEFAULT_RATES = { utility: 0.0200, marketing: 0.0703 };

function pct(num: number, den: number) {
  if (!den) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

function usd(amount: number) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type DateFilter = 'semana' | 'mes' | 'todo' | 'custom';

interface BroadcastRow {
  id: number;
  nombre: string;
  created_at: string;
  estado: string;
  total_destinatarios: number;
  enviados: number;
  entregados: number;
  leidos: number;
  kapso_broadcast_id: string | null;
  comm_templates: {
    nombre: string;
    categoria: 'utility' | 'marketing' | null;
  } | null;
}

interface AutoLogRow {
  evento_tipo: string;
  estado: string;
  created_at: string;
}

export default function Metricas() {
  const { supabase } = useAuth();
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [autoLogs, setAutoLogs] = useState<AutoLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('todo');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rates, setRates] = useState(DEFAULT_RATES);

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

  const getDateRange = useCallback(() => {
    const now = new Date();
    if (dateFilter === 'semana') {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    if (dateFilter === 'mes') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    if (dateFilter === 'custom' && customFrom) {
      return {
        from: new Date(customFrom).toISOString(),
        to: customTo ? new Date(customTo + 'T23:59:59').toISOString() : now.toISOString(),
      };
    }
    return { from: null, to: null };
  }, [dateFilter, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { from, to } = getDateRange();

    // Fetch broadcasts
    let bQuery = supabase
      .from('comm_broadcasts')
      .select('id, nombre, created_at, estado, total_destinatarios, enviados, entregados, leidos, kapso_broadcast_id, comm_templates(nombre, categoria)')
      .order('created_at', { ascending: false });
    if (from) bQuery = bQuery.gte('created_at', from);
    if (to) bQuery = bQuery.lte('created_at', to);

    // Fetch automation logs
    let aQuery = supabase
      .from('comm_message_logs')
      .select('evento_tipo, estado, created_at')
      .not('evento_tipo', 'is', null)
      .neq('evento_tipo', 'auto_reply');
    if (from) aQuery = aQuery.gte('created_at', from);
    if (to) aQuery = aQuery.lte('created_at', to);

    const [bRes, aRes] = await Promise.all([bQuery, aQuery.limit(5000)]);

    if (bRes.error) toast.error('Error al cargar campañas');
    if (aRes.error) toast.error('Error al cargar automatizaciones');

    setBroadcasts((bRes.data ?? []) as BroadcastRow[]);
    setAutoLogs((aRes.data ?? []) as AutoLogRow[]);
    setLoading(false);
  }, [supabase, getDateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sync all broadcasts from Kapso
  const handleSyncAll = async () => {
    const withKapso = broadcasts.filter(b => b.kapso_broadcast_id);
    if (withKapso.length === 0) { toast.error('No hay campañas con Kapso ID'); return; }
    setSyncing(true);
    let synced = 0;
    for (const b of withKapso) {
      try {
        const res = await fetch('/api/communication/sync-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ broadcastId: b.id }),
        });
        if (res.ok) synced++;
      } catch { /* continue */ }
    }
    toast.success(`${synced} campaña${synced !== 1 ? 's' : ''} sincronizada${synced !== 1 ? 's' : ''}`);
    setSyncing(false);
    fetchData();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Cargando métricas...</div>;
  }

  // ── Compute aggregates ──
  const totalDest = broadcasts.reduce((s, b) => s + (b.total_destinatarios ?? 0), 0);
  const totalEnviados = broadcasts.reduce((s, b) => s + (b.enviados ?? 0), 0);
  const totalEntregados = broadcasts.reduce((s, b) => s + (b.entregados ?? 0), 0);
  const totalLeidos = broadcasts.reduce((s, b) => s + (b.leidos ?? 0), 0);

  const deliveryPct = totalEnviados > 0 ? Math.round(totalEntregados / totalEnviados * 100) : 0;
  const readPct = totalEntregados > 0 ? Math.round(totalLeidos / totalEntregados * 100) : 0;

  // Cost by category
  let utilityCost = 0;
  let marketingCost = 0;
  broadcasts.forEach(b => {
    const cat = b.comm_templates?.categoria ?? 'utility';
    const cost = (b.enviados ?? 0) * rates[cat];
    if (cat === 'marketing') marketingCost += cost;
    else utilityCost += cost;
  });
  const totalCost = utilityCost + marketingCost;

  // Automation stats
  const autoTotal = autoLogs.filter(l => l.evento_tipo && l.evento_tipo !== 'auto_reply').length;
  const autoSent = autoLogs.filter(l => l.estado === 'sent' || l.estado === 'delivered' || l.estado === 'read').length;
  const autoFailed = autoLogs.filter(l => l.estado === 'failed').length;

  // Group automation by evento_tipo
  const autoByType: Record<string, { total: number; sent: number; failed: number }> = {};
  autoLogs.forEach(l => {
    if (!l.evento_tipo || l.evento_tipo === 'auto_reply') return;
    if (!autoByType[l.evento_tipo]) autoByType[l.evento_tipo] = { total: 0, sent: 0, failed: 0 };
    autoByType[l.evento_tipo].total++;
    if (l.estado === 'failed') autoByType[l.evento_tipo].failed++;
    else autoByType[l.evento_tipo].sent++;
  });

  const autoTypeLabels: Record<string, string> = {
    vencimiento: 'Vencimiento de plan',
    registro_taller: 'Registro a taller',
    plan_cancelado: 'Plan cancelado',
    bienvenida: 'Bienvenida',
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#383838]">Métricas</h2>
          <p className="text-sm text-gray-500 mt-0.5">Rendimiento y costos de campañas y automatizaciones WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#3c527a] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <span className={syncing ? 'animate-spin inline-block' : ''}>↻</span>
            {syncing ? 'Sincronizando...' : 'Sync Kapso'}
          </button>
        </div>
      </div>

      {/* Date filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['semana', 'mes', 'todo'] as DateFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setDateFilter(f)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              dateFilter === f ? 'bg-[#3c527a] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {f === 'semana' ? '7 días' : f === 'mes' ? 'Este mes' : 'Todo'}
          </button>
        ))}
        <button
          onClick={() => setDateFilter('custom')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            dateFilter === 'custom' ? 'bg-[#3c527a] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Personalizado
        </button>
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#3c527a]" />
            <span className="text-xs text-gray-400">→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#3c527a]" />
          </div>
        )}
      </div>

      {/* ── COST PANEL ─────────────────────────────── */}
      <div className="bg-[#3c527a] rounded-2xl p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-200 mb-3">Costo estimado</p>
        <div className="flex gap-4">
          <div>
            <p className="text-2xl font-black">{usd(totalCost)}</p>
            <p className="text-xs text-blue-200 mt-0.5">Total</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-3">
            <p className="text-lg font-black">{usd(utilityCost)}</p>
            <p className="text-xs text-blue-200">Utility @ ${rates.utility.toFixed(4)}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-3">
            <p className="text-lg font-black">{usd(marketingCost)}</p>
            <p className="text-xs text-blue-200">Marketing @ ${rates.marketing.toFixed(4)}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-3 ml-auto">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-xs text-blue-200">Campañas</p>
                <p className="text-sm font-bold">{totalEnviados.toLocaleString('es')}</p>
              </div>
              <div>
                <p className="text-xs text-blue-200">Automatizaciones</p>
                <p className="text-sm font-bold">{autoSent.toLocaleString('es')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI SUMMARY ──────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Resumen campañas</p>
        <div className="flex gap-3 mb-3">
          {[
            { label: 'Destinatarios', value: totalDest, color: 'text-gray-700', bg: 'bg-gray-50' },
            { label: 'Enviados', value: totalEnviados, sub: pct(totalEnviados, totalDest), color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'Entregados', value: totalEntregados, sub: `${deliveryPct}%`, color: 'text-green-700', bg: 'bg-green-50' },
            { label: 'Leídos', value: totalLeidos, sub: `${readPct}%`, color: 'text-purple-700', bg: 'bg-purple-50' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl px-4 py-3 border border-gray-100`}>
              <p className="text-xs text-gray-500 font-medium mb-0.5">{k.label}</p>
              <div className="flex items-baseline gap-1.5">
                <p className={`text-lg font-black ${k.color}`}>{k.value.toLocaleString('es')}</p>
                {k.sub && <p className="text-xs text-gray-400">{k.sub}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Rate bars */}
        {totalEnviados > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            {[
              { label: 'Tasa entrega', val: deliveryPct, color: 'bg-green-400' },
              { label: 'Tasa lectura', val: readPct, color: 'bg-purple-400' },
            ].map(r => (
              <div key={r.label} className="flex items-center gap-4">
                <span className="text-xs text-gray-500 w-24 flex-shrink-0">{r.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${r.color}`} style={{ width: `${Math.min(r.val, 100)}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right">{r.val}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CAMPAIGNS TABLE ────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
          Por campaña ({broadcasts.length})
        </p>
        {broadcasts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center py-10 text-gray-400 text-sm">
            No hay campañas en este período
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Campaña', 'Tipo', 'Enviados', 'Funnel', 'Costo', 'Fecha'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {broadcasts.map(b => {
                  const cat = b.comm_templates?.categoria ?? 'utility';
                  const cost = (b.enviados ?? 0) * rates[cat];
                  const bDelivery = b.enviados > 0 ? Math.round((b.entregados ?? 0) / b.enviados * 100) : 0;
                  const bRead = b.entregados > 0 ? Math.round((b.leidos ?? 0) / (b.entregados ?? 1) * 100) : 0;
                  return (
                    <tr key={b.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[#383838]">{b.nombre}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[180px]">{b.comm_templates?.nombre}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          cat === 'marketing' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                        }`}>{cat}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-gray-700">{(b.enviados ?? 0).toLocaleString('es')}</p>
                        <p className="text-xs text-gray-400">de {(b.total_destinatarios ?? 0).toLocaleString('es')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs font-semibold">
                          <span className="text-blue-600">{(b.enviados ?? 0)}</span>
                          <span className="text-gray-300">→</span>
                          <span className="text-green-600">{(b.entregados ?? 0)}</span>
                          <span className="text-xs text-gray-400 font-normal">({bDelivery}%)</span>
                          <span className="text-gray-300">→</span>
                          <span className="text-purple-600">{(b.leidos ?? 0)}</span>
                          <span className="text-xs text-gray-400 font-normal">({bRead}%)</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#3c527a]">{usd(cost)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(b.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── AUTOMATIONS ────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Automatizaciones</p>
        <div className="flex gap-3 mb-4">
          {[
            { label: 'Total', value: autoTotal, color: 'text-gray-700', bg: 'bg-gray-50' },
            { label: 'Enviados', value: autoSent, color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'Fallidos', value: autoFailed, color: 'text-red-600', bg: 'bg-red-50' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl px-4 py-3 border border-gray-100`}>
              <p className="text-xs text-gray-500 font-medium mb-0.5">{k.label}</p>
              <p className={`text-lg font-black ${k.color}`}>{k.value.toLocaleString('es')}</p>
            </div>
          ))}
        </div>

        {Object.keys(autoByType).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Tipo', 'Enviados', 'Fallidos', 'Tasa éxito'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(autoByType).map(([tipo, stats]) => (
                  <tr key={tipo} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-[#383838]">
                      {autoTypeLabels[tipo] ?? tipo}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{stats.sent.toLocaleString('es')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-semibold ${stats.failed > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {stats.failed.toLocaleString('es')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[100px]">
                          <div className="h-1.5 rounded-full bg-green-400" style={{ width: `${stats.total > 0 ? Math.round(stats.sent / stats.total * 100) : 0}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{pct(stats.sent, stats.total)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {Object.keys(autoByType).length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center py-10 text-gray-400 text-sm">
            No hay automatizaciones en este período
          </div>
        )}
      </div>
    </div>
  );
}
