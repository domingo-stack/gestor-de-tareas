'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

interface TemplateButton {
  type: 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY';
  text: string;
  url?: string;
  phone_number?: string;
}

interface CommTemplate {
  id: number;
  nombre: string;
  body: string;
  variables: string[];
  categoria: 'utility' | 'marketing' | null;
  estado: string;
  buttons: TemplateButton[];
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
  estado: 'borrador' | 'enviando' | 'completado' | 'error' | 'programado';
  kapso_broadcast_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  template_nombre?: string;
}

interface Filters {
  pais: string;
  plan_tipo: string;       // 'todos' | 'free' | 'paid' | 'cancelled'
  plan_ids: string[];      // plan_ids seleccionados (vacío = todos)
  fecha_desde: string;     // solo para pagados (vencimiento)
  fecha_hasta: string;     // solo para pagados (vencimiento)
  registro_desde: string;  // solo para gratuitos: fecha de registro desde
  registro_hasta: string;  // solo para gratuitos: fecha de registro hasta
  cancelado_desde: string; // solo para cancelados: días mínimo desde cancelación
  cancelado_hasta: string; // solo para cancelados: días máximo desde cancelación
  eventos_min: string;
  eventos_max: string;
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
// removed CANCELADO_DIAS — now using range inputs

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
  const map: Record<string, { label: string; cls: string }> = {
    borrador:   { label: 'Borrador',   cls: 'bg-gray-100 text-gray-600' },
    enviando:   { label: 'Enviando…',  cls: 'bg-blue-100 text-blue-700' },
    completado: { label: 'Completado', cls: 'bg-green-100 text-green-700' },
    error:      { label: 'Error',      cls: 'bg-red-100 text-red-600' },
    programado: { label: 'Programado', cls: 'bg-purple-100 text-purple-700' },
  };
  const { label, cls } = map[estado] ?? map.borrador;
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
          <select value={filters.plan_tipo} onChange={e => setFilters({ ...filters, plan_tipo: e.target.value, plan_ids: [] })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors">
            {PLAN_TIPOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Plan específico — solo si tipo = paid */}
        {filters.plan_tipo === 'paid' && (
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Plan específico</label>
            <div className="border border-gray-200 rounded-lg p-2.5 bg-white">
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.plan_ids.length === 0}
                  onChange={() => setFilters({ ...filters, plan_ids: [] })}
                  className="rounded border-gray-300 text-[#3c527a] focus:ring-[#3c527a] h-3.5 w-3.5"
                />
                Todos los planes
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {planIds.map(id => (
                  <label key={id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.plan_ids.includes(id)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...filters.plan_ids, id]
                          : filters.plan_ids.filter(p => p !== id);
                        setFilters({ ...filters, plan_ids: next });
                      }}
                      className="rounded border-gray-300 text-[#3c527a] focus:ring-[#3c527a] h-3.5 w-3.5"
                    />
                    {id}
                  </label>
                ))}
              </div>
            </div>
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

        {/* Fechas de registro — solo para gratuitos */}
        {filters.plan_tipo === 'free' && (<>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Registrado desde
              <InfoTip text="Filtra usuarios gratuitos que se registraron a partir de esta fecha. Ej: 2026-01-01 para los registrados este año." />
            </label>
            <input type="date" value={filters.registro_desde} onChange={e => setFilters({ ...filters, registro_desde: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Registrado hasta
              <InfoTip text="Combínalo con 'Registrado desde' para definir un rango. Ej: del 1 al 31 de enero = todos los que se registraron en enero." />
            </label>
            <input type="date" value={filters.registro_hasta} onChange={e => setFilters({ ...filters, registro_hasta: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
          </div>
        </>)}

        {/* Ventana de tiempo — solo para cancelados */}
        {filters.plan_tipo === 'cancelled' && (<>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Cancelaron hace (desde)
              <InfoTip text="Mínimo de días desde que cancelaron. Ej: 30 filtra usuarios que cancelaron hace al menos 30 días." />
            </label>
            <input type="number" min={0} placeholder="Ej: 30"
              value={filters.cancelado_desde} onChange={e => setFilters({ ...filters, cancelado_desde: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Cancelaron hace (hasta)
              <InfoTip text="Máximo de días desde que cancelaron. Ej: 60 filtra usuarios que cancelaron hace máximo 60 días. Combinado con 'desde' crea un rango." />
            </label>
            <input type="number" min={0} placeholder="Ej: 60"
              value={filters.cancelado_hasta} onChange={e => setFilters({ ...filters, cancelado_hasta: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
          </div>
        </>)}

        {/* Eventos de valor (rango) */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Eventos de valor (mín)
            <InfoTip text="Mínimo de eventos de valor. Ej: 15 filtra usuarios con al menos 15 actividades completadas." />
          </label>
          <input type="number" min={0} placeholder="Sin mínimo"
            value={filters.eventos_min} onChange={e => setFilters({ ...filters, eventos_min: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#3c527a] transition-colors" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Eventos de valor (máx)
            <InfoTip text="Máximo de eventos de valor. Ej: 25 excluye usuarios con más de 25 actividades. Combinado con mín, crea un rango preciso." />
          </label>
          <input type="number" min={0} placeholder="Sin máximo"
            value={filters.eventos_max} onChange={e => setFilters({ ...filters, eventos_max: e.target.value })}
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
// Step 2: Template selection (single or sequence)
// ──────────────────────────────────────────
interface SequenceStep {
  template_id: number | null;
  delay_days: number;
  delay_hours: number;
  send_at_hour: number;
  send_date: string; // YYYY-MM-DD
  send_time: string; // HH:MM
}

function Step2({ templates, selectedId, onSelect, onNext, onBack, contactCount, pais, rates, isSequence, setIsSequence, sequenceSteps, setSequenceSteps }: {
  templates: CommTemplate[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNext: () => void;
  onBack: () => void;
  contactCount: number;
  pais: string;
  rates?: Record<string, { marketing: number; utility: number }>;
  isSequence: boolean;
  setIsSequence: (v: boolean) => void;
  sequenceSteps: SequenceStep[];
  setSequenceSteps: (steps: SequenceStep[]) => void;
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
          <h2 className="text-lg font-bold text-[#383838]">{isSequence ? 'Configurar secuencia' : 'Seleccionar template'}</h2>
        </div>
        <div className="ml-auto">
          <Steps current={2} />
        </div>
      </div>

      {/* Toggle: Mensaje único / Secuencia */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setIsSequence(false)}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            !isSequence ? 'bg-[#3c527a] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Mensaje único
        </button>
        <button
          onClick={() => setIsSequence(true)}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            isSequence ? 'bg-[#3c527a] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Secuencia
        </button>
      </div>

      {/* ── Sequence mode ── */}
      {isSequence && (
        <div className="space-y-6 mb-6">
          {sequenceSteps.map((step, idx) => {
            const selectedTmpl = templates.find(t => t.id === step.template_id);
            return (
              <div key={idx} className="relative">
                {/* Connector line */}
                {idx > 0 && (
                  <div className="absolute -top-6 left-5 w-0.5 h-6 bg-gray-200" />
                )}

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Step header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div className="w-7 h-7 rounded-full bg-[#3c527a] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-gray-700">
                        {idx === 0 ? 'Primer mensaje' : `Mensaje ${idx + 1}`}
                      </span>
                      {idx === 0 && <span className="text-xs text-gray-400 ml-2">— se envía al activar</span>}
                    </div>
                    {/* Date + Time */}
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={step.send_date}
                        min={idx > 0 && sequenceSteps[idx - 1].send_date ? sequenceSteps[idx - 1].send_date : new Date().toISOString().slice(0, 10)}
                        onChange={e => {
                          const newSteps = [...sequenceSteps];
                          newSteps[idx] = { ...newSteps[idx], send_date: e.target.value };
                          setSequenceSteps(newSteps);
                        }}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#3c527a]"
                      />
                      <input
                        type="time"
                        value={step.send_time}
                        onChange={e => {
                          const newSteps = [...sequenceSteps];
                          newSteps[idx] = { ...newSteps[idx], send_time: e.target.value };
                          setSequenceSteps(newSteps);
                        }}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#3c527a]"
                      />
                      {idx > 0 && sequenceSteps[idx - 1].send_date && step.send_date && (
                        <span className="text-[10px] text-gray-400">
                          +{Math.max(0, Math.round((new Date(step.send_date + 'T' + step.send_time).getTime() - new Date(sequenceSteps[idx - 1].send_date + 'T' + sequenceSteps[idx - 1].send_time).getTime()) / (1000 * 60 * 60 * 24)))}d
                        </span>
                      )}
                    </div>
                    {/* Reorder + Remove */}
                    <div className="flex items-center gap-0.5 ml-2">
                      {idx > 0 && (
                        <button onClick={() => {
                          const n = [...sequenceSteps];
                          [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                          setSequenceSteps(n);
                        }} className="p-1 text-gray-300 hover:text-gray-500 text-xs" title="Subir">▲</button>
                      )}
                      {idx < sequenceSteps.length - 1 && (
                        <button onClick={() => {
                          const n = [...sequenceSteps];
                          [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
                          setSequenceSteps(n);
                        }} className="p-1 text-gray-300 hover:text-gray-500 text-xs" title="Bajar">▼</button>
                      )}
                      {sequenceSteps.length > 1 && (
                        <button onClick={() => setSequenceSteps(sequenceSteps.filter((_, i) => i !== idx))} className="p-1 text-gray-300 hover:text-red-500 ml-1" title="Eliminar">✕</button>
                      )}
                    </div>
                  </div>

                  {/* Template selector — horizontal scroll cards */}
                  <div className="p-4">
                    {selectedTmpl ? (
                      /* Selected template preview */
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-[#383838]">{selectedTmpl.nombre}</p>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                selectedTmpl.categoria === 'marketing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                              }`}>{selectedTmpl.categoria}</span>
                            </div>
                            <button
                              onClick={() => {
                                const newSteps = [...sequenceSteps];
                                newSteps[idx] = { ...newSteps[idx], template_id: null };
                                setSequenceSteps(newSteps);
                              }}
                              className="text-xs text-gray-400 hover:text-red-500"
                            >
                              Cambiar
                            </button>
                          </div>
                          <div className="bg-[#ECE5DD] rounded-xl p-3">
                            <div className="bg-white rounded-xl rounded-tl-none px-3 py-2 max-w-sm shadow-sm">
                              <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-4">
                                {selectedTmpl.body.replace(/\{\{(\w+)\}\}/g, (_: string, v: string) => `[${v}]`)}
                              </p>
                              <p className="text-right text-[10px] text-gray-400 mt-1">12:00 ✓✓</p>
                            </div>
                            {(selectedTmpl.buttons ?? []).filter(b => b.text.trim()).length > 0 && (
                              <div className="flex flex-col gap-1 mt-1 max-w-sm">
                                {selectedTmpl.buttons.filter(b => b.text.trim()).map((btn, bi) => (
                                  <div key={bi} className="bg-white rounded-lg px-3 py-1.5 text-center text-xs font-medium text-[#00a5f4] shadow-sm">
                                    {btn.type === 'URL' && '🔗 '}{btn.text}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Template picker — horizontal scroll */
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Selecciona un template para este paso:</p>
                        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                          {templates.map(t => (
                            <div
                              key={t.id}
                              onClick={() => {
                                const newSteps = [...sequenceSteps];
                                newSteps[idx] = { ...newSteps[idx], template_id: t.id };
                                setSequenceSteps(newSteps);
                              }}
                              className="flex-shrink-0 w-56 border-2 border-gray-200 hover:border-[#ff8080] rounded-xl p-3 cursor-pointer transition-all hover:shadow-md bg-white"
                            >
                              <div className="flex items-start justify-between gap-1 mb-1.5">
                                <p className="text-xs font-semibold text-[#383838] leading-tight line-clamp-1">{t.nombre}</p>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                  t.categoria === 'marketing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                }`}>{t.categoria === 'marketing' ? 'Mkt' : 'Util'}</span>
                              </div>
                              <p className="text-[11px] text-gray-400 line-clamp-3 leading-relaxed">{t.body}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add step */}
          <button
            onClick={() => {
              const lastStep = sequenceSteps[sequenceSteps.length - 1];
              const lastDate = lastStep.send_date ? new Date(lastStep.send_date + 'T12:00:00') : new Date();
              const nextDate = new Date(lastDate);
              nextDate.setDate(nextDate.getDate() + 3);
              setSequenceSteps([...sequenceSteps, {
                template_id: null, delay_days: 3, delay_hours: 0, send_at_hour: 9,
                send_date: nextDate.toISOString().slice(0, 10), send_time: '09:00',
              }]);
            }}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-semibold text-gray-400 hover:text-[#3c527a] hover:border-[#3c527a] transition-colors"
          >
            + Agregar mensaje
          </button>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs text-blue-700 font-medium">
              {sequenceSteps.length} mensaje{sequenceSteps.length > 1 ? 's' : ''} · Duración total: {sequenceSteps.reduce((s, st) => s + st.delay_days, 0)} días
            </p>
            <p className="text-[10px] text-blue-500 mt-0.5">
              Los usuarios que respondan con opt-out no recibirán los mensajes siguientes.
            </p>
          </div>
        </div>
      )}

      {/* ── Single message mode ── */}
      {!isSequence && (templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <p className="text-sm">No hay templates aprobados.</p>
          <p className="text-xs mt-1">Ve a la pestaña Templates y aprueba uno primero.</p>
        </div>
      ) : (
        <>
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
          {/* Buttons preview */}
          {(preview.buttons ?? []).filter(b => b.text.trim()).length > 0 && (
            <div className="flex flex-col gap-1 mt-1 max-w-xs">
              {preview.buttons.filter(b => b.text.trim()).map((btn, i) => (
                <div key={i} className="bg-white rounded-lg px-3 py-2 text-center text-sm font-medium text-[#00a5f4] shadow-sm">
                  {btn.type === 'URL' && '🔗 '}
                  {btn.type === 'PHONE_NUMBER' && '📞 '}
                  {btn.text}
                </div>
              ))}
            </div>
          )}
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
        </>
      ))}

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={isSequence ? (
            sequenceSteps.some(s => !s.template_id || !s.send_date || !s.send_time) ||
            sequenceSteps.some((s, i) => i > 0 && new Date(s.send_date + 'T' + s.send_time) <= new Date(sequenceSteps[i - 1].send_date + 'T' + sequenceSteps[i - 1].send_time))
          ) : !selectedId}
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
function Step3({ filters, template, contactCount, onSend, onBack, sending, rates, existingNames, isSequence, sequenceSteps, templates }: {
  filters: Filters;
  template: CommTemplate | undefined;
  contactCount: number;
  onSend: (nombre: string, scheduledAt?: string, autoReplyMessage?: string) => void;
  onBack: () => void;
  sending: boolean;
  rates?: Record<string, { marketing: number; utility: number }>;
  existingNames: string[];
  isSequence?: boolean;
  sequenceSteps?: SequenceStep[];
  templates?: CommTemplate[];
}) {
  const [nombre, setNombre] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyMessage, setAutoReplyMessage] = useState('');
  const costRate = getRate(filters.pais, template?.categoria ?? 'marketing', rates);
  const estimatedCost = isSequence
    ? (sequenceSteps ?? []).reduce((total, s) => {
        const t = (templates ?? []).find(tmpl => tmpl.id === s.template_id);
        return total + contactCount * getRate(filters.pais, t?.categoria ?? 'marketing', rates);
      }, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (contactCount * costRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const nameTrimmed = nombre.trim();
  const isDuplicate = existingNames.some(n => n.toLowerCase() === nameTrimmed.toLowerCase());
  const nameError = !nameTrimmed ? 'El nombre es obligatorio' : isDuplicate ? 'Ya existe una campaña con este nombre' : '';
  const scheduleError = !isSequence && scheduleMode === 'scheduled' && !scheduleDate ? 'Selecciona fecha' : '';
  const canSend = !nameError && !scheduleError && !sending;

  const filterLabels: string[] = [];
  if (filters.pais !== 'Todos') filterLabels.push(`País: ${filters.pais}`);
  if (filters.plan_tipo && filters.plan_tipo !== 'todos') filterLabels.push(`Plan: ${filters.plan_tipo}`);
  if (filters.plan_ids.length > 0) filterLabels.push(`Planes: ${filters.plan_ids.join(', ')}`);
  if (filters.fecha_desde) filterLabels.push(`Vence desde: ${filters.fecha_desde}`);
  if (filters.fecha_hasta) filterLabels.push(`Vence hasta: ${filters.fecha_hasta}`);
  if (filters.registro_desde) filterLabels.push(`Registro desde: ${filters.registro_desde}`);
  if (filters.registro_hasta) filterLabels.push(`Registro hasta: ${filters.registro_hasta}`);
  if (filters.cancelado_desde || filters.cancelado_hasta) {
    const parts = [];
    if (filters.cancelado_desde) parts.push(`${filters.cancelado_desde}d`);
    if (filters.cancelado_hasta) parts.push(`${filters.cancelado_hasta}d`);
    filterLabels.push(`Cancel. ${parts.join(' – ')}`);
  }
  if (filters.eventos_min || filters.eventos_max) {
    const parts = [];
    if (filters.eventos_min) parts.push(`mín ${filters.eventos_min}`);
    if (filters.eventos_max) parts.push(`máx ${filters.eventos_max}`);
    filterLabels.push(`Eventos: ${parts.join(', ')}`);
  }

  const getScheduledAt = () => {
    if (scheduleMode === 'now') return undefined;
    return new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
  };

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
            Nombre de la campaña <span className="text-red-400">*</span>
          </label>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Renovación marzo — segmento 60 días"
            className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none transition-colors ${
              nameError && nameTrimmed ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-[#3c527a]'
            }`}
          />
          {nameError && nameTrimmed && (
            <p className="text-xs text-red-500 mt-1">{nameError}</p>
          )}
        </div>

        {/* Schedule (single) or Timeline (sequence) */}
        {isSequence ? (
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Timeline de la secuencia
            </label>
            <div className="space-y-3">
              {(sequenceSteps ?? []).map((step, idx) => {
                const tmpl = (templates ?? []).find(t => t.id === step.template_id);
                const fmtDate = step.send_date ? new Date(step.send_date + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' }) : '—';
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#3c527a] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#383838]">{tmpl?.nombre ?? 'Sin template'}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">🗓 {fmtDate}</span>
                          <span className="text-xs text-gray-500">🕐 {step.send_time || '09:00'}</span>
                        </div>
                      </div>
                      {tmpl && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{tmpl.body}</p>
                      )}
                    </div>
                    {idx < (sequenceSteps?.length ?? 0) - 1 && (
                      <div className="w-0.5 h-3 bg-gray-200 absolute" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Envío
            </label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setScheduleMode('now')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  scheduleMode === 'now' ? 'bg-[#3c527a] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                Enviar ahora
              </button>
              <button
                onClick={() => setScheduleMode('scheduled')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  scheduleMode === 'scheduled' ? 'bg-[#3c527a] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                Programar
              </button>
            </div>
            {scheduleMode === 'scheduled' && (
              <div>
                <div className="flex gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={e => setScheduleDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#3c527a] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Hora</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#3c527a] transition-colors"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Configurado en zona horaria: <span className="font-semibold text-gray-500">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Auto-reply */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Respuesta automática
          </label>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
              className={`w-10 h-6 rounded-full transition-colors relative ${
                autoReplyEnabled ? 'bg-green-500' : 'bg-gray-300'
              } cursor-pointer`}
            >
              <span
                className="absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-all"
                style={{ left: autoReplyEnabled ? '19px' : '3px' }}
              />
            </button>
            <span className="text-sm text-gray-600">
              {autoReplyEnabled ? 'Activada' : 'Desactivada'} — respuesta personalizada cuando el usuario responda a esta campaña
            </span>
          </div>
          {autoReplyEnabled && (
            <textarea
              value={autoReplyMessage}
              onChange={e => setAutoReplyMessage(e.target.value)}
              placeholder="Ej: Gracias por tu interés en nuestra promoción. Un asesor se pondrá en contacto contigo pronto."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#3c527a] transition-colors resize-none"
            />
          )}
        </div>

        {/* Summary cards */}
        <div className={`grid ${isSequence ? 'grid-cols-3' : 'grid-cols-3'} gap-4`}>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-2xl font-black text-green-600">{contactCount.toLocaleString('es')}</p>
            <p className="text-xs text-gray-500 mt-0.5">Destinatarios</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            {isSequence ? (
              <>
                <p className="text-2xl font-black text-[#3c527a]">{sequenceSteps?.length ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">Mensajes en secuencia</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {(sequenceSteps ?? []).reduce((s, st) => s + st.delay_days, 0)} días de duración
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-[#383838] truncate">{template?.nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">Template</p>
                <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  template?.categoria === 'marketing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {template?.categoria === 'marketing' ? 'Marketing' : 'Utility'}
                </span>
              </>
            )}
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-2xl font-black text-gray-600">
              ${estimatedCost}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Costo estimado USD{isSequence ? ' (total)' : ''}</p>
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
          onClick={() => { if (canSend) setConfirming(true); }}
          disabled={!canSend}
          className="px-5 py-2.5 bg-[#ff8080] hover:bg-[#ff6b6b] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {sending ? 'Enviando...' : scheduleMode === 'scheduled'
            ? `Programar para ${scheduleDate || '...'} ${scheduleTime}`
            : `Enviar a ${contactCount.toLocaleString('es')} contactos`
          }
        </button>
      </div>

      {/* Confirm modal */}
      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-lg font-bold text-[#383838] mb-2">
              {isSequence ? '¿Activar secuencia?' : scheduleMode === 'scheduled' ? '¿Programar campaña?' : '¿Confirmar envío?'}
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              {isSequence ? (
                <>Se enviarán <strong>{sequenceSteps?.length} mensajes</strong> a <strong>{contactCount.toLocaleString('es')} contactos</strong> según la programación configurada.</>
              ) : scheduleMode === 'scheduled' ? (
                <>Se programarán <strong>{contactCount.toLocaleString('es')} mensajes</strong> para el <strong>{scheduleDate} a las {scheduleTime}</strong>.</>
              ) : (
                <>Se enviarán <strong>{contactCount.toLocaleString('es')} mensajes</strong> ahora.</>
              )}
            </p>
            {!isSequence && <p className="text-sm text-gray-500 mb-1">Template: <strong>{template?.nombre}</strong></p>}
            <p className="text-sm text-gray-500 mb-6">Costo estimado: <strong>${estimatedCost} USD</strong></p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setConfirming(false); onSend(nameTrimmed, getScheduledAt(), autoReplyEnabled ? autoReplyMessage : undefined); }}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-[#ff8080] hover:bg-[#ff6b6b] text-white rounded-lg transition-colors"
              >
                {isSequence ? 'Activar secuencia' : scheduleMode === 'scheduled' ? 'Programar' : 'Confirmar envío'}
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
  if (sf.plan_ids?.length) filterLabels.push(`Planes: ${(sf.plan_ids as string[]).join(', ')}`);
  if (sf.fecha_desde) filterLabels.push(`Vence desde: ${sf.fecha_desde}`);
  if (sf.fecha_hasta) filterLabels.push(`Vence hasta: ${sf.fecha_hasta}`);
  if (sf.registro_desde) filterLabels.push(`Registro desde: ${sf.registro_desde}`);
  if (sf.registro_hasta) filterLabels.push(`Registro hasta: ${sf.registro_hasta}`);
  if (sf.cancelado_desde || sf.cancelado_hasta) {
    const parts = [];
    if (sf.cancelado_desde) parts.push(`${sf.cancelado_desde}d`);
    if (sf.cancelado_hasta) parts.push(`${sf.cancelado_hasta}d`);
    filterLabels.push(`Cancel. ${parts.join(' – ')}`);
  }
  if (sf.cancelado_dias) filterLabels.push(`Cancel. ${sf.cancelado_dias}d`);
  if (sf.eventos_min || sf.eventos_max) {
    const parts = [];
    if (sf.eventos_min) parts.push(`mín ${sf.eventos_min}`);
    if (sf.eventos_max) parts.push(`máx ${sf.eventos_max}`);
    filterLabels.push(`Eventos: ${parts.join(', ')}`);
  }

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
    pais: 'Todos', plan_tipo: 'todos', plan_ids: [],
    fecha_desde: '', fecha_hasta: '', registro_desde: '', registro_hasta: '',
    cancelado_desde: '', cancelado_hasta: '',
    eventos_min: '', eventos_max: '', nivel: '', grado: '', colegio: '',
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isSequence, setIsSequence] = useState(false);
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[]>([
    { template_id: null, delay_days: 0, delay_hours: 0, send_at_hour: 9, send_date: '', send_time: '09:00' },
  ]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const approvedTemplates = useMemo(() => templates.filter(t => t.estado === 'aprobado' && ((t as { uso?: string }).uso === 'campaña' || (t as { uso?: string }).uso === 'ambos' || !(t as { uso?: string }).uso)), [templates]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [bRes, tRes, planRes, ratesRes] = await Promise.all([
      supabase.from('comm_broadcasts').select('*').order('created_at', { ascending: false }),
      supabase.from('comm_templates').select('id, nombre, body, variables, categoria, estado, buttons, uso').order('nombre'),
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
      if (filters.plan_tipo === 'free') {
        q = q.eq('plan_free', true);
        if (filters.registro_desde) q = q.gte('created_date', filters.registro_desde);
        if (filters.registro_hasta) q = q.lte('created_date', `${filters.registro_hasta}T23:59:59`);
      }
      if (filters.plan_tipo === 'cancelled') {
        q = q.eq('cancelled', true);
        if (filters.cancelado_desde) {
          const hasta = new Date();
          hasta.setDate(hasta.getDate() - parseInt(filters.cancelado_desde));
          q = q.lte('subscription_end', hasta.toISOString());
        }
        if (filters.cancelado_hasta) {
          const desde = new Date();
          desde.setDate(desde.getDate() - parseInt(filters.cancelado_hasta));
          q = q.gte('subscription_end', desde.toISOString());
        }
      }
      if (filters.plan_ids.length > 0)        q = q.in('plan_id', filters.plan_ids);
      if (filters.plan_tipo === 'paid') {
        if (filters.fecha_desde)             q = q.gte('subscription_end', filters.fecha_desde);
        if (filters.fecha_hasta)             q = q.lte('subscription_end', `${filters.fecha_hasta}T23:59:59`);
      }
      if (filters.eventos_min)               q = q.gte('eventos_valor', parseInt(filters.eventos_min));
      if (filters.eventos_max)               q = q.lte('eventos_valor', parseInt(filters.eventos_max));
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

  const handleSend = async (campañaNombre: string, scheduledAt?: string, autoReplyMsg?: string) => {
    if (!supabase) return;
    if (!isSequence && !selectedTemplateId) return;
    setSending(true);
    try {
      // ── SEQUENCE MODE ──
      if (isSequence && sequenceSteps.length > 0) {
        // 1. Create drip campaign
        const { data: drip, error: dripErr } = await supabase
          .from('comm_drip_campaigns')
          .insert({
            nombre: campañaNombre,
            segmento_filtros: filters,
            estado: 'activa',
          })
          .select()
          .single();
        if (dripErr) throw dripErr;

        // 2. Create drip steps
        const stepsToInsert = sequenceSteps.map((s, idx) => ({
          drip_campaign_id: drip.id,
          step_order: idx + 1,
          template_id: s.template_id,
          delay_days: s.delay_days,
          delay_hours: 0,
          send_at_hour: parseInt(s.send_time?.split(':')[0] ?? '9') || 9,
          estado: 'pendiente',
        }));
        const { error: stepsErr } = await supabase.from('comm_drip_steps').insert(stepsToInsert);
        if (stepsErr) throw stepsErr;

        // 3. Create parent broadcast
        const { data: broadcast, error: bErr } = await supabase
          .from('comm_broadcasts')
          .insert({
            nombre: campañaNombre,
            template_id: sequenceSteps[0].template_id,
            segmento_filtros: filters,
            total_destinatarios: contactCount,
            enviados: 0, entregados: 0, leidos: 0, clickeados: 0,
            estado: 'programado',
            is_sequence: true,
            drip_campaign_id: drip.id,
            auto_reply_message: autoReplyMsg || null,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (bErr) throw bErr;

        // 4. Trigger first step immediately if send_date is today or past
        const firstStep = sequenceSteps[0];
        const firstSendTime = new Date(firstStep.send_date + 'T' + firstStep.send_time + ':00');
        if (firstSendTime <= new Date()) {
          // Send first step now
          try {
            const { data: stepBroadcast } = await supabase
              .from('comm_broadcasts')
              .insert({
                nombre: `${campañaNombre} — Paso 1`,
                template_id: firstStep.template_id,
                segmento_filtros: filters,
                total_destinatarios: contactCount,
                enviados: 0, entregados: 0, leidos: 0, clickeados: 0,
                estado: 'borrador',
                auto_reply_message: autoReplyMsg || null,
                created_at: new Date().toISOString(),
              })
              .select()
              .single();

            if (stepBroadcast) {
              await fetch('/api/communication/send-broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ broadcastId: stepBroadcast.id }),
              });

              // Mark step as sent
              await supabase
                .from('comm_drip_steps')
                .update({ estado: 'enviado', broadcast_id: stepBroadcast.id })
                .eq('drip_campaign_id', drip.id)
                .eq('step_order', 1);
            }
          } catch (e) {
            console.error('Error sending first step:', e);
          }
        }

        setBroadcasts(prev => [{ ...broadcast, template_nombre: templates.find(t => t.id === sequenceSteps[0].template_id)?.nombre ?? '—' }, ...prev]);
        setView('list');
        setIsSequence(false);
        setSequenceSteps([{ template_id: null, delay_days: 0, delay_hours: 0, send_at_hour: 9, send_date: '', send_time: '09:00' }]);
        setSelectedTemplateId(null);
        setFilters({ pais: 'Todos', plan_tipo: 'todos', plan_ids: [], fecha_desde: '', fecha_hasta: '', cancelado_desde: '', cancelado_hasta: '', eventos_min: '', eventos_max: '', nivel: '', grado: '', colegio: '' });
        toast.success(`Secuencia activada: ${sequenceSteps.length} mensajes programados`);
        return;
      }

      // ── SINGLE MESSAGE MODE ──
      const isScheduled = !!scheduledAt;

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
          estado: isScheduled ? 'programado' : 'borrador',
          scheduled_at: isScheduled ? scheduledAt : null,
          auto_reply_message: autoReplyMsg || null,
          is_sequence: false,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      // If scheduled, just save — don't send yet
      if (isScheduled) {
        setBroadcasts(prev => [{ ...data, template_nombre: selectedTemplate?.nombre ?? '—' }, ...prev]);
        setView('list');
        setSelectedTemplateId(null);
        setFilters({ pais: 'Todos', plan_tipo: 'todos', plan_ids: [], fecha_desde: '', fecha_hasta: '', cancelado_desde: '', cancelado_hasta: '', eventos_min: '', eventos_max: '', nivel: '', grado: '', colegio: '' });
        const dt = new Date(scheduledAt);
        toast.success(`Campaña programada para ${dt.toLocaleDateString('es')} a las ${dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`);
        return;
      }

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
      setFilters({ pais: 'Todos', plan_tipo: 'todos', plan_ids: [], fecha_desde: '', fecha_hasta: '', cancelado_desde: '', cancelado_hasta: '', eventos_min: '', eventos_max: '', nivel: '', grado: '', colegio: '' });
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
                    {b.scheduled_at && b.estado === 'programado' ? (
                      <span className="text-purple-600" title={`Programado: ${new Date(b.scheduled_at).toLocaleString('es')}`}>
                        🕐 {new Date(b.scheduled_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}{' '}
                        {new Date(b.scheduled_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : (
                      new Date(b.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })
                    )}
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
          isSequence={isSequence}
          setIsSequence={setIsSequence}
          sequenceSteps={sequenceSteps}
          setSequenceSteps={setSequenceSteps}
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
          existingNames={broadcasts.map(b => b.nombre)}
          isSequence={isSequence}
          sequenceSteps={sequenceSteps}
          templates={approvedTemplates}
        />
      )}
    </div>
  );
}
