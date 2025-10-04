// components/EventDetailModal.tsx
'use client';

import { useState, useEffect } from 'react'; // <-- IMPORTS AÑADIDOS
import Modal from '@/components/Modal';       // <-- IMPORTS AÑADIDOS

type EventData = {
  id: string;
  title: string;
  start: string;
  end: string | undefined;
  extendedProps: {
    description: string | null;
    video_link: string | null;
    team: string;
  }
};

// 👇 TIPO DE PROPS CORREGIDO Y COMPLETO
type EventDetailModalProps = {
    event: EventData | null;
    onClose: () => void;
    onDelete: () => void;
    onUpdate: (eventId: string, data: EventUpdatePayload) => void;
  };

  type EventUpdatePayload = {
    title: string;
    description: string | null;
    start_date: string;
    end_date: string | null;
    team: string;
    video_link: string | null;
  };

const TEAM_COLORS: { [key: string]: { background: string, text: string } } = {
  Marketing:        { background: '#fdf2f8', text: '#be185d' },
  Producto:         { background: '#f0fdf4', text: '#166534' },
  'Customer Success': { background: '#ecfeff', text: '#0e7490' },
  General:          { background: '#f3f4f6', text: '#4b5563' },
};

export default function EventDetailModal({ event, onClose, onDelete, onUpdate }: EventDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [team, setTeam] = useState('General');
  const [videoLink, setVideoLink] = useState('');

  useEffect(() => {
    if (event) {
      // Llenamos el formulario con los datos del evento cuando se abre
      setTitle(event.title);
      setDescription(event.extendedProps.description || '');
      setStartDate(event.start);
      setEndDate(event.end || '');
      setTeam(event.extendedProps.team);
      setVideoLink(event.extendedProps.video_link || '');
      setIsEditing(false); 
    }
  }, [event]);

  if (!event) return null;

  const handleSave = () => {
    const updatedData: EventUpdatePayload = {
      title,
      description: description || null,
      start_date: startDate,
      end_date: endDate || null,
      team,
      video_link: videoLink || null,
    };
    onUpdate(event.id, updatedData);
    setIsEditing(false);
  };
  
  const teamColor = TEAM_COLORS[event.extendedProps.team] || TEAM_COLORS['General'];


  return (
    <Modal isOpen={!!event} onClose={() => { setIsEditing(false); onClose(); }}>
      <div className="p-6">
        {isEditing ? (
          /* --- MODO EDICIÓN COMPLETO --- */
          <div>
            <h2 className="text-2xl font-bold mb-4" style={{ color: '#383838' }}>Editar Evento</h2>
            <div className="space-y-4">
              {/* Todos los campos del formulario, igual que en AddEventModal */}
              <div>
                <label className="block text-sm font-medium" style={{ color: '#383838' }}>Título</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium" style={{ color: '#383838' }}>Fecha de Inicio</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Fecha de Fin</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium" style={{ color: '#383838' }}>Equipo</label>
                <select value={team} onChange={(e) => setTeam(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                  {Object.keys(TEAM_COLORS).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Descripción</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Enlace de Video</label>
                <input type="url" value={videoLink} onChange={(e) => setVideoLink(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"/>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white rounded-md" style={{ backgroundColor: '#ff8080' }}>Guardar Cambios</button>
            </div>
          </div>
        ) : (
          /* --- MODO VISTA --- */
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span 
                  className="px-3 py-1 text-xs font-semibold rounded-full"
                  style={{ backgroundColor: teamColor.background, color: teamColor.text }}
                >
                  {event.extendedProps.team}
                </span>
                <h2 className="text-2xl font-bold mt-2" style={{ color: '#383838' }}>{event.title}</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="text-gray-400 p-1"
                  title="Editar evento"
                  onMouseEnter={(e) => e.currentTarget.style.color = '#3c527a'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L13.196 5.232z" />
                    </svg>
                </button>
                <button 
                  onClick={onDelete} 
                  className="text-gray-400 transition-colors p-1"
                  title="Eliminar evento"
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ff8080'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
              </div>
            </div>
            
            <p className="text-sm text-gray-500 mb-4">
              {new Date(event.start).toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            {event.extendedProps.description && (
              <p className="text-gray-700 mb-4">{event.extendedProps.description}</p>
            )}

            {event.extendedProps.video_link && (
              <a 
                href={event.extendedProps.video_link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm font-semibold hover:underline"
                style={{ color: '#ff8080' }}
              >
                Ver video de la funcionalidad →
              </a>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}