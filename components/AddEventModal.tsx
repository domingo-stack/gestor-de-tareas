// components/AddEventModal.tsx
'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { SupabaseClient, User } from '@supabase/supabase-js';


// 👇 YA NO IMPORTAMOS useAuth

type AddEventModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onEventAdded: () => void;
  user: User | null;         // <-- CAMBIO AQUÍ
  supabase: SupabaseClient | null;  // Recibimos supabase como prop
};

const TEAMS = ['Marketing', 'Producto', 'Customer Success', 'General'];

export default function AddEventModal({ isOpen, onClose, onEventAdded, user, supabase }: AddEventModalProps) {
  // 👇 YA NO LLAMAMOS a useAuth() aquí

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [team, setTeam] = useState('General');
  const [videoLink, setVideoLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDate || !team) {
      setError('El título, la fecha de inicio y el equipo son obligatorios.');
      return;
    }
    if (!user || !supabase) {
        setError('No estás autenticado.');
        return;
    }

    setLoading(true);
    setError('');

    const { error: insertError } = await supabase
      .from('company_events')
      .insert({
        title, description, start_date: startDate, end_date: endDate || null,
        team, video_link: videoLink || null, user_id: user.id
      });

    setLoading(false);

    if (insertError) {
      setError('Error al crear el evento: ' + insertError.message);
    } else {
      onEventAdded();
      onClose();
      setTitle(''); setDescription(''); setStartDate(''); setEndDate('');
      setTeam('General'); setVideoLink('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#383838' }}>Crear Nuevo Evento</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ... campos del formulario ... */}
          <div>
            <label className="block text-sm font-medium" style={{ color: '#383838' }}>Título del Evento</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
              <div>
                  <label className="block text-sm font-medium" style={{ color: '#383838' }}>Fecha de Inicio</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" required/>
              </div>
              <div>
                  <label className="block text-sm font-medium text-gray-500">Fecha de Fin (Opcional)</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"/>
              </div>
          </div>

          <div>
              <label className="block text-sm font-medium" style={{ color: '#383838' }}>Equipo</label>
              <select value={team} onChange={(e) => setTeam(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                  {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
          </div>

          <div>
              <label className="block text-sm font-medium text-gray-500">Descripción (Opcional)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"/>
          </div>

          <div>
              <label className="block text-sm font-medium text-gray-500">Enlace de Video (Opcional)</label>
              <input type="url" placeholder="https://..." value={videoLink} onChange={(e) => setVideoLink(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"/>
          </div>

          {error && <p className="text-sm" style={{ color: '#ff8080' }}>{error}</p>}

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors"
              style={{ backgroundColor: loading ? '#FCA5A5' : '#ff8080', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Creando...' : 'Crear Evento'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}