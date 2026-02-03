'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/Modal';
import { SupabaseClient, User } from '@supabase/supabase-js';
import UrlPreview from '@/components/UrlPreview';

type AddEventModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onEventAdded: () => void;
  user: User | null;
  supabase: SupabaseClient | null;
};

// Tipos auxiliares
type TeamMember = {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
};
  
type ContentProject = {
    id: number;
    name: string;
};

const TEAMS = ['Marketing', 'Producto', 'Customer Success', 'General', 'Kali Te Enseña'];
const DUE_DATE_PRESETS = [
    { label: 'Mismo día', value: 'same_day' },
    { label: '1 día antes', value: 'one_day_before' },
    { label: 'Personalizado', value: 'custom' }
];

export default function AddEventModal({ isOpen, onClose, onEventAdded, user, supabase }: AddEventModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [team, setTeam] = useState('General');
  const [videoLink, setVideoLink] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false); // Estado de subida
  const [error, setError] = useState('');

  // --- ESTADOS PARA TAREA VINCULADA ---
  const [wantTask, setWantTask] = useState(false);
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskProject, setTaskProject] = useState<number | ''>('');
  const [datePreset, setDatePreset] = useState('one_day_before');
  const [customTaskDate, setCustomTaskDate] = useState('');

  // Estados para listas desplegables
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [marketingProjects, setMarketingProjects] = useState<ContentProject[]>([]);

  useEffect(() => {
    if (isOpen && supabase) {
        const fetchData = async () => {
            const { data: members } = await supabase.rpc('get_team_members');
            if (members) setTeamMembers(members);

            const { data: projects } = await supabase
                .from('projects')
                .select('id, name')
                .eq('is_content_project', true);
            if (projects) setMarketingProjects(projects);
        };
        fetchData();
        
        // Resetear formulario
        setWantTask(false);
        setTaskAssignee('');
        setTaskProject('');
        setDatePreset('one_day_before');
        setTitle(''); setDescription(''); setStartDate(''); setEndDate('');
        setTeam('General'); setVideoLink('');
        setUploading(false);
        setError('');
    }
  }, [isOpen, supabase]);

  const getFinalTaskDate = () => {
      if (datePreset === 'custom') return customTaskDate;
      if (!startDate) return '';
      const evtDate = new Date(startDate);
      if (datePreset === 'one_day_before') {
          evtDate.setDate(evtDate.getDate() - 1);
      }
      return evtDate.toISOString().split('T')[0];
  };

  // --- LÓGICA PASTE-TO-UPLOAD ---
  const handlePaste = async (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
        e.preventDefault();
        
        const file = e.clipboardData.files[0];
        
        // Validación básica de tipo
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            alert('Solo se admiten imágenes o videos.');
            return;
        }

        if (!supabase) return;

        try {
            setUploading(true);
            const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
            const fileName = `${Date.now()}_${cleanName}`;
            
            const { error } = await supabase
                .storage
                .from('media-attachments')
                .upload(fileName, file);

            if (error) throw error;

            const { data: urlData } = supabase
                .storage
                .from('media-attachments')
                .getPublicUrl(fileName);

            setVideoLink(urlData.publicUrl);

        } catch (error: any) {
            console.error('Upload error:', error);
            alert('Error al subir: ' + error.message);
        } finally {
            setUploading(false);
        }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDate || !team) {
      setError('Título, fecha y equipo son obligatorios.');
      return;
    }
    if (!user || !supabase) {
        setError('No autenticado.');
        return;
    }

    setLoading(true);
    setError('');
    
    // Usamos la RPC que creamos en el Hito 2
    const rpcParams = {
        p_title: title, 
        p_description: description || null, 
        p_start_date: startDate, 
        p_end_date: endDate || null,
        p_team: team, 
        p_video_link: videoLink || null, 
        p_user_id: user.id,
        p_custom_data: {}, 
        
        p_create_task: wantTask,
        p_task_assignee_id: wantTask && taskAssignee ? taskAssignee : null,
        p_task_project_id: wantTask && taskProject ? Number(taskProject) : null,
        p_task_due_date: wantTask && getFinalTaskDate() ? getFinalTaskDate() : null
    };

    const { error: rpcError } = await supabase.rpc('create_event_with_task', rpcParams);

    setLoading(false);

    if (rpcError) {
      setError('Error: ' + rpcError.message);
    } else {
      onEventAdded();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6 h-full overflow-y-auto max-h-[90vh] custom-scrollbar">
        <h2 className="text-xl font-bold mb-5 text-gray-800">Crear Nuevo Evento</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Título del Evento</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2 border"
              placeholder="Ej: Lanzamiento..."
              required
            />
          </div>

          <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-4">
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Inicio</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border" required/>
              </div>
              <div className="col-span-12 sm:col-span-4">
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Fin (Opcional)</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border"/>
              </div>
              <div className="col-span-12 sm:col-span-4">
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Equipo</label>
                  <select value={team} onChange={(e) => setTeam(e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border">
                      {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
              </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Descripción</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border resize-none"/>
            </div>
            
            {/* --- INPUT DE VIDEO CON PASTE --- */}
            <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                    Video / Adjunto
                    {uploading && <span className="ml-2 text-blue-500 italic animate-pulse lowercase font-normal">Subiendo archivo... ⏳</span>}
                </label>
                <div className="relative">
                    <input 
                        type="url" 
                        value={videoLink} 
                        onChange={(e) => setVideoLink(e.target.value)} 
                        onPaste={handlePaste}
                        disabled={uploading}
                        className={`block w-full border-gray-300 rounded-md shadow-sm text-sm p-2 border pr-8 ${uploading ? 'bg-gray-100 cursor-wait' : ''}`}
                        placeholder="Pega enlace o archivo (Ctrl+V)..." 
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd" />
                        </svg>
                    </div>
                </div>
                {/* 👇 AQUÍ VA EL PREVIEW NUEVO 👇 */}
                <UrlPreview url={videoLink} onClear={() => setVideoLink('')} />
                
                <p className="text-[10px] text-gray-400 mt-1">Tip: Puedes pegar (Ctrl+V) una imagen o video directamente aquí.</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 mt-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-full ${wantTask ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700">Crear tarea vinculada</span>
                </div>
                
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={wantTask} onChange={(e) => setWantTask(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
            </div>

            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${wantTask ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}>
                <div className="pl-3 border-l-4 border-blue-500 space-y-3">
                    <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12 sm:col-span-4">
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Responsable</label>
                            <select 
                                value={taskAssignee} 
                                onChange={(e) => setTaskAssignee(e.target.value)}
                                className="block w-full text-sm border-gray-300 rounded bg-gray-50 focus:bg-white p-1.5 border"
                            >
                                <option value="">Seleccionar...</option>
                                {teamMembers.map(m => (
                                    <option key={m.user_id} value={m.user_id}>{m.first_name || m.email}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-12 sm:col-span-4">
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Proyecto</label>
                            <select 
                                value={taskProject} 
                                onChange={(e) => setTaskProject(Number(e.target.value))}
                                className="block w-full text-sm border-gray-300 rounded bg-gray-50 focus:bg-white p-1.5 border"
                            >
                                <option value="">Seleccionar...</option>
                                {marketingProjects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-12 sm:col-span-4">
                             <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Entrega</label>
                             {datePreset === 'custom' ? (
                                 <div className="flex gap-1">
                                    <input type="date" value={customTaskDate} onChange={(e) => setCustomTaskDate(e.target.value)} className="block w-full text-sm border-gray-300 rounded p-1.5 border" />
                                    <button onClick={() => setDatePreset('one_day_before')} className="text-gray-400 hover:text-red-500">×</button>
                                 </div>
                             ) : (
                                <select 
                                    value={datePreset} 
                                    onChange={(e) => setDatePreset(e.target.value)}
                                    className="block w-full text-sm border-gray-300 rounded bg-gray-50 focus:bg-white p-1.5 border"
                                >
                                    {DUE_DATE_PRESETS.map(pre => <option key={pre.value} value={pre.value}>{pre.label}</option>)}
                                </select>
                             )}
                        </div>
                    </div>
                    <p className="text-xs text-blue-600 italic flex items-center gap-1">
                        <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 rounded">INFO</span> 
                        Se creará una tarea automáticamente vinculada a este evento.
                    </p>
                </div>
            </div>
          </div>

          {error && <div className="p-2 bg-red-50 text-red-600 text-sm rounded border border-red-200">{error}</div>}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="px-6 py-2 text-sm font-medium text-white rounded-lg shadow-sm hover:shadow transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#ff8080' }}
            >
              {loading || uploading ? 'Guardando...' : 'Crear Evento'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}