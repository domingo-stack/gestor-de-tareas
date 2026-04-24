'use client'

import { useState, useCallback, useEffect } from 'react'
import { PlusIcon, Bars2Icon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { ProductInitiative } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'

const TITLE_MAX = 80

interface Props {
  initiatives: ProductInitiative[]
  onSelect: (i: ProductInitiative) => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => void
  onCreate: (title: string, description: string) => void
  onComplete: (id: number) => void
}

function SortableItem({ item, onSelect, onComplete, index }: {
  item: ProductInitiative; onSelect: (i: ProductInitiative) => void; onComplete: (id: number) => void; index: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`group flex items-center gap-4 px-5 py-3.5 bg-white rounded-2xl border transition-all duration-200 ${
        isDragging ? 'shadow-xl border-blue-200 z-10' : 'border-gray-100 hover:border-gray-200 hover:shadow-md'
      }`}>
      <div className="flex flex-col items-center gap-0.5 flex-shrink-0" {...attributes} {...listeners}>
        <span className="text-[10px] font-bold text-gray-300 tabular-nums">{index + 1}</span>
        <Bars2Icon className="w-4 h-4 text-gray-300 group-hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none" />
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(item)}>
        <p className="text-sm font-medium text-gray-800 leading-snug truncate">{item.title}</p>
        {item.problem_statement && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{item.problem_statement}</p>
        )}
      </div>
      <button onClick={() => onComplete(item.id)}
        className="p-1.5 rounded-full text-gray-200 hover:text-green-500 hover:bg-green-50 transition-all duration-200 flex-shrink-0"
        title="Completar tarea">
        <CheckCircleIcon className="w-6 h-6" />
      </button>
    </div>
  )
}

export default function BacklogTable({ initiatives, onSelect, onUpdate, onCreate, onComplete }: Props) {
  const { supabase } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [localItems, setLocalItems] = useState<ProductInitiative[]>([])

  // Sync local state from props, sorted by manual_order
  useEffect(() => {
    const sorted = [...initiatives].sort((a, b) => ((a as any).manual_order || 0) - ((b as any).manual_order || 0))
    setLocalItems(sorted)
  }, [initiatives])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(async (event: any) => {
    const { active, over } = event
    if (!active || !over || active.id === over.id) return

    const oldIndex = localItems.findIndex(i => i.id === active.id)
    const newIndex = localItems.findIndex(i => i.id === over.id)
    const reordered = arrayMove(localItems, oldIndex, newIndex)

    // Update visual immediately
    setLocalItems(reordered)

    // Persist to DB sequentially
    if (supabase) {
      for (let idx = 0; idx < reordered.length; idx++) {
        await supabase.from('product_initiatives').update({ manual_order: idx }).eq('id', reordered[idx].id)
      }
    }
  }, [localItems, supabase])

  const handleCreate = () => {
    if (!newTitle.trim()) return
    onCreate(newTitle.trim().slice(0, TITLE_MAX), newDesc.trim())
    setNewTitle('')
    setNewDesc('')
    setShowCreate(false)
    toast.success('Tarea creada')
  }

  const handleComplete = (id: number) => {
    setLocalItems(prev => prev.filter(i => i.id !== id))
    onComplete(id)
    toast.success('Tarea completada')
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-400">
          {localItems.length} {localItems.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}
        </p>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
          <PlusIcon className="w-4 h-4" /> Nueva tarea
        </button>
      </div>

      {localItems.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <ClipboardDocumentListIcon className="w-14 h-14 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Sin tareas pendientes</p>
          <p className="text-gray-300 text-sm mt-1">Crea una tarea para empezar</p>
          <button onClick={() => setShowCreate(true)}
            className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
            <PlusIcon className="w-4 h-4" /> Crear tarea
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {localItems.map((item, idx) => (
                <SortableItem key={item.id} item={item} onSelect={onSelect} onComplete={handleComplete} index={idx} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 border border-gray-100" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Nueva tarea</h3>
              <p className="text-sm text-gray-400 mt-0.5">Agrega una tarea al backlog</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">Nombre</label>
                <span className={`text-[10px] tabular-nums ${newTitle.length > TITLE_MAX ? 'text-red-500' : 'text-gray-300'}`}>
                  {newTitle.length}/{TITLE_MAX}
                </span>
              </div>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value.slice(0, TITLE_MAX + 10))}
                onKeyDown={e => { if (e.key === 'Enter' && newTitle.trim()) handleCreate() }}
                placeholder="¿Qué necesitas hacer?" autoFocus
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Descripción <span className="text-gray-300">(opcional)</span></label>
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Contexto, problema o detalles..." rows={3}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 resize-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowCreate(false)}
                className="px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-50">Cancelar</button>
              <button onClick={handleCreate} disabled={!newTitle.trim() || newTitle.length > TITLE_MAX}
                className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors shadow-sm">
                Crear tarea
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
