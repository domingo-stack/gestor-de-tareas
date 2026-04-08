'use client'

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import AuthGuard from '@/components/AuthGuard';
import { TrashIcon, BellIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Toaster, toast } from 'sonner';
import NotificationPrefsModal from '@/components/admin/NotificationPrefsModal';

type AdminUser = {
  user_id: string;
  email: string;
  role: string;
  mod_tareas: boolean;
  mod_calendario: boolean;
  mod_revenue: boolean;
  mod_finanzas: boolean;
  mod_producto: boolean;
  mod_customer_success: boolean;
  mod_comunicaciones: boolean;
  mod_marketing: boolean;
  mod_crm: boolean;
  created_at: string;
};

const ROLES = ['superadmin', 'member', 'invitado'];

const MODULES: { key: keyof AdminUser; label: string }[] = [
  { key: 'mod_tareas', label: 'Tareas' },
  { key: 'mod_calendario', label: 'Calendario' },
  { key: 'mod_revenue', label: 'Revenue' },
  { key: 'mod_finanzas', label: 'Finanzas' },
  { key: 'mod_producto', label: 'Producto' },
  { key: 'mod_customer_success', label: 'Customer Success' },
  { key: 'mod_comunicaciones', label: 'Comunicaciones' },
  { key: 'mod_marketing', label: 'Marketing' },
  { key: 'mod_crm', label: 'CRM' },
];

function countActiveModules(user: AdminUser): number {
  return MODULES.filter(m => user[m.key] as boolean).length;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminUsersPage() {
  const { supabase } = useAuth();
  const { role: currentUserRole } = usePermissions();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [emailToInvite, setEmailToInvite] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [notifModalUser, setNotifModalUser] = useState<AdminUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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

  // Keep selected user in sync with users array
  useEffect(() => {
    if (selectedUser) {
      const updated = users.find(u => u.user_id === selectedUser.user_id);
      if (updated) setSelectedUser(updated);
    }
  }, [users, selectedUser?.user_id]);

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
    const { data } = await supabase.rpc('get_all_users_admin');
    if (data) setUsers(data);
  };

  const handleTogglePermission = async (userId: string, moduleName: string, currentValue: boolean) => {
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
      setUsers(prev =>
        prev.map(u =>
          u.user_id === userId ? { ...u, [moduleName]: currentValue } : u
        )
      );
    }
  };

  const handleDeactivateUser = async (userId: string, email: string) => {
    if (!window.confirm(`¿Desactivar a ${email}? Perderá todo acceso.`)) return;

    const { error } = await supabase.rpc('deactivate_user', { target_user_id: userId });
    if (error) {
      toast.error(`Error al desactivar usuario: ${error.message}`);
      return;
    }

    toast.success('Usuario desactivado');
    setSelectedUser(null);
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
      if (!response.ok) throw new Error(result.error || 'Error al enviar la invitación');
      toast.success(result.message);
      setEmailToInvite('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }

    setIsInviting(false);
  };

  const filteredUsers = searchTerm
    ? users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()))
    : users;

  if (currentUserRole !== 'superadmin') {
    return (
      <AuthGuard>
        <div className="max-w-4xl mx-auto p-8 text-center">
          <h1 className="text-2xl font-bold">Acceso Denegado</h1>
          <p className="mt-2 text-gray-600">No tienes los permisos necesarios.</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <Toaster position="top-right" richColors />

        <h1 className="text-2xl font-bold text-[#383838] mb-6">Administración de Usuarios</h1>

        {/* Invitar usuario */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Invitar Nuevo Usuario</h2>
          <form onSubmit={handleInviteUser} className="flex gap-2">
            <input
              type="email"
              value={emailToInvite}
              onChange={(e) => setEmailToInvite(e.target.value)}
              placeholder="email@ejemplo.com"
              className="flex-grow px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={isInviting}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#ff8080] hover:bg-[#ff6b6b] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              disabled={isInviting}
            >
              {isInviting ? 'Enviando...' : 'Invitar'}
            </button>
          </form>
        </div>

        {/* Buscador */}
        <div className="relative mb-4">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Tabla de usuarios */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Cargando usuarios...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Rol</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Módulos</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Registrado</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelected = selectedUser?.user_id === u.user_id;
                  const isSuperadmin = u.role === 'superadmin';
                  const activeCount = countActiveModules(u);

                  return (
                    <tr
                      key={u.user_id}
                      onClick={() => setSelectedUser(u)}
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-gray-800">{u.email}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          isSuperadmin
                            ? 'bg-purple-100 text-purple-700'
                            : u.role === 'member'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {isSuperadmin ? (
                          <span className="text-xs font-medium text-purple-600">Todos</span>
                        ) : (
                          <span className="text-xs text-gray-500">
                            <span className="font-bold text-gray-800">{activeCount}</span> de {MODULES.length}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">
                        {formatDate(u.created_at)}
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                      {searchTerm ? 'No se encontraron usuarios' : 'No hay usuarios'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Side Panel (Drawer) */}
      {selectedUser && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40 transition-opacity"
            onClick={() => setSelectedUser(null)}
          />

          {/* Drawer */}
          <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-gray-800 truncate">{selectedUser.email}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Registrado {formatDate(selectedUser.created_at)}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Rol */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rol</label>
                <select
                  value={selectedUser.role ?? ''}
                  onChange={(e) => handleRoleChange(selectedUser.user_id, e.target.value)}
                  disabled={selectedUser.role === 'superadmin'}
                  className={`w-full px-3 py-2 rounded-lg border text-sm font-medium ${
                    selectedUser.role === 'superadmin'
                      ? 'bg-purple-50 text-purple-700 border-purple-200 cursor-not-allowed'
                      : selectedUser.role === 'member'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Módulos */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Módulos de acceso</label>
                <div className="space-y-1">
                  {MODULES.map((mod) => {
                    const isOn = selectedUser.role === 'superadmin' || (selectedUser[mod.key] as boolean);
                    const disabled = selectedUser.role === 'superadmin';

                    return (
                      <div
                        key={mod.key}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                          disabled ? 'bg-gray-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className={`text-sm ${isOn ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                          {mod.label}
                        </span>
                        <button
                          onClick={() => handleTogglePermission(selectedUser.user_id, mod.key, selectedUser[mod.key] as boolean)}
                          disabled={disabled}
                          className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                            isOn ? 'bg-green-500' : 'bg-gray-300'
                          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <span
                            className="absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-all"
                            style={{ left: isOn ? '19px' : '3px' }}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Acciones */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Acciones</label>
                <div className="space-y-2">
                  <button
                    onClick={() => setNotifModalUser(selectedUser)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm text-gray-700"
                  >
                    <BellIcon className="h-5 w-5 text-gray-400" />
                    Preferencias de notificaciones
                  </button>
                  {selectedUser.role !== 'superadmin' && (
                    <button
                      onClick={() => handleDeactivateUser(selectedUser.user_id, selectedUser.email)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-red-200 hover:bg-red-50 transition-colors text-sm text-red-600"
                    >
                      <TrashIcon className="h-5 w-5" />
                      Desactivar usuario
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {notifModalUser && (
        <NotificationPrefsModal
          isOpen={!!notifModalUser}
          onClose={() => setNotifModalUser(null)}
          userId={notifModalUser.user_id}
          userEmail={notifModalUser.email}
          userRole={notifModalUser.role}
          supabase={supabase}
        />
      )}
    </AuthGuard>
  );
}
