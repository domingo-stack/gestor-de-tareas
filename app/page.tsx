'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Task, Comment, Project, TeamMember, Collaborator } from '@/lib/types'
import AddTaskForm from '@/components/AddTaskForm'
import Modal from '@/components/Modal'
import EditTaskForm from '@/components/EditTaskForm'
import TaskCard from '@/components/TaskCard'
import AuthGuard from '@/components/AuthGuard'
import ModuleGuard from '@/components/ModuleGuard'
import { useAuth } from '@/context/AuthContext'
import CreateButton from '@/components/CreateButton'
import AddProjectForm from '@/components/AddProjectForm'
import MyProjects from '@/components/MyProjects'
import ActivityFeed from '@/components/ActivityFeed'
import DOMPurify from 'dompurify';
import InviteProjectMembersModal from '@/components/InviteProjectMembersModal'
import { TaskUpdatePayload } from '@/lib/types';
import { CollaboratorRecord } from '@/lib/types'; // O la ruta correcta a tu archivo
import DeleteProjectModal from '@/components/DeleteProjectModal';
import { DndContext, DragEndEvent, DragOverlay, rectIntersection, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import KanbanColumn from '@/components/KanbanColumn'; // Ya deberías tener este

type FilterType = 'alDia' | 'atrasadas' | 'finalizadas';

// Definimos el tipo Project con los nuevos datos de miembros
type ProjectWithMembers = Project & { members: { user_id: string; email: string; }[] };
const KANBAN_COLUMNS = ['Por Hacer', 'En Progreso', 'Hecho'];

export default function MyTasksPage() {
  const { user, supabase } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectWithMembers[]>([]); // Usamos el nuevo tipo
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('alDia');
  const [createModalContent, setCreateModalContent] = useState<'task' | 'project' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [invitingToProject, setInvitingToProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectWithMembers | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [savedViewMode, setSavedViewMode] = useState<'list' | 'kanban'>('list');
  
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const isInitialMount = useRef(true);
  

  // Este useEffect se encarga de cargar la vista preferida del usuario
// Este useEffect se encarga de cargar la vista preferida del usuario
// Este useEffect se encarga de GUARDAR la preferencia cuando el usuario la cambia
const handleSaveViewPreference = async () => {
  if (user && supabase) {
    const { error } = await supabase
      .from('profiles')
      .update({ default_view: viewMode })
      .eq('id', user.id);

    if (error) {
      alert('Error al guardar la preferencia: ' + error.message);
    } else {
      // Actualizamos nuestro estado de "preferencia guardada"
      setSavedViewMode(viewMode); 
      alert('¡Preferencia de vista guardada!');
    }
  }
};

  // A partir de la segunda vez (cuando el usuario hace clic), sí guardamos.
  // Esta lógica se ejecuta cada vez que el 'user' se carga
  // Este useEffect se encarga de GUARDAR la preferencia cuando el usuario la cambia
// Este useEffect se encarga de GUARDAR la preferencia cuando el usuario la cambia // Este espía se activa cada vez que 'viewMode' cambia

  const handleUnarchiveTask = async (taskId: number) => {
    // Quita la tarea de la vista de archivados inmediatamente
    setTasks(tasks.filter(task => task.id !== taskId));

    const { error } = await supabase
    .from('tasks')
    .update({ archived_at: null })
    .eq('id', taskId);

  if (error) {
    console.error('Error desarchivando la tarea:', error);
    fetchData(); // Si hay un error, refresca los datos
  }
};
// Este useEffect se encarga de cargar la vista preferida del usuario
useEffect(() => {
  const handleViewPreference = async () => {
    if (user && supabase) {
      // Si es la PRIMERA VEZ que el componente se carga...
      if (isInitialMount.current) {
        isInitialMount.current = false; // Bajamos la bandera para futuras ejecuciones

        // ...solamente LEEMOS la preferencia de la base de datos.
        const { data, error } = await supabase
          .from('profiles')
          .select('default_view')
          .eq('id', user.id)
          .single();

        if (data && (data.default_view === 'list' || data.default_view === 'kanban')) {
          setViewMode(data.default_view);
          setSavedViewMode(data.default_view);
        }
      } else {
        // Si ya NO es la primera carga (el usuario cambió la vista)...
        // ...solamente GUARDAMOS la nueva preferencia.
        const { error } = await supabase
          .from('profiles')
          .update({ default_view: viewMode })
          .eq('id', user.id);

        if (error) {
          console.error('Error updating view preference:', error);
        }
      }
    }
  };

  handleViewPreference();
}, [viewMode, user, supabase]); // Este hook ahora vigila todo

const fetchData = useCallback(async () => {
  if (!user || !supabase) return;
  setLoading(true);

  // 1. Preparamos la consulta de tareas con el parámetro correcto
  const tasksQuery = supabase.rpc('get_my_assigned_tasks_with_projects', {
    p_show_archived: showArchived
  });
  const projectsQuery = supabase.rpc('get_projects_with_members');
    const membersQuery = supabase.rpc('get_all_members');

    const [tasksResponse, membersResponse, projectsResponse] = await Promise.all([
      tasksQuery,
      membersQuery,
      projectsQuery
    ]);
  

  // 3. Desestructuramos los resultados de forma segura
  const { data: allMyTasks, error: tasksError } = tasksResponse;
  const { data: membersData, error: membersError } = membersResponse;
  const { data: projectsData, error: projectsError } = projectsResponse;

  if (tasksError || membersError || projectsError) {
    console.error({ tasksError, membersError, projectsError });
    setLoading(false);
    return;
  }
  
  // ...el resto de la función para procesar los datos se queda igual...
  const allProjects = projectsData as ProjectWithMembers[] || [];
  const activeProjects = allProjects.filter(p => p.archived_at === null);
  
  // Ordenamos: Favoritos primero, luego el resto
  activeProjects.sort((a, b) => {
      if (a.is_favorited === b.is_favorited) return 0;
      return a.is_favorited ? -1 : 1;
  });

  setProjects(activeProjects);
  setTeamMembers(membersData || []);
  let tasksToDisplay: Task[] = allMyTasks || [];
  const today = new Date().toISOString().split('T')[0];
  if (!showArchived && viewMode === 'list') {
      if (activeFilter === 'alDia') {
          tasksToDisplay = tasksToDisplay.filter(task => !task.completed && task.due_date && task.due_date >= today);
      } else if (activeFilter === 'atrasadas') {
          tasksToDisplay = tasksToDisplay.filter(task => !task.completed && task.due_date && task.due_date < today);
      } else if (activeFilter === 'finalizadas') {
          tasksToDisplay = tasksToDisplay.filter(task => task.completed);
      }
  }
  const membersMap = new Map(
    (membersData || []).filter((m: TeamMember) => m.user_id && m.email).map((m: TeamMember) => [m.user_id, m.email])
  );
  const enrichedTasks = tasksToDisplay.map(task => ({
    ...task,
    assignee: task.assignee_user_id ? { email: String(membersMap.get(task.assignee_user_id) || '') } : null,
  }));
  setTasks(enrichedTasks);
  setLoading(false);
}, 
[user, supabase, activeFilter, showArchived, viewMode]);

useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  const handleToggleFavorite = async (projectId: number) => {
    // 1. Actualización Optimista (UI Instantánea)
    setProjects(currentProjects => {
      // Creamos una copia profunda modificando el proyecto clickeado
      const updated = currentProjects.map(p => 
        p.id === projectId ? { ...p, is_favorited: !p.is_favorited } : p
      );

      // Reordenamos inmediatamente: Favoritos arriba
      return updated.sort((a, b) => {
        // Si ambos son favoritos o ambos no lo son, mantenemos orden (o podrías ordenar por nombre)
        if (a.is_favorited === b.is_favorited) {
           return a.name.localeCompare(b.name); 
        }
        // Si a es favorito, va antes (-1)
        return a.is_favorited ? -1 : 1;
      });
    });

    // 2. Llamada a la Base de Datos
    const { error } = await supabase.rpc('toggle_project_favorite', { p_project_id: projectId });
    
    // 3. Si falla, revertimos silenciosamente recargando los datos reales
    if (error) {
      console.error('Error toggling favorite:', error);
      fetchData();
    }
  };

  const closeCreateModal = () => setCreateModalContent(null);

  const openDeleteModal = (project: ProjectWithMembers) => {
    setProjectToDelete(project);
  };

  const handleAddTask = async (taskData: { title: string; description: string; projectId: number | null; dueDate: string | null; assigneeId: string | null; }) => {
    if (!user) return;

    const { error } = await supabase.rpc('create_task_v2', {
      p_title: taskData.title,
      p_description: taskData.description,
      p_project_id: taskData.projectId,
      p_due_date: taskData.dueDate,
      p_assignee_id: taskData.assigneeId
    });
  
    if (error) { 
      console.error('Error detallado al crear la tarea:', error); 
      alert('Error al crear la tarea: ' + error.message); 
    } else { 
      // 2. RECUPERACIÓN INTELIGENTE
      // Como el RPC no nos devolvió la tarea completa, la buscamos.
      // Buscamos "la última tarea creada por mí en este instante".
      const { data: latestTask } = await supabase
          .from('tasks')
          .select()
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

      // 3. 🔥 LLAMADA A LA EDGE FUNCTION (Correo de Asignación)
      // Solo enviamos el correo si encontramos la tarea y tiene asignado
      if (latestTask && latestTask.assignee_user_id) {
          fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-assignment-notification`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
              },
              body: JSON.stringify({ 
                  record: latestTask,
                  type: 'INSERT'
              })
          }).catch(err => console.error("Error enviando correo:", err));
      }

      await fetchData(); 
      closeCreateModal(); 
    }
  };
  
  

  const handleAddProject = async (projectData: { name: string; description: string | null }) => {
    if (!user) return;

    const { error } = await supabase.rpc('create_project', {
      p_name: projectData.name,
      p_description: projectData.description
    });
  
    if (error) { 
      alert('Error al crear el proyecto: ' + error.message); 
    } else { 
      await fetchData(); 
      closeCreateModal(); 
    }
  };

  const handleTaskCompleted = async (taskToUpdate: Task) => {
    // 1. Actualización Optimista (UI primero)
    const newCompletedState = !taskToUpdate.completed;
    const newTasks = tasks.map(task => task.id === taskToUpdate.id ? { ...task, completed: newCompletedState } : task);
    setTasks(newTasks);
    
    if (editingTask && editingTask.id === taskToUpdate.id) { 
        setEditingTask({ ...editingTask, completed: newCompletedState }); 
    }

    // 2. Update en Base de Datos
    const { data: updatedTask, error } = await supabase
        .from('tasks')
        .update({ 
            completed: newCompletedState, 
            completed_at: newCompletedState ? new Date().toISOString() : null 
        })
        .eq('id', taskToUpdate.id)
        .select()
        .single();

    if (error) { 
        console.error('Error updating task:', error); 
        await fetchData(); // Revertir si falla
    } else if (updatedTask && newCompletedState === true) {
        // 3. 🔥 LLAMADA A LA EDGE FUNCTION (Solo si se marcó como completada)
        const actorEmail = user?.email || "Alguien";
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-assignment-notification`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ 
                record: updatedTask,
                // Truco: Le decimos que antes estaba false para que la función detecte el cambio
                old_record: { completed: false }, 
                type: 'UPDATE',
                actor_email: actorEmail
            })
        }).catch(err => console.error("Error enviando notificación de completado:", err));
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    setTasks(tasks.filter(task => task.id !== taskId));
    const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', taskId);
    if (error) { console.error('Error soft-deleting task:', error); await fetchData(); }
  };

  const handleArchiveTask = async (taskId: number) => {
    setTasks(tasks.filter(task => task.id !== taskId));
    const { error } = await supabase
      .from('tasks')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', taskId);
  
    if (error) {
      console.error('Error archivando la tarea:', error);
      fetchData();
    }
  }

  const handleUpdateTask = async (updatedData: TaskUpdatePayload) => {
    if (!editingTask) return;
    setIsSaving(true);

    const { error } = await supabase.rpc('update_task', {
      p_task_id: editingTask.id,
      p_new_title: updatedData.title,
      p_new_description: updatedData.description,
      p_new_due_date: updatedData.due_date,
      p_new_project_id: updatedData.project_id,
      p_new_assignee_id: updatedData.assignee_user_id
    });

    if (error) {
      console.error('Error updating task via RPC:', error);
      alert('Error al guardar los cambios.');
    } else {
      // Actualizar optimistamente sin refetch para no resetear campos del form
      setEditingTask(prev => prev ? {
        ...prev,
        title: updatedData.title ?? prev.title,
        description: updatedData.description ?? prev.description,
        due_date: updatedData.due_date ?? null,
        projects: updatedData.project_id
          ? projects.find(p => p.id === updatedData.project_id)
            ? { id: updatedData.project_id, name: projects.find(p => p.id === updatedData.project_id)!.name }
            : prev.projects
          : null,
        assignee_user_id: updatedData.assignee_user_id ?? null,
      } : null);
      // Actualizar también la lista de tareas del dashboard
      setTasks(prev => prev.map(t => t.id === editingTask.id ? {
        ...t,
        title: updatedData.title ?? t.title,
        description: updatedData.description ?? t.description,
        due_date: updatedData.due_date ?? null,
        projects: updatedData.project_id
          ? projects.find(p => p.id === updatedData.project_id)
            ? { id: updatedData.project_id, name: projects.find(p => p.id === updatedData.project_id)!.name }
            : t.projects
          : null,
        assignee_user_id: updatedData.assignee_user_id ?? null,
      } : t));
    }

    setIsSaving(false);
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

    // 1. Insertamos el comentario directamente en la tabla
    const { data: newComment, error } = await supabase
        .from('comments')
        .insert({
            task_id: editingTask.id,
            content: DOMPurify.sanitize(content),
            user_id: user.id,
            // Agregamos el nombre para que se vea bonito en la UI de inmediato
            user_name: user.user_metadata?.full_name || user.email
        })
        .select()
        .single(); // ¡Clave! Esto nos devuelve el objeto creado

    if (error) {
        console.error('Error adding comment:', error);
        alert('Error al añadir comentario: ' + error.message);
    } else if (newComment) {
        // 2. Actualizamos la UI al instante
        setComments([...comments, newComment as Comment]);

        // 3. 🔥 LLAMADA A LA EDGE FUNCTION (Notificaciones)
        // No esperamos (await) a que termine para no frenar la UI
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-mentions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ record: newComment })
        }).catch(err => console.error("Error enviando notificación:", err));
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

  const handleDragStart = (event: DragEndEvent) => {
    const { active } = event;
    const task = tasks.find(t => t.id === Number(active.id));
    if (task) {
      setActiveTask(task);
    }
  };


  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = Number(active.id);
    const newStatus = String(over.id);

    // Solo actualizamos si la tarea se movió a una columna diferente
    if (KANBAN_COLUMNS.includes(newStatus)) {
      const originalTask = tasks.find(t => t.id === activeId);
      
      if (originalTask && originalTask.status !== newStatus) {
        // Actualización optimista en la UI
        setTasks(prevTasks =>
          prevTasks.map(t =>
            t.id === activeId ? { ...t, status: newStatus } : t
          )
        );
        // Actualización en la base de datos
        const { error } = await supabase
          .from('tasks')
          .update({ status: newStatus })
          .eq('id', activeId);
          
        if (error) {
          console.error("Error updating task status:", error);
          fetchData(); // Si hay un error, revierte los cambios
        }
      }
    }
  };

  return (
    <AuthGuard>
      <ModuleGuard module="mod_tareas">
      <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <main className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
          <h1 
            className="text-3xl font-bold mb-8" 
            style={{ color: '#383838' }}
          >
            Mi Dashboard
          </h1>
  
          {/* SECCIÓN DE FILTROS Y VISTAS */}
          <div className="my-6 border-b border-gray-200">
            <div className="flex justify-between items-center pb-2 flex-wrap gap-4">
              <div>
                {viewMode === 'list' && !showArchived && (
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => setActiveFilter('alDia')} 
                      className={`px-4 py-2 text-sm font-medium rounded-t-md`}
                      style={activeFilter === 'alDia' ? { borderBottom: '2px solid #ff8080', color: '#ff8080' } : { color: '#6B7280' }}
                    >
                      Al día
                    </button>
                    <button 
                      onClick={() => setActiveFilter('atrasadas')} 
                      className={`px-4 py-2 text-sm font-medium rounded-t-md`}
                      style={activeFilter === 'atrasadas' ? { borderBottom: '2px solid #ff8080', color: '#ff8080' } : { color: '#6B7280' }}
                    >
                      Atrasadas
                    </button>
                    <button 
                      onClick={() => setActiveFilter('finalizadas')} 
                      className={`px-4 py-2 text-sm font-medium rounded-t-md`}
                      style={activeFilter === 'finalizadas' ? { borderBottom: '2px solid #3c527a', color: '#3c527a' } : { color: '#6B7280' }}
                    >
                      Finalizadas
                    </button>
                  </div>
                )}
                {showArchived && (
                  <h3 className="px-4 py-2 text-sm font-semibold" style={{ color: '#3c527a' }}>
                    Mostrando Tareas Archivadas
                  </h3>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center p-1 bg-gray-200 rounded-lg">
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow' : 'text-gray-600'}`}
                    style={viewMode === 'list' ? {color: '#383838'} : {}}
                  >
                    Lista
                  </button>
                  <button 
                    onClick={() => setViewMode('kanban')}
                    className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white shadow' : 'text-gray-600'}`}
                    style={viewMode === 'kanban' ? {color: '#383838'} : {}}
                  >
                    Kanban
                  </button>
                </div>
                <button 
    onClick={handleSaveViewPreference}
    // El botón se deshabilita si la vista actual ya está guardada
    disabled={viewMode === savedViewMode} 
    className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors disabled:opacity-70"
    style={
      viewMode === savedViewMode 
        // Estilo cuando la vista ya está guardada (sutil)
        ? { backgroundColor: '#EBF0F7', color: '#3c527a' } 
        // Estilo cuando hay cambios por guardar (llamativo)
        : { backgroundColor: '#ff8080', color: 'white' }
    }
  >
    {viewMode === savedViewMode ? 'Vista Guardada' : 'Guardar Vista'}
  </button>
                <div className="flex items-center space-x-2 border-l pl-4">
                  <input
                    type="checkbox"
                    id="showArchived"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    disabled={viewMode === 'kanban'}
                    className="h-4 w-4 rounded border-gray-300 disabled:opacity-50"
                    style={{ accentColor: '#3c527a' }}
                  />
                  <label htmlFor="showArchived" className={`text-sm font-medium ${viewMode === 'kanban' ? 'text-gray-400' : ''}`} style={viewMode !== 'kanban' ? { color: '#383838' } : {}}>
                    Mostrar archivadas
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          {/* LÓGICA DE RENDERIZADO CORREGIDA */}
          {loading ? (
            <p>Cargando datos del dashboard...</p>
          ) : (
            <div>
              {/* VISTA DE LISTA */}
              {viewMode === 'list' && (
                <div className="space-y-3">
                  {tasks.length > 0 ? (
                    tasks.map(task => (
                      <TaskCard 
                        key={task.id} 
                        task={task} 
                        onUpdate={handleTaskCompleted} 
                        onDelete={handleDeleteTask} 
                        onSelect={handleSelectTask} 
                        onArchive={handleArchiveTask}
                        onUnarchive={handleUnarchiveTask}
                        isArchivedView={showArchived}
                      />
                    ))
                  ) : (
                    <p className="text-center text-gray-500 py-8">No hay tareas en esta categoría.</p>
                  )}
                </div>
              )}
  
              {/* VISTA KANBAN */}
              {viewMode === 'kanban' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {KANBAN_COLUMNS.map(status => (
                    <KanbanColumn
                      key={status}
                      id={status}
                      title={status}
                      tasks={tasks.filter(t => t.status === status)}
                      onUpdate={handleTaskCompleted}
                      onDelete={handleDeleteTask}
                      onSelect={handleSelectTask}
                      onArchive={handleArchiveTask}
                      onUnarchive={handleUnarchiveTask}
                      isArchivedView={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          
          <MyProjects 
      projects={projects}
      onFavoriteToggle={handleToggleFavorite} // <-- La conexión clave
      onInviteClick={(project) => setInvitingToProject(project)} 
      onDeleteClick={openDeleteModal}
    />
          <ActivityFeed />
        </main>
        <DragOverlay>
          {activeTask ? (
            <TaskCard 
              task={activeTask} 
              onUpdate={()=>{}} 
              onDelete={()=>{}} 
              onSelect={()=>{}} 
              onArchive={()=>{}}
              onUnarchive={() => {}}
            />
          ) : null}
        </DragOverlay>
      
      {/* ... El resto de tu código de Modales y CreateButton se queda igual ... */}
      <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)}>
        {editingTask && (
          <EditTaskForm 
            task={editingTask} 
            projects={projects} 
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
      <Modal isOpen={!!createModalContent} onClose={closeCreateModal}>
        {createModalContent === 'task' && (<AddTaskForm onAddTask={handleAddTask} projects={projects} onCancel={closeCreateModal} />)}
        {createModalContent === 'project' && (<AddProjectForm onAddProject={handleAddProject} onCancel={closeCreateModal} />)}
      </Modal>
      <Modal isOpen={!!invitingToProject} onClose={() => setInvitingToProject(null)}>
        {invitingToProject && (
          <InviteProjectMembersModal
            projectId={invitingToProject.id}
            onClose={() => setInvitingToProject(null)}
            onMembersAdded={() => {
              fetchData();
              setInvitingToProject(null);
            }}
          />
        )}
      </Modal>
      <DeleteProjectModal
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        projectToDelete={projectToDelete}
        allProjects={projects}
        onProjectDeleted={() => {
          fetchData(); 
          setProjectToDelete(null);
        }}
      />
  
      <CreateButton 
        onNewTask={() => setCreateModalContent('task')} 
        onNewProject={() => setCreateModalContent('project')} 
      />
      
      </DndContext>
      </ModuleGuard>
    </AuthGuard>
  );}
