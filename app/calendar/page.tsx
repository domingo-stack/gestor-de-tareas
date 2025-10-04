// app/calendar/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { PlusIcon } from '@heroicons/react/24/outline';
import AuthGuard from '@/components/AuthGuard';
import AddEventModal from '@/components/AddEventModal';
console.log('El componente AddEventModal es:', AddEventModal);
import { UserPlusIcon } from '@/components/icons/UserPlusIcon';
import EventDetailModal from '@/components/EventDetailModal'; // <-- CORRECCIÓN AQUÍ
import TableView from '@/components/TableView';
import EditableCell from '@/components/EditableCell';
import { ColumnDef } from '@tanstack/react-table';
import SelectCell from '@/components/SelectCell';
console.log('Inspeccionando EditableCell:', EditableCell);
console.log('Inspeccionando SelectCell:', SelectCell);
import EditableDateCell from '@/components/EditableDateCell';
import { EventClickArg } from '@fullcalendar/core';
const TEAM_COLORS: { [key: string]: { background: string, text: string } } = {
    Marketing:        { background: '#fdf2f8', text: '#be185d' }, // Rosa
    Producto:         { background: '#f0fdf4', text: '#166534' }, // Verde
    'Customer Success': { background: '#ecfeff', text: '#0e7490' }, // Cian
    General:          { background: '#f3f4f6', text: '#4b5563' }, // Gris
  };
  const TeamBadge = ({ team }: { team: string }) => {
    const teamColor = TEAM_COLORS[team] || TEAM_COLORS['General'];
    return (
      <span
        className="px-2 py-1 text-xs font-semibold rounded-full"
        style={{
          backgroundColor: teamColor.background,
          color: teamColor.text,
        }}
      >
        {team}
      </span>
    );
  };

  type CompanyEvent = {
    id: string;
    title: string;
    start: string;
    end: string | undefined;
    backgroundColor?: string; // <-- AÑADE ESTA LÍNEA
    textColor?: string;     // <-- Y ESTA LÍNEA
    borderColor?: string;   // <-- Y ESTA LÍNEA
    extendedProps: {
      description: string | null;
      video_link: string | null;
      team: string;
      custom_data?: any;
    }
  };
  // Debajo de tu "type CompanyEvent"
type CompanyEventFromDB = {
    id: number;
    title: string;
    start_date: string;
    end_date: string | null;
    description: string | null;
    video_link: string | null;
    team: string;
    custom_data: any; // Dejamos 'any' aquí a propósito porque custom_data es flexible por diseño.
  };

export default function CalendarPage() {
  const { supabase, user } = useAuth();
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CompanyEvent | null>(null);
  const [oneditEvent, setOneEditEvent] = useState<CompanyEvent | null>(null);
  const [teamFilter, setTeamFilter] = useState('Todos');
  const filteredEvents = useMemo(() => {
    if (teamFilter === 'Todos') {
      return events; // Si el filtro es "Todos", muestra todos los eventos
    }
    // Si no, filtra los eventos cuyo equipo coincida con el filtro
    return events.filter(event => event.extendedProps.team === teamFilter);
  }, [events, teamFilter]);

  const fetchEvents = useCallback(async () => { // <-- ENVOLVEMOS LA FUNCIÓN
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from('company_events').select('*');

    if (error) {
      console.error('Error fetching company events:', error);
    } else if (data) {
        const formattedEvents = data.map((event: CompanyEventFromDB) => {
            const teamColor = TEAM_COLORS[event.team] || TEAM_COLORS['General'];
            return {
              id: String(event.id),
              title: event.title,
              start: event.start_date,
              end: event.end_date || undefined,
              backgroundColor: teamColor.background,
              textColor: teamColor.text,
              borderColor: teamColor.text, // Usamos el mismo color del texto para el borde
              extendedProps: {
                description: event.description,
                video_link: event.video_link,
                team: event.team
              }
            };
          });
      setEvents(formattedEvents);
    }
    setLoading(false);
}, [supabase]);
  

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]); 

  const handleEventClick = (eventInfo: EventClickArg | CompanyEvent) => {
    // Primero, determinamos si recibimos el objeto del calendario o el de la tabla
    const eventObject = 'event' in eventInfo ? eventInfo.event : eventInfo;
    const eventId = String(eventObject.id); // Nos aseguramos de que el ID sea un string
  
    // Buscamos el evento completo en nuestro estado
    const eventData = events.find(e => e.id === eventId);
    if (eventData) {
      setSelectedEvent(eventData);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return; // Nos aseguramos de que haya un evento seleccionado
  
    // Pedimos confirmación al usuario para evitar borrados accidentales
    const isConfirmed = window.confirm(`¿Estás seguro de que quieres eliminar el evento "${selectedEvent.title}"? Esta acción no se puede deshacer.`);
  
    if (isConfirmed && supabase) {
      const { error } = await supabase
        .from('company_events')
        .delete()
        .eq('id', Number(selectedEvent.id));
  
      if (error) {
        alert('Error al eliminar el evento: ' + error.message);
      } else {
        setSelectedEvent(null); // Cierra el modal de detalles
        await fetchEvents();     // Refresca el calendario para quitar el evento
      }
    }
  };

  type EventUpdatePayload = {
    title: string;
    description: string | null;
    start_date: string;
    end_date: string | null;
    team: string;
    video_link: string | null;
  };
  
  const handleUpdateEvent = async (eventId: string, updatedData: EventUpdatePayload) => {
    if (!supabase) return;
  
    const { error } = await supabase
      .from('company_events')
      .update(updatedData) // Pasamos todos los datos actualizados
      .eq('id', Number(eventId));
  
    if (error) {
      alert('Error al actualizar el evento: ' + error.message);
    } else {
      setSelectedEvent(null);
      await fetchEvents();
    }
  };

  // En app/calendar/page.tsx
  const handleUpdateEventField = async (eventId: string, columnId: string, value: string | number | null) => {
    if (!supabase) return;
  
    let updateObject: { [key: string]: string | number | null | object } = {};
  
    if (['title', 'start_date', 'team'].includes(columnId)) {
      updateObject = { [columnId]: value };
    } else {
      const { data: currentData } = await supabase
        .from('company_events')
        .select('custom_data')
        .eq('id', Number(eventId))
        .single();
  
      const newCustomData = {
        ...(currentData?.custom_data || {}),
        [columnId]: value,
      };
      updateObject = { custom_data: newCustomData };
    }
  
    // 👇 CAMBIO CLAVE: Añadimos .select().single() al final de la actualización
    const { data: updatedEvent, error } = await supabase
      .from('company_events')
      .update(updateObject)
      .eq('id', Number(eventId))
      .select() // Le pedimos que nos devuelva la fila actualizada
      .single(); // Y que nos la dé como un solo objeto
  
    if (error) {
      alert('Error al actualizar el campo: ' + error.message);
    } else if (updatedEvent) {

        const typedUpdatedEvent = updatedEvent as CompanyEventFromDB;
      // 👇 YA NO LLAMAMOS a fetchEvents(). 
      // Actualizamos el estado localmente con los datos frescos que recibimos.
  
      // Primero, formateamos el evento que nos devuelve Supabase
      const formattedEvent = {
        id: String(typedUpdatedEvent.id),
        title: typedUpdatedEvent.title,
        start: typedUpdatedEvent.start_date,
        end: typedUpdatedEvent.end_date || undefined,
        backgroundColor: TEAM_COLORS[typedUpdatedEvent.team]?.background || TEAM_COLORS['General'].background,
        textColor: TEAM_COLORS[typedUpdatedEvent.team]?.text || TEAM_COLORS['General'].text,
        borderColor: TEAM_COLORS[typedUpdatedEvent.team]?.text || TEAM_COLORS['General'].text,
        extendedProps: {
          description: typedUpdatedEvent.description,
          video_link: typedUpdatedEvent.video_link,
          team: typedUpdatedEvent.team,
          custom_data: typedUpdatedEvent.custom_data
        }
      };
  
      // Reemplazamos solo el evento modificado en nuestra lista de eventos
      setEvents(currentEvents => 
        currentEvents.map(event => 
          event.id === eventId ? formattedEvent : event
        )
      );
    }
  };

  // En app/calendar/page.tsx
  const handleAddNewRow = async () => {
    if (!supabase) return;
  
    const { data: newEventData, error } = await supabase
      .rpc('create_blank_event', {
        p_team: teamFilter === 'Todos' ? 'General' : teamFilter 
      });
  
    if (error) {
      alert('Error al crear la nueva fila: ' + error.message);
    } else if (newEventData && newEventData.length > 0) {
        const newEvent = newEventData[0] as CompanyEventFromDB; // <-- CAMBIO CLAVE AQUÍ
        const teamColor = TEAM_COLORS[newEvent.team] || TEAM_COLORS['General'];
  
      // 👇 VERSIÓN CORREGIDA Y COMPLETA DEL EVENTO FORMATEADO
      const formattedEvent: CompanyEvent = {
        id: String(newEvent.id),
        title: newEvent.title,
        start: newEvent.start_date,
        end: newEvent.end_date || undefined,
        backgroundColor: teamColor.background,
        textColor: teamColor.text,
        borderColor: teamColor.text,
        extendedProps: {
          description: newEvent.description,
          video_link: newEvent.video_link,
          team: newEvent.team,
          custom_data: newEvent.custom_data
        }
      };
  
      setEvents(currentEvents => [formattedEvent, ...currentEvents]);
    }
  };
  // En app/calendar/page.tsx, dentro del componente CalendarPage

// Definimos las columnas que queremos para la tabla
const ESTADO_OPTIONS = ['Sin empezar', 'Escribiendo Guión', 'Creando', 'Grabando', 'Editando', 'Programando', 'Publicado'];
const FORMATO_OPTIONS = ['Post', 'Story', 'Reel'];
const PILAR_OPTIONS = ['Educativo', 'Venta', 'Divertido'];

// En app/calendar/page.tsx, reemplaza tu 'marketingColumns'

// In app/calendar/page.tsx, replace your 'marketingColumns'
const marketingColumns: ColumnDef<CompanyEvent>[] = [
    {
      accessorKey: 'title',
      header: 'Nombre',
      cell: ({ getValue, row, column }) => (
        <EditableCell
          initialValue={getValue() as string}
          onSave={(newValue) => handleUpdateEventField(row.original.id, column.id, newValue)}
        />
      ),
    },
    {
        accessorFn: (row: CompanyEvent) => row.start,
        header: 'Fecha',
        id: 'start_date', // Le damos un ID que coincida con la columna de la DB
        cell: ({ getValue, row, column }) => (
          <EditableDateCell
            initialValue={getValue() as string}
            onSave={(newValue) => handleUpdateEventField(row.original.id, column.id, newValue)}
          />
        ),
      },
    {
      accessorFn: (row: CompanyEvent) => row.extendedProps.team,
      header: 'Equipo',
      cell: (info) => <TeamBadge team={info.getValue() as string} />,
    },
    {
      accessorFn: (row) => row.extendedProps.custom_data?.Formato || '',
      header: 'Formato',
      id: 'Formato',
      // 👇 CAMBIO: Ahora usa un selector editable
      cell: ({ getValue, row, column }) => (
        <SelectCell
          initialValue={getValue() as string}
          onSave={(newValue) => handleUpdateEventField(row.original.id, column.id, newValue)}
          options={FORMATO_OPTIONS}
        />
      ),
    },
    {
      accessorFn: (row) => row.extendedProps.custom_data?.['Pilar de Contenido'] || '',
      header: 'Pilar de Contenido',
      id: 'Pilar de Contenido',
      // 👇 CAMBIO: Ahora usa un selector editable
      cell: ({ getValue, row, column }) => (
        <SelectCell
          initialValue={getValue() as string}
          onSave={(newValue) => handleUpdateEventField(row.original.id, column.id, newValue)}
          options={PILAR_OPTIONS}
        />
      ),
    },
    {
      accessorFn: (row) => row.extendedProps.custom_data?.Estado || '',
      header: 'Estado',
      id: 'Estado',
      cell: ({ getValue, row, column }) => (
        <SelectCell
          initialValue={getValue() as string}
          onSave={(newValue) => handleUpdateEventField(row.original.id, column.id, newValue)}
          options={ESTADO_OPTIONS}
        />
      ),
    },
    {
      id: 'actions',
      header: 'Detalles',
      cell: ({ row }) => (
        <button 
          onClick={() => handleEventClick(row.original)}
          className="p-1 text-gray-400 transition-colors"
          title="Ver detalles del evento"
          onMouseEnter={(e) => e.currentTarget.style.color = '#3c527a'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      ),
    }
  ];

  return (
    <AuthGuard>
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold" style={{ color: '#383838' }}>
              Calendario de Compañía
            </h1>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
  {Object.entries(TEAM_COLORS).map(([team, colors]) => (
    <div key={team} className="flex items-center gap-2">
      <div 
        className="w-4 h-4 rounded-full" 
        style={{ backgroundColor: colors.background, border: `2px solid ${colors.text}` }}
      ></div>
      <span className="text-sm font-medium" style={{ color: '#383838' }}>{team}</span>
    </div>
  ))}
</div>
<div>
    <select
      value={teamFilter}
      onChange={(e) => setTeamFilter(e.target.value)}
      className="rounded-md border-gray-300 shadow-sm"
    >
      <option value="Todos">Todos los Equipos</option>
      {Object.keys(TEAM_COLORS).map(team => (
        <option key={team} value={team}>{team}</option>
      ))}
    </select>
  </div>
            <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md transition-opacity"
                style={{ backgroundColor: '#ff8080' }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                <UserPlusIcon className="h-5 w-5" />
                Crear Evento
              </button>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border">
            {loading ? (
                <p>Cargando calendario...</p>
            ) : (
                <FullCalendar
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    locale="es"
                    headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: 'dayGridMonth,dayGridWeek'
                    }}
                    buttonText={{
                        today:    'Hoy',
                        month:    'Mes',
                        week:     'Semana',
                    }}
                    height="auto"
                    eventClick={handleEventClick}
                    events={filteredEvents} 
                />
            )}
            <TableView onUpdateEvent={handleUpdateEventField} columns={marketingColumns} events={filteredEvents} />
            <div className="mt-2">
    <button 
        onClick={handleAddNewRow}
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded-md"
    >
        <PlusIcon className="h-4 w-4" />
        Añadir evento
    </button>
</div>
        </div>
      </main>

      <AddEventModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onEventAdded={() => fetchEvents()}
        supabase={supabase}
        user={user}
      />
      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onDelete={handleDeleteEvent}
        onUpdate={handleUpdateEvent}
      />
    </AuthGuard>
  );
}