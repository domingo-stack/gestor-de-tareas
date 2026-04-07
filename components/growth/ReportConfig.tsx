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

  // Manual send state
  const [manualSending, setManualSending] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>(''); // YYYY-MM-DD del domingo
  const [showManualConfirm, setShowManualConfirm] = useState(false);

  // Calcular últimas 4 semanas Dom-Sáb (en hora Lima)
  const getLastNSundays = (n: number) => {
    // Domingo de hoy en Lima
    const now = new Date();
    const utc5 = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const dow = utc5.getUTCDay();
    utc5.setUTCDate(utc5.getUTCDate() - dow);
    utc5.setUTCHours(0, 0, 0, 0);
    const todaySunday = new Date(utc5.getUTCFullYear(), utc5.getUTCMonth(), utc5.getUTCDate());
    // Última semana cerrada = domingo anterior
    const lastClosed = new Date(todaySunday);
    lastClosed.setDate(lastClosed.getDate() - 7);
    const result: { value: string; label: string }[] = [];
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    for (let i = 0; i < n; i++) {
      const sunday = new Date(lastClosed);
      sunday.setDate(sunday.getDate() - i * 7);
      const saturday = new Date(sunday);
      saturday.setDate(saturday.getDate() + 6);
      const value = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
      const label = `${sunday.getDate()} ${months[sunday.getMonth()]} – ${saturday.getDate()} ${months[saturday.getMonth()]} ${saturday.getFullYear()}${i === 0 ? ' (más reciente)' : ''}`;
      result.push({ value, label });
    }
    return result;
  };
  const weekOptions = getLastNSundays(8);

  // Inicializar selectedWeek con la última semana cerrada
  useEffect(() => {
    if (!selectedWeek && weekOptions.length > 0) {
      setSelectedWeek(weekOptions[0].value);
    }
  }, [weekOptions, selectedWeek]);

  // Helper: invocar el edge function send-growth-report
  // Si useUserJwt=true, manda el JWT del usuario logueado (necesario para
  // manual: true). Si false, manda el anon key (suficiente para test/preview).
  const callSendReport = async (
    body: Record<string, unknown>,
    useUserJwt = false,
  ) => {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || !anonKey) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    let bearer = anonKey;
    if (useUserJwt) {
      if (!supabase) throw new Error('Supabase client no inicializado');
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Sesión expirada — recarga la página y vuelve a intentar');
      }
      bearer = accessToken;
    }
    const response = await fetch(`${supabaseUrl}/functions/v1/send-growth-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify(body),
    });
    let result: any = {};
    try { result = await response.json(); } catch { /* not JSON */ }
    return { ok: response.ok, status: response.status, result };
  };

  // Send test report — manda al email del usuario logueado
  const handleSendTest = async () => {
    if (!supabase || !user?.email) {
      toast.error('No se detectó tu email de usuario');
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const { ok, status, result } = await callSendReport({ test: true, to: user.email });
      if (ok) {
        const msg = `Reporte de prueba enviado a ${user.email}`;
        setSendResult({
          type: 'success',
          message: msg,
          detail: `Semana: ${result.week_label || 'actual'} · Tamaño: ${result.html_size_kb || '?'} KB`,
        });
        toast.success(msg);
        // Refresh logs
        const { data: newLogs } = await supabase.from('growth_report_log').select('*').order('sent_at', { ascending: false }).limit(20);
        setLogs(newLogs || []);
      } else if (status === 404) {
        setSendResult({ type: 'error', message: 'Edge Function no encontrada', detail: 'Ejecuta: npx supabase functions deploy send-growth-report' });
      } else if (status === 401) {
        setSendResult({ type: 'error', message: 'No autorizado', detail: 'Verifica CRON_SECRET en Supabase secrets.' });
      } else {
        setSendResult({ type: 'error', message: result.error || `Error ${status}`, detail: `Status ${status}` });
      }
    } catch (err: any) {
      setSendResult({ type: 'error', message: 'Error de red', detail: err.message || 'unknown' });
    } finally {
      setSending(false);
    }
  };

  // Manual send — envía el reporte real a TODOS los recipients activos para una semana específica
  const handleManualSend = async () => {
    if (!supabase) return;
    const activeRecipients = recipients.filter(r => r.is_active);
    if (activeRecipients.length === 0) {
      toast.error('No hay destinatarios activos');
      return;
    }
    if (!selectedWeek) {
      toast.error('Selecciona una semana');
      return;
    }
    setManualSending(true);
    setSendResult(null);
    setShowManualConfirm(false);
    try {
      // manual: true → autenticación con user JWT + verificación de rol superadmin
      // implícitamente bypassa el idempotency guard
      const { ok, status, result } = await callSendReport({
        manual: true,
        week_start_override: selectedWeek,
      }, /* useUserJwt */ true);
      if (ok) {
        const msg = `Reporte enviado a ${result.recipients_count || activeRecipients.length} destinatarios`;
        setSendResult({
          type: 'success',
          message: msg,
          detail: `Semana: ${result.week_label || selectedWeek} · ${result.failed > 0 ? `${result.failed} fallaron · ` : ''}${result.html_size_kb || '?'} KB`,
        });
        toast.success(msg);
        const { data: newLogs } = await supabase.from('growth_report_log').select('*').order('sent_at', { ascending: false }).limit(20);
        setLogs(newLogs || []);
      } else {
        setSendResult({
          type: 'error',
          message: result.error || `Error ${status}`,
          detail: `Status ${status}. Revisa los logs de la edge function en Supabase.`,
        });
      }
    } catch (err: any) {
      setSendResult({ type: 'error', message: 'Error de red', detail: err.message || 'unknown' });
    } finally {
      setManualSending(false);
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
            disabled={sending || !user?.email}
            title={user?.email ? `Enviar prueba a ${user.email}` : 'Sin email de usuario'}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${sending || !user?.email ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            {sending ? 'Enviando...' : `Enviar prueba a ${user?.email ?? 'mí'}`}
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

      {/* Manual send — para reenvíos o envíos fuera del cron */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-grow">
            <h3 className="text-sm font-semibold text-amber-900 mb-1">Envío manual a destinatarios reales</h3>
            <p className="text-xs text-amber-700">
              Envía el reporte de una semana específica a los <strong>{activeCount} destinatarios activos</strong>.
              Útil si el cron falló, para reenviar una semana pasada, o para análisis del board.
              Bypassa el guard de duplicados (puede enviar la misma semana dos veces).
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              disabled={manualSending}
              className="text-sm rounded-md border-amber-300 bg-white px-3 py-2 border min-w-[260px] text-gray-700 focus:ring-2 focus:ring-amber-500"
            >
              {weekOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowManualConfirm(true)}
              disabled={manualSending || activeCount === 0 || !selectedWeek}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${manualSending || activeCount === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
            >
              <PaperAirplaneIcon className="w-4 h-4" />
              {manualSending ? 'Enviando...' : 'Enviar a todos'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmación modal de envío manual */}
      {showManualConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowManualConfirm(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-grow">
                <h3 className="text-base font-semibold text-gray-900 mb-2">Confirmar envío manual</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Vas a enviar el reporte de la semana <strong className="text-gray-900">{weekOptions.find(o => o.value === selectedWeek)?.label}</strong> a <strong className="text-gray-900">{activeCount} destinatario{activeCount !== 1 ? 's' : ''} reales</strong>.
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  Esto no es una prueba — los emails se mandan al board ahora mismo. Si ya enviaste este reporte antes, recibirán otra copia (force=true).
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowManualConfirm(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleManualSend}
                    className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700"
                  >
                    Sí, enviar ahora
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cron info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs text-gray-500">
          <strong>Envío automático:</strong> el reporte se envía cada <strong>lunes 14:00 UTC = 9:00 AM hora Lima</strong> (UTC-5) vía pg_cron a los destinatarios activos. La semana incluida es la última semana cerrada Domingo–Sábado (la que terminó el sábado anterior al envío). El botón "Enviar prueba" manda el reporte de la semana actual solo a tu email logueado, sin afectar el log ni los snapshots.
        </p>
      </div>
    </div>
  );
}
