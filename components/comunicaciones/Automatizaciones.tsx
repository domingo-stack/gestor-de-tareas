'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

type TipoEvento = 'vencimiento' | 'activacion';
type TimingDirection = 'before' | 'after';
type Audiencia = 'free' | 'cancelled' | 'ambos';

interface EventRule {
  id: string;
  nombre: string;
  evento_tipo: TipoEvento;
  timing_dias: number;
  timing_direction: TimingDirection;
  template_id: string | null;
  activo: boolean;
  trigger_source: 'n8n' | 'webhook' | 'cron';
  segmento_filtros?: {
    paises?: string[];
    plan_ids?: string[];
    audiencia?: Audiencia;
    eventos_min?: number;
    periodo_dias?: number;
    cooldown_dias?: number;
  };
  created_at: string;
  updated_at: string;
  // joined
  template_nombre?: string;
}

interface CommTemplate {
  id: string;
  nombre: string;
  estado: string;
  uso?: string;
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
    value: 'activacion',
    label: 'Activación por comportamiento',
    trigger: 'cron',
    icon: '🔥',
    color: '#059669',
    timingLabel: () => '',
  },
];

const PAISES_LIST = ['Perú', 'México', 'Chile', 'Colombia', 'Argentina', 'Ecuador', 'Bolivia', 'Guatemala', 'Paraguay', 'Uruguay'];

const AUDIENCIA_OPTIONS: { value: Audiencia; label: string; desc: string }[] = [
  { value: 'free', label: 'Gratuitos', desc: 'Usuarios sin plan pago' },
  { value: 'cancelled', label: 'Cancelados', desc: 'Usuarios que cancelaron' },
  { value: 'ambos', label: 'Ambos', desc: 'Gratuitos y cancelados' },
];

// ──────────────────────────────────────────
// Toggle
// ──────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${value ? 'bg-green-500' : 'bg-gray-300'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
      />
    </button>
  );
}

// ──────────────────────────────────────────
// Dropdown Multiselect
// ──────────────────────────────────────────
function DropdownMultiSelect({ label, options, selected, onChange, placeholder = 'Todos' }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (sel: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (item: string) => {
    onChange(
      selected.includes(item)
        ? selected.filter(s => s !== item)
        : [...selected, item]
    );
  };

  const displayText = selected.length === 0
    ? placeholder
    : selected.length <= 2
      ? selected.join(', ')
      : `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`;

  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-gray-300 transition-colors outline-none"
        >
          <span className={selected.length === 0 ? 'text-gray-400' : 'text-gray-700'}>{displayText}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {/* Todos */}
            <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
              <input
                type="checkbox"
                checked={selected.length === 0}
                onChange={() => onChange([])}
                className="w-3.5 h-3.5 rounded border-gray-300 text-[#3c527a] focus:ring-[#3c527a]"
              />
              <span className="text-sm font-medium text-gray-700">Todos</span>
            </label>
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#3c527a] focus:ring-[#3c527a]"
                />
                <span className="text-sm text-gray-600">{opt}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
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

  // Segmentation state (shared)
  const [paises, setPaises] = useState<string[]>(rule?.segmento_filtros?.paises ?? []);
  const [planIds, setPlanIds] = useState<string[]>(rule?.segmento_filtros?.plan_ids ?? []);
  const [availablePlans, setAvailablePlans] = useState<string[]>([]);

  // Activacion-specific state
  const [audiencia, setAudiencia] = useState<Audiencia>(rule?.segmento_filtros?.audiencia ?? 'free');
  const [eventosMin, setEventosMin] = useState(rule?.segmento_filtros?.eventos_min ?? 15);
  const [periodoDias, setPeriodoDias] = useState(rule?.segmento_filtros?.periodo_dias ?? 15);
  const [cooldownDias, setCooldownDias] = useState(rule?.segmento_filtros?.cooldown_dias ?? 30);

  // Segment preview
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase
        .from('growth_users')
        .select('plan_id')
        .eq('plan_paid', true)
        .not('plan_id', 'is', null);
      if (data) {
        const unique = [...new Set(data.map((r: { plan_id: string }) => r.plan_id))].sort() as string[];
        setAvailablePlans(unique);
      }
    })();
  }, [supabase]);

  // Preview: count matching users when segment changes
  useEffect(() => {
    if (!supabase) return;
    const fetchPreview = async () => {
      setPreviewLoading(true);
      let q = supabase
        .from('growth_users')
        .select('id', { count: 'exact', head: true })
        .eq('whatsapp_valido', true)
        .not('phone', 'is', null);

      if (eventoTipo === 'vencimiento') {
        q = q.eq('plan_paid', true).eq('cancelled', false);
      } else {
        // activacion
        if (audiencia === 'free') {
          q = q.eq('plan_paid', false).eq('cancelled', false);
        } else if (audiencia === 'cancelled') {
          q = q.eq('cancelled', true);
        } else {
          // ambos: free OR cancelled
          q = q.or('plan_paid.eq.false,cancelled.eq.true');
        }
        if (eventosMin > 0) {
          q = q.gte('eventos_valor', eventosMin);
        }
      }

      if (paises.length > 0) q = q.in('country', paises);
      if (planIds.length > 0) q = q.in('plan_id', planIds);
      const { count } = await q;
      setPreviewCount(count ?? 0);
      setPreviewLoading(false);
    };
    const t = setTimeout(fetchPreview, 300);
    return () => clearTimeout(t);
  }, [supabase, paises, planIds, eventoTipo, audiencia, eventosMin]);

  const tipoInfo = TIPOS_EVENTO.find(t => t.value === eventoTipo);
  const approvedTemplates = templates.filter(t => t.estado === 'aprobado' && (t.uso === 'automatización' || t.uso === 'ambos' || !t.uso));

  const handleSave = async () => {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!templateId) { toast.error('Selecciona un template'); return; }
    setSaving(true);
    try {
      const segmento_filtros: EventRule['segmento_filtros'] = {
        ...(paises.length > 0 && { paises }),
        ...(planIds.length > 0 && { plan_ids: planIds }),
      };

      if (eventoTipo === 'activacion') {
        segmento_filtros!.audiencia = audiencia;
        segmento_filtros!.eventos_min = eventosMin;
        segmento_filtros!.periodo_dias = periodoDias;
        segmento_filtros!.cooldown_dias = cooldownDias;
      }

      const payload = {
        nombre: nombre.trim(),
        evento_tipo: eventoTipo,
        timing_dias: eventoTipo === 'vencimiento' ? timingDias : 0,
        timing_direction: eventoTipo === 'vencimiento' ? timingDirection : 'before' as TimingDirection,
        template_id: templateId,
        activo,
        trigger_source: tipoInfo?.trigger ?? 'cron',
        segmento_filtros,
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
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-[#3c527a] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-wide mb-0.5">Automatizaciones</p>
            <h2 className="text-white text-lg font-bold">{rule ? 'Editar regla' : 'Nueva regla'}</h2>
          </div>
          <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
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
                  type="button"
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

          {/* Timing — only for vencimiento */}
          {eventoTipo === 'vencimiento' && (
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
          )}

          {/* Activacion-specific fields */}
          {eventoTipo === 'activacion' && (
            <div className="space-y-4">
              {/* Audiencia */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Audiencia</label>
                <div className="grid grid-cols-3 gap-2">
                  {AUDIENCIA_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAudiencia(opt.value)}
                      className={`px-3 py-2.5 rounded-lg border text-center transition-colors ${
                        audiencia === opt.value
                          ? 'border-[#059669] bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="text-xs font-semibold text-gray-700">{opt.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Eventos de valor mínimos */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Eventos de valor mínimos</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Cuando un usuario alcanza</span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={eventosMin}
                    onChange={e => setEventosMin(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-[#3c527a] transition-colors text-center"
                  />
                  <span className="text-sm text-gray-500">eventos de valor</span>
                </div>
              </div>

              {/* Periodo de actividad */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Periodo de actividad</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">En los últimos</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={periodoDias}
                    onChange={e => setPeriodoDias(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-[#3c527a] transition-colors text-center"
                  />
                  <span className="text-sm text-gray-500">días</span>
                </div>
              </div>

              {/* Cooldown */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Cooldown</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">No reenviar al mismo usuario en</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={cooldownDias}
                    onChange={e => setCooldownDias(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-[#3c527a] transition-colors text-center"
                  />
                  <span className="text-sm text-gray-500">días</span>
                </div>
              </div>
            </div>
          )}

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

          {/* Segmento */}
          <div className="border-t border-gray-200 pt-5">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Segmento</label>

            <DropdownMultiSelect
              label="Países"
              options={PAISES_LIST}
              selected={paises}
              onChange={setPaises}
              placeholder="Todos los países"
            />

            <DropdownMultiSelect
              label="Planes"
              options={availablePlans}
              selected={planIds}
              onChange={setPlanIds}
              placeholder={availablePlans.length === 0 ? 'Cargando...' : 'Todos los planes'}
            />

            {/* Segment preview */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">Usuarios en este segmento:</span>
              {previewLoading ? (
                <span className="text-xs text-gray-400">Calculando...</span>
              ) : (
                <span className="text-sm font-bold text-[#3c527a]">{previewCount?.toLocaleString('es') ?? '—'}</span>
              )}
            </div>
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

        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between bg-gray-50 flex-shrink-0">
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
// Helper: build display text for activacion rules
// ──────────────────────────────────────────
function buildActivacionLabel(rule: EventRule): string {
  const sf = rule.segmento_filtros;
  if (!sf) return '';
  const audienciaMap: Record<string, string> = { free: 'free', cancelled: 'cancelados', ambos: 'free/cancelados' };
  const aud = audienciaMap[sf.audiencia ?? 'free'] ?? 'free';
  const eventos = sf.eventos_min ?? 15;
  const periodo = sf.periodo_dias ?? 15;
  const cooldown = sf.cooldown_dias ?? 30;
  return `Usuarios ${aud} con ≥${eventos} eventos en ${periodo} días • Cooldown: ${cooldown} días`;
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
      supabase.from('comm_templates').select('id, nombre, estado, uso').order('nombre'),
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

  const handleDelete = async (id: string) => {
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
                      {grupo.value === 'vencimiento'
                        ? 'Ejecutado diariamente a las 9am (Edge Function)'
                        : 'Chequeo diario de actividad de usuarios (Edge Function)'}
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
                            {rule.evento_tipo === 'activacion'
                              ? buildActivacionLabel(rule)
                              : TIPOS_EVENTO.find(t => t.value === rule.evento_tipo)
                                  ?.timingLabel(rule.timing_dias, rule.timing_direction)}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="text-xs text-[#3c527a] font-medium truncate max-w-[180px]">
                            {rule.template_nombre}
                          </span>
                        </div>
                        {((rule.segmento_filtros?.paises && rule.segmento_filtros.paises.length > 0) ||
                          (rule.segmento_filtros?.plan_ids && rule.segmento_filtros.plan_ids.length > 0)) && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {rule.segmento_filtros?.paises?.map(p => (
                              <span key={p} className="inline-block bg-blue-50 text-blue-600 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                                {p}
                              </span>
                            ))}
                            {rule.segmento_filtros?.plan_ids?.map(p => (
                              <span key={p} className="inline-block bg-purple-50 text-purple-600 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
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
          <strong>Activación:</strong> Chequeo diario — detecta usuarios gratuitos/cancelados con alta actividad y envía un mensaje de conversión. Cada usuario recibe máximo un mensaje por periodo de cooldown.
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
