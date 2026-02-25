'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { ProductInitiative } from '@/lib/types'
import Modal from '@/components/Modal'
import { toast } from 'sonner'

interface FinalizeModalProps {
  initiative: ProductInitiative
  onClose: () => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onRefresh: () => Promise<void>
}

export default function FinalizeModal({ initiative, onClose, onUpdate, onRefresh }: FinalizeModalProps) {
  const { supabase, user } = useAuth()

  const [title, setTitle] = useState(initiative.title)
  const [description, setDescription] = useState(buildDescription(initiative))
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  const handleFinalize = async () => {
    if (!supabase || !user) return

    setSaving(true)
    try {
      // 1. Update initiative to finalized
      await onUpdate(initiative.id, { phase: 'finalized' })

      // 2. Create calendar event with correct company_events schema
      const videoLink = extractUrl(initiative.problem_statement || '')
      const { error } = await supabase
        .from('company_events')
        .insert({
          title: title.trim(),
          description: description.trim(),
          start_date: eventDate,
          end_date: null,
          team: 'Producto',
          user_id: user.id,
          is_draft: false,
          ...(videoLink ? { video_link: videoLink } : {}),
          custom_data: {
            initiative_id: initiative.id,
            source: 'producto_module',
          },
        })

      if (error) throw error

      toast.success('Iniciativa finalizada y evento creado en el calendario')
      await onRefresh()
      onClose()
    } catch (err: any) {
      toast.error('Error: ' + err.message)
    }
    setSaving(false)
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-1" style={{ color: '#383838' }}>
          Finalizar y Anunciar
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Esto marcará la iniciativa como finalizada y creará un evento en el calendario de la empresa.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Título del evento</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full mt-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Fecha del evento</label>
            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              className="w-full mt-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Descripción</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={8}
              className="w-full mt-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleFinalize}
              disabled={!title.trim() || saving}
              className="flex-1 py-2.5 rounded-md text-white font-medium text-sm transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#22c55e' }}
            >
              {saving ? 'Publicando...' : '📅 Publicar Evento en Calendario'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-md text-sm border hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/)
  return match ? match[0] : null
}

function buildDescription(initiative: ProductInitiative): string {
  const parts: string[] = []

  if (initiative.problem_statement) {
    parts.push(`Problema: ${initiative.problem_statement}`)
  }

  const exp = initiative.experiment_data || {}
  if (exp.hypothesis) {
    parts.push(`Hipótesis: ${exp.hypothesis}`)
  }
  if (exp.result) {
    const resultLabel = exp.result === 'won' ? 'Ganado' : exp.result === 'lost' ? 'Perdido' : 'Inconcluso'
    parts.push(`Resultado del experimento: ${resultLabel}`)
  }
  if (exp.metric_base && exp.metric_target) {
    parts.push(`Métricas: ${exp.metric_base} → ${exp.metric_target}`)
  }
  if (exp.next_steps) {
    const stepsLabel: Record<string, string> = { discard: 'Descartar', scale: 'Escalar a todos', iterate: 'Iterar' }
    parts.push(`Próximos pasos: ${stepsLabel[exp.next_steps] || exp.next_steps}`)
  }

  return parts.join('\n\n')
}
