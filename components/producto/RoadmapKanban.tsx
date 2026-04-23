'use client'

import { ArchiveBoxIcon, ArrowUturnLeftIcon, CheckIcon } from '@heroicons/react/24/outline'
import { ProductInitiative } from '@/lib/types'

interface Props {
  initiatives: ProductInitiative[]
  onSelect: (i: ProductInitiative) => void
  onReopen: (id: number) => void
}

export default function RoadmapKanban({ initiatives, onSelect, onReopen }: Props) {
  const sorted = [...initiatives].sort((a, b) =>
    new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
  )

  if (sorted.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
        <ArchiveBoxIcon className="w-14 h-14 text-gray-200 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">No hay tareas finalizadas</p>
        <p className="text-gray-300 text-sm mt-1">Las tareas completadas aparecerán aquí</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-400 mb-4">
        {sorted.length} {sorted.length === 1 ? 'tarea finalizada' : 'tareas finalizadas'}
      </p>
      <div className="space-y-2">
        {sorted.map(item => (
          <div key={item.id}
            className="group flex items-center gap-4 px-5 py-4 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200">

            {/* Check icon */}
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <CheckIcon className="w-4 h-4 text-green-600 stroke-[3]" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(item)}>
              <p className="text-[15px] font-medium text-gray-500 line-through decoration-gray-300">{item.title}</p>
              {item.problem_statement && (
                <p className="text-[13px] text-gray-300 mt-0.5 truncate">{item.problem_statement}</p>
              )}
            </div>

            {/* Date */}
            <span className="text-xs text-gray-300 flex-shrink-0 tabular-nums">
              {new Date(item.updated_at || item.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>

            {/* Reopen */}
            <button onClick={() => onReopen(item.id)}
              className="p-2 rounded-xl text-gray-200 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all duration-200"
              title="Reabrir tarea">
              <ArrowUturnLeftIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
