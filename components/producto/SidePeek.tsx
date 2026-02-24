'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { XMarkIcon, TrashIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { ProductInitiative, ExperimentData } from '@/lib/types'
import PromoteForm from './PromoteForm'
import FinalizeModal from './FinalizeModal'
import MediaTextarea from '@/components/MediaTextarea'
import { toast } from 'sonner'

const RESULT_OPTIONS = [
  { value: '', label: 'Pendiente' },
  { value: 'won', label: 'Ganó' },
  { value: 'lost', label: 'Perdió' },
  { value: 'inconclusive', label: 'Inconcluso' },
]

const NEXT_STEPS_OPTIONS = [
  { value: '', label: 'Sin definir' },
  { value: 'discard', label: 'Descartar' },
  { value: 'scale', label: 'Escalar a todos' },
  { value: 'iterate', label: 'Iterar' },
]

function parsePeriod(periodValue: string | null): { start: string; end: string } {
  if (!periodValue) return { start: '', end: '' }
  const parts = periodValue.split('→').map(s => s.trim())
  return { start: parts[0] || '', end: parts[1] || '' }
}

function buildPeriod(start: string, end: string): string {
  return `${start} → ${end || '...'}`
}

interface SidePeekProps {
  initiative: ProductInitiative
  onClose: () => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onRefresh: () => Promise<void>
  autoPromote?: boolean
  autoFinalize?: boolean
  members?: { user_id: string; email: string; first_name?: string }[]
}

export default function SidePeek({ initiative, onClose, onUpdate, onDelete, onRefresh, autoPromote, autoFinalize, members = [] }: SidePeekProps) {
  const [title, setTitle] = useState(initiative.title)
  const [problemStatement, setProblemStatement] = useState(initiative.problem_statement || '')
  const [showPromote, setShowPromote] = useState(!!autoPromote)
  const [showFinalize, setShowFinalize] = useState(!!autoFinalize)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showReturnConfirm, setShowReturnConfirm] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [experimentData, setExperimentData] = useState<ExperimentData>(initiative.experiment_data || {})
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Sync state when initiative changes
  useEffect(() => {
    setTitle(initiative.title)
    setProblemStatement(initiative.problem_statement || '')
    setExperimentData(initiative.experiment_data || {})
    setShowPromote(!!autoPromote)
    setShowFinalize(!!autoFinalize)
    setShowDeleteConfirm(false)
    setShowReturnConfirm(false)
  }, [initiative.id, initiative.title, initiative.problem_statement, initiative.experiment_data, autoPromote, autoFinalize])

  const debouncedUpdate = useCallback((updates: Partial<ProductInitiative>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onUpdate(initiative.id, updates)
    }, 1500)
  }, [initiative.id, onUpdate])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const handleTitleChange = (val: string) => {
    setTitle(val)
    debouncedUpdate({ title: val })
  }

  const handleProblemChange = (val: string) => {
    setProblemStatement(val)
    debouncedUpdate({ problem_statement: val || null })
  }

  const handleExperimentDataChange = (field: keyof ExperimentData, val: string) => {
    const updated = { ...experimentData, [field]: val }
    setExperimentData(updated)
    debouncedUpdate({ experiment_data: updated as any })
  }

  const handleDeleteConfirm = async () => {
    await onDelete(initiative.id)
    toast.success('Iniciativa eliminada')
  }

  const handleReturnToBacklog = async () => {
    await onUpdate(initiative.id, {
      phase: 'backlog',
      status: 'pending',
      period_type: null,
      period_value: null,
    })
    toast.success('Devuelta al Backlog')
    await onRefresh()
    setShowReturnConfirm(false)
  }

  const handleFinalizeFromSidePeek = async () => {
    await onUpdate(initiative.id, { status: 'completed' })
    setShowFinalize(true)
  }

  const handleDateChange = (type: 'start' | 'end', val: string) => {
    const { start, end } = parsePeriod(initiative.period_value)
    const newStart = type === 'start' ? val : start
    const newEnd = type === 'end' ? val : end
    onUpdate(initiative.id, {
      period_value: buildPeriod(newStart, newEnd),
      period_type: 'week',
    })
  }

  // Compute local RICE score
  const riceScore = initiative.rice_effort > 0
    ? (initiative.rice_reach * initiative.rice_impact * initiative.rice_confidence) / initiative.rice_effort
    : 0

  const phaseLabel = initiative.phase === 'discovery' ? 'Experimentos'
    : initiative.phase === 'delivery' ? 'Roadmap'
    : initiative.phase.charAt(0).toUpperCase() + initiative.phase.slice(1)

  // Dynamic promote button text
  const isExperimentType = initiative.item_type === 'experiment'
  const promoteButtonText = isExperimentType ? 'Promover a Experimentos' : 'Promover a Roadmap'

  const { start: dateStart, end: dateEnd } = parsePeriod(initiative.period_value)

  const ownerMember = members.find(m => m.user_id === initiative.owner_id)
  const ownerLabel = ownerMember ? (ownerMember.first_name || ownerMember.email) : null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              initiative.phase === 'backlog' ? 'bg-gray-100 text-gray-600' :
              initiative.phase === 'discovery' ? 'bg-purple-100 text-purple-700' :
              initiative.phase === 'delivery' ? 'bg-blue-100 text-blue-700' :
              'bg-green-100 text-green-700'
            }`}>
              {phaseLabel}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500 capitalize">{initiative.status}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Responsable (small, below header) */}
        {(initiative.phase === 'delivery' || initiative.phase === 'discovery') && (
          <div className="px-4 pt-2 flex items-center justify-end gap-2">
            <select
              value={initiative.owner_id || ''}
              onChange={e => onUpdate(initiative.id, { owner_id: e.target.value || null })}
              className="text-xs border rounded px-2 py-1 text-gray-500 bg-transparent max-w-[200px]"
            >
              <option value="">Sin responsable</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.first_name || m.email}</option>
              ))}
            </select>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Title */}
          <div>
            <input
              type="text"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              className="w-full text-lg font-semibold border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none pb-1"
              style={{ color: '#383838' }}
            />
          </div>

          {/* Description with media support */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Descripción</label>
            <MediaTextarea
              value={problemStatement}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleProblemChange(e.target.value)}
              onTextInsert={(text: string) => handleProblemChange(text)}
              placeholder="Agrega los detalles y la descripción de este requerimiento acá..."
              rows={6}
              className="mt-1"
            />
          </div>

          {/* Dates for Roadmap (only fecha fin) */}
          {initiative.phase === 'delivery' && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Fecha límite</label>
              <input
                type="date"
                value={dateEnd}
                onChange={e => handleDateChange('end', e.target.value)}
                className="w-full mt-1 border rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          )}

          {/* Dates for Experimentos (inicio y fin) */}
          {initiative.phase === 'discovery' && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Periodo</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <label className="text-[10px] text-gray-400">Inicio</label>
                  <input
                    type="date"
                    value={dateStart}
                    onChange={e => handleDateChange('start', e.target.value)}
                    className="w-full border rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400">Fin</label>
                  <input
                    type="date"
                    value={dateEnd}
                    onChange={e => handleDateChange('end', e.target.value)}
                    className="w-full border rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* RICE (backlog) */}
          {initiative.phase === 'backlog' && (
            <div className="border rounded-lg p-3 bg-gray-50">
              <label className="text-xs font-medium text-gray-500 uppercase">Priorización RICE</label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {([
                  { field: 'rice_reach' as const, label: 'Reach' },
                  { field: 'rice_impact' as const, label: 'Impact' },
                  { field: 'rice_confidence' as const, label: 'Confidence' },
                  { field: 'rice_effort' as const, label: 'Effort' },
                ]).map(({ field, label }) => (
                  <div key={field}>
                    <label className="text-[10px] text-gray-400">{label}</label>
                    <select
                      value={initiative[field] || 1}
                      onChange={e => onUpdate(initiative.id, { [field]: parseInt(e.target.value) })}
                      className="w-full border rounded px-2 py-1 text-sm text-center"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-center">
                <span className="text-xs text-gray-400">Score: </span>
                <span className="text-xl font-bold" style={{ color: '#ff8080' }}>
                  {riceScore.toFixed(1)}
                </span>
              </div>
            </div>
          )}

          {/* Promote button (backlog only) */}
          {initiative.phase === 'backlog' && (
            <div>
              {showPromote ? (
                <PromoteForm
                  initiative={initiative}
                  onUpdate={onUpdate}
                  onCancel={() => setShowPromote(false)}
                  onRefresh={onRefresh}
                />
              ) : (
                <button
                  onClick={() => setShowPromote(true)}
                  className="w-full py-2.5 rounded-md text-white font-medium text-sm transition hover:opacity-90"
                  style={{ backgroundColor: isExperimentType ? '#7c3aed' : '#3c527a' }}
                >
                  {promoteButtonText}
                </button>
              )}
            </div>
          )}

          {/* Return to backlog (discovery/delivery) */}
          {(initiative.phase === 'discovery' || initiative.phase === 'delivery') && (
            <div>
              {showReturnConfirm ? (
                <div className="p-3 border rounded-lg bg-amber-50 space-y-2">
                  <p className="text-sm text-amber-800">¿Devolver al Backlog?</p>
                  <textarea
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    placeholder="Motivo (opcional)"
                    rows={2}
                    className="w-full text-sm border rounded-md px-2 py-1.5 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleReturnToBacklog}
                      className="flex-1 py-1.5 rounded-md text-sm font-medium bg-amber-500 text-white hover:bg-amber-600"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setShowReturnConfirm(false)}
                      className="px-3 py-1.5 rounded-md text-sm border hover:bg-gray-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowReturnConfirm(true)}
                  className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 transition"
                >
                  <ArrowUturnLeftIcon className="h-4 w-4" />
                  Devolver al Backlog
                </button>
              )}
            </div>
          )}

          {/* ===== EXPERIMENTOS (discovery): Experiment fields ===== */}
          {initiative.phase === 'discovery' && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700">Datos del Experimento</h3>

              <div>
                <label className="text-xs text-gray-500">Hipótesis <span className="text-gray-300">("Si hago A, pasará B")</span></label>
                <textarea
                  value={experimentData.hypothesis || ''}
                  onChange={e => handleExperimentDataChange('hypothesis', e.target.value)}
                  rows={2}
                  className="w-full mt-1 text-sm border rounded-md px-3 py-2 resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Si reducimos X, entonces Y aumentará..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Etapa del Funnel</label>
                  <select
                    value={experimentData.funnel_stage || ''}
                    onChange={e => handleExperimentDataChange('funnel_stage', e.target.value)}
                    className="w-full mt-1 text-sm border rounded-md px-2 py-1.5"
                  >
                    <option value="">Seleccionar</option>
                    <option value="acquisition">Acquisition</option>
                    <option value="activation">Activation</option>
                    <option value="retention">Retention</option>
                    <option value="revenue">Revenue</option>
                    <option value="referral">Referral</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Link a Dashboard</label>
                  <input
                    type="url"
                    value={experimentData.dashboard_link || ''}
                    onChange={e => handleExperimentDataChange('dashboard_link', e.target.value)}
                    className="w-full mt-1 text-sm border rounded-md px-2 py-1.5"
                    placeholder="Mixpanel, GA4..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Métrica Base (actual)</label>
                  <input
                    type="text"
                    value={experimentData.metric_base || ''}
                    onChange={e => handleExperimentDataChange('metric_base', e.target.value)}
                    className="w-full mt-1 text-sm border rounded-md px-2 py-1.5"
                    placeholder="ej: CR paywall→pago 2.5%"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Métrica Objetivo</label>
                  <input
                    type="text"
                    value={experimentData.metric_target || ''}
                    onChange={e => handleExperimentDataChange('metric_target', e.target.value)}
                    className="w-full mt-1 text-sm border rounded-md px-2 py-1.5"
                    placeholder="ej: 5%"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={experimentData.statistical_significance === 'true'}
                    onChange={e => handleExperimentDataChange('statistical_significance', e.target.checked ? 'true' : 'false')}
                    className="rounded accent-[#3c527a]"
                  />
                  Significancia estadística
                </label>
              </div>

              {/* Results section */}
              <div className="border-t pt-3 mt-3">
                <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Resultados</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Resultado</label>
                    <select
                      value={experimentData.result || ''}
                      onChange={e => handleExperimentDataChange('result', e.target.value)}
                      className="w-full mt-1 text-sm border rounded-md px-2 py-1.5"
                    >
                      {RESULT_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Valor Final (métrica post-exp.)</label>
                    <input
                      type="text"
                      value={experimentData.metric_result || ''}
                      onChange={e => handleExperimentDataChange('metric_result', e.target.value)}
                      className="w-full mt-1 text-sm border rounded-md px-2 py-1.5"
                      placeholder="ej: 4.2%"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-500">Próximos Pasos</label>
                  <select
                    value={experimentData.next_steps || ''}
                    onChange={e => handleExperimentDataChange('next_steps', e.target.value)}
                    className="w-full mt-1 text-sm border rounded-md px-2 py-1.5"
                  >
                    {NEXT_STEPS_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ===== ROADMAP (delivery): Finalize ===== */}
          {initiative.phase === 'delivery' && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700">Roadmap</h3>

              {/* Finalize button for delivery items */}
              {initiative.status !== 'completed' && initiative.phase !== 'finalized' && (
                <button
                  onClick={handleFinalizeFromSidePeek}
                  className="w-full py-2.5 rounded-md text-sm font-medium border-2 border-dashed border-green-300 text-green-600 hover:border-green-400 hover:text-green-700 transition"
                >
                  Marcar como completado y Finalizar
                </button>
              )}
            </div>
          )}

          {/* ===== FINALIZE BUTTON ===== */}
          {initiative.status === 'completed' && initiative.phase !== 'finalized' && (
            <button
              onClick={() => setShowFinalize(true)}
              className="w-full py-3 rounded-md text-white font-semibold text-sm transition hover:opacity-90"
              style={{ backgroundColor: '#22c55e' }}
            >
              Finalizar y Anunciar en Calendario
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 shrink-0">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">¿Eliminar permanentemente?</span>
              <button
                onClick={handleDeleteConfirm}
                className="text-sm px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Sí, eliminar
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-sm px-3 py-1.5 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition"
            >
              <TrashIcon className="h-4 w-4" />
              Eliminar iniciativa
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {showFinalize && (
        <FinalizeModal
          initiative={initiative}
          onClose={() => setShowFinalize(false)}
          onUpdate={onUpdate}
          onRefresh={onRefresh}
        />
      )}

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.2s ease-out;
        }
      `}</style>
    </>
  )
}
