'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Modal from '@/components/Modal'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'

interface Category {
  id: string;
  name: string;
}

interface GroupedItem {
  description: string;
  is_fixed_expense: boolean;
  is_cac_related: boolean;
  count: number;
}

export default function CategorySettingsModal({ isOpen, onClose, onUpdate }: { isOpen: boolean, onClose: () => void, onUpdate?: () => void }) {
  const { supabase } = useAuth();
  
  // Datos
  const [categories, setCategories] = useState<Category[]>([]);
  const [itemsMap, setItemsMap] = useState<Record<string, GroupedItem[]>>({}); // Key: category_id, Value: Lista de descripciones
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Traer Categorías
      const { data: cats } = await supabase.from('fin_categories').select('id, name').order('name');
      if (cats) setCategories(cats);

      // 2. Traer Transacciones (Solo campos necesarios para agrupar)
      const { data: txs, error } = await supabase
        .from('fin_transactions')
        .select('category_id, description, is_fixed_expense, is_cac_related')
        .not('category_id', 'is', null); // Solo las categorizadas

      if (error) throw error;

      // 3. Procesar y Agrupar en Memoria (La magia granular ✨)
      const mapping: Record<string, Record<string, GroupedItem>> = {};

      txs?.forEach((tx: any) => {
        const catId = tx.category_id;
        const desc = tx.description?.trim(); // Normalizamos

        if (!catId || !desc) return;

        if (!mapping[catId]) mapping[catId] = {};
        
        // Si ya existe, sumamos contador. Si no, inicializamos.
        // NOTA: Asumimos que si una tiene el flag, todas lo tienen (consistencia). 
        // Si hay inconsistencia, tomará el valor de la primera que encuentre.
        if (!mapping[catId][desc]) {
          mapping[catId][desc] = {
            description: desc,
            is_fixed_expense: tx.is_fixed_expense || false,
            is_cac_related: tx.is_cac_related || false,
            count: 0
          };
        }
        mapping[catId][desc].count += 1;
      });

      // Convertir a Arrays ordenados
      const finalMap: Record<string, GroupedItem[]> = {};
      Object.keys(mapping).forEach(catId => {
        finalMap[catId] = Object.values(mapping[catId]).sort((a, b) => b.count - a.count); // Las más frecuentes primero
      });

      setItemsMap(finalMap);

    } catch (err) {
      console.error(err);
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (catId: string) => {
    setExpandedCats(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  // Acción Masiva: Actualiza TODAS las transacciones con esa descripción
  const handleToggle = async (catId: string, description: string, field: 'is_fixed_expense' | 'is_cac_related', currentVal: boolean) => {
    // 1. Optimistic UI Update (Para que se sienta rápido)
    setItemsMap(prev => {
      const catItems = prev[catId].map(item => 
        item.description === description ? { ...item, [field]: !currentVal } : item
      );
      return { ...prev, [catId]: catItems };
    });

    // 2. Update en Supabase (Bulk Update por descripción)
    const { error } = await supabase
      .from('fin_transactions')
      .update({ [field]: !currentVal })
      .eq('description', description)
      .eq('category_id', catId); // Por seguridad, filtramos también por categoría

    if (error) {
      toast.error('Error al actualizar');
      fetchData(); // Revertir cambios recargando
    } else {
      if(onUpdate) onUpdate();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col h-[80vh] p-2">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-800">🛠️ Clasificación Granular</h2>
          <p className="text-sm text-gray-500">
            Despliega las categorías y marca los proveedores específicos. <br/>
            <span className="text-xs italic text-gray-400">*Al marcar uno, se actualizan todos sus movimientos históricos.</span>
          </p>
        </div>

        {/* Header de Leyenda */}
        <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 uppercase bg-gray-100 p-2 rounded mb-2 sticky top-0 z-10">
          <div className="col-span-8">Descripción</div>
          <div className="col-span-2 text-center text-orange-600">Fijo (Runway)</div>
          <div className="col-span-2 text-center text-blue-600">Mkt (CAC)</div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? <div className="p-4 text-center">Cargando...</div> : categories.map(cat => {
            const items = itemsMap[cat.id] || [];
            if (items.length === 0) return null; // Ocultar categorías vacías

            const isExpanded = expandedCats[cat.id];

            return (
              <div key={cat.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {/* Cabecera de Categoría */}
                <div 
                  onClick={() => toggleCategory(cat.id)}
                  className="p-3 bg-gray-50 hover:bg-gray-100 cursor-pointer flex justify-between items-center select-none"
                >
                  <div className="font-bold text-gray-700 flex items-center gap-2">
                    <span className="text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</span>
                    {cat.name}
                    <span className="text-xs font-normal text-gray-400">({items.length})</span>
                  </div>
                </div>

                {/* Lista de Descripciones (Expandible) */}
                {isExpanded && (
                  <div className="divide-y divide-gray-100">
                    {items.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 p-2 items-center hover:bg-gray-50 text-sm">
                        
                        {/* Nombre del Proveedor */}
                        <div className="col-span-8 truncate pl-6 text-gray-700" title={item.description}>
                          {item.description}
                          <span className="text-[10px] text-gray-400 ml-2">x{item.count}</span>
                        </div>

                        {/* Switch Fijo */}
                        <div className="col-span-2 flex justify-center">
                          <input 
                            type="checkbox" 
                            checked={item.is_fixed_expense}
                            onChange={() => handleToggle(cat.id, item.description, 'is_fixed_expense', item.is_fixed_expense)}
                            className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500 cursor-pointer accent-orange-500"
                          />
                        </div>

                        {/* Switch CAC */}
                        <div className="col-span-2 flex justify-center">
                          <input 
                            type="checkbox" 
                            checked={item.is_cac_related}
                            onChange={() => handleToggle(cat.id, item.description, 'is_cac_related', item.is_cac_related)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer accent-blue-600"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex justify-end pt-2 border-t">
          <button onClick={onClose} className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-black">
            Terminar
          </button>
        </div>
      </div>
    </Modal>
  )
}