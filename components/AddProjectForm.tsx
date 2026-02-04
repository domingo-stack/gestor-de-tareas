// components/AddProjectForm.tsx

'use client';

import { useState } from 'react';

// 1. Definimos los equipos disponibles (Igual que en el calendario)
const TEAMS = ['Marketing', 'Producto', 'Customer Success', 'General', 'Kali Te Enseña'];

type AddProjectFormProps = {
  // Aquí definimos que la función espera recibir team_name
  onAddProject: (projectData: { name: string; description: string | null; team_name: string }) => Promise<void>;
  onCancel: () => void;
};

export default function AddProjectForm({ onAddProject, onCancel }: AddProjectFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  
  // 2. Estado para el equipo (NUEVO)
  const [team, setTeam] = useState('Marketing'); 
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    
    // 3. ¡AQUÍ ESTABA EL ERROR! 
    // Ahora enviamos también team_name: team
    await onAddProject({
      name: name.trim(),
      description: description.trim() === '' ? null : description.trim(),
      team_name: team, // <--- Esto es lo que faltaba
    });
    // El modal se cierra desde el padre
  };

  return (
    <div className="relative p-6">
      <button onClick={onCancel} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
  
      <h2 className="text-xl font-bold mb-4" style={{ color: '#383838' }}>Crear Nuevo Proyecto</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Nombre */}
        <div>
          <label htmlFor="projectName" className="block text-sm font-medium" style={{ color: '#383838' }}>
            Nombre del Proyecto
          </label>
          <input
            id="projectName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
            required
            placeholder="Ej: Lanzamiento Q3"
          />
        </div>

        {/* 4. Selector de Equipo (NUEVO VISUALMENTE) */}
        <div>
          <label htmlFor="projectTeam" className="block text-sm font-medium" style={{ color: '#383838' }}>
            Equipo Responsable
          </label>
          <select
            id="projectTeam"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
          >
            {TEAMS.map((t) => (
                <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Descripción */}
        <div>
          <label htmlFor="projectDescription" className="block text-sm font-medium" style={{ color: '#383838' }}>
            Descripción (Opcional)
          </label>
          <textarea
            id="projectDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
            placeholder="Breve descripción del proyecto..."
          />
        </div>

        {/* Botones */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Cancelar
          </button>
          
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
            style={{
              backgroundColor: loading ? '#FCA5A5' : '#ff8080',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Creando...' : 'Crear Proyecto'}
          </button>
        </div>
      </form>
    </div>
  );
}