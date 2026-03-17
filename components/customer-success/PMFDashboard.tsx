'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  FunnelIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

// --------------- Types ---------------

interface PMFResponse {
  id: string
  bubble_id: string
  fecha: string
  nombre_apellido: string
  email: string
  pais: string
  telefono: string
  suscripcion: string
  sentimiento_sin_califica: string
  razon_sentimiento: string
  alternativa: string
  lo_mejor: string
  funcionalidad_faltante: string
  como_mejorar: string
  puesto_trabajo: string
  synced_at: string
}

type SortField = 'fecha' | 'sentimiento' | 'pais'
type SortDir = 'asc' | 'desc'
type ViewMode = 'dashboard' | 'resumen' | 'database'

// --------------- Helpers ---------------

function dateOnly(d: string): string {
  return (d || '').slice(0, 10)
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getCurrentWeekStart(): Date {
  return getMonday(new Date())
}

function formatWeekRange(start: Date): string {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${start.toLocaleDateString('es-ES', opts)} - ${end.toLocaleDateString('es-ES', opts)}, ${end.getFullYear()}`
}

function dateToISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getWeekRange(weekStart: Date): { start: string; end: string } {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  return { start: localDateStr(weekStart), end: localDateStr(end) }
}

function getMonthRange(refDate: Date): { start: string; end: string } {
  const year = refDate.getFullYear()
  const month = refDate.getMonth()
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return { start: localDateStr(start), end: localDateStr(end) }
}

function getQuarterRange(refDate: Date): { start: string; end: string; label: string } {
  const year = refDate.getFullYear()
  const month = refDate.getMonth()
  const q = Math.floor(month / 3)
  const start = new Date(year, q * 3, 1)
  const end = new Date(year, q * 3 + 3, 0)
  return { start: localDateStr(start), end: localDateStr(end), label: `Q${q + 1} ${year}` }
}

function isInWeekRange(fechaStr: string, weekStart: Date): boolean {
  const wr = getWeekRange(weekStart)
  const d = dateOnly(fechaStr)
  return d >= wr.start && d <= wr.end
}

const SENTIMIENTO_ORDER: Record<string, number> = {
  'Muy decepcionado': 0,
  'Algo decepcionado': 1,
  'No decepcionado': 2,
}

const SENTIMIENTO_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Muy decepcionado': { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  'Algo decepcionado': { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  'No decepcionado': { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
}

function pmfScoreColor(score: number): string {
  if (score >= 40) return 'text-green-600'
  if (score >= 30) return 'text-yellow-600'
  return 'text-red-600'
}

function pmfScoreBg(score: number): string {
  if (score >= 40) return 'bg-green-50 border-green-200'
  if (score >= 30) return 'bg-yellow-50 border-yellow-200'
  return 'bg-red-50 border-red-200'
}

// --------------- Component ---------------

export default function PMFDashboard() {
  const { supabase } = useAuth()

  // Data
  const [allResponses, setAllResponses] = useState<PMFResponse[]>([])
  const [loading, setLoading] = useState(true)

  // View
  const [view, setView] = useState<ViewMode>('dashboard')

  // Filters
  const [weekStart, setWeekStart] = useState<Date>(getCurrentWeekStart())
  const [filterPais, setFilterPais] = useState<string>('')
  const [filterSuscripcion, setFilterSuscripcion] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Database view state
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [dbFechaDesde, setDbFechaDesde] = useState('')
  const [dbFechaHasta, setDbFechaHasta] = useState('')

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

  const PAGE_SIZE = 20

  // --------------- Data fetch ---------------

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data, error } = await supabase
        .from('pmf_responses')
        .select('*')
        .order('fecha', { ascending: false })

      if (error) {
        toast.error('Error al cargar encuestas PMF')
        console.error(error)
      } else {
        setAllResponses(data || [])
      }
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  // --------------- Derived values ---------------

  const paisOptions = useMemo(() => {
    const set = new Set<string>()
    allResponses.forEach(r => { if (r.pais) set.add(r.pais) })
    return Array.from(set).sort()
  }, [allResponses])

  const suscripcionOptions = useMemo(() => {
    const set = new Set<string>()
    allResponses.forEach(r => { if (r.suscripcion) set.add(r.suscripcion) })
    return Array.from(set).sort()
  }, [allResponses])

  // Apply global filters (pais + suscripcion)
  const globalFiltered = useMemo(() => {
    return allResponses.filter(r => {
      if (filterPais && r.pais !== filterPais) return false
      if (filterSuscripcion && r.suscripcion !== filterSuscripcion) return false
      return true
    })
  }, [allResponses, filterPais, filterSuscripcion])

  // Week-filtered data for dashboard
  const weekData = useMemo(() => {
    return globalFiltered.filter(r => isInWeekRange(r.fecha, weekStart))
  }, [globalFiltered, weekStart])

  // Previous week data for trend
  const prevWeekStart = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    return d
  }, [weekStart])

  const prevWeekData = useMemo(() => {
    return globalFiltered.filter(r => isInWeekRange(r.fecha, prevWeekStart))
  }, [globalFiltered, prevWeekStart])

  // PMF score for a set of responses
  const calcPMF = useCallback((responses: PMFResponse[]) => {
    if (responses.length === 0) return 0
    const muy = responses.filter(r => r.sentimiento_sin_califica === 'Muy decepcionado').length
    return (muy / responses.length) * 100
  }, [])

  // Month & Quarter data
  const monthData = useMemo(() => {
    const mr = getMonthRange(weekStart)
    return globalFiltered.filter(r => {
      const d = dateOnly(r.fecha)
      return d >= mr.start && d <= mr.end
    })
  }, [globalFiltered, weekStart])

  const quarterInfo = useMemo(() => getQuarterRange(weekStart), [weekStart])
  const quarterData = useMemo(() => {
    return globalFiltered.filter(r => {
      const d = dateOnly(r.fecha)
      return d >= quarterInfo.start && d <= quarterInfo.end
    })
  }, [globalFiltered, quarterInfo])

  const currentPMF = useMemo(() => calcPMF(weekData), [calcPMF, weekData])
  const prevPMF = useMemo(() => calcPMF(prevWeekData), [calcPMF, prevWeekData])
  const pmfDelta = currentPMF - prevPMF
  const monthPMF = useMemo(() => calcPMF(monthData), [calcPMF, monthData])
  const quarterPMF = useMemo(() => calcPMF(quarterData), [calcPMF, quarterData])

  // Sentiment distribution for week
  const sentimientoCounts = useMemo(() => {
    const counts = { 'Muy decepcionado': 0, 'Algo decepcionado': 0, 'No decepcionado': 0 }
    weekData.forEach(r => {
      const s = r.sentimiento_sin_califica as keyof typeof counts
      if (s in counts) counts[s]++
    })
    return counts
  }, [weekData])

  // Sentiment distribution for quarter
  const quarterSentimientoCounts = useMemo(() => {
    const counts = { 'Muy decepcionado': 0, 'Algo decepcionado': 0, 'No decepcionado': 0 }
    quarterData.forEach(r => {
      const s = r.sentimiento_sin_califica as keyof typeof counts
      if (s in counts) counts[s]++
    })
    return counts
  }, [quarterData])

  // Country breakdown for quarter (Resumen view)
  const quarterCountryBreakdown = useMemo(() => {
    const map: Record<string, { total: number; muy: number; algo: number; no: number }> = {}
    quarterData.forEach(r => {
      const pais = r.pais || 'Sin país'
      if (!map[pais]) map[pais] = { total: 0, muy: 0, algo: 0, no: 0 }
      map[pais].total++
      if (r.sentimiento_sin_califica === 'Muy decepcionado') map[pais].muy++
      else if (r.sentimiento_sin_califica === 'Algo decepcionado') map[pais].algo++
      else map[pais].no++
    })
    return Object.entries(map)
      .map(([pais, d]) => ({
        pais,
        total: d.total,
        pmf: d.total > 0 ? (d.muy / d.total) * 100 : 0,
        pctMuy: d.total > 0 ? (d.muy / d.total) * 100 : 0,
        pctAlgo: d.total > 0 ? (d.algo / d.total) * 100 : 0,
        pctNo: d.total > 0 ? (d.no / d.total) * 100 : 0,
        muy: d.muy,
        algo: d.algo,
        no: d.no,
      }))
      .sort((a, b) => b.total - a.total)
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
    // Quarter from dropdown
    const [yearStr, qStr] = resumenQ.split('-Q')
    const year = parseInt(yearStr)
    const q = parseInt(qStr) - 1
    const start = new Date(year, q * 3, 1)
    const end = new Date(year, q * 3 + 3, 0)
    return { start: localDateStr(start), end: localDateStr(end), label: resumenQ.replace('-', ' ') }
  }, [resumenPeriod, resumenQ, resumenCustomDesde, resumenCustomHasta, resumenMonth])

  const resumenData = useMemo(() => {
    return globalFiltered.filter(r => {
      const d = dateOnly(r.fecha)
      return d >= resumenRange.start && d <= resumenRange.end
    })
  }, [globalFiltered, resumenRange])

  const resumenPMF = useMemo(() => calcPMF(resumenData), [calcPMF, resumenData])

  const resumenSentimientoCounts = useMemo(() => {
    const counts = { 'Muy decepcionado': 0, 'Algo decepcionado': 0, 'No decepcionado': 0 }
    resumenData.forEach(r => {
      const s = r.sentimiento_sin_califica as keyof typeof counts
      if (s in counts) counts[s]++
    })
    return counts
  }, [resumenData])

  const resumenCountryBreakdown = useMemo(() => {
    const map: Record<string, { total: number; muy: number; algo: number; no: number }> = {}
    resumenData.forEach(r => {
      const pais = r.pais || 'Sin país'
      if (!map[pais]) map[pais] = { total: 0, muy: 0, algo: 0, no: 0 }
      map[pais].total++
      if (r.sentimiento_sin_califica === 'Muy decepcionado') map[pais].muy++
      else if (r.sentimiento_sin_califica === 'Algo decepcionado') map[pais].algo++
      else map[pais].no++
    })
    return Object.entries(map)
      .map(([pais, d]) => ({
        pais,
        total: d.total,
        pmf: d.total > 0 ? (d.muy / d.total) * 100 : 0,
        pctMuy: d.total > 0 ? (d.muy / d.total) * 100 : 0,
        pctAlgo: d.total > 0 ? (d.algo / d.total) * 100 : 0,
        pctNo: d.total > 0 ? (d.no / d.total) * 100 : 0,
        muy: d.muy,
        algo: d.algo,
        no: d.no,
      }))
      .sort((a, b) => b.total - a.total)
  }, [resumenData])

  // Available quarters for dropdown
  const availableQuarters = useMemo(() => {
    const qs = new Set<string>()
    for (const r of allResponses) {
      const d = dateOnly(r.fecha)
      if (!d) continue
      const [y, m] = d.split('-').map(Number)
      const q = Math.floor((m - 1) / 3) + 1
      qs.add(`${y}-Q${q}`)
    }
    return Array.from(qs).sort().reverse()
  }, [allResponses])

  // 12-week trend data
  const trendData = useMemo(() => {
    const weeks: { label: string; weekStart: Date; pmf: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const ws = new Date(weekStart)
      ws.setDate(ws.getDate() - i * 7)
      const wsMonday = getMonday(ws)
      const weekResponses = globalFiltered.filter(r => isInWeekRange(r.fecha, wsMonday))
      const pmf = weekResponses.length > 0
        ? (weekResponses.filter(r => r.sentimiento_sin_califica === 'Muy decepcionado').length / weekResponses.length) * 100
        : 0
      const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
      weeks.push({
        label: wsMonday.toLocaleDateString('es-ES', opts),
        weekStart: wsMonday,
        pmf: Math.round(pmf * 10) / 10,
      })
    }
    return weeks
  }, [weekStart, globalFiltered])

  // Country breakdown
  const countryBreakdown = useMemo(() => {
    const map: Record<string, { total: number; muy: number; algo: number; no: number }> = {}
    weekData.forEach(r => {
      const pais = r.pais || 'Sin país'
      if (!map[pais]) map[pais] = { total: 0, muy: 0, algo: 0, no: 0 }
      map[pais].total++
      if (r.sentimiento_sin_califica === 'Muy decepcionado') map[pais].muy++
      else if (r.sentimiento_sin_califica === 'Algo decepcionado') map[pais].algo++
      else map[pais].no++
    })
    return Object.entries(map)
      .map(([pais, d]) => ({
        pais,
        total: d.total,
        pctMuy: d.total > 0 ? (d.muy / d.total) * 100 : 0,
        pctAlgo: d.total > 0 ? (d.algo / d.total) * 100 : 0,
        pctNo: d.total > 0 ? (d.no / d.total) * 100 : 0,
      }))
      .sort((a, b) => b.pctMuy - a.pctMuy)
  }, [weekData])

  // --------------- Database view data ---------------

  const dbFiltered = useMemo(() => {
    let data = globalFiltered
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      data = data.filter(r =>
        (r.nombre_apellido || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q)
      )
    }
    // Date range filter
    if (dbFechaDesde) {
      data = data.filter(r => dateOnly(r.fecha) >= dbFechaDesde)
    }
    if (dbFechaHasta) {
      data = data.filter(r => dateOnly(r.fecha) <= dbFechaHasta)
    }
    // Sort
    data = [...data].sort((a, b) => {
      let cmp = 0
      if (sortField === 'fecha') {
        cmp = dateOnly(a.fecha).localeCompare(dateOnly(b.fecha))
      } else if (sortField === 'sentimiento') {
        cmp = (SENTIMIENTO_ORDER[a.sentimiento_sin_califica] ?? 3) - (SENTIMIENTO_ORDER[b.sentimiento_sin_califica] ?? 3)
      } else if (sortField === 'pais') {
        cmp = (a.pais || '').localeCompare(b.pais || '')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return data
  }, [globalFiltered, searchQuery, dbFechaDesde, dbFechaHasta, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(dbFiltered.length / PAGE_SIZE))
  const pagedData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return dbFiltered.slice(start, start + PAGE_SIZE)
  }, [dbFiltered, page])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [filterPais, filterSuscripcion, searchQuery, dbFechaDesde, dbFechaHasta, sortField, sortDir])

  // --------------- Export CSV ---------------

  const exportCSV = useCallback(() => {
    const headers = ['Fecha', 'Nombre', 'Email', 'País', 'Suscripción', 'Sentimiento', 'Razón sentimiento', 'Alternativa', 'Lo mejor', 'Funcionalidad faltante', 'Cómo mejorar', 'Puesto de trabajo', 'Teléfono']
    const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`
    const rows = dbFiltered.map(r => [
      r.fecha, escape(r.nombre_apellido), escape(r.email), escape(r.pais),
      escape(r.suscripcion), escape(r.sentimiento_sin_califica), escape(r.razon_sentimiento),
      escape(r.alternativa), escape(r.lo_mejor), escape(r.funcionalidad_faltante),
      escape(r.como_mejorar), escape(r.puesto_trabajo), escape(r.telefono),
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pmf_responses_${dateToISODate(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exportado')
  }, [dbFiltered])

  // --------------- Sort handler ---------------

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'fecha' ? 'desc' : 'asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDownIcon className="w-3 h-3 text-gray-300 ml-1 inline" />
    return sortDir === 'asc'
      ? <ChevronUpIcon className="w-3 h-3 text-gray-600 ml-1 inline" />
      : <ChevronDownIcon className="w-3 h-3 text-gray-600 ml-1 inline" />
  }

  // --------------- Week navigation ---------------

  const goWeekBack = () => {
    const prev = new Date(weekStart)
    prev.setDate(prev.getDate() - 7)
    setWeekStart(prev)
  }

  const goWeekForward = () => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    const now = getCurrentWeekStart()
    if (next <= now) setWeekStart(next)
  }

  const isCurrentWeek = weekStart.getTime() === getCurrentWeekStart().getTime()

  // --------------- Render ---------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3c527a]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header: toggle + filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'dashboard' as const, label: 'Dashboard' },
            { key: 'resumen' as const, label: 'Resumen' },
            { key: 'database' as const, label: 'Base de datos' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                view === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <FunnelIcon className="w-4 h-4 text-gray-400" />
          <select
            value={filterPais}
            onChange={e => setFilterPais(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
          >
            <option value="">Todos los países</option>
            {paisOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filterSuscripcion}
            onChange={e => setFilterSuscripcion(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
          >
            <option value="">Todas las suscripciones</option>
            {suscripcionOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {(filterPais || filterSuscripcion) && (
            <button
              onClick={() => { setFilterPais(''); setFilterSuscripcion('') }}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {view === 'dashboard' && (
        <DashboardView
          weekStart={weekStart}
          isCurrentWeek={isCurrentWeek}
          goWeekBack={goWeekBack}
          goWeekForward={goWeekForward}
          setWeekStart={setWeekStart}
          weekData={weekData}
          currentPMF={currentPMF}
          prevPMF={prevPMF}
          pmfDelta={pmfDelta}
          monthPMF={monthPMF}
          monthData={monthData}
          prevWeekData={prevWeekData}
          sentimientoCounts={sentimientoCounts}
          trendData={trendData}
          countryBreakdown={countryBreakdown}
          setFilterPais={setFilterPais}
        />
      )}

      {view === 'resumen' && (
        <ResumenView
          resumenPeriod={resumenPeriod}
          setResumenPeriod={setResumenPeriod}
          resumenQ={resumenQ}
          setResumenQ={setResumenQ}
          resumenCustomDesde={resumenCustomDesde}
          setResumenCustomDesde={setResumenCustomDesde}
          resumenCustomHasta={resumenCustomHasta}
          setResumenCustomHasta={setResumenCustomHasta}
          availableQuarters={availableQuarters}
          resumenRange={resumenRange}
          resumenData={resumenData}
          resumenPMF={resumenPMF}
          resumenSentimientoCounts={resumenSentimientoCounts}
          resumenCountryBreakdown={resumenCountryBreakdown}
          monthPMF={monthPMF}
          monthData={monthData}
          trendData={trendData}
          globalFiltered={globalFiltered}
          setFilterPais={setFilterPais}
          resumenMonth={resumenMonth}
          setResumenMonth={setResumenMonth}
        />
      )}

      {view === 'database' && (
        <DatabaseView
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          dbFechaDesde={dbFechaDesde}
          setDbFechaDesde={setDbFechaDesde}
          dbFechaHasta={dbFechaHasta}
          setDbFechaHasta={setDbFechaHasta}
          pagedData={pagedData}
          dbFilteredLength={dbFiltered.length}
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          handleSort={handleSort}
          SortIcon={SortIcon}
          expandedRow={expandedRow}
          setExpandedRow={setExpandedRow}
          exportCSV={exportCSV}
        />
      )}
    </div>
  )
}

// --------------- Dashboard View ---------------

function DashboardView({
  weekStart, isCurrentWeek, goWeekBack, goWeekForward, setWeekStart,
  weekData, currentPMF, prevPMF, pmfDelta, monthPMF, monthData, prevWeekData, sentimientoCounts,
  trendData, countryBreakdown, setFilterPais,
}: {
  weekStart: Date
  isCurrentWeek: boolean
  goWeekBack: () => void
  goWeekForward: () => void
  setWeekStart: (d: Date) => void
  weekData: PMFResponse[]
  currentPMF: number
  prevPMF: number
  pmfDelta: number
  monthPMF: number
  monthData: PMFResponse[]
  prevWeekData: PMFResponse[]
  sentimientoCounts: Record<string, number>
  trendData: { label: string; pmf: number }[]
  countryBreakdown: { pais: string; total: number; pctMuy: number; pctAlgo: number; pctNo: number }[]
  setFilterPais: (p: string) => void
}) {
  return (
    <div className="space-y-6">
      {/* Week Selector */}
      <div className="flex items-center gap-3">
        <button onClick={goWeekBack} className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
          <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">
          {formatWeekRange(weekStart)}
        </span>
        <button
          onClick={goWeekForward}
          disabled={isCurrentWeek}
          className={`p-1.5 rounded-md border border-gray-200 transition-colors ${isCurrentWeek ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
        >
          <ChevronRightIcon className="w-4 h-4 text-gray-600" />
        </button>
        {!isCurrentWeek && (
          <button onClick={() => setWeekStart(getCurrentWeekStart())} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Hoy
          </button>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* PMF Score */}
        <div className={`rounded-xl p-6 border shadow-sm ${pmfScoreBg(currentPMF)}`}>
          <p className="text-sm font-medium text-gray-500 mb-1">PMF Score</p>
          <div className="flex items-baseline gap-2">
            <h3 className={`text-4xl font-bold tracking-tight ${pmfScoreColor(currentPMF)}`}>
              {weekData.length > 0 ? `${currentPMF.toFixed(1)}%` : '—'}
            </h3>
            {weekData.length > 0 && prevWeekData.length > 0 && (
              <div className={`flex items-center text-xs font-medium ${pmfDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {pmfDelta >= 0
                  ? <ArrowTrendingUpIcon className="w-3.5 h-3.5 mr-0.5" />
                  : <ArrowTrendingDownIcon className="w-3.5 h-3.5 mr-0.5" />
                }
                {Math.abs(pmfDelta).toFixed(1)}pp
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">Meta: 40%</p>
        </div>

        {/* Total Responses */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <p className="text-sm font-medium text-gray-500 mb-1">Respuestas de la semana</p>
          <h3 className="text-4xl font-bold text-gray-900 tracking-tight">
            {weekData.length}
          </h3>
          <p className="text-xs text-gray-400 mt-2">
            Semana anterior: {prevWeekData.length}
          </p>
        </div>

        {/* Distribution */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <p className="text-sm font-medium text-gray-500 mb-3">Distribución</p>
          <div className="flex flex-col gap-2">
            {(['Muy decepcionado', 'Algo decepcionado', 'No decepcionado'] as const).map(s => {
              const count = sentimientoCounts[s] || 0
              const pct = weekData.length > 0 ? ((count / weekData.length) * 100).toFixed(1) : '0'
              const colors = SENTIMIENTO_COLORS[s]
              return (
                <div key={s} className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${colors.bg}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className={`text-xs font-medium ${colors.text}`}>{s}</span>
                  </div>
                  <span className={`text-xs font-semibold ${colors.text}`}>{count} ({pct}%)</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* PMF acumulado del mes */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <p className="text-sm font-medium text-gray-500 mb-1">PMF acumulado del mes</p>
          <h3 className={`text-4xl font-bold tracking-tight ${monthData.length > 0 ? pmfScoreColor(monthPMF) : 'text-gray-300'}`}>
            {monthData.length > 0 ? `${monthPMF.toFixed(1)}%` : '—'}
          </h3>
          {monthData.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">{monthData.length} respuestas</p>
          )}
        </div>
      </div>

      {/* PMF Trend Chart */}
      <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Tendencia PMF - Últimas 12 semanas</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#888' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#888' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'PMF Score']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
              />
              <ReferenceLine
                y={40}
                stroke="#22c55e"
                strokeDasharray="6 4"
                label={{ value: 'PMF 40%', position: 'right', fill: '#22c55e', fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="pmf"
                stroke="#3c527a"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#3c527a', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#3c527a' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Country Breakdown Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h4 className="text-sm font-semibold text-gray-700">Desglose por país</h4>
        </div>
        {countryBreakdown.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin datos para esta semana</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-6 py-3">País</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-right">% Muy decepcionado</th>
                  <th className="px-6 py-3 text-right">% Algo decepcionado</th>
                  <th className="px-6 py-3 text-right">% No decepcionado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {countryBreakdown.map(row => (
                  <tr
                    key={row.pais}
                    onClick={() => setFilterPais(row.pais)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3 font-medium text-gray-900">{row.pais}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{row.total}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`font-semibold ${pmfScoreColor(row.pctMuy)}`}>
                        {row.pctMuy.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-yellow-600">{row.pctAlgo.toFixed(1)}%</td>
                    <td className="px-6 py-3 text-right text-gray-500">{row.pctNo.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Summary Placeholder */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-[#3c527a]" />
            <h4 className="text-sm font-semibold text-gray-700">Resumen IA</h4>
          </div>
          <div className="relative group">
            <button
              disabled
              className="px-4 py-1.5 text-sm font-medium rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed"
            >
              Analizar
            </button>
            <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Próximamente
            </div>
          </div>
        </div>
        <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-sm text-gray-400">El análisis automático estará disponible próximamente</p>
        </div>
      </div>
    </div>
  )
}

// --------------- Resumen View (Period filters) ---------------

function ResumenView({
  resumenPeriod, setResumenPeriod, resumenQ, setResumenQ,
  resumenCustomDesde, setResumenCustomDesde, resumenCustomHasta, setResumenCustomHasta,
  availableQuarters, resumenRange, resumenData, resumenPMF, resumenSentimientoCounts,
  resumenCountryBreakdown, monthPMF, monthData, trendData, globalFiltered, setFilterPais,
  resumenMonth, setResumenMonth,
}: {
  resumenPeriod: 'q' | 'month' | 'custom'
  setResumenPeriod: (p: 'q' | 'month' | 'custom') => void
  resumenQ: string
  setResumenQ: (q: string) => void
  resumenCustomDesde: string
  setResumenCustomDesde: (s: string) => void
  resumenCustomHasta: string
  setResumenCustomHasta: (s: string) => void
  availableQuarters: string[]
  resumenRange: { start: string; end: string; label: string }
  resumenData: PMFResponse[]
  resumenPMF: number
  resumenSentimientoCounts: Record<string, number>
  resumenCountryBreakdown: { pais: string; total: number; pmf: number; pctMuy: number; pctAlgo: number; pctNo: number; muy: number; algo: number; no: number }[]
  monthPMF: number
  monthData: PMFResponse[]
  trendData: { label: string; pmf: number }[]
  globalFiltered: PMFResponse[]
  setFilterPais: (p: string) => void
  resumenMonth: Date
  setResumenMonth: (d: Date) => void
}) {
  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-white rounded-lg border border-gray-200 p-1">
          <button
            onClick={() => setResumenPeriod('q')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              resumenPeriod === 'q' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
            style={resumenPeriod === 'q' ? { backgroundColor: '#3c527a' } : undefined}
          >
            Trimestre
          </button>
          <button
            onClick={() => setResumenPeriod('month')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              resumenPeriod === 'month' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
            style={resumenPeriod === 'month' ? { backgroundColor: '#3c527a' } : undefined}
          >
            Mes
          </button>
          <button
            onClick={() => setResumenPeriod('custom')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              resumenPeriod === 'custom' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
            style={resumenPeriod === 'custom' ? { backgroundColor: '#3c527a' } : undefined}
          >
            Personalizado
          </button>
        </div>

        {resumenPeriod === 'q' && (
          <select
            value={resumenQ}
            onChange={e => setResumenQ(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
          >
            {availableQuarters.map(q => (
              <option key={q} value={q}>{q.replace('-', ' ')}</option>
            ))}
          </select>
        )}

        {resumenPeriod === 'month' && (
          <div className="flex items-center gap-3">
            <button onClick={() => { const d = new Date(resumenMonth); d.setMonth(d.getMonth() - 1); setResumenMonth(d); }} className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50">
              <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-sm font-medium text-gray-700 capitalize">
              {resumenMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => { const d = new Date(resumenMonth); d.setMonth(d.getMonth() + 1); setResumenMonth(d); }} disabled={resumenMonth.getMonth() === new Date().getMonth() && resumenMonth.getFullYear() === new Date().getFullYear()} className={`p-1.5 rounded-md border border-gray-200 ${resumenMonth.getMonth() === new Date().getMonth() && resumenMonth.getFullYear() === new Date().getFullYear() ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
              <ChevronRightIcon className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}

        {resumenPeriod === 'custom' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Desde</label>
            <input type="date" value={resumenCustomDesde} onChange={e => setResumenCustomDesde(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300" />
            <label className="text-xs text-gray-500">Hasta</label>
            <input type="date" value={resumenCustomHasta} onChange={e => setResumenCustomHasta(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300" />
          </div>
        )}

        <span className="text-xs text-gray-400 ml-auto">
          {resumenRange.start} → {resumenRange.end} · {resumenData.length} respuestas
        </span>
      </div>

      {/* Period KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`rounded-xl p-5 border shadow-sm ${pmfScoreBg(resumenPMF)}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">PMF del período</p>
          <span className={`text-3xl font-bold ${resumenData.length > 0 ? pmfScoreColor(resumenPMF) : 'text-gray-300'}`}>
            {resumenData.length > 0 ? `${resumenPMF.toFixed(1)}%` : '—'}
          </span>
          <p className="text-xs text-gray-400 mt-2">Meta: 40%</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total respuestas</p>
          <span className="text-3xl font-bold text-[#383838]">{resumenData.length}</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Distribución del período</p>
          {resumenData.length === 0 ? (
            <span className="text-sm text-gray-400">Sin datos</span>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(['Muy decepcionado', 'Algo decepcionado', 'No decepcionado'] as const).map(s => {
                const count = resumenSentimientoCounts[s] || 0
                const pct = resumenData.length > 0 ? ((count / resumenData.length) * 100).toFixed(0) : '0'
                const colors = SENTIMIENTO_COLORS[s]
                return (
                  <div key={s} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      <span className={`text-xs ${colors.text}`}>{s}</span>
                    </div>
                    <span className={`text-xs font-semibold ${colors.text}`}>{count} ({pct}%)</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">PMF del mes</p>
          <span className={`text-3xl font-bold ${monthData.length > 0 ? pmfScoreColor(monthPMF) : 'text-gray-300'}`}>
            {monthData.length > 0 ? `${monthPMF.toFixed(1)}%` : '—'}
          </span>
          {monthData.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">{monthData.length} respuestas</p>
          )}
        </div>
      </div>

      {/* PMF trend chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Tendencia PMF (últimas 12 semanas)</h4>
        {trendData.every(d => d.pmf === 0) ? (
          <p className="text-sm text-gray-400 text-center py-10">Sin datos suficientes</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(value: number) => [`${value}%`, 'PMF Score']} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                <ReferenceLine y={40} stroke="#22c55e" strokeDasharray="6 4" label={{ value: 'PMF 40%', position: 'right', fill: '#22c55e', fontSize: 11 }} />
                <Line type="monotone" dataKey="pmf" stroke="#3c527a" strokeWidth={2.5} dot={{ r: 4, fill: '#3c527a', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#3c527a' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Country breakdown table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h4 className="text-sm font-semibold text-gray-700">PMF por país — {resumenRange.label}</h4>
        </div>
        {resumenCountryBreakdown.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin datos para este período</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-6 py-3">País</th>
                  <th className="px-4 py-3 text-center">PMF Score</th>
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3 text-center"><span className="text-green-600">Muy decep.</span></th>
                  <th className="px-4 py-3 text-center"><span className="text-yellow-600">Algo decep.</span></th>
                  <th className="px-4 py-3 text-center"><span className="text-gray-500">No decep.</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resumenCountryBreakdown.map(row => (
                  <tr
                    key={row.pais}
                    onClick={() => setFilterPais(row.pais)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3 font-medium text-gray-900">{row.pais}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${pmfScoreColor(row.pmf)}`}>{row.pmf.toFixed(1)}%</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.total}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-xs font-medium min-w-[32px]">
                        {row.muy} ({row.pctMuy.toFixed(0)}%)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-yellow-50 text-yellow-700 px-2 py-0.5 text-xs font-medium min-w-[32px]">
                        {row.algo} ({row.pctAlgo.toFixed(0)}%)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-gray-50 text-gray-600 px-2 py-0.5 text-xs font-medium min-w-[32px]">
                        {row.no} ({row.pctNo.toFixed(0)}%)
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-6 py-3 text-[#383838]">Total</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold ${pmfScoreColor(resumenPMF)}`}>{resumenPMF.toFixed(1)}%</span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{resumenData.length}</td>
                  <td className="px-4 py-3 text-center text-green-700">
                    {resumenCountryBreakdown.reduce((s, r) => s + r.muy, 0)}
                  </td>
                  <td className="px-4 py-3 text-center text-yellow-700">
                    {resumenCountryBreakdown.reduce((s, r) => s + r.algo, 0)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {resumenCountryBreakdown.reduce((s, r) => s + r.no, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// --------------- Database View ---------------

function DatabaseView({
  searchQuery, setSearchQuery, dbFechaDesde, setDbFechaDesde, dbFechaHasta, setDbFechaHasta,
  pagedData, dbFilteredLength, page, setPage, totalPages, handleSort, SortIcon,
  expandedRow, setExpandedRow, exportCSV,
}: {
  searchQuery: string
  setSearchQuery: (s: string) => void
  dbFechaDesde: string
  setDbFechaDesde: (s: string) => void
  dbFechaHasta: string
  setDbFechaHasta: (s: string) => void
  pagedData: PMFResponse[]
  dbFilteredLength: number
  page: number
  setPage: (p: number) => void
  totalPages: number
  handleSort: (f: SortField) => void
  SortIcon: React.FC<{ field: SortField }>
  expandedRow: string | null
  setExpandedRow: (id: string | null) => void
  exportCSV: () => void
}) {
  const selectedResponse = pagedData.find(r => r.id === expandedRow) || null

  return (
    <div className="space-y-4">
      {/* Search + Date filters + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Desde</label>
          <input
            type="date"
            value={dbFechaDesde}
            onChange={e => setDbFechaDesde(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
          />
          <label className="text-xs text-gray-500">Hasta</label>
          <input
            type="date"
            value={dbFechaHasta}
            onChange={e => setDbFechaHasta(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
          />
          {(dbFechaDesde || dbFechaHasta) && (
            <button
              onClick={() => { setDbFechaDesde(''); setDbFechaHasta('') }}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs text-gray-500">{dbFilteredLength} registros</span>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#3c527a] border border-[#3c527a] rounded-lg hover:bg-[#3c527a] hover:text-white transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('fecha')}>
                Fecha <SortIcon field="fecha" />
              </th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('pais')}>
                País <SortIcon field="pais" />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('sentimiento')}>
                Sentimiento <SortIcon field="sentimiento" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {pagedData.map(r => {
              const colors = SENTIMIENTO_COLORS[r.sentimiento_sin_califica] || SENTIMIENTO_COLORS['No decepcionado']
              const isSelected = expandedRow === r.id
              return (
                <tr
                  key={r.id}
                  onClick={() => setExpandedRow(isSelected ? null : r.id)}
                  className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-[#3c527a]' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{dateOnly(r.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[180px]">{r.nombre_apellido || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]">{r.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.pais || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                      {r.sentimiento_sin_califica || '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
            {pagedData.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-400">
                  No se encontraron registros
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              Mostrando {((page - 1) * 20) + 1}–{Math.min(page * 20, dbFilteredLength)} de {dbFilteredLength}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-md border border-gray-200 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
              </button>
              {generatePageNumbers(page, totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-xs">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                      page === p
                        ? 'bg-[#3c527a] text-white border-[#3c527a]'
                        : 'border-gray-200 text-gray-600 hover:bg-white'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-md border border-gray-200 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sidebar */}
      {selectedResponse && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setExpandedRow(null)}
          />
          <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto border-l border-gray-200">
            {/* Sidebar header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#383838]">{selectedResponse.nombre_apellido || 'Sin nombre'}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{dateOnly(selectedResponse.fecha)} · {selectedResponse.pais || 'Sin país'}</p>
              </div>
              <button
                onClick={() => setExpandedRow(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Info cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Email</p>
                  <p className="text-sm text-[#383838] break-all">{selectedResponse.email || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Teléfono</p>
                  <p className="text-sm text-[#383838]">{selectedResponse.telefono || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Suscripción</p>
                  <p className="text-sm text-[#383838]">{selectedResponse.suscripcion || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Puesto</p>
                  <p className="text-sm text-[#383838]">{selectedResponse.puesto_trabajo || '—'}</p>
                </div>
              </div>

              {/* Sentimiento */}
              {(() => {
                const colors = SENTIMIENTO_COLORS[selectedResponse.sentimiento_sin_califica] || SENTIMIENTO_COLORS['No decepcionado']
                return (
                  <div className={`rounded-lg p-4 ${colors.bg} border ${colors.bg.replace('bg-', 'border-').replace('-100', '-200')}`}>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Sentimiento</p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                      <span className={`text-sm font-semibold ${colors.text}`}>{selectedResponse.sentimiento_sin_califica}</span>
                    </div>
                    {selectedResponse.razon_sentimiento && (
                      <p className="text-sm text-gray-700 leading-relaxed">{selectedResponse.razon_sentimiento}</p>
                    )}
                  </div>
                )
              })()}

              {/* Preguntas abiertas */}
              <div className="space-y-4">
                <SidebarField
                  label="Si Califica no existiera, ¿qué usarías?"
                  value={selectedResponse.alternativa}
                  icon="swap"
                />
                <SidebarField
                  label="¿Qué es lo que más te gustó?"
                  value={selectedResponse.lo_mejor}
                  icon="heart"
                />
                <SidebarField
                  label="¿Qué funcionalidad falta?"
                  value={selectedResponse.funcionalidad_faltante}
                  icon="puzzle"
                />
                <SidebarField
                  label="¿Cómo podemos mejorar?"
                  value={selectedResponse.como_mejorar}
                  icon="lightbulb"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// --------------- Small helpers ---------------

const SIDEBAR_ICONS: Record<string, string> = {
  swap: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
  heart: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z',
  puzzle: 'M14.25 6.087c0-.355.313-.75.75-.75s.75.395.75.75v.75h2.25c.621 0 1.125.504 1.125 1.125v2.25h.75c.355 0 .75.313.75.75s-.395.75-.75.75h-.75v2.25c0 .621-.504 1.125-1.125 1.125h-2.25v.75c0 .355-.313.75-.75.75s-.75-.395-.75-.75v-.75h-2.25a1.125 1.125 0 01-1.125-1.125v-2.25h-.75c-.355 0-.75-.313-.75-.75s.395-.75.75-.75h.75v-2.25c0-.621.504-1.125 1.125-1.125h2.25v-.75z',
  lightbulb: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
}

function SidebarField({ label, value, icon }: { label: string; value: string; icon: string }) {
  if (!value) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={SIDEBAR_ICONS[icon] || SIDEBAR_ICONS.lightbulb} />
        </svg>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed pl-5">{value}</p>
    </div>
  )
}

function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | string)[] = [1]
  if (current > 3) pages.push('...')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}
