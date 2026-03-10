'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

type TipoEvento = 'vencimiento' | 'registro_taller' | 'plan_cancelado';
type TimingDirection = 'before' | 'after';

interface EventRule {
  id: string;
  nombre: string;
  evento_tipo: TipoEvento;
  timing_dias: number;
  timing_direction: TimingDirection;
  template_id: string | null;
  activo: boolean;
  trigger_source: 'n8n' | 'webhook' | 'cron';
  created_at: string;
  updated_at: string;
  // joined
  template_nombre?: string;
}

interface CommTemplate {
  id: string;
  nombre: string;
  estado: string;
}

const TIPOS_EVENTO: {
  value: TipoEvento; label: string; trigger: string; icon: string; color: string;
  timingLabel: (dias: number, dir: TimingDirection) => string;
}[] = [
  {
    value: 'vencimiento',
    label: 'Vencimiento de plan',
    trigger: 'cron',
    icon: '⏳',
    color: '#D97706',
    timingLabel: (dias, dir) => dias === 0
      ? 'El día del vencimiento'
      : `${dias} día${dias !== 1 ? 's' : ''} ${dir === 'before' ? 'antes del vencimiento' : 'después del vencimiento'}`,
  },
  {
    value: 'registro_taller',
    label: 'Registro a taller',
    trigger: 'webhook',
    icon: '🎓',
    color: '#3c527a',
    timingLabel: (dias, dir) => dias === 0
      ? 'Inmediatamente al registrarse'
      : `${dias} día${dias !== 1 ? 's' : ''} ${dir === 'after' ? 'después del registro' : 'antes del taller'}`,
  },
  {
    value: 'plan_cancelado',
    label: 'Plan cancelado',
    trigger: 'webhook',
    icon: '❌',
    color: '#DC2626',
    timingLabel: (dias, dir) => dias === 0
      ? 'Inmediatamente al cancelar'
      : `${dias} día${dias !== 1 ? 's' : ''} ${dir === 'after' ? 'después de la cancelación' : 'antes de la cancelación'}`,
  },
];

// ──────────────────────────────────────────
// Toggle
// ──────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-green-500' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-5' : 'left-0.5'}`}
      />
    </button>
  );
}

// ──────────────────────────────────────────
// Rule Form Modal
// ──────────────────────────────────────────
function RuleForm({ rule, templates, onClose, onSave }: {
  rule?: EventRule | null;
  templates: CommTemplate[];
  onClose: () => void;
  onSave: (r: EventRule) => void;
}) {
  const { supabase, user } = useAuth();
  const [nombre, setNombre] = useState(rule?.nombre ?? '');
  const [eventoTipo, setEventoTipo] = useState<TipoEvento>(rule?.evento_tipo ?? 'vencimiento');
  const [timingDias, setTimingDias] = useState(rule?.timing_dias ?? 0);
  const [timingDirection, setTimingDirection] = useState<TimingDirection>(rule?.timing_direction ?? 'before');
  const [templateId, setTemplateId] = useState<string | null>(rule?.template_id ?? null);
  const [activo, setActivo] = useState(rule?.activo ?? true);
  const [saving, setSaving] = useState(false);

  const tipoInfo = TIPOS_EVENTO.find(t => t.value === eventoTipo);
  const approvedTemplates = templates.filter(t => t.estado === 'aprobado');

  const handleSave = async () => {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!templateId) { toast.error('Selecciona un template'); return; }
    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        evento_tipo: eventoTipo,
        timing_dias: timingDias,
        timing_direction: timingDirection,
        template_id: templateId,
        activo,
        trigger_source: tipoInfo?.trigger ?? 'webhook',
        updated_at: new Date().toISOString(),
      };
      let result;
      if (rule?.id) {
        const { data, error } = await supabase!
          .from('comm_event_rules')
          .update(payload)
          .eq('id', rule.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase!
          .from('comm_event_rules')
          .insert({ ...payload, created_by: user?.id, created_at: new Date().toISOString() })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
      const tpl = templates.find(t => t.id === result.template_id);
      onSave({ ...result, template_nombre: tpl?.nombre });
      toast.success(rule?.id ? 'Regla actualizada' : 'Regla creada');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
        <div className="bg-[#3c527a] px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-wide mb-0.5">Automatizaciones</p>
            <h2 className="text-white text-lg font-bold">{rule ? 'Editar regla' : 'Nueva regla'}</h2>
          </div>
          <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Nombre de la regla</label>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="ej. Aviso 7 días antes"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors"
            />
          </div>

          {/* Tipo de evento */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Tipo de evento</label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_EVENTO.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setEventoTipo(t.value); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    eventoTipo === t.value
                      ? 'border-[#3c527a] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span>{t.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{t.label}</p>
                    <p className="text-xs text-gray-400">{t.trigger}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Timing */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Timing</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={365}
                value={timingDias}
                onChange={e => setTimingDias(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors text-center"
              />
              <span className="text-sm text-gray-500">días</span>
              <select
                value={timingDirection}
                onChange={e => setTimingDirection(e.target.value as TimingDirection)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors bg-white"
              >
                <option value="before">antes del evento</option>
                <option value="after">después del evento</option>
              </select>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              → {tipoInfo?.timingLabel(timingDias, timingDirection)}
            </p>
          </div>

          {/* Template */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Template
              {approvedTemplates.length === 0 && (
                <span className="ml-2 text-yellow-600 font-normal normal-case">— No hay templates aprobados aún</span>
              )}
            </label>
            <select
              value={templateId ?? ''}
              onChange={e => setTemplateId(e.target.value || null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors bg-white"
            >
              <option value="">Seleccionar template...</option>
              {approvedTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-semibold text-gray-700">Activo al crear</p>
              <p className="text-xs text-gray-400">Puedes cambiar esto después desde la lista</p>
            </div>
            <Toggle value={activo} onChange={setActivo} />
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between bg-gray-50">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !nombre.trim() || !templateId}
            className="px-4 py-2 text-sm font-semibold bg-[#ff8080] hover:bg-[#ff6b6b] text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : rule ? 'Guardar cambios' : 'Crear regla'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────
export default function Automatizaciones() {
  const { supabase } = useAuth();
  const [rules, setRules] = useState<EventRule[]>([]);
  const [templates, setTemplates] = useState<CommTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<EventRule | null>(null);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [rulesRes, templatesRes] = await Promise.all([
      supabase.from('comm_event_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('comm_templates').select('id, nombre, estado').order('nombre'),
    ]);
    if (rulesRes.error) toast.error('Error al cargar reglas');
    if (templatesRes.error) toast.error('Error al cargar templates');

    const tplMap = new Map((templatesRes.data ?? []).map((t: CommTemplate) => [t.id, t.nombre]));
    const enriched = (rulesRes.data ?? []).map((r: EventRule) => ({
      ...r,
      template_nombre: tplMap.get(r.template_id ?? 0) ?? '—',
    }));

    setRules(enriched);
    setTemplates(templatesRes.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (rule: EventRule) => {
    if (!supabase) return;
    const newActivo = !rule.activo;
    const { error } = await supabase
      .from('comm_event_rules')
      .update({ activo: newActivo, updated_at: new Date().toISOString() })
      .eq('id', rule.id);
    if (error) { toast.error('Error al actualizar'); return; }
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, activo: newActivo } : r));
  };

  const handleSave = (saved: EventRule) => {
    setRules(prev => {
      const idx = prev.findIndex(r => r.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setShowForm(false);
    setEditingRule(null);
  };

  const handleDelete = async (id: number) => {
    if (!supabase) return;
    if (!confirm('¿Eliminar esta regla?')) return;
    const { error } = await supabase.from('comm_event_rules').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    setRules(prev => prev.filter(r => r.id !== id));
    toast.success('Regla eliminada');
  };

  // Group by event type
  const grouped = TIPOS_EVENTO.map(tipo => ({
    ...tipo,
    rules: rules.filter(r => r.evento_tipo === tipo.value),
  }));

  const totalActivas = rules.filter(r => r.activo).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#383838]">Automatizaciones</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Reglas de timing para notificaciones automáticas por evento
          </p>
        </div>
        <button
          onClick={() => { setEditingRule(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#ff8080] hover:bg-[#ff6b6b] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          Nueva regla
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-2xl font-black text-green-600">{totalActivas}</p>
          <p className="text-xs text-gray-500 mt-0.5">Reglas activas</p>
        </div>
        <div className="bg-gray-100 rounded-xl p-4">
          <p className="text-2xl font-black text-gray-600">{rules.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total de reglas</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-2xl font-black text-[#3c527a]">{TIPOS_EVENTO.filter(t => grouped.find(g => g.value === t.value)!.rules.length > 0).length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Tipos de evento configurados</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Cargando reglas...
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-sm">No hay reglas configuradas.</p>
          <button
            onClick={() => { setEditingRule(null); setShowForm(true); }}
            className="mt-3 text-sm text-[#ff8080] hover:underline font-medium"
          >
            Crear la primera regla
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(grupo => {
            if (grupo.rules.length === 0) return null;
            return (
              <div key={grupo.value} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Group header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-xl">{grupo.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-gray-700">{grupo.label}</p>
                    <p className="text-xs text-gray-400">
                      {grupo.trigger === 'cron' ? 'Ejecutado diariamente a las 9am (Edge Function)' : 'Disparado por webhook (n8n)'}
                    </p>
                  </div>
                  <span className="ml-auto text-xs font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                    {grupo.rules.filter(r => r.activo).length}/{grupo.rules.length} activas
                  </span>
                </div>

                {/* Rules */}
                <div className="divide-y divide-gray-100">
                  {grupo.rules.map(rule => (
                    <div key={rule.id} className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${rule.activo ? '' : 'opacity-50'}`}>
                      <Toggle value={rule.activo} onChange={() => handleToggle(rule)} />

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#383838]">{rule.nombre}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-500">
                            {TIPOS_EVENTO.find(t => t.value === rule.evento_tipo)
                              ?.timingLabel(rule.timing_dias, rule.timing_direction)}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="text-xs text-[#3c527a] font-medium truncate max-w-[180px]">
                            {rule.template_nombre}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => { setEditingRule(rule); setShowForm(true); }}
                          className="text-xs text-gray-400 hover:text-[#3c527a] font-medium px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="text-xs text-gray-400 hover:text-red-500 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info card: how automations work */}
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Cómo funcionan las automatizaciones</p>
        <p className="text-xs text-amber-700 mt-1">
          <strong>Vencimiento:</strong> Edge Function de Supabase corre diariamente a las 9am (UTC-5). Revisa todos los usuarios con plan activo y envía mensajes según el timing configurado.
        </p>
        <p className="text-xs text-amber-600 mt-1.5">
          <strong>Registro a taller / Plan cancelado:</strong> Disparados desde n8n vía webhook cuando ocurre el evento en Bubble.
        </p>
      </div>

      {showForm && (
        <RuleForm
          rule={editingRule}
          templates={templates}
          onClose={() => { setShowForm(false); setEditingRule(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
