'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import UrlPreview from '@/components/UrlPreview';
import CountdownTimer from '@/components/CountdownTimer';
import { toast } from 'sonner';

// --- TIPOS ---
type ReviewResponse = {
    reviewer_id: string;
    reviewer_email: string;
    decision: string | null;
    comment: string | null;
    responded_at: string | null;
};

type ReviewRound = {
    review_id: number;
    round_number: number;
    status: string;
    attachment_url: string;
    attachment_type: string;
    timer_hours: number;
    expires_at: string;
    created_at: string;
    resolved_at: string | null;
    requested_by_email: string;
    requester_comment: string | null;
    responses: ReviewResponse[];
};

type EventData = {
    id: string;
    title: string;
    start: string;
    end: string | undefined;
    task_id?: number | null;
    task_data?: any;
    extendedProps: {
        description: string | null;
        video_link: string | null;
        team: string;
        task_data?: any;
        review_status?: string;
        custom_data?: {
            Estado?: string;
            Formato?: string;
            'Pilar de Contenido'?: string;
            task_data?: any;
            Pais?: string;
            CasoUso?: string;
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
    custom_data: any;
    create_task?: boolean;
    task_assignee_id?: string;
    task_project_id?: number;
    task_due_date?: string;
};

type TeamMember = {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
};

type ContentProject = {
    id: number;
    name: string;
    team_name: string;
};

type EventDetailModalProps = {
    event: EventData | null;
    teamMembers?: TeamMember[];
    onClose: () => void;
    onDelete: () => void;
    onUpdate: (eventId: string, data: EventUpdatePayload) => void;
    onDuplicate?: (newEvent: any) => void;
    onReviewSubmitted?: () => void;
};

// --- CONSTANTES ---
const TEAM_COLORS: { [key: string]: { background: string, text: string } } = {
    Marketing: { background: '#fdf2f8', text: '#be185d' },
    Producto: { background: '#f0fdf4', text: '#166534' },
    'Customer Success': { background: '#ecfeff', text: '#0e7490' },
    General: { background: '#f3f4f6', text: '#4b5563' },
    'Kali Te Enseña': { background: '#f2f75e', text: '#92961a' },
};

const PAIS_OPTIONS = ['Chile', 'México', 'Perú', 'Colombia', 'Ecuador', 'Todos'];
const CASO_OPTIONS = ['Caso I: Sesión', 'Caso I: Clases', 'Caso II: Unidad','Caso II: Proyecto NEM', 'Caso III: Juegos', 'Caso IV: KaliChat', 'Caso V: PCA', 'Caso VI: Proyecto ABP']; // Puedes cambiar estos nombres

const ESTADO_OPTIONS = ['Sin estado', 'Sin empezar', 'Escribiendo Guión', 'Creando', 'Grabando', 'Editando', 'Programando', 'Publicado'];
const FORMATO_OPTIONS = ['Sin formato', 'Post', 'Blog', 'Story', 'Reel', 'In-app Notification', 'Correo'];
const PILAR_OPTIONS = ['Sin pilar', 'Educativo', 'Venta', 'Divertido'];

const DUE_DATE_PRESETS = [
    { label: 'Mismo día del evento', value: 'same_day' },
    { label: '1 día antes', value: 'one_day_before' },
    { label: 'Personalizado', value: 'custom' }
];


// --- COMPONENTE PRINCIPAL ---
export default function EventDetailModal({
    event,
    onClose,
    onDelete,
    onUpdate,
    onDuplicate,
    onReviewSubmitted,
    teamMembers = []
}: EventDetailModalProps) {
    const { supabase, user } = useAuth();

    // MODO DE VISTA: 'view' | 'edit' | 'duplicate' | 'review'
    const [viewMode, setViewMode] = useState<'view' | 'edit' | 'duplicate' | 'review'>('view');

    // Estados del formulario (Edición)
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [team, setTeam] = useState('General');

    // --- LÓGICA DE CAMBIO DE EQUIPO ---
    const handleTeamChange = (newTeam: string) => {
        // ¿Estamos saliendo de Marketing hacia otro equipo?
        const isLeavingMarketing = team === 'Marketing' && newTeam !== 'Marketing';

        if (isLeavingMarketing) {
            const confirmMessage = "⚠️ ADVERTENCIA:\n\nEstás a punto de cambiar de Marketing a otro equipo.\n\nSe eliminarán los datos de 'Estado', 'Formato' y 'Pilar de Contenido'.\n\n¿Estás seguro de que quieres continuar?";
            
            if (!window.confirm(confirmMessage)) {
                return; // Si dice "Cancelar", no hacemos nada y mantenemos Marketing
            }

            // Si dice "Sí", borramos los datos específicos de Marketing
            setEstado('');
            setFormato('');
            setPilar('');
        }

        if (team === 'Kali Te Enseña' && newTeam !== 'Kali Te Enseña') {
            const confirm = window.confirm("⚠️ Vas a cambiar de equipo. Se perderán los datos de País y Caso de Uso. ¿Seguir?");
            if (!confirm) return;
            setPais('');
            setCasoUso('');
        }
        
        // Aplicamos el cambio de equipo
        setTeam(newTeam);
    };

    const [videoLink, setVideoLink] = useState('');
    const [uploading, setUploading] = useState(false);

    // Estados de Marketing
    const [estado, setEstado] = useState('');
    const [formato, setFormato] = useState('');
    const [pilar, setPilar] = useState('');
    const [pais, setPais] = useState('');
    const [casoUso, setCasoUso] = useState('');

    const [marketingProjects, setMarketingProjects] = useState<ContentProject[]>([]);

    // Estados para Crear Nueva Tarea (Edición)
    const [wantTask, setWantTask] = useState(false);
    const [taskAssignee, setTaskAssignee] = useState('');
    const [taskProject, setTaskProject] = useState<number | ''>('');
    const [datePreset, setDatePreset] = useState('one_day_before');
    const [customTaskDate, setCustomTaskDate] = useState('');

    // --- ESTADOS PARA DUPLICACIÓN (Nuevo) ---
    const [dupConfig, setDupConfig] = useState({
        copyDetails: true,    // Descripción, Links
        copyProps: true,      // Estado, Formato, Pilar
        copyTeam: true,       // Equipo
        createTask: false     // Crear tarea nueva (por defecto false para no ensuciar)
    });
    const [isDuplicating, setIsDuplicating] = useState(false);

    // --- ESTADOS PARA REVISIÓN DE CONTENIDO ---
    const [reviewAttachmentUrl, setReviewAttachmentUrl] = useState('');
    const [reviewAttachmentType, setReviewAttachmentType] = useState<'image' | 'video' | 'drive_url'>('drive_url');
    const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
    const [timerPreset, setTimerPreset] = useState<'1' | '2' | 'custom'>('1');
    const [customTimerHours, setCustomTimerHours] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [reviewHistory, setReviewHistory] = useState<ReviewRound[]>([]);
    const [activeReview, setActiveReview] = useState<ReviewRound | null>(null);
    const [pendingResponse, setPendingResponse] = useState<ReviewResponse | null>(null);
    const [rejectComment, setRejectComment] = useState('');
    const [showRejectForm, setShowRejectForm] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [reviewAttachmentSource, setReviewAttachmentSource] = useState<'existing' | 'url'>('existing');
    const [reviewComment, setReviewComment] = useState('');

    // Cargar proyectos al abrir
    useEffect(() => {
        if (event && supabase) {
            const fetchAuxData = async () => {
                const { data: projects } = await supabase
                    .from('projects')
                    .select('id, name, team_name') // <--- Traemos el equipo
                    // Quitamos el filtro .eq(...) para que traiga TODO
                    .order('name'); 
                    
                if (projects) setMarketingProjects(projects as any);
            };
            fetchAuxData();
        }
    }, [event, supabase]);

    // Rellenar formulario al abrir evento
    useEffect(() => {
        if (event) {
            setTitle(event.title);
            setDescription(event.extendedProps.description || '');
            setStartDate(event.start.split('T')[0]);
            setEndDate(event.end ? event.end.split('T')[0] : '');
            setTeam(event.extendedProps.team);
            setVideoLink(event.extendedProps.video_link || '');
            setEstado(event.extendedProps.custom_data?.Estado || '');
            setFormato(event.extendedProps.custom_data?.Formato || '');
            setPilar(event.extendedProps.custom_data?.['Pilar de Contenido'] || '');
            setPais(event.extendedProps.custom_data?.Pais || '');
            setCasoUso(event.extendedProps.custom_data?.CasoUso || '');

            // Resetear estados auxiliares
            setWantTask(false);
            setTaskAssignee('');
            setTaskProject('');
            setDatePreset('one_day_before');
            setCustomTaskDate('');
            setUploading(false);
            
            // Resetear modo y config de duplicado
            setViewMode('view');
            setDupConfig({
                copyDetails: true,
                copyProps: true,
                copyTeam: true,
                createTask: false
            });

            // Resetear estados de revisión
            setReviewAttachmentUrl('');
            setReviewAttachmentType('drive_url');
            setSelectedReviewers([]);
            setTimerPreset('1');
            setCustomTimerHours('');
            setRejectComment('');
            setShowRejectForm(false);
            setShowHistory(false);
            setReviewAttachmentSource('existing');
            setReviewComment('');
        }
    }, [event]);

    // --- LÓGICA DE REVISIÓN DE CONTENIDO (hooks antes del early return) ---
    const fetchReviewHistory = useCallback(async () => {
        if (!supabase || !event) return;
        const { data, error } = await supabase.rpc('get_review_history', { p_event_id: Number(event.id) });
        if (error) {
            console.error('Error fetching review history:', error);
            return;
        }
        const rounds = (data || []) as ReviewRound[];
        setReviewHistory(rounds);

        const active = rounds.find(r => r.status === 'pending') || null;
        setActiveReview(active);

        if (active && user) {
            const myResponse = active.responses.find(
                r => r.reviewer_id === user.id && r.decision === null
            );
            setPendingResponse(myResponse || null);
        } else {
            setPendingResponse(null);
        }
    }, [supabase, event, user]);

    useEffect(() => {
        if (event && supabase) {
            fetchReviewHistory();
        }
    }, [event, supabase, fetchReviewHistory]);

    if (!event) return null;

    // --- LÓGICA DE DATOS CALCULADOS ---
    const teamColor = TEAM_COLORS[event.extendedProps.team] || TEAM_COLORS['General'];
    
    const taskData = event.task_data 
                  || event.extendedProps.task_data 
                  || event.extendedProps.custom_data?.task_data;

    const hasLinkedTask = !!taskData || !!event.task_id;

    let assigneeInitials = "?";
    let assigneeName = "Sin asignar";
    const assigneeId = taskData?.assignee_user_id;

    if (assigneeId && teamMembers.length > 0) {
        const member = teamMembers.find(m => m.user_id === assigneeId);
        if (member) {
            assigneeName = member.email;
            assigneeInitials = (member.first_name ? member.first_name.substring(0, 2) : member.email.substring(0, 2)).toUpperCase();
        }
    }

    const projectId = taskData?.project_id;
    const taskId = taskData?.id || event.task_id;
    
    // --- MANEJADORES ---

    const handlePaste = async (e: React.ClipboardEvent) => {
        if (e.clipboardData.files.length > 0) {
            e.preventDefault();
            const file = e.clipboardData.files[0];
            
            if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                alert('Solo se pueden pegar imágenes o videos.');
                return;
            }

            if (!supabase) return;

            try {
                setUploading(true);
                const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                const fileName = `${Date.now()}_${cleanName}`;
                
                const { error } = await supabase.storage
                    .from('media-attachments')
                    .upload(fileName, file);

                if (error) throw error;

                const { data: urlData } = supabase.storage
                    .from('media-attachments')
                    .getPublicUrl(fileName);

                setVideoLink(urlData.publicUrl);

            } catch (error: any) {
                alert('Error al subir el archivo: ' + error.message);
            } finally {
                setUploading(false);
            }
        }
    };

    const getFinalTaskDate = () => {
        if (datePreset === 'custom') return customTaskDate;
        const evtDate = new Date(startDate);
        if (datePreset === 'one_day_before') {
            evtDate.setDate(evtDate.getDate() - 1);
        }
        return evtDate.toISOString().split('T')[0];
    };

    const handleSave = () => {
        // Validar campos obligatorios si quiere crear tarea
        if (wantTask) {
            if (!taskAssignee) {
                alert('Selecciona un responsable para la tarea.');
                return;
            }
            if (!taskProject) {
                alert('Selecciona un proyecto para la tarea.');
                return;
            }
        }

        const updatedData: EventUpdatePayload = {
            title,
            description: description || null,
            start_date: startDate,
            end_date: endDate || null,
            team,
            video_link: videoLink || null,
            custom_data: {
                Estado: estado,
                Formato: formato,
                'Pilar de Contenido': pilar,
                Pais: pais,
                CasoUso: casoUso,
            },
            create_task: wantTask,
            task_assignee_id: wantTask ? taskAssignee : undefined,
            task_project_id: wantTask ? Number(taskProject) : undefined,
            task_due_date: wantTask ? getFinalTaskDate() : undefined
        };

        onUpdate(event.id, updatedData);
        setViewMode('view');
    };

    // --- LÓGICA DE DUPLICADO (NUEVA) ---
    const handleConfirmDuplicate = async () => {
        if (!supabase || !user) return;
        setIsDuplicating(true);

        try {
            // 1. Calcular nueva fecha (+7 días por defecto como sugerencia)
            const originalDate = new Date(event.start);
            originalDate.setDate(originalDate.getDate() + 7); // Sumar 7 días
            const newStartDate = originalDate.toISOString().split('T')[0];

            // 2. Preparar Payload del nuevo evento
            const newEventPayload: any = {
                title: `[Copia] ${event.title}`,
                start_date: newStartDate, // Nueva fecha
                end_date: null, // Reset al end date por simplicidad
                team: dupConfig.copyTeam ? event.extendedProps.team : 'General',
                user_id: user.id,
                description: dupConfig.copyDetails ? event.extendedProps.description : null,
                video_link: dupConfig.copyDetails ? event.extendedProps.video_link : null,
                is_draft: true, // Nace como borrador
                custom_data: {}
            };

            // Copiar Custom Data si corresponde
            if (dupConfig.copyProps && event.extendedProps.custom_data) {
                // Copiamos formato, pilar, estado
                const { task_data, ...cleanCustomData } = event.extendedProps.custom_data;
                newEventPayload.custom_data = cleanCustomData;
            }

            // 3. Crear Tarea si se solicitó (Opcional)
            let newTaskId = null;
            if (dupConfig.createTask) {
                // Crear tarea básica pendiente
                const { data: taskData, error: taskError } = await supabase
                    .from('tasks')
                    .insert({
                        title: newEventPayload.title,
                        status: 'Por Hacer', // Pendiente
                        owner_id: user.id,
                        completed: false
                        // Sin asignado ni proyecto todavía
                    })
                    .select('id')
                    .single();
                
                if (taskError) throw taskError;
                newTaskId = taskData.id;
                newEventPayload.task_id = newTaskId;
            }

            // 4. Insertar el Evento en Supabase
            const { data: createdEvent, error: eventError } = await supabase
                .from('company_events')
                .insert(newEventPayload)
                .select()
                .single();

            if (eventError) throw eventError;

            // 5. ¡ÉXITO!
            // Si el padre nos pasó la función onDuplicate, la llamamos para cambiar el foco
            if (onDuplicate) {
                onDuplicate(createdEvent); 
            } else {
                // Fallback si no hay onDuplicate: solo cerrar y refrescar
                onClose();
                window.location.reload(); // Un poco brusco, pero funciona como fallback
            }

        } catch (error: any) {
            console.error("Error duplicando:", error);
            alert("Error al duplicar: " + error.message);
        } finally {
            setIsDuplicating(false);
        }
    };

    const getTimerHours = (): number => {
        if (timerPreset === 'custom') return Number(customTimerHours) || 1;
        return Number(timerPreset);
    };

    const handleSubmitReviewRequest = async () => {
        if (!supabase || !user || !event) return;
        if (selectedReviewers.length === 0) {
            toast.error('Selecciona al menos un revisor');
            return;
        }

        const attachmentUrl = reviewAttachmentSource === 'existing'
            ? (event.extendedProps.video_link || '')
            : reviewAttachmentUrl;

        if (!attachmentUrl) {
            toast.error('Agrega un contenido para revisión');
            return;
        }

        setIsSubmittingReview(true);
        try {
            const { data: reviewId, error } = await supabase.rpc('create_content_review', {
                p_event_id: Number(event.id),
                p_attachment_url: attachmentUrl,
                p_attachment_type: reviewAttachmentType,
                p_timer_hours: getTimerHours(),
                p_reviewer_ids: selectedReviewers,
                p_requester_comment: reviewComment.trim() || null,
            });

            if (error) throw error;

            // Invocar edge function para notificar revisores
            fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-review-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                    review_id: reviewId,
                    event_title: event.title,
                    event_id: Number(event.id),
                    event_description: event.extendedProps.description || '',
                    event_date: event.start,
                    event_team: event.extendedProps.team || '',
                    reviewer_ids: selectedReviewers,
                    requester_email: user.email,
                    attachment_url: attachmentUrl,
                    media_url: event.extendedProps.video_link || '',
                    requester_comment: reviewComment.trim() || null,
                }),
            }).catch(err => console.error('Error notificando revisores:', err));

            toast.success('Solicitud de aprobación enviada');
            setViewMode('view');
            await fetchReviewHistory();
            onReviewSubmitted?.();
        } catch (error: any) {
            toast.error('Error al enviar solicitud: ' + error.message);
        } finally {
            setIsSubmittingReview(false);
        }
    };

    const handleApprove = async () => {
        if (!supabase || !activeReview || !user) return;
        try {
            const { data: result, error } = await supabase.rpc('submit_review_response', {
                p_review_id: activeReview.review_id,
                p_decision: 'approved',
            });
            if (error) throw error;

            // Notificar al solicitante de la aprobación
            fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-approval-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                    event_title: event.title,
                    event_id: Number(event.id),
                    event_description: event.extendedProps.description || '',
                    event_date: event.start,
                    event_team: event.extendedProps.team || '',
                    requester_email: activeReview.requested_by_email,
                    reviewer_email: user.email,
                    all_approved: result === 'all_approved',
                    media_url: activeReview.attachment_url || event.extendedProps.video_link || '',
                }),
            }).catch(err => console.error('Error notificando aprobación:', err));

            toast.success(result === 'all_approved' ? 'Contenido aprobado por todos' : 'Tu aprobación fue registrada');
            await fetchReviewHistory();
            onReviewSubmitted?.();
        } catch (error: any) {
            toast.error('Error: ' + error.message);
        }
    };

    const handleReject = async () => {
        if (!supabase || !activeReview || !user) return;
        if (!rejectComment.trim()) {
            toast.error('Escribe un comentario explicando el rechazo');
            return;
        }
        try {
            const { error } = await supabase.rpc('submit_review_response', {
                p_review_id: activeReview.review_id,
                p_decision: 'rejected',
                p_comment: rejectComment,
            });
            if (error) throw error;

            // Notificar al solicitante del rechazo (correo + in-app)
            fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-rejection-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                    event_title: event.title,
                    event_id: Number(event.id),
                    event_description: event.extendedProps.description || '',
                    event_date: event.start,
                    event_team: event.extendedProps.team || '',
                    requester_email: activeReview.requested_by_email,
                    reviewer_email: user.email,
                    comment: rejectComment,
                    media_url: activeReview.attachment_url || event.extendedProps.video_link || '',
                }),
            }).catch(err => console.error('Error notificando rechazo:', err));

            toast.success('Contenido rechazado. El solicitante será notificado.');
            setShowRejectForm(false);
            setRejectComment('');
            await fetchReviewHistory();
            onReviewSubmitted?.();
        } catch (error: any) {
            toast.error('Error: ' + error.message);
        }
    };

    const toggleReviewer = (userId: string) => {
        setSelectedReviewers(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const reviewStatusBadge = (status?: string) => {
        if (!status || status === 'none') return null;
        const config: Record<string, { bg: string; text: string; label: string }> = {
            pending: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Revisión Pendiente' },
            approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Aprobado' },
            rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rechazado' },
        };
        const c = config[status] || config.pending;
        return (
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${c.bg} ${c.text}`}>
                {c.label}
            </span>
        );
    };

    const taskLink = projectId && taskId
        ? `/projects/${projectId}?task=${taskId}&returnTo=/calendar`
        : '#';

    return (
        <Modal isOpen={!!event} onClose={() => { setViewMode('view'); onClose(); }}>
            <div className="flex flex-col bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden transition-all">
                
                {/* === MODO DUPLICADO (DISEÑO TARJETAS) === */}
                {viewMode === 'duplicate' && (
                    <>
                         {/* 1. ENCABEZADO FIJO */}
                         <div className="p-6 border-b flex-none bg-white">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-100 p-2.5 rounded-lg text-indigo-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Duplicar Evento</h2>
                                    <p className="text-sm text-gray-500">Elige qué información quieres copiar al nuevo evento.</p>
                                </div>
                            </div>
                        </div>

                        {/* 2. CUERPO (Tarjetas Seleccionables) */}
                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-gray-50/50">
                            <div className="grid gap-4">
                                
                                {/* Tarjeta 1: Detalles Básicos */}
                                <div 
                                    onClick={() => setDupConfig({...dupConfig, copyDetails: !dupConfig.copyDetails})}
                                    className={`relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer select-none group ${dupConfig.copyDetails ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                >
                                    <div className={`mt-0.5 p-1.5 rounded-full ${dupConfig.copyDetails ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={`font-semibold ${dupConfig.copyDetails ? 'text-indigo-900' : 'text-gray-700'}`}>Copiar Detalles y Archivos</h3>
                                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">Incluye la descripción completa, enlaces de video, adjuntos y links externos.</p>
                                    </div>
                                </div>

                                {/* Tarjeta 2: Propiedades Marketing */}
                                <div 
                                    onClick={() => setDupConfig({...dupConfig, copyProps: !dupConfig.copyProps})}
                                    className={`relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer select-none group ${dupConfig.copyProps ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                >
                                    <div className={`mt-0.5 p-1.5 rounded-full ${dupConfig.copyProps ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={`font-semibold ${dupConfig.copyProps ? 'text-indigo-900' : 'text-gray-700'}`}>Copiar Etiquetas</h3>
                                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">Mantiene el Estado (ej: Grabando), Formato (ej: Reel) y el Pilar de contenido.</p>
                                    </div>
                                </div>

                                {/* Tarjeta 3: Crear Tarea */}
                                <div 
                                    onClick={() => setDupConfig({...dupConfig, createTask: !dupConfig.createTask})}
                                    className={`relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer select-none group ${dupConfig.createTask ? 'border-purple-500 bg-purple-50/50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                >
                                    <div className={`mt-0.5 p-1.5 rounded-full ${dupConfig.createTask ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                        {/* Icono diferente para tarea */}
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            {dupConfig.createTask ? (
                                                 <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            ) : (
                                                 <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                            )}
                                            {!dupConfig.createTask && <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm8 3a1 1 0 011 1v2.586l1.293 1.293a1 1 0 11-1.414 1.414l-2-2A1 1 0 0111 11.586V9a1 1 0 011-1z" clipRule="evenodd" />}
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={`font-semibold ${dupConfig.createTask ? 'text-purple-900' : 'text-gray-700'}`}>Generar Tarea Pendiente</h3>
                                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">Se creará una nueva tarea en estado "Por Hacer" vinculada a este nuevo evento.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. PIE FIJO */}
                        <div className="p-6 pt-4 border-t flex justify-end gap-3 flex-none bg-white">
                            <button 
                                onClick={() => setViewMode('view')} 
                                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleConfirmDuplicate} 
                                disabled={isDuplicating}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed shadow-md transition-all active:scale-95"
                            >
                                {isDuplicating ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Duplicando...
                                    </>
                                ) : (
                                    'Confirmar Duplicado'
                                )}
                            </button>
                        </div>
                     </>
                )}

                {/* === MODO EDICIÓN (CONEJO SÁNDWICH) === */}
                {viewMode === 'edit' && (
                    <>
                        {/* 1. ENCABEZADO FIJO */}
                        <div className="p-6 border-b flex-none bg-white z-10">
                            <h2 className="text-2xl font-bold text-gray-800">Editar Evento</h2>
                        </div>

                        {/* 2. CUERPO CON SCROLL */}
                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                            <div className="space-y-4">
                                
                                {/* Título */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Título</label>
                                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm p-2 border" />
                                </div>

                                {/* Selector de Equipo (CON LÓGICA DE CAMBIO) */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Equipo Responsable</label>
                                    <select 
                                        value={team} 
                                        onChange={(e) => handleTeamChange(e.target.value)} 
                                        className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border"
                                    >
                                        {Object.keys(TEAM_COLORS).map(teamName => (
                                            <option key={teamName} value={teamName}>{teamName}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Fechas */}
                                <div className="grid grid-cols-12 gap-4">
                                    <div className="col-span-12 sm:col-span-6">
                                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Inicio</label>
                                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border" />
                                    </div>
                                    <div className="col-span-12 sm:col-span-6">
                                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Fin</label>
                                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border" />
                                    </div>
                                </div>

                                {/* Descripción */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Descripción</label>
                                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border resize-none" />
                                </div>

                                {/* Video / Adjunto */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                                        Video / Adjunto
                                        {uploading && <span className="ml-2 text-blue-500 italic animate-pulse lowercase font-normal">Subiendo... ⏳</span>}
                                    </label>
                                    <input 
                                        type="url" 
                                        value={videoLink} 
                                        onChange={(e) => setVideoLink(e.target.value)} 
                                        onPaste={handlePaste}
                                        disabled={uploading}
                                        className={`block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border ${uploading ? 'bg-gray-100' : ''}`}
                                        placeholder="Pega enlace o archivo (Ctrl+V)..." 
                                    />
                                    <UrlPreview url={videoLink} onClear={() => setVideoLink('')} />
                                </div>

                                {/* Opciones de Marketing */}
                                {team === 'Marketing' && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t mt-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Estado</label>
                                            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border">
                                                <option value="">Ninguno</option>
                                                {ESTADO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Formato</label>
                                            <select value={formato} onChange={(e) => setFormato(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border">
                                                <option value="">Ninguno</option>
                                                {FORMATO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Pilar</label>
                                            <select value={pilar} onChange={(e) => setPilar(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border">
                                                <option value="">Ninguno</option>
                                                {PILAR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                {team === 'Kali Te Enseña' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t mt-4">
            <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">País Objetivo</label>
                <select value={pais} onChange={(e) => setPais(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border">
                    <option value="">Seleccionar...</option>
                    {PAIS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Caso de Uso</label>
                <select value={casoUso} onChange={(e) => setCasoUso(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border">
                    <option value="">Seleccionar...</option>
                    {CASO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            </div>
        </div>
    )}

                                {/* Sección Tarea Vinculada */}
                                {hasLinkedTask ? (
                                    <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-lg flex items-start gap-3">
                                        <div className="p-1.5 bg-purple-100 rounded-full text-purple-600 mt-0.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-purple-900">Tarea Vinculada Activa</h4>
                                            <p className="text-xs text-purple-700 mt-1">ID: {event.task_id || taskData?.id}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="border-t border-gray-100 pt-4 mt-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-700">Crear tarea vinculada</span>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" checked={wantTask} onChange={(e) => setWantTask(e.target.checked)} className="sr-only peer" />
                                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>

                                        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${wantTask ? 'max-h-64 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}>
                                            <div className="pl-3 border-l-4 border-blue-500 space-y-3">
                                                <div className="grid grid-cols-12 gap-3">
                                                    <div className="col-span-12 sm:col-span-6">
                                                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Responsable</label>
                                                        <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className="block w-full text-sm border-gray-300 rounded bg-gray-50 p-1.5 border">
                                                            <option value="">Seleccionar...</option>
                                                            {teamMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.first_name || m.email}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="col-span-12 sm:col-span-6">
                                                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Proyecto</label>
                                                        <select 
    value={taskProject} 
    onChange={(e) => setTaskProject(Number(e.target.value))}
    className="block w-full text-sm border-gray-300 rounded bg-gray-50 p-1.5 border"
>
    <option value="">Seleccionar...</option>
    {marketingProjects
        .filter(p => p.team_name === team) // <--- FILTRO MÁGICO
        .map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
        ))
    }
</select>
{/* Mensaje de ayuda */}
{marketingProjects.filter(p => p.team_name === team).length === 0 && (
    <p className="text-[10px] text-gray-400 mt-1">No hay proyectos visibles para {team}</p>
)}
                                                    </div>
                                                    <div className="col-span-12">
                                                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Entrega</label>
                                                        <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className="block w-full text-sm border-gray-300 rounded bg-gray-50 p-1.5 border">
                                                            {DUE_DATE_PRESETS.map(pre => <option key={pre.value} value={pre.value}>{pre.label}</option>)}
                                                        </select>
                                                        {datePreset === 'custom' && (
                                                            <input type="date" value={customTaskDate} onChange={(e) => setCustomTaskDate(e.target.value)} className="mt-2 block w-full text-sm border-gray-300 rounded p-1.5 border" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. PIE FIJO */}
                        <div className="p-6 pt-4 border-t flex justify-end gap-3 flex-none bg-gray-50 rounded-b-lg">
                            <button onClick={() => setViewMode('view')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50">Cancelar</button>
                            <button onClick={handleSave} disabled={uploading} className="px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm hover:opacity-90 transition-opacity" style={{ backgroundColor: '#ff8080' }}>
                                {uploading ? 'Subiendo...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </>
                )}

                {/* === MODO VISTA (LECTURA) === */}
                {viewMode === 'view' && (
                    <div className="flex flex-col flex-1 min-h-0">
                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <span className="px-3 py-1 text-xs font-semibold rounded-full" style={{ backgroundColor: teamColor.background, color: teamColor.text }}>
                                        {event.extendedProps.team}
                                    </span>
                                    
                                    {hasLinkedTask && (
                                        <a 
                                            href={taskLink}
                                            className="flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 hover:border-purple-300 transition-all cursor-pointer group no-underline"
                                            title={`Ir a tarea asignada a: ${assigneeName}`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                            <span>Tarea Vinculada</span>
                                            <span className="w-px h-3 bg-purple-300 mx-1"></span>
                                            <div className="flex items-center justify-center w-5 h-5 bg-purple-200 rounded-full text-[10px] font-bold text-purple-800 border border-purple-300">
                                                {assigneeInitials}
                                            </div>
                                        </a>
                                    )}
                                </div>
                                <h2 className="text-2xl font-bold text-gray-800 leading-tight">{event.title}</h2>
                            </div>
                            
                            {/* Botones Editar/Duplicar/Revisión/Borrar */}
                            <div className="flex gap-2">
                                {/* BOTÓN SOLICITAR APROBACIÓN */}
                                <button onClick={() => setViewMode('review')} className="text-gray-400 p-1.5 hover:bg-emerald-50 hover:text-emerald-600 rounded-full" title="Solicitar Aprobación">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </button>

                                <button onClick={() => setViewMode('duplicate')} className="text-gray-400 p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-full" title="Duplicar Evento">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>

                                <button onClick={() => setViewMode('edit')} className="text-gray-400 p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-full" title="Editar">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L13.196 5.232z" /></svg>
                                </button>

                                <button onClick={onDelete} className="text-gray-400 p-1.5 hover:bg-red-50 hover:text-red-600 rounded-full" title="Eliminar">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                        
                        <p className="text-sm text-gray-500 mb-6 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            {event.start ? new Date(event.start).toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                        </p>

                        {/* Etiquetas Marketing */}
                        {(event.extendedProps.custom_data?.Estado || event.extendedProps.custom_data?.Formato || event.extendedProps.custom_data?.['Pilar de Contenido']) && (
                          <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b">
                              {event.extendedProps.custom_data?.Estado && <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-800">{event.extendedProps.custom_data.Estado}</span>}
                              {event.extendedProps.custom_data?.Formato && <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">{event.extendedProps.custom_data.Formato}</span>}
                              {event.extendedProps.custom_data?.['Pilar de Contenido'] && <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">{event.extendedProps.custom_data['Pilar de Contenido']}</span>}
                          </div>
                        )}

                        {description && (
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Descripción</h4>
                                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{description}</p>
                            </div>
                        )}
                        
                        {videoLink && (
                            <div className="mt-4">
                                <UrlPreview url={videoLink} />
                            </div>
                        )}

                        {/* === REVIEW STATUS BADGE === */}
                        {event.extendedProps.review_status && event.extendedProps.review_status !== 'none' && (
                            <div className="mt-6 pt-4 border-t">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Estado de Aprobación</h4>
                                    {reviewStatusBadge(event.extendedProps.review_status)}
                                </div>
                            </div>
                        )}

                        {/* === PANEL DE RESPUESTA DEL REVISOR === */}
                        {pendingResponse && activeReview && (
                            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                <h4 className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                    Tu aprobación es requerida
                                </h4>
                                <div className="mb-3">
                                    <CountdownTimer expiresAt={activeReview.expires_at} />
                                </div>
                                {activeReview.requester_comment && (
                                    <div className="mb-3 p-3 bg-white border border-amber-200 rounded-lg">
                                        <p className="text-xs font-semibold text-amber-700 uppercase mb-1">Comentario del solicitante</p>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{activeReview.requester_comment}</p>
                                    </div>
                                )}
                                {activeReview.attachment_url && (
                                    <div className="mb-3">
                                        <UrlPreview url={activeReview.attachment_url} />
                                    </div>
                                )}

                                {!showRejectForm ? (
                                    <div className="flex gap-3 mt-3">
                                        <button
                                            onClick={handleApprove}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                            Aprobar
                                        </button>
                                        <button
                                            onClick={() => setShowRejectForm(true)}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Rechazar
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-3 space-y-3">
                                        <textarea
                                            value={rejectComment}
                                            onChange={(e) => setRejectComment(e.target.value)}
                                            placeholder="Explica por qué rechazas el contenido (obligatorio)..."
                                            rows={3}
                                            className="block w-full border-red-300 rounded-lg shadow-sm text-sm p-2.5 border resize-none focus:ring-red-500 focus:border-red-500"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setShowRejectForm(false); setRejectComment(''); }}
                                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleReject}
                                                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
                                            >
                                                Confirmar Rechazo
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* === HISTORIAL DE REVISIONES === */}
                        {reviewHistory.length > 0 && (
                            <div className="mt-6 pt-4 border-t">
                                <button
                                    onClick={() => setShowHistory(!showHistory)}
                                    className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors w-full"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className={`h-4 w-4 transition-transform ${showHistory ? 'rotate-90' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                    Historial de Revisiones ({reviewHistory.length} ronda{reviewHistory.length !== 1 ? 's' : ''})
                                </button>

                                {showHistory && (
                                    <div className="mt-3 space-y-3">
                                        {reviewHistory.map((round) => (
                                            <div key={round.review_id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-bold text-gray-500 uppercase">Ronda {round.round_number}</span>
                                                    {reviewStatusBadge(round.status)}
                                                </div>
                                                <p className="text-xs text-gray-500 mb-2">
                                                    Solicitado por <span className="font-medium">{round.requested_by_email}</span>
                                                    {' · '}
                                                    {new Date(round.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                                {round.requester_comment && (
                                                    <p className="text-xs text-gray-600 mb-2 pl-2 border-l-2 border-gray-300 italic">
                                                        "{round.requester_comment}"
                                                    </p>
                                                )}
                                                <div className="space-y-1.5">
                                                    {round.responses.map((resp, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs">
                                                            <span className={`w-2 h-2 rounded-full ${
                                                                resp.decision === 'approved' ? 'bg-green-500' :
                                                                resp.decision === 'rejected' ? 'bg-red-500' :
                                                                'bg-gray-300'
                                                            }`} />
                                                            <span className="text-gray-600">{resp.reviewer_email}</span>
                                                            <span className="text-gray-400">
                                                                {resp.decision === 'approved' ? 'Aprobó' :
                                                                 resp.decision === 'rejected' ? 'Rechazó' :
                                                                 'Pendiente'}
                                                            </span>
                                                            {resp.comment && (
                                                                <span className="text-gray-500 italic truncate max-w-[200px]" title={resp.comment}>
                                                                    — "{resp.comment}"
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    </div>
                )}

                {/* === MODO REVISIÓN (SOLICITAR APROBACIÓN) === */}
                {viewMode === 'review' && (
                    <>
                        <div className="p-6 border-b flex-none bg-white">
                            <div className="flex items-center gap-3">
                                <div className="bg-emerald-100 p-2.5 rounded-lg text-emerald-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Solicitar Aprobación</h2>
                                    <p className="text-sm text-gray-500">Envía el contenido para revisión del equipo.</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                            <div className="space-y-5">

                                {/* Historial de rechazos previos como contexto */}
                                {reviewHistory.filter(r => r.status === 'rejected').length > 0 && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <p className="text-xs font-bold text-red-800 uppercase mb-2">Rechazos previos</p>
                                        {reviewHistory.filter(r => r.status === 'rejected').map((round) => (
                                            <div key={round.review_id} className="text-xs text-red-700 mb-1">
                                                <span className="font-medium">Ronda {round.round_number}:</span>
                                                {round.responses.filter(r => r.decision === 'rejected').map((r, i) => (
                                                    <span key={i}> {r.reviewer_email}: "{r.comment}"</span>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Sección: Contenido */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Contenido a Revisar</label>
                                    <div className="flex gap-2 mb-3">
                                        <button
                                            type="button"
                                            onClick={() => setReviewAttachmentSource('existing')}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                                reviewAttachmentSource === 'existing'
                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            Enlace existente del evento
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReviewAttachmentSource('url')}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                                reviewAttachmentSource === 'url'
                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            URL diferente
                                        </button>
                                    </div>

                                    {reviewAttachmentSource === 'existing' ? (
                                        event.extendedProps.video_link ? (
                                            <div className="p-3 bg-gray-50 rounded-lg border">
                                                <UrlPreview url={event.extendedProps.video_link} />
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 italic">Este evento no tiene enlace adjunto. Usa "URL diferente" para agregar uno.</p>
                                        )
                                    ) : (
                                        <div className="space-y-2">
                                            <input
                                                type="url"
                                                value={reviewAttachmentUrl}
                                                onChange={(e) => setReviewAttachmentUrl(e.target.value)}
                                                placeholder="https://..."
                                                className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border"
                                            />
                                            <select
                                                value={reviewAttachmentType}
                                                onChange={(e) => setReviewAttachmentType(e.target.value as any)}
                                                className="block w-full border-gray-300 rounded-md shadow-sm text-xs p-1.5 border"
                                            >
                                                <option value="drive_url">Enlace (Drive, Figma, etc.)</option>
                                                <option value="image">Imagen</option>
                                                <option value="video">Video</option>
                                            </select>
                                            {reviewAttachmentUrl && <UrlPreview url={reviewAttachmentUrl} />}
                                        </div>
                                    )}
                                </div>

                                {/* Sección: Comentario para revisores */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Comentario para revisores <span className="text-gray-400 font-normal normal-case">(opcional)</span></label>
                                    <textarea
                                        value={reviewComment}
                                        onChange={(e) => setReviewComment(e.target.value)}
                                        placeholder="Ej: Revisar que el copy esté alineado con la campaña de verano..."
                                        rows={3}
                                        className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2.5 border resize-none focus:ring-emerald-500 focus:border-emerald-500"
                                    />
                                </div>

                                {/* Sección: Revisores */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                        Revisores ({selectedReviewers.length} seleccionados)
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {teamMembers
                                            .filter(m => m.user_id !== user?.id)
                                            .map(m => {
                                                const isSelected = selectedReviewers.includes(m.user_id);
                                                return (
                                                    <button
                                                        key={m.user_id}
                                                        type="button"
                                                        onClick={() => toggleReviewer(m.user_id)}
                                                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                                                            isSelected
                                                                ? 'bg-emerald-100 border-emerald-400 text-emerald-800 shadow-sm'
                                                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                                        }`}
                                                    >
                                                        {isSelected && (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline mr-1" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                        {m.first_name || m.email}
                                                    </button>
                                                );
                                            })
                                        }
                                    </div>
                                </div>

                                {/* Sección: Timer */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Tiempo límite para responder</label>
                                    <div className="flex gap-2">
                                        {(['1', '2'] as const).map(h => (
                                            <button
                                                key={h}
                                                type="button"
                                                onClick={() => setTimerPreset(h)}
                                                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                                    timerPreset === h
                                                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                                }`}
                                            >
                                                {h}h
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setTimerPreset('custom')}
                                            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                                timerPreset === 'custom'
                                                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            Custom
                                        </button>
                                    </div>
                                    {timerPreset === 'custom' && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0.5"
                                                step="0.5"
                                                value={customTimerHours}
                                                onChange={(e) => setCustomTimerHours(e.target.value)}
                                                placeholder="Ej: 4"
                                                className="w-24 border-gray-300 rounded-md shadow-sm text-sm p-2 border"
                                            />
                                            <span className="text-sm text-gray-500">horas</span>
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-400 mt-1.5">Si nadie responde en este tiempo, el contenido se aprueba automáticamente.</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 pt-4 border-t flex justify-end gap-3 flex-none bg-white">
                            <button
                                onClick={() => setViewMode('view')}
                                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSubmitReviewRequest}
                                disabled={isSubmittingReview || selectedReviewers.length === 0}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-70 disabled:cursor-not-allowed shadow-md transition-all active:scale-95"
                            >
                                {isSubmittingReview ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Enviando...
                                    </>
                                ) : (
                                    'Enviar para Revisión'
                                )}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}