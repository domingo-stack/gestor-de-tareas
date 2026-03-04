'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { ProductInitiative } from '@/lib/types'
import Modal from '@/components/Modal'
import UrlPreview from '@/components/UrlPreview'
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
  const [videoLink, setVideoLink] = useState(extractUrl(initiative.problem_statement || '') || '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault()
      const file = e.clipboardData.files[0]

      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        alert('Solo se admiten imagenes o videos.')
        return
      }

      if (!supabase) return

      try {
        setUploading(true)
        const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_')
        const fileName = `${Date.now()}_${cleanName}`

        const { error } = await supabase
          .storage
          .from('media-attachments')
          .upload(fileName, file)

        if (error) throw error

        const { data: urlData } = supabase
          .storage
          .from('media-attachments')
          .getPublicUrl(fileName)

        setVideoLink(urlData.publicUrl)
      } catch (error: any) {
        console.error('Upload error:', error)
        alert('Error al subir: ' + error.message)
      } finally {
        setUploading(false)
      }
    }
  }

  const handleFinalize = async () => {
    if (!supabase || !user) return

    setSaving(true)
    try {
      // 1. Update initiative to finalized
      await onUpdate(initiative.id, { phase: 'finalized' })

      // 2. Create calendar event with correct company_events schema
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
          ...(videoLink.trim() ? { video_link: videoLink.trim() } : {}),
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
          Esto marcara la iniciativa como finalizada y creara un evento en el calendario de la empresa.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Titulo del evento</label>
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
            <label className="text-sm font-medium text-gray-700">Descripcion</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              className="w-full mt-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">
              Video / Adjunto
              {uploading && <span className="ml-2 text-blue-500 italic animate-pulse text-xs font-normal">Subiendo archivo...</span>}
            </label>
            <div className="relative mt-1">
              <input
                type="url"
                value={videoLink}
                onChange={e => setVideoLink(e.target.value)}
                onPaste={handlePaste}
                disabled={uploading}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none pr-8 ${uploading ? 'bg-gray-100 cursor-wait' : ''}`}
                placeholder="Pega enlace o archivo (Ctrl+V)..."
              />
              <UrlPreview url={videoLink} onClear={() => setVideoLink('')} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Tip: Puedes pegar (Ctrl+V) una imagen o video directamente aqui.</p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleFinalize}
              disabled={!title.trim() || saving || uploading}
              className="flex-1 py-2.5 rounded-md text-white font-medium text-sm transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#22c55e' }}
            >
              {saving ? 'Publicando...' : 'Publicar Evento en Calendario'}
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
    parts.push(`Hipotesis: ${exp.hypothesis}`)
  }
  if (exp.result) {
    const resultLabel = exp.result === 'won' ? 'Ganado' : exp.result === 'lost' ? 'Perdido' : 'Inconcluso'
    parts.push(`Resultado del experimento: ${resultLabel}`)
  }
  if (exp.metric_base && exp.metric_target) {
    parts.push(`Metricas: ${exp.metric_base} → ${exp.metric_target}`)
  }
  if (exp.next_steps) {
    const stepsLabel: Record<string, string> = { discard: 'Descartar', scale: 'Escalar a todos', iterate: 'Iterar' }
    parts.push(`Proximos pasos: ${stepsLabel[exp.next_steps] || exp.next_steps}`)
  }

  return parts.join('\n\n')
}
