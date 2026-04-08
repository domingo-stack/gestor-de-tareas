'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface NewLeadModalProps {
  open: boolean;
  defaultStageId: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewLeadModal({ open, defaultStageId, onClose, onCreated }: NewLeadModalProps) {
  const { supabase } = useAuth();
  const [saving, setSaving] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [country, setCountry] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');

  if (!open) return null;

  const reset = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setPosition('');
    setCountry('');
    setEstimatedValue('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    if (!supabase || !defaultStageId) {
      toast.error('No hay stage por defecto configurado');
      return;
    }
    if (!fullName.trim() && !email.trim() && !company.trim()) {
      toast.error('Ingresa al menos nombre, email o empresa');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('crm_leads').insert({
      external_source: 'manual',
      full_name: fullName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      company: company.trim() || null,
      position: position.trim() || null,
      country: country.trim() || null,
      estimated_value_usd: estimatedValue ? parseFloat(estimatedValue) : null,
      stage_id: defaultStageId,
    });
    setSaving(false);
    if (error) {
      toast.error(`Error: ${error.message}`);
      return;
    }
    toast.success('Lead creado');
    reset();
    onCreated();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Nuevo lead manual</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-3">
          <Field label="Nombre completo" value={fullName} onChange={setFullName} placeholder="Ana García" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="ana@empresa.com" type="email" />
          <Field label="Teléfono" value={phone} onChange={setPhone} placeholder="+51 999 888 777" />
          <Field label="Empresa / Institución" value={company} onChange={setCompany} placeholder="Colegio San Martín" />
          <Field label="Cargo" value={position} onChange={setPosition} placeholder="Director" />
          <Field label="País" value={country} onChange={setCountry} placeholder="Perú" />
          <Field
            label="Valor estimado USD (opcional)"
            value={estimatedValue}
            onChange={setEstimatedValue}
            placeholder="5000"
            type="number"
          />
          <p className="text-xs text-gray-400 mt-2">
            Mínimo uno: nombre, email o empresa. El lead se crea en la etapa inicial del pipeline.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              saving
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {saving ? 'Creando...' : 'Crear lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}
