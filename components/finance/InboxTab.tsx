'use client';

import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import type { Transaction, Category, FilterStatus, CurrencyEditState } from '@/lib/finance-types';
import AutocompleteInput from './AutocompleteInput';
import UploadFinanceModal from '@/components/UploadFinanceModal';
import CurrencyEditModal from '@/components/CurrencyEditModal';

interface InboxTabProps {
  transactions: Transaction[];
  filteredTransactions: Transaction[];
  categories: Category[];
  fetchData: () => void;
}

export default function InboxTab({ transactions, filteredTransactions, categories, fetchData }: InboxTabProps) {
  const { supabase } = useAuth();

  // UI state
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('pending_review');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ description: '', amount_usd: 0, category_id: '', raw_description: '' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ category_id: '', description: '' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currencyEdit, setCurrencyEdit] = useState<CurrencyEditState>({
    isOpen: false,
    transactionId: null,
    currentData: null,
  });

  const descriptionSuggestions = useMemo(() => {
    const all = transactions.map((t) => t.description).filter(Boolean);
    return Array.from(new Set(all)).sort();
  }, [transactions]);

  // Filtered view
  const viewTransactions = useMemo(() => {
    let data = filteredTransactions.filter((t) => statusFilter === 'all' || t.status === statusFilter);

    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.toLowerCase();
      data = data.filter((t) => {
        const desc = (t.description || '').toLowerCase();
        const raw = (t.raw_description || '').toLowerCase();
        const cat = (t.fin_categories?.name || '').toLowerCase();
        return desc.includes(lowerTerm) || raw.includes(lowerTerm) || cat.includes(lowerTerm);
      });
    }
    return data;
  }, [filteredTransactions, statusFilter, searchTerm]);

  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = viewTransactions.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(viewTransactions.length / rowsPerPage);

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

  // Actions
  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditForm({ description: tx.description, amount_usd: tx.amount_usd, category_id: tx.category_id, raw_description: tx.raw_description || '' });
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from('fin_transactions').update(editForm).eq('id', id);
    if (!error) { toast.success('Guardado'); setEditingId(null); fetchData(); }
  };

  const verifyTx = async (id: string) => {
    const { error } = await supabase.from('fin_transactions').update({ status: 'verified' }).eq('id', id);
    if (!error) { toast.success('Verificado'); fetchData(); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este movimiento? Esta acción no se puede deshacer.')) return;
    try {
      const { error } = await supabase.from('fin_transactions').delete().eq('id', id);
      if (error) throw error;
      toast.success('Movimiento eliminado correctamente');
      fetchData();
    } catch {
      toast.error('No se pudo eliminar el movimiento');
    }
  };

  const verifyBulk = async () => {
    if (selectedIds.length === 0) return;
    const { error } = await supabase.from('fin_transactions').update({ status: 'verified' }).in('id', selectedIds);
    if (!error) { toast.success(`${selectedIds.length} transacciones verificadas`); setSelectedIds([]); fetchData(); }
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.length === 0) return;
    const updates: Record<string, string> = {};
    if (bulkForm.category_id) updates.category_id = bulkForm.category_id;
    if (bulkForm.description && bulkForm.description.trim() !== '') updates.description = bulkForm.description.trim();

    if (Object.keys(updates).length === 0) {
      toast.warning('No ingresaste ningún cambio.');
      return;
    }

    try {
      const { error } = await supabase.from('fin_transactions').update(updates).in('id', selectedIds);
      if (error) throw error;
      toast.success(`${selectedIds.length} movimientos actualizados correctamente`);
      setIsBulkEditOpen(false);
      setBulkForm({ category_id: '', description: '' });
      setSelectedIds([]);
      fetchData();
    } catch {
      toast.error('Ocurrió un error al intentar actualizar los movimientos.');
    }
  };

  const toggleSelect = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSelectAllPage = () => {
    const pageIds = currentRows.map((t) => t.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    else setSelectedIds([...selectedIds, ...pageIds.filter((id) => !selectedIds.includes(id))]);
  };

  const openCurrencyModal = (tx: Transaction) => {
    setCurrencyEdit({
      isOpen: true,
      transactionId: tx.id,
      currentData: { amount_original: tx.amount_original || 0, currency_original: tx.currency_original || 'USD', amount_usd: tx.amount_usd },
    });
  };

  const saveCurrencyData = async (newData: { currency_original: string; amount_original: number; amount_usd: number; exchange_rate: number }) => {
    if (!currencyEdit.transactionId) return;
    try {
      const { error } = await supabase.from('fin_transactions').update(newData).eq('id', currencyEdit.transactionId);
      if (error) throw error;
      toast.success('Conversión actualizada correctamente');
      fetchData();
    } catch {
      toast.error('Error al actualizar la moneda');
    }
  };

  return (
    <>
      {/* Botón agregar movimiento */}
      <div className="flex justify-end mb-4">
        <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-200">
          + Movimiento
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative flex flex-col h-[700px]">
        {/* Bulk selection bar */}
        {selectedIds.length > 0 && (
          <div className="absolute top-14 left-0 right-0 z-30 bg-blue-50 border-b border-blue-100 px-6 py-2 flex items-center justify-between animate-in slide-in-from-top-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-900 font-bold bg-blue-100 px-2 py-0.5 rounded-full">{selectedIds.length}</span>
              <span className="text-sm text-blue-800">seleccionados</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setBulkForm({ category_id: '', description: '' }); setIsBulkEditOpen(true); }}
                className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 text-xs font-bold rounded shadow-sm hover:bg-blue-50 transition-colors flex items-center gap-1"
              >
                ✎ Editar Lote
              </button>
              <button onClick={verifyBulk} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-1">
                ✅ Validar Todos
              </button>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex-none border-b border-gray-100 bg-gray-50/50 px-4 flex flex-col sm:flex-row justify-between items-center gap-4 py-2">
          <div className="flex space-x-2">
            {(['pending_review', 'verified', 'all'] as const).map((st) => (
              <button
                key={st}
                onClick={() => { setStatusFilter(st); setCurrentPage(1); setSelectedIds([]); }}
                className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${statusFilter === st ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {st === 'pending_review' ? 'Por Revisar' : st === 'verified' ? 'Histórico' : 'Todo'}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Buscar movimiento..."
              className="block w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600">
                <span className="text-xs font-bold p-1 bg-gray-100 rounded-full h-5 w-5 flex items-center justify-center">✕</span>
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left relative">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-3 w-4 bg-gray-50">
                  <input type="checkbox" checked={currentRows.length > 0 && currentRows.every((r) => selectedIds.includes(r.id))} onChange={toggleSelectAllPage} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                </th>
                <th className="px-6 py-3 bg-gray-50">Fecha</th>
                <th className="px-6 py-3 bg-gray-50">Descripción IA</th>
                <th className="px-6 py-3 bg-gray-50">Descripción Original</th>
                <th className="px-6 py-3 bg-gray-50">Categoría</th>
                <th className="px-6 py-3 text-right bg-gray-50">Monto (USD)</th>
                <th className="px-6 py-3 text-center bg-gray-50">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {currentRows.map((tx) => (
                <tr key={tx.id} className={`hover:bg-gray-50 ${selectedIds.includes(tx.id) ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.includes(tx.id)} onChange={() => toggleSelect(tx.id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  </td>
                  <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{tx.transaction_date}</td>
                  <td className="px-6 py-3">
                    {editingId === tx.id ? (
                      <AutocompleteInput className="border rounded px-2 py-1 w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editForm.description} onChange={(val) => setEditForm({ ...editForm, description: val })} suggestions={descriptionSuggestions} placeholder="Descripción..." />
                    ) : (
                      <div className="max-w-xs truncate" title={tx.description}>{tx.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {editingId === tx.id ? (
                      <input className="border rounded px-2 py-1 w-full text-sm" value={editForm.raw_description} onChange={(e) => setEditForm({ ...editForm, raw_description: e.target.value })} />
                    ) : (
                      <div className="max-w-xs truncate" title={tx.raw_description || ''}>{tx.raw_description || '-'}</div>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {editingId === tx.id ? (
                      <select className="border rounded px-2 py-1 text-sm w-full" value={editForm.category_id} onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}>
                        {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide border ${tx.fin_categories?.type === 'income' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {tx.fin_categories?.name}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-gray-700">
                    {editingId === tx.id ? (
                      <input type="number" step="0.01" className="border rounded px-2 py-1 w-20 text-right" value={editForm.amount_usd} onChange={(e) => setEditForm({ ...editForm, amount_usd: parseFloat(e.target.value) })} />
                    ) : (
                      <div className="flex items-center justify-end gap-2 group">
                        <span>{fmt(tx.amount_usd)}</span>
                        <button onClick={() => openCurrencyModal(tx)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-100 rounded text-xs text-blue-600" title="Corregir Moneda / Tasa de Cambio">💱</button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-center">
                    {editingId === tx.id ? (
                      <div className="flex justify-center gap-1">
                        <button onClick={() => saveEdit(tx.id)} className="text-green-600 hover:bg-green-50 p-1 rounded">💾</button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 p-1">✕</button>
                      </div>
                    ) : (
                      <div className="flex justify-center items-center gap-1">
                        {tx.status === 'pending_review' && <button onClick={() => verifyTx(tx.id)} className="text-green-600 hover:bg-green-50 p-1 rounded font-bold" title="Aprobar">✓</button>}
                        <button onClick={() => startEdit(tx)} className="text-blue-400 hover:bg-blue-50 p-1 rounded" title="Editar">✎</button>
                        <button onClick={() => handleDelete(tx.id)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Eliminar">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456-1.22L17.56 2.66c-.074-.292-.349-.52-.693-.52H7.132c-.344 0-.619.228-.692.52L4.772 5.79m14.456-1.22h-13.932" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex-none px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500">Mostrando {currentRows.length > 0 ? indexOfFirstRow + 1 : 0} a {Math.min(indexOfLastRow, viewTransactions.length)} de {viewTransactions.length} registros</div>
          <div className="flex items-center gap-4">
            <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="border-gray-300 text-xs rounded shadow-sm focus:border-blue-500 focus:ring-blue-500">
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
            </select>
            <div className="flex gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 border rounded bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 text-xs font-medium">Anterior</button>
              <span className="px-2 py-1 text-xs text-gray-600">Página {currentPage} de {totalPages || 1}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="px-2 py-1 border rounded bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 text-xs font-medium">Siguiente</button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk edit modal */}
      {isBulkEditOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Edición Masiva</h3>
                <p className="text-xs text-gray-500">Editando {selectedIds.length} movimientos seleccionados</p>
              </div>
              <button onClick={() => setIsBulkEditOpen(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-5">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
                ℹ️ Solo los campos que llenes se actualizarán. Si dejas uno vacío, se mantendrá el valor original.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Categoría</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={bulkForm.category_id} onChange={(e) => setBulkForm({ ...bulkForm, category_id: e.target.value })}>
                  <option value="">-- No cambiar categoría --</option>
                  {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Descripción</label>
                <AutocompleteInput className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" value={bulkForm.description} onChange={(val) => setBulkForm({ ...bulkForm, description: val })} suggestions={descriptionSuggestions} placeholder="Ej: Publicidad Facebook Ads (Opcional)" />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
              <button onClick={() => setIsBulkEditOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancelar</button>
              <button onClick={handleBulkUpdate} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md transform active:scale-95 transition-all">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <UploadFinanceModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setTimeout(fetchData, 2000); }} categories={categories} />
      <CurrencyEditModal isOpen={currencyEdit.isOpen} onClose={() => setCurrencyEdit((prev) => ({ ...prev, isOpen: false }))} onSave={saveCurrencyData} initialData={currencyEdit.currentData} />
    </>
  );
}
