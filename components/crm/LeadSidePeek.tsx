'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CrmLead, CrmPipelineStage, CrmLostReason, CrmUser, CrmLeadActivity } from '@/lib/crm-types';
import {
  XMarkIcon,
  GlobeAltIcon,
  CurrencyDollarIcon,
  CalendarDaysIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface LeadSidePeekProps {
  lead: CrmLead;
  stages: CrmPipelineStage[];
  lostReasons: CrmLostReason[];
  members: CrmUser[];
  onClose: () => void;
  onUpdate: () => void;
}

const AUTOSAVE_DEBOUNCE_MS = 1500;

export default function LeadSidePeek({
  lead: initialLead,
  stages,
  lostReasons,
  members,
  onClose,
  onUpdate,
}: LeadSidePeekProps) {
  const { supabase, user } = useAuth();
  const [lead, setLead] = useState<CrmLead>(initialLead);
  const [activities, setActivities] = useState<CrmLeadActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [newActivityContent, setNewActivityContent] = useState('');
  const [newActivityType, setNewActivityType] = useState<CrmLeadActivity['activity_type']>('note');
  const [postingActivity, setPostingActivity] = useState(false);

  // Auto-save state
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sincronizar local state cuando cambia el lead.id (no en cada refetch del padre)
  useEffect(() => {
    setLead(initialLead);
  }, [initialLead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const stage = stages.find(s => s.id === lead.stage_id);
  const lostReason = lead.lost_reason_id ? lostReasons.find(r => r.id === lead.lost_reason_id) : null;

  const fetchActivities = useCallback(async () => {
    if (!supabase) return;
    setActivitiesLoading(true);
    const { data } = await supabase
      .from('crm_lead_activities')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });
    setActivities(data ?? []);
    setActivitiesLoading(false);
  }, [supabase, lead.id]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Auto-save (debounced) — solo para campos editables del lead
  const persistChanges = useCallback(
    async (updates: Partial<CrmLead>) => {
      if (!supabase) return;
      setSaving(true);
      const { error } = await supabase
        .from('crm_leads')
        .update(updates)
        .eq('id', lead.id);
      setSaving(false);
      if (error) {
        toast.error(`Error guardando: ${error.message}`);
      } else {
        onUpdate();
      }
    },
    [supabase, lead.id, onUpdate],
  );

  const updateField = useCallback(
    <K extends keyof CrmLead>(field: K, value: CrmLead[K]) => {
      setLead(prev => ({ ...prev, [field]: value }));
      // Debounced save
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        persistChanges({ [field]: value });
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persistChanges],
  );

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Asignación instantánea (sin debounce)
  const handleAssign = async (userId: string | null) => {
    setLead(prev => ({ ...prev, assigned_to: userId }));
    await persistChanges({ assigned_to: userId });
    fetchActivities(); // refrescar timeline
  };

  // Eliminar lead
  const handleDelete = async () => {
    if (!supabase) return;
    const confirmed = window.confirm(
      `¿Eliminar este lead?\n\n${lead.full_name || lead.email || lead.company || 'Sin nombre'}\n\nEsta acción no se puede deshacer.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id);
    setDeleting(false);
    if (error) {
      toast.error(`Error eliminando: ${error.message}`);
      return;
    }
    toast.success('Lead eliminado');
    onUpdate();
    onClose();
  };

  // Crear actividad manual
  const handlePostActivity = async () => {
    if (!supabase || !user || !newActivityContent.trim()) return;
    setPostingActivity(true);
    const { error } = await supabase.from('crm_lead_activities').insert({
      lead_id: lead.id,
      user_id: user.id,
      activity_type: newActivityType,
      content: newActivityContent.trim(),
    });
    setPostingActivity(false);
    if (error) {
      toast.error(`Error: ${error.message}`);
      return;
    }
    setNewActivityContent('');
    fetchActivities();
  };

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" />

      {/* Side panel */}
      <aside
        className="w-full max-w-2xl bg-white shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {lead.full_name || lead.email || 'Sin nombre'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {stage && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: stage.color }}
                >
                  {stage.name}
                </span>
              )}
              {lostReason && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  {lostReason.name}
                </span>
              )}
              {saving && (
                <span className="text-xs text-gray-400 italic">Guardando...</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-600 disabled:opacity-50"
              title="Eliminar lead"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Datos básicos del lead — editables */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Información del lead
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <EditableField
                label="Nombre completo"
                value={lead.full_name ?? ''}
                onChange={(v) => updateField('full_name', v || null)}
                placeholder="Ana García"
                fullWidth
              />
              <EditableField
                label="Email"
                value={lead.email ?? ''}
                onChange={(v) => updateField('email', v || null)}
                placeholder="ana@empresa.com"
                type="email"
              />
              <EditableField
                label="Teléfono"
                value={lead.phone ?? ''}
                onChange={(v) => updateField('phone', v || null)}
                placeholder="+51 999 888 777"
              />
              <EditableField
                label="Empresa / Institución"
                value={lead.company ?? ''}
                onChange={(v) => updateField('company', v || null)}
                placeholder="Colegio San Martín"
              />
              <EditableField
                label="Cargo"
                value={lead.position ?? ''}
                onChange={(v) => updateField('position', v || null)}
                placeholder="Director"
              />
              <EditableField
                label="País"
                value={lead.country ?? ''}
                onChange={(v) => updateField('country', v || null)}
                placeholder="Perú"
              />
            </div>
            {lead.external_source && (
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-3">
                <GlobeAltIcon className="w-3 h-3" />
                <span>Fuente: {lead.external_source}</span>
              </div>
            )}
            {(lead.utm_campaign || lead.utm_source) && (
              <div className="text-xs text-gray-400 mt-1 ml-5">
                UTM: {[lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ')}
              </div>
            )}
          </section>

          {/* Asignación */}
          <section>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
              Asignado a
            </label>
            <select
              value={lead.assigned_to ?? ''}
              onChange={(e) => handleAssign(e.target.value || null)}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Sin asignar</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.email}
                </option>
              ))}
            </select>
          </section>

          {/* Próximo paso */}
          <section>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
              Próximo paso
            </label>
            <input
              type="text"
              value={lead.next_step ?? ''}
              onChange={(e) => updateField('next_step', e.target.value)}
              placeholder="Ej: Llamar el viernes 11am"
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="mt-2">
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <CalendarDaysIcon className="w-3 h-3" />
                Fecha del próximo paso
              </label>
              <input
                type="datetime-local"
                value={lead.next_step_at ? lead.next_step_at.slice(0, 16) : ''}
                onChange={(e) => updateField('next_step_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </section>

          {/* Valores del deal */}
          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2 flex items-center gap-1">
                <CurrencyDollarIcon className="w-3 h-3" />
                Valor estimado
              </label>
              <input
                type="number"
                value={lead.estimated_value_usd ?? ''}
                onChange={(e) => updateField('estimated_value_usd', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0"
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {stage?.is_won && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2 flex items-center gap-1">
                  <CurrencyDollarIcon className="w-3 h-3" />
                  Valor cerrado
                </label>
                <input
                  type="number"
                  value={lead.won_value_usd ?? ''}
                  onChange={(e) => updateField('won_value_usd', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="0"
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
            )}
          </section>

          {/* Notas largas (texto plano por ahora — TipTap se puede agregar después) */}
          <section>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
              Notas
            </label>
            <textarea
              value={typeof lead.notes === 'string' ? lead.notes : ''}
              onChange={(e) => updateField('notes', e.target.value as unknown as Record<string, unknown>)}
              rows={5}
              placeholder="Notas internas sobre este lead..."
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </section>

          {/* Activity timeline */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Actividades
            </h3>

            {/* Form para agregar nueva actividad */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
              <div className="flex gap-2 mb-2">
                <select
                  value={newActivityType}
                  onChange={(e) => setNewActivityType(e.target.value as CrmLeadActivity['activity_type'])}
                  className="text-xs border border-gray-300 rounded px-2 py-1"
                >
                  <option value="note">Nota</option>
                  <option value="email_sent">Email enviado</option>
                  <option value="call_made">Llamada</option>
                  <option value="meeting">Reunión</option>
                </select>
              </div>
              <textarea
                value={newActivityContent}
                onChange={(e) => setNewActivityContent(e.target.value)}
                placeholder="Describe la actividad..."
                rows={2}
                className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handlePostActivity}
                  disabled={!newActivityContent.trim() || postingActivity}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    newActivityContent.trim() && !postingActivity
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {postingActivity ? 'Guardando...' : 'Agregar'}
                </button>
              </div>
            </div>

            {/* Timeline de actividades */}
            {activitiesLoading ? (
              <p className="text-xs text-gray-400">Cargando actividades...</p>
            ) : activities.length === 0 ? (
              <p className="text-xs text-gray-400">Sin actividades aún</p>
            ) : (
              <div className="space-y-2">
                {activities.map(act => {
                  const actUser = members.find(m => m.user_id === act.user_id);
                  const date = new Date(act.created_at);
                  const fmtDate = date.toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div key={act.id} className="border-l-2 border-gray-200 pl-3 py-1">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">
                          {actUser?.email ?? 'Sistema'}
                        </span>
                        <span>•</span>
                        <span className="capitalize">{act.activity_type.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>{fmtDate}</span>
                      </div>
                      {act.content && (
                        <p className="text-sm text-gray-700 mt-0.5">{act.content}</p>
                      )}
                      {act.metadata && (act.activity_type === 'stage_changed' || act.activity_type === 'assigned') && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">
                          {act.activity_type === 'stage_changed' && (
                            <>
                              {(() => {
                                const m = act.metadata as { from_stage_id?: string; to_stage_id?: string };
                                const from = stages.find(s => s.id === m.from_stage_id);
                                const to = stages.find(s => s.id === m.to_stage_id);
                                return `${from?.name ?? '?'} → ${to?.name ?? '?'}`;
                              })()}
                            </>
                          )}
                          {act.activity_type === 'assigned' && (
                            <>
                              {(() => {
                                const m = act.metadata as { from_user_id?: string; to_user_id?: string };
                                const from = members.find(u => u.user_id === m.from_user_id);
                                const to = members.find(u => u.user_id === m.to_user_id);
                                return `${from?.email ?? 'sin asignar'} → ${to?.email ?? 'sin asignar'}`;
                              })()}
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  fullWidth = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-300 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}
