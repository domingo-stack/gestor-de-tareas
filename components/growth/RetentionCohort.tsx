'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function RetentionCohort() {
  return (
    <div className="space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
        <ExclamationTriangleIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Requiere Mixpanel (Fase 3)</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Este tab muestra datos de comportamiento que provienen de Mixpanel.
          Se necesita configurar el Service Account de Mixpanel y el pipeline n8n (Pipeline C).
        </p>
        <div className="mt-4 bg-white rounded-lg p-4 border border-gray-100 max-w-sm mx-auto text-left">
          <p className="text-xs font-medium text-gray-600 mb-2">Metricas que se mostraran:</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>- DAU / WAU / MAU con tendencia</li>
            <li>- Retencion por cohorte: Day 1, 3, 5, 8</li>
            <li>- Paywall views vs conversiones</li>
            <li>- Top eventos / journeys</li>
          </ul>
        </div>
        <div className="mt-4 bg-blue-50 rounded-lg p-3 border border-blue-100 max-w-sm mx-auto">
          <p className="text-xs text-blue-700 font-medium">Pre-requisitos:</p>
          <ul className="text-xs text-blue-600 mt-1 space-y-0.5">
            <li>1. Service Account de Mixpanel</li>
            <li>2. Project ID</li>
            <li>3. Nombres exactos de eventos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
