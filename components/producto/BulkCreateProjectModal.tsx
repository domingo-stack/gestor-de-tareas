'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { ProductInitiative, Project } from '@/lib/types'
import Modal from '@/components/Modal'
import { toast } from 'sonner'

interface BulkCreateProjectModalProps {
  initiative: ProductInitiative
  onClose: () => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onRefresh: () => Promise<void>
}

export default function BulkCreateProjectModal({ initiative, onClose, onUpdate, onRefresh }: BulkCreateProjectModalProps) {
  const { supabase, user } = useAuth()
  const [mode, setMode] = useState<'create' | 'link'>('create')
  const [projectName, setProjectName] = useState(initiative.title)
  const [tasksText, setTasksText] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!supabase || mode !== 'link') return
    supabase
      .from('projects')
      .select('*')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setProjects(data as Project[])
      })
  }, [supabase, mode])

  const handleCreateProject = async () => {
    if (!supabase || !user || !projectName.trim()) return

    setSaving(true)
    try {
      // Create project via RPC (SECURITY DEFINER bypasses RLS)
      const { error: projectError } = await supabase.rpc('create_project', {
        p_name: projectName.trim(),
        p_description: initiative.problem_statement || '',
      })

      if (projectError) throw projectError

      // Query the created project to reliably get its ID
      const { data: projectRow, error: fetchError } = await supabase
        .from('projects')
        .select('id')
        .eq('name', projectName.trim())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (fetchError || !projectRow) throw new Error('No se pudo obtener el ID del proyecto creado')

      const projectId = projectRow.id

      // Create tasks from text lines
      const lines = tasksText.split('\n').map(l => l.trim()).filter(Boolean)
      let tasksCreated = 0
      for (const line of lines) {
        const { error: taskError } = await supabase.rpc('create_task_v2', {
          p_title: line,
          p_project_id: projectId,
          p_assignee_id: user.id,
          p_due_date: null,
          p_description: null,
        })
        if (taskError) {
          console.error('Error creating task:', taskError)
        } else {
          tasksCreated++
        }
      }

      // Link project to initiative
      await onUpdate(initiative.id, { project_id: projectId })

      toast.success(`Proyecto creado con ${tasksCreated} tarea${tasksCreated !== 1 ? 's' : ''}`)
      await onRefresh()
      onClose()
    } catch (err: any) {
      toast.error('Error: ' + err.message)
    }
    setSaving(false)
  }

  const handleLinkProject = async () => {
    if (!selectedProjectId) return

    setSaving(true)
    await onUpdate(initiative.id, { project_id: selectedProjectId })
    toast.success('Proyecto vinculado')
    await onRefresh()
    onClose()
    setSaving(false)
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#383838' }}>
          Proyecto para: {initiative.title}
        </h2>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setMode('create')}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition ${
              mode === 'create' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
            }`}
          >
            Crear nuevo
          </button>
          <button
            onClick={() => setMode('link')}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition ${
              mode === 'link' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
            }`}
          >
            Vincular existente
          </button>
        </div>

        {mode === 'create' ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Nombre del proyecto</label>
              <input
                type="text"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Tareas <span className="font-normal text-gray-400">(una por línea)</span>
              </label>
              <textarea
                value={tasksText}
                onChange={e => setTasksText(e.target.value)}
                rows={6}
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none font-mono"
                placeholder={"Investigar competencia\nDiseñar mockups\nImplementar MVP\nTesteo con usuarios"}
              />
              {tasksText.trim() && (
                <p className="text-xs text-gray-400 mt-1">
                  {tasksText.split('\n').filter(l => l.trim()).length} tareas se crearán asignadas a ti
                </p>
              )}
            </div>
            <button
              onClick={handleCreateProject}
              disabled={!projectName.trim() || saving}
              className="w-full py-2.5 rounded-md text-white font-medium text-sm transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#ff8080' }}
            >
              {saving ? 'Creando...' : 'Crear Proyecto'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Seleccionar proyecto</label>
              <select
                value={selectedProjectId || ''}
                onChange={e => setSelectedProjectId(Number(e.target.value) || null)}
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Seleccionar...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleLinkProject}
              disabled={!selectedProjectId || saving}
              className="w-full py-2.5 rounded-md text-white font-medium text-sm transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#3c527a' }}
            >
              {saving ? 'Vinculando...' : 'Vincular Proyecto'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
