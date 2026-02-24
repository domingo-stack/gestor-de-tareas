'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ProductInitiative } from '@/lib/types'

interface InitiativeCardProps {
  initiative: ProductInitiative
  onClick: () => void
  mode: 'discovery' | 'roadmap'
  onFinalize?: () => void
  members?: { user_id: string; email: string; first_name?: string }[]
}

export default function InitiativeCard({ initiative, onClick, mode, onFinalize, members }: InitiativeCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: initiative.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const ownerMember = members?.find(m => m.user_id === initiative.owner_id)
  const ownerLabel = ownerMember ? (ownerMember.first_name || ownerMember.email) : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`group bg-white border rounded-lg p-3 flex flex-col gap-1.5 transition-shadow hover:shadow-md ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Header: drag handle + title + responsable */}
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
          </div>
        </div>
      </div>

      {/* Responsable (small, top-right feel) */}
      {ownerLabel && (
        <div className="flex justify-end" onClick={onClick}>
          <span className="text-[10px] text-gray-400 truncate max-w-[160px]">{ownerLabel}</span>
        </div>
      )}

      {/* Content area (clickable) */}
      <div onClick={onClick} className="cursor-pointer">
        {/* Period badge */}
        {initiative.period_value && (
          <div className="text-[10px] text-gray-400">
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
            Finalizar y Anunciar
          </button>
        )}
      </div>
    </div>
  )
}
