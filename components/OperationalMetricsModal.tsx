'use client'

import React, { useState, useEffect } from 'react'
import Modal from '@/components/Modal'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'

interface Metric {
  id: string;
  month_date: string;
  new_customers_count: number;
}

export default function OperationalMetricsModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { supabase, user } = useAuth();
  
  // Estado del Formulario
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM por defecto hoy
  const [formCount, setFormCount] = useState('');
  
  // Estado de Datos
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) fetchHistory();
  }, [isOpen]);

  const fetchHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('fin_monthly_metrics')
      .select('*')
      .order('month_date', { ascending: false }); // Mes más reciente primero

    if (error) toast.error('Error al cargar historial');
    else setMetrics(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!formDate || !formCount) {
      toast.error('Completa los datos');
      return;
    }

    // Normalizamos la fecha al día 1 del mes para consistencia en BD
    // Input type="month" devuelve "2024-02", le agregamos "-01"
    const normalizedDate = `${formDate}-01`;

    try {
      // Usamos UPSERT: Si ya existe el mes, actualiza el valor. Si no, crea uno nuevo.
      // Esto funciona gracias al índice único que creamos en el Hito 1.
      const { error } = await supabase
        .from('fin_monthly_metrics')
        .upsert({
          month_date: normalizedDate,
          new_customers_count: parseInt(formCount),
          user_id: user?.id
        }, { onConflict: 'month_date' });

      if (error) throw error;

      toast.success('Métrica guardada');
      setFormCount(''); // Limpiamos el input numérico
      fetchHistory();   // Recargamos la tabla
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar');
    }
  };

  const handleDelete = async (id: string) => {
    if(!confirm('¿Borrar este registro?')) return;
    const { error } = await supabase.from('fin_monthly_metrics').delete().eq('id', id);
    if (!error) {
      toast.success('Eliminado');
      fetchHistory();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-4 flex flex-col h-[70vh]">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            👥 Bitácora de Clientes
          </h2>
          <p className="text-sm text-gray-500">
            Registra cuántos clientes nuevos (New Logos) captaste cada mes. 
            Este dato es vital para calcular tu CAC.
          </p>
        </div>

        {/* --- FORMULARIO DE INGRESO --- */}
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-end gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-xs font-bold text-blue-800 mb-1 uppercase">Mes</label>
            <input 
              type="month" 
              className="w-full border border-blue-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-blue-800 mb-1 uppercase">Nuevos Clientes</label>
            <input 
              type="number" 
              placeholder="0"
              min="0"
              className="w-full border border-blue-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              value={formCount}
              onChange={(e) => setFormCount(e.target.value)}
            />
          </div>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-sm hover:bg-blue-700 transition-colors h-[38px]"
          >
            Guardar
          </button>
        </div>

        {/* --- HISTORIAL (TABLA) --- */}
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Historial Registrado</h3>
        <div className="flex-1 overflow-y-auto border rounded-lg bg-white">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
              <tr>
                <th className="px-4 py-3">Mes</th>
                <th className="px-4 py-3 text-center">Nuevos Clientes</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={3} className="p-4 text-center text-gray-400">Cargando...</td></tr>
              ) : metrics.length === 0 ? (
                <tr><td colSpan={3} className="p-8 text-center text-gray-400 italic">No hay datos registrados aún.</td></tr>
              ) : metrics.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">
                    {/* Formato visual legible: "Enero 2024" */}
                    {new Date(m.month_date + 'T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-blue-600 font-bold bg-blue-50/50">
                    +{m.new_customers_count}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => handleDelete(m.id)}
                      className="text-red-400 hover:text-red-600 p-1 text-xs"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}