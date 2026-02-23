'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

import { Project } from '@/lib/types'
import AuthGuard from '@/components/AuthGuard'
import ModuleGuard from '@/components/ModuleGuard'
import { useAuth } from '@/context/AuthContext'
import Modal from '@/components/Modal'
import AddProjectForm from '@/components/AddProjectForm'
import ProjectCard from '@/components/ProjectCard'
import DeleteProjectModal from '@/components/DeleteProjectModal'
import InviteProjectMembersModal from '@/components/InviteProjectMembersModal'
import { PlusIcon } from '@heroicons/react/24/outline'

type ProjectWithMembers = Project & { members: { user_id: string; email: string }[] }

export default function ProjectsPage() {
  const { user, supabase } = useAuth()
  const [projects, setProjects] = useState<ProjectWithMembers[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<ProjectWithMembers | null>(null)
  const [invitingToProject, setInvitingToProject] = useState<Project | null>(null)

  const fetchData = useCallback(async () => {
    if (!user || !supabase) {
      setLoading(false)
      return
    }
    setLoading(true)

    try {
      // Use same RPC as dashboard to get projects with members
      const { data: projectsData, error: projectsError } = await supabase.rpc('get_projects_with_members')

      if (projectsError) {
        console.error('Error fetching projects:', projectsError)
        setProjects([])
      } else {
        let filtered = (projectsData as ProjectWithMembers[]) || []

        if (showArchived) {
          filtered = filtered.filter(p => p.archived_at !== null)
        } else {
          filtered = filtered.filter(p => p.archived_at === null)
        }

        // Sort: favorites first, then alphabetical
        filtered.sort((a, b) => {
          if (a.is_favorited === b.is_favorited) return a.name.localeCompare(b.name)
          return a.is_favorited ? -1 : 1
        })

        setProjects(filtered)
      }
    } catch (err) {
      console.error('An unexpected error occurred in fetchData:', err)
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [user, supabase, showArchived])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAddProject = async (projectData: { name: string; description: string | null; team_name: string }) => {
    if (!user || !supabase) return

    const { error: rpcError } = await supabase.rpc('create_project', {
      p_name: projectData.name,
      p_description: projectData.description,
      p_team_name: projectData.team_name,
    })

    if (rpcError) {
      console.error('Error adding project via RPC:', rpcError)
      alert('Error al crear el proyecto: ' + rpcError.message)
    } else {
      await fetchData()
      setIsCreateModalOpen(false)
    }
  }

  const handleToggleFavorite = async (projectId: number) => {
    if (!supabase) return

    // Optimistic update
    setProjects(prev => {
      const updated = prev.map(p =>
        p.id === projectId ? { ...p, is_favorited: !p.is_favorited } : p
      )
      return updated.sort((a, b) => {
        if (a.is_favorited === b.is_favorited) return a.name.localeCompare(b.name)
        return a.is_favorited ? -1 : 1
      })
    })

    const { error } = await supabase.rpc('toggle_project_favorite', { p_project_id: projectId })
    if (error) {
      console.error('Error toggling favorite:', error)
      fetchData()
    }
  }

  const handleUnarchiveProject = async (projectId: number) => {
    if (!supabase) return
    const { error } = await supabase
      .from('projects')
      .update({ archived_at: null })
      .eq('id', projectId)

    if (error) {
      alert('Error al desarchivar el proyecto: ' + error.message)
    } else {
      await fetchData()
    }
  }

  return (
    <AuthGuard>
      <ModuleGuard module="mod_tareas">
        <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold" style={{ color: '#383838' }}>
              {showArchived ? 'Proyectos Archivados' : 'Mis Proyectos'}
            </h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="showArchivedProjects"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                  style={{ accentColor: '#3c527a' }}
                />
                <label htmlFor="showArchivedProjects" className="text-sm font-medium" style={{ color: '#383838' }}>
                  Mostrar archivados
                </label>
              </div>
              {!showArchived && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#ff8080' }}
                >
                  <PlusIcon className="h-5 w-5" />
                  Nuevo Proyecto
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <p>Cargando proyectos...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {projects.length > 0 ? (
                showArchived ? (
                  // Archived view: simple cards with unarchive button
                  projects.map(project => (
                    <div
                      key={project.id}
                      className="block p-6 bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow relative"
                    >
                      <Link href={`/projects/${project.id}`} className="block">
                        <h2 className="text-xl font-bold" style={{ color: '#383838' }}>{project.name}</h2>
                        <p className="mt-2 text-sm text-gray-600 truncate">{project.description || 'Sin descripción'}</p>
                      </Link>
                      <button
                        onClick={() => handleUnarchiveProject(project.id)}
                        className="absolute top-4 right-4 text-gray-400 transition-colors p-1"
                        title="Desarchivar proyecto"
                        onMouseEnter={(e) => e.currentTarget.style.color = '#3c527a'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M7 9a7 7 0 0110-5.46M20 20v-5h-5M17 15a7 7 0 01-10 5.46" />
                        </svg>
                      </button>
                    </div>
                  ))
                ) : (
                  // Active view: full ProjectCard with favorites, delete, invite
                  projects.map(project => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onFavoriteToggle={handleToggleFavorite}
                      onInviteClick={(p) => setInvitingToProject(p)}
                      onDeleteClick={(p) => setProjectToDelete(p)}
                    />
                  ))
                )
              ) : (
                <p className="col-span-full text-center text-gray-500 py-16">
                  {showArchived ? 'No tienes proyectos archivados.' : 'No tienes proyectos. ¡Crea el primero!'}
                </p>
              )}
            </div>
          )}
        </main>

        <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)}>
          <AddProjectForm
            onAddProject={handleAddProject}
            onCancel={() => setIsCreateModalOpen(false)}
          />
        </Modal>

        <DeleteProjectModal
          isOpen={!!projectToDelete}
          onClose={() => setProjectToDelete(null)}
          projectToDelete={projectToDelete}
          allProjects={projects}
          onProjectDeleted={() => {
            fetchData()
            setProjectToDelete(null)
          }}
        />

        {invitingToProject && (
          <InviteProjectMembersModal
            projectId={invitingToProject.id}
            onClose={() => setInvitingToProject(null)}
            onMembersAdded={() => {
              fetchData()
              setInvitingToProject(null)
            }}
          />
        )}
      </ModuleGuard>
    </AuthGuard>
  )
}
