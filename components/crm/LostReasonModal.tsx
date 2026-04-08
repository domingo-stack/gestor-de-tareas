'use client';

import { useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { CrmLostReason } from '@/lib/crm-types';

interface LostReasonModalProps {
  open: boolean;
  reasons: CrmLostReason[];
  leadName: string;
  onConfirm: (lostReasonId: string) => void;
  onCancel: () => void;
}

export default function LostReasonModal({ open, reasons, leadName, onConfirm, onCancel }: LostReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');

  if (!open) return null;

  const handleConfirm = () => {
    if (!selectedReason) return;
    onConfirm(selectedReason);
    setSelectedReason('');
  };

  const handleCancel = () => {
    setSelectedReason('');
    onCancel();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={handleCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <ExclamationTriangleIcon className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <h3 className="text-base font-semibold text-gray-900">Marcar como perdido</h3>
            <p className="text-sm text-gray-600 mt-1">
              Vas a marcar <strong className="text-gray-900">{leadName}</strong> como perdido.
              Selecciona la razón para que quede registrada en el reporte de lost reasons.
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {reasons
            .filter(r => r.is_active)
            .sort((a, b) => a.display_order - b.display_order)
            .map((reason) => (
              <label
                key={reason.id}
                className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedReason === reason.id
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="lost_reason"
                  value={reason.id}
                  checked={selectedReason === reason.id}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="text-red-500 focus:ring-red-500"
                />
                <span className="text-sm text-gray-800">{reason.name}</span>
              </label>
            ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedReason}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              selectedReason
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
