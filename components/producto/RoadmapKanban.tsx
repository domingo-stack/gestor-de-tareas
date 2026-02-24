'use client'

import { useCallback, useState } from 'react'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, rectIntersection, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { ProductInitiative } from '@/lib/types'
import InitiativeCard from './InitiativeCard'

const COLUMNS = [
  { id: 'design', label: 'En diseño' },
  { id: 'running', label: 'En progreso' },
  { id: 'completed', label: 'Terminado' },
]

interface RoadmapKanbanProps {
  initiatives: ProductInitiative[]
  onSelect: (initiative: ProductInitiative) => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onFinalize?: (initiative: ProductInitiative) => void
  onCreate?: (title: string) => Promise<void>
  members: { user_id: string; email: string; first_name?: string }[]
}

export default function RoadmapKanban({ initiatives, onSelect, onUpdate, onFinalize, onCreate, members }: RoadmapKanbanProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [activeInitiative, setActiveInitiative] = useState<ProductInitiative | null>(null)
  const [quickCreateTitle, setQuickCreateTitle] = useState('')
  const [showQuickCreate, setShowQuickCreate] = useState(false)

  const handleDragStart = (event: DragStartEvent) => {
    const item = initiatives.find(i => i.id === Number(event.active.id))
    if (item) setActiveInitiative(item)
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveInitiative(null)
    const { active, over } = event
    if (!over) return

    const initiativeId = Number(active.id)
    const newStatus = String(over.id)

    if (!COLUMNS.find(c => c.id === newStatus)) return

    const item = initiatives.find(i => i.id === initiativeId)
    if (!item || item.status === newStatus) return

    await onUpdate(initiativeId, { status: newStatus as ProductInitiative['status'] })

    // Auto-trigger finalize when dragged to completed
    if (newStatus === 'completed' && onFinalize) {
      const updated = { ...item, status: 'completed' as const }
      onFinalize(updated)
    }
  }, [initiatives, onUpdate, onFinalize])

  const handleQuickCreate = async () => {
    if (!quickCreateTitle.trim() || !onCreate) return
    await onCreate(quickCreateTitle.trim())
    setQuickCreateTitle('')
    setShowQuickCreate(false)
  }

  return (
    <div>
      {/* Quick create bar */}
      {onCreate && (
        <div className="mb-4">
          {showQuickCreate ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={quickCreateTitle}
                onChange={e => setQuickCreateTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleQuickCreate()}
                placeholder="Nombre de la tarea..."
                className="flex-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleQuickCreate}
                disabled={!quickCreateTitle.trim()}
                className="px-4 py-2 rounded-md text-white text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#3c527a' }}
              >
                Crear
              </button>
              <button
                onClick={() => { setShowQuickCreate(false); setQuickCreateTitle('') }}
                className="px-3 py-2 rounded-md text-sm text-gray-500 hover:bg-gray-100"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowQuickCreate(true)}
              className="flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
              style={{ color: '#3c527a' }}
            >
              <span className="text-lg leading-none">+</span> Nueva tarea
            </button>
          )}
        </div>
      )}

    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {COLUMNS.map(col => {
          const items = initiatives.filter(i => i.status === col.id)
          return (
            <KanbanColumn key={col.id} id={col.id} label={col.label} count={items.length}>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 min-h-[100px] max-h-[65vh] overflow-y-auto p-1 pr-2">
                  {items.length > 0 ? (
                    items.map(item => (
                      <InitiativeCard
                        key={item.id}
                        initiative={item}
                        onClick={() => onSelect(item)}
                        mode="roadmap"
                        members={members}
                        onFinalize={
                          item.status === 'completed' && onFinalize
                            ? () => onFinalize(item)
                            : undefined
                        }
                      />
                    ))
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center h-full flex items-center justify-center min-h-[100px]">
                      <p className="text-sm text-gray-500">Arrastra una tarjeta aquí</p>
                    </div>
                  )}
                </div>
              </SortableContext>
            </KanbanColumn>
          )
        })}
      </div>

      <DragOverlay>
        {activeInitiative ? (
          <InitiativeCard
            initiative={activeInitiative}
            onClick={() => {}}
            mode="roadmap"
            members={members}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
    </div>
  )
}

function KanbanColumn({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className="rounded-lg p-4 flex flex-col transition-colors"
      style={{ backgroundColor: isOver ? '#EBF0F7' : '#F9FAFB' }}
    >
      <h3 className="font-bold text-lg mb-4" style={{ color: '#383838' }}>
        {label} ({count})
      </h3>
      {children}
    </div>
  )
}
