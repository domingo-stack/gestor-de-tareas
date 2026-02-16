// app/settings/team/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import { TrashIcon } from '@/components/icons/TrashIcon';
import AuthGuard from '@/components/AuthGuard';
import { Toaster, toast } from 'sonner';

type TeamMember = {
  user_id: string;
  email: string;
  role: string;
};

export default function TeamSettingsPage() {
  const { supabase } = useAuth();
  const { role } = usePermissions();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [emailToAdd, setEmailToAdd] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [emailToInvite, setEmailToInvite] = useState('');

  useEffect(() => {
    if (!supabase) return;

    async function fetchMembers() {
      const { data, error } = await supabase.rpc('get_all_members');

      if (error) {
        console.error('Error al cargar los miembros:', error);
      } else {
        setMembers(data || []);
      }
      setIsLoading(false);
    }

    fetchMembers();
  }, [supabase]);

  const handleAddMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!emailToAdd || !supabase) return;

    setIsAdding(true);

    const { data, error } = await supabase.rpc('add_member', {
      member_email: emailToAdd,
    });

    if (error) {
      toast.error(`Error al añadir al miembro: ${error.message}`);
    } else {
      toast.success(data);
      setEmailToAdd('');
      const { data: updatedMembers } = await supabase.rpc('get_all_members');
      setMembers(updatedMembers || []);
    }

    setIsAdding(false);
  };

  const handleInviteUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!emailToInvite || !supabase) return;

    setIsInviting(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-custom-invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ emailToInvite }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al enviar la invitación');
      }

      toast.success(result.message);
      setEmailToInvite('');
    } catch (err: any) {
      toast.error(err.message);
    }

    setIsInviting(false);
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!supabase) return;
    if (confirm('¿Estás seguro de que quieres eliminar a este miembro de la organización?')) {
      const { error } = await supabase.rpc('remove_member', {
        member_id_to_remove: memberId
      });

      if (error) {
        toast.error(`Error al eliminar el miembro: ${error.message}`);
      } else {
        setMembers(members.filter(member => member.user_id !== memberId));
        toast.success('Miembro eliminado con éxito.');
      }
    }
  };

  const isSuperadmin = role === 'superadmin';

  return (
    <AuthGuard>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <Toaster position="top-right" richColors />
        <h1 className="text-2xl font-bold mb-6">Gestión de Organización</h1>

        {isSuperadmin && (
          <>
            {/* Invitar nuevo usuario */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
              <h2 className="text-xl font-semibold mb-4">Invitar Nuevo Usuario</h2>
              <p className="text-sm text-gray-500 mb-4">
                Envía un enlace de invitación por email. El usuario podrá registrarse con ese enlace.
              </p>
              <form onSubmit={handleInviteUser} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={emailToInvite}
                  onChange={(e) => setEmailToInvite(e.target.value)}
                  placeholder="email@ejemplo.com"
                  className="flex-grow p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={isInviting}
                />
                <button
                  type="submit"
                  className="text-white font-semibold px-4 py-2 rounded-md transition disabled:bg-gray-400"
                  style={{ backgroundColor: isInviting ? undefined : '#ff8080' }}
                  disabled={isInviting}
                >
                  {isInviting ? 'Enviando...' : 'Enviar Invitación'}
                </button>
              </form>
            </div>

            {/* Añadir miembro existente */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
              <h2 className="text-xl font-semibold mb-4">Añadir Miembro Existente</h2>
              <p className="text-sm text-gray-500 mb-4">
                El usuario debe haberse registrado previamente en la plataforma.
              </p>
              <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={emailToAdd}
                  onChange={(e) => setEmailToAdd(e.target.value)}
                  placeholder="email@registrado.com"
                  className="flex-grow p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={isAdding}
                />
                <button
                  type="submit"
                  className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:bg-gray-400"
                  disabled={isAdding}
                >
                  {isAdding ? 'Añadiendo...' : 'Añadir a la Organización'}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Lista de miembros */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Miembros de la Organización</h2>
          {isLoading ? (
            <p className="text-gray-500">Cargando miembros...</p>
          ) : (
            <ul className="space-y-4">
              {members.map((member) => (
                <li key={member.user_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <div>
                    <p className="font-medium">{member.email}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      member.role === 'superadmin'
                        ? 'bg-purple-100 text-purple-700'
                        : member.role === 'member'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {member.role}
                    </span>
                  </div>
                  {isSuperadmin && member.role !== 'superadmin' && (
                    <button
                      onClick={() => handleRemoveMember(member.user_id)}
                      className="text-red-500 hover:text-red-700 p-1 rounded-md"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
