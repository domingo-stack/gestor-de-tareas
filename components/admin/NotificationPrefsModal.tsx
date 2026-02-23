'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/Modal';
import { BellIcon, EnvelopeIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';

type NotificationPref = 'all' | 'inapp' | 'email' | 'off' | 'default';

type Preferences = {
  event_created: NotificationPref;
  task_assigned: NotificationPref;
  task_completed: NotificationPref;
  mention: NotificationPref;
  review_request: NotificationPref;
  review_result: NotificationPref;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  userRole: string;
  supabase: any;
};

const NOTIFICATION_TYPES: { key: keyof Preferences; label: string; broadcastOnly?: boolean }[] = [
  { key: 'event_created', label: 'Nuevo evento en calendario', broadcastOnly: true },
  { key: 'task_assigned', label: 'Asignación de tarea' },
  { key: 'task_completed', label: 'Tarea completada' },
  { key: 'mention', label: 'Mención en comentario' },
  { key: 'review_request', label: 'Solicitud de revisión' },
  { key: 'review_result', label: 'Resultado de revisión' },
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

export default function NotificationPrefsModal({ isOpen, onClose, userId, userEmail, userRole, supabase }: Props) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const roleDefaults = ROLE_DEFAULTS[userRole] || ROLE_DEFAULTS.invitado;

  const fetchPrefs = useCallback(async () => {
    if (!supabase || !userId) return;
    setIsLoading(true);
    const { data, error } = await supabase.rpc('get_notification_preferences', { p_user_id: userId });
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
  }, [supabase, userId]);

  useEffect(() => {
    if (isOpen) fetchPrefs();
  }, [isOpen, fetchPrefs]);

  const savePref = async (key: keyof Preferences, value: NotificationPref) => {
    if (!supabase) return;
    setIsSaving(true);

    const updated = { ...prefs!, [key]: value };
    setPrefs(updated);

    const { error } = await supabase.rpc('upsert_notification_preferences', {
      p_user_id: userId,
      p_prefs: updated,
    });

    if (error) {
      toast.error('Error al guardar preferencia');
      fetchPrefs();
    }
    setIsSaving(false);
  };

  const handleResetDefaults = async () => {
    if (!supabase) return;
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
      p_user_id: userId,
      p_prefs: defaults,
    });

    if (error) {
      toast.error('Error al restaurar defaults');
      fetchPrefs();
    } else {
      toast.success('Preferencias restauradas');
    }
    setIsSaving(false);
  };

  const handleToggle = (key: keyof Preferences, channel: 'email' | 'inapp') => {
    if (!prefs) return;
    const resolved = resolvePreference(prefs[key], roleDefaults[key]);
    let newEmail = resolved.email;
    let newInapp = resolved.inapp;
    if (channel === 'email') newEmail = !newEmail;
    else newInapp = !newInapp;
    savePref(key, prefFromToggles(newEmail, newInapp));
  };

  const roleBadgeColor = userRole === 'superadmin'
    ? 'bg-purple-100 text-purple-700'
    : userRole === 'member'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-gray-100 text-gray-600';

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Notificaciones</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {userEmail}
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${roleBadgeColor}`}>{userRole}</span>
            </p>
          </div>
          <button
            onClick={handleResetDefaults}
            disabled={isSaving || isLoading}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Restaurar
          </button>
        </div>

        {isLoading ? (
          <p className="text-gray-500 text-sm py-4">Cargando...</p>
        ) : prefs ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-1 text-xs font-semibold text-gray-500">Tipo</th>
                <th className="text-center py-2 px-1 text-xs font-semibold text-gray-500 w-20">
                  <div className="flex items-center justify-center gap-1">
                    <EnvelopeIcon className="h-3.5 w-3.5" />
                    Email
                  </div>
                </th>
                <th className="text-center py-2 px-1 text-xs font-semibold text-gray-500 w-20">
                  <div className="flex items-center justify-center gap-1">
                    <BellIcon className="h-3.5 w-3.5" />
                    In-app
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TYPES.map((type) => {
                const currentPref = prefs[type.key];
                const resolved = resolvePreference(currentPref, roleDefaults[type.key]);
                const isDefault = currentPref === 'default';

                return (
                  <tr key={type.key} className="border-b border-gray-50">
                    <td className="py-2.5 px-1">
                      <span className="text-sm text-gray-700">{type.label}</span>
                      {isDefault && <span className="ml-1 text-xs text-gray-400">(def)</span>}
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <button
                        onClick={() => handleToggle(type.key, 'email')}
                        disabled={isSaving}
                        className={`w-10 h-6 rounded-full transition-colors relative inline-flex items-center ${
                          resolved.email ? 'bg-[#ff8080]' : 'bg-gray-300'
                        } ${isSaving ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span
                          className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                            resolved.email ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <button
                        onClick={() => handleToggle(type.key, 'inapp')}
                        disabled={isSaving}
                        className={`w-10 h-6 rounded-full transition-colors relative inline-flex items-center ${
                          resolved.inapp ? 'bg-[#ff8080]' : 'bg-gray-300'
                        } ${isSaving ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span
                          className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                            resolved.inapp ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500 text-sm">No se pudieron cargar las preferencias.</p>
        )}
      </div>
    </Modal>
  );
}
