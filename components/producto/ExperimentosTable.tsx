'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { ProductInitiative, ExperimentData } from '@/lib/types'

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Backlog' },
  { value: 'design', label: 'En diseño' },
  { value: 'running', label: 'Ejecutándose' },
  { value: 'completed', label: 'Terminado' },
  { value: 'paused', label: 'En pausa' },
]

const RESULT_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'won', label: 'Ganó' },
  { value: 'lost', label: 'Perdió' },
  { value: 'inconclusive', label: 'Inconcluso' },
]

const RESULT_COLORS: Record<string, { color: string; bg: string }> = {
  won: { color: '#16a34a', bg: '#f0fdf4' },
  lost: { color: '#dc2626', bg: '#fef2f2' },
  inconclusive: { color: '#6b7280', bg: '#f9fafb' },
  pending: { color: '#d97706', bg: '#fffbeb' },
}

const PRIORITY_OPTIONS = [
  { value: 'alta', label: 'Alta', color: '#dc2626', bg: '#fef2f2' },
  { value: 'media', label: 'Media', color: '#d97706', bg: '#fffbeb' },
  { value: 'baja', label: 'Baja', color: '#6b7280', bg: '#f9fafb' },
]

const PRIORITY_COLORS: Record<string, { color: string; bg: string }> = {
  alta: { color: '#dc2626', bg: '#fef2f2' },
  media: { color: '#d97706', bg: '#fffbeb' },
  baja: { color: '#6b7280', bg: '#f9fafb' },
}

const TAG_OPTIONS = [
  'Producto', 'Marketing', 'Pricing', 'Onboarding', 'Paywall', 'Email', 'Retención', 'Viralidad',
]

const TAG_COLORS: Record<string, string> = {
  Producto: '#7c3aed',
  Marketing: '#2563eb',
  Pricing: '#059669',
  Onboarding: '#d97706',
  Paywall: '#dc2626',
  Email: '#0891b2',
  Retención: '#7c3aed',
  Viralidad: '#ec4899',
}

const FUNNEL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'acquisition', label: 'Acquisition' },
  { value: 'activation', label: 'Activation' },
  { value: 'retention', label: 'Retention' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'referral', label: 'Referral' },
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

function computeDuration(start: string, end: string): number | null {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null
  return Math.ceil((e.getTime() - s.getTime()) / 86400000)
}

type SortField = 'title' | 'priority' | 'status' | 'result' | 'start_date' | 'end_date' | 'duration' | 'responsable' | 'tags' | 'funnel'
type SortDir = 'asc' | 'desc'

const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2, '': 3 }
const STATUS_ORDER: Record<string, number> = { running: 0, design: 1, pending: 2, paused: 3, completed: 4 }
const RESULT_ORDER: Record<string, number> = { pending: 0, inconclusive: 1, won: 2, lost: 3, '': 0 }

interface ExperimentosTableProps {
  initiatives: ProductInitiative[]
  onSelect: (init: ProductInitiative) => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onCreate: (title: string) => Promise<void>
  members: { user_id: string; email: string; first_name?: string }[]
}

export default function ExperimentosTable({ initiatives, onSelect, onUpdate, onCreate, members }: ExperimentosTableProps) {
  const [quickTitle, setQuickTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1 opacity-0 group-hover:opacity-100">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // Sort: by default won/lost go to bottom, then by creation date
  const sorted = useMemo(() => {
    const items = [...initiatives]

    items.sort((a, b) => {
      // If user picked a sort column, use that
      if (sortField) {
        let cmp = 0
        switch (sortField) {
          case 'title':
            cmp = a.title.localeCompare(b.title)
            break
          case 'priority': {
            const ap = PRIORITY_ORDER[a.experiment_data?.priority || ''] ?? 3
            const bp = PRIORITY_ORDER[b.experiment_data?.priority || ''] ?? 3
            cmp = ap - bp
            break
          }
          case 'status': {
            const as2 = STATUS_ORDER[a.status] ?? 5
            const bs2 = STATUS_ORDER[b.status] ?? 5
            cmp = as2 - bs2
            break
          }
          case 'result': {
            const ar = RESULT_ORDER[a.experiment_data?.result || ''] ?? 0
            const br = RESULT_ORDER[b.experiment_data?.result || ''] ?? 0
            cmp = ar - br
            break
          }
          case 'start_date': {
            const as3 = parsePeriod(a.period_value).start
            const bs3 = parsePeriod(b.period_value).start
            cmp = as3.localeCompare(bs3)
            break
          }
          case 'end_date': {
            const ae = parsePeriod(a.period_value).end
            const be = parsePeriod(b.period_value).end
            cmp = ae.localeCompare(be)
            break
          }
          case 'duration': {
            const ad = computeDuration(parsePeriod(a.period_value).start, parsePeriod(a.period_value).end) ?? 9999
            const bd = computeDuration(parsePeriod(b.period_value).start, parsePeriod(b.period_value).end) ?? 9999
            cmp = ad - bd
            break
          }
          case 'responsable': {
            const ae2 = members.find(m => m.user_id === a.owner_id)?.email || 'zzz'
            const be2 = members.find(m => m.user_id === b.owner_id)?.email || 'zzz'
            cmp = ae2.localeCompare(be2)
            break
          }
          case 'tags': {
            const at = (a.tags?.[0] || 'zzz')
            const bt = (b.tags?.[0] || 'zzz')
            cmp = at.localeCompare(bt)
            break
          }
          case 'funnel': {
            const af = a.experiment_data?.funnel_stage || 'zzz'
            const bf = b.experiment_data?.funnel_stage || 'zzz'
            cmp = af.localeCompare(bf)
            break
          }
        }
        return sortDir === 'asc' ? cmp : -cmp
      }

      // Default: won/lost at bottom, rest by created_at desc
      const aResult = a.experiment_data?.result || ''
      const bResult = b.experiment_data?.result || ''
      const aFinished = aResult === 'won' || aResult === 'lost'
      const bFinished = bResult === 'won' || bResult === 'lost'
      if (aFinished !== bFinished) return aFinished ? 1 : -1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return items
  }, [initiatives, sortField, sortDir, members])

  const handleQuickCreate = async () => {
    if (!quickTitle.trim()) return
    setCreating(true)
    await onCreate(quickTitle.trim())
    setQuickTitle('')
    setCreating(false)
  }

  const thSortable = 'px-3 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wide cursor-pointer hover:text-gray-900 select-none group whitespace-nowrap'
  const thStatic = 'px-3 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap'

  // Column widths in px — total ~1986px
  const COL_W = [200, 180, 90, 115, 115, 115, 160, 130, 130, 75, 120, 120, 120, 90, 120, 96, 110]

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: `${COL_W.reduce((a, b) => a + b, 0)}px` }}>
        <colgroup>
          {COL_W.map((w, i) => (
            <col key={i} style={{ width: `${w}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-gray-50 border-b text-left">
            <th className={`sticky left-0 z-10 bg-gray-50 ${thSortable}`} onClick={() => handleSort('title')}>Experimento <SortIcon field="title" /></th>
            <th className={thStatic}>Hipótesis</th>
            <th className={thSortable} onClick={() => handleSort('priority')}>Prioridad <SortIcon field="priority" /></th>
            <th className={thSortable} onClick={() => handleSort('tags')}>Tags <SortIcon field="tags" /></th>
            <th className={thSortable} onClick={() => handleSort('funnel')}>Área/Funnel <SortIcon field="funnel" /></th>
            <th className={thSortable} onClick={() => handleSort('status')}>Estado <SortIcon field="status" /></th>
            <th className={thSortable} onClick={() => handleSort('responsable')}>Responsable <SortIcon field="responsable" /></th>
            <th className={thSortable} onClick={() => handleSort('start_date')}>Fecha inicio <SortIcon field="start_date" /></th>
            <th className={thSortable} onClick={() => handleSort('end_date')}>Fecha fin <SortIcon field="end_date" /></th>
            <th className={thSortable} onClick={() => handleSort('duration')}>Duración <SortIcon field="duration" /></th>
            <th className={thStatic}>Métrica baseline</th>
            <th className={thStatic}>Métrica objetivo</th>
            <th className={thStatic}>Métrica post</th>
            <th className={thStatic}>Dashboard</th>
            <th className={thStatic}>Próx. pasos</th>
            <th className={thStatic}>Significancia</th>
            <th className={thSortable} onClick={() => handleSort('result')}>Resultado <SortIcon field="result" /></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(init => (
            <ExperimentRow
              key={init.id}
              initiative={init}
              onSelect={onSelect}
              onUpdate={onUpdate}
              members={members}
            />
          ))}
          {/* Quick create row */}
          <tr className="border-t">
            <td className="sticky left-0 z-10 bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={quickTitle}
                  onChange={e => setQuickTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuickCreate()}
                  placeholder="+ Nuevo experimento..."
                  className="text-sm border-none focus:outline-none focus:ring-0 placeholder-gray-400 bg-transparent w-full"
                />
              </div>
            </td>
            <td className="px-3 py-2">
              {quickTitle.trim() && (
                <button
                  onClick={handleQuickCreate}
                  disabled={creating}
                  className="px-3 py-1 rounded text-xs font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#7c3aed' }}
                >
                  {creating ? '...' : 'Crear'}
                </button>
              )}
            </td>
            <td colSpan={15} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

interface ExperimentRowProps {
  initiative: ProductInitiative
  onSelect: (init: ProductInitiative) => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  members: { user_id: string; email: string; first_name?: string }[]
}

function ExperimentRow({ initiative, onSelect, onUpdate, members }: ExperimentRowProps) {
  const expData = initiative.experiment_data || {}
  const { start, end } = parsePeriod(initiative.period_value)
  const duration = computeDuration(start, end)
  const currentPriority = expData.priority || ''
  const priorityStyle = PRIORITY_COLORS[currentPriority] || { color: '#6b7280', bg: '#f9fafb' }

  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const debouncedUpdate = useCallback((updates: Partial<ProductInitiative>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onUpdate(initiative.id, updates)
    }, 1500)
  }, [initiative.id, onUpdate])

  const updateExpData = (field: keyof ExperimentData, val: string, immediate = false) => {
    const updated = { ...expData, [field]: val }
    if (immediate) {
      onUpdate(initiative.id, { experiment_data: updated as any })
    } else {
      debouncedUpdate({ experiment_data: updated as any })
    }
  }

  const updateDateField = (type: 'start' | 'end', val: string) => {
    const newStart = type === 'start' ? val : start
    const newEnd = type === 'end' ? val : end
    onUpdate(initiative.id, {
      period_value: buildPeriod(newStart, newEnd),
      period_type: 'week',
    })
  }

  const cellClass = 'px-3 py-2 border-b border-gray-100 overflow-hidden'
  const isFinished = expData.result === 'won' || expData.result === 'lost'

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${isFinished ? 'opacity-60' : ''}`}>
      {/* Experimento (sticky) */}
      <td className={`sticky left-0 z-10 bg-white hover:bg-gray-50 ${cellClass} font-medium`}>
        <button
          onClick={() => onSelect(initiative)}
          className="text-left hover:underline truncate block w-full"
          style={{ color: '#3c527a' }}
          title={initiative.title}
        >
          {initiative.title}
        </button>
      </td>

      {/* Hipótesis */}
      <td className={cellClass}>
        <InlineTextInput
          value={expData.hypothesis || ''}
          onChange={val => updateExpData('hypothesis', val)}
          placeholder="Hipótesis..."
        />
      </td>

      {/* Prioridad (editable dropdown) */}
      <td className={cellClass}>
        <select
          value={currentPriority}
          onChange={e => updateExpData('priority', e.target.value, true)}
          className="text-xs border rounded px-1.5 py-1 w-full font-medium"
          style={{ color: priorityStyle.color, backgroundColor: priorityStyle.bg }}
        >
          <option value="">—</option>
          {PRIORITY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>

      {/* Tags */}
      <td className={cellClass}>
        <select
          value={initiative.tags?.[0] || ''}
          onChange={e => {
            const val = e.target.value
            onUpdate(initiative.id, { tags: val ? [val] : [] })
          }}
          className="text-xs border rounded px-1.5 py-1 bg-transparent w-full"
          style={initiative.tags?.[0] ? { color: TAG_COLORS[initiative.tags[0]] || '#6b7280' } : {}}
        >
          <option value="">—</option>
          {TAG_OPTIONS.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>

      {/* Área/Funnel */}
      <td className={cellClass}>
        <select
          value={expData.funnel_stage || ''}
          onChange={e => updateExpData('funnel_stage', e.target.value, true)}
          className="text-xs border rounded px-1.5 py-1 bg-transparent w-full"
        >
          {FUNNEL_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>

      {/* Estado */}
      <td className={cellClass}>
        <select
          value={initiative.status}
          onChange={e => onUpdate(initiative.id, { status: e.target.value as any })}
          className="text-xs border rounded px-1.5 py-1 bg-transparent w-full"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>

      {/* Responsable */}
      <td className={cellClass}>
        <select
          value={initiative.owner_id || ''}
          onChange={e => onUpdate(initiative.id, { owner_id: e.target.value || null })}
          className="text-xs border rounded px-1.5 py-1 bg-transparent w-full truncate"
        >
          <option value="">Sin asignar</option>
          {members.map(m => (
            <option key={m.user_id} value={m.user_id}>
              {m.first_name || m.email}
            </option>
          ))}
        </select>
      </td>

      {/* Fecha inicio */}
      <td className={cellClass}>
        <input
          type="date"
          value={start}
          onChange={e => updateDateField('start', e.target.value)}
          className="text-xs border rounded px-1.5 py-1 bg-transparent w-full"
        />
      </td>

      {/* Fecha fin */}
      <td className={cellClass}>
        <input
          type="date"
          value={end}
          onChange={e => updateDateField('end', e.target.value)}
          className="text-xs border rounded px-1.5 py-1 bg-transparent w-full"
        />
      </td>

      {/* Duración */}
      <td className={`${cellClass} text-center text-xs text-gray-500`}>
        {duration !== null ? `${duration}d` : '—'}
      </td>

      {/* Métrica baseline */}
      <td className={cellClass}>
        <InlineTextInput
          value={expData.metric_base || ''}
          onChange={val => updateExpData('metric_base', val)}
          placeholder="—"
        />
      </td>

      {/* Métrica objetivo */}
      <td className={cellClass}>
        <InlineTextInput
          value={expData.metric_target || ''}
          onChange={val => updateExpData('metric_target', val)}
          placeholder="—"
        />
      </td>

      {/* Métrica post */}
      <td className={cellClass}>
        <InlineTextInput
          value={expData.metric_result || ''}
          onChange={val => updateExpData('metric_result', val)}
          placeholder="—"
        />
      </td>

      {/* Dashboard */}
      <td className={cellClass}>
        {expData.dashboard_link ? (
          <a
            href={expData.dashboard_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline truncate block w-full"
            title={expData.dashboard_link}
          >
            Ver
          </a>
        ) : (
          <InlineTextInput
            value=""
            onChange={val => updateExpData('dashboard_link', val)}
            placeholder="URL..."
          />
        )}
      </td>

      {/* Próximos pasos */}
      <td className={cellClass}>
        <select
          value={expData.next_steps || ''}
          onChange={e => updateExpData('next_steps', e.target.value, true)}
          className="text-xs border rounded px-1.5 py-1 bg-transparent w-full"
        >
          {NEXT_STEPS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>

      {/* Significancia */}
      <td className={`${cellClass} text-center`}>
        <input
          type="checkbox"
          checked={expData.statistical_significance === 'true'}
          onChange={e => updateExpData('statistical_significance', e.target.checked ? 'true' : 'false', true)}
          className="rounded accent-[#3c527a]"
        />
      </td>

      {/* Resultado */}
      <td className={cellClass}>
        <select
          value={expData.result || 'pending'}
          onChange={e => updateExpData('result', e.target.value, true)}
          className="text-xs border rounded px-1.5 py-1 w-full font-medium"
          style={{
            color: RESULT_COLORS[expData.result || 'pending']?.color,
            backgroundColor: RESULT_COLORS[expData.result || 'pending']?.bg,
          }}
        >
          {RESULT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>
    </tr>
  )
}

function InlineTextInput({ value, onChange, placeholder }: { value: string; onChange: (val: string) => void; placeholder: string }) {
  const [local, setLocal] = useState(value)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const handleChange = (val: string) => {
    setLocal(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange(val)
    }, 1500)
  }

  return (
    <input
      type="text"
      value={local}
      onChange={e => handleChange(e.target.value)}
      placeholder={placeholder}
      className="text-xs border-none bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 placeholder-gray-300"
    />
  )
}
