'use client'

import { useState } from 'react'
import { ProductInitiative } from '@/lib/types'
import QuickCreateRow from './QuickCreateRow'
import { ArrowUpCircleIcon } from '@heroicons/react/24/outline'

const TYPE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  experiment: { label: 'Experimento', color: '#7c3aed', bg: '#f5f3ff' },
  feature: { label: 'Feature', color: '#2563eb', bg: '#eff6ff' },
  tech_debt: { label: 'Tech Debt', color: '#d97706', bg: '#fffbeb' },
  bug: { label: 'Bug', color: '#dc2626', bg: '#fef2f2' },
}

const RICE_TOOLTIPS: Record<string, string> = {
  rice_reach: 'Reach (Alcance): ¿A cuántas personas impactará esta iniciativa? 1 = muy pocas, 10 = toda la base.',
  rice_impact: 'Impact (Impacto): ¿Cuánto contribuye al objetivo? 1 = mínimo, 10 = transformacional.',
  rice_confidence: 'Confidence (Confianza): ¿Qué tan seguros estamos? 1 = pura intuición, 10 = datos sólidos.',
  rice_effort: 'Effort (Esfuerzo): ¿Cuánto trabajo requiere? 1 = muy poco, 10 = trimestre completo.',
}

type SortField = 'rice_score' | 'rice_reach' | 'rice_impact' | 'rice_confidence' | 'rice_effort' | 'title'
type SortDir = 'asc' | 'desc'

interface BacklogTableProps {
  initiatives: ProductInitiative[]
  onSelect: (initiative: ProductInitiative) => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onCreate: (title: string, problemStatement: string) => Promise<void>
  onPromote: (initiative: ProductInitiative) => void
}

export default function BacklogTable({ initiatives, onSelect, onUpdate, onCreate, onPromote }: BacklogTableProps) {
  const [sortField, setSortField] = useState<SortField>('rice_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const computeRice = (item: ProductInitiative) => {
    const effort = item.rice_effort > 0 ? item.rice_effort : 1
    return (item.rice_reach * item.rice_impact * item.rice_confidence) / effort
  }

  const sorted = [...initiatives].sort((a, b) => {
    if (sortField === 'rice_score') {
      const diff = computeRice(a) - computeRice(b)
      return sortDir === 'asc' ? diff : -diff
    }
    const aVal = a[sortField] ?? 0
    const bVal = b[sortField] ?? 0
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortDir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal)
  })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="overflow-x-auto" style={{ overflow: 'visible' }}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th
                className="text-left p-4 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('title')}
              >
                Título <SortIcon field="title" />
              </th>
              <th className="text-center p-4 font-semibold text-gray-600">Tipo</th>
              {(['rice_reach', 'rice_impact', 'rice_confidence', 'rice_effort'] as const).map(field => (
                <th
                  key={field}
                  className="text-center p-4 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => handleSort(field)}
                >
                  <div className="relative inline-block group">
                    {field.replace('rice_', '').charAt(0).toUpperCase() + field.replace('rice_', '').slice(1)}
                    <SortIcon field={field} />
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 p-2.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-50 font-normal text-left leading-relaxed shadow-lg">
                      {RICE_TOOLTIPS[field]}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-800" />
                    </div>
                  </div>
                </th>
              ))}
              <th
                className="text-center p-4 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('rice_score')}
              >
                RICE <SortIcon field="rice_score" />
              </th>
              <th className="text-center p-4 font-semibold text-gray-600 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(item => {
              const badge = TYPE_BADGES[item.item_type] || TYPE_BADGES.feature
              const score = computeRice(item)
              return (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <button
                      onClick={() => onSelect(item)}
                      className="text-left font-medium hover:underline"
                      style={{ color: '#3c527a' }}
                    >
                      {item.title}
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap"
                      style={{ color: badge.color, backgroundColor: badge.bg }}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <EditableCell value={item.rice_reach} onSave={v => onUpdate(item.id, { rice_reach: v })} />
                  <EditableCell value={item.rice_impact} onSave={v => onUpdate(item.id, { rice_impact: v })} />
                  <EditableCell value={item.rice_confidence} onSave={v => onUpdate(item.id, { rice_confidence: v })} />
                  <EditableCell value={item.rice_effort} onSave={v => onUpdate(item.id, { rice_effort: v })} />
                  <td className="p-4 text-center">
                    <span className="font-bold text-lg" style={{ color: '#ff8080' }}>
                      {score.toFixed(1)}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => onPromote(item)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-[#3c527a] hover:bg-blue-50 transition"
                      title={item.item_type === 'experiment' ? 'Promover a Experimentos' : 'Promover a Roadmap'}
                    >
                      <ArrowUpCircleIcon className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-400">
                  No hay ideas en el backlog. Crea la primera abajo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <QuickCreateRow onCreate={onCreate} />
    </div>
  )
}

function EditableCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  const handleBlur = () => {
    setEditing(false)
    const num = parseInt(draft)
    if (!isNaN(num) && num >= 1 && num <= 10 && num !== value) {
      onSave(num)
    } else {
      setDraft(String(value))
    }
  }

  if (editing) {
    return (
      <td className="p-4 text-center">
        <select
          value={draft}
          onChange={e => { setDraft(e.target.value) }}
          onBlur={handleBlur}
          className="w-16 text-center border rounded px-1 py-0.5 text-sm"
          autoFocus
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </td>
    )
  }

  return (
    <td className="p-4 text-center">
      <button
        onClick={() => { setDraft(String(value || 1)); setEditing(true) }}
        className="hover:bg-gray-100 px-2 py-0.5 rounded cursor-pointer text-gray-700 min-w-[28px]"
      >
        {value || '-'}
      </button>
    </td>
  )
}
