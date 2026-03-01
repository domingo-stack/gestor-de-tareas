'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function AcquisitionTab() {
  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
        <ExclamationTriangleIcon className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-amber-800 mb-2">Datos pendientes</h3>
        <p className="text-sm text-amber-600 max-w-md mx-auto">
          Este tab necesita datos de <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">growth_users</code> (Fase 2) para
          analizar canales de adquisicion, y <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">growth_events</code> de Mixpanel (Fase 3) para journeys.
        </p>
        <div className="mt-4 bg-white rounded-lg p-4 border border-amber-100 max-w-sm mx-auto text-left">
          <p className="text-xs font-medium text-gray-600 mb-2">Metricas que se mostraran:</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>- Cross-table: Pais x Status (Gratis / Pago / No termino)</li>
            <li>- Cross-table: Canal (Origen) x Plan</li>
            <li>- % Conversion por canal y por pais</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
