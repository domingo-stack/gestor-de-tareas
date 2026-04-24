'use client'

import { useState } from 'react'
import { ArchiveBoxIcon, ArrowUturnLeftIcon, CheckIcon, ClockIcon } from '@heroicons/react/24/outline'
import { ProductInitiative } from '@/lib/types'

const CATEGORY_STYLES: Record<string, string> = {
  producto: 'bg-blue-100 text-blue-700',
  customer_success: 'bg-emerald-100 text-emerald-700',
  marketing: 'bg-purple-100 text-purple-700',
  otro: 'bg-gray-100 text-gray-600',
}

const CATEGORY_LABELS: Record<string, string> = {
  producto: 'Producto',
  customer_success: 'CS',
  marketing: 'Marketing',
  otro: 'Otro',
}

interface Props {
  initiatives: ProductInitiative[]
  onSelect: (i: ProductInitiative) => void
  onReopen: (id: number) => void
}

function formatDuration(startDate: string, endDate: string): string {
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  const diffMs = end - start
  if (diffMs < 0) return '—'

  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24

  if (days === 0) {
    if (hours === 0) return '< 1h'
    return `${hours}h`
  }
  if (days < 7) {
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }
  const weeks = Math.floor(days / 7)
  const remainingDays = days % 7
  return remainingDays > 0 ? `${weeks}sem ${remainingDays}d` : `${weeks}sem`
}

function formatDateTime(date: string): string {
  const d = new Date(date)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

const RANGE_PRESETS = [
  { value: 'all', label: 'Todo' },
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'custom', label: 'Rango' },
]

const CATEGORY_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'producto', label: 'Producto' },
  { value: 'customer_success', label: 'CS' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'otro', label: 'Otro' },
]

export default function RoadmapKanban({ initiatives, onSelect, onReopen }: Props) {
  const [rangePreset, setRangePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')

  const filtered = initiatives.filter(item => {
    // Category filter
    if (filterCategory !== 'all' && (item as any).item_type !== filterCategory) return false;
    const completedAt = (item as any).completed_at || item.updated_at || item.created_at
    const d = new Date(completedAt)
    const now = new Date()

    if (rangePreset === 'today') return d.toDateString() === now.toDateString()
    if (rangePreset === '7d') return d.getTime() >= now.getTime() - 7 * 86400000
    if (rangePreset === '30d') return d.getTime() >= now.getTime() - 30 * 86400000
    if (rangePreset === 'custom') {
      if (dateFrom && d < new Date(dateFrom + 'T00:00:00')) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const dateA = (a as any).completed_at || a.updated_at || a.created_at
    const dateB = (b as any).completed_at || b.updated_at || b.created_at
    return new Date(dateB).getTime() - new Date(dateA).getTime()
  })

  // Group by date for visual separation
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()

  const getDateLabel = (dateStr: string): string => {
    const d = new Date(dateStr).toDateString()
    if (d === today) return 'Hoy'
    if (d === yesterday) return 'Ayer'
    return new Date(dateStr).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  // Count today's completions
  const todayCount = sorted.filter(i => {
    const d = (i as any).completed_at || i.updated_at || i.created_at
    return new Date(d).toDateString() === today
  }).length

  if (sorted.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
        <ArchiveBoxIcon className="w-14 h-14 text-gray-200 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">No hay tareas finalizadas</p>
        <p className="text-gray-300 text-sm mt-1">Las tareas completadas aparecerán aquí</p>
      </div>
    )
  }

  let lastDateLabel = ''

  return (
    <div>
      <div className="space-y-3 mb-5">
        {/* Row 1: Category filter + count + today badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
              {CATEGORY_FILTERS.map(c => (
                <button key={c.value} onClick={() => setFilterCategory(c.value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    filterCategory === c.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              {sorted.length} tarea{sorted.length !== 1 ? 's' : ''}
            </p>
          </div>
          {todayCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-100 rounded-full text-xs font-medium text-green-700">
              <CheckIcon className="w-3.5 h-3.5 stroke-[3]" />
              {todayCount} hoy
            </span>
          )}
        </div>
        {/* Row 2: Date range */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 font-medium">Período:</span>
          <div className="flex gap-1">
            {RANGE_PRESETS.map(p => (
              <button key={p.value} onClick={() => setRangePreset(p.value)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors ${
                  rangePreset === p.value ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          {rangePreset === 'custom' && (
            <div className="flex items-center gap-1.5 ml-1">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white" />
              <span className="text-[11px] text-gray-300">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white" />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {sorted.map(item => {
          const completedAt = (item as any).completed_at || item.updated_at || item.created_at
          const dateLabel = getDateLabel(completedAt)
          const showLabel = dateLabel !== lastDateLabel
          lastDateLabel = dateLabel

          const lifespan = formatDuration(item.created_at, completedAt)

          return (
            <div key={item.id}>
              {showLabel && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-4 pb-2 first:pt-0">
                  {dateLabel}
                </p>
              )}
              <div className="group flex items-center gap-4 px-5 py-3.5 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200">
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckIcon className="w-3.5 h-3.5 text-green-600 stroke-[3]" />
                </div>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(item)}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-500 line-through decoration-gray-300 truncate">{item.title}</p>
                    <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_STYLES[(item as any).item_type] || CATEGORY_STYLES.otro}`}>
                      {CATEGORY_LABELS[(item as any).item_type] || 'Otro'}
                    </span>
                  </div>
                  {item.problem_statement && (
                    <p className="text-xs text-gray-300 truncate mt-0.5">{item.problem_statement}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-[11px] text-gray-400 tabular-nums">{formatDateTime(completedAt)}</p>
                    <p className="text-[10px] text-gray-300 flex items-center justify-end gap-0.5 mt-0.5">
                      <ClockIcon className="w-3 h-3" /> {lifespan}
                    </p>
                  </div>

                  <button onClick={() => onReopen(item.id)}
                    className="p-2 rounded-xl text-gray-200 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all duration-200"
                    title="Reabrir tarea">
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
