'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ProductInitiative } from '@/lib/types'

const TYPE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  experiment: { label: 'Experimento', color: '#7c3aed', bg: '#f5f3ff' },
  feature: { label: 'Feature', color: '#2563eb', bg: '#eff6ff' },
  tech_debt: { label: 'Tech Debt', color: '#d97706', bg: '#fffbeb' },
  bug: { label: 'Bug', color: '#dc2626', bg: '#fef2f2' },
}

const RESULT_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  won: { label: 'Ganado', color: '#16a34a', bg: '#f0fdf4' },
  lost: { label: 'Perdido', color: '#dc2626', bg: '#fef2f2' },
  inconclusive: { label: 'Inconcluso', color: '#6b7280', bg: '#f9fafb' },
}

const FUNNEL_LABELS: Record<string, string> = {
  acquisition: 'Acquisition',
  activation: 'Activation',
  retention: 'Retention',
  revenue: 'Revenue',
  referral: 'Referral',
}

const PRIORITY_LABEL = (score: number) => {
  if (score >= 8) return { label: 'Alta', color: '#dc2626', bg: '#fef2f2' }
  if (score >= 5) return { label: 'Media', color: '#d97706', bg: '#fffbeb' }
  return { label: 'Baja', color: '#6b7280', bg: '#f9fafb' }
}

interface InitiativeCardProps {
  initiative: ProductInitiative
  onClick: () => void
  mode: 'discovery' | 'delivery'
  progress?: { completed: number; total: number }
  onCreateFeature?: () => void
  onFinalize?: () => void
}

export default function InitiativeCard({ initiative, onClick, mode, progress, onCreateFeature, onFinalize }: InitiativeCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: initiative.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const badge = TYPE_BADGES[initiative.item_type] || TYPE_BADGES.feature
  const expData = initiative.experiment_data || {}

  // Compute RICE-derived priority
  const riceScore = initiative.rice_effort > 0
    ? (initiative.rice_reach * initiative.rice_impact * initiative.rice_confidence) / initiative.rice_effort
    : 0
  const priority = PRIORITY_LABEL(Math.min(riceScore / 100, 10)) // normalize roughly

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`group bg-white border rounded-lg p-3 flex flex-col gap-2 transition-shadow hover:shadow-md ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Header with drag handle */}
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-gray-300 group-hover:text-gray-500 pt-0.5 shrink-0">
          <svg viewBox="0 0 20 20" width="12" fill="currentColor">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>

        {/* Clickable content */}
        <div onClick={onClick} className="flex-1 cursor-pointer min-w-0">
          <div className="flex items-start justify-between gap-1">
            <h4 className="text-sm font-medium line-clamp-2" style={{ color: '#383838' }}>
              {initiative.title}
            </h4>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
              style={{ color: badge.color, backgroundColor: badge.bg }}
            >
              {badge.label}
            </span>
          </div>
        </div>
      </div>

      {/* Content area (clickable) */}
      <div onClick={onClick} className="cursor-pointer">
        {/* Discovery-specific content */}
        {mode === 'discovery' && (
          <>
            {initiative.project_name && (
              <p className="text-xs text-gray-500 mb-1.5">
                📁 {initiative.project_name}
              </p>
            )}

            {progress && progress.total > 0 && (
              <div className="mb-1.5">
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>Progreso</span>
                  <span>{progress.completed}/{progress.total} ({Math.round((progress.completed / progress.total) * 100)}%)</span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(progress.completed / progress.total) * 100}%`,
                      backgroundColor: '#ff8080',
                    }}
                  />
                </div>
              </div>
            )}

            {expData.hypothesis && (
              <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">
                {expData.hypothesis}
              </p>
            )}

            <div className="flex flex-wrap gap-1 mb-1.5">
              {expData.funnel_stage && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                  {FUNNEL_LABELS[expData.funnel_stage] || expData.funnel_stage}
                </span>
              )}
            </div>

            {(expData.metric_base || expData.metric_target) && (
              <div className="text-xs text-gray-400 mb-1.5">
                {expData.metric_base || '?'} → {expData.metric_target || '?'}
              </div>
            )}

            {expData.result && (
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    color: RESULT_BADGES[expData.result]?.color,
                    backgroundColor: RESULT_BADGES[expData.result]?.bg,
                  }}
                >
                  {RESULT_BADGES[expData.result]?.label}
                </span>

                {expData.result === 'won' && onCreateFeature && (
                  <button
                    onClick={e => { e.stopPropagation(); onCreateFeature() }}
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white hover:opacity-90 transition"
                    style={{ backgroundColor: '#3c527a' }}
                  >
                    Escalar a Delivery →
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Delivery-specific content */}
        {mode === 'delivery' && (
          <>
            {initiative.project_name && (
              <p className="text-xs text-gray-500 mb-1.5">
                📁 {initiative.project_name}
              </p>
            )}

            {progress && progress.total > 0 && (
              <div className="mt-1">
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>Progreso</span>
                  <span>{progress.completed}/{progress.total} ({Math.round((progress.completed / progress.total) * 100)}%)</span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(progress.completed / progress.total) * 100}%`,
                      backgroundColor: '#ff8080',
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Period badge */}
        {initiative.period_value && (
          <div className="mt-1.5 text-[10px] text-gray-400">
            {initiative.period_value}
          </div>
        )}

        {/* Completed: show finalize button */}
        {initiative.status === 'completed' && onFinalize && (
          <button
            onClick={e => { e.stopPropagation(); onFinalize() }}
            className="mt-2 w-full py-1.5 px-2 rounded-md text-[11px] font-medium text-center transition hover:opacity-90"
            style={{ backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}
          >
            ✓ Finalizar y Anunciar
          </button>
        )}
      </div>
    </div>
  )
}
