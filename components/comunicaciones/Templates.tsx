'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

type TemplateEstado = 'borrador' | 'revision' | 'aprobado' | 'rechazado';
type TemplateCategoria = 'utility' | 'marketing' | null;

interface CommTemplate {
  id: number;
  nombre: string;
  body: string;
  variables: string[];
  categoria: TemplateCategoria;
  estado: TemplateEstado;
  kapso_template_id: string | null;
  motivo_rechazo: string | null;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────
// Validator logic (client-side)
// ──────────────────────────────────────────
const MARKETING_WORDS = [
  'gratis', 'premium', 'descuento', 'oferta', 'precio', 'plan', 'suscripción',
  'suscripcion', 'conoce más', 'compra', 'aprovecha', 'no te lo pierdas',
  'última oportunidad', 'ultima oportunidad', 'black friday', 'promoción',
  'promocion', 'especial', 'rebaja', 'regalo', 'ganaste', 'ganador',
];
const UTILITY_SIGNALS = [
  'te registraste', 'confirmaste', 'solicitaste', 'tu membresía', 'tu membresia',
  'tu plan', 'tu cuenta', 'acceso', 'vence', 'vencimiento', 'renovación',
  'renovacion', 'confirmación', 'confirmacion', 'registro', 'bienvenida',
];
const HYPE_EMOJIS = ['🔥', '🎉', '🎊', '💥', '⚡', '🚀', '💰', '🎁'];

interface ValidationResult {
  category: TemplateCategoria;
  confidence: 'alta' | 'media' | 'baja';
  warnings: string[];
  isValid: boolean;
}

function validateTemplate(body: string): ValidationResult {
  const lower = body.toLowerCase();
  const warnings: string[] = [];
  let marketingScore = 0;
  let utilityScore = 0;

  // Check marketing words
  const foundMarketing = MARKETING_WORDS.filter(w => lower.includes(w));
  if (foundMarketing.length > 0) {
    marketingScore += foundMarketing.length * 2;
    warnings.push(`Palabras promocionales: ${foundMarketing.slice(0, 3).join(', ')}`);
  }

  // Check utility signals
  const foundUtility = UTILITY_SIGNALS.filter(w => lower.includes(w));
  if (foundUtility.length > 0) {
    utilityScore += foundUtility.length * 2;
  }

  // Check hype emojis
  const foundEmojis = HYPE_EMOJIS.filter(e => body.includes(e));
  if (foundEmojis.length > 0) {
    marketingScore += foundEmojis.length;
    warnings.push(`Emojis de hype: ${foundEmojis.join(' ')}`);
  }

  // Check multiple exclamation marks
  const exclamations = (body.match(/!/g) || []).length;
  if (exclamations > 1) {
    marketingScore += exclamations;
    warnings.push(`${exclamations} signos de exclamación (riesgo Marketing)`);
  }

  // Check variables (utility signal)
  const vars = body.match(/\{\{(\w+)\}\}/g) || [];
  if (vars.length > 0) {
    utilityScore += vars.length;
  }

  const category: TemplateCategoria = marketingScore > utilityScore ? 'marketing' : 'utility';
  const diff = Math.abs(marketingScore - utilityScore);
  const confidence: 'alta' | 'media' | 'baja' = diff >= 4 ? 'alta' : diff >= 2 ? 'media' : 'baja';

  return {
    category,
    confidence,
    warnings,
    isValid: body.trim().length >= 10,
  };
}

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

// ──────────────────────────────────────────
// Badge component
// ──────────────────────────────────────────
function EstadoBadge({ estado }: { estado: TemplateEstado }) {
  const map: Record<TemplateEstado, { label: string; className: string }> = {
    borrador:  { label: 'Borrador',    className: 'bg-gray-100 text-gray-600' },
    revision:  { label: 'En revisión', className: 'bg-yellow-100 text-yellow-700' },
    aprobado:  { label: 'Aprobado',    className: 'bg-green-100 text-green-700' },
    rechazado: { label: 'Rechazado',   className: 'bg-red-100 text-red-600' },
  };
  const { label, className } = map[estado];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function CategoriaBadge({ categoria }: { categoria: TemplateCategoria }) {
  if (!categoria) return null;
  const isUtility = categoria === 'utility';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      isUtility ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
    }`}>
      {isUtility ? 'Utility' : 'Marketing'}
    </span>
  );
}

// ──────────────────────────────────────────
// Template Form Modal
// ──────────────────────────────────────────
interface TemplateFormProps {
  template?: CommTemplate | null;
  onClose: () => void;
  onSave: (t: CommTemplate) => void;
}

function TemplateForm({ template, onClose, onSave }: TemplateFormProps) {
  const { supabase } = useAuth();
  const [nombre, setNombre] = useState(template?.nombre ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const vars = extractVariables(body);
  const validation = body.length > 0 ? validateTemplate(body) : null;
  const preview = body.replace(/\{\{(\w+)\}\}/g, (_: string, v: string) => `[${v}]`);

  const handleSave = async (submitToMeta = false) => {
    if (!nombre.trim() || !body.trim()) {
      toast.error('Nombre y cuerpo son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        body: body.trim(),
        variables: vars,
        categoria: validation?.category ?? null,
        estado: submitToMeta ? 'revision' : (template?.estado === 'rechazado' ? 'borrador' : (template?.estado ?? 'borrador')),
        updated_at: new Date().toISOString(),
      };

      let result;
      if (template?.id) {
        const { data, error } = await supabase!
          .from('comm_templates')
          .update(payload)
          .eq('id', template.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase!
          .from('comm_templates')
          .insert({ ...payload, created_at: new Date().toISOString() })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      if (submitToMeta) {
        toast.success('Template enviado a revisión de Meta');
      } else {
        toast.success(template?.id ? 'Template guardado' : 'Template creado');
      }
      onSave(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar';
      toast.error(msg);
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#3c527a] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-wide mb-0.5">
              {template ? 'Editar template' : 'Nuevo template'}
            </p>
            <h2 className="text-white text-lg font-bold">Template WhatsApp</h2>
          </div>
          <button
            onClick={onClose}
            className="bg-white/20 hover:bg-white/30 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Nombre del template
            </label>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="ej. Recordatorio de vencimiento 7 días"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Cuerpo del mensaje
              <span className="ml-2 font-normal text-gray-400 normal-case">
                Usa {'{{variable}}'} para variables dinámicas
              </span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={5}
              placeholder="Hola {{nombre}}, tu membresía vence en {{dias_restantes}} días..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors resize-none font-mono"
            />
            <div className="flex justify-end mt-1">
              <span className="text-xs text-gray-400">{body.length} caracteres</span>
            </div>
          </div>

          {/* Variables detected */}
          {vars.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Variables detectadas
              </label>
              <div className="flex flex-wrap gap-2">
                {vars.map(v => (
                  <span key={v} className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full font-mono">
                    {'{{'}{v}{'}}'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Validator */}
          {validation && (
            <div className={`rounded-xl border p-4 ${
              validation.category === 'utility'
                ? 'border-blue-200 bg-blue-50'
                : 'border-purple-200 bg-purple-50'
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-bold text-gray-700">Análisis automático</span>
                <CategoriaBadge categoria={validation.category} />
                <span className={`text-xs font-semibold ${
                  validation.confidence === 'alta' ? 'text-green-600' :
                  validation.confidence === 'media' ? 'text-yellow-600' : 'text-gray-500'
                }`}>
                  Confianza {validation.confidence}
                </span>
              </div>
              {validation.warnings.length > 0 && (
                <ul className="space-y-1">
                  {validation.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="text-yellow-500 flex-shrink-0 mt-0.5">⚠</span>
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              {validation.warnings.length === 0 && (
                <p className="text-xs text-green-700 font-medium">
                  ✓ Sin señales de riesgo. Buena candidatura para Utility.
                </p>
              )}
              <p className="text-xs text-gray-400 mt-2 italic">
                Este análisis es orientativo. Meta realiza su propia revisión.
              </p>
            </div>
          )}

          {/* Preview */}
          {body.trim().length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Preview en WhatsApp
              </label>
              <div className="bg-[#ECE5DD] rounded-xl p-4">
                <div className="bg-white rounded-xl rounded-tl-none px-3 py-2.5 max-w-xs shadow-sm">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{preview}</p>
                  <p className="text-right text-xs text-gray-400 mt-1">12:00 ✓✓</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0 bg-gray-50">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving || !nombre.trim() || !body.trim()}
              className="px-4 py-2 text-sm font-semibold text-[#3c527a] border border-[#3c527a] rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              {saving && !submitting ? 'Guardando...' : 'Guardar borrador'}
            </button>
            <button
              onClick={() => { setSubmitting(true); handleSave(true); }}
              disabled={saving || !nombre.trim() || !body.trim()}
              className="px-4 py-2 text-sm font-semibold bg-[#ff8080] hover:bg-[#ff6b6b] text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar a Meta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Template Detail / View Modal
// ──────────────────────────────────────────
function TemplateDetail({ template, onClose, onEdit, onDelete }: {
  template: CommTemplate;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const preview = template.body.replace(/\{\{(\w+)\}\}/g, (_: string, v: string) => `[${v}]`);
  const canEdit = template.estado === 'borrador' || template.estado === 'rechazado';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        <div className="bg-[#3c527a] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-wide mb-0.5">Template</p>
            <h2 className="text-white text-lg font-bold truncate max-w-[320px]">{template.nombre}</h2>
          </div>
          <button
            onClick={onClose}
            className="bg-white/20 hover:bg-white/30 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="flex gap-2">
            <EstadoBadge estado={template.estado} />
            <CategoriaBadge categoria={template.categoria} />
          </div>

          {template.motivo_rechazo && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">Motivo de rechazo</p>
              <p className="text-sm text-red-700">{template.motivo_rechazo}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Cuerpo</p>
            <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap leading-relaxed">
              {template.body}
            </div>
          </div>

          {template.variables.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Variables</p>
              <div className="flex flex-wrap gap-2">
                {template.variables.map(v => (
                  <span key={v} className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full font-mono">
                    {'{{'}{v}{'}}'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Preview</p>
            <div className="bg-[#ECE5DD] rounded-xl p-4">
              <div className="bg-white rounded-xl rounded-tl-none px-3 py-2.5 max-w-xs shadow-sm">
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{preview}</p>
                <p className="text-right text-xs text-gray-400 mt-1">12:00 ✓✓</p>
              </div>
            </div>
          </div>

          {template.kapso_template_id && (
            <p className="text-xs text-gray-400">
              Kapso ID: <span className="font-mono">{template.kapso_template_id}</span>
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0 bg-gray-50">
          <button
            onClick={onDelete}
            className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
          >
            Eliminar
          </button>
          {canEdit && (
            <button
              onClick={onEdit}
              className="px-4 py-2 text-sm font-semibold bg-[#ff8080] hover:bg-[#ff6b6b] text-white rounded-lg transition-colors"
            >
              Editar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Main Templates Component
// ──────────────────────────────────────────
export default function Templates() {
  const { supabase } = useAuth();
  const [templates, setTemplates] = useState<CommTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CommTemplate | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<CommTemplate | null>(null);
  const [filterEstado, setFilterEstado] = useState<string>('todos');

  const fetchTemplates = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('comm_templates')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      toast.error('Error al cargar templates');
    } else {
      setTemplates(data ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSave = (saved: CommTemplate) => {
    setTemplates(prev => {
      const idx = prev.findIndex(t => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setShowForm(false);
    setEditingTemplate(null);
  };

  const handleDelete = async (id: number) => {
    if (!supabase) return;
    if (!confirm('¿Eliminar este template?')) return;
    const { error } = await supabase.from('comm_templates').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar');
    } else {
      setTemplates(prev => prev.filter(t => t.id !== id));
      setViewingTemplate(null);
      toast.success('Template eliminado');
    }
  };

  const filtered = filterEstado === 'todos'
    ? templates
    : templates.filter(t => t.estado === filterEstado);

  const counts = {
    total: templates.length,
    aprobado: templates.filter(t => t.estado === 'aprobado').length,
    revision: templates.filter(t => t.estado === 'revision').length,
    borrador: templates.filter(t => t.estado === 'borrador').length,
    rechazado: templates.filter(t => t.estado === 'rechazado').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#383838]">Templates</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestiona los templates de WhatsApp y su aprobación con Meta
          </p>
        </div>
        <button
          onClick={() => { setEditingTemplate(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#ff8080] hover:bg-[#ff6b6b] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          Nuevo template
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Aprobados', value: counts.aprobado, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'En revisión', value: counts.revision, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Borradores', value: counts.borrador, color: 'text-gray-600', bg: 'bg-gray-100' },
          { label: 'Rechazados', value: counts.rechazado, color: 'text-red-500', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { value: 'todos', label: `Todos (${counts.total})` },
          { value: 'aprobado', label: 'Aprobados' },
          { value: 'revision', label: 'En revisión' },
          { value: 'borrador', label: 'Borradores' },
          { value: 'rechazado', label: 'Rechazados' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilterEstado(f.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterEstado === f.value
                ? 'bg-[#3c527a] text-white'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Cargando templates...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-sm">No hay templates{filterEstado !== 'todos' ? ` con estado "${filterEstado}"` : ''}.</p>
          {filterEstado === 'todos' && (
            <button
              onClick={() => { setEditingTemplate(null); setShowForm(true); }}
              className="mt-3 text-sm text-[#ff8080] hover:underline font-medium"
            >
              Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Nombre', 'Categoría', 'Variables', 'Estado', 'Actualizado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr
                  key={t.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setViewingTemplate(t)}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-[#383838]">{t.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 max-w-xs">{t.body}</p>
                  </td>
                  <td className="px-4 py-3">
                    <CategoriaBadge categoria={t.categoria} />
                  </td>
                  <td className="px-4 py-3">
                    {t.variables.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {t.variables.slice(0, 3).map(v => (
                          <span key={v} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                            {v}
                          </span>
                        ))}
                        {t.variables.length > 3 && (
                          <span className="text-xs text-gray-400">+{t.variables.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={t.estado} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(t.updated_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    {(t.estado === 'borrador' || t.estado === 'rechazado') && (
                      <button
                        onClick={e => { e.stopPropagation(); setEditingTemplate(t); setShowForm(true); }}
                        className="text-xs text-[#3c527a] hover:underline font-medium"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <TemplateForm
          template={editingTemplate}
          onClose={() => { setShowForm(false); setEditingTemplate(null); }}
          onSave={handleSave}
        />
      )}

      {/* Detail Modal */}
      {viewingTemplate && !showForm && (
        <TemplateDetail
          template={viewingTemplate}
          onClose={() => setViewingTemplate(null)}
          onEdit={() => { setEditingTemplate(viewingTemplate); setViewingTemplate(null); setShowForm(true); }}
          onDelete={() => handleDelete(viewingTemplate.id)}
        />
      )}
    </div>
  );
}
