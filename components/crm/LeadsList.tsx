'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CrmLead, CrmPipelineStage, CrmLostReason, CrmUser } from '@/lib/crm-types';
import LeadSidePeek from './LeadSidePeek';
import { MagnifyingGlassIcon, ArrowPathIcon, ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline';

interface ActivityStat {
  count: number;
  lastAt: string;
}

function relativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  if (days >= 1) return `${days}d`;
  if (hrs >= 1) return `${hrs}h`;
  return 'ahora';
}

const PAGE_SIZE = 50;

function fmtUSD(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type SortKey = 'created_at' | 'company' | 'country' | 'estimated_value_usd' | 'stage_updated_at';
type SortDir = 'asc' | 'desc';

export default function LeadsList() {
  const { supabase } = useAuth();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [lostReasons, setLostReasons] = useState<CrmLostReason[]>([]);
  const [members, setMembers] = useState<CrmUser[]>([]);
  const [activityStats, setActivityStats] = useState<Record<string, ActivityStat>>({});
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Paginación
  const [page, setPage] = useState(1);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [leadsRes, stagesRes, reasonsRes, membersRes, activitiesRes] = await Promise.all([
      supabase.from('crm_leads').select('*'),
      supabase.from('crm_pipeline_stages').select('*').eq('is_active', true).order('display_order'),
      supabase.from('crm_lost_reasons').select('*').eq('is_active', true).order('display_order'),
      supabase.rpc('get_all_members'),
      supabase.from('crm_lead_activities').select('lead_id, created_at'),
    ]);
    setLeads(leadsRes.data ?? []);
    setStages(stagesRes.data ?? []);
    setLostReasons(reasonsRes.data ?? []);
    setMembers(membersRes.data ?? []);

    const stats: Record<string, ActivityStat> = {};
    for (const a of (activitiesRes.data ?? []) as { lead_id: string; created_at: string }[]) {
      const cur = stats[a.lead_id];
      if (!cur) {
        stats[a.lead_id] = { count: 1, lastAt: a.created_at };
      } else {
        cur.count += 1;
        if (a.created_at > cur.lastAt) cur.lastAt = a.created_at;
      }
    }
    setActivityStats(stats);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtrado
  const filteredLeads = useMemo(() => {
    let result = [...leads];
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(l =>
        (l.full_name ?? '').toLowerCase().includes(q) ||
        (l.email ?? '').toLowerCase().includes(q) ||
        (l.company ?? '').toLowerCase().includes(q),
      );
    }
    if (stageFilter !== 'all') result = result.filter(l => l.stage_id === stageFilter);
    if (ownerFilter !== 'all') {
      result = result.filter(l => (ownerFilter === 'unassigned' ? !l.assigned_to : l.assigned_to === ownerFilter));
    }
    if (countryFilter !== 'all') result = result.filter(l => l.country === countryFilter);
    if (sourceFilter !== 'all') result = result.filter(l => l.external_source === sourceFilter);
    // Sort
    result.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [leads, search, stageFilter, ownerFilter, countryFilter, sourceFilter, sortKey, sortDir]);

  // Opciones únicas para los filtros
  const countries = useMemo(() => {
    const set = new Set(leads.map(l => l.country).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [leads]);
  const sources = useMemo(() => {
    const set = new Set(leads.map(l => l.external_source).filter(Boolean));
    return Array.from(set).sort();
  }, [leads]);

  // Paginación
  const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE);
  const paginatedLeads = filteredLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, stageFilter, ownerFilter, countryFilter, sourceFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedLeads.map(l => l.id)));
    }
  };

  // Bulk: asignar a un usuario
  const bulkAssign = async (userId: string | null) => {
    if (!supabase || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('crm_leads').update({ assigned_to: userId }).in('id', ids);
    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }
    setSelectedIds(new Set());
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email, empresa..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los stages</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los owners</option>
            <option value="unassigned">Sin asignar</option>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
          </select>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los países</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todas las fuentes</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            title="Refrescar"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
            <span className="text-sm text-blue-700 font-medium">
              {selectedIds.size} seleccionados
            </span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  bulkAssign(e.target.value === 'unassigned' ? null : e.target.value);
                  e.target.value = '';
                }
              }}
              className="text-xs border border-blue-300 rounded px-2 py-1 bg-white"
            >
              <option value="">Asignar a...</option>
              <option value="unassigned">Sin asignar</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
            </select>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-blue-600 hover:underline ml-auto"
            >
              Limpiar selección
            </button>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === paginatedLeads.length && paginatedLeads.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('company')}
                >
                  Empresa {sortKey === 'company' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('country')}
                >
                  País {sortKey === 'country' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actividad</th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('estimated_value_usd')}
                >
                  Valor {sortKey === 'estimated_value_usd' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('created_at')}
                >
                  Creado {sortKey === 'created_at' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedLeads.map(lead => {
                const stage = stages.find(s => s.id === lead.stage_id);
                const owner = lead.assigned_to ? members.find(m => m.user_id === lead.assigned_to) : null;
                return (
                  <tr
                    key={lead.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelection(lead.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lead.full_name || '—'}</div>
                      <div className="text-xs text-gray-500">{lead.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{lead.company || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{lead.country || '—'}</td>
                    <td className="px-4 py-3">
                      {stage && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: stage.color }}
                        >
                          {stage.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {owner ? owner.email : <span className="text-gray-400">Sin asignar</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(() => {
                        const stat = activityStats[lead.id];
                        if (!stat) return <span className="text-gray-300 italic">sin actividad</span>;
                        return (
                          <div
                            className="flex items-center gap-1 text-blue-600"
                            title={`${stat.count} actividad${stat.count !== 1 ? 'es' : ''} · última hace ${relativeShort(stat.lastAt)}`}
                          >
                            <ChatBubbleLeftEllipsisIcon className="w-3.5 h-3.5" />
                            <span className="font-medium">{stat.count}</span>
                            <span className="text-gray-400">· {relativeShort(stat.lastAt)}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700">
                      {fmtUSD(lead.estimated_value_usd)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {fmtDate(lead.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {paginatedLeads.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No hay leads que coincidan con los filtros
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredLeads.length)} de {filteredLeads.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-xs text-gray-700">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLead && (
        <LeadSidePeek
          lead={selectedLead}
          stages={stages}
          lostReasons={lostReasons}
          members={members}
          onClose={() => setSelectedLead(null)}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}
