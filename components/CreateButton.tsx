// components/CreateButton.tsx
'use client';

import { useState } from 'react';

// --- NUEVO: Definimos las propiedades que recibirá el componente ---
type CreateButtonProps = {
  onNewTask: () => void;
  onNewProject: () => void;
};

export default function CreateButton({ onNewTask, onNewProject }: CreateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  // --- CAMBIADO: Ahora estas funciones llaman a las props ---
  const handleNewTaskClick = () => {
    setIsOpen(false);
    onNewTask();
  };
  
  const handleNewProjectClick = () => {
    setIsOpen(false);
    onNewProject();
  };

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <div className="relative">
        {isOpen && (
          <div className="absolute bottom-16 right-0 w-48 bg-white rounded-md shadow-lg border py-1">
            <ul>
              <li>
                <button
                  onClick={handleNewTaskClick}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>Nueva Tarea</span>
                </button>
              </li>
              <li>
                <button
                  onClick={handleNewProjectClick}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                  <span>Nuevo Proyecto</span>
                </button>
              </li>
            </ul>
          </div>
        )}

<button
          onClick={() => setIsOpen(!isOpen)}
          // 👇 HE QUITADO LAS CLASES 'bg-blue-600' y 'hover:bg-blue-700'
          className={`w-14 h-14 rounded-full text-white flex items-center justify-center shadow-lg transition-transform transform ${isOpen ? 'rotate-45' : 'rotate-0'}`}
          aria-label="Crear nueva tarea o proyecto"
          // 👇 Y HE AÑADIDO EL COLOR NARANJA DIRECTAMENTE AQUÍ
          style={{ backgroundColor: '#ff8080' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}