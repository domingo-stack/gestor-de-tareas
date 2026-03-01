'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function ChurnRenewal() {
  const { supabase } = useAuth();
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('growth_users').select('id').limit(1).then(({ data, error }) => {
      setHasData(!error && (data?.length || 0) > 0);
      setLoading(false);
    });
  }, [supabase]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <ExclamationTriangleIcon className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-amber-800 mb-2">Datos pendientes</h3>
          <p className="text-sm text-amber-600 max-w-md mx-auto">
            Este tab necesita datos de la tabla <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">growth_users</code> para calcular churn, renewal y proximas renovaciones.
            Configura el pipeline de Bubble Users en n8n (Pipeline B) para habilitar esta seccion.
          </p>
          <div className="mt-4 bg-white rounded-lg p-4 border border-amber-100 max-w-sm mx-auto text-left">
            <p className="text-xs font-medium text-gray-600 mb-2">Metricas que se mostraran:</p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>- Starting Users / Churned / Churn Rate por semana</li>
              <li>- Growth Rate / Net Users</li>
              <li>- Renewal Rate (quienes debieron vs quienes renovaron)</li>
              <li>- Lista accionable: renovaciones proximas 7 dias</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
      <ArrowPathIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
      <p className="text-sm font-medium text-gray-600">Churn & Renovacion — En desarrollo (Fase 2)</p>
      <p className="text-xs text-gray-400 mt-1">Los datos de growth_users ya estan disponibles. Esta seccion se completara en la Fase 2.</p>
    </div>
  );
}
