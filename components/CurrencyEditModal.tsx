'use client'

import React, { useState, useEffect } from 'react'
import Modal from '@/components/Modal' // Asegúrate de que esta ruta sea correcta
import { toast } from 'sonner'

// Reutilizamos la lógica. 
// NOTA: Si prefieres, puedes mover esta función a un archivo 'utils/finance.ts' para no duplicar,
// pero por ahora la dejo aquí para que el componente funcione copy-paste.
const calculateValues = (currency: string, amountOriginal: number, amountUsdInput: number) => {
  if (currency === 'USD') {
    return {
      amount_original: amountOriginal,
      currency_original: 'USD',
      amount_usd: amountOriginal,
      exchange_rate: 1
    };
  }
  const safeUsd = amountUsdInput !== 0 ? amountUsdInput : 1;
  return {
    amount_original: amountOriginal,
    currency_original: currency,
    amount_usd: amountUsdInput,
    exchange_rate: amountOriginal / safeUsd
  };
};

// Definimos qué datos necesita este modal para abrirse
interface CurrencyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  // La función que el padre (FinancePage) ejecutará al guardar
  onSave: (newData: { 
    currency_original: string; 
    amount_original: number; 
    amount_usd: number; 
    exchange_rate: number 
  }) => Promise<void>; 
  initialData: {
    amount_original: number;
    currency_original: string;
    amount_usd: number;
  } | null;
}

export default function CurrencyEditModal({ isOpen, onClose, onSave, initialData }: CurrencyEditModalProps) {
  const [loading, setLoading] = useState(false);
  
  // Estado interno del formulario
  const [form, setForm] = useState({
    currency: 'USD',
    original: '',
    usd: ''
  });

  // Efecto: Cuando se abre el modal, cargamos los datos existentes
  useEffect(() => {
    if (isOpen && initialData) {
      setForm({
        currency: initialData.currency_original || 'USD',
        original: initialData.amount_original?.toString() || '',
        usd: initialData.amount_usd?.toString() || ''
      });
    }
  }, [isOpen, initialData]);

  // Manejador inteligente de cambios
  const handleChange = (field: 'currency' | 'original' | 'usd', value: string) => {
    // 1. Actualizamos el campo que cambió
    const newForm = { ...form, [field]: value };
    
    // 2. Aplicamos reglas de negocio (UX)
    if (field === 'currency') {
      if (value === 'USD') {
        // Si cambia a USD, forzamos que el monto USD sea igual al original
        newForm.usd = newForm.original; 
      }
    } else if (field === 'original') {
      if (newForm.currency === 'USD') {
        // Si cambia el original y es USD, el USD se actualiza solo
        newForm.usd = value;
      }
    }

    setForm(newForm);
  };

  const handleSubmit = async () => {
    const originalVal = parseFloat(form.original);
    const usdVal = parseFloat(form.usd);

    if (isNaN(originalVal) || isNaN(usdVal)) {
      toast.error("Por favor ingresa montos válidos");
      return;
    }

    setLoading(true);
    try {
      // Usamos la función helper para obtener el objeto final calculado (incluyendo el rate)
      const finalPayload = calculateValues(form.currency, originalVal, usdVal);
      
      // Enviamos al padre
      await onSave(finalPayload);
      
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar cambios");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-2">
        <div className="flex items-center gap-2 mb-4 text-blue-800 bg-blue-50 p-3 rounded-lg border border-blue-100">
          <span className="text-xl">💱</span>
          <div>
            <h3 className="font-bold text-sm">Corrector de Moneda</h3>
            <p className="text-xs text-blue-600">Ajusta el tipo de cambio manualmente.</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Selector de Moneda */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Moneda Original</label>
            <div className="flex gap-2">
              <select 
                className="w-1/3 border border-gray-300 rounded-lg p-2 text-sm font-bold text-gray-700 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                value={form.currency}
                onChange={(e) => handleChange('currency', e.target.value)}
              >
                <option value="USD">🇺🇸 USD</option>
                <option value="CLP">🇨🇱 CLP</option>
                <option value="PEN">🇵🇪 PEN</option>
                <option value="MXN">🇲🇽 MXN</option>
                <option value="COP">🇨🇴 COP</option>
                <option value="EUR">🇪🇺 EUR</option>
              </select>
              
              <div className="relative w-2/3">
                <span className="absolute left-3 top-2 text-gray-400">$</span>
                <input 
                  type="number" 
                  className="w-full border border-gray-300 rounded-lg p-2 pl-6 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Monto Original"
                  value={form.original}
                  onChange={(e) => handleChange('original', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Flecha visual */}
          <div className="flex justify-center -my-1">
            <span className="text-gray-300 text-lg">↓</span>
          </div>

          {/* Monto Final USD */}
          <div className={`transition-opacity duration-200 ${form.currency === 'USD' ? 'opacity-50 grayscale' : 'opacity-100'}`}>
          <label className="flex justify-between text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
              <span>Monto Real en USD</span>
              {form.currency !== 'USD' && form.original && form.usd && (
                <span className="text-[10px] text-blue-600">
                  Tasa implícita: {(parseFloat(form.original) / (parseFloat(form.usd) || 1)).toFixed(2)}
                </span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-green-600 font-bold">$</span>
              <input 
                type="number"
                disabled={form.currency === 'USD'} // Bloqueado si es USD
                className="w-full border border-green-200 bg-green-50 rounded-lg p-2 pl-6 text-sm font-bold text-green-800 focus:ring-2 focus:ring-green-500 outline-none disabled:cursor-not-allowed"
                placeholder="0.00"
                value={form.usd}
                onChange={(e) => handleChange('usd', e.target.value)}
              />
            </div>
            {form.currency === 'USD' && (
              <p className="text-[10px] text-gray-400 mt-1 text-center">En USD, los montos son idénticos.</p>
            )}
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
            <button 
              onClick={handleSubmit} 
              disabled={loading || !form.original || !form.usd}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {loading ? 'Calculando...' : 'Confirmar Cambio'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}