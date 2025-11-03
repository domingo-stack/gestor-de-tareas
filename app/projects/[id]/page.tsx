// app/projects/[id]/page.tsx
'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Task, Comment, Project, ProjectMember, TeamMember, Collaborator, TaskUpdatePayload, CollaboratorRecord } from '@/lib/types'
import Modal from '@/components/Modal'
import EditTaskForm from '@/components/EditTaskForm'
import KanbanColumn from '@/components/KanbanColumn'
import AuthGuard from '@/components/AuthGuard'
import { DndContext, DragEndEvent, DragOverlay, rectIntersection, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { useAuth } from '@/context/AuthContext'
import ProjectMembers from '@/components/ProjectMembers'
import CreateButton from '@/components/CreateButton'
import AddTaskForm from '@/components/AddTaskForm'
import InviteProjectMembersModal from '@/components/InviteProjectMembersModal'
import TaskCard from '@/components/TaskCard'
import DeleteProjectModal from '@/components/DeleteProjectModal'
import { TrashIcon } from '@/components/icons/TrashIcon'
import ProjectDriveLink from '@/components/ProjectDriveLink'
import Dropdown from '@/components/Dropdown'

const KANBAN_COLUMNS = ['Por Hacer', 'En Progreso', 'Hecho'];

type StatusFilterValue = 'all' | 'due' | 'overdue' | 'completed';

const STATUS_FILTER_OPTIONS: { value: StatusFilterValue, label: string }[] = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'due', label: 'Al día' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'completed', label: 'Finalizadas' },
];

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = Number(params.id);
  const { user, supabase } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  // Removed duplicate setCreateModalContent definition
  const [isSaving, setIsSaving] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleArchiveTask = async (taskId: number) => {
    // Quita la tarea de la vista inmediatamente
    setTasks(tasks.filter(task => task.id !== taskId));
    const { error } = await supabase
    .from('tasks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', taskId);

  if (error) {
    console.error('Error archivando la tarea:', error);
    fetchData(); // Si hay un error, refresca los datos para revertir el cambio
  }
};const [showArchived, setShowArchived] = useState(false);

const fetchData = useCallback(async () => {
  if (!projectId || !user || !supabase) {
      setLoading(false);
      return;
  }
  setLoading(true);
  
  // 1. Preparamos la consulta de tareas SIN el join a profiles
  let tasksQuery = supabase
    .from('tasks')
    .select('*, projects(id, name)')
    .eq('project_id', projectId)
    .is('deleted_at', null);
  
  if (showArchived) {
    tasksQuery = tasksQuery.not('archived_at', 'is', null);
  } else {
    tasksQuery = tasksQuery.is('archived_at', null);
  }

  const [projectRes, membersRes, tasksRes, allProjectsRes, teamMembersRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.rpc('get_project_members', { p_project_id: projectId }),
    tasksQuery,
    supabase.from('projects').select('*'),
    supabase.rpc('get_team_members_by_active_team') // Pedimos todos los miembros del equipo
  ]);
  
  // Procesamos los resultados
  if (projectRes.error) {
      console.error("Error fetching project details:", projectRes.error);
      setProject(null);
  } else {
      setProject(projectRes.data);
  }

  // 2. Aquí está la clave: enriquecemos las tareas manualmente
  if (tasksRes.data && teamMembersRes.data) {
      const membersMap = new Map(teamMembersRes.data.map((m: TeamMember) => [m.user_id, m.email]));
      const enrichedTasks = tasksRes.data.map((task: Task) => ({
          ...task,
          assignee: task.assignee_user_id
            ? { email: String(membersMap.get(task.assignee_user_id) || '') }
            : null
      }));
      setTasks(enrichedTasks);
  } else if (tasksRes.error) {
      console.error("Error fetching tasks:", tasksRes.error);
  }

  if (membersRes.data) setProjectMembers(membersRes.data);
  if (allProjectsRes.data) setAllProjects(allProjectsRes.data);
  if (teamMembersRes.data) setTeamMembers(teamMembersRes.data);
  
  setLoading(false);
}, [user, projectId, supabase, showArchived]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTasks = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return tasks.filter(task => {
      const assigneeMatch = assigneeFilter === 'all' || task.assignee_user_id === assigneeFilter;
      let statusMatch = false;
      switch (statusFilter) {
        case 'completed':
          statusMatch = !!task.completed;
          break;
        case 'overdue':
          statusMatch = !task.completed && !!task.due_date && task.due_date < today;
          break;
        case 'due':
          statusMatch = !task.completed && (!task.due_date || (!!task.due_date && task.due_date >= today));
          break;
        default:
          statusMatch = true;
          break;
      }
      return assigneeMatch && statusMatch;
    });
  }, [tasks, statusFilter, assigneeFilter]);

  // En app/projects/[id]/page.tsx

  const handleAddTask = async (taskData: { title: string; description: string; dueDate: string | null; assigneeId: string | null; projectId: number | null; }) => {
    // 1. Verificamos que tenemos todo lo necesario.
    if (!user || !supabase || !project) {
      alert("Error: No se puede crear la tarea porque falta información del proyecto o del usuario.");
      return;
    }

    // 2. Llamamos a la función RPC usando el team_id del proyecto actual.
    //    No necesitamos buscar el equipo del usuario, ¡ya lo sabemos!
    const { error } = await supabase.rpc('create_task_v2', { 
        p_title: taskData.title, 
        p_description: taskData.description, 
        p_project_id: projectId, // Usamos el ID del proyecto de la página
        p_due_date: taskData.dueDate, 
        p_assignee_id: taskData.assigneeId, 
        p_team_id: project.team_id // <-- La clave está aquí
    });

    if (error) { 
        alert('Error al crear la tarea: ' + error.message); 
    } else { 
        await fetchData(); // Refrescamos los datos para ver la nueva tarea
        setIsCreateTaskModalOpen(false); 
    }
  };
  const handleArchiveProject = async () => {
    if (!project) return;
    
    const confirmation = window.confirm(
      `Are you sure you want to archive the project "${project.name}"? All its tasks will be completed and archived as well.`
    );

    if (confirmation && supabase) {
      const { error } = await supabase.rpc('archive_project_and_tasks', {
        p_project_id: project.id,
      });

      if (error) {
        alert('Error archiving project: ' + error.message);
      } else {
        alert('Project archived successfully!');
        router.push('/projects'); // Redirect to the projects list
      }
    }
  };

    
    
      const handleTaskCompleted = async (taskToUpdate: Task) => {
    
        const newTasks = tasks.map(task => task.id === taskToUpdate.id ? { ...task, completed: !task.completed } : task);
    
        setTasks(newTasks);
    
        if (editingTask && editingTask.id === taskToUpdate.id) { setEditingTask({ ...editingTask, completed: !editingTask.completed }); }
    
        const { error } = await supabase.from('tasks').update({ completed: !taskToUpdate.completed, completed_at: !taskToUpdate.completed ? new Date().toISOString() : null }).eq('id', taskToUpdate.id);
    
        if (error) { console.error('Error updating task:', error); await fetchData(); }
    
      };
    
    
    
      const handleDeleteTask = async (taskId: number) => {
    
        setTasks(tasks.filter(task => task.id !== taskId));
    
        const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', taskId);
    
        if (error) { console.error('Error soft-deleting task:', error); await fetchData(); }
    
      };
    
    const handleUnarchiveTask = async (taskId: number) => {
      // Quita la tarea de la vista inmediatamente
      setTasks(tasks.filter(task => task.id !== taskId));
    
      // Actualiza la base de datos poniendo archived_at en null
      const { error } = await supabase
        .from('tasks')
        .update({ archived_at: null })
        .eq('id', taskId);
    
      if (error) {
        console.error('Error desarchivando la tarea:', error);
        fetchData(); // Si hay un error, refresca los datos para revertir
      }
    };
    
  // En app/projects/[id]/page.tsx

const handleUpdateTask = async (updatedData: TaskUpdatePayload) => {
  if (!editingTask) return;

  // 1. Mostramos "Guardando..."
  setIsSaving(true);

  // 2. Enviamos los cambios a la base de datos (RPC)
  const { error } = await supabase.rpc('update_task', {
      p_task_id: editingTask.id,
      p_new_title: updatedData.title,
      p_new_description: updatedData.description,
      p_new_due_date: updatedData.due_date,
      p_new_project_id: updatedData.project_id,
      p_new_assignee_id: updatedData.assignee_user_id
  });

  // 3. Si hay un error, paramos y avisamos al usuario
  if (error) {
      console.error('Error updating task via RPC:', error);
      alert('Error al guardar los cambios.');
      setIsSaving(false); // Dejamos de guardar
      return; // Detenemos la función
  }

  // 4. --- ¡AQUÍ ESTÁ LA MAGIA! ---
  // Si el guardado fue exitoso, NO llamamos a fetchData().
  // Actualizamos el estado local de React manualmente.

  // 4a. Necesitamos "enriquecer" los datos guardados (como hicimos en fetchData)
  // para que la UI muestre el email del asignado y el nombre del proyecto.
  const membersMap = new Map(teamMembers.map((m: TeamMember) => [m.user_id, m.email]));
  const assigneeEmail = updatedData.assignee_user_id
      ? membersMap.get(updatedData.assignee_user_id)
      : undefined;
  const project = allProjects.find(p => p.id === updatedData.project_id);

  // 4b. Creamos la versión final de la tarea actualizada
  const fullyUpdatedTask = {
      ...editingTask, // Empezamos con la tarea que estaba abierta
      ...updatedData,   // Sobreescribimos con los datos del formulario
      assignee: typeof assigneeEmail === 'string' ? { email: assigneeEmail } : null, // Actualizamos el email del asignado
      projects: project || null // Actualizamos el proyecto
  };

  // 4c. Actualizamos la lista de tareas (el Kanban)
  setTasks(currentTasks =>
      currentTasks.map(t =>
          t.id === editingTask.id ? fullyUpdatedTask : t
      )
  );

  // 4d. Actualizamos la tarea que está abierta en el modal
  // (Esto es clave para que el modal no "pestañee")
  setEditingTask(fullyUpdatedTask);

  // 5. Ocultamos el "Guardando..."
  setIsSaving(false);
};
    
     
    
      const handleDragStart = (event: DragEndEvent) => {
    
        const { active } = event;
    
        const task = tasks.find(t => t.id === Number(active.id));
    
        if (task) setActiveTask(task);
    
      };
    
    
    
      const handleDragEnd = async (event: DragEndEvent) => {
    
        setActiveTask(null);
    
        const { active, over } = event;
    
        if (!over) return;
    
        const activeId = Number(active.id);
    
        const overId = String(over.id);
    
        if (activeId !== Number(over.id)) {
    
          const activeTask = tasks.find(t => t.id === activeId);
    
          if (activeTask && KANBAN_COLUMNS.includes(overId)) {
    
            setTasks(prevTasks => prevTasks.map(t => t.id === activeId ? { ...t, status: overId } : t));
    
            const { error } = await supabase.from('tasks').update({ status: overId }).eq('id', activeTask.id);
    
            if (error) { console.error("Error updating task status:", error); await fetchData(); }
    
          }
    
        }
    
      };
    
    
    
      const handleSelectTask = async (task: Task) => {
    
        const [collaboratorsRes, commentsRes] = await Promise.all([
    
          supabase
    
            .from('task_collaborators')
    
            .select('user_id')
    
            .eq('task_id', task.id),
    
          supabase
    
            .from('comments')
    
            .select('*')
    
            .eq('task_id', task.id)
    
            .order('created_at')
    
        ]);
    
    
    
        if (collaboratorsRes.error) {
    
          console.error('Error fetching collaborators:', collaboratorsRes.error);
    
        } else {
    
            const membersMap = new Map(teamMembers.map(m => [m.user_id, m.email]));
    
            const fetchedCollaborators = collaboratorsRes.data.map((collab: CollaboratorRecord) => ({
    
                user_id: collab.user_id,
    
                email: membersMap.get(collab.user_id) || 'Email no encontrado'
    
            }));
    
            setCollaborators(fetchedCollaborators);
    
        }
    
    
    
        if (commentsRes.error) console.error('Error fetching comments:', commentsRes.error);
    
        else setComments(commentsRes.data as Comment[]);
    
        setEditingTask(task);
    
      };
    
    
    
      const handleCommentAdd = async (content: string) => {
    
        if (!editingTask || !user) return;
    
    
    
        const mentionRegex = /@([\w.-]+@[\w.-]+)/g;
    
        const mentionedEmails = [...content.matchAll(mentionRegex)].map(match => match[1]);
    
    
    
        const membersMap = new Map(teamMembers.map(m => [m.email, m.user_id]));
    
        const mentionedUserIds = mentionedEmails
    
            .map(email => membersMap.get(email))
    
            .filter((id): id is string => id !== undefined);
    
    
    
        const { data, error } = await supabase.rpc('add_comment_and_notify', {
    
            p_task_id: editingTask.id,
    
            p_content: content,
    
            p_mentioned_user_ids: mentionedUserIds
    
        });
    
    
    
        if (error) {
    
            console.error('Error adding comment:', error);
    
            alert('Error al añadir comentario: ' + error.message);
    
        } else if (data) {
    
            setComments([...comments, data as Comment]);
    
        }
    
      };
    
    
    
      const handleCollaboratorAdd = async (userId: string) => {
    
        if (!editingTask) return;
    
       
    
        const { error } = await supabase.rpc('add_collaborator_and_notify', {
    
            p_task_id: editingTask.id,
    
            p_user_id: userId
    
        });
    
    
    
        if (error) {
    
            alert('Error al añadir colaborador: ' + error.message);
    
        } else {
    
            const newCollaborator = teamMembers.find(tm => tm.user_id === userId);
    
            if (newCollaborator) {
    
                 setCollaborators([...collaborators, { user_id: newCollaborator.user_id, email: newCollaborator.email }]);
    
            }
    
        }
    
      };
    
    
    
      const handleCollaboratorRemove = async (userId: string) => {
    
        if (!editingTask) return;
    
        const { error } = await supabase
    
            .from('task_collaborators')
    
            .delete()
    
            .match({ task_id: editingTask.id, user_id: userId });
    
       
    
        if (error) {
    
            alert('Error al eliminar colaborador: ' + error.message);
    
        } else {
    
            setCollaborators(collaborators.filter(c => c.user_id !== userId));
    
        }
    
      };
    

  if (loading) return <div className="flex justify-center items-center min-h-screen"><p>Cargando proyecto...</p></div>;
  if (!project) return <div className="flex justify-center items-center min-h-screen"><p>Proyecto no encontrado o no tienes permiso para verlo.</p></div>;

  function setCreateModalContent(arg0: string): void {
    throw new Error('Function not implemented.')
  }

  return (
    <AuthGuard>
      <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="bg-gray-50 min-h-screen font-sans">
          <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="mb-8">
              <Link 
                href="/" 
                className="text-sm"
                style={{ color: '#ff8080' }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                &larr; Volver al Dashboard
              </Link>
              <div className="flex justify-between items-start mt-2">
                <div>
                  <h1 
                    className="text-3xl font-bold" 
                    style={{ color: '#383838' }}
                  >
                    {project.name}
                  </h1>
                  <p className="text-gray-600 mt-1">{project.description}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 max-w-lg">
                    {/* Grupo de Filtros */}
                    <div className="flex items-center gap-2">
                        <Dropdown
                            label="Filtrar por estado"
                            options={STATUS_FILTER_OPTIONS}
                            selectedValue={statusFilter}
                            onSelect={setStatusFilter}
                        />
                        <Dropdown
                            label="Filtrar por usuario"
                            options={[
                                { value: 'all', label: 'Todos los usuarios' },
                                ...projectMembers.map(member => ({ value: member.user_id, label: member.email })),
                            ]}
                            selectedValue={assigneeFilter}
                            onSelect={setAssigneeFilter}
                        />
                    </div>
                    {/* Grupo de Acciones */}
                    <div className="flex items-center gap-2 border-l pl-4">
                        <ProjectDriveLink
                            projectId={project.id}
                            driveUrl={project.google_drive_url}
                            onLinkUpdate={fetchData}
                        />
                        <div onClick={() => setIsInviteModalOpen(true)} className="cursor-pointer">
                            <ProjectMembers members={projectMembers} />
                        </div>

                        {/* 👇 LÓGICA DE BOTONES DE DUEÑO CORREGIDA */}
                        {user && project.owner_id === user.id && (
                          <>
                            <button 
                              onClick={handleArchiveProject} 
                              className="p-2 rounded-full text-gray-500 transition-colors" 
                              title="Archivar proyecto"
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#EBF0F7'; e.currentTarget.style.color = '#3c527a'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6B7280'; }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                              </svg>
                            </button>
                            <button 
                                onClick={() => setProjectToDelete(project)} 
                                className="p-2 rounded-full text-gray-500 transition-colors" 
                                title="Eliminar proyecto"
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FFF0F0'; e.currentTarget.style.color = '#ff8080'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6B7280'; }}
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                          </>
                        )}

                        {/* Checkbox de archivadas */}
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="showArchivedProject"
                                checked={showArchived}
                                onChange={(e) => setShowArchived(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300"
                                style={{ accentColor: '#3c527a' }}
                            />
                            <label htmlFor="showArchivedProject" className="text-sm font-medium" style={{ color: '#383838' }}>
                                Archivadas
                            </label>
                        </div>
                    </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {KANBAN_COLUMNS.map(status => (
                <KanbanColumn 
                  key={status} 
                  id={status} 
                  title={status} 
                  tasks={filteredTasks.filter(t => t.status === status)}
                  onUpdate={handleTaskCompleted}
                  onDelete={handleDeleteTask}
                  onSelect={handleSelectTask}
                  onArchive={handleArchiveTask}
                  onUnarchive={handleUnarchiveTask}
                  isArchivedView={showArchived} // Pasamos la prop aquí también
                />
              ))}
            </div>
          </main>
          
          {/* --- Todos tus Modales --- */}
          <Modal isOpen={isCreateTaskModalOpen} onClose={() => setIsCreateTaskModalOpen(false)}>
            <AddTaskForm
              projects={project ? [project] : []}
              onAddTask={(taskData) => handleAddTask({ ...taskData, projectId: project?.id })}
              onCancel={() => setIsCreateTaskModalOpen(false)}
            />
          </Modal>

          <DeleteProjectModal
            isOpen={!!projectToDelete}
            onClose={() => setProjectToDelete(null)}
            projectToDelete={projectToDelete}
            allProjects={allProjects}
            onProjectDeleted={() => {
              setProjectToDelete(null);
              router.push('/');
            }}
          />
            <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)}>
            {editingTask && (
              <EditTaskForm
                task={editingTask}
                projects={allProjects}
                comments={comments}
                collaborators={collaborators}
                currentUser={user}
                isSaving={isSaving}
                onSave={handleUpdateTask}
                onCancel={() => setEditingTask(null)}
                onCommentAdd={handleCommentAdd}
                onToggleComplete={handleTaskCompleted}
                onCollaboratorAdd={handleCollaboratorAdd}
                onCollaboratorRemove={handleCollaboratorRemove}
              />
            )}
          </Modal>
          
          <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)}>
            <InviteProjectMembersModal
              projectId={projectId}
              onClose={() => setIsInviteModalOpen(false)}
              onMembersAdded={async () => {
                setIsInviteModalOpen(false);
                await fetchData();
              }}
            />
          </Modal>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} onUpdate={()=>{}} onDelete={()=>{}} onSelect={()=>{}} onArchive={()=>{}} onUnarchive={() => {}} /> : null}
          </DragOverlay>

          <CreateButton
            onNewTask={() => setIsCreateTaskModalOpen(true)}
            onNewProject={() => router.push('/projects')} 
          />
      
        </div>
      </DndContext>
    </AuthGuard>
  );
}