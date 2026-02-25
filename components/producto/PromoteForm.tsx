'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { ProductInitiative } from '@/lib/types'
import { toast } from 'sonner'

interface PromoteFormProps {
  initiative: ProductInitiative
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onCancel: () => void
  onRefresh: () => Promise<void>
}

type Member = { user_id: string; email: string }

export default function PromoteForm({ initiative, onUpdate, onCancel, onRefresh }: PromoteFormProps) {
  const { supabase } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [ownerId, setOwnerId] = useState(initiative.owner_id || '')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')
  const [via, setVia] = useState<'discovery' | 'delivery'>(
    initiative.item_type === 'experiment' ? 'discovery' : 'delivery'
  )
  const [promoting, setPromoting] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.rpc('get_all_members').then(({ data }) => {
      if (data) setMembers(data)
    })
  }, [supabase])

  // Set default end date to 2 weeks from start
  useEffect(() => {
    if (startDate && !endDate) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + 14)
      setEndDate(d.toISOString().split('T')[0])
    }
  }, [startDate, endDate])

  const handlePromote = async () => {
    if (!ownerId) {
      toast.error('Debes asignar un responsable')
      return
    }
    if (via === 'discovery' && !startDate) {
      toast.error('La fecha de inicio es requerida')
      return
    }

    setPromoting(true)
    await onUpdate(initiative.id, {
      phase: via,
      status: 'design',
      owner_id: ownerId,
      period_type: 'week',
      period_value: via === 'delivery'
        ? (endDate || '')
        : `${startDate} → ${endDate || '...'}`,
    })
    toast.success(`Promovido a ${via === 'discovery' ? 'Experimentos' : 'Roadmap'}`)
    await onRefresh()
    setPromoting(false)
    onCancel()
  }

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-gray-50">
      <h4 className="text-sm font-semibold text-gray-700">Promover a Roadmap</h4>

      {/* Owner (required) */}
      <div>
        <label className="text-xs text-gray-500">Responsable <span className="text-red-400">*</span></label>
        <select
          value={ownerId}
          onChange={e => setOwnerId(e.target.value)}
          className={`w-full mt-1 text-sm border rounded-md px-2 py-1.5 ${!ownerId ? 'border-red-300' : ''}`}
        >
          <option value="">Seleccionar responsable...</option>
          {members.map(m => (
            <option key={m.user_id} value={m.user_id}>{m.email}</option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div>
        <label className="text-xs text-gray-500">{via === 'delivery' ? 'Fecha fin estimado' : 'Periodo'}</label>
        {via === 'delivery' ? (
          <div className="mt-1">
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full border rounded-md px-2 py-1.5 text-sm"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <label className="text-[10px] text-gray-400">Inicio</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400">Fin estimado</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Via */}
      <div>
        <label className="text-xs text-gray-500">Vía</label>
        <div className="flex gap-3 mt-1">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              checked={via === 'discovery'}
              onChange={() => setVia('discovery')}
              className="accent-[#7c3aed]"
            />
            <span>Experimentos <span className="text-gray-400">(validar hipótesis)</span></span>
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              checked={via === 'delivery'}
              onChange={() => setVia('delivery')}
              className="accent-[#2563eb]"
            />
            <span>Roadmap <span className="text-gray-400">(construir)</span></span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handlePromote}
          disabled={promoting}
          className="flex-1 py-2 rounded-md text-white font-medium text-sm transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: '#3c527a' }}
        >
          {promoting ? 'Promoviendo...' : 'Confirmar'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-md text-sm border hover:bg-gray-100 transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
