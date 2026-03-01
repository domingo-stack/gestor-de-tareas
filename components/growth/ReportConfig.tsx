'use client';

import { ClockIcon } from '@heroicons/react/24/outline';

export default function ReportConfig() {
  return (
    <div className="space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
        <ClockIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Reportes Semanales (Fase 4)</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Configuracion de reportes automaticos por email. Disponible una vez que las fases anteriores esten completas.
        </p>
        <div className="mt-4 bg-white rounded-lg p-4 border border-gray-100 max-w-sm mx-auto text-left">
          <p className="text-xs font-medium text-gray-600 mb-2">Funcionalidades planeadas:</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>- CRUD de destinatarios</li>
            <li>- Toggle activo/inactivo por destinatario</li>
            <li>- Boton "Enviar reporte de prueba"</li>
            <li>- Historial: fecha, # destinatarios, status</li>
            <li>- Edge Function: send-growth-report</li>
            <li>- Cron externo (lunes 07:00 UTC)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
