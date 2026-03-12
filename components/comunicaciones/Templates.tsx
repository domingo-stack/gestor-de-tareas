'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

type TemplateEstado = 'borrador' | 'revision' | 'aprobado' | 'rechazado';
type TemplateCategoria = 'utility' | 'marketing' | null;
type ButtonType = 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY';

interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

interface CommTemplate {
  id: number;
  nombre: string;
  body: string;
  variables: string[];
  buttons: TemplateButton[];
  categoria: TemplateCategoria;
  submission_error: string | null;
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

// ──────────────────────────────────────────
// Built-in variable definitions
// ──────────────────────────────────────────
interface VariableOption {
  key: string;
  label: string;
  ejemplo: string;
  source: 'auto' | 'config';
}

const BUILTIN_VARIABLES: VariableOption[] = [
  { key: 'nombre', label: 'Nombre', ejemplo: 'Juan', source: 'auto' },
  { key: 'apellido', label: 'Apellido', ejemplo: 'Pérez', source: 'auto' },
  { key: 'email', label: 'Email', ejemplo: 'juan@empresa.com', source: 'auto' },
  { key: 'plan_id', label: 'Plan actual', ejemplo: 'pro', source: 'auto' },
  { key: 'fecha_fin', label: 'Fecha fin suscripción', ejemplo: '31 mar 2026', source: 'auto' },
  { key: 'dias_restantes', label: 'Días restantes', ejemplo: '7', source: 'auto' },
];

// ──────────────────────────────────────────
// Emoji data (curated for WhatsApp templates)
// ──────────────────────────────────────────
const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  { name: 'Caras', emojis: ['😊', '😃', '😄', '🤗', '😉', '🙂', '😅', '🤔', '😎', '🥳', '😍', '🤩', '😢', '😭', '😱', '🤯'] },
  { name: 'Manos', emojis: ['👋', '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '💪', '👆', '👇', '👉', '👈', '☝️', '✊', '🫶'] },
  { name: 'Objetos', emojis: ['⭐', '💡', '📌', '📎', '📅', '📊', '📈', '📉', '💰', '💳', '🎯', '🏆', '🎁', '📩', '📞', '💻'] },
  { name: 'Simbolos', emojis: ['✅', '❌', '⚠️', '❗', '❓', '💬', '🔔', '🔗', '🔒', '🔑', '⏰', '⏳', '♻️', '🆕', '🆓', '💯'] },
  { name: 'Flechas', emojis: ['➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '🔄', '🔃', '▶️', '◀️', '⏩', '⏪', '🔀', '🔁', '🔂', '↩️'] },
];

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

const BUTTON_TYPE_LABELS: Record<ButtonType, string> = {
  URL: 'Boton URL',
  PHONE_NUMBER: 'Boton Telefono',
  QUICK_REPLY: 'Respuesta Rapida',
};

const EMPTY_BUTTON: TemplateButton = { type: 'URL', text: '', url: '' };

function TemplateForm({ template, onClose, onSave }: TemplateFormProps) {
  const { supabase } = useAuth();
  const [nombre, setNombre] = useState(template?.nombre ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [buttons, setButtons] = useState<TemplateButton[]>(template?.buttons ?? []);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Emoji picker
  const [showEmojis, setShowEmojis] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Variable autocomplete
  const [showVarDropdown, setShowVarDropdown] = useState(false);
  const [varFilter, setVarFilter] = useState('');
  const [varCursorPos, setVarCursorPos] = useState(0);
  const [customVars, setCustomVars] = useState<VariableOption[]>([]);
  const [selectedVarIdx, setSelectedVarIdx] = useState(0);

  // Fetch custom variables from comm_variables
  useEffect(() => {
    if (!supabase) return;
    supabase.from('comm_variables').select('key, value').then(({ data }) => {
      if (data) {
        setCustomVars(data.map(v => ({
          key: v.key,
          label: v.key,
          ejemplo: v.value,
          source: 'config' as const,
        })));
      }
    });
  }, [supabase]);

  // Close emoji picker on click outside
  useEffect(() => {
    if (!showEmojis) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojis(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojis]);

  const allVariables = [...BUILTIN_VARIABLES, ...customVars];
  const filteredVars = varFilter
    ? allVariables.filter(v => v.key.toLowerCase().includes(varFilter.toLowerCase()) || v.label.toLowerCase().includes(varFilter.toLowerCase()))
    : allVariables;

  const vars = extractVariables(body);
  const validation = body.length > 0 ? validateTemplate(body) : null;
  const preview = body.replace(/\{\{(\w+)\}\}/g, (_: string, v: string) => `[${v}]`);

  // Insert text at cursor position in textarea
  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newBody = body.slice(0, start) + text + body.slice(end);
    setBody(newBody);
    // Set cursor after inserted text
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + text.length;
    }, 0);
  };

  const insertEmoji = (emoji: string) => {
    insertAtCursor(emoji);
  };

  const insertVariable = (varKey: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Find the {{ before cursor and replace with {{varKey}}
    const before = body.slice(0, varCursorPos);
    const braceStart = before.lastIndexOf('{{');
    if (braceStart >= 0) {
      const newBody = body.slice(0, braceStart) + `{{${varKey}}}` + body.slice(varCursorPos);
      setBody(newBody);
      setShowVarDropdown(false);
      setVarFilter('');
      setTimeout(() => {
        ta.focus();
        const newPos = braceStart + varKey.length + 4; // {{ + key + }}
        ta.selectionStart = ta.selectionEnd = newPos;
      }, 0);
    }
  };

  // Handle textarea input for variable autocomplete
  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setBody(val);

    // Check if we're in a {{ context
    const before = val.slice(0, cursor);
    const braceMatch = before.match(/\{\{(\w*)$/);
    if (braceMatch) {
      setShowVarDropdown(true);
      setVarFilter(braceMatch[1]);
      setVarCursorPos(cursor);
      setSelectedVarIdx(0);
    } else {
      setShowVarDropdown(false);
      setVarFilter('');
    }
  };

  // Handle keyboard navigation in variable dropdown
  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showVarDropdown || filteredVars.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedVarIdx(prev => Math.min(prev + 1, filteredVars.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedVarIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertVariable(filteredVars[selectedVarIdx].key);
    } else if (e.key === 'Escape') {
      setShowVarDropdown(false);
    }
  };

  // Button helpers
  const hasQuickReply = buttons.some(b => b.type === 'QUICK_REPLY');
  const hasCTA = buttons.some(b => b.type === 'URL' || b.type === 'PHONE_NUMBER');
  // Meta rule: can't mix CTA and QUICK_REPLY in same template
  const canAddCTA = !hasQuickReply && buttons.filter(b => b.type === 'URL' || b.type === 'PHONE_NUMBER').length < 2;
  const canAddQuickReply = !hasCTA && buttons.filter(b => b.type === 'QUICK_REPLY').length < 3;
  const canAddButton = canAddCTA || canAddQuickReply;

  const addButton = (type: ButtonType) => {
    const btn: TemplateButton = { type, text: '' };
    if (type === 'URL') btn.url = '';
    if (type === 'PHONE_NUMBER') btn.phone_number = '';
    setButtons([...buttons, btn]);
  };

  const updateButton = (idx: number, field: string, value: string) => {
    setButtons(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

  const removeButton = (idx: number) => {
    setButtons(prev => prev.filter((_, i) => i !== idx));
  };

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
        buttons: buttons.filter(b => b.text.trim()), // only save buttons with text
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

      // If submitting to Meta, call the API route which calls Kapso
      if (submitToMeta) {
        const kapsoRes = await fetch('/api/communication/submit-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: result.id }),
        });
        if (!kapsoRes.ok) {
          const errData = await kapsoRes.json();
          // Template was saved in DB but Kapso submission failed
          toast.error(`Template guardado pero error al enviar a Meta: ${errData.error}`);
          onSave(result);
          return;
        }
        const kapsoData = await kapsoRes.json();
        // Update local result with kapso_template_id
        result = { ...result, kapso_template_id: kapsoData.kapso_id };
        toast.success('Template enviado a Meta para revisión (24-72h)');
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
            </label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={handleBodyChange}
                onKeyDown={handleBodyKeyDown}
                rows={5}
                placeholder="Hola {{nombre}}, tu membresía vence en {{dias_restantes}} días..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors resize-none font-mono"
              />

              {/* Variable autocomplete dropdown */}
              {showVarDropdown && filteredVars.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-400 font-medium">Variables disponibles</p>
                  </div>
                  {filteredVars.map((v, i) => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      onMouseEnter={() => setSelectedVarIdx(i)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 text-sm transition-colors ${
                        i === selectedVarIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <code className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-semibold flex-shrink-0">
                          {'{{'}{v.key}{'}}'}
                        </code>
                        <span className="text-gray-600 truncate">{v.label}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-400 italic">{v.ejemplo}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          v.source === 'auto' ? 'bg-green-50 text-green-600' : 'bg-purple-50 text-purple-600'
                        }`}>
                          {v.source === 'auto' ? 'auto' : 'config'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Toolbar: emoji + hints */}
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-3">
                {/* Emoji picker toggle */}
                <div className="relative" ref={emojiRef}>
                  <button
                    type="button"
                    onClick={() => setShowEmojis(!showEmojis)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      showEmojis ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-sm">😊</span> Emojis
                  </button>

                  {showEmojis && (
                    <div className="absolute z-30 left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl w-[320px]">
                      {/* Category tabs */}
                      <div className="flex border-b border-gray-100 px-2 pt-2 gap-1">
                        {EMOJI_CATEGORIES.map((cat, i) => (
                          <button
                            key={cat.name}
                            onClick={() => setEmojiCategory(i)}
                            className={`px-2 py-1 text-xs font-medium rounded-t-lg transition-colors ${
                              emojiCategory === i ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                      {/* Emoji grid */}
                      <div className="p-2 max-h-40 overflow-y-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                        {EMOJI_CATEGORIES[emojiCategory].emojis.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => insertEmoji(emoji)}
                            className="aspect-square flex items-center justify-center text-lg hover:bg-gray-100 rounded transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Variable hint */}
                <span className="text-xs text-gray-400">
                  Escribe <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-500 font-mono text-[10px]">{'{{'}</code> para insertar variables
                </span>
              </div>

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

          {/* Buttons builder */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Botones
              <span className="ml-2 font-normal text-gray-400 normal-case">
                Opcional — max 2 CTA o 3 respuestas rapidas
              </span>
            </label>

            {buttons.length > 0 && (
              <div className="space-y-3 mb-3">
                {buttons.map((btn, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500">
                        {BUTTON_TYPE_LABELS[btn.type]}
                      </span>
                      <button
                        onClick={() => removeButton(idx)}
                        className="text-xs text-red-400 hover:text-red-600 font-medium"
                      >
                        Eliminar
                      </button>
                    </div>
                    <div className="space-y-2">
                      <input
                        value={btn.text}
                        onChange={e => updateButton(idx, 'text', e.target.value)}
                        placeholder="Texto del boton (ej: Contactar Soporte)"
                        maxLength={25}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#3c527a] transition-colors"
                      />
                      {btn.type === 'URL' && (
                        <input
                          value={btn.url ?? ''}
                          onChange={e => updateButton(idx, 'url', e.target.value)}
                          placeholder="URL (ej: https://wa.me/51999999999)"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#3c527a] transition-colors font-mono text-xs"
                        />
                      )}
                      {btn.type === 'PHONE_NUMBER' && (
                        <input
                          value={btn.phone_number ?? ''}
                          onChange={e => updateButton(idx, 'phone_number', e.target.value)}
                          placeholder="Numero con codigo de pais (ej: +51999999999)"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#3c527a] transition-colors font-mono text-xs"
                        />
                      )}
                      <div className="flex justify-end">
                        <span className="text-xs text-gray-400">{btn.text.length}/25</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canAddButton && (
              <div className="flex gap-2">
                {canAddCTA && (
                  <>
                    <button
                      onClick={() => addButton('URL')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#3c527a] border border-dashed border-[#3c527a]/30 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      + Boton URL
                    </button>
                    <button
                      onClick={() => addButton('PHONE_NUMBER')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#3c527a] border border-dashed border-[#3c527a]/30 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      + Boton Telefono
                    </button>
                  </>
                )}
                {canAddQuickReply && (
                  <button
                    onClick={() => addButton('QUICK_REPLY')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#3c527a] border border-dashed border-[#3c527a]/30 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    + Respuesta Rapida
                  </button>
                )}
              </div>
            )}

            {buttons.length > 0 && hasQuickReply && hasCTA && (
              <p className="text-xs text-red-500 mt-2">
                Meta no permite mezclar botones CTA (URL/Telefono) con Respuestas Rapidas en el mismo template.
              </p>
            )}
          </div>

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
                <div className="max-w-xs">
                  <div className="bg-white rounded-xl rounded-tl-none px-3 py-2.5 shadow-sm">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{preview}</p>
                    <p className="text-right text-xs text-gray-400 mt-1">12:00 ✓✓</p>
                  </div>
                  {buttons.filter(b => b.text.trim()).length > 0 && (
                    <div className="mt-1 space-y-1">
                      {buttons.filter(b => b.text.trim()).map((btn, i) => (
                        <div
                          key={i}
                          className="bg-white rounded-lg px-3 py-2 text-center shadow-sm flex items-center justify-center gap-1.5"
                        >
                          {btn.type === 'URL' && (
                            <svg className="w-3.5 h-3.5 text-[#00A5F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          )}
                          {btn.type === 'PHONE_NUMBER' && (
                            <svg className="w-3.5 h-3.5 text-[#00A5F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          )}
                          {btn.type === 'QUICK_REPLY' && (
                            <svg className="w-3.5 h-3.5 text-[#00A5F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                          )}
                          <span className="text-sm font-medium text-[#00A5F4]">{btn.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
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

          {template.submission_error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">Error al enviar a Meta</p>
              <p className="text-sm text-red-700">{template.submission_error}</p>
            </div>
          )}

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

          {/* Buttons */}
          {(template.buttons ?? []).length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Botones</p>
              <div className="space-y-2">
                {template.buttons.map((btn, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      btn.type === 'URL' ? 'bg-blue-100 text-blue-700' :
                      btn.type === 'PHONE_NUMBER' ? 'bg-green-100 text-green-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {BUTTON_TYPE_LABELS[btn.type]}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{btn.text}</span>
                    {btn.url && <span className="text-xs text-gray-400 font-mono truncate">{btn.url}</span>}
                    {btn.phone_number && <span className="text-xs text-gray-400 font-mono">{btn.phone_number}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Preview</p>
            <div className="bg-[#ECE5DD] rounded-xl p-4">
              <div className="max-w-xs">
                <div className="bg-white rounded-xl rounded-tl-none px-3 py-2.5 shadow-sm">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{preview}</p>
                  <p className="text-right text-xs text-gray-400 mt-1">12:00 ✓✓</p>
                </div>
                {(template.buttons ?? []).filter(b => b.text.trim()).length > 0 && (
                  <div className="mt-1 space-y-1">
                    {template.buttons.filter(b => b.text.trim()).map((btn, i) => (
                      <div key={i} className="bg-white rounded-lg px-3 py-2 text-center shadow-sm flex items-center justify-center gap-1.5">
                        {btn.type === 'URL' && (
                          <svg className="w-3.5 h-3.5 text-[#00A5F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        )}
                        {btn.type === 'PHONE_NUMBER' && (
                          <svg className="w-3.5 h-3.5 text-[#00A5F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        )}
                        {btn.type === 'QUICK_REPLY' && (
                          <svg className="w-3.5 h-3.5 text-[#00A5F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                        )}
                        <span className="text-sm font-medium text-[#00A5F4]">{btn.text}</span>
                      </div>
                    ))}
                  </div>
                )}
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
// Send Test Modal
// ──────────────────────────────────────────
interface TestContact {
  id: number;
  etiqueta: string;
  phone: string;
  variables: Record<string, string>;
}

function SendTestModal({ template, onClose }: { template: CommTemplate; onClose: () => void }) {
  const { supabase } = useAuth();
  const [contacts, setContacts] = useState<TestContact[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Array<{ contactId: number; ok: boolean; error: string | null }> | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('comm_test_contacts').select('*').order('etiqueta').then(({ data }) => {
      setContacts(data ?? []);
      setLoading(false);
    });
  }, [supabase]);

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSend = async () => {
    if (selected.size === 0) { toast.error('Selecciona al menos un contacto'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/communication/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, contactIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Error al enviar'); return; }
      setResults(data.results);
      const ok = data.results.filter((r: { ok: boolean }) => r.ok).length;
      toast.success(`${ok}/${data.results.length} mensajes enviados`);
    } catch {
      toast.error('Error de red');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="bg-[#3c527a] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-wide mb-0.5">Enviar test</p>
            <h2 className="text-white text-lg font-bold truncate max-w-[280px]">{template.nombre}</h2>
          </div>
          <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors">✕</button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Cargando contactos...</div>
          ) : contacts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500">No hay contactos de prueba.</p>
              <p className="text-xs text-gray-400 mt-1">
                Agrégalos desde la pestaña <strong>Configuración</strong>.
              </p>
            </div>
          ) : results ? (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700 mb-3">Resultados</p>
              {results.map(r => {
                const c = contacts.find(c => c.id === r.contactId);
                return (
                  <div key={r.contactId} className={`flex items-start gap-3 p-3 rounded-lg ${r.ok ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                    <span className={`text-lg flex-shrink-0 ${r.ok ? 'text-green-500' : 'text-red-500'}`}>{r.ok ? '✓' : '✗'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-700">{c?.etiqueta ?? `Contacto ${r.contactId}`}</p>
                      <p className="text-xs font-mono text-gray-400">{c?.phone}</p>
                      {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-700">Selecciona destinatarios</p>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setSelected(new Set(contacts.map(c => c.id)))} className="text-[#3c527a] hover:underline">Todos</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:text-gray-600">Ninguno</button>
                </div>
              </div>
              <div className="space-y-2">
                {contacts.map(c => (
                  <label key={c.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="mt-0.5 accent-[#ff8080]"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#383838]">{c.etiqueta}</p>
                      <p className="text-xs font-mono text-gray-500">{c.phone}</p>
                      {c.variables?.nombre && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.variables.nombre} {c.variables.apellido}
                          {c.variables.fecha_fin ? ` · vence ${c.variables.fecha_fin}` : ''}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between bg-gray-50">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
            {results ? 'Cerrar' : 'Cancelar'}
          </button>
          {!results && contacts.length > 0 && (
            <button
              onClick={handleSend}
              disabled={sending || selected.size === 0}
              className="px-4 py-2 text-sm font-semibold bg-[#ff8080] hover:bg-[#ff6b6b] text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {sending
                ? 'Enviando...'
                : `Enviar a ${selected.size > 0 ? selected.size : ''} contacto${selected.size !== 1 ? 's' : ''}`}
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
  const [testingTemplate, setTestingTemplate] = useState<CommTemplate | null>(null);
  const [checkingId, setCheckingId] = useState<number | null>(null);

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

  const handleCheckStatus = async (t: CommTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!t.kapso_template_id) { toast.error('Este template no tiene ID de Kapso aún'); return; }
    setCheckingId(t.id);
    try {
      const res = await fetch('/api/communication/check-template-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: t.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Error al consultar'); return; }
      if (data.changed) {
        setTemplates(prev => prev.map(x => x.id === t.id
          ? { ...x, estado: data.estado, motivo_rechazo: data.motivo_rechazo }
          : x
        ));
        toast.success(`Estado actualizado: ${data.meta_status}`);
      } else {
        toast.info(`Sin cambios — sigue en ${data.meta_status}`);
      }
    } catch {
      toast.error('Error de red');
    } finally {
      setCheckingId(null);
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
                {['Nombre', 'Categoría', 'Variables', 'Botones', 'Estado', 'Actualizado', ''].map(h => (
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
                    {(t.buttons ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {t.buttons.map((b, i) => (
                          <span key={i} className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            b.type === 'URL' ? 'bg-blue-50 text-blue-600' :
                            b.type === 'PHONE_NUMBER' ? 'bg-green-50 text-green-600' :
                            'bg-purple-50 text-purple-600'
                          }`}>
                            {b.type === 'URL' ? 'URL' : b.type === 'PHONE_NUMBER' ? 'Tel' : 'QR'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={t.estado} />
                    {t.submission_error && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-red-500 font-medium">
                        <span>⚠</span>
                        <span className="truncate max-w-[220px]" title={t.submission_error}>
                          {t.submission_error}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(t.updated_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {(t.estado === 'borrador' || t.estado === 'rechazado') && (
                        <button
                          onClick={e => { e.stopPropagation(); setEditingTemplate(t); setShowForm(true); }}
                          className="text-xs text-[#3c527a] hover:underline font-medium"
                        >
                          Editar
                        </button>
                      )}
                      {t.estado === 'revision' && t.kapso_template_id && (
                        <button
                          onClick={e => handleCheckStatus(t, e)}
                          disabled={checkingId === t.id}
                          title="Consultar estado actual en Meta"
                          className="text-xs text-yellow-600 hover:text-yellow-700 font-medium flex items-center gap-1 disabled:opacity-50"
                        >
                          <span className={checkingId === t.id ? 'animate-spin inline-block' : ''}>↻</span>
                          {checkingId === t.id ? 'Consultando...' : 'Actualizar'}
                        </button>
                      )}
                      {t.estado === 'aprobado' && (
                        <button
                          onClick={e => { e.stopPropagation(); setTestingTemplate(t); }}
                          className="text-xs text-green-600 hover:underline font-medium whitespace-nowrap"
                        >
                          Enviar test
                        </button>
                      )}
                    </div>
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

      {/* Send Test Modal */}
      {testingTemplate && (
        <SendTestModal
          template={testingTemplate}
          onClose={() => setTestingTemplate(null)}
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
