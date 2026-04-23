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
  onFinalize?: (initiative: ProductInitiative) => void
  members?: { user_id: string; email: string; first_name?: string }[]
}

export default function SidePeek({ initiative, onClose, onUpdate, onDelete, onRefresh, autoPromote, autoFinalize, onFinalize, members = [] }: SidePeekProps) {
  const [title, setTitle] = useState(initiative.title)
  const [problemStatement, setProblemStatement] = useState(initiative.problem_statement || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [experimentData, setExperimentData] = useState<ExperimentData>(initiative.experiment_data || {})
  const [showFinalize, setShowFinalize] = useState(!!autoFinalize)
  const [showReturnConfirm, setShowReturnConfirm] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setTitle(initiative.title)
    setProblemStatement(initiative.problem_statement || '')
    setExperimentData(initiative.experiment_data || {})
    setShowDeleteConfirm(false)
    setShowReturnConfirm(false)
  }, [initiative.id, initiative.title, initiative.problem_statement, initiative.experiment_data])

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
    toast.success('Tarea eliminada')
  }

  const handleReturnToBacklog = async () => {
    await onUpdate(initiative.id, { phase: 'backlog', status: 'pending' })
    toast.success('Devuelta a Tareas')
    await onRefresh()
    setShowReturnConfirm(false)
  }

  const handleDateChange = (type: 'start' | 'end', val: string) => {
    const { start, end } = parsePeriod(initiative.period_value)
    const newStart = type === 'start' ? val : start
    const newEnd = type === 'end' ? val : end
    onUpdate(initiative.id, { period_value: buildPeriod(newStart, newEnd), period_type: 'week' })
  }

  const { start: dateStart, end: dateEnd } = parsePeriod(initiative.period_value)
  const isBacklog = initiative.phase === 'backlog'
  const isFinalized = initiative.phase === 'finalized' || (initiative.phase === 'delivery' && initiative.status === 'completed')
  const isDiscovery = initiative.phase === 'discovery'

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isFinalized ? 'bg-green-100 text-green-700' :
            isDiscovery ? 'bg-purple-100 text-purple-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {isFinalized ? 'Finalizada' : isDiscovery ? 'Experimento' : 'Tarea'}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Responsable (discovery only) */}
        {isDiscovery && (
          <div className="px-4 pt-2 flex items-center justify-end gap-2">
            <select value={initiative.owner_id || ''}
              onChange={e => onUpdate(initiative.id, { owner_id: e.target.value || null })}
              className="text-xs border rounded px-2 py-1 text-gray-500 bg-transparent max-w-[200px]">
              <option value="">Sin responsable</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.first_name || m.email}</option>
              ))}
            </select>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Title */}
          {isFinalized ? (
            <h2 className="text-lg font-semibold text-gray-600 line-through decoration-gray-300">{title}</h2>
          ) : (
            <input type="text" value={title} onChange={e => handleTitleChange(e.target.value)}
              className="w-full text-lg font-semibold border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none pb-1 text-gray-800" />
          )}

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Descripción</label>
            {isFinalized ? (
              <p className="mt-1 text-sm text-gray-500 whitespace-pre-line">{problemStatement || 'Sin descripción'}</p>
            ) : (
              <MediaTextarea
                value={problemStatement}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleProblemChange(e.target.value)}
                onTextInsert={(text: string) => handleProblemChange(text)}
                placeholder="Describe brevemente el problema o contexto..."
                rows={5}
                className="mt-1"
              />
            )}
          </div>

          {/* Finalized: show completion date + reopen */}
          {isFinalized && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>Completada:</span>
                <span>{new Date(initiative.updated_at || initiative.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <button onClick={() => handleReturnToBacklog()}
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
                <ArrowUturnLeftIcon className="w-4 h-4" />
                Reabrir tarea
              </button>
            </div>
          )}

          {/* ===== DISCOVERY (Experimentos): keep as-is ===== */}
          {isDiscovery && (
            <>
              {/* Periodo */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Periodo</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <label className="text-[10px] text-gray-400">Inicio</label>
                    <input type="date" value={dateStart} onChange={e => handleDateChange('start', e.target.value)}
                      className="w-full border rounded-md px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Fin</label>
                    <input type="date" value={dateEnd} onChange={e => handleDateChange('end', e.target.value)}
                      className="w-full border rounded-md px-2 py-1.5 text-sm" />
                  </div>
                </div>
              </div>

              {/* Return to backlog */}
              {showReturnConfirm ? (
                <div className="p-3 border rounded-lg bg-amber-50 space-y-2">
                  <p className="text-sm text-amber-800">¿Devolver a Tareas?</p>
                  <div className="flex gap-2">
                    <button onClick={handleReturnToBacklog}
                      className="flex-1 py-1.5 rounded-md text-sm font-medium bg-amber-500 text-white hover:bg-amber-600">Confirmar</button>
                    <button onClick={() => setShowReturnConfirm(false)}
                      className="px-3 py-1.5 rounded-md text-sm border hover:bg-gray-100">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowReturnConfirm(true)}
                  className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700">
                  <ArrowUturnLeftIcon className="h-4 w-4" /> Devolver a Tareas
                </button>
              )}

              {/* Experiment data */}
              <div className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700">Datos del Experimento</h3>
                <div>
                  <label className="text-xs text-gray-500">Hipótesis</label>
                  <textarea value={experimentData.hypothesis || ''} onChange={e => handleExperimentDataChange('hypothesis', e.target.value)}
                    rows={2} className="w-full mt-1 text-sm border rounded-md px-3 py-2 resize-none" placeholder="Si hago A, pasará B..." />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Etapa del Funnel</label>
                    <select value={experimentData.funnel_stage || ''} onChange={e => handleExperimentDataChange('funnel_stage', e.target.value)}
                      className="w-full mt-1 text-sm border rounded-md px-2 py-1.5">
                      <option value="">Seleccionar</option>
                      <option value="acquisition">Acquisition</option>
                      <option value="activation">Activation</option>
                      <option value="retention">Retention</option>
                      <option value="revenue">Revenue</option>
                      <option value="referral">Referral</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Link Dashboard</label>
                    <input type="url" value={experimentData.dashboard_link || ''} onChange={e => handleExperimentDataChange('dashboard_link', e.target.value)}
                      className="w-full mt-1 text-sm border rounded-md px-2 py-1.5" placeholder="Mixpanel, GA4..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Métrica Base</label>
                    <input type="text" value={experimentData.metric_base || ''} onChange={e => handleExperimentDataChange('metric_base', e.target.value)}
                      className="w-full mt-1 text-sm border rounded-md px-2 py-1.5" placeholder="ej: CR 2.5%" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Métrica Objetivo</label>
                    <input type="text" value={experimentData.metric_target || ''} onChange={e => handleExperimentDataChange('metric_target', e.target.value)}
                      className="w-full mt-1 text-sm border rounded-md px-2 py-1.5" placeholder="ej: 5%" />
                  </div>
                </div>
                <div className="border-t pt-3 mt-3">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Resultados</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">Resultado</label>
                      <select value={experimentData.result || ''} onChange={e => handleExperimentDataChange('result', e.target.value)}
                        className="w-full mt-1 text-sm border rounded-md px-2 py-1.5">
                        {RESULT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Valor Final</label>
                      <input type="text" value={experimentData.metric_result || ''} onChange={e => handleExperimentDataChange('metric_result', e.target.value)}
                        className="w-full mt-1 text-sm border rounded-md px-2 py-1.5" placeholder="ej: 4.2%" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="text-xs text-gray-500">Próximos Pasos</label>
                    <select value={experimentData.next_steps || ''} onChange={e => handleExperimentDataChange('next_steps', e.target.value)}
                      className="w-full mt-1 text-sm border rounded-md px-2 py-1.5">
                      {NEXT_STEPS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer — delete */}
        <div className="border-t p-4 shrink-0">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">¿Eliminar permanentemente?</span>
              <button onClick={handleDeleteConfirm}
                className="text-sm px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700">Sí</button>
              <button onClick={() => setShowDeleteConfirm(false)}
                className="text-sm px-3 py-1.5 bg-gray-200 rounded-md hover:bg-gray-300">No</button>
            </div>
          ) : (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700">
              <TrashIcon className="h-4 w-4" /> Eliminar
            </button>
          )}
        </div>
      </div>

      {showFinalize && (
        <FinalizeModal initiative={initiative} onClose={() => setShowFinalize(false)} onUpdate={onUpdate} onRefresh={onRefresh} />
      )}

      <style jsx>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-in-right { animation: slideInRight 0.2s ease-out; }
      `}</style>
    </>
  )
}
