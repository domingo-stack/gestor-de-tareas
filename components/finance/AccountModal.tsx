'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import Modal from '@/components/Modal';
import type { Account } from '@/lib/finance-types';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  account: Account | null; // null = crear, Account = editar
}

const CURRENCIES = [
  { value: 'USD', label: 'USD', flag: '🇺🇸' },
  { value: 'PEN', label: 'PEN', flag: '🇵🇪' },
  { value: 'CLP', label: 'CLP', flag: '🇨🇱' },
  { value: 'MXN', label: 'MXN', flag: '🇲🇽' },
  { value: 'COP', label: 'COP', flag: '🇨🇴' },
  { value: 'EUR', label: 'EUR', flag: '🇪🇺' },
];

const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Bank', icon: '🏦' },
  { value: 'wallet', label: 'Wallet', icon: '💳' },
  { value: 'gateway', label: 'Gateway', icon: '🔗' },
  { value: 'crypto', label: 'Crypto', icon: '₿' },
  { value: 'investment', label: 'Investment', icon: '📈' },
  { value: 'otro', label: 'Otro', icon: '📋' },
];

export default function AccountModal({ isOpen, onClose, onSaved, account }: AccountModalProps) {
  const { supabase } = useAuth();
  const isEdit = !!account;

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [type, setType] = useState('corriente');
  const [balance, setBalance] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setCurrency(account.currency);
      setType(account.type || 'corriente');
      setBalance(account.balance);
    } else {
      setName('');
      setCurrency('USD');
      setType('corriente');
      setBalance(0);
    }
  }, [account, isOpen]);

  const handleSave = async () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from('fin_accounts')
          .update({ name: name.trim(), currency, type })
          .eq('id', account.id);
        if (error) throw error;
        toast.success('Cuenta actualizada');
      } else {
        const { error } = await supabase
          .from('fin_accounts')
          .insert({
            name: name.trim(),
            currency,
            type,
            balance,
            last_updated: new Date().toISOString(),
          });
        if (error) throw error;
        toast.success('Cuenta creada');
      }
      onSaved();
      onClose();
    } catch {
      toast.error('Error al guardar la cuenta');
    } finally {
      setSaving(false);
    }
  };

  const selectedCurrency = CURRENCIES.find(c => c.value === currency);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg">
              {isEdit ? '✏️' : '🏦'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#383838]">
                {isEdit ? 'Editar Cuenta' : 'Nueva Cuenta'}
              </h2>
              <p className="text-xs text-gray-400">
                {isEdit ? 'Modifica los datos de la cuenta' : 'Agrega una nueva cuenta bancaria'}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Form */}
        <div className="px-6 py-5 space-y-5">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Nombre de la cuenta
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Mercury USD, BCP Soles, Binance"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder:text-gray-300"
              autoFocus
            />
          </div>

          {/* Moneda — visual selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Moneda
            </label>
            <div className="grid grid-cols-6 gap-2">
              {CURRENCIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCurrency(c.value)}
                  className={`flex flex-col items-center gap-0.5 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    currency === c.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tipo — visual selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Tipo de cuenta
            </label>
            <div className="grid grid-cols-6 gap-2">
              {ACCOUNT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex flex-col items-center gap-0.5 py-2.5 rounded-lg border text-[11px] font-medium transition-all ${
                    type === t.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base leading-none">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Saldo inicial (solo al crear) */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Saldo inicial
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
                  {selectedCurrency?.flag} {currency}
                </span>
                <input
                  type="number"
                  value={balance || ''}
                  onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg pl-20 pr-4 py-2.5 text-sm text-right bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono"
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2 bg-[#3c527a] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3f5e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
