'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CrmPipelineStage, CrmLostReason, CrmSyncLog } from '@/lib/crm-types';
import {
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

export default function CrmConfig() {
  const { supabase } = useAuth();
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [lostReasons, setLostReasons] = useState<CrmLostReason[]>([]);
  const [syncLogs, setSyncLogs] = useState<CrmSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // New stage / lost reason inputs
  const [newStageName, setNewStageName] = useState('');
  const [newLostReasonName, setNewLostReasonName] = useState('');

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [stagesRes, reasonsRes, logsRes] = await Promise.all([
      supabase.from('crm_pipeline_stages').select('*').order('display_order'),
      supabase.from('crm_lost_reasons').select('*').order('display_order'),
      supabase.from('crm_sync_log').select('*').order('started_at', { ascending: false }).limit(10),
    ]);
    setStages(stagesRes.data ?? []);
    setLostReasons(reasonsRes.data ?? []);
    setSyncLogs(logsRes.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ===== Stages CRUD =====

  const addStage = async () => {
    if (!supabase || !newStageName.trim()) return;
    const maxOrder = stages.reduce((max, s) => Math.max(max, s.display_order), 0);
    const { error } = await supabase.from('crm_pipeline_stages').insert({
      name: newStageName.trim(),
      display_order: maxOrder + 1,
      color: '#6b7280',
    });
    if (error) return toast.error(`Error: ${error.message}`);
    setNewStageName('');
    fetchData();
  };

  const updateStage = async (id: string, updates: Partial<CrmPipelineStage>) => {
    if (!supabase) return;
    const { error } = await supabase.from('crm_pipeline_stages').update(updates).eq('id', id);
    if (error) return toast.error(`Error: ${error.message}`);
    fetchData();
  };

  const deleteStage = async (id: string) => {
    if (!supabase) return;
    if (!confirm('¿Eliminar este stage? Si tiene leads asignados, vas a tener que reasignarlos primero.')) return;
    const { error } = await supabase.from('crm_pipeline_stages').delete().eq('id', id);
    if (error) return toast.error(`Error: ${error.message}`);
    fetchData();
  };

  // ===== Lost reasons CRUD =====

  const addLostReason = async () => {
    if (!supabase || !newLostReasonName.trim()) return;
    const maxOrder = lostReasons.reduce((max, r) => Math.max(max, r.display_order), 0);
    const { error } = await supabase.from('crm_lost_reasons').insert({
      name: newLostReasonName.trim(),
      display_order: maxOrder + 1,
    });
    if (error) return toast.error(`Error: ${error.message}`);
    setNewLostReasonName('');
    fetchData();
  };

  const updateLostReason = async (id: string, updates: Partial<CrmLostReason>) => {
    if (!supabase) return;
    const { error } = await supabase.from('crm_lost_reasons').update(updates).eq('id', id);
    if (error) return toast.error(`Error: ${error.message}`);
    fetchData();
  };

  const deleteLostReason = async (id: string) => {
    if (!supabase) return;
    if (!confirm('¿Eliminar esta razón de pérdida?')) return;
    const { error } = await supabase.from('crm_lost_reasons').delete().eq('id', id);
    if (error) return toast.error(`Error: ${error.message}`);
    fetchData();
  };

  // ===== Sync ahora (manual trigger) =====

  const triggerSync = async () => {
    if (!supabase) return;
    setSyncing(true);
    try {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!anonKey || !supabaseUrl) {
        toast.error('Faltan env vars');
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch(`${supabaseUrl}/functions/v1/sync-crm-leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken ?? anonKey}`,
        },
        body: JSON.stringify({ manual: true }),
      });
      const result = await response.json();
      if (response.ok) {
        toast.success(`Sync completado: ${result.leads_inserted ?? 0} nuevos leads`);
      } else {
        toast.error(`Sync failed: ${result.error ?? response.status}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pipeline Stages */}
      <section className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Pipeline Stages</h3>
            <p className="text-xs text-gray-500 mt-0.5">Las etapas por las que pasa un lead. El orden define el Kanban.</p>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {stages.map(stage => (
            <div key={stage.id} className="px-6 py-3 flex items-center gap-3">
              <input
                type="color"
                value={stage.color}
                onChange={(e) => updateStage(stage.id, { color: e.target.value })}
                className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={stage.name}
                onChange={(e) => updateStage(stage.id, { name: e.target.value })}
                className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="number"
                value={stage.display_order}
                onChange={(e) => updateStage(stage.id, { display_order: parseInt(e.target.value) || 0 })}
                className="w-16 text-sm border border-gray-200 rounded px-2 py-1"
                title="Orden"
              />
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={stage.is_default_entry}
                  onChange={(e) => updateStage(stage.id, { is_default_entry: e.target.checked })}
                  disabled={stage.is_default_entry}
                  title="Stage inicial — solo uno"
                />
                Default
              </label>
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={stage.is_won}
                  onChange={(e) => updateStage(stage.id, { is_won: e.target.checked, is_lost: false })}
                />
                Won
              </label>
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={stage.is_lost}
                  onChange={(e) => updateStage(stage.id, { is_lost: e.target.checked, is_won: false })}
                />
                Lost
              </label>
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={stage.is_active}
                  onChange={(e) => updateStage(stage.id, { is_active: e.target.checked })}
                />
                Activo
              </label>
              <button
                onClick={() => deleteStage(stage.id)}
                className="text-red-400 hover:text-red-600"
                title="Eliminar"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="px-6 py-3 flex items-center gap-3 bg-gray-50">
            <input
              type="text"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStage()}
              placeholder="Nuevo stage..."
              className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addStage}
              disabled={!newStageName.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded disabled:bg-gray-300"
            >
              <PlusIcon className="w-4 h-4" />
              Agregar
            </button>
          </div>
        </div>
      </section>

      {/* Lost Reasons */}
      <section className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Razones de pérdida</h3>
          <p className="text-xs text-gray-500 mt-0.5">Las opciones que aparecen en el modal cuando marcas un lead como perdido.</p>
        </div>
        <div className="divide-y divide-gray-100">
          {lostReasons.map(reason => (
            <div key={reason.id} className="px-6 py-3 flex items-center gap-3">
              <input
                type="text"
                value={reason.name}
                onChange={(e) => updateLostReason(reason.id, { name: e.target.value })}
                className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="number"
                value={reason.display_order}
                onChange={(e) => updateLostReason(reason.id, { display_order: parseInt(e.target.value) || 0 })}
                className="w-16 text-sm border border-gray-200 rounded px-2 py-1"
              />
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={reason.is_active}
                  onChange={(e) => updateLostReason(reason.id, { is_active: e.target.checked })}
                />
                Activo
              </label>
              <button
                onClick={() => deleteLostReason(reason.id)}
                className="text-red-400 hover:text-red-600"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="px-6 py-3 flex items-center gap-3 bg-gray-50">
            <input
              type="text"
              value={newLostReasonName}
              onChange={(e) => setNewLostReasonName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLostReason()}
              placeholder="Nueva razón..."
              className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addLostReason}
              disabled={!newLostReasonName.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded disabled:bg-gray-300"
            >
              <PlusIcon className="w-4 h-4" />
              Agregar
            </button>
          </div>
        </div>
      </section>

      {/* Sync status */}
      <section className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Sync con API externa</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Cron automático cada 5 min. Las credenciales (LEADS_API_URL, LEADS_API_TOKEN) viven como Edge Function secrets.
            </p>
          </div>
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
          >
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sync ahora'}
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {syncLogs.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">Sin runs de sync todavía</p>
          ) : (
            syncLogs.map(log => {
              const date = new Date(log.started_at);
              return (
                <div key={log.id} className="px-6 py-3 flex items-center gap-3">
                  {log.status === 'success' ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : log.status === 'partial' ? (
                    <CheckCircleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  ) : log.status === 'running' ? (
                    <ArrowPathIcon className="w-5 h-5 text-blue-500 flex-shrink-0 animate-spin" />
                  ) : (
                    <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      {date.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {log.leads_fetched ?? 0} fetched · {log.leads_inserted ?? 0} insertados · {log.leads_skipped ?? 0} duplicados
                    </p>
                    {log.error_message && (
                      <p className="text-xs text-red-600 mt-0.5 truncate" title={log.error_message}>
                        {log.error_message}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    log.status === 'success' ? 'bg-green-50 text-green-700'
                    : log.status === 'partial' ? 'bg-amber-50 text-amber-700'
                    : log.status === 'error' ? 'bg-red-50 text-red-700'
                    : 'bg-blue-50 text-blue-700'
                  }`}>
                    {log.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
