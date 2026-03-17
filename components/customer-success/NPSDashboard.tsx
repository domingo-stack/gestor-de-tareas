'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  SparklesIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'

// --------------- Types ---------------

interface NPSResponse {
  id: string
  bubble_id: string
  fecha: string
  nombre_apellido: string
  pais: string
  telefono: string
  fecha_creacion_cuenta: string
  suscripcion: string
  score: number | null
  como_mejorar: string
  principal_beneficio: string
  synced_at: string
}

type ViewMode = 'dashboard' | 'resumen' | 'database'
type SortField = 'fecha' | 'score' | 'pais'
type SortDir = 'asc' | 'desc'

// --------------- Helpers ---------------

function dateOnly(d: string): string {
  return (d || '').slice(0, 10)
}

// Week starts on Sunday
function getSunday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay() // 0=Sunday
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

function getCurrentWeekStart(): Date {
  return getSunday(new Date())
}

function formatWeekLabel(start: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const end = new Date(start)
  end.setDate(end.getDate() + 6) // Saturday
  return `${start.toLocaleDateString('es-ES', opts)} – ${end.toLocaleDateString('es-ES', opts)}, ${end.getFullYear()}`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getWeekRange(weekStart: Date): { start: string; end: string } {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  return {
    start: weekStart.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function getMonthRange(weekStart: Date): { start: string; end: string } {
  const year = weekStart.getFullYear()
  const month = weekStart.getMonth()
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function getQuarterRange(refDate: Date): { start: string; end: string; label: string } {
  const year = refDate.getFullYear()
  const month = refDate.getMonth()
  const q = Math.floor(month / 3)
  const start = new Date(year, q * 3, 1)
  const end = new Date(year, q * 3 + 3, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: `Q${q + 1} ${year}`,
  }
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function computeNPS(responses: NPSResponse[]): number | null {
  const valid = responses.filter(r => r.score != null)
  if (valid.length === 0) return null
  const promoters = valid.filter(r => r.score! >= 9).length
  const detractors = valid.filter(r => r.score! <= 6).length
  return Math.round(((promoters - detractors) / valid.length) * 100)
}

function scoreBarColor(score: number): string {
  if (score >= 9) return '#22c55e'
  if (score >= 7) return '#eab308'
  return '#ef4444'
}

function scoreBadgeClasses(score: number): string {
  if (score >= 9) return 'bg-green-100 text-green-800'
  if (score >= 7) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

function npsColor(nps: number | null): string {
  if (nps === null) return 'text-gray-300'
  if (nps > 0) return 'text-green-600'
  if (nps < 0) return 'text-red-600'
  return 'text-gray-600'
}

// --------------- Component ---------------

export default function NPSDashboard() {
  const { supabase } = useAuth()

  // Data
  const [allData, setAllData] = useState<NPSResponse[]>([])
  const [loading, setLoading] = useState(true)

  // View
  const [view, setView] = useState<ViewMode>('dashboard')

  // Filters
  const [weekStart, setWeekStart] = useState<Date>(getCurrentWeekStart())
  const [paisFilter, setPaisFilter] = useState<string>('all')
  const [suscripcionFilter, setSuscripcionFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Table state
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  // Resumen period filter
  const [resumenPeriod, setResumenPeriod] = useState<'q' | 'month' | 'custom'>('q')
  const [resumenQ, setResumenQ] = useState(() => {
    const now = new Date()
    const q = Math.floor(now.getMonth() / 3) + 1
    return `${now.getFullYear()}-Q${q}`
  })
  const [resumenCustomDesde, setResumenCustomDesde] = useState('')
  const [resumenCustomHasta, setResumenCustomHasta] = useState('')
  const [resumenMonth, setResumenMonth] = useState(() => new Date())

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data, error } = await supabase
        .from('nps_responses')
        .select('*')
        .order('fecha', { ascending: false })

      if (error) {
        toast.error('Error al cargar respuestas NPS')
        console.error(error)
      } else {
        setAllData(data || [])
      }
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  // Dynamic filter options
  const paisOptions = useMemo(() => {
    const set = new Set(allData.map(r => r.pais).filter(Boolean))
    return Array.from(set).sort()
  }, [allData])

  const suscripcionOptions = useMemo(() => {
    const set = new Set(allData.map(r => r.suscripcion).filter(Boolean))
    return Array.from(set).sort()
  }, [allData])

  // Apply base filters (país, suscripción)
  const baseFiltered = useMemo(() => {
    return allData.filter(r => {
      if (paisFilter !== 'all' && r.pais !== paisFilter) return false
      if (suscripcionFilter !== 'all' && r.suscripcion !== suscripcionFilter) return false
      return true
    })
  }, [allData, paisFilter, suscripcionFilter])

  // Week-filtered data
  const weekRange = useMemo(() => getWeekRange(weekStart), [weekStart])

  const weekData = useMemo(() => {
    return baseFiltered.filter(r => {
      const d = dateOnly(r.fecha)
      return d >= weekRange.start && d <= weekRange.end
    })
  }, [baseFiltered, weekRange])

  // Previous week data (for trend)
  const prevWeekData = useMemo(() => {
    const prevStart = new Date(weekStart)
    prevStart.setDate(prevStart.getDate() - 7)
    const prev = getWeekRange(prevStart)
    return baseFiltered.filter(r => {
      const d = dateOnly(r.fecha)
      return d >= prev.start && d <= prev.end
    })
  }, [baseFiltered, weekStart])

  // Month data
  const monthData = useMemo(() => {
    const mr = getMonthRange(weekStart)
    return baseFiltered.filter(r => {
      const d = dateOnly(r.fecha)
      return d >= mr.start && d <= mr.end
    })
  }, [baseFiltered, weekStart])

  // Quarter data
  const quarterInfo = useMemo(() => getQuarterRange(weekStart), [weekStart])
  const quarterData = useMemo(() => {
    return baseFiltered.filter(r => {
      const d = dateOnly(r.fecha)
      return d >= quarterInfo.start && d <= quarterInfo.end
    })
  }, [baseFiltered, quarterInfo])

  // NPS calculations
  const weekNPS = useMemo(() => computeNPS(weekData), [weekData])
  const prevWeekNPS = useMemo(() => computeNPS(prevWeekData), [prevWeekData])
  const monthNPS = useMemo(() => computeNPS(monthData), [monthData])
  const quarterNPS = useMemo(() => computeNPS(quarterData), [quarterData])

  const distribution = useMemo(() => {
    const valid = weekData.filter(r => r.score != null)
    if (valid.length === 0) return { promoters: 0, passives: 0, detractors: 0 }
    const promoters = valid.filter(r => r.score! >= 9).length
    const passives = valid.filter(r => r.score! >= 7 && r.score! <= 8).length
    const detractors = valid.filter(r => r.score! <= 6).length
    const total = valid.length
    return {
      promoters: Math.round((promoters / total) * 100),
      passives: Math.round((passives / total) * 100),
      detractors: Math.round((detractors / total) * 100),
    }
  }, [weekData])

  // Score distribution chart data
  const scoreDistribution = useMemo(() => {
    const counts = Array.from({ length: 11 }, (_, i) => ({ score: i, count: 0 }))
    weekData.forEach(r => {
      const s = r.score != null ? Math.round(r.score) : -1
      if (s >= 0 && s <= 10) counts[s].count++
    })
    return counts
  }, [weekData])

  // NPS trend (last 12 weeks) — fixed date comparison
  const trendData = useMemo(() => {
    const weeks: { label: string; nps: number | null; npsFiltered?: number | null }[] = []
    for (let i = 11; i >= 0; i--) {
      const ws = new Date(weekStart)
      ws.setDate(ws.getDate() - i * 7)
      const sunday = getSunday(ws)
      const wr = getWeekRange(sunday)

      const globalWeek = allData.filter(r => {
        const d = dateOnly(r.fecha)
        return d >= wr.start && d <= wr.end
      })
      const globalNPS = computeNPS(globalWeek)

      const label = sunday.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })

      if (paisFilter !== 'all' || suscripcionFilter !== 'all') {
        const filteredWeek = baseFiltered.filter(r => {
          const d = dateOnly(r.fecha)
          return d >= wr.start && d <= wr.end
        })
        weeks.push({ label, nps: globalNPS, npsFiltered: computeNPS(filteredWeek) })
      } else {
        weeks.push({ label, nps: globalNPS })
      }
    }
    return weeks
  }, [weekStart, allData, baseFiltered, paisFilter, suscripcionFilter])

  // NPS by country (for Resumen tab)
  const npsByCountry = useMemo(() => {
    const dataForPeriod = quarterData
    const countryMap = new Map<string, NPSResponse[]>()
    for (const r of dataForPeriod) {
      const p = r.pais || 'Sin país'
      if (!countryMap.has(p)) countryMap.set(p, [])
      countryMap.get(p)!.push(r)
    }
    return [...countryMap.entries()]
      .map(([pais, responses]) => {
        const valid = responses.filter(r => r.score != null)
        const promoters = valid.filter(r => r.score! >= 9).length
        const passives = valid.filter(r => r.score! >= 7 && r.score! <= 8).length
        const detractors = valid.filter(r => r.score! <= 6).length
        const nps = computeNPS(responses)
        return { pais, nps, total: valid.length, promoters, passives, detractors }
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [quarterData])

  // Quarter distribution
  const quarterDistribution = useMemo(() => {
    const valid = quarterData.filter(r => r.score != null)
    if (valid.length === 0) return { promoters: 0, passives: 0, detractors: 0 }
    const promoters = valid.filter(r => r.score! >= 9).length
    const passives = valid.filter(r => r.score! >= 7 && r.score! <= 8).length
    const detractors = valid.filter(r => r.score! <= 6).length
    const total = valid.length
    return {
      promoters: Math.round((promoters / total) * 100),
      passives: Math.round((passives / total) * 100),
      detractors: Math.round((detractors / total) * 100),
    }
  }, [quarterData])

  // Resumen period range
  const resumenRange = useMemo((): { start: string; end: string; label: string } => {
    if (resumenPeriod === 'custom' && resumenCustomDesde && resumenCustomHasta) {
      return { start: resumenCustomDesde, end: resumenCustomHasta, label: `${resumenCustomDesde} — ${resumenCustomHasta}` }
    }
    if (resumenPeriod === 'month') {
      const mr = getMonthRange(resumenMonth)
      return { ...mr, label: resumenMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) }
    }
    const [yearStr, qStr] = resumenQ.split('-Q')
    const year = parseInt(yearStr)
    const q = parseInt(qStr) - 1
    const start = new Date(year, q * 3, 1)
    const end = new Date(year, q * 3 + 3, 0)
    return { start: localDateStr(start), end: localDateStr(end), label: resumenQ.replace('-', ' ') }
  }, [resumenPeriod, resumenQ, resumenCustomDesde, resumenCustomHasta, resumenMonth])

  const resumenData = useMemo(() => {
    return baseFiltered.filter(r => {
      const d = dateOnly(r.fecha)
      return d >= resumenRange.start && d <= resumenRange.end
    })
  }, [baseFiltered, resumenRange])

  const resumenNPS = useMemo(() => computeNPS(resumenData), [resumenData])

  const resumenDistribution = useMemo(() => {
    const valid = resumenData.filter(r => r.score != null)
    if (valid.length === 0) return { promoters: 0, passives: 0, detractors: 0 }
    const promoters = valid.filter(r => r.score! >= 9).length
    const passives = valid.filter(r => r.score! >= 7 && r.score! <= 8).length
    const detractors = valid.filter(r => r.score! <= 6).length
    const total = valid.length
    return {
      promoters: Math.round((promoters / total) * 100),
      passives: Math.round((passives / total) * 100),
      detractors: Math.round((detractors / total) * 100),
    }
  }, [resumenData])

  const resumenCountryNPS = useMemo(() => {
    const countryMap = new Map<string, NPSResponse[]>()
    for (const r of resumenData) {
      const p = r.pais || 'Sin país'
      if (!countryMap.has(p)) countryMap.set(p, [])
      countryMap.get(p)!.push(r)
    }
    return [...countryMap.entries()]
      .map(([pais, responses]) => {
        const valid = responses.filter(r => r.score != null)
        const promoters = valid.filter(r => r.score! >= 9).length
        const passives = valid.filter(r => r.score! >= 7 && r.score! <= 8).length
        const detractors = valid.filter(r => r.score! <= 6).length
        const nps = computeNPS(responses)
        return { pais, nps, total: valid.length, promoters, passives, detractors }
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [resumenData])

  const availableQuarters = useMemo(() => {
    const qs = new Set<string>()
    for (const r of allData) {
      const d = dateOnly(r.fecha)
      if (!d) continue
      const [y, m] = d.split('-').map(Number)
      const q = Math.floor((m - 1) / 3) + 1
      qs.add(`${y}-Q${q}`)
    }
    return Array.from(qs).sort().reverse()
  }, [allData])

  // Database view data — shows ALL data (not filtered by week), only by país/suscripción
  const databaseData = useMemo(() => {
    let filtered = baseFiltered.filter(r => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (r.nombre_apellido || '').toLowerCase().includes(q) ||
               (r.como_mejorar || '').toLowerCase().includes(q) ||
               (r.principal_beneficio || '').toLowerCase().includes(q)
      }
      return true
    })

    filtered = [...filtered]
    filtered.sort((a, b) => {
      let cmp = 0
      if (sortField === 'fecha') cmp = a.fecha.localeCompare(b.fecha)
      else if (sortField === 'score') cmp = (a.score ?? -1) - (b.score ?? -1)
      else if (sortField === 'pais') cmp = (a.pais || '').localeCompare(b.pais || '')
      return sortDir === 'desc' ? -cmp : cmp
    })

    return filtered
  }, [baseFiltered, searchQuery, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(databaseData.length / PAGE_SIZE))
  const pagedData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return databaseData.slice(start, start + PAGE_SIZE)
  }, [databaseData, page])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [weekStart, paisFilter, suscripcionFilter, searchQuery, sortField, sortDir])

  // Week navigation
  const goBack = () => {
    const prev = new Date(weekStart)
    prev.setDate(prev.getDate() - 7)
    setWeekStart(prev)
  }
  const goForward = () => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    const now = getCurrentWeekStart()
    if (next <= now) setWeekStart(next)
  }
  const isCurrentWeek = weekStart.getTime() === getCurrentWeekStart().getTime()

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  // CSV export
  const exportCSV = useCallback(() => {
    if (databaseData.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }
    const headers = ['Fecha', 'Nombre', 'País', 'Suscripción', 'Score', 'Cómo mejorar', 'Principal beneficio']
    const rows = databaseData.map(r => [
      r.fecha,
      r.nombre_apellido || '',
      r.pais || '',
      r.suscripcion || '',
      r.score != null ? String(r.score) : '',
      `"${(r.como_mejorar || '').replace(/"/g, '""')}"`,
      `"${(r.principal_beneficio || '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nps_export_${weekRange.start}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exportado')
  }, [databaseData, weekRange.start])

  // Sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUpIcon className="w-3 h-3 text-gray-300 inline ml-1" />
    return sortDir === 'asc'
      ? <ChevronUpIcon className="w-3 h-3 text-[#3c527a] inline ml-1" />
      : <ChevronDownIcon className="w-3 h-3 text-[#3c527a] inline ml-1" />
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3c527a]" />
      </div>
    )
  }

  const hasFiltersActive = paisFilter !== 'all' || suscripcionFilter !== 'all'

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView('dashboard')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ChartBarIcon className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => setView('resumen')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'resumen' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardDocumentListIcon className="w-4 h-4" />
          Resumen
        </button>
        <button
          onClick={() => setView('database')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'database' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <TableCellsIcon className="w-4 h-4" />
          Base de datos
        </button>
      </div>

      {/* Week selector (Dashboard only) */}
      {view === 'dashboard' && (
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[220px] text-center">
            Semana del {formatWeekLabel(weekStart)}
          </span>
          <button
            onClick={goForward}
            disabled={isCurrentWeek}
            className={`p-1.5 rounded-md border border-gray-200 transition-colors ${
              isCurrentWeek ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'
            }`}
          >
            <ChevronRightIcon className="w-4 h-4 text-gray-600" />
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekStart(getCurrentWeekStart())}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Hoy
            </button>
          )}
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">País</label>
          <select
            value={paisFilter}
            onChange={e => setPaisFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-[#383838] focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
          >
            <option value="all">Todos</option>
            {paisOptions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Suscripción</label>
          <select
            value={suscripcionFilter}
            onChange={e => setSuscripcionFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-[#383838] focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
          >
            <option value="all">Todas</option>
            {suscripcionOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {view === 'database' && (
          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar nombre..."
                className="text-sm border border-gray-200 rounded-md pl-8 pr-3 py-1.5 bg-white text-[#383838] focus:outline-none focus:ring-1 focus:ring-[#3c527a] w-56"
              />
            </div>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 text-sm font-medium text-[#3c527a] border border-[#3c527a] rounded-md px-3 py-1.5 hover:bg-[#3c527a] hover:text-white transition-colors"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        )}
      </div>

      {/* =================== DASHBOARD VIEW =================== */}
      {view === 'dashboard' && (
        <div className="space-y-6">
          {/* Metric cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* NPS Score */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">NPS de la semana</p>
              <div className="flex items-end gap-2">
                <span className={`text-3xl font-bold ${npsColor(weekNPS)}`}>
                  {weekNPS !== null ? weekNPS : '—'}
                </span>
                {weekNPS !== null && prevWeekNPS !== null && (
                  <span
                    className={`flex items-center text-xs font-medium mb-1 ${
                      weekNPS >= prevWeekNPS ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {weekNPS >= prevWeekNPS ? (
                      <ArrowTrendingUpIcon className="w-3.5 h-3.5 mr-0.5" />
                    ) : (
                      <ArrowTrendingDownIcon className="w-3.5 h-3.5 mr-0.5" />
                    )}
                    {weekNPS - prevWeekNPS > 0 ? '+' : ''}
                    {weekNPS - prevWeekNPS}
                  </span>
                )}
              </div>
            </div>

            {/* Total respuestas */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Respuestas de la semana</p>
              <span className="text-3xl font-bold text-[#383838]">{weekData.length}</span>
            </div>

            {/* Distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Distribución</p>
              {weekData.length === 0 ? (
                <span className="text-sm text-gray-400">Sin datos</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2.5 py-0.5 text-xs font-medium">
                    {distribution.promoters}% Prom.
                  </span>
                  <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2.5 py-0.5 text-xs font-medium">
                    {distribution.passives}% Pas.
                  </span>
                  <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2.5 py-0.5 text-xs font-medium">
                    {distribution.detractors}% Det.
                  </span>
                </div>
              )}
            </div>

            {/* NPS acumulado del mes */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">NPS acumulado del mes</p>
              <span className={`text-3xl font-bold ${npsColor(monthNPS)}`}>
                {monthNPS !== null ? monthNPS : '—'}
              </span>
              {monthNPS !== null && (
                <p className="text-xs text-gray-400 mt-1">{monthData.length} respuestas</p>
              )}
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-[#383838] mb-4">Distribución de scores</h3>
              {weekData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Sin datos para esta semana</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={scoreDistribution} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="score" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value: number) => [value, 'Respuestas']}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {scoreDistribution.map((entry) => (
                        <Cell key={entry.score} fill={scoreBarColor(entry.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* NPS trend */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-[#383838] mb-4">Tendencia NPS (12 semanas)</h3>
              {trendData.every(d => d.nps === null) ? (
                <p className="text-sm text-gray-400 text-center py-10">Sin datos suficientes</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[-100, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Line
                      type="monotone"
                      dataKey="nps"
                      name="NPS Global"
                      stroke="#3c527a"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                    {hasFiltersActive && (
                      <Line
                        type="monotone"
                        dataKey="npsFiltered"
                        name="NPS Filtrado"
                        stroke="#ff8080"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                        strokeDasharray="5 3"
                      />
                    )}
                    {hasFiltersActive && <Legend wrapperStyle={{ fontSize: 12 }} />}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* AI Summary placeholder */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#383838] flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-purple-500" />
                Resumen IA
              </h3>
              <div className="relative group">
                <button
                  disabled
                  className="text-xs font-medium bg-gray-100 text-gray-400 rounded-md px-3 py-1.5 cursor-not-allowed"
                >
                  Analizar
                </button>
                <span className="absolute bottom-full right-0 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                  Próximamente
                </span>
              </div>
            </div>
            <div className="flex items-center justify-center py-8 text-gray-300 text-sm">
              El análisis de IA de las respuestas NPS aparecerá aquí
            </div>
          </div>
        </div>
      )}

      {/* =================== RESUMEN VIEW =================== */}
      {view === 'resumen' && (
        <div className="space-y-5">
          {/* Period selector */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Period type toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {([['q', 'Trimestre'], ['month', 'Mes'], ['custom', 'Personalizado']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setResumenPeriod(key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    resumenPeriod === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Quarter dropdown */}
            {resumenPeriod === 'q' && (
              <select
                value={resumenQ}
                onChange={e => setResumenQ(e.target.value)}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-[#383838] focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
              >
                {availableQuarters.map(q => (
                  <option key={q} value={q}>{q.replace('-', ' ')}</option>
                ))}
              </select>
            )}

            {/* Month nav arrows */}
            {resumenPeriod === 'month' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { const d = new Date(resumenMonth); d.setMonth(d.getMonth() - 1); setResumenMonth(d); }}
                  className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-700 min-w-[160px] text-center capitalize">
                  {resumenMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => { const d = new Date(resumenMonth); d.setMonth(d.getMonth() + 1); setResumenMonth(d); }}
                  disabled={resumenMonth.getMonth() === new Date().getMonth() && resumenMonth.getFullYear() === new Date().getFullYear()}
                  className={`p-1.5 rounded-md border border-gray-200 transition-colors ${
                    resumenMonth.getMonth() === new Date().getMonth() && resumenMonth.getFullYear() === new Date().getFullYear() ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'
                  }`}
                >
                  <ChevronRightIcon className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            )}

            {/* Custom date inputs */}
            {resumenPeriod === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={resumenCustomDesde}
                  onChange={e => setResumenCustomDesde(e.target.value)}
                  className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-[#383838] focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
                />
                <span className="text-xs text-gray-400">—</span>
                <input
                  type="date"
                  value={resumenCustomHasta}
                  onChange={e => setResumenCustomHasta(e.target.value)}
                  className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-[#383838] focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
                />
              </div>
            )}

            {/* Period label + count */}
            <span className="text-sm font-bold text-[#3c527a]">{resumenRange.label}</span>
            <span className="text-xs text-gray-400">
              ({resumenData.filter(r => r.score != null).length} respuestas)
            </span>
          </div>

          {/* Period KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">NPS del período</p>
              <span className={`text-3xl font-bold ${npsColor(resumenNPS)}`}>
                {resumenNPS !== null ? resumenNPS : '—'}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total respuestas</p>
              <span className="text-3xl font-bold text-[#383838]">{resumenData.filter(r => r.score != null).length}</span>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Distribución del período</p>
              {resumenData.length === 0 ? (
                <span className="text-sm text-gray-400">Sin datos</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                    {resumenDistribution.promoters}% P
                  </span>
                  <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs font-medium">
                    {resumenDistribution.passives}% N
                  </span>
                  <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-medium">
                    {resumenDistribution.detractors}% D
                  </span>
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">NPS del mes</p>
              <span className={`text-3xl font-bold ${npsColor(monthNPS)}`}>
                {monthNPS !== null ? monthNPS : '—'}
              </span>
              {monthNPS !== null && (
                <p className="text-xs text-gray-400 mt-1">{monthData.length} respuestas</p>
              )}
            </div>
          </div>

          {/* NPS trend chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-[#383838] mb-4">Tendencia NPS (últimas 12 semanas)</h3>
            {trendData.every(d => d.nps === null) ? (
              <p className="text-sm text-gray-400 text-center py-10">Sin datos suficientes</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[-100, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="nps"
                    name="NPS Global"
                    stroke="#3c527a"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                  {hasFiltersActive && (
                    <Line
                      type="monotone"
                      dataKey="npsFiltered"
                      name="NPS Filtrado"
                      stroke="#ff8080"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                      strokeDasharray="5 3"
                    />
                  )}
                  {hasFiltersActive && <Legend wrapperStyle={{ fontSize: 12 }} />}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* NPS by country table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-[#383838]">NPS por país — {resumenRange.label}</h3>
            </div>
            {resumenCountryNPS.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Sin datos para el período</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60 text-xs uppercase tracking-wider text-gray-500">
                      <th className="text-left px-5 py-3 font-medium">País</th>
                      <th className="text-center px-4 py-3 font-medium">NPS</th>
                      <th className="text-center px-4 py-3 font-medium">Respuestas</th>
                      <th className="text-center px-4 py-3 font-medium">
                        <span className="text-green-600">Promotores</span>
                      </th>
                      <th className="text-center px-4 py-3 font-medium">
                        <span className="text-yellow-600">Pasivos</span>
                      </th>
                      <th className="text-center px-4 py-3 font-medium">
                        <span className="text-red-600">Detractores</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenCountryNPS.map(row => (
                      <tr key={row.pais} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-medium text-[#383838]">{row.pais}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold ${npsColor(row.nps)}`}>
                            {row.nps !== null ? row.nps : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{row.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-xs font-medium min-w-[32px]">
                            {row.promoters}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-yellow-50 text-yellow-700 px-2 py-0.5 text-xs font-medium min-w-[32px]">
                            {row.passives}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-xs font-medium min-w-[32px]">
                            {row.detractors}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-5 py-3 text-[#383838]">Total</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${npsColor(resumenNPS)}`}>
                          {resumenNPS !== null ? resumenNPS : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {resumenCountryNPS.reduce((s, r) => s + r.total, 0)}
                      </td>
                      <td className="px-4 py-3 text-center text-green-700">
                        {resumenCountryNPS.reduce((s, r) => s + r.promoters, 0)}
                      </td>
                      <td className="px-4 py-3 text-center text-yellow-700">
                        {resumenCountryNPS.reduce((s, r) => s + r.passives, 0)}
                      </td>
                      <td className="px-4 py-3 text-center text-red-700">
                        {resumenCountryNPS.reduce((s, r) => s + r.detractors, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== DATABASE VIEW =================== */}
      {view === 'database' && (
        <div className="space-y-4">
          {/* Summary line */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{databaseData.length} respuestas totales</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Ordenar:</span>
              <select
                value={`${sortField}-${sortDir}`}
                onChange={e => {
                  const [f, d] = e.target.value.split('-') as [SortField, SortDir]
                  setSortField(f); setSortDir(d)
                }}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
              >
                <option value="fecha-desc">Más recientes</option>
                <option value="fecha-asc">Más antiguos</option>
                <option value="score-desc">Mayor score</option>
                <option value="score-asc">Menor score</option>
                <option value="pais-asc">País A-Z</option>
              </select>
            </div>
          </div>

          {databaseData.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-gray-400 text-sm">Sin respuestas NPS</p>
            </div>
          ) : (
            <>
              {/* Card-style responses */}
              <div className="space-y-2">
                {pagedData.map(r => {
                  const hasScore = r.score != null
                  const hasFeedback = !!(r.como_mejorar || r.principal_beneficio)
                  return (
                    <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3.5 hover:border-gray-200 transition-colors">
                      <div className="flex items-start gap-4">
                        {/* Score badge */}
                        <div className="flex-shrink-0 pt-0.5">
                          {hasScore ? (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${scoreBadgeClasses(r.score!)}`}>
                              {r.score}
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-gray-100 text-gray-400">
                              ?
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-medium text-sm text-[#383838]">{r.nombre_apellido || 'Sin nombre'}</span>
                            <span className="text-xs text-gray-400">{formatDateShort(r.fecha)}</span>
                            {r.pais && (
                              <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{r.pais}</span>
                            )}
                            {r.suscripcion && (
                              <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{r.suscripcion}</span>
                            )}
                          </div>
                          {hasFeedback && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-1.5">
                              {r.principal_beneficio && (
                                <div>
                                  <span className="text-xs text-green-600 font-medium">Beneficio: </span>
                                  <span className="text-xs text-gray-600">{r.principal_beneficio}</span>
                                </div>
                              )}
                              {r.como_mejorar && (
                                <div>
                                  <span className="text-xs text-orange-600 font-medium">Mejorar: </span>
                                  <span className="text-xs text-gray-600">{r.como_mejorar}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-gray-500">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, databaseData.length)} de {databaseData.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    <span className="text-xs text-gray-500 px-2">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
