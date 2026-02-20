'use client'

import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'

interface QuickCreateRowProps {
  onCreate: (title: string, problemStatement: string) => Promise<void>
}

export default function QuickCreateRow({ onCreate }: QuickCreateRowProps) {
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setCreating(true)
    await onCreate(title.trim(), problem.trim())
    setTitle('')
    setProblem('')
    setCreating(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 border-t bg-gray-50">
      <PlusIcon className="h-5 w-5 text-gray-400 shrink-0" />
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Nueva idea..."
        className="flex-1 text-sm border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        disabled={creating}
      />
      <input
        type="text"
        value={problem}
        onChange={e => setProblem(e.target.value)}
        placeholder="Problema (opcional)"
        className="flex-1 text-sm border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none hidden sm:block"
        disabled={creating}
      />
      <button
        type="submit"
        disabled={!title.trim() || creating}
        className="text-white text-sm font-medium px-4 py-2 rounded-md transition disabled:opacity-40"
        style={{ backgroundColor: '#ff8080' }}
      >
        {creating ? 'Creando...' : 'Crear'}
      </button>
    </form>
  )
}
