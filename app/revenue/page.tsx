'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { 
  BanknotesIcon, 
  CreditCardIcon, 
  ChartBarIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';
import { 
  ComposedChart, 
  Line, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';

// --- TIPOS DE DATOS ---
interface RevenueOrder {
  id: string;
  external_id: string;
  amount_usd: number;
  amount_nominal: number;
  currency_nominal: string;
  provider: string;
  country: string;
  plan_type: string;
  product_name: string;
  created_at: string;
  user_bubble_id: string;
}

interface Metrics {
  totalRevenue: number;
  totalTransactions: number;
  averageTicket: number;
  growth?: {
    percent: number;
    isPositive: boolean;
  };
}

// --- CONFIGURACIÓN ---
const DATE_RANGES = [
  { label: 'Hoy', value: 'today' },
  { label: '7 Días', value: '7d' },
  { label: '30 Días', value: '30d' },
  { label: 'Este Mes', value: 'this_month' },
  { label: 'Personalizado', value: 'custom' }
];

const formatCurrency = (value: number | undefined) => {
  if (value === undefined || value === null) return '$ 0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value).replace('USD', '$').trim(); 
};

const COUNTRIES_LIST = ['Chile', 'Perú', 'México', 'Colombia', 'Argentina', 'Ecuador', 'Costa Rica', 'Panamá','El Salvador', 'Honduras', 'Guatemala', 'Venezuela', 'Bolivia', 'Uruguay', 'Paraguay', 'República Dominicana', 'Puerto Rico', 'Nicaragua', 'España'];
const PLANS = ['Mensual', 'Anual'];
const PROVIDERS_LIST = ['Stripe', 'Dlocal', 'MercadoPago', 'Paypal', 'Manual'];
const TYPES_LIST = ['Nuevo', 'Renovación']; 
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

export default function RevenuePage() {
  const { supabase } = useAuth();
  
  // --- ESTADOS (FILTROS) ---
  const [dateRange, setDateRange] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Filtros Avanzados
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Refs para cerrar dropdowns
  const countryRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  // --- ESTADOS (DATA) ---
  const [orders, setOrders] = useState<RevenueOrder[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [distributionData, setDistributionData] = useState<{
    countryChart: any[], 
    planChart: any[], 
    providerChart: any[] 
  }>({ countryChart: [], planChart: [], providerChart: [] });
  
  const [metrics, setMetrics] = useState<Metrics>({ totalRevenue: 0, totalTransactions: 0, averageTicket: 0 });
  const [loading, setLoading] = useState(true);
  
  // Paginación Servidor
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);

  // Cerrar dropdowns al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (countryRef.current && !countryRef.current.contains(event.target)) setIsCountryDropdownOpen(false);
      if (providerRef.current && !providerRef.current.contains(event.target)) setIsProviderDropdownOpen(false);
      if (typeRef.current && !typeRef.current.contains(event.target)) setIsTypeDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFilter = (item: string, list: string[], setList: any) => {
    if (list.includes(item)) setList(list.filter(c => c !== item));
    else setList([...list, item]);
    setCurrentPage(1); // Reset pagina al filtrar
  };

  // --- FETCH PRINCIPAL (Optimizado y Limpio) ---
  useEffect(() => {
    if (!supabase) return;
    if (dateRange === 'custom' && (!customStart || !customEnd)) { setLoading(false); return; }

    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. CALCULO DE FECHAS
        const getDates = () => {
          const now = new Date();
          let start: Date; let end: Date = now; 
          const setStartOfDay = (d: Date) => { d.setHours(0,0,0,0); return d; };

          switch (dateRange) {
            case 'today': start = setStartOfDay(new Date()); break;
            case '7d': start = new Date(); start.setDate(now.getDate() - 7); start = setStartOfDay(start); break;
            case '30d': start = new Date(); start.setDate(now.getDate() - 30); start = setStartOfDay(start); break;
            case 'this_month': start = new Date(now.getFullYear(), now.getMonth(), 1); start = setStartOfDay(start); break;
            case 'custom': start = new Date(`${customStart}T00:00:00`); end = new Date(`${customEnd}T23:59:59`); break;
            default: start = new Date(0);
          }
          
          const duration = end.getTime() - start.getTime();
          const prevStart = new Date(start.getTime() - duration);
          const prevEnd = new Date(end.getTime() - duration);
          
          const lastYearStart = new Date(start); lastYearStart.setFullYear(start.getFullYear() - 1);
          const lastYearEnd = new Date(end); lastYearEnd.setFullYear(end.getFullYear() - 1);

          return { startIso: start.toISOString(), endIso: end.toISOString(), prevStartIso: prevStart.toISOString(), prevEndIso: prevEnd.toISOString(), lastYearStartIso: lastYearStart.toISOString(), lastYearEndIso: lastYearEnd.toISOString() };
        };
        const { startIso, endIso, prevStartIso, prevEndIso, lastYearStartIso, lastYearEndIso } = getDates();

        // 2. CONSTRUCTOR DE QUERIES
        const buildQuery = (s: string, e: string) => {
           let q = supabase.from('rev_orders').select('*', { count: 'exact' }).gte('created_at', s).lte('created_at', e);
           if (selectedCountries.length > 0) q = q.in('country', selectedCountries);
           if (selectedPlan !== 'all') q = q.ilike('product_name', `%${selectedPlan}%`);
           if (selectedProviders.length > 0) q = q.in('provider', selectedProviders);
           if (selectedTypes.length > 0) q = q.in('plan_type', selectedTypes);
           if (searchTerm) q = q.or(`external_id.ilike.%${searchTerm}%,user_bubble_id.ilike.%${searchTerm}%`);
           return q;
        };

        // 3. EJECUCIÓN (UN SOLO PROMISE.ALL)
        const from = (currentPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        const [allDataRes, prevDataRes, lastYearRes, tableDataRes] = await Promise.all([
            // A. Todo el periodo (para KPIs y Gráficos) - SIN paginar
            buildQuery(startIso, endIso).order('created_at', { ascending: true }),
            // B. Periodo anterior (Growth)
            buildQuery(prevStartIso, prevEndIso),
            // C. Año pasado (Gráfico Comparativo)
            buildQuery(lastYearStartIso, lastYearEndIso),
            // D. Tabla (Paginada)
            buildQuery(startIso, endIso).order('created_at', { ascending: false }).range(from, to)
        ]);

        if (allDataRes.error) throw allDataRes.error;
        if (tableDataRes.error) throw tableDataRes.error;

        const data = allDataRes.data || [];
        const prevData = prevDataRes.data || [];
        const tableData = tableDataRes.data || [];

        // 4. CÁLCULO DE MÉTRICAS (Usando data completa)
        const totalRev = data.reduce((sum, item) => sum + (item.amount_usd || 0), 0);
        const prevTotal = prevData.reduce((sum, item) => sum + (item.amount_usd || 0), 0);
        
        let growthParams = { percent: 0, isPositive: true };
        if (prevTotal > 0) {
            const growth = ((totalRev - prevTotal) / prevTotal) * 100;
            growthParams = { percent: Math.abs(growth), isPositive: growth >= 0 };
        } else if (totalRev > 0) growthParams = { percent: 100, isPositive: true };

        setMetrics({ totalRevenue: totalRev, totalTransactions: data.length, averageTicket: data.length > 0 ? totalRev / data.length : 0, growth: growthParams });

        // 5. PREPARAR GRÁFICO TENDENCIA (YoY)
        const lastYearMap = new Map();
        (lastYearRes.data || []).forEach(item => {
            const d = new Date(item.created_at);
            const key = `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; 
            lastYearMap.set(key, (lastYearMap.get(key) || 0) + (item.amount_usd || 0));
        });

        const chartMap = new Map();
        data.forEach(order => {
            const d = new Date(order.created_at);
            const dateKey = d.toISOString().split('T')[0];
            const matchKey = `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (!chartMap.has(dateKey)) {
              chartMap.set(dateKey, { 
                  date: dateKey, 
                  total: 0, // Mantenemos total para cálculos rápidos
                  nuevo: 0,      // <--- Bolsa 1
                  renovacion: 0, // <--- Bolsa 2
                  otros: 0,      // <--- Bolsa de errores
                  lastYear: lastYearMap.get(matchKey) || 0 
              });
          }
          const entry = chartMap.get(dateKey);
          const amount = order.amount_usd || 0;
          
          // 1. Suma al total general (para la línea de crecimiento)
          entry.total += amount;

          // 2. Clasificación por Tipo (A PRUEBA DE ERRORES) 🛡️
          // Convertimos a minúsculas y quitamos espacios para comparar seguro
          // OJO: Si esto sigue saliendo 0, cambia 'plan_type' por 'product_name' aquí abajo 👇
          const tipoRaw = (order.plan_type || '').toLowerCase().trim(); 

          if (tipoRaw.includes('nuevo')) {
              entry.nuevo += amount;
          } else if (tipoRaw.includes('renova')) { 
              // El .includes('renova') atrapa: 'Renovación', 'renovacion', 'Renovacion', etc.
              entry.renovacion += amount;
          } else {
              // Si cae aquí, es porque el texto no coincide o está en otra columna
              // Descomenta la linea de abajo para ver en la consola qué texto está llegando realmente:
              // console.log("Cayó en otros:", order.plan_type, order.product_name);
              entry.otros += amount; 
          }
        });
        setChartData(Array.from(chartMap.values()).sort((a: any, b: any) => a.date.localeCompare(b.date)));

        // 6. PREPARAR DISTRIBUCIONES
        const byCountry: any = {}, byPlan: any = {}, byProvider: any = {};
        data.forEach(item => {
            const amt = item.amount_usd || 0;
            byCountry[item.country || 'Unknown'] = (byCountry[item.country || 'Unknown'] || 0) + amt;
            byPlan[item.product_name || 'Unknown'] = (byPlan[item.product_name || 'Unknown'] || 0) + amt;
            byProvider[item.provider || 'Unknown'] = (byProvider[item.provider || 'Unknown'] || 0) + amt;
        });

        const toArray = (obj: any) => Object.keys(obj).map(k => ({ name: k, value: obj[k] })).sort((a,b) => b.value - a.value);
        let countryArr = toArray(byCountry);
        if (countryArr.length > 5) {
             const top5 = countryArr.slice(0,5);
             const rest = countryArr.slice(5).reduce((s, i) => s + i.value, 0);
             if (rest > 0) countryArr = [...top5, { name: 'Otros', value: rest }];
        }
        
        setDistributionData({ countryChart: countryArr, planChart: toArray(byPlan), providerChart: toArray(byProvider) });

        // 7. ACTUALIZAR TABLA Y TOTALES
        setOrders(tableData); // Usamos los datos YA paginados del backend
        setTotalRecords(allDataRes.count || 0);

      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  
  }, [dateRange, refreshTrigger, selectedPlan, searchTerm, selectedCountries, selectedProviders, selectedTypes, currentPage, itemsPerPage]);

  // --- HELPERS VISUALES ---
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="bold">{`${(percent * 100).toFixed(0)}%`}</text>;
  };

  // --- CUSTOM TOOLTIP (Comparativa YoY + Desglose Stacked) ---
  // --- CUSTOM TOOLTIP (Con cuadrados de color) ---
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Datos brutos
      const data = payload[0].payload; 
      const current = data.total;     
      const lastYear = data.lastYear; 
      
      const nuevo = data.nuevo || 0;
      const renovacion = data.renovacion || 0;
      const otros = data.otros || 0;

      // Crecimiento
      let growth = 0; let isPos = true;
      if (lastYear > 0) { growth = ((current - lastYear) / lastYear) * 100; isPos = growth >= 0; }
      else if (current > 0) growth = 100;
      
      return (
        <div className="bg-white p-3 border border-gray-100 shadow-xl rounded-lg text-xs min-w-[200px] z-50">
          <p className="font-bold text-gray-800 mb-2 border-b border-gray-100 pb-2">
            {new Date(label).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
          
          {/* SECCIÓN 1: Desglose por Colores */}
          <div className="space-y-1.5 mb-3">
             {/* Total General */}
             <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-700">Total:</span>
                <span className="font-bold text-gray-900 text-sm">{formatCurrency(current)}</span>
             </div>

             {/* Fila Azul: Nuevo */}
             <div className="flex justify-between items-center">
                <div className="flex items-center">
                    {/* Cuadradito Azul */}
                    <span className="w-3 h-3 rounded-sm bg-[#3B82F6] mr-2"></span>
                    <span className="text-gray-500">Nuevo</span>
                </div>
                <span className="font-medium text-gray-700">{formatCurrency(nuevo)}</span>
             </div>

             {/* Fila Verde: Renovación */}
             <div className="flex justify-between items-center">
                <div className="flex items-center">
                    {/* Cuadradito Verde */}
                    <span className="w-3 h-3 rounded-sm bg-[#10B981] mr-2"></span>
                    <span className="text-gray-500">Renovación</span>
                </div>
                <span className="font-medium text-gray-700">{formatCurrency(renovacion)}</span>
             </div>

             {/* Fila Roja: Otros (Solo si existe) */}
             {otros > 0 && (
                 <div className="flex justify-between items-center">
                    <div className="flex items-center">
                        <span className="w-3 h-3 rounded-sm bg-[#EF4444] mr-2"></span>
                        <span className="text-gray-500">Otros</span>
                    </div>
                    <span className="font-medium text-gray-700">{formatCurrency(otros)}</span>
                 </div>
             )}
          </div>

          {/* SECCIÓN 2: Comparativa Año Pasado */}
          <div className="bg-gray-50 -mx-3 -mb-3 p-3 border-t border-gray-100 flex items-center justify-between">
             <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Año Pasado</span>
                <span className="text-gray-600 font-medium">{formatCurrency(lastYear)}</span>
             </div>
             
             <div className={`text-right font-bold ${isPos ? 'text-green-600' : 'text-red-500'}`}>
                 <span className="text-lg block leading-none">{isPos ? '▲' : '▼'}</span>
                 <span>{Math.abs(growth).toFixed(1)}%</span>
             </div>
          </div>
        </div>
      );
    }
    return null;
  };// <--- ¡Y ESTA LLAVE TAMBIÉN FALTABA! (Cierra la función)
    

  const KpiCard = ({ title, value, subtext, icon: Icon, colorClass, growth }: any) => (
    <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-gray-900 tracking-tight">{value}</h3>
        {growth ? (
          <div className={`flex items-center mt-2 text-xs font-medium ${growth.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            <ArrowTrendingUpIcon className={`w-3 h-3 mr-1 ${!growth.isPositive && 'rotate-180'}`} /><span>{growth.percent.toFixed(1)}%</span><span className="text-gray-400 ml-1 font-normal">vs periodo anterior</span>
          </div>
        ) : <p className="text-xs text-gray-400 mt-2">{subtext}</p>}
      </div>
      <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}><Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} /></div>
    </div>
  );

  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* 1. HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">Revenue Explorer 🚀</h1><p className="text-gray-500 text-sm">Analiza tus ingresos en detalle</p></div>
        <div className="bg-white p-1 rounded-lg border border-gray-200 flex flex-wrap gap-1 shadow-sm">
          {DATE_RANGES.map((r) => (
            <button key={r.value} onClick={() => { setDateRange(r.value); setCurrentPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateRange === r.value ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>{r.label}</button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="mt-4 bg-blue-50 p-3 rounded-lg border border-blue-100 flex flex-wrap items-end gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Desde</label><input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="block w-36 rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label><input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="block w-36 rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" /></div>
            <button onClick={() => { setRefreshTrigger(p => p+1); setCurrentPage(1); }} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm h-[38px]">Aplicar</button>
          </div>
        )}
      </div>

      {/* 2. FILTROS AVANZADOS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center z-20 relative">
        <div className="flex items-center gap-2 text-gray-400"><FunnelIcon className="w-5 h-5" /><span className="text-xs font-semibold uppercase tracking-wide">Filtros:</span></div>
        
        {/* Country Filter */}
        <div className="relative w-full md:w-auto" ref={countryRef}>
          <button onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)} className="w-full md:w-48 bg-gray-50 border border-gray-300 text-gray-700 text-sm rounded-md px-3 py-2 text-left flex justify-between items-center hover:bg-gray-100 transition-colors">
            <span className="truncate">{selectedCountries.length === 0 ? "🌍 Todos los Países" : `${selectedCountries.length} Países`}</span><ChevronDownIcon className="w-4 h-4 text-gray-500" />
          </button>
          {isCountryDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2 max-h-60 overflow-y-auto">
              <div className="space-y-1">{COUNTRIES_LIST.map((c) => (<label key={c} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"><input type="checkbox" className="rounded text-blue-600 border-gray-300" checked={selectedCountries.includes(c)} onChange={() => toggleFilter(c, selectedCountries, setSelectedCountries)} /><span className="text-sm text-gray-700">{c}</span></label>))}</div>
              {selectedCountries.length > 0 && (<button onClick={() => { setSelectedCountries([]); setCurrentPage(1); }} className="w-full mt-2 text-xs text-center text-red-500 hover:text-red-700 py-1 border-t border-gray-100">Limpiar</button>)}
            </div>
          )}
        </div>

        {/* Provider Filter */}
        <div className="relative w-full md:w-auto" ref={providerRef}>
          <button onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)} className="w-full md:w-40 bg-gray-50 border border-gray-300 text-gray-700 text-sm rounded-md px-3 py-2 text-left flex justify-between items-center hover:bg-gray-100 transition-colors">
            <span className="truncate">{selectedProviders.length === 0 ? "💳 Medio de Pago" : `${selectedProviders.length} Proveedores`}</span><ChevronDownIcon className="w-4 h-4 text-gray-500" />
          </button>
          {isProviderDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2">
              <div className="space-y-1">{PROVIDERS_LIST.map((p) => (<label key={p} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"><input type="checkbox" className="rounded text-blue-600 border-gray-300" checked={selectedProviders.includes(p)} onChange={() => toggleFilter(p, selectedProviders, setSelectedProviders)} /><span className="text-sm text-gray-700">{p}</span></label>))}</div>
              {selectedProviders.length > 0 && (<button onClick={() => { setSelectedProviders([]); setCurrentPage(1); }} className="w-full mt-2 text-xs text-center text-red-500 hover:text-red-700 py-1 border-t border-gray-100">Limpiar</button>)}
            </div>
          )}
        </div>

        {/* Type Filter */}
        <div className="relative w-full md:w-auto" ref={typeRef}>
          <button onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)} className="w-full md:w-40 bg-gray-50 border border-gray-300 text-gray-700 text-sm rounded-md px-3 py-2 text-left flex justify-between items-center hover:bg-gray-100 transition-colors">
            <span className="truncate">{selectedTypes.length === 0 ? "🔄 Tipo Cliente" : `${selectedTypes.length} Tipos`}</span><ChevronDownIcon className="w-4 h-4 text-gray-500" />
          </button>
          {isTypeDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2">
              <div className="space-y-1">{TYPES_LIST.map((t) => (<label key={t} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"><input type="checkbox" className="rounded text-blue-600 border-gray-300" checked={selectedTypes.includes(t)} onChange={() => toggleFilter(t, selectedTypes, setSelectedTypes)} /><span className="text-sm text-gray-700">{t}</span></label>))}</div>
              {selectedTypes.length > 0 && (<button onClick={() => { setSelectedTypes([]); setCurrentPage(1); }} className="w-full mt-2 text-xs text-center text-red-500 hover:text-red-700 py-1 border-t border-gray-100">Limpiar</button>)}
            </div>
          )}
        </div>

        <select className="block w-full md:w-40 rounded-md border-gray-300 shadow-sm sm:text-sm py-2 px-3 border bg-gray-50" value={selectedPlan} onChange={(e) => { setSelectedPlan(e.target.value); setCurrentPage(1); }}>
          <option value="all">📦 Planes</option>{PLANS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="relative flex-grow w-full md:w-auto"><div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><MagnifyingGlassIcon className="h-4 w-4 text-gray-400" /></div><input type="text" className="block w-full rounded-md border-gray-300 pl-10 sm:text-sm py-2 border" placeholder="Buscar..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} /></div>
      </div>

      {/* 3. KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard title="Ingresos Totales" value={loading ? "..." : formatCurrency(metrics.totalRevenue)} growth={metrics.growth} icon={BanknotesIcon} colorClass="bg-green-500 text-green-600" />
        <KpiCard title="Transacciones" value={loading ? "..." : metrics.totalTransactions} subtext="Total procesado" icon={CreditCardIcon} colorClass="bg-blue-500 text-blue-600" />
        <KpiCard title="Ticket Promedio" value={loading ? "..." : formatCurrency(metrics.averageTicket)} subtext="Ingreso por venta" icon={ChartBarIcon} colorClass="bg-purple-500 text-purple-600" />
      </div>

      {/* 4. TENDENCIA YoY */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-700 mb-6">Tendencia de Ingresos</h3>
        <div className="h-64 w-full">
        {loading ? <div className="h-full flex items-center justify-center text-gray-400">Cargando...</div> : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="date" tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, {day:'2-digit', month:'2-digit'})} stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(val) => `$${val}`}/>
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F3F4F6' }} />
              {/* Barra 1: Nuevo (Azul) */}
              <Bar dataKey="nuevo" stackId="a" fill="#3B82F6" barSize={30} />
              
              {/* Barra 2: Renovación (Verde Esmeralda) */}
              <Bar dataKey="renovacion" stackId="a" fill="#10B981" barSize={30} />
              
              {/* Barra 3: Otros (Rojo para alertar) - Radius solo en la punta superior */}
              <Bar dataKey="otros" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={30} />
              <Line type="monotone" dataKey="lastYear" stroke="#9CA3AF" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 6 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : <div className="h-full flex items-center justify-center text-gray-400">Sin datos</div>}
        </div>
      </div>

      {/* 5. DISTRIBUCIONES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
            { title: 'País 🌍', data: distributionData.countryChart, offset: 0 },
            { title: 'Plan 📦', data: distributionData.planChart, offset: 0 },
            { title: 'Medio de Pago 💳', data: distributionData.providerChart, offset: 2 }
        ].map((chart, idx) => (
            <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-semibold text-gray-700 mb-4">{chart.title}</h3>
                <div className="h-64 w-full text-xs">
                    {chart.data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={chart.data} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value" label={renderCustomizedLabel} labelLine={false}>
                            {chart.data.map((e, i) => (
                              <Cell key={`cell-${i}`} fill={COLORS[(i + chart.offset) % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value: number | string | undefined) => formatCurrency(typeof value === 'number' ? value : Number(value))} />
                        <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{fontSize: '10px'}}/>
                    </PieChart>
                    </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-gray-400">Sin datos</div>}
                </div>
            </div>
        ))}
      </div>

      {/* 6. TABLA DETALLADA */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden z-0">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><CalendarDaysIcon className="w-4 h-4 text-gray-400"/> Detalle de Operaciones</h3>
          <span className="text-xs text-gray-400">Total: {totalRecords}</span>
        </div>
        
        {loading ? <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div><p className="text-gray-500">Cargando...</p></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr><th className="px-6 py-3">Fecha</th><th className="px-6 py-3">ID / Usuario</th><th className="px-6 py-3">País</th><th className="px-6 py-3">Plan</th><th className="px-6 py-3 text-right">Monto</th><th className="px-6 py-3 text-right">Original</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.length > 0 ? orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}<span className="block text-xs text-gray-400">{new Date(o.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></td>
                  <td className="px-6 py-3 font-medium text-gray-900 truncate max-w-[150px]" title={o.external_id}>{o.user_bubble_id || 'Anon'}<span className="block text-xs text-gray-400 font-normal truncate">{o.external_id}</span></td>
                  <td className="px-6 py-3"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{o.country}</span></td>
                  <td className="px-6 py-3 text-gray-600"><div className="font-medium text-gray-900">{o.product_name}</div><div className="text-xs text-gray-400">{o.provider}</div></td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900">${o.amount_usd?.toFixed(2)}</td>
                  <td className="px-6 py-3 text-right text-gray-400 text-xs whitespace-nowrap">{new Intl.NumberFormat('es-CL').format(o.amount_nominal)} {o.currency_nominal}</td>
                </tr>
              )) : <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No se encontraron ventas.</td></tr>}
            </tbody>
          </table>
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
             <div className="flex items-center gap-2 text-sm text-gray-600"><span>Mostrar:</span><select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="border-gray-300 rounded text-sm py-1 px-2"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select><span>de {totalRecords}</span></div>
             <div className="flex items-center gap-2"><button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} className={`p-2 rounded-md border ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-100'}`}><ChevronLeftIcon className="w-4 h-4" /></button><span className="text-sm text-gray-600 font-medium">Página {currentPage} de {totalPages || 1}</span><button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages || totalPages === 0} className={`p-2 rounded-md border ${currentPage === totalPages || totalPages === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-100'}`}><ChevronRightIcon className="w-4 h-4" /></button></div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};