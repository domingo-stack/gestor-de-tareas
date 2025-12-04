'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext';
import MediaTextarea from './MediaTextarea';
import { stripHtml } from '@/lib/textUtils';

type TeamMember = { user_id: string; email: string; role: string; };
type Project = { id: number; name: string; };

type AddTaskFormProps = {
  onAddTask: (taskData: { 
    title: string;
    description: string;
    projectId: number | null; 
    dueDate: string | null;
    assigneeId: string | null;
  }) => Promise<void>;
  projects: Project[];
  onCancel: () => void; // <-- NUEVO
};

export default function AddTaskForm({ onAddTask, projects, onCancel }: AddTaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProject, setSelectedProject] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | ''>('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false); // Estado de carga
  const { supabase } = useAuth();

  useEffect(() => {
    async function fetchTeamMembers() {
      const { data, error } = await supabase.rpc('get_team_members');
      if (error) console.error("Error fetching team members:", error);
      else if (data) setTeamMembers(data);
    }
    fetchTeamMembers();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const taskData = {
      title: title.trim(),
      description: description,
      projectId: selectedProject === '' ? null : Number(selectedProject),
      dueDate: dueDate === '' ? null : dueDate,
      assigneeId: selectedAssigneeId === '' ? null : selectedAssigneeId
    };
    await onAddTask(taskData);
    // No limpiamos el formulario aquí, ya que el modal se cerrará
    setLoading(false);
  };

  return (
    <div className="relative p-6">
      <button onClick={onCancel} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
  
      <h2 className="text-xl font-bold mb-4" style={{ color: '#383838' }}>Crear Nueva Tarea</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="¿Qué necesitas hacer?"
          className="w-full border-gray-300 rounded-md shadow-sm"
          required
        />
        
        <div>
          <label className="text-sm font-medium text-gray-500">Descripción</label>
          <MediaTextarea 
            value={description} 
            // 👇 AQUÍ AGREGAMOS EL TIPO EXPLÍCITO
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)} 
            onTextInsert={(text: string) => setDescription(text)}
            placeholder="Detalles, enlaces, o pega una imagen (Ctrl+V)..."
          />
        </div>
  
        <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-4">
          <select value={selectedAssigneeId} onChange={(e) => setSelectedAssigneeId(e.target.value)} className="w-full border-gray-300 rounded-md shadow-sm">
            <option value="">Sin Asignar</option>
            {teamMembers.map((member) => (
              <option key={member.user_id} value={member.user_id}>{member.email}</option>
            ))}
          </select>
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border-gray-300 rounded-md shadow-sm">
            <option value="">Sin Proyecto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border-gray-300 rounded-md shadow-sm" />
        </div>
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
            Cancelar
          </button>
          {/* 👇 CAMBIO: Botón principal usa el color de la marca */}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors"
            style={{
              backgroundColor: loading ? '#FCA5A5' : '#ff8080',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Añadiendo...' : 'Añadir Tarea'}
          </button>
        </div>
      </form>
    </div>
  );
}