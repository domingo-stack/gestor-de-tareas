// components/EventDetailModal.tsx
'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/Modal';

// --- PASO 1: ACTUALIZAMOS LOS "PLANOS" (TYPES) ---

type EventData = {
    id: string;
    title: string;
    start: string;
    end: string | undefined;
    extendedProps: {
        description: string | null;
        video_link: string | null;
        team: string;
        custom_data?: { // Hacemos que custom_data sea opcional
            Estado?: string;
            Formato?: string;
            'Pilar de Contenido'?: string;
        };
    }
};

type EventUpdatePayload = {
    title: string;
    description: string | null;
    start_date: string;
    end_date: string | null;
    team: string;
    video_link: string | null;
    custom_data: any; // Permitimos que custom_data se actualice
};

type EventDetailModalProps = {
    event: EventData | null;
    onClose: () => void;
    onDelete: () => void;
    onUpdate: (eventId: string, data: EventUpdatePayload) => void;
};

const TEAM_COLORS: { [key: string]: { background: string, text: string } } = {
    Marketing: { background: '#fdf2f8', text: '#be185d' },
    Producto: { background: '#f0fdf4', text: '#166534' },
    'Customer Success': { background: '#ecfeff', text: '#0e7490' },
    General: { background: '#f3f4f6', text: '#4b5563' },
};

const ESTADO_OPTIONS = ['Sin empezar', 'Escribiendo Guión', 'Creando', 'Grabando', 'Editando', 'Programando', 'Publicado'];
const FORMATO_OPTIONS = ['Post', 'Story', 'Reel'];
const PILAR_OPTIONS = ['Educativo', 'Venta', 'Divertido'];

export default function EventDetailModal({ event, onClose, onDelete, onUpdate }: EventDetailModalProps) {
    const [isEditing, setIsEditing] = useState(false);
    
    // --- PASO 2: CREAMOS "ESPACIOS EN MEMORIA" (useSTATE) PARA TODO ---
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [team, setTeam] = useState('General');
    const [videoLink, setVideoLink] = useState('');
    
    // Nuevos estados para los campos de marketing
    const [estado, setEstado] = useState('');
    const [formato, setFormato] = useState('');
    const [pilar, setPilar] = useState('');

    useEffect(() => {
        if (event) {
            // Llenamos el formulario con los datos del evento cuando se abre
            setTitle(event.title);
            setDescription(event.extendedProps.description || '');
            setStartDate(event.start.split('T')[0]); // Formateamos para el input date
            setEndDate(event.end ? event.end.split('T')[0] : ''); // Formateamos para el input date
            setTeam(event.extendedProps.team);
            setVideoLink(event.extendedProps.video_link || '');

            // Llenamos los nuevos campos de custom_data
            setEstado(event.extendedProps.custom_data?.Estado || '');
            setFormato(event.extendedProps.custom_data?.Formato || '');
            setPilar(event.extendedProps.custom_data?.['Pilar de Contenido'] || '');

            setIsEditing(false);
        }
    }, [event]);

    if (!event) return null;

    // --- PASO 3: ACTUALIZAMOS LA FUNCIÓN DE GUARDAR ---
    const handleSave = () => {
        const updatedData: EventUpdatePayload = {
            title,
            description: description || null,
            start_date: startDate,
            end_date: endDate || null,
            team,
            video_link: videoLink || null,
            // Añadimos los custom_data al objeto que se guarda
            custom_data: {
                Estado: estado,
                Formato: formato,
                'Pilar de Contenido': pilar,
            }
        };
        onUpdate(event.id, updatedData);
        setIsEditing(false);
    };

    const teamColor = TEAM_COLORS[event.extendedProps.team] || TEAM_COLORS['General'];

    // --- PASO 4: PONEMOS TODO EN LA UI ---
    return (
        <Modal isOpen={!!event} onClose={() => { setIsEditing(false); onClose(); }}>
            <div className="p-6 bg-white rounded-lg shadow-xl max-w-2xl w-full">
                {isEditing ? (
                    /* --- MODO EDICIÓN COMPLETO --- */
                    <div>
                        <h2 className="text-2xl font-bold mb-6 text-gray-800">Editar Evento</h2>
                        <div className="space-y-4">
                            {/* Campos básicos del formulario */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Título</label>
                                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700">Fecha de Inicio</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" /></div>
                                <div><label className="block text-sm font-medium text-gray-700">Fecha de Fin</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" /></div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" />
                            </div>
                            <div>
    <label className="block text-sm font-medium text-gray-700">Enlace de Video (Opcional)</label>
    <input 
        type="url" 
        value={videoLink} 
        onChange={(e) => setVideoLink(e.target.value)} 
        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
        placeholder="https://..."
    />
</div>

                            {/* --- CAMPOS EXTRA SOLO PARA MARKETING --- */}
                            {team === 'Marketing' && (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Estado</label>
                                            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                                                <option value="">Ninguno</option>
                                                {ESTADO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Formato</label>
                                            <select value={formato} onChange={(e) => setFormato(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                                                <option value="">Ninguno</option>
                                                {FORMATO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Pilar de Contenido</label>
                                            <select value={pilar} onChange={(e) => setPilar(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                                                <option value="">Ninguno</option>
                                                {PILAR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}
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
                                <span className="px-3 py-1 text-xs font-semibold rounded-full" style={{ backgroundColor: teamColor.background, color: teamColor.text }}>{event.extendedProps.team}</span>
                                <h2 className="text-2xl font-bold mt-2 text-gray-800">{event.title}</h2>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setIsEditing(true)} className="text-gray-400 p-1 hover:text-blue-600" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L13.196 5.232z" /></svg></button>
                                <button onClick={onDelete} className="text-gray-400 p-1 hover:text-red-600" title="Eliminar"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">{new Date(event.start).toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

                        {/* Muestra las etiquetas solo si existen */}
                        {(event.extendedProps.custom_data?.Estado || event.extendedProps.custom_data?.Formato || event.extendedProps.custom_data?.['Pilar de Contenido']) && (
                          <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b">
                              {event.extendedProps.custom_data?.Estado && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-800">{event.extendedProps.custom_data.Estado}</span>}
                              {event.extendedProps.custom_data?.Formato && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">{event.extendedProps.custom_data.Formato}</span>}
                              {event.extendedProps.custom_data?.['Pilar de Contenido'] && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">{event.extendedProps.custom_data['Pilar de Contenido']}</span>}
                          </div>
                        )}

                        {event.extendedProps.description && <p className="text-gray-700 mt-4">{event.extendedProps.description}</p>}
                        {event.extendedProps.video_link && (
    <div className="mt-4">
        <a 
            href={event.extendedProps.video_link} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm font-semibold text-blue-600 hover:underline"
        >
            Ver video del evento →
        </a>
    </div>
)}
                    </div>
                )}
            </div>
        </Modal>
    );
}