'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { XMarkIcon, TrashIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { ProductInitiative, ExperimentData } from '@/lib/types'
import PromoteForm from './PromoteForm'
import FinalizeModal from './FinalizeModal'
import BulkCreateProjectModal from './BulkCreateProjectModal'
import { toast } from 'sonner'

const TYPE_OPTIONS = [
  { value: 'experiment', label: 'Experimento 🧪' },
  { value: 'feature', label: 'Funcionalidad 🚀' },
  { value: 'tech_debt', label: 'Deuda Técnica 🛠️' },
  { value: 'bug', label: 'Bug 🐛' },
]

const RESULT_OPTIONS = [
  { value: '', label: 'Pendiente' },
  { value: 'won', label: 'Ganó ✅' },
  { value: 'lost', label: 'Perdió ❌' },
  { value: 'inconclusive', label: 'Inconcluso ⚠️' },
]

const NEXT_STEPS_OPTIONS = [
  { value: '', label: 'Sin definir' },
  { value: 'discard', label: 'Descartar' },
  { value: 'scale', label: 'Escalar a todos' },
  { value: 'iterate', label: 'Iterar' },
]

interface SidePeekProps {
  initiative: ProductInitiative
  onClose: () => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onRefresh: () => Promise<void>
  autoPromote?: boolean
  autoFinalize?: boolean
}

export default function SidePeek({ initiative, onClose, onUpdate, onDelete, onRefresh, autoPromote, autoFinalize }: SidePeekProps) {
  const [title, setTitle] = useState(initiative.title)
  const [problemStatement, setProblemStatement] = useState(initiative.problem_statement || '')
  const [itemType, setItemType] = useState(initiative.item_type)
  const [showPromote, setShowPromote] = useState(!!autoPromote)
  const [showFinalize, setShowFinalize] = useState(!!autoFinalize)
  const [showBulkCreate, setShowBulkCreate] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showReturnConfirm, setShowReturnConfirm] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [experimentData, setExperimentData] = useState<ExperimentData>(initiative.experiment_data || {})
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Sync state when initiative changes
  useEffect(() => {
    setTitle(initiative.title)
    setProblemStatement(initiative.problem_statement || '')
    setItemType(initiative.item_type)
    setExperimentData(initiative.experiment_data || {})
    setShowPromote(!!autoPromote)
    setShowFinalize(!!autoFinalize)
    setShowDeleteConfirm(false)
    setShowReturnConfirm(false)
  }, [initiative.id, initiative.title, initiative.problem_statement, initiative.item_type, initiative.experiment_data, autoPromote, autoFinalize])

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

  const handleTypeChange = (val: string) => {
    setItemType(val as ProductInitiative['item_type'])
    onUpdate(initiative.id, { item_type: val as ProductInitiative['item_type'] })
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

  // Compute local RICE score
  const riceScore = initiative.rice_effort > 0
    ? (initiative.rice_reach * initiative.rice_impact * initiative.rice_confidence) / initiative.rice_effort
    : 0

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
              {initiative.phase.charAt(0).toUpperCase() + initiative.phase.slice(1)}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500 capitalize">{initiative.status}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Título</label>
            <input
              type="text"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              className="w-full mt-1 text-lg font-semibold border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none pb-1"
              style={{ color: '#383838' }}
            />
          </div>

          {/* Problem Statement */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Problema / Descripción</label>
            <textarea
              value={problemStatement}
              onChange={e => handleProblemChange(e.target.value)}
              rows={3}
              className="w-full mt-1 text-sm border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
              placeholder="¿Qué problema resuelve? ¿Cómo se hará?"
            />
          </div>

          {/* Type + Tags row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Tipo</label>
              <select
                value={itemType}
                onChange={e => handleTypeChange(e.target.value)}
                className="w-full mt-1 text-sm border rounded-md px-2 py-1.5"
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {initiative.period_value && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Periodo</label>
                <p className="mt-1 text-sm text-gray-700 py-1.5">{initiative.period_value} ({initiative.period_type})</p>
              </div>
            )}
          </div>

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
                  style={{ backgroundColor: '#3c527a' }}
                >
                  Promover a Roadmap
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

          {/* ===== DISCOVERY: Experiment fields ===== */}
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
                  Significancia estadística (≥300 usuarios, comparativo válido)
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

              {/* Escalar a Delivery button */}
              {experimentData.result === 'won' && experimentData.next_steps === 'scale' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-800 mb-2">
                    Experimento ganador listo para escalar
                  </p>
                  <p className="text-xs text-green-600 mb-3">
                    Esto creará una nueva Funcionalidad en Delivery vinculada a este experimento.
                  </p>
                </div>
              )}

              {/* Proyecto asociado (Discovery) */}
              <div className="border-t pt-3 mt-3">
                <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Proyecto asociado</h4>
                {initiative.project_id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Proyecto vinculado:</span>
                    <a
                      href={`/projects/${initiative.project_id}`}
                      className="text-sm font-medium hover:underline"
                      style={{ color: '#3c527a' }}
                    >
                      {initiative.project_name || `Proyecto #${initiative.project_id}`}
                    </a>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowBulkCreate(true)}
                    className="w-full py-2.5 rounded-md text-sm font-medium border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition"
                  >
                    Generar / Vincular Proyecto
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ===== DELIVERY: Project fields ===== */}
          {initiative.phase === 'delivery' && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700">Delivery</h3>

              {/* Show parent experiment link if exists */}
              {initiative.parent_id && (
                <div className="text-xs text-gray-500 bg-purple-50 rounded p-2">
                  Originado desde experimento #{initiative.parent_id}
                </div>
              )}

              {initiative.project_id ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Proyecto vinculado:</span>
                  <a
                    href={`/projects/${initiative.project_id}`}
                    className="text-sm font-medium hover:underline"
                    style={{ color: '#3c527a' }}
                  >
                    {initiative.project_name || `Proyecto #${initiative.project_id}`}
                  </a>
                </div>
              ) : (
                <button
                  onClick={() => setShowBulkCreate(true)}
                  className="w-full py-2.5 rounded-md text-sm font-medium border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition"
                >
                  Generar / Vincular Proyecto
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
              📅 Finalizar y Anunciar en Calendario
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

      {showBulkCreate && (
        <BulkCreateProjectModal
          initiative={initiative}
          onClose={() => setShowBulkCreate(false)}
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
