'use client'

import { useEffect, useState, Fragment, useRef } from 'react'
import RichTextEditor from '@/components/RichTextEditor' 
import { useAuth } from '@/context/AuthContext';
import { Task, Comment, Project, TeamMember, Collaborator } from '@/lib/types'
import { Listbox, Transition } from '@headlessui/react'
import { CheckIcon, UserPlusIcon, XCircleIcon, CalendarDaysIcon, FolderIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { User } from '@supabase/supabase-js'
import { TaskUpdatePayload } from '@/lib/types';
import MediaTextarea from '@/components/MediaTextarea';
import { stripHtml } from '@/lib/textUtils';
import DOMPurify from 'dompurify';

type EditTaskFormProps = {
  task: Task;
  projects: Project[];
  comments: Comment[];
  collaborators: Collaborator[];
  currentUser: User | null;
  isSaving: boolean; // <-- NUEVA PROP
  onSave: (updatedData: TaskUpdatePayload) => Promise<void>;
  onCancel: () => void;
  onCommentAdd: (content: string) => Promise<void>;
  onToggleComplete: (task: Task) => void;
  onCollaboratorAdd: (userId: string) => Promise<void>;
  onCollaboratorRemove: (userId: string) => Promise<void>;
};

const Avatar = ({ email, size = 'md' }: { email: string | undefined, size?: 'sm' | 'md' }) => {
  const sizeClasses = size === 'md' ? "w-8 h-8 text-sm" : "w-6 h-6 text-xs";
  const initial = email ? email.charAt(0).toUpperCase() : '?';
  return (
    <div
      className={`rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-bold flex-shrink-0 ${sizeClasses}`}
      title={email}
    >
      {initial}
    </div>
  );
};

export default function EditTaskForm({
  task,
  projects,
  comments = [],
  collaborators = [],
  currentUser,
  isSaving, // <-- RECIBIMOS LA PROP
  onSave,
  onCancel,
  onCommentAdd,
  onToggleComplete,
  onCollaboratorAdd,
}: EditTaskFormProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(stripHtml(task.description) || '');
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.split('T')[0] : '');
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>(task.projects?.id || '');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | ''>(task.assignee_user_id || '');
  const [newComment, setNewComment] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const { supabase } = useAuth();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    if (isMounted.current) {
      const handler = setTimeout(() => {
        onSave({
          title: title.trim(),
          description: description,
          due_date: dueDate === '' ? null : dueDate,
          project_id: selectedProjectId === '' ? null : Number(selectedProjectId),
          assignee_user_id: selectedAssigneeId === '' ? null : selectedAssigneeId
        });
      }, 1500); 

      return () => {
        clearTimeout(handler);
      };
    }
  }, [title, description, dueDate, selectedProjectId, selectedAssigneeId, onSave]);

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setNewComment(text);
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      const query = textBeforeCursor.substring(atIndex + 1);
      if (!query.includes(' ')) {
        setSuggestionQuery(query);
        setShowSuggestions(true);
        setActiveSuggestionIndex(0);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (email: string) => {
    const atIndex = newComment.lastIndexOf('@' + suggestionQuery);
    const textBeforeAt = newComment.substring(0, atIndex);
    setNewComment(textBeforeAt + `@${email} `);
    setShowSuggestions(false);
    commentTextareaRef.current?.focus();
  };
  
  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev + 1) % filteredSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSuggestionClick(filteredSuggestions[activeSuggestionIndex].email);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
      }
    }
  };

  const filteredSuggestions = teamMembers.filter(member => 
    member.email.toLowerCase().includes(suggestionQuery.toLowerCase())
  );

  useEffect(() => {
    async function fetchTeamMembers() {
      const { data, error } = await supabase.rpc('get_team_members');
      if (error) console.error("Error fetching team members:", error);
      else if (data) setTeamMembers(data);
    }
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    setTitle(task.title);
    setDescription(stripHtml(task.description) || '');
    setDueDate(task.due_date ? task.due_date.split('T')[0] : '');
    setSelectedProjectId(task.projects?.id || '');
    setSelectedAssigneeId(task.assignee_user_id || '');
    
    const timer = setTimeout(() => { isMounted.current = true; }, 500);
    return () => {
      isMounted.current = false;
      clearTimeout(timer);
    };

  }, [task]);
  
  const handleAddComment = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (newComment.trim()) {
      onCommentAdd(newComment.trim());
      setNewComment('');
    }

    
  };

  const isCompleted = task.completed;

  return (
    <div className="bg-gray-50 max-w-4xl mx-auto rounded-lg">
      <div className="p-4 sm:p-6">
        <div className="flex justify-between items-start mb-6">
          {/* 👇 CAMBIO 1: Botón de estado de la tarea */}
          <button 
            onClick={() => onToggleComplete(task)} 
            className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center transition-colors`}
            style={
              isCompleted 
                ? { backgroundColor: '#EBF0F7', color: '#3c527a' } // Estilo "completado" con color secundario
                : { backgroundColor: '#E5E7EB', color: '#383838' } // Estilo normal con gris y texto de marca
            }
          >
            <CheckIcon 
              className={`h-5 w-5 mr-2`} 
              style={isCompleted ? { color: '#3c527a' } : {}}
            />
            {isCompleted ? 'Finalizada' : 'Marcar como finalizada'}
          </button>
          <div className="flex items-center gap-4">
            {isSaving && <span className="text-sm text-gray-500 animate-pulse">Guardando...</span>}
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                <XCircleIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
  
        <div className="mb-8">
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-3xl font-bold border-none focus:ring-0 p-0 bg-transparent mb-6"
            style={{ color: '#383838' }}
            disabled={isCompleted}
          />
          {/* ... El resto de la sección de detalles no necesita cambios de color ... */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 border p-4 rounded-lg bg-white">
            <div className="flex items-center">
                <UserCircleIcon className="h-5 w-5 text-gray-400 mr-4 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-500 w-28">Responsable</span>
                <select value={selectedAssigneeId} onChange={(e) => setSelectedAssigneeId(e.target.value)} className="block w-full border-none focus:ring-0 p-0 bg-transparent text-sm" disabled={isCompleted}>
                    <option value="">Sin Asignar</option>
                    {teamMembers.map((member) => (<option key={member.user_id} value={member.user_id}>{member.email}</option>))}
                </select>
            </div>
            <div className="flex items-center">
                <CalendarDaysIcon className="h-5 w-5 text-gray-400 mr-4 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-500 w-28">Fecha Entrega</span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="block w-full border-none focus:ring-0 p-0 bg-transparent text-sm" disabled={isCompleted} />
            </div>
            <div className="flex items-center col-span-1 sm:col-span-2">
                <FolderIcon className="h-5 w-5 text-gray-400 mr-4 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-500 w-28">Proyecto</span>
                <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value === '' ? '' : Number(e.target.value))} className="block w-full border-none focus:ring-0 p-0 bg-transparent text-sm" disabled={isCompleted}>
                    <option value="">Sin Proyecto</option>
                    {projects.map((project) => (<option key={project.id} value={project.id}>{project.name}</option>))}
                </select>
            </div>
          </div>
        </div>
  
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-600 mb-2">Descripción</label>
          <MediaTextarea 
              value={description}
              // 👇 TIPO EXPLÍCITO AQUÍ TAMBIÉN
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)} 
              onTextInsert={(text: string) => setDescription(text)}
              
              disabled={isCompleted}
              placeholder="Describe la tarea, pega imágenes (Ctrl+V) o añade enlaces..."
              rows={6}
          />
        </div>
      </div>
  
      <div className="bg-white p-4 sm:p-6 border-t border-gray-200 rounded-b-lg">
        <div className="flex items-center gap-4 mb-6 pb-4 border-b">
          <span className="text-sm font-medium text-gray-500">Colaboradores</span>
          <div className="flex items-center">
            {collaborators.map(c => <div key={c.user_id} className="-ml-2"><Avatar email={c.email} size="md" /></div>)}
             <Listbox value={null} onChange={(member: TeamMember | null) => member && onCollaboratorAdd(member.user_id)}>
                <div className="relative">
                  {/* 👇 CAMBIO 2: Botón "Añadir colaborador" */}
                  <Listbox.Button 
                    className="ml-2 w-8 h-8 flex items-center justify-center rounded-full border-2 border-dashed border-gray-300 text-gray-400 transition-colors"
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3c527a'; e.currentTarget.style.color = '#3c527a'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.color = '#9CA3AF'; }}
                  >
                    <UserPlusIcon className="h-5 w-5" />
                  </Listbox.Button>
                  <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <Listbox.Options className="absolute z-10 bottom-full mb-2 w-60 overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                      <div className="p-2 text-xs text-gray-500">Añadir colaborador</div>
                      {teamMembers
                        .filter(tm => !collaborators.some(c => c.user_id === tm.user_id))
                        .map(person => (
                          // 👇 CAMBIO 3: Opciones del selector de colaborador
                          <Listbox.Option key={person.user_id} value={person} className={({ active }) => `relative cursor-default select-none py-2 px-4 ${active ? '' : ''}`}>
                            {({ active }) => (
                              <span style={active ? { color: '#ff8080', backgroundColor: '#FFF0F0' } : { color: '#383838' }}>
                                {person.email}
                              </span>
                            )}
                          </Listbox.Option>
                        ))}
                    </Listbox.Options>
                  </Transition>
                </div>
              </Listbox>
          </div>
        </div>
        
        <div className="space-y-5 max-h-60 overflow-y-auto mb-4 pr-2">
          {comments.map(comment => (
            // ... (El componente de comentario no necesita cambios de color) ...
            <div key={comment.id} className="flex items-start gap-3">
              <Avatar email={comment.user_name || undefined} />
              <div className="flex-1 bg-gray-100 p-3 rounded-lg">
                <p className="text-sm">
                  <span className="font-semibold">{comment.user_name || 'Anónimo'}</span>
                  <span className="text-gray-500 ml-2 text-xs">{new Date(comment.created_at).toLocaleString()}</span>
                </p>
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.content) }} />
              </div>
            </div>
          ))}
        </div>
  
        <div className="flex items-start gap-3 pt-4 border-t">
          <Avatar email={currentUser?.email}/>
          <div className="flex-1">
            <div className="mentions-container">
            <MediaTextarea 
                ref={commentTextareaRef} // Mantenemos la ref para las menciones
                value={newComment} 
                
                // Mantenemos tu lógica de menciones intacta
                onChange={handleCommentChange} 
                onKeyDown={handleCommentKeyDown}
                
                // Nueva lógica: Qué hacer cuando se sube una imagen
                onTextInsert={(text: string) => setNewComment(text)}
                
                placeholder="Escribe un comentario o pega una imagen..." 
                rows={3} 
                className="w-full" // El estilo interno ya lo maneja el componente, pero ajustamos el contenedor
                disabled={isCompleted}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="suggestions-list">
                  {filteredSuggestions.map((member, index) => (
                    // 👇 CAMBIO 4: Resaltado de sugerencias de mención
                    <div 
                      key={member.user_id}
                      className={`suggestion-item`}
                      style={index === activeSuggestionIndex ? { backgroundColor: '#FFF0F0' } : {}}
                      onMouseDown={() => handleSuggestionClick(member.email)}
                    >
                      {member.email}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end mt-2">
              {/* 👇 CAMBIO 5: Botón "Comentar" */}
              <button 
                type="button" 
                onClick={handleAddComment} 
                className="px-4 py-2 text-sm text-white font-semibold rounded-md" 
                disabled={isCompleted || !newComment.trim()}
                style={{
                  backgroundColor: (isCompleted || !newComment.trim()) ? '#FCA5A5' : '#ff8080',
                  cursor: (isCompleted || !newComment.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                Comentar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}