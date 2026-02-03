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
import EditableDateCell from '@/components/EditableDateCell';
import { EventClickArg, EventContentArg, DatesSetArg, EventDropArg } from '@fullcalendar/core';
import { Toaster, toast } from 'sonner';
import * as Flags from 'country-flag-icons/react/3x2';

type TeamMember = {
  user_id: string;
  email: string;
  role: string;
};

const TEAM_COLORS: { [key: string]: { background: string, text: string } } = {
    Marketing:        { background: '#fdf2f8', text: '#be185d' }, // Rosa
    Producto:         { background: '#f0fdf4', text: '#166534' }, // Verde
    'Customer Success': { background: '#ecfeff', text: '#0e7490' }, // Cian
    General:          { background: '#f3f4f6', text: '#4b5563' }, // Gris
    'Kali Te Enseña':  { background: '#f2f75e', text: '#92961a' }, 
  };

  const COUNTRY_FLAGS: { [key: string]: string } = {
    'Chile': '🇨🇱',
    'México': '🇲🇽',
    'Perú': '🇵🇪',
    'Colombia': '🇨🇴',
    'Ecuador': '🇪🇨',
    'Todos': '🌎', // Un mundo para "Todos"
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
    borderColor?: string;
    is_draft?: boolean;
    task_id?: number | null;   // <-- Y ESTA LÍNEA
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
    is_draft: boolean;
    task_id?: number | null;
    custom_data: any;
    // 👇 CAMBIO: Aceptamos Objeto O Array para evitar errores
    task_data?: {
      status: string;
      completed: boolean;
    } | {
      status: string;
      completed: boolean;
    }[] | null; 
};

  // --- PLANTILLA PARA DISEÑAR CADA EVENTO EN EL CALENDARIO ---
  // --- PLANTILLA PARA DISEÑAR CADA EVENTO EN EL CALENDARIO ---
  
  
  // Justo debajo de esta función debería estar tu línea:
  // export default function CalendarPage() { ... }

export default function CalendarPage() {
  const { supabase, user } = useAuth();
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CompanyEvent | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase.rpc('get_team_members');
      if (data) setTeamMembers(data);
  };
  fetchMembers();
  }, [supabase]);
  const [oneditEvent, setOneEditEvent] = useState<CompanyEvent | null>(null);
  const [teamFilter, setTeamFilter] = useState('Todos');
  const [viewDateRange, setViewDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const filteredEvents = useMemo(() => {
    if (teamFilter === 'Todos') {
      return events; // Si el filtro es "Todos", muestra todos los eventos
    }
    // Si no, filtra los eventos cuyo equipo coincida con el filtro
    return events.filter(event => event.extendedProps.team === teamFilter);
  }, [events, teamFilter]);
  const marketingEvents = useMemo(() => 
    events.filter(event => event.extendedProps.team === 'Marketing'), 
    [events]
);
const tableEvents = useMemo(() => {
  // Si el rango de fechas aún no se ha cargado, mostramos todo lo de marketing
  if (!viewDateRange) {
      return marketingEvents;
  }

  // Convertimos las fechas del rango a un formato comparable (sin la hora)
  const viewStart = new Date(viewDateRange.start.toDateString());
  const viewEnd = new Date(viewDateRange.end.toDateString());
  
  return marketingEvents.filter(event => {
      // Nos aseguramos de que el evento tenga una fecha de inicio
      if (!event.start) return false; 
      
      // Convertimos la fecha de inicio del evento
      const eventStart = new Date(new Date(event.start).toDateString());
      
      // Comprobamos si la fecha de inicio del evento está DENTRO del rango visible
      // (FullCalendar nos da 'end' como el día *después* del último día visible, por eso usamos '<')
      return eventStart >= viewStart && eventStart < viewEnd;
  });
}, [marketingEvents, viewDateRange]);

  // En app/calendar/page.tsx

  const fetchEvents = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    const { data, error } = await supabase
        .from('company_events')
        .select(`
          *,
          task_data:tasks (
            id,
            title,
            status,
            completed,
            project_id,
            assignee_user_id
          )
        `) // <--- Fíjate que aquí ya no hay barras // ni texto extra
        

    if (error) {
        console.error('Error fetching company events:', error);
    } else if (data) {
        // Log para depuración (Míralo en la consola del navegador F12)
        console.log("🔥 Datos crudos de eventos:", data);

        const eventsData = data as unknown as CompanyEventFromDB[];

        const formattedEvents = eventsData.map((event) => {
            const teamColor = TEAM_COLORS[event.team] || TEAM_COLORS['General'];
            
            // 👇 LÓGICA HÍBRIDA (A prueba de errores) 👇
            let linkedTask = null;

            if (event.task_data) {
                if (Array.isArray(event.task_data)) {
                    // Si por alguna razón llega como array, tomamos el primero
                    linkedTask = event.task_data.length > 0 ? event.task_data[0] : null;
                } else {
                    // Si llega como objeto (lo más probable), lo usamos directo
                    linkedTask = event.task_data;
                }
            }
            
            const isCompleted = linkedTask?.completed === true;

            if (event.title === "Esto es una prueba") { // O el nombre de tu evento
              console.warn("🕵️ REPORTE PARA EL DEV:", {
                  Titulo: event.title,
                  Tiene_Task_ID: event.task_id,
                  Data_Tarea_Cruda: event.task_data, // ¿Viene null o con datos?
                  Tarea_Procesada: linkedTask,
                  Esta_Completada: isCompleted
              });
          }

            return {
                id: String(event.id),
                title: event.title,
                start: event.start_date,
                end: event.end_date || undefined,
                backgroundColor: teamColor.background,
                textColor: teamColor.text,
                borderColor: teamColor.text,
                is_draft: event.is_draft,
                task_id: event.task_id,
                extendedProps: {
                    description: event.description,
                    video_link: event.video_link,
                    team: event.team,
                    custom_data: event.custom_data,
                    task_data: linkedTask, // <--- Añadimos la tarea procesada
                    
                    has_task: !!event.task_id,
                    is_completed: isCompleted
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

    if (isSelectionMode) {
      // Obtenemos el ID del evento clickeado
      const eventObject = 'event' in eventInfo ? eventInfo.event : eventInfo;
      const clickedId = String(eventObject.id);
      
      // Si ya estaba seleccionado, lo sacamos. Si no, lo metemos.
      if (selectedEventIds.includes(clickedId)) {
          setSelectedEventIds(prev => prev.filter(id => id !== clickedId));
      } else {
          setSelectedEventIds(prev => [...prev, clickedId]);
      }
      return; // ⛔ ¡ALTO AQUÍ! No dejamos que se abra el modal.
  }

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
    custom_data?: any;
    // 👇 Nuevos campos opcionales para la lógica de tareas
    create_task?: boolean;
    task_assignee_id?: string;
    task_project_id?: number;
    task_due_date?: string;
  };
  
  // app/calendar/page.tsx

  // --- PEGAR DEBAJO DE handleDeleteEvent ---

  const handleDuplicateCompletion = async (newEventFromDB: any) => {
    // 1. Refrescamos la data de fondo para que el calendario sepa que hay algo nuevo
    await fetchEvents();

    toast.success("Copia creada. Ahora puedes editarla.");

    // 2. Necesitamos "disfrazar" el dato crudo de la DB para que el Modal lo entienda
    // (Esto es necesario porque el Modal espera un formato específico de FullCalendar)
    const teamColor = TEAM_COLORS[newEventFromDB.team] || TEAM_COLORS['General'];

    const formattedNewEvent: CompanyEvent = {
        id: String(newEventFromDB.id),
        title: newEventFromDB.title,
        start: newEventFromDB.start_date,
        end: newEventFromDB.end_date || undefined,
        backgroundColor: teamColor.background,
        textColor: teamColor.text,
        borderColor: teamColor.text,
        is_draft: newEventFromDB.is_draft,
        task_id: newEventFromDB.task_id,
        extendedProps: {
            description: newEventFromDB.description,
            video_link: newEventFromDB.video_link,
            team: newEventFromDB.team,
            custom_data: newEventFromDB.custom_data,
            // Importante: Al abrirlo de inmediato, task_id es suficiente 
            // para que el modal sepa si se creó tarea o no.
        }
    };

    // 3. ¡Magia! Cambiamos el evento seleccionado por el nuevo.
    // Esto cerrará el modal viejo (porque cambió el ID) y abrirá el nuevo con los datos cargados.
    setSelectedEvent(formattedNewEvent);
  };

  // --- FUNCIÓN DE DUPLICADO MASIVO ---
  // --- FUNCIÓN DE DUPLICADO MASIVO (VERSIÓN SONNER) ---
  const handleBulkDuplicate = () => {
    if (selectedEventIds.length === 0) return;

    // 1. Lanzamos el Toast de Confirmación
    toast(`¿Duplicar ${selectedEventIds.length} eventos?`, {
        description: "Se crearán copias para la próxima semana (+7 días).",
        action: {
            label: "Sí, Duplicar",
            onClick: async () => {
                // 2. Definimos la promesa (la acción que tarda tiempo)
                const duplicationPromise = new Promise(async (resolve, reject) => {
                    if (!supabase) return reject("No hay conexión a Supabase");

                    try {
                        const { error } = await supabase.rpc('duplicate_events_bulk', {
                            p_event_ids: selectedEventIds.map(Number),
                            p_offset_days: 7
                        });

                        if (error) throw error;

                        // Éxito: Limpiamos todo
                        setSelectedEventIds([]);
                        setIsSelectionMode(false);
                        await fetchEvents();
                        
                        resolve("¡Eventos creados correctamente! 🚀");
                    } catch (error: any) {
                        reject(error.message);
                    }
                });

                // 3. Ejecutamos la promesa con feedback visual
                toast.promise(duplicationPromise, {
                    loading: 'Clonando eventos...',
                    success: (data) => `${data}`,
                    error: (err) => `Error: ${err}`,
                });
            }
        },
        cancel: {
            label: "Cancelar",
            onClick: () => console.log("Cancelado por usuario")
        },
        duration: 5000, // Damos tiempo para pensar
    });
  };

  // --- FUNCIÓN DE ELIMINACIÓN MASIVA ---
  const handleBulkDelete = () => {
    if (selectedEventIds.length === 0) return;

    // 1. Toast de Confirmación (Estilo Peligro)
    toast(`¿Eliminar ${selectedEventIds.length} eventos de forma permanente?`, {
        description: "Esta acción no se puede deshacer.",
        action: {
            label: "Sí, Eliminar Todo",
            onClick: async () => {
                // 2. Promesa de Eliminación
                const deletePromise = new Promise(async (resolve, reject) => {
                    if (!supabase) return reject("No hay conexión");

                    try {
                        // Usamos .in() para borrar todos los IDs que coincidan con la lista
                        const { error } = await supabase
                            .from('company_events')
                            .delete()
                            .in('id', selectedEventIds.map(Number));

                        if (error) throw error;

                        // Limpieza
                        setSelectedEventIds([]);
                        setIsSelectionMode(false);
                        await fetchEvents();
                        
                        resolve("Eventos eliminados correctamente 🗑️");
                    } catch (error: any) {
                        reject(error.message);
                    }
                });

                // 3. Feedback visual
                toast.promise(deletePromise, {
                    loading: 'Eliminando...',
                    success: (data) => `${data}`,
                    error: (err) => `Error: ${err}`,
                });
            }
        },
        cancel: {
            label: "Cancelar",
            onClick: () => console.log("Cancelado por usuario"),
        },
        duration: 5000,
    });
  };

  const handleUpdateEvent = async (eventId: string, updatedData: EventUpdatePayload) => {
    if (!supabase) return;

    // 1. DESESTRUCTURACIÓN (El paso clave que falta)
    // Separamos los datos visuales (create_task, etc) de los datos reales del evento
    const {
        create_task,
        task_assignee_id,
        task_project_id,
        task_due_date,
        ...eventFields // <--- Aquí quedan SOLO los campos que sí existen en company_events
    } = updatedData;

    try {
        let taskIdToLink = null;

        // 2. Si el usuario pidió crear tarea, la creamos
        if (create_task) {
             if (!user) throw new Error("Debes iniciar sesión para crear tareas.");

             const newTaskPayload = {
                 title: eventFields.title,
                 description: eventFields.description,
                 status: 'Por Hacer',
                 project_id: task_project_id || null,
                 assignee_user_id: task_assignee_id || null,
                 owner_id: user.id,
                 team_id: 2, 
                 due_date: task_due_date || null,
                 completed: false
             };

             const { data: taskData, error: taskError } = await supabase
                 .from('tasks')
                 .insert(newTaskPayload)
                 .select('id')
                 .single();

             if (taskError) throw taskError;
             taskIdToLink = taskData.id;
        }

        // 3. ACTUALIZAMOS EL EVENTO (Usando eventFields limpios)
        const finalEventPayload: any = { ...eventFields };
        
        if (taskIdToLink) {
            finalEventPayload.task_id = taskIdToLink;
        }

        const { error } = await supabase
          .from('company_events')
          .update(finalEventPayload) // <--- Ahora sí, sin campos basura
          .eq('id', Number(eventId));
      
        if (error) throw error;

        // 4. Éxito
        setSelectedEvent(null);
        await fetchEvents();

    } catch (error: any) {
        console.error("Error en update:", error);
        alert('Error al actualizar el evento: ' + error.message);
    }
  };

  // En app/calendar/page.tsx
  const handleUpdateEventField = async (eventId: string, columnId: string, value: any) => {
    if (!supabase) return;

    // --- INICIO DE LA LÓGICA DE ACTUALIZACIÓN OPTIMISTA ---

    // 1. Guardamos una copia del estado actual, por si necesitamos revertir en caso de error.
    const originalEvents = [...events];

    // 2. Creamos el nuevo estado de la lista de eventos de forma anticipada.
    const newEvents = events.map(event => {
        if (event.id === eventId) {
            // Si este es el evento que estamos cambiando...
            const updatedEvent = { ...event };
            const customDataFields = ['Formato', 'Pilar de Contenido', 'Estado'];

            // Actualizamos el campo correspondiente en el objeto del evento.
            if (customDataFields.includes(columnId)) {
                updatedEvent.extendedProps.custom_data = {
                    ...updatedEvent.extendedProps.custom_data,
                    [columnId]: value,
                };
            } else if (columnId === 'title') {
                updatedEvent.title = value;
            } else if (columnId === 'start_date') {
                updatedEvent.start = value;
            }
            
            // Si es un borrador y le ponemos título, lo "publicamos".
            if (event.is_draft && columnId === 'title' && value) {
                updatedEvent.is_draft = false;
            }

            return updatedEvent;
        }
        return event; // Para los demás eventos, no hacemos nada.
    });

    // 3. ¡Actualizamos la UI al instante con el nuevo estado!
    setEvents(newEvents);

    // 4. Ahora, intentamos guardar en la base de datos en segundo plano.
    try {
        const originalEventFromState = originalEvents.find(e => e.id === eventId);
        let updateObject: { [key: string]: any } = {};
        const customDataFields = ['Formato', 'Pilar de Contenido', 'Estado'];

        if (customDataFields.includes(columnId)) {
            const newCustomData = {
                ...originalEventFromState?.extendedProps.custom_data,
                [columnId]: value,
            };
            updateObject = { custom_data: newCustomData };
        } else {
            updateObject = { [columnId]: value };
        }

        if (originalEventFromState?.is_draft && value) {
          updateObject.is_draft = false;
      }

      console.log('Objeto que se enviará a Supabase:', updateObject);

        const { error } = await supabase
            .from('company_events')
            .update(updateObject)
            .eq('id', Number(eventId));

        // Si la base de datos da un error, lo "lanzamos" para que el 'catch' lo atrape.
        if (error) {
            throw error;
        }
        if (originalEventFromState?.is_draft && value) {
          const { error: publishError } = await supabase.rpc('publish_event', { p_event_id: Number(eventId) });
          if (publishError) throw publishError;
      }
    } catch (error) {
        // 5. Si algo falla al guardar, mostramos una alerta y revertimos la UI a su estado original.
        alert('Error al guardar el cambio: ' + (error as Error).message);
        setEvents(originalEvents);
    }
};

  // En app/calendar/page.tsx
  const handleAddNewRow = async () => {
    if (!supabase) return;
  
    const { data: newEventData, error } = await supabase
      .rpc('create_blank_event', {
        p_team: 'Marketing'
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
        is_draft: newEvent.is_draft,
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

  const handleDatesSet = (dateInfo: DatesSetArg) => {
    setViewDateRange({
      start: dateInfo.start,
      end: dateInfo.end
    });
  };
  // En app/calendar/page.tsx, dentro del componente CalendarPage

// Definimos las columnas que queremos para la tabla
const ESTADO_OPTIONS = ['Sin estado','Sin empezar', 'Escribiendo Guión', 'Creando', 'Grabando', 'Editando', 'Programando', 'Publicado'];
const FORMATO_OPTIONS = ['Sin formato', 'Post', 'Blog', 'Story', 'Reel', 'In-app Notification', 'Correo'];
const PILAR_OPTIONS = ['Sin pilar', 'Educativo', 'Venta', 'Divertido'];

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

  // --- LÓGICA DE DRAG & DROP ---
  const handleEventDrop = async (info: EventDropArg) => {
    if (!supabase) return;

    // 1. Capturamos los datos
    const eventId = info.event.id;
    const newStart = info.event.start;
    const newEnd = info.event.end;
    const taskId = info.event.extendedProps.task_id; // Aquí usamos el ID que mapeamos en fetchEvents

    // Helper para formatear fecha a YYYY-MM-DD
    const toISODate = (d: Date) => d.toISOString().split('T')[0];

    if (!newStart) return;

    try {
      // 2. Actualizamos el Evento en Supabase
      const updatePayload: any = {
        start_date: toISODate(newStart),
      };
      if (newEnd) {
        updatePayload.end_date = toISODate(newEnd);
      }

      const { error: eventError } = await supabase
        .from('company_events')
        .update(updatePayload)
        .eq('id', Number(eventId));

      if (eventError) throw eventError;

      // 3. Sincronización: Si tiene tarea vinculada, la movemos
      if (taskId) {
        // Lógica de negocio: La tarea vence 1 día antes del evento (igual que en tu modal)
        const newTaskDueDate = new Date(newStart);
        newTaskDueDate.setDate(newTaskDueDate.getDate() - 1); 
        
        const { error: taskError } = await supabase
          .from('tasks') // Asegúrate de que tu tabla pública sea 'tasks'
          .update({ due_date: toISODate(newTaskDueDate) })
          .eq('id', taskId);

        if (taskError) {
            console.error('Error sincronizando tarea:', taskError);
            // No revertimos el evento porque el evento sí se movió bien, solo avisamos
            alert('El evento se movió, pero hubo un error actualizando la fecha de la tarea.');
        } else {
            console.log('Sincronización exitosa: Tarea movida al', toISODate(newTaskDueDate));
        }
      }

    } catch (error) {
      console.error('Error al mover evento:', error);
      alert('No se pudo mover el evento. Intenta nuevamente.');
      info.revert(); // IMPORTANTE: Devuelve el evento a su posición original visualmente
    }
  };

  const getCountryCode = (countryName: string): string | undefined => {
    const countryMap: { [key: string]: string } = {
      'Chile': 'CL',
      'México': 'MX',
      'Perú': 'PE',
      'Colombia': 'CO',
      'Ecuador': 'EC',
      'Todos': 'UN', // 'UN' (United Nations) puede servir para 'Todos', o podrías usar un icono global
    };
    return countryMap[countryName];
  };

  // Esta función ahora vive DENTRO de CalendarPage
  const renderEventContent = (eventInfo: EventContentArg) => { // Cambié 'function' por 'const' para que sea más moderno
    const { custom_data, has_task, is_completed } = eventInfo.event.extendedProps;
    const estado = custom_data?.Estado;
    const formato = custom_data?.Formato;
    const pilar = custom_data?.['Pilar de Contenido'];
    const pais = custom_data?.Pais;     // Ej: 'Chile'
    const casoUso = custom_data?.CasoUso;
    
    // 👇 1. Averiguamos si este evento está seleccionado
    const isSelected = selectedEventIds.includes(eventInfo.event.id);

    return (
      // 👇 2. Cambiamos el cursor si estamos seleccionando
      <div className={`p-1 overflow-hidden text-xs w-full relative ${isSelectionMode ? 'cursor-pointer' : 'cursor-pointer'}`}>
        
        {/* 👇 3. LÓGICA DEL CHECKBOX DE SELECCIÓN (ESTILO CORREGIDO) */}
        {isSelectionMode && (
           <div className="absolute top-0 left-0 bottom-0 right-0 z-50 bg-white/30 flex items-end justify-end p-1.5 transition-all">
              {/* 1. bg-white/30: Aclara un poco la tarjeta para indicar que está seleccionable.
                 2. items-end justify-end: Empuja el contenido (el checkbox) abajo a la derecha.
                 3. p-1.5: Le da un pequeño margen para que no quede pegado al borde.
              */}
              <input 
                type="checkbox" 
                checked={isSelected}
                onChange={() => {}} 
                className="w-4 h-4 text-indigo-600 rounded border-gray-300 bg-white shadow-md ring-1 ring-black/5"
                style={{ cursor: 'pointer' }}
              />
           </div>
        )}

        {/* --- LÓGICA VISUAL DE ESTADO (TU CÓDIGO ORIGINAL) --- */}
        {has_task && (
            is_completed ? (
                <div className="absolute top-0 right-0 bg-green-50 rounded-full p-0.5 shadow-sm border border-green-200 flex -space-x-1 z-10">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-green-600">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-green-600">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                </div>
            ) : (
                <div className="absolute top-0 right-0 bg-white rounded-full p-0.5 shadow-sm border border-gray-200 z-10">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-purple-600">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                </div>
            )
        )}

        <b className="truncate block pr-6">{eventInfo.event.title}</b>
        
        <div className="flex flex-wrap gap-1 mt-1">
          {estado && <span className="bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded-full font-medium">{estado}</span>}
          {formato && <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">{formato}</span>}
          {pilar && <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full font-medium">{pilar}</span>}
          {pais && (() => {
  const countryCode = getCountryCode(pais);
  const FlagComponent = countryCode ? Flags[countryCode as keyof typeof Flags] : null;

  return (
    <span className="bg-white border border-gray-200 text-gray-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 shadorenderEventContentw-sm">
      {/* Si es 'Todos', usamos el emoji del mundo. Si no, intentamos usar la bandera SVG */}
      {/* ETIQUETA SOLO BANDERA (Versión Minimalista) */}
      {/* ETIQUETA SOLO BANDERA (Versión "Clean") */}
      {pais && (() => {
             const countryCode = getCountryCode(pais);
             const FlagComponent = countryCode ? Flags[countryCode as keyof typeof Flags] : null;

             let iconContent;
             if (pais === 'Todos') {
                 iconContent = <span className="text-base leading-none filter drop-shadow-sm">🌎</span>;
             } else if (FlagComponent) {
                 // Aumenté un poquito el tamaño (w-6) ya que le quitamos el marco blanco
                 // 'rounded-[2px]' le da un borde apenas suavizado, más elegante que el rounded-md
                 iconContent = <FlagComponent className="w-6 h-auto rounded-[2px] shadow-sm object-cover" />;
             } else {
                 iconContent = <span className="text-sm leading-none">🏳️</span>;
             }

             return (
                // 1. Quitamos 'bg-white', 'border', 'p-1'.
                // 2. Dejamos 'flex' para alinear y 'hover:scale-110' para un efecto bonito al pasar el mouse
                <span 
                  className="flex items-center justify-center h-fit transition-transform hover:scale-110 cursor-help" 
                  title={pais} // El tooltip sigue funcionando
                >
                   {iconContent}
                </span>
             );
          })()}
          </span>
  );
})()}
          {casoUso && (
            <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full font-medium border border-yellow-200">
               {casoUso}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <AuthGuard>
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* --- ENCABEZADO Y CONTROLES --- */}
        <div className="flex flex-col gap-6 mb-8">
            
            {/* 1. Fila Superior: Título y Acciones Principales */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                        Calendario de Compañía
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Gestiona y planifica el contenido de tus equipos.
                    </p>
                </div>

                {/* Bloque de Botones (Lógica de Selección) */}
                <div className="flex items-center gap-3">
                    {isSelectionMode ? (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                             <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-full border border-indigo-100">
                                {selectedEventIds.length} seleccionados
                            </span>
                            
                            <button
                                onClick={() => {
                                    setIsSelectionMode(false);
                                    setSelectedEventIds([]);
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-all shadow-sm"
                            >
                                Cancelar
                            </button>

                            {/* Botón Eliminar (NUEVO) */}
                            <button
                                onClick={handleBulkDelete}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 hover:border-red-200 transition-all shadow-sm active:scale-95"
                                title="Eliminar seleccionados"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Eliminar ({selectedEventIds.length})
                            </button>

                            <button
                                onClick={handleBulkDuplicate}
                                disabled={selectedEventIds.length === 0}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                </svg>
                                Duplicar ({selectedEventIds.length})
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsSelectionMode(true)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm group"
                                title="Seleccionar varios eventos"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Seleccionar
                            </button>

                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-md transition-all active:scale-95 hover:brightness-110"
                                style={{ backgroundColor: '#ff8080' }}
                            >
                                <UserPlusIcon className="h-5 w-5" />
                                Crear Evento
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Fila Inferior: Barra de Herramientas (Filtros y Leyenda) */}
            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                {/* Zona Izquierda: Filtro */}
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        <select
                            value={teamFilter}
                            onChange={(e) => setTeamFilter(e.target.value)}
                            className="pl-10 pr-8 py-2 text-sm border-gray-200 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 hover:bg-white transition-colors cursor-pointer outline-none"
                        >
                            <option value="Todos">Todos los Equipos</option>
                            {Object.keys(TEAM_COLORS).map(team => (
                                <option key={team} value={team}>{team}</option>
                            ))}
                        </select>
                    </div>
                    <div className="h-6 w-px bg-gray-200 hidden md:block"></div>
                </div>

                {/* Zona Derecha: Leyenda de Colores (Estilo Badge) */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider mr-1">Equipos:</span>
                    {Object.entries(TEAM_COLORS).map(([team, colors]) => (
                        <div 
                            key={team} 
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-opacity ${teamFilter !== 'Todos' && teamFilter !== team ? 'opacity-40 grayscale' : 'opacity-100'}`}
                            style={{ 
                                backgroundColor: colors.background, 
                                color: colors.text,
                                border: `1px solid ${colors.background === '#ffffff' ? '#e5e7eb' : 'transparent'}` // Borde sutil si es blanco
                            }}
                        >
                            {team}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* --- CALENDARIO Y TABLA --- */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
            ) : (
                <FullCalendar
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridWeek"
                    locale="es"
                    firstDay={1}
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
                    eventContent={renderEventContent}
                    datesSet={handleDatesSet}
                    editable={true}
                    eventDrop={handleEventDrop}
                />
            )}
            
            <div className="mt-8 pt-8 border-t border-gray-100">
                 <TableView onUpdateEvent={handleUpdateEventField} columns={marketingColumns} events={tableEvents} />
                 <div className="mt-4">
                    <button 
                        onClick={handleAddNewRow}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors border border-dashed border-gray-300 hover:border-gray-400 w-full justify-center"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Añadir nueva fila vacía
                    </button>
                </div>
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
        teamMembers={teamMembers}
        onDuplicate={handleDuplicateCompletion}
      />
      <Toaster position="bottom-right" richColors />
    </AuthGuard>
  );}