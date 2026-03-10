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

// Estimated Meta rates by country (USD per message)
const META_RATES: Record<string, number> = {
  Perú: 0.02, México: 0.0085, Chile: 0.02, Colombia: 0.0008,
  Argentina: 0.02, Ecuador: 0.018, Bolivia: 0.018,
  Guatemala: 0.018, Paraguay: 0.018, Uruguay: 0.018,
  Todos: 0.015,
};

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

function Step1({ filters, setFilters, contactCount, loading, onNext, onBack, planIds }: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  contactCount: number;
  loading: boolean;
  onNext: () => void;
  onBack: () => void;
  planIds: string[];
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
              <p className="text-sm font-black text-blue-700">${(contactCount * 0.005).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-xs text-purple-500 font-semibold">Marketing</p>
              <p className="text-sm font-black text-purple-700">${(contactCount * 0.013).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
const RATES = { utility: 0.005, marketing: 0.013 };

function Step2({ templates, selectedId, onSelect, onNext, onBack, contactCount, pais }: {
  templates: CommTemplate[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNext: () => void;
  onBack: () => void;
  contactCount: number;
  pais: string;
}) {
  const [previewId, setPreviewId] = useState<number | null>(null);
  const preview = templates.find(t => t.id === (previewId ?? selectedId));
  const selectedTemplate = templates.find(t => t.id === selectedId);
  const countryRate = META_RATES[pais] || 0.015;

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
              <p className="text-xl font-black text-blue-700">${(contactCount * RATES.utility).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-blue-400 mt-0.5">@ $0.005/msg</p>
            </div>
            <div className={`rounded-xl p-3 border-2 transition-all ${selectedTemplate?.categoria === 'marketing' ? 'border-purple-400 bg-purple-50' : 'border-purple-100 bg-purple-50/50'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-purple-700">Marketing</span>
                {selectedTemplate?.categoria === 'marketing' && (
                  <span className="text-xs text-purple-600 font-semibold">← Este template</span>
                )}
              </div>
              <p className="text-xl font-black text-purple-700">${(contactCount * RATES.marketing).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-purple-400 mt-0.5">@ $0.013/msg</p>
            </div>
          </div>
          {selectedTemplate ? (
            <p className="text-xs text-gray-600">
              Costo estimado con <strong>{selectedTemplate.nombre}</strong> ({selectedTemplate.categoria ?? '—'}):
              <strong className="text-[#3c527a] ml-1">
                ${(contactCount * RATES[selectedTemplate.categoria ?? 'utility']).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </strong>
              {pais !== 'Todos' && (
                <span className="text-gray-400 ml-1">· tarifa por país {pais}: ${countryRate.toFixed(3)}/msg</span>
              )}
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
function Step3({ filters, template, contactCount, onSend, onBack, sending }: {
  filters: Filters;
  template: CommTemplate | undefined;
  contactCount: number;
  onSend: (nombre: string) => void;
  onBack: () => void;
  sending: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [confirming, setConfirming] = useState(false);
  const costRate = META_RATES[filters.pais] || 0.015;
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
// Main Campañas Component
// ──────────────────────────────────────────
export default function Campanias() {
  const { supabase } = useAuth();
  const [view, setView] = useState<'list' | 'step1' | 'step2' | 'step3'>('list');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<CommTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [countLoading, setCountLoading] = useState(false);
  const [contactCount, setContactCount] = useState(0);
  const [sending, setSending] = useState(false);

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
    const [bRes, tRes, planRes] = await Promise.all([
      supabase.from('comm_broadcasts').select('*').order('created_at', { ascending: false }),
      supabase.from('comm_templates').select('id, nombre, body, variables, categoria, estado').order('nombre'),
      supabase.from('growth_users').select('plan_id').not('plan_id', 'is', null).eq('plan_paid', true),
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
        // Broadcast record created but Kapso failed — show warning
        setBroadcasts(prev => [{ ...data, template_nombre: selectedTemplate?.nombre ?? '—' }, ...prev]);
        setView('list');
        toast.error(`Campaña creada pero error al enviar: ${errData.error}`);
        return;
      }

      // Update local state with completado status
      setBroadcasts(prev => [{
        ...data,
        estado: 'completado',
        template_nombre: selectedTemplate?.nombre ?? '—',
      }, ...prev]);
      setView('list');
      setSelectedTemplateId(null);
      setFilters({ pais: 'Todos', plan_tipo: 'todos', plan_id: 'todos', fecha_desde: '', fecha_hasta: '', cancelado_dias: '90', eventos_min: '', nivel: '', grado: '', colegio: '' });
      toast.success(`Campaña enviada a ${contactCount.toLocaleString('es')} contactos`);
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
                {['Campaña', 'Template', 'Dest.', 'Entregados', 'Leídos', 'Estado', 'Fecha'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {broadcasts.map(b => (
                <tr key={b.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-[#383838]">{b.nombre}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{b.template_nombre}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-700">{b.total_destinatarios.toLocaleString('es')}</td>
                  <td className="px-4 py-3">
                    {b.entregados > 0
                      ? <PctBar val={b.entregados} total={b.total_destinatarios} color="#3c527a" />
                      : <span className="text-xs text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {b.leidos > 0
                      ? <PctBar val={b.leidos} total={b.entregados} color="#059669" />
                      : <span className="text-xs text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3"><EstadoBadge estado={b.estado} /></td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(b.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
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
        />
      )}
    </div>
  );
}
