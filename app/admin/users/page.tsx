'use client'

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import AuthGuard from '@/components/AuthGuard';
import { TrashIcon } from '@heroicons/react/24/outline';
import { Toaster, toast } from 'sonner';

type AdminUser = {
  user_id: string;
  email: string;
  role: string;
  mod_tareas: boolean;
  mod_calendario: boolean;
  mod_revenue: boolean;
  mod_finanzas: boolean;
  created_at: string;
};

const ROLES = ['superadmin', 'member', 'invitado'];

const MODULE_LABELS: Record<string, string> = {
  mod_tareas: 'Tareas',
  mod_calendario: 'Calendario',
  mod_revenue: 'Revenue',
  mod_finanzas: 'Finanzas',
};

export default function AdminUsersPage() {
  const { supabase } = useAuth();
  const { role: currentUserRole } = usePermissions();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [emailToInvite, setEmailToInvite] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    if (!supabase || currentUserRole !== 'superadmin') return;

    async function fetchUsers() {
      const { data, error } = await supabase.rpc('get_all_users_admin');
      if (error) {
        console.error('Error fetching users:', error);
        toast.error('Error al cargar usuarios');
      } else {
        setUsers(data || []);
      }
      setIsLoading(false);
    }

    fetchUsers();
  }, [supabase, currentUserRole]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    const { error } = await supabase.rpc('update_user_role', {
      target_user_id: userId,
      new_role: newRole,
    });

    if (error) {
      toast.error(`Error al cambiar rol: ${error.message}`);
      return;
    }

    toast.success('Rol actualizado');
    // Refetch para obtener permisos actualizados
    const { data } = await supabase.rpc('get_all_users_admin');
    if (data) setUsers(data);
  };

  const handleTogglePermission = async (userId: string, moduleName: string, currentValue: boolean) => {
    // Update optimista
    setUsers(prev =>
      prev.map(u =>
        u.user_id === userId ? { ...u, [moduleName]: !currentValue } : u
      )
    );

    const { error } = await supabase.rpc('update_user_module_permission', {
      target_user_id: userId,
      module_name: moduleName,
      enabled: !currentValue,
    });

    if (error) {
      toast.error(`Error al actualizar permiso: ${error.message}`);
      // Revertir update optimista
      setUsers(prev =>
        prev.map(u =>
          u.user_id === userId ? { ...u, [moduleName]: currentValue } : u
        )
      );
    }
  };

  const handleDeactivateUser = async (userId: string, email: string) => {
    if (!window.confirm(`¿Estás seguro de que quieres desactivar a ${email}? El usuario perderá todo acceso.`)) return;

    const { error } = await supabase.rpc('deactivate_user', { target_user_id: userId });

    if (error) {
      toast.error(`Error al desactivar usuario: ${error.message}`);
      return;
    }

    toast.success('Usuario desactivado');
    const { data } = await supabase.rpc('get_all_users_admin');
    if (data) setUsers(data);
  };

  const handleInviteUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!emailToInvite) return;

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

  if (currentUserRole !== 'superadmin') {
    return (
      <AuthGuard>
        <div className="max-w-4xl mx-auto p-8 text-center">
          <h1 className="text-2xl font-bold">Acceso Denegado</h1>
          <p className="mt-2 text-gray-600">No tienes los permisos necesarios para ver esta página.</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <Toaster position="top-right" richColors />

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold" style={{ color: '#383838' }}>
            Administración de Usuarios
          </h1>
        </div>

        {/* Invitar usuario */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-lg font-semibold mb-3">Invitar Nuevo Usuario</h2>
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

        {/* Tabla de usuarios */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Cargando usuarios...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-4 font-semibold text-gray-600">Email</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Rol</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Tareas</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Calendario</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Revenue</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Finanzas</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <span className="font-medium">{u.email}</span>
                      </td>
                      <td className="p-4">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                          disabled={u.role === 'superadmin'}
                          className={`text-xs px-2 py-1 rounded-md border ${
                            u.role === 'superadmin'
                              ? 'bg-purple-50 text-purple-700 border-purple-200 cursor-not-allowed'
                              : u.role === 'member'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(['mod_tareas', 'mod_calendario', 'mod_revenue', 'mod_finanzas'] as const).map(
                        (mod) => (
                          <td key={mod} className="p-4 text-center">
                            <button
                              onClick={() => handleTogglePermission(u.user_id, mod, u[mod])}
                              disabled={u.role === 'superadmin'}
                              className={`w-10 h-6 rounded-full transition-colors relative ${
                                u[mod] ? 'bg-green-500' : 'bg-gray-300'
                              } ${u.role === 'superadmin' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <span
                                className={`absolute top-0.5 left-0 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                  u[mod] ? 'translate-x-[18px]' : 'translate-x-[2px]'
                                }`}
                              />
                            </button>
                          </td>
                        )
                      )}
                      <td className="p-4 text-center">
                        {u.role !== 'superadmin' && (
                          <button
                            onClick={() => handleDeactivateUser(u.user_id, u.email)}
                            className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                            title="Desactivar usuario"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
