'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { Account, MonthlyMetric } from '@/lib/finance-types';
import CategorySettingsModal from '@/components/CategorySettingsModal';
import OperationalMetricsModal from '@/components/OperationalMetricsModal';

interface ConfigTabProps {
  accounts: Account[];
  monthlyMetrics: MonthlyMetric[];
  fetchData: () => void;
}

const fmtNum = (n: number) => new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function ConfigTab({ accounts, monthlyMetrics, fetchData }: ConfigTabProps) {
  const { supabase } = useAuth();
  const [balancesForm, setBalancesForm] = useState<Record<string, number>>({});
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);

  useEffect(() => {
    const form: Record<string, number> = {};
    accounts.forEach((a) => { form[a.id.toString()] = a.balance; });
    setBalancesForm(form);
  }, [accounts]);

  const updateBalances = async () => {
    try {
      const updates = Object.entries(balancesForm).map(([idString, balance]) => ({
        id: parseInt(idString),
        balance: Number(balance),
        last_updated: new Date().toISOString(),
      }));

      const { error } = await supabase.from('fin_accounts').upsert(updates);
      if (error) throw error;

      toast.success('Saldos actualizados correctamente');
      fetchData();
    } catch {
      toast.error('Error al actualizar saldos');
    }
  };

  return (
    <div className="space-y-8">
      {/* Saldos de cuentas */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Saldos Bancarios</h3>
            <p className="text-xs text-gray-400 mt-0.5">Actualiza los saldos de tus cuentas para calcular el Runway correctamente</p>
          </div>
        </div>

        <div className="space-y-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <p className="font-medium text-gray-800">{acc.name}</p>
                <p className="text-xs text-gray-500">{acc.currency} — Saldo actual: {acc.currency} {fmtNum(acc.balance)}</p>
                {acc.last_updated && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Última actualización: {new Date(acc.last_updated).toLocaleDateString('es-MX')}
                  </p>
                )}
              </div>
              <input
                type="number"
                className="border border-gray-300 rounded-lg px-3 py-2 text-right w-40 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={balancesForm[acc.id.toString()] || 0}
                onChange={(e) => setBalancesForm({ ...balancesForm, [acc.id.toString()]: parseFloat(e.target.value) })}
              />
            </div>
          ))}
          {accounts.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No hay cuentas configuradas</p>
          )}
        </div>

        {accounts.length > 0 && (
          <div className="mt-6 flex justify-end">
            <button onClick={updateBalances} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">
              Guardar Saldos
            </button>
          </div>
        )}
      </div>

      {/* Configuration actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Clasificación de Categorías</h3>
          <p className="text-xs text-gray-400 mb-4">Configura qué descripciones son gastos fijos (Runway) o marketing (CAC)</p>
          <button
            onClick={() => setIsCategoryOpen(true)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-200"
          >
            ⚙️ Abrir Configuración
          </button>
        </div>

        {/* Operational metrics override */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Override Clientes Nuevos</h3>
          <p className="text-xs text-gray-400 mb-4">Corrige manualmente el conteo de nuevos clientes si los datos automáticos no son precisos</p>
          <button
            onClick={() => setIsMetricsOpen(true)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-200"
          >
            👥 Gestionar Métricas
          </button>

          {monthlyMetrics.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-xs text-gray-500 font-medium">Overrides activos:</p>
              {monthlyMetrics.filter((m) => m.new_customers_count > 0).slice(0, 6).map((m) => (
                <div key={m.id} className="flex justify-between text-xs text-gray-600">
                  <span>{m.month_date.substring(0, 7)}</span>
                  <span className="font-medium text-orange-600">{m.new_customers_count} clientes (manual)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CategorySettingsModal isOpen={isCategoryOpen} onClose={() => setIsCategoryOpen(false)} onUpdate={fetchData} />
      <OperationalMetricsModal isOpen={isMetricsOpen} onClose={() => setIsMetricsOpen(false)} />
    </div>
  );
}
