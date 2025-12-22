'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import AuthGuard from '@/components/AuthGuard'
import UploadFinanceModal from '@/components/UploadFinanceModal'
import { useAuth } from '@/context/AuthContext'
import { Toaster, toast } from 'sonner' 
import FinancialCharts from '@/components/FinancialCharts'

// --- 1. DEFINICIÓN DE TIPOS (Ajustados a tu DB) ---

// Tipo para Cuentas (fin_accounts) - ID es number (int8)
type Account = {
  id: number; 
  name: string;
  currency: string;
  type: string;
  balance: number;
  last_updated?: string;
}

// Tipo para Categorías
type Category = {
  id: string;
  name: string;
  type: string;
  parent_category: string; 
}

// Tipo para Transacciones
type Transaction = {
  id: string;
  created_at: string;
  transaction_date: string;
  description: string;
  raw_description: string;
  amount_original: number;
  currency_original: string;
  amount_usd: number;
  exchange_rate: number;
  status: 'pending_review' | 'verified';
  category_id: string;
  fin_categories: {
    name: string;
    slug: string;
    type: string;
    parent_category: string;
  } | null;
}

// Tipos para Filtros
type DateRange = 'current_month' | 'last_3_months' | 'last_6_months' | 'last_12_months' | 'all';
type FilterStatus = 'pending_review' | 'verified' | 'all';

// --- 2. COMPONENTE P&L SECTION (Expandido y Corregido) ---
// Este componente maneja las secciones desplegables (Ingresos, Gastos, etc.)
const PnLSection = ({ 
  title, 
  data,          
  details,       
  months, 
  parentKey,     
  totalColor = 'bg-gray-50',
  defaultOpen = true
}: { 
  title: string, 
  data: Record<string, Record<string, number>>, 
  details?: Record<string, Record<string, Record<string, Record<string, number>>>>, 
  months: string[],
  parentKey: string,
  totalColor?: string,
  defaultOpen?: boolean
}) => {
  const [isSectionOpen, setIsSectionOpen] = useState(defaultOpen);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catName: string) => {
    setOpenCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  // Calcular totales de la fila principal (Header de Sección)
  const monthlyTotals = months.map(m => {
    return Object.values(data).reduce((sum, catObj) => sum + (catObj[m] || 0), 0);
  });

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  return (
    <>
      {/* CABECERA DE SECCIÓN (Ej: GASTOS OPERATIVOS) */}
      <tr 
        onClick={() => setIsSectionOpen(!isSectionOpen)} 
        className={`${totalColor} hover:bg-gray-100 cursor-pointer transition-colors border-b border-gray-200`}
      >
        <td className="px-6 py-3 font-bold text-gray-800 flex items-center gap-2 border-r border-gray-200 sticky left-0 z-10 bg-inherit">
          <span className="text-gray-400 text-xs">{isSectionOpen ? '▼' : '▶'}</span>
          {title}
        </td>
        {monthlyTotals.map((val, i) => (
          <td key={i} className="px-6 py-3 text-right font-semibold text-gray-800">
            {fmt(val)}
          </td>
        ))}
      </tr>

      {/* FILAS DE CATEGORÍAS (Ej: Software, Nómina) */}
      {isSectionOpen && Object.keys(data).sort().map(catName => {
        const isCatOpen = openCategories[catName];
        const catDetails = details?.[parentKey]?.[catName] || {};
        const hasDetails = Object.keys(catDetails).length > 0;

        return (
          <React.Fragment key={catName}>
            <tr 
              onClick={() => hasDetails && toggleCategory(catName)} 
              className={`hover:bg-gray-50 border-b border-gray-100 group ${hasDetails ? 'cursor-pointer' : ''}`}
            >
              <td className="px-6 py-2 text-sm font-medium text-gray-700 pl-8 border-r border-gray-100 sticky left-0 bg-white group-hover:bg-gray-50 z-10 flex items-center gap-2">
                 {hasDetails && <span className="text-[10px] text-gray-400">{isCatOpen ? '▼' : '▶'}</span>}
                 {!hasDetails && <span className="w-3"></span>}
                 {catName}
              </td>
              {months.map(m => (
                <td key={m} className="px-6 py-2 text-right text-sm text-gray-600">
                  {data[catName][m] ? fmt(data[catName][m]) : '-'}
                </td>
              ))}
            </tr>

            {/* FILAS DE DETALLE (Ej: AWS, Adobe, Sueldo Juan) */}
            {isCatOpen && Object.keys(catDetails).sort().map(desc => (
              <tr key={desc} className="bg-gray-50/50 border-b border-gray-100">
                <td className="px-6 py-1.5 text-xs text-gray-500 pl-16 border-r border-gray-100 sticky left-0 bg-gray-50/50 z-10 italic truncate max-w-[200px]" title={desc}>
                  {desc}
                </td>
                {months.map(m => (
                  <td key={m} className="px-6 py-1.5 text-right text-xs text-gray-400">
                    {catDetails[desc][m] ? fmt(catDetails[desc][m]) : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
};

// --- 3. PÁGINA PRINCIPAL DEL DASHBOARD ---
export default function FinancePage() {
  const { supabase, user } = useAuth();
  
  // --- ESTADOS DE UI ---
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'gestion' | 'reportes'>('gestion');
  const [dateRange, setDateRange] = useState<DateRange>('last_12_months'); 
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('pending_review');
  const [loading, setLoading] = useState(true);

  // --- DATOS ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // --- PAGINACIÓN ---
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // --- EDICIÓN Y SELECCIÓN ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ description: '', amount_usd: 0, category_id: '' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // --- MODAL DE SALDOS ---
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  // Usamos un objeto para editar saldos temporalmente: { [id_cuenta]: saldo }
  const [balancesForm, setBalancesForm] = useState<Record<string, number>>({});

  // 1. CARGA INICIAL DE DATOS
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // A. Categorías
      const { data: cats } = await supabase.from('fin_categories').select('*').order('name');
      if (cats) setCategories(cats);

      // B. Cuentas
      const { data: accs } = await supabase.from('fin_accounts').select('*').order('id');
      if (accs) {
        setAccounts(accs);
        // Inicializar formulario de balances (convertimos ID numérico a string para usar como key)
        const initialForm: Record<string, number> = {};
        accs.forEach((a: Account) => initialForm[a.id.toString()] = a.balance);
        setBalancesForm(initialForm);
      }

      // C. Transacciones
      const { data: txs, error } = await supabase
        .from('fin_transactions')
        .select(`*, fin_categories (name, slug, type, parent_category)`)
        .order('transaction_date', { ascending: false });

      if (error) throw error;
      setTransactions(txs as unknown as Transaction[]);
      setSelectedIds([]); 

    } catch (error) {
      console.error(error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [supabase, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Resetear paginación al cambiar filtros
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [dateRange, statusFilter, rowsPerPage]);

  // --- FUNCIÓN: ACTUALIZAR SALDOS BANCARIOS ---
  const updateBalances = async () => {
    try {
      // Convertimos el formulario de vuelta al formato de la DB
      const updates = Object.entries(balancesForm).map(([idString, balance]) => ({
        id: parseInt(idString), // Convertimos la key string a número (int8)
        balance: Number(balance),
        last_updated: new Date().toISOString()
      }));
      
      const { error } = await supabase.from('fin_accounts').upsert(updates);
      if (error) throw error;
      
      toast.success('Saldos actualizados correctamente');
      setIsBalanceModalOpen(false);
      fetchData(); // Recargamos para ver cambios
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar saldos');
    }
  };

  // --- LÓGICA DE FILTROS ---
  const filterByDate = (tx: Transaction) => {
    const txDate = new Date(tx.transaction_date);
    const now = new Date();
    now.setHours(0,0,0,0); 

    if (dateRange === 'all') return true;
    
    const monthsBack = dateRange === 'current_month' ? 0 : dateRange === 'last_3_months' ? 2 : dateRange === 'last_6_months' ? 5 : 11; 
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    
    if(dateRange === 'current_month') return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
    return txDate >= startDate;
  };

  const filteredTransactions = useMemo(() => transactions.filter(filterByDate), [transactions, dateRange]);
  const viewTransactions = filteredTransactions.filter(t => statusFilter === 'all' || t.status === statusFilter);
  
  // --- LÓGICA PAGINACIÓN ---
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = viewTransactions.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(viewTransactions.length / rowsPerPage);

  // --- LÓGICA P&L MATRIX ---
  const pnlData = useMemo(() => {
    const monthsSet = new Set<string>();
    filteredTransactions.forEach(tx => monthsSet.add(tx.transaction_date.substring(0, 7)));
    const sortedMonths = Array.from(monthsSet).sort(); 

    // Nivel 1: [Parent][Category][Month]
    const matrix: Record<string, Record<string, Record<string, number>>> = {};
    // Nivel 2: [Parent][Category][Description][Month]
    const detailMatrix: Record<string, Record<string, Record<string, Record<string, number>>>> = {};

    filteredTransactions.forEach(tx => {
      const parent = tx.fin_categories?.parent_category || 'OTROS';
      const catName = tx.fin_categories?.name || 'Sin Clasificar';
      const desc = tx.description.trim(); 
      const month = tx.transaction_date.substring(0, 7);
      const amount = Number(tx.amount_usd);

      // Llenar Matriz Principal
      if (!matrix[parent]) matrix[parent] = {};
      if (!matrix[parent][catName]) matrix[parent][catName] = {};
      matrix[parent][catName][month] = (matrix[parent][catName][month] || 0) + amount;

      // Llenar Matriz de Detalle
      if (!detailMatrix[parent]) detailMatrix[parent] = {};
      if (!detailMatrix[parent][catName]) detailMatrix[parent][catName] = {};
      if (!detailMatrix[parent][catName][desc]) detailMatrix[parent][catName][desc] = {};
      
      detailMatrix[parent][catName][desc][month] = (detailMatrix[parent][catName][desc][month] || 0) + amount;
    });

    return { sortedMonths, matrix, detailMatrix };
  }, [filteredTransactions]);

  // Helpers para P&L
  const getParentTotal = (parent: string, month: string) => {
    const section = pnlData.matrix[parent];
    if (!section) return 0;
    return Object.values(section).reduce((sum, item) => sum + (item[month] || 0), 0);
  };

  const totalIncome = filteredTransactions.filter(t => t.fin_categories?.type === 'income').reduce((s, t) => s + Number(t.amount_usd), 0);
  const totalSpend = filteredTransactions.filter(t => t.fin_categories?.type === 'expense').reduce((s, t) => s + Number(t.amount_usd), 0);
  
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  // --- ACCIONES DE GESTIÓN ---
  const startEdit = (tx: Transaction) => { setEditingId(tx.id); setEditForm({ description: tx.description, amount_usd: tx.amount_usd, category_id: tx.category_id || '' }); };
  
  const saveEdit = async (id: string) => { 
    const { error } = await supabase.from('fin_transactions').update(editForm).eq('id', id); 
    if(!error) { toast.success('Guardado'); setEditingId(null); fetchData(); }
  };
  
  const verifyTx = async (id: string) => { 
    const { error } = await supabase.from('fin_transactions').update({ status: 'verified' }).eq('id', id); 
    if(!error) { toast.success('Verificado'); fetchData(); }
  };
  
  // Selección Masiva
  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  
  const toggleSelectAllPage = () => { 
    const pageIds = currentRows.map(t => t.id); 
    const allSelected = pageIds.every(id => selectedIds.includes(id)); 
    if (allSelected) setSelectedIds(prev => prev.filter(id => !pageIds.includes(id))); 
    else setSelectedIds([...selectedIds, ...pageIds.filter(id => !selectedIds.includes(id))]); 
  };
  
  const verifyBulk = async () => { 
    if (selectedIds.length === 0) return; 
    const { error } = await supabase.from('fin_transactions').update({ status: 'verified' }).in('id', selectedIds); 
    if (!error) { toast.success(`${selectedIds.length} transacciones verificadas`); setSelectedIds([]); fetchData(); }
  };
  // Función para eliminar un movimiento
const handleDelete = async (id: string) => {
    // 1. Confirmación simple (puedes usar un modal más bonito si prefieres)
    if (!window.confirm("¿Estás seguro de que quieres eliminar este movimiento? Esta acción no se puede deshacer.")) {
      return;
    }
  
    try {
      // 2. Llamada a Supabase para borrar
      const { error } = await supabase
        .from('fin_transactions')
        .delete()
        .eq('id', id);
  
      if (error) throw error;
  
      // 3. Actualizar el estado local para que desaparezca de la tabla sin recargar
      // Asumiendo que tu estado de movimientos se llama 'transactions' y su setter 'setTransactions'
      setTransactions(prev => prev.filter(t => t.id !== id));
      
      toast.success('Movimiento eliminado correctamente');
  
    } catch (error) {
      console.error('Error al eliminar:', error);
      toast.error('No se pudo eliminar el movimiento');
    }
  };

  return (
    <AuthGuard>
      <main className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen font-sans relative">
        <Toaster position="top-right" richColors />

        {/* --- HEADER SUPERIOR --- */}
        <header className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte Financiero</h1>
            <p className="text-gray-500 text-sm">Vista CFO & Control de Gestión</p>
          </div>
          <div className="flex items-center gap-3 bg-white p-1 rounded-lg shadow-sm border border-gray-200">
             {(['last_3_months', 'last_6_months', 'last_12_months', 'all'] as const).map((r) => (
                <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${dateRange === r ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>
                  {r === 'last_3_months' ? '3 Meses' : r === 'last_6_months' ? '6 Meses' : r === 'last_12_months' ? '12 Meses' : 'Todo'}
                </button>
             ))}
             <div className="w-px h-4 bg-gray-300 mx-1"></div>
             <button onClick={() => setIsModalOpen(true)} className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100">+ Movimiento</button>
          </div>
        </header>

        {/* --- WIDGETS DE KPI Y CUENTAS --- */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            
           {/* Widget Cuentas Bancarias */}
           <div className="lg:col-span-3 bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">💰 Saldos Disponibles</h3>
                 <button onClick={() => setIsBalanceModalOpen(true)} className="text-xs text-blue-600 hover:underline">Actualizar Saldos</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                 {accounts.map(acc => (
                    <div key={acc.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                       <p className="text-xs text-gray-500 truncate" title={acc.name}>{acc.name}</p>
                       <p className="text-lg font-bold text-gray-800 mt-1">
                          <span className="text-xs text-gray-400 mr-1">{acc.currency}</span>
                          {fmtNum(acc.balance)}
                       </p>
                    </div>
                 ))}
                 {accounts.length === 0 && <p className="text-xs text-gray-400">No hay cuentas configuradas.</p>}
              </div>
           </div>

           {/* Widget Cash Flow Neto */}
           <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-sm text-white flex flex-col justify-center">
              <span className="text-xs font-medium text-gray-400 uppercase">Flujo Neto (Periodo)</span>
              <div className="mt-2">
                 <span className={`text-3xl font-bold ${totalIncome - totalSpend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {fmt(totalIncome - totalSpend)}
                 </span>
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                 <span>Ingresos: {fmt(totalIncome)}</span>
                 <span>Egresos: {fmt(totalSpend)}</span>
              </div>
           </div>
        </div>

        {/* --- NAVEGACIÓN DE PESTAÑAS --- */}
        <div className="flex border-b border-gray-200 mb-6 space-x-6">
            <button onClick={() => setActiveTab('gestion')} className={`pb-3 text-sm font-medium border-b-2 ${activeTab === 'gestion' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📥 Inbox de Gestión</button>
            <button onClick={() => setActiveTab('reportes')} className={`pb-3 text-sm font-medium border-b-2 ${activeTab === 'reportes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📊 P&L Matrix</button>
        </div>

        {/* --- CONTENIDO PRINCIPAL --- */}
        {activeTab === 'gestion' ? (
           /* --- PESTAÑA: GESTIÓN DE MOVIMIENTOS --- */
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative flex flex-col h-[700px]">
             
             {/* Barra Flotante de Selección Masiva */}
             {selectedIds.length > 0 && (
                <div className="absolute top-14 left-0 right-0 z-30 bg-blue-50 border-b border-blue-100 px-6 py-2 flex items-center justify-between animate-in slide-in-from-top-2">
                   <span className="text-sm text-blue-800 font-medium">{selectedIds.length} seleccionados</span>
                   <button onClick={verifyBulk} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded shadow-sm hover:bg-blue-700 transition-colors">Validar Todos ✅</button>
                </div>
             )}

             <div className="flex-none border-b border-gray-100 bg-gray-50/50 px-4">
               {['pending_review', 'verified', 'all'].map((st) => (
                 <button key={st} onClick={() => setStatusFilter(st as FilterStatus)} className={`py-3 px-4 text-xs font-medium border-b-2 ${statusFilter === st ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-500'}`}>
                    {st === 'pending_review' ? 'Por Revisar' : st === 'verified' ? 'Histórico' : 'Todo'}
                 </button>
               ))}
             </div>
             
             {loading ? <div className="p-10 text-center text-sm text-gray-500">Cargando transacciones...</div> : (
              <>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm text-left relative">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b sticky top-0 z-20 shadow-sm">
                      <tr>
                          <th className="px-4 py-3 w-4 bg-gray-50">
                             <input type="checkbox" checked={currentRows.length > 0 && currentRows.every(r => selectedIds.includes(r.id))} onChange={toggleSelectAllPage} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                          </th>
                          <th className="px-6 py-3 bg-gray-50">Fecha</th>
                          <th className="px-6 py-3 bg-gray-50">Descripción</th>
                          <th className="px-6 py-3 bg-gray-50">Categoría</th>
                          <th className="px-6 py-3 text-right bg-gray-50">Monto</th>
                          <th className="px-6 py-3 text-center bg-gray-50">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {currentRows.map(tx => (
                          <tr key={tx.id} className={`hover:bg-gray-50 ${selectedIds.includes(tx.id) ? 'bg-blue-50/30' : ''}`}>
                            <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(tx.id)} onChange={() => toggleSelect(tx.id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" /></td>
                            <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{tx.transaction_date}</td>
                            <td className="px-6 py-3">{editingId === tx.id ? <input className="border rounded px-2 py-1 w-full text-sm" value={editForm.description} onChange={e=>setEditForm({...editForm, description: e.target.value})} /> : <div className="max-w-xs truncate" title={tx.raw_description}>{tx.description}</div>}</td>
                            <td className="px-6 py-3">{editingId === tx.id ? (<select className="border rounded px-2 py-1 text-sm w-full" value={editForm.category_id} onChange={e=>setEditForm({...editForm, category_id: e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>) : <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide border ${tx.fin_categories?.type==='income' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{tx.fin_categories?.name}</span>}</td>
                            <td className="px-6 py-3 text-right font-mono text-gray-700">{editingId === tx.id ? <input type="number" className="border rounded px-2 py-1 w-20 text-right" value={editForm.amount_usd} onChange={e=>setEditForm({...editForm, amount_usd: parseFloat(e.target.value)})} /> : fmt(tx.amount_usd)}</td>
                            
                            {/* --- COLUMNA DE ACCIONES --- */}
                            <td className="px-6 py-3 text-center">
                              {editingId === tx.id ? (
                                <div className="flex justify-center gap-1">
                                  <button onClick={()=>saveEdit(tx.id)} className="text-green-600 hover:bg-green-50 p-1 rounded">💾</button>
                                  <button onClick={()=>setEditingId(null)} className="text-gray-400 p-1">✕</button>
                                </div>
                              ) : (
                                <div className="flex justify-center items-center gap-1">
                                  {tx.status === 'pending_review' && <button onClick={()=>verifyTx(tx.id)} className="text-green-600 hover:bg-green-50 p-1 rounded font-bold" title="Aprobar">✓</button>}
                                  <button onClick={()=>startEdit(tx)} className="text-blue-400 hover:bg-blue-50 p-1 rounded" title="Editar">✎</button>
                                  {/* --- BOTÓN ELIMINAR NUEVO --- */}
                                  <button onClick={()=>handleDelete(tx.id)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Eliminar">
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

                <div className="flex-none px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                  <div className="text-xs text-gray-500">Mostrando {currentRows.length > 0 ? indexOfFirstRow + 1 : 0} a {Math.min(indexOfLastRow, viewTransactions.length)} de {viewTransactions.length} registros</div>
                  <div className="flex items-center gap-4">
                    <select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} className="border-gray-300 text-xs rounded shadow-sm focus:border-blue-500 focus:ring-blue-500"><option value={25}>25 por página</option><option value={50}>50 por página</option><option value={100}>100 por página</option></select>
                    <div className="flex gap-1">
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 border rounded bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 text-xs font-medium">Anterior</button>
                      <span className="px-2 py-1 text-xs text-gray-600">Página {currentPage} de {totalPages || 1}</span>
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="px-2 py-1 border rounded bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 text-xs font-medium">Siguiente</button>
                    </div>
                  </div>
                </div>
              </>
             )}
           </div>
        ) : (
           /* --- PESTAÑA: P&L MATRIX --- */
           <div className="space-y-6">
             
           {/* 1. Componente de Gráficos */}
           <FinancialCharts data={pnlData} />

           {/* 2. Tu Tabla P&L Original */}
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[700px]">
               {pnlData.sortedMonths.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">No hay datos en este rango.</div>
               ) : (
                  <div className="flex-1 overflow-auto">
                     <table className="w-full text-sm text-left whitespace-nowrap border-collapse">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0 z-20 shadow-sm">
                           <tr>
                              <th className="px-6 py-3 border-b border-gray-200 sticky left-0 z-20 bg-gray-50 border-r w-64 min-w-[200px]">Concepto</th>
                              {pnlData.sortedMonths.map(m => <th key={m} className="px-6 py-3 border-b border-gray-200 text-right min-w-[120px]">{m}</th>)}
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                           {/* SECCIÓN REVENUE */}
                           {pnlData.matrix['REVENUE'] && <PnLSection title="Ingresos" data={pnlData.matrix['REVENUE']} details={pnlData.detailMatrix} parentKey="REVENUE" months={pnlData.sortedMonths} totalColor="bg-green-50/50" />}
                           
                           {/* SECCIÓN COGS */}
                           {pnlData.matrix['COGS'] && <PnLSection title="Costo de Venta (COGS)" data={pnlData.matrix['COGS']} details={pnlData.detailMatrix} parentKey="COGS" months={pnlData.sortedMonths} />}
                           
                           {/* MARGEN BRUTO */}
                           <tr className="bg-blue-50 border-y-2 border-blue-100">
                              <td className="px-6 py-3 font-bold text-gray-900 sticky left-0 bg-blue-50 border-r border-blue-200 z-10">MARGEN BRUTO ($)</td>
                              {pnlData.sortedMonths.map(m => {
                                 const gross = getParentTotal('REVENUE', m) - getParentTotal('COGS', m);
                                 return <td key={m} className="px-6 py-3 text-right font-bold text-gray-800">{fmt(gross)}</td>
                              })}
                           </tr>

                           {/* SECCIÓN OPEX */}
                           {pnlData.matrix['OPEX'] && <PnLSection title="Gastos Operativos (OpEx)" data={pnlData.matrix['OPEX']} details={pnlData.detailMatrix} parentKey="OPEX" months={pnlData.sortedMonths} />}
                           
                           {/* SECCIÓN TAX */}
                           {pnlData.matrix['TAX'] && <PnLSection title="Impuestos" data={pnlData.matrix['TAX']} details={pnlData.detailMatrix} parentKey="TAX" months={pnlData.sortedMonths} />}
                           
                           {/* UTILIDAD NETA */}
                           <tr className="bg-gray-900 text-white font-bold text-base">
                              <td className="px-6 py-4 sticky left-0 bg-gray-900 border-r border-gray-700 z-10">UTILIDAD NETA</td>
                              {pnlData.sortedMonths.map(m => {
                                 const net = getParentTotal('REVENUE', m) - getParentTotal('COGS', m) - getParentTotal('OPEX', m) - getParentTotal('TAX', m);
                                 return <td key={m} className={`px-6 py-4 text-right ${net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{fmt(net)}</td>
                              })}
                           </tr>
                        </tbody>
                     </table>
                  </div>
               )}
           </div>
        </div>
     )}

       {/* Modal de Carga */}
       <UploadFinanceModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setTimeout(fetchData, 2000); }} categories={categories} />

       {/* Modal de Saldos (Small) */}
       {isBalanceModalOpen && (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="px-6 py-4 border-b flex justify-between items-center"><h3 className="font-bold text-gray-800">Actualizar Saldos Bancarios</h3><button onClick={() => setIsBalanceModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button></div>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                 {accounts.map(acc => (
                    <div key={acc.id} className="flex justify-between items-center">
                       <div><p className="font-medium text-gray-800">{acc.name}</p><p className="text-xs text-gray-500">{acc.currency}</p></div>
                       <input type="number" className="border rounded px-2 py-1 text-right w-32" value={balancesForm[acc.id.toString()] || 0} onChange={e => setBalancesForm({...balancesForm, [acc.id.toString()]: parseFloat(e.target.value)})} />
                    </div>
                 ))}
              </div>
              <div className="px-6 py-4 bg-gray-50 text-right"><button onClick={updateBalances} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Guardar Saldos</button></div>
           </div>
         </div>
       )}
     </main>
   </AuthGuard>
 )}