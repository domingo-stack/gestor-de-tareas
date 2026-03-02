'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import {
  PlusIcon,
  TrashIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { fmtNum } from './formatters';
import { toast } from 'sonner';

interface Recipient {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface ReportLog {
  id: string;
  week_start: string;
  sent_at: string;
  recipients_count: number;
  status: string;
  error_message: string | null;
}

export default function ReportConfig() {
  const { supabase, user } = useAuth();
  const { role } = usePermissions();

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [logs, setLogs] = useState<ReportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // New recipient form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Fetch data
  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      const [recipientsRes, logsRes] = await Promise.all([
        supabase.from('growth_report_config').select('*').order('created_at', { ascending: false }),
        supabase.from('growth_report_log').select('*').order('sent_at', { ascending: false }).limit(20),
      ]);
      setRecipients(recipientsRes.data || []);
      setLogs(logsRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, [supabase]);

  // Add recipient
  const handleAdd = async () => {
    if (!newEmail.trim() || !supabase) return;
    const { data, error } = await supabase.from('growth_report_config').insert({
      recipient_email: newEmail.trim(),
      recipient_name: newName.trim() || null,
      is_active: true,
      added_by: user?.id,
    }).select().single();

    if (error) {
      toast.error('Error al agregar destinatario');
      return;
    }
    setRecipients([data, ...recipients]);
    setNewEmail('');
    setNewName('');
    setShowForm(false);
    toast.success('Destinatario agregado');
  };

  // Toggle active
  const handleToggle = async (id: string, currentState: boolean) => {
    if (!supabase) return;
    const { error } = await supabase.from('growth_report_config').update({ is_active: !currentState }).eq('id', id);
    if (error) {
      toast.error('Error al actualizar');
      return;
    }
    setRecipients(recipients.map(r => r.id === id ? { ...r, is_active: !currentState } : r));
  };

  // Delete recipient
  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('growth_report_config').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar');
      return;
    }
    setRecipients(recipients.filter(r => r.id !== id));
    toast.success('Destinatario eliminado');
  };

  // Send result state
  const [sendResult, setSendResult] = useState<{ type: 'success' | 'error'; message: string; detail?: string } | null>(null);

  // Send test report
  const handleSendTest = async () => {
    if (!supabase) return;
    const activeRecipients = recipients.filter(r => r.is_active);
    if (activeRecipients.length === 0) {
      toast.error('No hay destinatarios activos');
      return;
    }

    setSending(true);
    setSendResult(null);
    try {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (!supabaseUrl || !anonKey) {
        setSendResult({ type: 'error', message: 'Configuracion incompleta', detail: 'Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY' });
        setSending(false);
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/send-growth-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ test: true }),
      });

      let result: any = {};
      try {
        result = await response.json();
      } catch {
        // Response wasn't JSON
      }

      if (response.ok) {
        const msg = `Reporte enviado exitosamente a ${result.recipients_count || activeRecipients.length} destinatario(s)`;
        setSendResult({
          type: 'success',
          message: msg,
          detail: result.failed > 0 ? `${result.failed} envio(s) fallaron` : `Semana: ${result.week || 'actual'}`,
        });
        toast.success(msg);
        // Refresh logs
        const { data: newLogs } = await supabase.from('growth_report_log').select('*').order('sent_at', { ascending: false }).limit(20);
        setLogs(newLogs || []);
      } else if (response.status === 404) {
        setSendResult({
          type: 'error',
          message: 'Edge Function no encontrada',
          detail: 'La funcion send-growth-report no esta desplegada. Ejecuta: npx supabase functions deploy send-growth-report --no-verify-jwt',
        });
      } else if (response.status === 401) {
        setSendResult({
          type: 'error',
          message: 'No autorizado',
          detail: 'Verifica que CRON_SECRET este configurado en las variables de entorno de Supabase Edge Functions.',
        });
      } else {
        setSendResult({
          type: 'error',
          message: result.error || `Error del servidor (${response.status})`,
          detail: `Status: ${response.status}. ${result.error || 'Revisa los logs de la Edge Function en el dashboard de Supabase.'}`,
        });
      }
    } catch (err: any) {
      setSendResult({
        type: 'error',
        message: 'No se pudo conectar con la Edge Function',
        detail: `${err.message || 'Error de red'}. Verifica que la funcion este desplegada y que la URL de Supabase sea correcta.`,
      });
    } finally {
      setSending(false);
    }
  };

  if (role !== 'superadmin') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <ExclamationTriangleIcon className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-red-800">Acceso restringido</h3>
        <p className="text-sm text-red-600">Solo superadmins pueden configurar reportes.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  const activeCount = recipients.filter(r => r.is_active).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Reportes Semanales</h2>
          <p className="text-sm text-gray-500">Configura los destinatarios del reporte semanal de growth.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Agregar destinatario
          </button>
          <button
            onClick={handleSendTest}
            disabled={sending || activeCount === 0}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${sending || activeCount === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            {sending ? 'Enviando...' : 'Enviar reporte de prueba'}
          </button>
        </div>
      </div>

      {/* Send result banner */}
      {sendResult && (
        <div className={`rounded-xl p-4 border ${sendResult.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-start gap-3">
            {sendResult.type === 'success' ? (
              <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
            ) : (
              <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className={`text-sm font-medium ${sendResult.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
                {sendResult.message}
              </p>
              {sendResult.detail && (
                <p className={`text-xs mt-1 ${sendResult.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {sendResult.detail}
                </p>
              )}
            </div>
            <button onClick={() => setSendResult(null)} className="ml-auto text-gray-400 hover:text-gray-600">
              <XCircleIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-grow">
              <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@ejemplo.com"
                className="w-full rounded-md border-gray-300 shadow-sm text-sm px-3 py-2 border"
              />
            </div>
            <div className="flex-grow">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre (opcional)</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del destinatario"
                className="w-full rounded-md border-gray-300 shadow-sm text-sm px-3 py-2 border"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!newEmail.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
                Agregar
              </button>
              <button onClick={() => { setShowForm(false); setNewEmail(''); setNewName(''); }} className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recipients table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-semibold text-gray-700">Destinatarios</h3>
          <span className="text-xs text-gray-500">{activeCount} activos de {recipients.length}</span>
        </div>
        {recipients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-6 py-3 text-left">Estado</th>
                  <th className="px-6 py-3 text-left">Email</th>
                  <th className="px-6 py-3 text-left">Nombre</th>
                  <th className="px-6 py-3 text-left">Agregado</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recipients.map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${!r.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => handleToggle(r.id, r.is_active)}
                        className="focus:outline-none"
                        title={r.is_active ? 'Desactivar' : 'Activar'}
                      >
                        {r.is_active ? (
                          <CheckCircleIcon className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircleIcon className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-900">{r.recipient_email}</td>
                    <td className="px-6 py-3 text-gray-600">{r.recipient_name || '-'}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{new Date(r.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="Eliminar"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            No hay destinatarios configurados. Agrega al menos uno para enviar reportes.
          </div>
        )}
      </div>

      {/* Send history */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-700">Historial de envios</h3>
        </div>
        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-6 py-3 text-left">Fecha de envio</th>
                  <th className="px-6 py-3 text-left">Semana del reporte</th>
                  <th className="px-6 py-3 text-right">Destinatarios</th>
                  <th className="px-6 py-3 text-left">Estado</th>
                  <th className="px-6 py-3 text-left">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-900">
                      {new Date(log.sent_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <span className="block text-xs text-gray-400">{new Date(log.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{new Date(log.week_start).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">{fmtNum(log.recipients_count)}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${log.status === 'sent' ? 'bg-green-50 text-green-700' : log.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
                        {log.status === 'sent' ? 'Enviado' : log.status === 'error' ? 'Error' : log.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-red-500 max-w-[200px] truncate" title={log.error_message || ''}>
                      {log.error_message || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            No hay envios registrados aun.
          </div>
        )}
      </div>

      {/* Cron info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs text-gray-500">
          <strong>Envio automatico:</strong> El reporte se envia automaticamente cada lunes a las 07:00 UTC via cron externo.
          El boton "Enviar reporte de prueba" genera y envia el reporte de la semana actual inmediatamente.
        </p>
      </div>
    </div>
  );
}
