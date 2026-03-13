'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

interface CommTemplate {
  id: number;
  nombre: string;
  body: string;
  variables: string[];
  categoria: 'utility' | 'marketing' | null;
  estado: string;
}

interface Broadcast {
  id: number;
  nombre: string;
  template_id: number | null;
  segmento_filtros: Record<string, unknown>;
  total_destinatarios: number;
  enviados: number;
  entregados: number;
  leidos: number;
  clickeados: number;
  estado: 'borrador' | 'enviando' | 'completado' | 'error';
  kapso_broadcast_id: string | null;
  created_at: string;
  template_nombre?: string;
}

interface Filters {
  pais: string;
  plan_tipo: string;       // 'todos' | 'free' | 'paid' | 'cancelled'
  plan_id: string;         // plan_id exacto o 'todos'
  fecha_desde: string;     // solo para pagados
  fecha_hasta: string;     // solo para pagados
  cancelado_dias: string;  // solo para cancelados: '30'|'60'|'90'|'180'|'365'
  eventos_min: string;
  nivel: string;
  grado: string;
  colegio: string;
}

const PAISES = ['Todos', 'Perú', 'México', 'Chile', 'Colombia', 'Argentina', 'Ecuador', 'Bolivia', 'Guatemala', 'Paraguay', 'Uruguay'];
const PLAN_TIPOS = [
  { value: 'todos',     label: 'Todos' },
  { value: 'paid',      label: 'Pagado' },
  { value: 'free',      label: 'Gratuito' },
  { value: 'cancelled', label: 'Cancelado' },
];
const CANCELADO_DIAS = [
  { value: '30',  label: 'Últimos 30 días' },
  { value: '60',  label: 'Últimos 60 días' },
  { value: '90',  label: 'Últimos 90 días' },
  { value: '180', label: 'Últimos 180 días' },
  { value: '365', label: 'Último año' },
];

// Fallback rates if DB table not loaded yet — Peru (80% de audiencia)
const FALLBACK_RATES: Record<string, { marketing: number; utility: number }> = {
  'Perú':       { marketing: 0.0703, utility: 0.0200 },
  'México':     { marketing: 0.0305, utility: 0.0085 },
  'Chile':      { marketing: 0.0889, utility: 0.0200 },
  'Colombia':   { marketing: 0.0125, utility: 0.0008 },
  'Argentina':  { marketing: 0.0618, utility: 0.0260 },
  'Brasil':     { marketing: 0.0625, utility: 0.0068 },
};
const DEFAULT_RATE = { marketing: 0.0703, utility: 0.0200 };
function getRate(
  country: string,
  category: 'marketing' | 'utility',
  dbRates?: Record<string, { marketing: number; utility: number }>
) {
  const rates = dbRates ?? FALLBACK_RATES;
  return (rates[country] ?? DEFAULT_RATE)[category];
}

function EstadoBadge({ estado }: { estado: Broadcast['estado'] }) {
  const map = {
    borrador:   { label: 'Borrador',   cls: 'bg-gray-100 text-gray-600' },
    enviando:   { label: 'Enviando…',  cls: 'bg-blue-100 text-blue-700' },
    completado: { label: 'Completado', cls: 'bg-green-100 text-green-700' },
    error:      { label: 'Error',      cls: 'bg-red-100 text-red-600' },
  };
  const { label, cls } = map[estado];
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

function PctBar({ val, total, color = '#059669' }: { val: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round(val / total * 100) : 0;
  return (
    <div>
      <span className="text-sm font-bold" style={{ color }}>{pct}%</span>
      <div className="h-1 bg-gray-200 rounded mt-1 w-14">
        <div className="h-1 rounded transition-all" style={{ background: color, width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Step indicator
// ──────────────────────────────────────────
function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Segmentación', 'Template', 'Confirmar'];
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              active ? 'bg-[#ff8080] text-white' : done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
            }`}>
              {done ? '✓' : n}
            </div>
            <span className={`text-xs font-semibold ${active ? 'text-[#383838]' : 'text-gray-400'}`}>{s}</span>
            {i < 2 && <div className="w-6 h-px bg-gray-200" />}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────
// Step 1: Segmentation
// ──────────────────────────────────────────
// Small info tooltip
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1.5 align-middle">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center hover:bg-gray-300 transition-colors"
      >i</button>
      {show && (
        <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </div>
      )}
    </span>
  );
}

function Step1({ filters, setFilters, contactCount, loading, onNext, onBack, planIds, rates }: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  contactCount: number;
  loading: boolean;
  onNext: () => void;
  onBack: () => void;
  planIds: string[];
  rates?: Record<string, { marketing: number; utility: number }>;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasAdvanced = filters.nivel || filters.grado || filters.colegio;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          ← Volver
        </button>
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Paso 1 de 3</p>
          <h2 className="text-lg font-bold text-[#383838]">Segmentación</h2>
        </div>
        <div className="ml-auto">
          <Steps current={1} />
        </div>
      </div>

      {/* ── Filtros principales ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* País */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">País</label>
          <select value={filters.pais} onChange={e => setFilters({ ...filters, pais: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors">
            {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Tipo suscripción */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Tipo de suscripción</label>
          <select value={filters.plan_tipo} onChange={e => setFilters({ ...filters, plan_tipo: e.target.value, plan_id: 'todos' })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors">
            {PLAN_TIPOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Plan específico — solo si tipo = paid */}
        {filters.plan_tipo === 'paid' && (
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Plan específico</label>
            <select value={filters.plan_id} onChange={e => setFilters({ ...filters, plan_id: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors">
              <option value="todos">Todos los planes</option>
              {planIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
        )}

        {/* Fechas — solo para pagados */}
        {filters.plan_tipo === 'paid' && (<>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Vence desde
              <InfoTip text="Filtra usuarios pagados cuya suscripción vence a partir de esta fecha. Ej: para los que vencen esta semana, pon el lunes." />
            </label>
            <input type="date" value={filters.fecha_desde} onChange={e => setFilters({ ...filters, fecha_desde: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Vence hasta
              <InfoTip text="Combínalo con 'Vence desde' para definir un rango. Ej: desde hoy hasta el domingo = todos los que vencen esta semana." />
            </label>
            <input type="date" value={filters.fecha_hasta} onChange={e => setFilters({ ...filters, fecha_hasta: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
          </div>
        </>)}

        {/* Ventana de tiempo — solo para cancelados */}
        {filters.plan_tipo === 'cancelled' && (
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Cancelaron en los...
              <InfoTip text="Filtra usuarios cuya suscripción venció dentro de este período. Más reciente = más probabilidad de reactivación." />
            </label>
            <select value={filters.cancelado_dias} onChange={e => setFilters({ ...filters, cancelado_dias: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors">
              {CANCELADO_DIAS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        )}

        {/* Eventos de valor */}
        <div className="col-span-2">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Eventos de valor mínimos
            <InfoTip text="Talleres u otras actividades completadas por el usuario en Califica. Ej: poner 3 filtra solo usuarios que han participado en al menos 3 actividades. Útil para campañas a usuarios activos." />
          </label>
          <input type="number" min={0} placeholder="Sin filtro — incluye todos los usuarios"
            value={filters.eventos_min} onChange={e => setFilters({ ...filters, eventos_min: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
        </div>
      </div>

      {/* ── Más filtros (colapsable) ── */}
      <button
        onClick={() => setShowAdvanced(v => !v)}
        className={`flex items-center gap-2 text-xs font-semibold mb-4 transition-colors ${
          hasAdvanced ? 'text-[#ff8080]' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▶</span>
        Más filtros
        {hasAdvanced && <span className="bg-[#ff8080] text-white px-1.5 py-0.5 rounded-full text-xs">activos</span>}
      </button>

      {showAdvanced && (
        <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-gray-50 space-y-3">
          <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            ⚠ Los datos de nivel, grado y colegio provienen de Bubble y pueden ser inconsistentes. Úsalos con precaución.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Nivel</label>
              <input type="text" placeholder="ej. Primaria"
                value={filters.nivel} onChange={e => setFilters({ ...filters, nivel: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Grado</label>
              <input type="text" placeholder="ej. 3° grado"
                value={filters.grado} onChange={e => setFilters({ ...filters, grado: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Colegio</label>
              <input type="text" placeholder="Buscar por nombre parcial..."
                value={filters.colegio} onChange={e => setFilters({ ...filters, colegio: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
            </div>
          </div>
        </div>
      )}


      {/* Counter */}
      <div className={`rounded-xl p-4 mb-6 flex items-center justify-between ${
        contactCount > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-100'
      }`}>
        <div>
          <p className={`text-2xl font-black ${contactCount > 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {loading ? '...' : contactCount.toLocaleString('es')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            contactos con teléfono WhatsApp válido
          </p>
        </div>
        {contactCount > 0 && (
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-xs text-blue-500 font-semibold">Utility</p>
              <p className="text-sm font-black text-blue-700">${(contactCount * getRate(filters.pais, 'utility', rates)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-xs text-purple-500 font-semibold">Marketing</p>
              <p className="text-sm font-black text-purple-700">${(contactCount * getRate(filters.pais, 'marketing', rates)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={contactCount === 0 || loading}
          className="px-5 py-2 bg-[#ff8080] hover:bg-[#ff6b6b] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Step 2: Template selection
// ──────────────────────────────────────────
function Step2({ templates, selectedId, onSelect, onNext, onBack, contactCount, pais, rates }: {
  templates: CommTemplate[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNext: () => void;
  onBack: () => void;
  contactCount: number;
  pais: string;
  rates?: Record<string, { marketing: number; utility: number }>;
}) {
  const [previewId, setPreviewId] = useState<number | null>(null);
  const preview = templates.find(t => t.id === (previewId ?? selectedId));
  const selectedTemplate = templates.find(t => t.id === selectedId);
  const rateUtility = getRate(pais, 'utility', rates);
  const rateMarketing = getRate(pais, 'marketing', rates);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          ← Volver
        </button>
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Paso 2 de 3</p>
          <h2 className="text-lg font-bold text-[#383838]">Seleccionar template</h2>
        </div>
        <div className="ml-auto">
          <Steps current={2} />
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <p className="text-sm">No hay templates aprobados.</p>
          <p className="text-xs mt-1">Ve a la pestaña Templates y aprueba uno primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {templates.map(t => {
            const isMarketing = t.categoria === 'marketing';
            const selected = selectedId === t.id;
            return (
              <div
                key={t.id}
                onClick={() => { onSelect(t.id); setPreviewId(t.id); }}
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  selected
                    ? 'border-[#ff8080] bg-red-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-[#383838] leading-tight">{t.nombre}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                    isMarketing ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {isMarketing ? 'Marketing' : 'Utility'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{t.body}</p>
                {t.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.variables.slice(0, 3).map(v => (
                      <span key={v} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{v}</span>
                    ))}
                  </div>
                )}
                {isMarketing && selected && (
                  <p className="text-xs text-yellow-600 font-medium mt-2">
                    ⚠ Template Marketing — costo más elevado que Utility
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Preview panel */}
      {preview && (
        <div className="bg-[#ECE5DD] rounded-xl p-4 mb-6">
          <p className="text-xs font-bold text-gray-500 mb-2">Preview — {preview.nombre}</p>
          <div className="bg-white rounded-xl rounded-tl-none px-3 py-2.5 max-w-xs shadow-sm">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {preview.body.replace(/\{\{(\w+)\}\}/g, (_: string, v: string) => `[${v}]`)}
            </p>
            <p className="text-right text-xs text-gray-400 mt-1">12:00 ✓✓</p>
          </div>
        </div>
      )}

      {/* Cost simulation */}
      {contactCount > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
            Simulación de costo — {contactCount.toLocaleString()} contactos
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className={`rounded-xl p-3 border-2 transition-all ${selectedTemplate?.categoria === 'utility' ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-blue-50/50'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-blue-700">Utility</span>
                {selectedTemplate?.categoria === 'utility' && (
                  <span className="text-xs text-blue-600 font-semibold">← Este template</span>
                )}
              </div>
              <p className="text-xl font-black text-blue-700">${(contactCount * rateUtility).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-blue-400 mt-0.5">@ ${rateUtility.toFixed(4)}/msg</p>
            </div>
            <div className={`rounded-xl p-3 border-2 transition-all ${selectedTemplate?.categoria === 'marketing' ? 'border-purple-400 bg-purple-50' : 'border-purple-100 bg-purple-50/50'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-purple-700">Marketing</span>
                {selectedTemplate?.categoria === 'marketing' && (
                  <span className="text-xs text-purple-600 font-semibold">← Este template</span>
                )}
              </div>
              <p className="text-xl font-black text-purple-700">${(contactCount * rateMarketing).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-purple-400 mt-0.5">@ ${rateMarketing.toFixed(4)}/msg</p>
            </div>
          </div>
          {selectedTemplate ? (
            <p className="text-xs text-gray-600">
              Costo estimado con <strong>{selectedTemplate.nombre}</strong> ({selectedTemplate.categoria ?? '—'}):
              <strong className="text-[#3c527a] ml-1">
                ${(contactCount * getRate(pais, selectedTemplate.categoria ?? 'utility', rates)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </strong>
              <span className="text-gray-400 ml-1">· tarifa {pais !== 'Todos' ? pais : 'Perú (80% audiencia)'}: ${getRate(pais, selectedTemplate.categoria ?? 'utility', rates).toFixed(4)}/msg</span>
            </p>
          ) : (
            <p className="text-xs text-gray-400">Selecciona un template para ver el costo exacto.</p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!selectedId}
          className="px-5 py-2 bg-[#ff8080] hover:bg-[#ff6b6b] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Step 3: Confirm & Send
// ──────────────────────────────────────────
function Step3({ filters, template, contactCount, onSend, onBack, sending, rates }: {
  filters: Filters;
  template: CommTemplate | undefined;
  contactCount: number;
  onSend: (nombre: string) => void;
  onBack: () => void;
  sending: boolean;
  rates?: Record<string, { marketing: number; utility: number }>;
}) {
  const [nombre, setNombre] = useState('');
  const [confirming, setConfirming] = useState(false);
  const costRate = getRate(filters.pais, template?.categoria ?? 'marketing', rates);
  const estimatedCost = (contactCount * costRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const filterLabels: string[] = [];
  if (filters.pais !== 'Todos') filterLabels.push(`País: ${filters.pais}`);
  if (filters.suscripcion !== 'todos') filterLabels.push(`Suscripción: ${filters.suscripcion}`);
  if (filters.fecha_desde) filterLabels.push(`Desde: ${filters.fecha_desde}`);
  if (filters.fecha_hasta) filterLabels.push(`Hasta: ${filters.fecha_hasta}`);
  if (filters.eventos_min) filterLabels.push(`Eventos mín: ${filters.eventos_min}`);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          ← Volver
        </button>
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Paso 3 de 3</p>
          <h2 className="text-lg font-bold text-[#383838]">Confirmar y enviar</h2>
        </div>
        <div className="ml-auto">
          <Steps current={3} />
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {/* Campaign name */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Nombre de la campaña
          </label>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder={`Campaña ${new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' })}`}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors"
          />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-2xl font-black text-green-600">{contactCount.toLocaleString('es')}</p>
            <p className="text-xs text-gray-500 mt-0.5">Destinatarios</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-bold text-[#383838] truncate">{template?.nombre}</p>
            <p className="text-xs text-gray-500 mt-0.5">Template</p>
            <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              template?.categoria === 'marketing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {template?.categoria === 'marketing' ? 'Marketing' : 'Utility'}
            </span>
          </div>
          <div className={`${template?.categoria === 'marketing' ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'} border rounded-xl p-4`}>
            <p className={`text-2xl font-black ${template?.categoria === 'marketing' ? 'text-yellow-600' : 'text-gray-600'}`}>
              ${estimatedCost}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Costo estimado USD</p>
          </div>
        </div>

        {/* Filters summary */}
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Segmento</p>
          {filterLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {filterLabels.map((l, i) => (
                <span key={i} className="bg-white border border-gray-200 text-gray-600 text-xs px-2.5 py-1 rounded-full font-medium">
                  {l}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Todos los contactos con teléfono válido</p>
          )}
        </div>

        {template?.categoria === 'marketing' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700">
            ⚠ Los templates Marketing tienen un costo por mensaje más elevado que los Utility. Verifica que el segmento es correcto antes de enviar.
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setConfirming(true)}
          disabled={sending}
          className="px-5 py-2.5 bg-[#ff8080] hover:bg-[#ff6b6b] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {sending ? 'Enviando...' : `Enviar a ${contactCount.toLocaleString('es')} contactos`}
        </button>
      </div>

      {/* Confirm modal */}
      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-lg font-bold text-[#383838] mb-2">¿Confirmar envío?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Se enviarán <strong>{contactCount.toLocaleString('es')} mensajes</strong> usando el template{' '}
              <strong>{template?.nombre}</strong>.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Costo estimado: <strong>${estimatedCost} USD</strong>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setConfirming(false); onSend(nombre || `Campaña ${new Date().toLocaleDateString('es')}`); }}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-[#ff8080] hover:bg-[#ff6b6b] text-white rounded-lg transition-colors"
              >
                Confirmar envío
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// Broadcast Detail View
// ──────────────────────────────────────────

interface Recipient {
  id: string;
  phone_number: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  responded_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  template_components: Array<{
    type: string;
    parameters: Array<{ text: string; parameter_name: string }>;
  }>;
}

interface DetailData {
  broadcast: {
    nombre: string;
    estado: string;
    created_at: string;
    total_destinatarios: number;
    enviados: number;
    entregados: number;
    leidos: number;
    respondidos: number;
    fallidos: number;
    tasa_respuesta: number;
    comm_templates: { nombre: string; body: string; categoria: string } | null;
    segmento_filtros: Record<string, string>;
  };
  recipients: Recipient[];
  meta: { page: number; per_page: number; total_pages: number; total_count: number };
}

function RecipientStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sent:      { label: 'Enviado',   cls: 'bg-blue-100 text-blue-700' },
    delivered: { label: 'Entregado', cls: 'bg-green-100 text-green-700' },
    read:      { label: 'Leído',     cls: 'bg-purple-100 text-purple-700' },
    responded: { label: 'Respondió', cls: 'bg-emerald-100 text-emerald-700' },
    failed:    { label: 'Error',     cls: 'bg-red-100 text-red-600' },
    pending:   { label: 'Pendiente', cls: 'bg-gray-100 text-gray-500' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function getContactName(r: Recipient): string {
  const bodyComp = r.template_components?.find(c => c.type === 'body');
  const nameParam = bodyComp?.parameters?.find(p => p.parameter_name === 'nombre' || p.parameter_name === 'name');
  return nameParam?.text ?? '';
}

function BroadcastDetail({ broadcastId, onBack }: { broadcastId: number; onBack: () => void }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchDetail = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch('/api/communication/broadcast-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId, page: p, perPage: 20 }),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error); return; }
      setData(result);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [broadcastId]);

  useEffect(() => { fetchDetail(page); }, [fetchDetail, page]);

  if (loading && !data) return (
    <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Cargando detalle...</div>
  );

  if (error) return (
    <div className="text-center py-16">
      <p className="text-red-500 text-sm mb-3">{error}</p>
      <button onClick={onBack} className="text-sm text-[#3c527a] hover:underline font-medium">← Volver</button>
    </div>
  );

  if (!data) return null;

  const b = data.broadcast;
  const deliveryRate = b.enviados > 0 ? Math.round(b.entregados / b.enviados * 100) : 0;
  const readRate = b.entregados > 0 ? Math.round(b.leidos / b.entregados * 100) : 0;
  const responseRate = b.enviados > 0 ? Math.round(b.respondidos / b.enviados * 100) : 0;

  const filteredRecipients = statusFilter === 'all'
    ? data.recipients
    : data.recipients.filter(r => {
        if (statusFilter === 'read') return r.read_at;
        if (statusFilter === 'delivered') return r.delivered_at && !r.read_at;
        if (statusFilter === 'sent') return r.sent_at && !r.delivered_at;
        if (statusFilter === 'failed') return r.failed_at;
        if (statusFilter === 'responded') return r.responded_at;
        return true;
      });

  const filterLabels: string[] = [];
  const sf = b.segmento_filtros ?? {};
  if (sf.pais && sf.pais !== 'Todos') filterLabels.push(`País: ${sf.pais}`);
  if (sf.plan_tipo && sf.plan_tipo !== 'todos') filterLabels.push(`Plan: ${sf.plan_tipo}`);
  if (sf.fecha_desde) filterLabels.push(`Desde: ${sf.fecha_desde}`);
  if (sf.fecha_hasta) filterLabels.push(`Hasta: ${sf.fecha_hasta}`);
  if (sf.cancelado_dias) filterLabels.push(`Cancel. ${sf.cancelado_dias}d`);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          ← Volver
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-[#383838]">{b.nombre}</h2>
            <EstadoBadge estado={b.estado as Broadcast['estado']} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Creada {new Date(b.created_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => fetchDetail(page)}
          disabled={loading}
          className="ml-auto text-xs text-[#3c527a] hover:text-[#2a3d5c] font-medium flex items-center gap-1 disabled:opacity-50"
        >
          <span className={loading ? 'animate-spin inline-block' : ''}>↻</span>
          Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="flex gap-3 mb-6">
        {[
          { label: 'Destinatarios', value: b.total_destinatarios, sub: '', color: 'text-gray-700', bg: 'bg-gray-50' },
          { label: 'Enviados', value: b.enviados, sub: b.enviados === b.total_destinatarios ? '100%' : `${Math.round(b.enviados / b.total_destinatarios * 100)}%`, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Entregados', value: b.entregados, sub: `${deliveryRate}%`, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Leídos', value: b.leidos, sub: `${readRate}%`, color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: 'Respondieron', value: b.respondidos, sub: `${responseRate}%`, color: 'text-emerald-700', bg: 'bg-emerald-50' },
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

      {/* Funnel bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Funnel de entrega</p>
        <div className="flex items-center gap-2">
          {[
            { label: 'Enviados', val: b.enviados, color: '#3b82f6' },
            { label: 'Entregados', val: b.entregados, color: '#22c55e' },
            { label: 'Leídos', val: b.leidos, color: '#8b5cf6' },
            { label: 'Respondieron', val: b.respondidos, color: '#10b981' },
          ].map((s, i) => {
            const pct = b.total_destinatarios > 0 ? Math.max(s.val / b.total_destinatarios * 100, 2) : 0;
            return (
              <div key={s.label} className="flex items-center gap-2 flex-1">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</span>
                    <span className="text-xs font-bold" style={{ color: s.color }}>{s.val.toLocaleString('es')}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                  </div>
                </div>
                {i < 3 && <span className="text-gray-300 text-sm flex-shrink-0">→</span>}
              </div>
            );
          })}
          {b.fallidos > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-300 text-sm">|</span>
              <div>
                <span className="text-xs font-semibold text-red-500">{b.fallidos} fallidos</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Configuración</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Template</p>
            <p className="text-sm font-semibold text-[#383838]">{b.comm_templates?.nombre ?? '—'}</p>
            {b.comm_templates?.categoria && (
              <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                b.comm_templates.categoria === 'marketing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>{b.comm_templates.categoria}</span>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Segmento</p>
            {filterLabels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {filterLabels.map((l, i) => (
                  <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">{l}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Todos los contactos</p>
            )}
          </div>
        </div>
      </div>

      {/* Recipients table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            Destinatarios ({data.meta.total_count.toLocaleString('es')})
          </p>
          <div className="flex gap-1.5">
            {[
              { value: 'all', label: 'Todos' },
              { value: 'read', label: 'Leídos' },
              { value: 'delivered', label: 'Entregados' },
              { value: 'sent', label: 'Solo enviados' },
              { value: 'failed', label: 'Fallidos' },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  statusFilter === f.value ? 'bg-[#3c527a] text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Contacto', 'Teléfono', 'Estado', 'Enviado', 'Entregado', 'Leído', 'Error'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRecipients.map(r => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-2.5 text-sm font-medium text-[#383838]">
                  {getContactName(r) || <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-sm text-gray-500 font-mono">{r.phone_number}</td>
                <td className="px-4 py-2.5"><RecipientStatusBadge status={r.failed_at ? 'failed' : r.responded_at ? 'responded' : r.read_at ? 'read' : r.delivered_at ? 'delivered' : r.sent_at ? 'sent' : 'pending'} /></td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{fmtDate(r.sent_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{fmtDate(r.delivered_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{fmtDate(r.read_at)}</td>
                <td className="px-4 py-2.5 text-xs text-red-500 max-w-[150px] truncate" title={r.error_message ?? ''}>
                  {r.error_message ?? '—'}
                </td>
              </tr>
            ))}
            {filteredRecipients.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Sin resultados para este filtro</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {data.meta.total_pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Página {data.meta.page} de {data.meta.total_pages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-3 py-1 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.meta.total_pages, p + 1))}
                disabled={page >= data.meta.total_pages || loading}
                className="px-3 py-1 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Main Campañas Component
// ──────────────────────────────────────────
export default function Campanias() {
  const { supabase } = useAuth();
  const [view, setView] = useState<'list' | 'detail' | 'step1' | 'step2' | 'step3'>('list');
  const [detailBroadcastId, setDetailBroadcastId] = useState<number | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<CommTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [countLoading, setCountLoading] = useState(false);
  const [contactCount, setContactCount] = useState(0);
  const [sending, setSending] = useState(false);

  const [syncingId, setSyncingId] = useState<number | null>(null);

  const [whatsappRates, setWhatsappRates] = useState<Record<string, { marketing: number; utility: number }> | undefined>(undefined);
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({
    pais: 'Todos', plan_tipo: 'todos', plan_id: 'todos',
    fecha_desde: '', fecha_hasta: '', cancelado_dias: '90',
    eventos_min: '', nivel: '', grado: '', colegio: '',
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const approvedTemplates = useMemo(() => templates.filter(t => t.estado === 'aprobado'), [templates]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [bRes, tRes, planRes, ratesRes] = await Promise.all([
      supabase.from('comm_broadcasts').select('*').order('created_at', { ascending: false }),
      supabase.from('comm_templates').select('id, nombre, body, variables, categoria, estado').order('nombre'),
      supabase.from('growth_users').select('plan_id').not('plan_id', 'is', null).eq('plan_paid', true),
      supabase.from('comm_whatsapp_rates').select('country, marketing, utility'),
    ]);
    if (bRes.error) toast.error('Error al cargar campañas');
    if (tRes.error) toast.error('Error al cargar templates');

    const tplMap = new Map((tRes.data ?? []).map((t: CommTemplate) => [t.id, t.nombre]));
    const enriched = (bRes.data ?? []).map((b: Broadcast) => ({
      ...b,
      template_nombre: tplMap.get(b.template_id ?? 0) ?? '—',
    }));
    setBroadcasts(enriched);
    setTemplates(tRes.data ?? []);

    // WhatsApp rates from DB
    if (ratesRes.data && ratesRes.data.length > 0) {
      const ratesMap: Record<string, { marketing: number; utility: number }> = {};
      ratesRes.data.forEach((r: { country: string; marketing: number; utility: number }) => {
        ratesMap[r.country] = { marketing: r.marketing, utility: r.utility };
      });
      setWhatsappRates(ratesMap);
    }

    // Unique plan_ids sorted
    const ids = [...new Set((planRes.data ?? []).map((r: { plan_id: string }) => r.plan_id))].sort();
    setPlanIds(ids);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch contact count on filter change
  useEffect(() => {
    if (view !== 'step1' || !supabase) return;
    const fetchCount = async () => {
      setCountLoading(true);
      let q = supabase.from('growth_users').select('id', { count: 'exact', head: true }).eq('whatsapp_valido', true);
      if (filters.pais !== 'Todos')          q = q.eq('country', filters.pais);
      if (filters.plan_tipo === 'paid')      q = q.eq('plan_paid', true).eq('cancelled', false);
      if (filters.plan_tipo === 'free')      q = q.eq('plan_free', true);
      if (filters.plan_tipo === 'cancelled') {
        q = q.eq('cancelled', true);
        if (filters.cancelado_dias) {
          const since = new Date();
          since.setDate(since.getDate() - parseInt(filters.cancelado_dias));
          q = q.gte('subscription_end', since.toISOString());
        }
      }
      if (filters.plan_id !== 'todos')       q = q.eq('plan_id', filters.plan_id);
      if (filters.plan_tipo === 'paid') {
        if (filters.fecha_desde)             q = q.gte('subscription_end', filters.fecha_desde);
        if (filters.fecha_hasta)             q = q.lte('subscription_end', `${filters.fecha_hasta}T23:59:59`);
      }
      if (filters.eventos_min)               q = q.gte('eventos_valor', parseInt(filters.eventos_min));
      if (filters.nivel)                     q = q.eq('nivel', filters.nivel);
      if (filters.grado)                     q = q.ilike('grado', `%${filters.grado}%`);
      if (filters.colegio)                   q = q.ilike('colegio', `%${filters.colegio}%`);
      const { count, error } = await q;
      if (!error) setContactCount(count ?? 0);
      setCountLoading(false);
    };
    const t = setTimeout(fetchCount, 300);
    return () => clearTimeout(t);
  }, [filters, view, supabase]);

  const handleSync = async (b: Broadcast) => {
    if (!b.kapso_broadcast_id) {
      toast.error('Esta campaña no tiene ID de Kapso');
      return;
    }
    setSyncingId(b.id);
    try {
      const res = await fetch('/api/communication/sync-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId: b.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Error al sincronizar');
        return;
      }
      // Update local state with synced values
      setBroadcasts(prev => prev.map(x => x.id === b.id
        ? {
            ...x,
            ...(data.update.estado && { estado: data.update.estado }),
            ...(data.update.total_destinatarios != null && { total_destinatarios: data.update.total_destinatarios }),
            ...(data.update.enviados != null && { enviados: data.update.enviados }),
            ...(data.update.entregados != null && { entregados: data.update.entregados }),
            ...(data.update.leidos != null && { leidos: data.update.leidos }),
          }
        : x
      ));
      toast.success('Métricas sincronizadas con Kapso');
    } catch {
      toast.error('Error de red');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSend = async (campañaNombre: string) => {
    if (!supabase || !selectedTemplateId) return;
    setSending(true);
    try {
      const { data, error } = await supabase
        .from('comm_broadcasts')
        .insert({
          nombre: campañaNombre,
          template_id: selectedTemplateId,
          segmento_filtros: filters,
          total_destinatarios: contactCount,
          enviados: 0,
          entregados: 0,
          leidos: 0,
          clickeados: 0,
          estado: 'borrador',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      // Trigger Kapso broadcast (server-side API route)
      const kapsoRes = await fetch('/api/communication/send-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId: data.id }),
      });

      if (!kapsoRes.ok) {
        const errData = await kapsoRes.json();
        // Re-fetch broadcast from DB to get actual estado (could be 'error')
        const { data: freshBroadcast } = await supabase
          .from('comm_broadcasts')
          .select('*')
          .eq('id', data.id)
          .single();
        setBroadcasts(prev => [{ ...(freshBroadcast ?? data), template_nombre: selectedTemplate?.nombre ?? '—' }, ...prev]);
        setView('list');
        toast.error(`Campaña creada pero error al enviar: ${errData.error}`);
        return;
      }

      const kapsoData = await kapsoRes.json();

      // Re-fetch broadcast from DB to get the final state set by the API route
      const { data: finalBroadcast } = await supabase
        .from('comm_broadcasts')
        .select('*')
        .eq('id', data.id)
        .single();

      setBroadcasts(prev => [{
        ...(finalBroadcast ?? { ...data, estado: 'completado', enviados: kapsoData.recipients_added ?? contactCount }),
        template_nombre: selectedTemplate?.nombre ?? '—',
      }, ...prev]);
      setView('list');
      setSelectedTemplateId(null);
      setFilters({ pais: 'Todos', plan_tipo: 'todos', plan_id: 'todos', fecha_desde: '', fecha_hasta: '', cancelado_dias: '90', eventos_min: '', nivel: '', grado: '', colegio: '' });
      toast.success(`Campaña enviada a ${kapsoData.recipients_added?.toLocaleString('es') ?? contactCount.toLocaleString('es')} contactos`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear campaña';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const stats = useMemo(() => ({
    este_mes: broadcasts.filter(b => b.created_at >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()).length,
    total_enviados: broadcasts.reduce((s, b) => s + b.total_destinatarios, 0),
    tasa_lectura: broadcasts.length > 0
      ? Math.round(broadcasts.filter(b => b.entregados > 0).reduce((s, b) => s + b.leidos / b.entregados, 0) / Math.max(1, broadcasts.filter(b => b.entregados > 0).length) * 100)
      : 0,
  }), [broadcasts]);

  // ── Detail view ──
  if (view === 'detail' && detailBroadcastId != null) return (
    <BroadcastDetail
      broadcastId={detailBroadcastId}
      onBack={() => { setView('list'); setDetailBroadcastId(null); fetchData(); }}
    />
  );

  // ── List view ──
  if (view === 'list') return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#383838]">Campañas</h2>
          <p className="text-sm text-gray-500 mt-0.5">Broadcasts manuales segmentados para el equipo de marketing</p>
        </div>
        <button
          onClick={() => { setView('step1'); setContactCount(0); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#ff8080] hover:bg-[#ff6b6b] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          Nueva campaña
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-100 rounded-xl p-4">
          <p className="text-2xl font-black text-gray-600">{stats.este_mes}</p>
          <p className="text-xs text-gray-500 mt-0.5">Campañas este mes</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-2xl font-black text-[#3c527a]">{stats.total_enviados.toLocaleString('es')}</p>
          <p className="text-xs text-gray-500 mt-0.5">Mensajes totales</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-2xl font-black text-green-600">{stats.tasa_lectura}%</p>
          <p className="text-xs text-gray-500 mt-0.5">Tasa de lectura promedio</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Cargando campañas...</div>
      ) : broadcasts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-sm">Aún no hay campañas.</p>
          <button onClick={() => setView('step1')} className="mt-3 text-sm text-[#ff8080] hover:underline font-medium">
            Crear la primera
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Campaña', 'Estado', 'Template', 'Dest.', 'Funnel', 'Fecha', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {broadcasts.map(b => (
                <tr
                  key={b.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => { if (b.kapso_broadcast_id) { setDetailBroadcastId(b.id); setView('detail'); } }}
                >
                  <td className="px-4 py-3 text-sm font-semibold text-[#383838]">{b.nombre}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={b.estado} /></td>
                  <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[180px]">{b.template_nombre}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-700">
                    {b.enviados > 0 ? b.enviados.toLocaleString('es') : b.total_destinatarios.toLocaleString('es')}
                    {b.total_destinatarios > 0 && <span className="text-gray-400 font-normal"> / {b.total_destinatarios.toLocaleString('es')}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {b.enviados > 0 ? (
                      <div className="flex items-center gap-1 text-xs font-semibold">
                        <span className="text-blue-600">{b.enviados}</span>
                        <span className="text-gray-300">→</span>
                        <span className="text-green-600">{b.entregados}</span>
                        <span className="text-gray-300">→</span>
                        <span className="text-purple-600">{b.leidos}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(b.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    {b.kapso_broadcast_id && (
                      <button
                        onClick={e => { e.stopPropagation(); handleSync(b); }}
                        disabled={syncingId === b.id}
                        title="Sincronizar métricas"
                        className="text-xs text-[#3c527a] hover:text-[#2a3d5c] font-medium flex items-center gap-1 disabled:opacity-50"
                      >
                        <span className={syncingId === b.id ? 'animate-spin inline-block' : ''}>↻</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Steps ──
  return (
    <div className="max-w-2xl">
      {view === 'step1' && (
        <Step1
          filters={filters}
          setFilters={setFilters}
          contactCount={contactCount}
          loading={countLoading}
          onNext={() => setView('step2')}
          onBack={() => setView('list')}
          planIds={planIds}
          rates={whatsappRates}
        />
      )}
      {view === 'step2' && (
        <Step2
          templates={approvedTemplates}
          selectedId={selectedTemplateId}
          onSelect={setSelectedTemplateId}
          onNext={() => setView('step3')}
          onBack={() => setView('step1')}
          contactCount={contactCount}
          pais={filters.pais}
          rates={whatsappRates}
        />
      )}
      {view === 'step3' && (
        <Step3
          filters={filters}
          template={selectedTemplate}
          contactCount={contactCount}
          onSend={handleSend}
          onBack={() => setView('step2')}
          sending={sending}
          rates={whatsappRates}
        />
      )}
    </div>
  );
}
