'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { Account, MonthlyMetric } from '@/lib/finance-types';
import CategorySettingsModal from '@/components/CategorySettingsModal';
import OperationalMetricsModal from '@/components/OperationalMetricsModal';
import AccountModal from '@/components/finance/AccountModal';

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
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  useEffect(() => {
    const form: Record<string, number> = {};
    accounts.forEach((a) => { form[a.id.toString()] = a.balance; });
    setBalancesForm(form);
  }, [accounts]);

  const updateBalances = async () => {
    try {
      const now = new Date().toISOString();
      for (const [idString, balance] of Object.entries(balancesForm)) {
        const { error } = await supabase
          .from('fin_accounts')
          .update({ balance: Number(balance), last_updated: now })
          .eq('id', parseInt(idString));
        if (error) throw error;
      }

      toast.success('Saldos actualizados correctamente');
      fetchData();
    } catch {
      toast.error('Error al actualizar saldos');
    }
  };

  const handleDeleteAccount = async (acc: Account) => {
    if (!confirm(`¿Eliminar la cuenta "${acc.name}"? Las transacciones asociadas quedarán sin cuenta.`)) return;
    const { error } = await supabase.from('fin_accounts').delete().eq('id', acc.id);
    if (error) {
      toast.error('Error al eliminar la cuenta');
      return;
    }
    toast.success('Cuenta eliminada');
    fetchData();
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
          <button
            onClick={() => { setEditingAccount(null); setAccountModalOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#ff8080] hover:bg-[#ff6b6b] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            Nueva Cuenta
          </button>
        </div>

        <div className="space-y-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-800">{acc.name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 font-medium">{acc.type || 'otro'}</span>
                </div>
                <p className="text-xs text-gray-500">{acc.currency} — Saldo actual: {acc.currency} {fmtNum(acc.balance)}</p>
                {acc.last_updated && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Última actualización: {new Date(acc.last_updated).toLocaleDateString('es-MX')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <input
                  type="number"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-right w-40 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={balancesForm[acc.id.toString()] ?? 0}
                  onChange={(e) => setBalancesForm({ ...balancesForm, [acc.id.toString()]: parseFloat(e.target.value) })}
                />
                <button
                  onClick={() => { setEditingAccount(acc); setAccountModalOpen(true); }}
                  className="p-2 text-gray-400 hover:text-[#3c527a] transition-colors rounded-lg hover:bg-gray-100"
                  title="Editar cuenta"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteAccount(acc)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                  title="Eliminar cuenta"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
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
      <AccountModal
        isOpen={accountModalOpen}
        onClose={() => { setAccountModalOpen(false); setEditingAccount(null); }}
        onSaved={fetchData}
        account={editingAccount}
      />
    </div>
  );
}
