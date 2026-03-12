'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

interface CommVariable {
  id: number;
  key: string;
  value: string;
  descripcion: string | null;
  updated_at: string;
}

// Variables que se resuelven automáticamente desde growth_users — no editables aquí
const USER_VARIABLES = ['nombre', 'apellido', 'fecha_fin', 'dias_restantes', 'plan_id', 'email'];

interface TestContact {
  id: number;
  etiqueta: string;
  phone: string;
  variables: Record<string, string>;
  created_at: string;
  updated_at: string;
}

const TEST_CONTACT_VARS = [
  { key: 'nombre',         placeholder: 'Juan',        label: 'Nombre' },
  { key: 'apellido',       placeholder: 'Pérez',       label: 'Apellido' },
  { key: 'fecha_fin',      placeholder: '31 mar 2026', label: 'Fecha fin' },
  { key: 'dias_restantes', placeholder: '7',           label: 'Días restantes' },
  { key: 'plan_id',        placeholder: 'pro',         label: 'Plan ID' },
];

function VariableRow({ variable, onSave }: {
  variable: CommVariable;
  onSave: (id: number, value: string, descripcion: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(variable.value);
  const [desc, setDesc] = useState(variable.descripcion ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(variable.id, value, desc);
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setValue(variable.value);
    setDesc(variable.descripcion ?? '');
    setEditing(false);
  };

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-4 py-3">
        <code className="text-sm font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
          {`{{${variable.key}}}`}
        </code>
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#3c527a] transition-colors"
            autoFocus
          />
        ) : (
          <span className="text-sm text-gray-700 font-medium">{variable.value}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Descripción opcional..."
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#3c527a] transition-colors"
          />
        ) : (
          <span className="text-sm text-gray-400">{variable.descripcion ?? '—'}</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
        {new Date(variable.updated_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !value.trim()}
              className="text-xs font-semibold text-white bg-[#ff8080] hover:bg-[#ff6b6b] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={handleCancel}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-[#3c527a] hover:underline font-medium"
          >
            Editar
          </button>
        )}
      </td>
    </tr>
  );
}

function AddVariableForm({ onAdd }: { onAdd: (key: string, value: string, descripcion: string) => Promise<void> }) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!cleanKey || !value.trim()) return;
    if (USER_VARIABLES.includes(cleanKey)) {
      toast.error(`"${cleanKey}" es una variable reservada de datos de usuario`);
      return;
    }
    setSaving(true);
    await onAdd(cleanKey, value.trim(), desc.trim());
    setKey('');
    setValue('');
    setDesc('');
    setSaving(false);
  };

  return (
    <tr className="bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="text-gray-400 font-mono text-sm">{'{{'}</span>
          <input
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="nombre_variable"
            className="w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono outline-none focus:border-[#3c527a] transition-colors"
          />
          <span className="text-gray-400 font-mono text-sm">{'}}'}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="https://..."
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#3c527a] transition-colors"
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Descripción..."
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#3c527a] transition-colors"
        />
      </td>
      <td className="px-4 py-3" />
      <td className="px-4 py-3">
        <button
          onClick={handleAdd}
          disabled={saving || !key.trim() || !value.trim()}
          className="text-xs font-semibold text-white bg-[#ff8080] hover:bg-[#ff6b6b] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? 'Agregando...' : '+ Agregar'}
        </button>
      </td>
    </tr>
  );
}

function TestContactForm({ contact, onClose, onSave }: {
  contact?: TestContact | null;
  onClose: () => void;
  onSave: (c: TestContact) => void;
}) {
  const { supabase } = useAuth();
  const [etiqueta, setEtiqueta] = useState(contact?.etiqueta ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [vars, setVars] = useState<Record<string, string>>(contact?.variables ?? {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!etiqueta.trim() || !phone.trim()) {
      toast.error('Etiqueta y teléfono son obligatorios');
      return;
    }
    setSaving(true);
    const payload = {
      etiqueta: etiqueta.trim(),
      phone: phone.trim(),
      variables: vars,
      updated_at: new Date().toISOString(),
    };
    let result;
    if (contact?.id) {
      const { data, error } = await supabase!
        .from('comm_test_contacts')
        .update(payload)
        .eq('id', contact.id)
        .select()
        .single();
      if (error) { toast.error('Error al guardar'); setSaving(false); return; }
      result = data;
    } else {
      const { data, error } = await supabase!
        .from('comm_test_contacts')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
      if (error) { toast.error('Error al guardar'); setSaving(false); return; }
      result = data;
    }
    toast.success(contact?.id ? 'Contacto actualizado' : 'Contacto creado');
    onSave(result);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="bg-[#3c527a] px-6 py-4 flex items-center justify-between">
          <h2 className="text-white text-lg font-bold">
            {contact ? 'Editar contacto' : 'Nuevo contacto de prueba'}
          </h2>
          <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Etiqueta</label>
            <input
              value={etiqueta}
              onChange={e => setEtiqueta(e.target.value)}
              placeholder="ej. Usuario plan pro (7 días para vencer)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Teléfono</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+56912345678"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Variables de usuario</label>
            <div className="space-y-2">
              {TEST_CONTACT_VARS.map(v => (
                <div key={v.key} className="flex items-center gap-2">
                  <code className="text-xs text-blue-700 bg-blue-50 px-2 py-1.5 rounded w-36 flex-shrink-0 font-mono">{`{{${v.key}}}`}</code>
                  <input
                    value={vars[v.key] ?? ''}
                    onChange={e => setVars(prev => ({ ...prev, [v.key]: e.target.value }))}
                    placeholder={v.placeholder}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#3c527a] transition-colors"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">Variables estáticas (link_renovacion, etc.) se toman automáticamente de la sección Variables.</p>
          </div>
        </div>
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between bg-gray-50">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !etiqueta.trim() || !phone.trim()}
            className="px-4 py-2 text-sm font-semibold bg-[#ff8080] hover:bg-[#ff6b6b] text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : contact ? 'Guardar cambios' : 'Crear contacto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Auto-reply configuration
// ──────────────────────────────────────────
const AUTO_REPLY_KEYS = ['auto_reply_enabled', 'auto_reply_message', 'auto_reply_support_number', 'auto_reply_support_url'];

const DEFAULT_AUTO_REPLY =
  'Gracias por tu mensaje 🙏\n\n' +
  'Este es un canal de difusión y no monitoreamos las respuestas.\n\n' +
  'Para ponerte en contacto con nuestro equipo, usa el enlace de abajo.\n\n' +
  'Muchas gracias y disculpa las molestias.';

function AutoReplyConfig() {
  const { supabase } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState(DEFAULT_AUTO_REPLY);
  const [supportNumber, setSupportNumber] = useState('');
  const [supportUrl, setSupportUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('comm_variables')
      .select('key, value')
      .in('key', AUTO_REPLY_KEYS)
      .then(({ data }) => {
        (data ?? []).forEach(r => {
          if (r.key === 'auto_reply_enabled') setEnabled(r.value !== 'false');
          if (r.key === 'auto_reply_message') setMessage(r.value);
          if (r.key === 'auto_reply_support_number') setSupportNumber(r.value);
          if (r.key === 'auto_reply_support_url') setSupportUrl(r.value);
        });
        setLoading(false);
      });
  }, [supabase]);

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true);
    const entries = [
      { key: 'auto_reply_enabled', value: String(enabled) },
      { key: 'auto_reply_message', value: message },
      { key: 'auto_reply_support_number', value: supportNumber },
      { key: 'auto_reply_support_url', value: supportUrl },
    ];
    for (const entry of entries) {
      // Upsert: try update first, insert if not exists
      const { data: existing } = await supabase
        .from('comm_variables')
        .select('id')
        .eq('key', entry.key)
        .single();
      if (existing) {
        await supabase
          .from('comm_variables')
          .update({ value: entry.value, updated_at: new Date().toISOString() })
          .eq('key', entry.key);
      } else {
        await supabase
          .from('comm_variables')
          .insert({
            key: entry.key,
            value: entry.value,
            descripcion: `Auto-reply: ${entry.key}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      }
    }
    toast.success('Respuesta automática guardada');
    setSaving(false);
  };

  if (loading) return null;

  const previewMsg = message;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[#383838] text-sm">Respuesta automática</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Responde automáticamente cuando un usuario escribe al número de difusión
          </p>
        </div>
        <button
          onClick={async () => {
            if (!supabase) return;
            const newVal = !enabled;
            setEnabled(newVal);
            const { data: existing } = await supabase
              .from('comm_variables')
              .select('id')
              .eq('key', 'auto_reply_enabled')
              .single();
            if (existing) {
              await supabase
                .from('comm_variables')
                .update({ value: String(newVal), updated_at: new Date().toISOString() })
                .eq('key', 'auto_reply_enabled');
            } else {
              await supabase
                .from('comm_variables')
                .insert({ key: 'auto_reply_enabled', value: String(newVal), descripcion: 'Auto-reply toggle', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
            }
            toast.success(newVal ? 'Respuesta automática activada' : 'Respuesta automática desactivada');
          }}
          className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {enabled && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Número de soporte (referencia)
              </label>
              <input
                value={supportNumber}
                onChange={e => setSupportNumber(e.target.value)}
                placeholder="+51 999 999 999"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                URL del botón (wa.link)
              </label>
              <input
                value={supportUrl}
                onChange={e => setSupportUrl(e.target.value)}
                placeholder="https://wa.link/abc123"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors font-mono"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-2">
            El mensaje incluirá un botón que redirige al usuario al WhatsApp oficial de soporte.
          </p>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Mensaje de respuesta
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3c527a] transition-colors resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Se enviará una sola vez por número cada 24 horas para evitar spam.
            </p>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Preview
            </label>
            <div className="bg-[#ECE5DD] rounded-xl p-4">
              <div className="max-w-xs">
                {/* Incoming message */}
                <div className="bg-white rounded-xl rounded-tl-none px-3 py-2.5 shadow-sm mb-2">
                  <p className="text-sm text-gray-800">Hola, quisiera renovar mi plan...</p>
                  <p className="text-right text-xs text-gray-400 mt-1">12:00</p>
                </div>
                {/* Auto-reply */}
                <div className="bg-[#DCF8C6] rounded-xl rounded-tr-none px-3 py-2.5 shadow-sm ml-auto max-w-[85%]">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{previewMsg}</p>
                  <p className="text-right text-xs text-gray-400 mt-1">12:00 ✓✓</p>
                </div>
                {/* Button preview */}
                {supportUrl && (
                  <div className="bg-white rounded-lg px-3 py-2 text-center shadow-sm ml-auto max-w-[85%] mt-1 flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-[#00A5F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    <span className="text-sm font-medium text-[#00A5F4]">Contactar Soporte</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-[#ff8080] hover:bg-[#ff6b6b] text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Configuracion() {
  const { supabase } = useAuth();
  const [variables, setVariables] = useState<CommVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [testContacts, setTestContacts] = useState<TestContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<TestContact | null>(null);

  const fetchVariables = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('comm_variables')
      .select('*')
      .order('key');
    if (error) toast.error('Error al cargar variables');
    else setVariables(data ?? []);
    setLoading(false);
  }, [supabase]);

  const fetchTestContacts = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('comm_test_contacts')
      .select('*')
      .order('etiqueta');
    setTestContacts(data ?? []);
    setLoadingContacts(false);
  }, [supabase]);

  useEffect(() => {
    fetchVariables();
    fetchTestContacts();
  }, [fetchVariables, fetchTestContacts]);

  const handleSave = async (id: number, value: string, descripcion: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('comm_variables')
      .update({ value, descripcion, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error('Error al guardar'); return; }
    setVariables(prev => prev.map(v => v.id === id ? { ...v, value, descripcion, updated_at: new Date().toISOString() } : v));
    toast.success('Variable actualizada');
  };

  const handleAdd = async (key: string, value: string, descripcion: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('comm_variables')
      .insert({ key, value, descripcion, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') toast.error(`La variable "{{${key}}}" ya existe`);
      else toast.error('Error al agregar');
      return;
    }
    setVariables(prev => [...prev, data].sort((a, b) => a.key.localeCompare(b.key)));
    toast.success('Variable agregada');
  };

  const handleSaveContact = (saved: TestContact) => {
    setTestContacts(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
    });
    setShowContactForm(false);
    setEditingContact(null);
  };

  const handleDeleteContact = async (id: number, etiqueta: string) => {
    if (!supabase) return;
    if (!confirm(`¿Eliminar "${etiqueta}"?`)) return;
    const { error } = await supabase.from('comm_test_contacts').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    setTestContacts(prev => prev.filter(c => c.id !== id));
    toast.success('Contacto eliminado');
  };

  const handleDelete = async (id: number, key: string) => {
    if (!supabase) return;
    if (!confirm(`¿Eliminar la variable {{${key}}}? Asegúrate de que ningún template activo la use.`)) return;
    const { error } = await supabase.from('comm_variables').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    setVariables(prev => prev.filter(v => v.id !== id));
    toast.success('Variable eliminada');
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[#383838]">Configuración</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Variables de configuración usadas en templates. Se rellenan automáticamente al enviar campañas y automatizaciones.
        </p>
      </div>

      {/* Variables de configuración */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-700">Variables de configuración</p>
            <p className="text-xs text-gray-400 mt-0.5">Valores estáticos reutilizables en todos los templates</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400 text-sm">Cargando...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Variable', 'Valor', 'Descripción', 'Actualizado', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variables.map(v => (
                <VariableRow key={v.id} variable={v} onSave={handleSave} />
              ))}
              <AddVariableForm onAdd={handleAdd} />
            </tbody>
          </table>
        )}
      </div>

      {/* Contactos de prueba */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-700">Contactos de prueba</p>
            <p className="text-xs text-gray-400 mt-0.5">Números para enviar mensajes de test desde la tab Templates</p>
          </div>
          <button
            onClick={() => { setEditingContact(null); setShowContactForm(true); }}
            className="text-xs font-semibold text-white bg-[#ff8080] hover:bg-[#ff6b6b] px-3 py-1.5 rounded-lg transition-colors"
          >
            + Agregar
          </button>
        </div>

        {loadingContacts ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">Cargando...</div>
        ) : testContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <p className="text-sm">No hay contactos de prueba aún.</p>
            <button
              onClick={() => { setEditingContact(null); setShowContactForm(true); }}
              className="mt-2 text-sm text-[#ff8080] hover:underline font-medium"
            >
              Agregar el primero
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {testContacts.map(c => (
              <div key={c.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#383838]">{c.etiqueta}</p>
                  <p className="text-xs font-mono text-gray-500 mt-0.5">{c.phone}</p>
                  {Object.keys(c.variables ?? {}).some(k => c.variables[k]) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {Object.entries(c.variables).map(([k, v]) => v ? (
                        <span key={k} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">
                          {k}={v}
                        </span>
                      ) : null)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 mt-0.5">
                  <button
                    onClick={() => { setEditingContact(c); setShowContactForm(true); }}
                    className="text-xs text-[#3c527a] hover:underline font-medium"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteContact(c.id, c.etiqueta)}
                    className="text-xs text-red-400 hover:text-red-600 hover:underline transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-reply config */}
      <AutoReplyConfig />

      {/* Variables de usuario (solo referencia) */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Variables de usuario — solo referencia</p>
        <p className="text-xs text-blue-600 mb-3">
          Estas variables se rellenan automáticamente con los datos de cada destinatario desde la base de datos. No son editables aquí.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'nombre',          desc: 'Nombre del usuario' },
            { key: 'apellido',        desc: 'Apellido del usuario' },
            { key: 'fecha_fin',       desc: 'Fecha de vencimiento de suscripción' },
            { key: 'dias_restantes',  desc: 'Días hasta el vencimiento (solo automatizaciones)' },
            { key: 'plan_id',         desc: 'ID del plan activo' },
            { key: 'email',           desc: 'Correo electrónico' },
          ].map(v => (
            <div key={v.key} className="bg-white border border-blue-200 rounded-lg px-3 py-1.5">
              <code className="text-xs font-mono text-blue-700">{`{{${v.key}}}`}</code>
              <span className="text-xs text-gray-400 ml-2">{v.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {showContactForm && (
        <TestContactForm
          contact={editingContact}
          onClose={() => { setShowContactForm(false); setEditingContact(null); }}
          onSave={handleSaveContact}
        />
      )}

      {/* Delete buttons inline in rows */}
      {variables.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {variables.map(v => (
            <button
              key={v.id}
              onClick={() => handleDelete(v.id, v.key)}
              className="text-xs text-red-400 hover:text-red-600 hover:underline transition-colors"
            >
              Eliminar {`{{${v.key}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
