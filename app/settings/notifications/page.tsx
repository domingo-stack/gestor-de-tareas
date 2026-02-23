'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import AuthGuard from '@/components/AuthGuard';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Toaster, toast } from 'sonner';
import { BellIcon, EnvelopeIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

type NotificationPref = 'all' | 'inapp' | 'email' | 'off' | 'default';

type Preferences = {
  event_created: NotificationPref;
  task_assigned: NotificationPref;
  task_completed: NotificationPref;
  mention: NotificationPref;
  review_request: NotificationPref;
  review_result: NotificationPref;
};

const NOTIFICATION_TYPES: { key: keyof Preferences; label: string; broadcastOnly?: boolean }[] = [
  { key: 'event_created', label: 'Nuevo evento en calendario', broadcastOnly: true },
  { key: 'task_assigned', label: 'Me asignaron una tarea' },
  { key: 'task_completed', label: 'Completaron una tarea mía' },
  { key: 'mention', label: 'Me mencionaron en un comentario' },
  { key: 'review_request', label: 'Me piden revisión de contenido' },
  { key: 'review_result', label: 'Resultado de mi revisión' },
];

const ROLE_DEFAULTS: Record<string, Preferences> = {
  superadmin: {
    event_created: 'all',
    task_assigned: 'all',
    task_completed: 'all',
    mention: 'all',
    review_request: 'all',
    review_result: 'all',
  },
  member: {
    event_created: 'inapp',
    task_assigned: 'all',
    task_completed: 'all',
    mention: 'all',
    review_request: 'all',
    review_result: 'all',
  },
  invitado: {
    event_created: 'off',
    task_assigned: 'all',
    task_completed: 'inapp',
    mention: 'all',
    review_request: 'all',
    review_result: 'all',
  },
};

function resolvePreference(pref: NotificationPref, roleDefault: NotificationPref): { email: boolean; inapp: boolean } {
  const resolved = pref === 'default' ? roleDefault : pref;
  return {
    email: resolved === 'all' || resolved === 'email',
    inapp: resolved === 'all' || resolved === 'inapp',
  };
}

function prefFromToggles(email: boolean, inapp: boolean): NotificationPref {
  if (email && inapp) return 'all';
  if (email) return 'email';
  if (inapp) return 'inapp';
  return 'off';
}

function SettingsTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: '/settings/team', label: 'Equipo' },
    { href: '/settings/notifications', label: 'Notificaciones' },
  ];

  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              active
                ? 'border-[#ff8080] text-[#ff8080]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function NotificationSettingsPage() {
  const { supabase, user } = useAuth();
  const { role } = usePermissions();

  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const roleDefaults = ROLE_DEFAULTS[role || 'invitado'] || ROLE_DEFAULTS.invitado;

  const fetchPrefs = useCallback(async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase.rpc('get_notification_preferences', { p_user_id: user.id });
    if (error) {
      console.error('Error cargando preferencias:', error);
    } else if (data) {
      setPrefs({
        event_created: data.event_created || 'default',
        task_assigned: data.task_assigned || 'default',
        task_completed: data.task_completed || 'default',
        mention: data.mention || 'default',
        review_request: data.review_request || 'default',
        review_result: data.review_result || 'default',
      });
    }
    setIsLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const savePref = async (key: keyof Preferences, value: NotificationPref) => {
    if (!supabase || !user) return;
    setIsSaving(true);

    const updated = { ...prefs!, [key]: value };
    setPrefs(updated);

    const { error } = await supabase.rpc('upsert_notification_preferences', {
      p_user_id: user.id,
      p_prefs: updated,
    });

    if (error) {
      toast.error('Error al guardar preferencia');
      fetchPrefs(); // revert
    }
    setIsSaving(false);
  };

  const handleResetDefaults = async () => {
    if (!supabase || !user) return;
    setIsSaving(true);

    const defaults: Preferences = {
      event_created: 'default',
      task_assigned: 'default',
      task_completed: 'default',
      mention: 'default',
      review_request: 'default',
      review_result: 'default',
    };
    setPrefs(defaults);

    const { error } = await supabase.rpc('upsert_notification_preferences', {
      p_user_id: user.id,
      p_prefs: defaults,
    });

    if (error) {
      toast.error('Error al restaurar defaults');
      fetchPrefs();
    } else {
      toast.success('Preferencias restauradas a los valores por defecto');
    }
    setIsSaving(false);
  };

  const handleToggle = (key: keyof Preferences, channel: 'email' | 'inapp') => {
    if (!prefs) return;

    const currentPref = prefs[key];
    const resolved = resolvePreference(currentPref, roleDefaults[key]);

    let newEmail = resolved.email;
    let newInapp = resolved.inapp;

    if (channel === 'email') newEmail = !newEmail;
    else newInapp = !newInapp;

    const newPref = prefFromToggles(newEmail, newInapp);
    savePref(key, newPref);
  };

  return (
    <AuthGuard>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <Toaster position="top-right" richColors />
        <h1 className="text-2xl font-bold mb-2">Configuración</h1>
        <SettingsTabs />

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Preferencias de Notificaciones</h2>
              <p className="text-sm text-gray-500 mt-1">
                Configura cómo quieres recibir cada tipo de notificación.
                {role && <span className="ml-1 text-gray-400">(Rol: {role})</span>}
              </p>
            </div>
            <button
              onClick={handleResetDefaults}
              disabled={isSaving || isLoading}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Restaurar defaults
            </button>
          </div>

          {isLoading ? (
            <p className="text-gray-500">Cargando preferencias...</p>
          ) : prefs ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 text-sm font-semibold text-gray-600">Tipo de notificación</th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-600 w-28">
                      <div className="flex items-center justify-center gap-1">
                        <EnvelopeIcon className="h-4 w-4" />
                        Email
                      </div>
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-600 w-28">
                      <div className="flex items-center justify-center gap-1">
                        <BellIcon className="h-4 w-4" />
                        Campanita
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {NOTIFICATION_TYPES.map((type) => {
                    const currentPref = prefs[type.key];
                    const resolved = resolvePreference(currentPref, roleDefaults[type.key]);
                    const isDefault = currentPref === 'default';
                    const isDisabled = type.broadcastOnly && role === 'invitado' && roleDefaults[type.key] === 'off';

                    return (
                      <tr key={type.key} className={`border-b border-gray-100 ${isDisabled ? 'opacity-50' : ''}`}>
                        <td className="py-3 px-2">
                          <span className="text-sm text-gray-800">{type.label}</span>
                          {isDefault && !isDisabled && (
                            <span className="ml-2 text-xs text-gray-400">(por defecto)</span>
                          )}
                          {isDisabled && (
                            <span className="ml-2 text-xs text-gray-400">(no disponible para tu rol)</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => handleToggle(type.key, 'email')}
                            disabled={isSaving || isDisabled}
                            className={`w-11 h-6 rounded-full transition-colors inline-flex items-center ${
                              resolved.email ? 'bg-[#ff8080]' : 'bg-gray-300'
                            } ${isSaving || isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                                resolved.email ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => handleToggle(type.key, 'inapp')}
                            disabled={isSaving || isDisabled}
                            className={`w-11 h-6 rounded-full transition-colors inline-flex items-center ${
                              resolved.inapp ? 'bg-[#ff8080]' : 'bg-gray-300'
                            } ${isSaving || isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                                resolved.inapp ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No se pudieron cargar las preferencias.</p>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
