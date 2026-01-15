'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import AuthGuard from '@/components/AuthGuard'
import UploadFinanceModal from '@/components/UploadFinanceModal'
import { useAuth } from '@/context/AuthContext'
import { Toaster, toast } from 'sonner' 
import FinancialCharts from '@/components/FinancialCharts'
import CurrencyEditModal from '@/components/CurrencyEditModal'
import CategorySettingsModal from '@/components/CategorySettingsModal'
import OperationalMetricsModal from '@/components/OperationalMetricsModal'
import StrategicKPIs from '@/components/StrategicKPIs'
import Modal from '@/components/Modal'
import CacEvolutionChart from '@/components/CacEvolutionChart'

// --- 1. DEFINICIÓN DE TIPOS (Ajustados a tu DB) ---

type Account = {
  id: number; 
  name: string;
  currency: string;
  type: string;
  balance: number;
  last_updated?: string;
}

type Category = {
  id: string;
  name: string;
  type: string;
  parent_category: string; 
}

type Transaction = {
  id: string;
  created_at: string;
  transaction_date: string;
  description: string;
  raw_description: string | null; // Tipamos que puede ser null
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

type MonthlyMetric = {
  id: string;
  month_date: string;
  new_customers_count: number;
};

// Tipos para Filtros
type DateRange = 'current_month' | 'last_3_months' | 'last_6_months' | 'last_12_months' | 'all' | 'custom';
type FilterStatus = 'pending_review' | 'verified' | 'all';

// --- 1.1 NUEVOS TIPOS Y LÓGICA (Hito 1) ---

// Estado para controlar el modal de edición de moneda
export type CurrencyEditState = {
  isOpen: boolean;
  transactionId: string | null;
  currentData: {
    amount_original: number;
    currency_original: string;
    amount_usd: number;
  } | null;
};

// Función Helper: Lógica de Negocio para el recálculo
// (Confirmada con tu lógica actual: Rate = Original / USD)
export const calculateTransactionValues = (
  currency: string, 
  amountOriginal: number, 
  amountUsdInput: number
) => {
  // 1. Caso USD: Integridad forzada
  if (currency === 'USD') {
    return {
      amount_original: amountOriginal,
      currency_original: 'USD',
      amount_usd: amountOriginal,
      exchange_rate: 1
    };
  }

  // 2. Caso Otra Moneda: Calculamos la tasa
  const safeAmountUsd = amountUsdInput !== 0 ? amountUsdInput : 1;
  const exchangeRate = amountOriginal / safeAmountUsd;

  return {
    amount_original: amountOriginal,
    currency_original: currency,
    amount_usd: amountUsdInput,
    exchange_rate: exchangeRate
  };
};

// ... Aquí siguen tus tipos originales (Account, Category, Transaction) ...

// --- 2. COMPONENTE P&L SECTION ---
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

  const monthlyTotals = months.map(m => {
    return Object.values(data).reduce((sum, catObj) => sum + (catObj[m] || 0), 0);
  });

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  return (
    <>
      {/* CABECERA DE SECCIÓN */}
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

      {/* FILAS DE CATEGORÍAS */}
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

            {/* FILAS DE DETALLE */}
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
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);
  const [monthlyMetrics, setMonthlyMetrics] = useState<MonthlyMetric[]>([]);
  // --- ESTADO PARA EDICIÓN DE MONEDA (HITO 3) ---
const [currencyEdit, setCurrencyEdit] = useState<CurrencyEditState>({
  isOpen: false,
  transactionId: null,
  currentData: null
});
  const [activeTab, setActiveTab] = useState<'gestion' | 'reportes'>('gestion');
  const [dateRange, setDateRange] = useState<DateRange>('last_12_months'); 
  const [customStart, setCustomStart] = useState('');
const [customEnd, setCustomEnd] = useState('');
const [tempStart, setTempStart] = useState('');
  const [tempEnd, setTempEnd] = useState('');

useEffect(() => {
  const now = new Date();
  const end = now.toISOString().split('T')[0]; // Hoy YYYY-MM-DD
  let start = '';

  if (dateRange === 'current_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  } else if (dateRange === 'last_3_months') {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];
  } else if (dateRange === 'last_6_months') {
    start = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
  } else if (dateRange === 'last_12_months') {
    start = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0];
  }
  
  // Si no es 'all' ni 'custom', actualizamos los inputs visuales
  if (dateRange !== 'all' && dateRange !== 'custom') {
    // Si eliges un botón rápido, actualizamos los inputs visuales también
    setTempStart(start);
    setTempEnd(end);
  }
}, [dateRange]);

// --- LÓGICA AUTOCOMPLETADO (Punto 2) ---


  const [statusFilter, setStatusFilter] = useState<FilterStatus>('pending_review');
  const [loading, setLoading] = useState(true);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isChartOpen, setIsChartOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // --- DATOS ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // --- PAGINACIÓN ---
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // --- EDICIÓN Y SELECCIÓN ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ description: '', amount_usd: 0, category_id: '', raw_description: '' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // ... tus otros estados (selectedIds, etc.)

  // --- ESTADOS PARA EDICIÓN MASIVA (HITO 3) ---
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ category_id: '', description: '' });

  // --- MODAL DE SALDOS ---
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [balancesForm, setBalancesForm] = useState<Record<string, number>>({});

  const descriptionSuggestions = useMemo(() => {
    // 1. Sacamos todas las descripciones no vacías
    const all = transactions.map(t => t.description).filter(Boolean);
    // 2. Eliminamos duplicados con Set
    const unique = Array.from(new Set(all));
    // 3. Ordenamos alfabéticamente
    return unique.sort();
  }, [transactions]);
  // 1. CARGA INICIAL DE DATOS
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: cats } = await supabase.from('fin_categories').select('*').order('name');
      if (cats) setCategories(cats);

      const { data: accs } = await supabase.from('fin_accounts').select('*').order('id');
      if (accs) {
        setAccounts(accs);
        const initialForm: Record<string, number> = {};
        accs.forEach((a: Account) => initialForm[a.id.toString()] = a.balance);
        setBalancesForm(initialForm);
      }
      // ... cargas categorías, cuentas, transacciones ...

// NUEVO: Cargar métricas operativas
const { data: metricsData } = await supabase
.from('fin_monthly_metrics')
.select('*')
.order('month_date', { ascending: false });
if (metricsData) setMonthlyMetrics(metricsData);

// ... setTransactions, etc ...

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

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [dateRange, statusFilter, rowsPerPage]);

  const updateBalances = async () => {
    try {
      const updates = Object.entries(balancesForm).map(([idString, balance]) => ({
        id: parseInt(idString), 
        balance: Number(balance),
        last_updated: new Date().toISOString()
      }));
      
      const { error } = await supabase.from('fin_accounts').upsert(updates);
      if (error) throw error;
      
      toast.success('Saldos actualizados correctamente');
      setIsBalanceModalOpen(false);
      fetchData(); 
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar saldos');
    }
  };

  const filterByDate = (tx: Transaction) => {
    // 1. Caso 'Todo'
    if (dateRange === 'all') return true;

    // 2. Caso 'Custom' (PRIORIDAD ALTA)
    if (dateRange === 'custom') {
      // Si el usuario no ha definido rango aun, mostramos todo por seguridad
      if (!customStart || !customEnd) return true;
      
      // COMPARACIÓN DE TEXTO SIMPLE (YYYY-MM-DD)
      // Esto funciona perfecto pq el formato ISO es ordenable alfabéticamente
      return tx.transaction_date >= customStart && tx.transaction_date <= customEnd;
    }

    // 3. Caso Filtros Rápidos (Standard)
    const txDate = new Date(tx.transaction_date);
    const now = new Date();
    // Ajuste importante: poner 'now' al final del día para no perder datos de hoy
    now.setHours(23, 59, 59, 999); 
    
    let monthsBack = 0;
    if (dateRange === 'current_month') monthsBack = 0;
    else if (dateRange === 'last_3_months') monthsBack = 2; // (Mes actual + 2 atrás = 3)
    else if (dateRange === 'last_6_months') monthsBack = 5;
    else if (dateRange === 'last_12_months') monthsBack = 11;

    // Calculamos el día 1 del mes de inicio
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    startDate.setHours(0, 0, 0, 0);

    // Si es "current_month", queremos que coincida mes y año exactamente
    if (dateRange === 'current_month') {
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
    }

    // Para 3M, 6M, 12M
    return txDate >= startDate;
  };

 // 1. filteredTransactions SE MANTIENE IGUAL (Esto asegura que el P&L no cambie con el buscador)
 // --- CORRECCIÓN: Agregamos customStart y customEnd a las dependencias ---
 const filteredTransactions = useMemo(() => {
  return transactions.filter(filterByDate);
}, [transactions, dateRange, customStart, customEnd]); // <--- ¡AQUÍ ESTÁ LA SOLUCIÓN!

 // 2. viewTransactions AHORA INCLUYE EL BUSCADOR (Solo afecta la tabla)
 const viewTransactions = useMemo(() => {
   // A. Primero aplicamos el filtro de Status (Por revisar / Histórico)
   let data = filteredTransactions.filter(t => statusFilter === 'all' || t.status === statusFilter);

   // B. Luego aplicamos el Buscador (Si hay texto escrito)
   // B. Luego aplicamos el Buscador (Si hay texto escrito)
    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.toLowerCase(); // 1. Convertimos tu búsqueda a minúsculas
      
      data = data.filter(t => {
        // 2. Obtenemos los valores de forma segura (si es null, usamos texto vacío '')
        const desc = (t.description || '').toLowerCase();
        const raw = (t.raw_description || '').toLowerCase();
        const cat = (t.fin_categories?.name || '').toLowerCase();

        // 3. Verificamos si alguna columna incluye el término buscado
        return desc.includes(lowerTerm) || raw.includes(lowerTerm) || cat.includes(lowerTerm);
      });
    }
    return data;
 }, [filteredTransactions, statusFilter, searchTerm]); // Se recalcula si cambia algo de esto
  
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = viewTransactions.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(viewTransactions.length / rowsPerPage);

  // --- LÓGICA P&L MATRIX (CORREGIDA) ---
  const pnlData = useMemo(() => {
    const monthsSet = new Set<string>();
    filteredTransactions.forEach(tx => monthsSet.add(tx.transaction_date.substring(0, 7)));
    const sortedMonths = Array.from(monthsSet).sort(); 

    const matrix: Record<string, Record<string, Record<string, number>>> = {};
    const detailMatrix: Record<string, Record<string, Record<string, Record<string, number>>>> = {};

    filteredTransactions.forEach(tx => {
      const parent = tx.fin_categories?.parent_category || 'OTROS';
      const catName = tx.fin_categories?.name || 'Sin Clasificar';
      const desc = tx.description.trim(); 
      const month = tx.transaction_date.substring(0, 7);
      // CORRECCIÓN AQUÍ: Evitamos el crash si es null
      const raw_desc = (tx.raw_description || '').trim();
      const amount = Number(tx.amount_usd);

      // Llenar Matriz Principal
      if (!matrix[parent]) matrix[parent] = {};
      if (!matrix[parent][catName]) matrix[parent][catName] = {};
      matrix[parent][catName][month] = (matrix[parent][catName][month] || 0) + amount;

      // Llenar Matriz de Detalle
      if (!detailMatrix[parent]) detailMatrix[parent] = {};
      if (!detailMatrix[parent][catName]) detailMatrix[parent][catName] = {};
      if (!detailMatrix[parent][catName][desc]) detailMatrix[parent][catName][desc] = {};
      if (!detailMatrix[parent][catName][desc]) detailMatrix[parent][catName][desc] = {};
      
      detailMatrix[parent][catName][desc][month] = (detailMatrix[parent][catName][desc][month] || 0) + amount;
    });

    return { sortedMonths, matrix, detailMatrix };
  }, [filteredTransactions]);

  const getParentTotal = (parent: string, month: string) => {
    const section = pnlData.matrix[parent];
    if (!section) return 0;
    return Object.values(section).reduce((sum, item) => sum + (item[month] || 0), 0);
  };

  const totalIncome = filteredTransactions.filter(t => t.fin_categories?.type === 'income').reduce((s, t) => s + Number(t.amount_usd), 0);
  const totalSpend = filteredTransactions.filter(t => t.fin_categories?.type === 'expense').reduce((s, t) => s + Number(t.amount_usd), 0);
  
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  // --- ACCIONES DE GESTIÓN ---
  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditForm({
      description: tx.description,
      amount_usd: tx.amount_usd,
      category_id: tx.category_id,
      // CORRECCIÓN AQUÍ: Evitamos crash al abrir modal
      raw_description: tx.raw_description || '',
      
    });
  };

  const saveEdit = async (id: string) => { 
    const { error } = await supabase.from('fin_transactions').update(editForm).eq('id', id); 
    if(!error) { toast.success('Guardado'); setEditingId(null); fetchData(); }
  };
  
  const verifyTx = async (id: string) => { 
    const { error } = await supabase.from('fin_transactions').update({ status: 'verified' }).eq('id', id); 
    if(!error) { toast.success('Verificado'); fetchData(); }
  };

  // --- FUNCIÓN DUMMY PARA HITO 3 (LUEGO LA LLENAREMOS EN EL HITO 4) ---
  // --- FUNCIÓN DE EDICIÓN MASIVA (LÓGICA HITO 4) ---
  const handleBulkUpdate = async () => {
    // 1. Validación básica
    if (selectedIds.length === 0) return;

    // 2. Construimos el objeto de actualización dinámicamente
    // Solo agregamos las propiedades si tienen valor, para no borrar datos accidentalmente.
    const updates: Record<string, any> = {};
    
    if (bulkForm.category_id) {
      updates.category_id = bulkForm.category_id;
    }
    
    if (bulkForm.description && bulkForm.description.trim() !== '') {
      updates.description = bulkForm.description.trim();
    }

    // 3. Si el usuario no llenó nada, no gastamos una llamada a la API
    if (Object.keys(updates).length === 0) {
      toast.warning('No ingresaste ningún cambio. Selecciona una categoría o escribe una descripción.');
      return;
    }

    try {
      // 4. LA MAGIA: Actualizamos todos los IDs seleccionados de una sola vez
      const { error } = await supabase
        .from('fin_transactions')
        .update(updates)
        .in('id', selectedIds); // <--- Aquí está el truco: .in() recibe el array

      if (error) throw error;

      // 5. Éxito y Limpieza
      toast.success(`${selectedIds.length} movimientos actualizados correctamente`);
      
      setIsBulkEditOpen(false);        // Cerramos modal
      setBulkForm({ category_id: '', description: '' }); // Limpiamos formulario
      setSelectedIds([]);              // Desmarcamos las filas (opcional, pero recomendado)
      fetchData();                     // Recargamos datos para ver cambios
      
    } catch (error) {
      console.error('Error en bulk update:', error);
      toast.error('Ocurrió un error al intentar actualizar los movimientos.');
    }
  };
  
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

  // --- LÓGICA DE EDICIÓN DE MONEDA ---
  
  // 1. Abrir el Modal con los datos actuales de la fila
  const openCurrencyModal = (tx: Transaction) => {
    setCurrencyEdit({
      isOpen: true,
      transactionId: tx.id,
      currentData: {
        amount_original: tx.amount_original || 0, // Fallback por seguridad
        currency_original: tx.currency_original || 'USD',
        amount_usd: tx.amount_usd
      }
    });
  };

  // 2. Guardar en Supabase (Recibe el payload ya calculado desde el Modal)
  const saveCurrencyData = async (newData: { 
    currency_original: string; 
    amount_original: number; 
    amount_usd: number; 
    exchange_rate: number 
  }) => {
    if (!currencyEdit.transactionId) return;

    try {
      const { error } = await supabase
        .from('fin_transactions')
        .update(newData)
        .eq('id', currencyEdit.transactionId);

      if (error) throw error;

      toast.success('Conversión actualizada correctamente');
      fetchData(); // Recargamos la tabla para ver el cambio
    } catch (error) {
      console.error(error);
      toast.error('Error al actualizar la moneda');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar este movimiento? Esta acción no se puede deshacer.")) return;
    try {
      const { error } = await supabase.from('fin_transactions').delete().eq('id', id);
      if (error) throw error;
      setTransactions(prev => prev.filter(t => t.id !== id));
      toast.success('Movimiento eliminado correctamente');
    } catch (error) {
      console.error('Error al eliminar:', error);
      toast.error('No se pudo eliminar el movimiento');
    }
  };

  /**
 * Calcula la tasa de cambio implícita basada en los montos ingresados manualmente.
 * Regla de negocio:
 * - Si la moneda es USD, la tasa es siempre 1 y el monto USD es igual al original.
 * - Si es otra moneda, la tasa es (Monto Original / Monto USD).
 */
// --- COMPONENTE REUTILIZABLE DE AUTOCOMPLETADO (Hito 5 - UI Mejorada) ---


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
          {/* --- FILTROS DE FECHA (V3 FINAL) --- */}
          <div className="flex items-center gap-2 bg-white p-1 rounded-lg shadow-sm border border-gray-200">
            
            {/* 1. Botones Rápidos (Al hacer clic, desactivan el modo Custom) */}
            {(['current_month', 'last_3_months', 'last_6_months', 'last_12_months', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                  dateRange === r
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {r === 'current_month' ? 'Este Mes' : r === 'last_3_months' ? '3M' : r === 'last_6_months' ? '6M' : r === 'last_12_months' ? '12M' : 'Todo'}
              </button>
            ))}

            <div className="w-px h-4 bg-gray-300 mx-1"></div>

            {/* 2. Botón Custom (Interruptor) */}
            <div className="flex items-center">
              <button
                onClick={() => {
                   // Si ya estaba en custom, no hacemos nada o lo reiniciamos.
                   // Si no estaba, lo activamos visualmente para mostrar los inputs.
                   if (dateRange !== 'custom') {
                      setDateRange('custom'); // Esto muestra los inputs
                      // Opcional: Precargar fechas de hoy en los inputs temporales
                      const today = new Date().toISOString().split('T')[0];
                      setTempStart(today);
                      setTempEnd(today);
                   }
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap flex items-center gap-2 ${
                  dateRange === 'custom'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 font-bold' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                📅 Custom
              </button>

              {/* 3. Inputs Desplegables (Solo visibles si dateRange es 'custom') */}
              {dateRange === 'custom' && (
                <div className="flex items-center gap-2 ml-2 animate-in slide-in-from-left-2 fade-in duration-200 bg-white border border-gray-200 rounded-md p-1 shadow-sm absolute sm:static sm:shadow-none sm:border-0 z-50 mt-10 sm:mt-0">
                  <div className="flex items-center gap-1">
                      <input 
                          type="date" 
                          value={tempStart} 
                          onChange={(e) => setTempStart(e.target.value)}
                          className="text-[10px] border border-gray-300 rounded px-2 py-1 text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                      />
                      <span className="text-gray-400 text-[10px]">-</span>
                      <input 
                          type="date" 
                          value={tempEnd}
                          onChange={(e) => setTempEnd(e.target.value)}
                          className="text-[10px] border border-gray-300 rounded px-2 py-1 text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                      />
                  </div>
                  
                  <button
                      onClick={() => {
                        if(!tempStart || !tempEnd) {
                            toast.error("Ingresa ambas fechas");
                            return;
                        }
                        // Actualizamos las variables REALES que usa el filtro
                        setCustomStart(tempStart);
                        setCustomEnd(tempEnd);
                        // No necesitamos setDateRange('custom') porque ya es custom,
                        // PERO al cambiar customStart/End, el useMemo (corregido en Paso 1) se disparará.
                        toast.success("Rango aplicado");
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors shadow-sm"
                  >
                      APLICAR
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setIsModalOpen(true)} className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100">+ Movimiento</button>
             <button 
  onClick={() => setIsConfigOpen(true)}
  className="p-2 text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
  title="Configurar Categorías y Métricas"
>
  ⚙️
</button>
<button 
  onClick={() => setIsMetricsOpen(true)}
  className="p-2 text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors mr-2"
  title="Ingresar Nuevos Clientes (CAC)"
>
  👥
</button>
{/* Botón Ver Gráfico Evolución */}
<button 
  onClick={() => setIsChartOpen(true)}
  className="p-2 text-gray-500 hover:text-blue-700 bg-white border border-gray-200 rounded-md hover:bg-blue-50 transition-colors mr-2"
  title="Ver Evolución Gráfica"
>
  📈
</button>
          </div>
        </header>

        {/* --- WIDGETS DE KPI Y CUENTAS --- */}
        <StrategicKPIs 
  transactions={filteredTransactions} 
  allTransactions={transactions}
  accounts={accounts} 
  metrics={monthlyMetrics} 
/>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            
           {/* Widget Cuentas Bancarias */}
           <div className="lg:col-span-3 bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
  <div className="flex justify-between items-center mb-4">
    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">💰 Saldos Disponibles</h3>
    <button onClick={() => setIsBalanceModalOpen(true)} className="text-xs text-blue-600 hover:underline">Actualizar Saldos</button>
  </div>
  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
    {accounts.map(acc => (
      // Tarjeta de saldo compacta y limpia
      <div key={acc.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
        
        {/* Nombre de la cuenta y equivalente en USD */}
        <p className="text-xs text-gray-500 truncate" title={acc.name}>
          {acc.name}
          
          {acc.currency === 'PEN' && (
            // Formato compacto (EQ: USD 11,666.23)
            <span className="text-[10px] font-semibold text-blue-500 ml-1">
              (EQ: USD {fmtNum(acc.balance / 3.4)})
            </span>
          )}
        </p>

        {/* Saldo principal en su moneda local */}
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
             
             {selectedIds.length > 0 && (
  <div className="absolute top-14 left-0 right-0 z-30 bg-blue-50 border-b border-blue-100 px-6 py-2 flex items-center justify-between animate-in slide-in-from-top-2 shadow-sm">
    <div className="flex items-center gap-2">
      <span className="text-sm text-blue-900 font-bold bg-blue-100 px-2 py-0.5 rounded-full">
        {selectedIds.length}
      </span>
      <span className="text-sm text-blue-800">seleccionados</span>
    </div>
    
    <div className="flex items-center gap-3">
      {/* Botón 1: Edición Masiva */}
      <button 
        onClick={() => {
          // Limpiamos el formulario y abrimos el modal
          setBulkForm({ category_id: '', description: '' });
          setIsBulkEditOpen(true);
        }}
        className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 text-xs font-bold rounded shadow-sm hover:bg-blue-50 transition-colors flex items-center gap-1"
      >
        ✎ Editar Lote
      </button>

      {/* Botón 2: Validar (Existente) */}
      <button 
        onClick={verifyBulk} 
        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-1"
      >
        ✅ Validar Todos
      </button>
    </div>
  </div>
)}

             {/* --- BARRA DE FILTROS Y BÚSQUEDA --- */}
<div className="flex-none border-b border-gray-100 bg-gray-50/50 px-4 flex flex-col sm:flex-row justify-between items-center gap-4 py-2">
  
  {/* IZQUIERDA: Tabs de Status */}
  <div className="flex space-x-2">
    {['pending_review', 'verified', 'all'].map((st) => (
      <button 
        key={st} 
        onClick={() => setStatusFilter(st as FilterStatus)} 
        className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${statusFilter === st ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
      >
        {st === 'pending_review' ? 'Por Revisar' : st === 'verified' ? 'Histórico' : 'Todo'}
      </button>
    ))}
  </div>

  {/* DERECHA: Buscador Persistente */}
  <div className="relative w-full sm:w-64">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      {/* Icono Lupa */}
      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
    <input
      type="text"
      placeholder="Buscar movimiento..."
      className="block w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-400 focus:outline-none focus:placeholder-gray-300 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-xs transition duration-150 ease-in-out"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
    />
    {searchTerm && (
      <button 
        onClick={() => setSearchTerm('')}
        className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600"
      >
        <span className="text-xs font-bold p-1 bg-gray-100 rounded-full h-5 w-5 flex items-center justify-center">✕</span>
      </button>
    )}
  </div>
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
                          <th className="px-6 py-3 bg-gray-50">Descripción IA</th>
                          <th className="px-6 py-3 bg-gray-50">Descripción Original</th>
                          <th className="px-6 py-3 bg-gray-50">Categoría</th>
                          <th className="px-6 py-3 text-right bg-gray-50">Monto (USD)</th>                          
                          <th className="px-6 py-3 text-center bg-gray-50">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {currentRows.map(tx => (
                          <tr key={tx.id} className={`hover:bg-gray-50 ${selectedIds.includes(tx.id) ? 'bg-blue-50/30' : ''}`}>
                            <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(tx.id)} onChange={() => toggleSelect(tx.id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" /></td>
                            <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{tx.transaction_date}</td>
                            <td className="px-6 py-3">
  {editingId === tx.id ? (
    <AutocompleteInput
      className="border rounded px-2 py-1 w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
      value={editForm.description}
      onChange={(val) => setEditForm({ ...editForm, description: val })}
      suggestions={descriptionSuggestions}
      placeholder="Descripción..."
    />
  ) : (
    <div className="max-w-xs truncate" title={tx.description}>
      {tx.description}
    </div>
  )}
</td>
                            <td className="px-6 py-3">{editingId === tx.id ? <input className="border rounded px-2 py-1 w-full text-sm" value={editForm.raw_description} onChange={e=>setEditForm({...editForm, raw_description: e.target.value})} /> : <div className="max-w-xs truncate" title={tx.raw_description || ''}>{tx.raw_description || '-'}</div>}</td>
                            <td className="px-6 py-3">{editingId === tx.id ? (<select className="border rounded px-2 py-1 text-sm w-full" value={editForm.category_id} onChange={e=>setEditForm({...editForm, category_id: e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>) : <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide border ${tx.fin_categories?.type==='income' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{tx.fin_categories?.name}</span>}</td>
                            <td className="px-6 py-3 text-right font-mono text-gray-700">
  {editingId === tx.id ? (
    // Si estamos editando en línea (el lápiz), dejamos el input simple
    <input 
      type="number" 
      step="0.01" 
      className="border rounded px-2 py-1 w-20 text-right" 
      value={editForm.amount_usd} 
      onChange={e=>setEditForm({...editForm, amount_usd: parseFloat(e.target.value)})} 
    />
  ) : (
    // VISTA NORMAL: Monto + Botón de Calculadora
    <div className="flex items-center justify-end gap-2 group">
      <span>{fmt(tx.amount_usd)}</span>
      
      {/* Botón Disparador del Modal (Solo visible al pasar el mouse o siempre visible si prefieres) */}
      <button 
        onClick={() => openCurrencyModal(tx)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-100 rounded text-xs text-blue-600"
        title="Corregir Moneda / Tasa de Cambio"
      >
        💱
      </button>
    </div>
  )}
</td>
                            
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
             
           <FinancialCharts data={pnlData} />

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
                          {pnlData.matrix['REVENUE'] && <PnLSection title="Ingresos" data={pnlData.matrix['REVENUE']} details={pnlData.detailMatrix} parentKey="REVENUE" months={pnlData.sortedMonths} totalColor="bg-green-50/50" />}
                          
                          {pnlData.matrix['COGS'] && <PnLSection title="Costo de Venta (COGS)" data={pnlData.matrix['COGS']} details={pnlData.detailMatrix} parentKey="COGS" months={pnlData.sortedMonths} />}
                          
                          <tr className="bg-blue-50 border-t-2 border-blue-100">
                              <td className="px-6 py-3 font-bold text-gray-900 sticky left-0 bg-blue-50 border-r border-blue-200 z-10">MARGEN BRUTO ($)</td>
                              {pnlData.sortedMonths.map(m => {
                                  const gross = getParentTotal('REVENUE', m) - getParentTotal('COGS', m);
                                  return <td key={m} className="px-6 py-3 text-right font-bold text-gray-800">{fmt(gross)}</td>
                              })}
                          </tr>
                          <tr className="bg-blue-50/50 border-b-2 border-blue-100">
                              <td className="px-6 py-2 text-xs font-semibold text-blue-800 sticky left-0 bg-blue-50/50 border-r border-blue-200 z-10 pl-10">↳ Margen Bruto %</td>
                              {pnlData.sortedMonths.map(m => {
                                  const rev = getParentTotal('REVENUE', m);
                                  const gross = rev - getParentTotal('COGS', m);
                                  const pct = rev !== 0 ? (gross / rev) : 0;
                                  return <td key={m} className="px-6 py-2 text-right text-xs font-bold text-blue-600">
                                    {(pct * 100).toFixed(1)}%
                                  </td>
                              })}
                          </tr>

                          {pnlData.matrix['OPEX'] && <PnLSection title="Gastos Operativos (OpEx)" data={pnlData.matrix['OPEX']} details={pnlData.detailMatrix} parentKey="OPEX" months={pnlData.sortedMonths} />}
                          
                          {pnlData.matrix['TAX'] && <PnLSection title="Impuestos" data={pnlData.matrix['TAX']} details={pnlData.detailMatrix} parentKey="TAX" months={pnlData.sortedMonths} />}
                          
                          <tr className="bg-gray-900 text-white font-bold text-base border-t border-gray-700">
                              <td className="px-6 py-4 sticky left-0 bg-gray-900 border-r border-gray-700 z-10">UTILIDAD NETA ($)</td>
                              {pnlData.sortedMonths.map(m => {
                                  const net = getParentTotal('REVENUE', m) - getParentTotal('COGS', m) - getParentTotal('OPEX', m) - getParentTotal('TAX', m);
                                  return <td key={m} className={`px-6 py-4 text-right ${net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{fmt(net)}</td>
                              })}
                          </tr>
                          <tr className="bg-gray-800 text-gray-300 text-sm font-medium">
                              <td className="px-6 py-2 sticky left-0 bg-gray-800 border-r border-gray-700 z-10 pl-10">↳ Margen Neto %</td>
                              {pnlData.sortedMonths.map(m => {
                                  const rev = getParentTotal('REVENUE', m);
                                  const net = rev - getParentTotal('COGS', m) - getParentTotal('OPEX', m) - getParentTotal('TAX', m);
                                  const pct = rev !== 0 ? (net / rev) : 0;
                                  
                                  let colorClass = "text-gray-300";
                                  if (pct > 0.20) colorClass = "text-emerald-400 font-bold";
                                  else if (pct < 0) colorClass = "text-red-400";

                                  return <td key={m} className={`px-6 py-2 text-right ${colorClass}`}>
                                    {(pct * 100).toFixed(1)}%
                                  </td>
                              })}
                          </tr>
                        </tbody>
                     </table>
                  </div>
               )}
           </div>
        </div>
     )}

       <UploadFinanceModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setTimeout(fetchData, 2000); }} categories={categories} />

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
     <CurrencyEditModal 
  isOpen={currencyEdit.isOpen}
  onClose={() => setCurrencyEdit(prev => ({ ...prev, isOpen: false }))}
  onSave={saveCurrencyData}
  initialData={currencyEdit.currentData}
/>
<CategorySettingsModal 
  isOpen={isConfigOpen} 
  onClose={() => setIsConfigOpen(false)}
  onUpdate={fetchData} // Opcional: si quieres recargar algo al cerrar
/>
<OperationalMetricsModal 
  isOpen={isMetricsOpen}
  onClose={() => setIsMetricsOpen(false)}
/>
{/* MODAL DE GRÁFICO CAC */}
<Modal isOpen={isChartOpen} onClose={() => setIsChartOpen(false)}>
  <div className="p-4 h-[500px] flex flex-col">
    <div className="flex justify-between items-start mb-4">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Evolución de Eficiencia de Marketing</h2>
        <p className="text-sm text-gray-500">Comparativa mensual: Inversión vs Costo por Cliente (CAC)</p>
      </div>
      <button onClick={() => setIsChartOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
    </div>
    
    {/* Contenedor del Gráfico */}
    <div className="flex-1 w-full overflow-hidden">
      <CacEvolutionChart 
        transactions={transactions} 
        metrics={monthlyMetrics} 
      />
    </div>
  </div>
</Modal>
{/* --- MODAL DE EDICIÓN MASIVA (HITO 3) --- */}
{isBulkEditOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Edición Masiva</h3>
                <p className="text-xs text-gray-500">Editando {selectedIds.length} movimientos seleccionados</p>
              </div>
              <button onClick={() => setIsBulkEditOpen(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors">✕</button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
                ℹ️ Solo los campos que llenes se actualizarán. Si dejas uno vacío, se mantendrá el valor original.
              </div>

              {/* Input Categoría */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Categoría</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={bulkForm.category_id}
                  onChange={e => setBulkForm({...bulkForm, category_id: e.target.value})}
                >
                  <option value="">-- No cambiar categoría --</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Input Descripción */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Descripción</label>
                {/* Input Descripción MEJORADO */}
              <div>
              <AutocompleteInput
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={bulkForm.description}
                  onChange={(val) => setBulkForm({ ...bulkForm, description: val })}
                  suggestions={descriptionSuggestions}
                  placeholder="Ej: Publicidad Facebook Ads (Opcional)"
                />
              </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
              <button 
                onClick={() => setIsBulkEditOpen(false)} 
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                    // AQUÍ IRÁ LA LÓGICA DEL HITO 4
                    console.log("Guardando...", bulkForm);
                    handleBulkUpdate(); 
                }} 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md transform active:scale-95 transition-all"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- DATALIST PARA SUGERENCIAS (Invisible) --- */}
      </AuthGuard>
 )
}
const AutocompleteInput = ({ 
  value, 
  onChange, 
  suggestions, 
  placeholder,
  className 
}: { 
  value: string, 
  onChange: (val: string) => void, 
  suggestions: string[], 
  placeholder?: string,
  className?: string
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Filtramos las sugerencias según lo que el usuario escribe
  const filtered = suggestions.filter(s => 
    s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );

  return (
    <div className="relative w-full">
      <input
        type="text"
        className={className} // Heredamos tus estilos de borde, padding, etc.
        value={value}
        onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        // Retrasamos el blur para permitir el clic en la lista
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} 
        placeholder={placeholder}
        autoComplete="off"
      />
      
      {/* La Lista Desplegable Personalizada */}
      {showSuggestions && value.trim() !== '' && filtered.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto mt-1 animate-in fade-in zoom-in-95 duration-100">
          {filtered.map((suggestion, index) => (
            <li
              key={index}
              onClick={() => {
                onChange(suggestion);
                setShowSuggestions(false);
              }}
              className="px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors border-b border-gray-50 last:border-0"
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};