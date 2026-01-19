'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

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
  prevRevenue?: number;
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

  // --- UTILIDAD DE FORMATO (Hito A) ---
// Esta función convierte cualquier número en formato dinero: $ 1,234.56
const formatCurrency = (value: number | undefined) => {
  if (value === undefined || value === null) return '$ 0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value).replace('USD', '$').trim(); 
  // El .replace es un truco para asegurar que quede "$ 1,234.56" y no "USD 1,234.56"
};

// Lista maestra de países (Asegúrate de que coincidan con cómo están escritos en tu DB)
const COUNTRIES_LIST = ['Chile', 'Perú', 'México', 'Colombia', 'Argentina', 'Ecuador', 'Costa Rica', 'Panamá','El Salvador', 'Honduras', 'Guatemala', 'Venezuela', 'Bolivia', 'Uruguay', 'Paraguay', 'República Dominicana', 'Puerto Rico', 'Nicaragua', 'España'];
const PLANS = ['Mensual', 'Anual'];
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

export default function RevenuePage() {
  const { supabase } = useAuth();
  
  // --- ESTADOS (FILTROS) ---
  const [dateRange, setDateRange] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // NUEVO: Array de países seleccionados (vacío = todos)
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false); // Para abrir/cerrar el menú

  const [selectedPlan, setSelectedPlan] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // --- ESTADOS (DATA) ---
  const [orders, setOrders] = useState<RevenueOrder[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ totalRevenue: 0, totalTransactions: 0, averageTicket: 0 });
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Referencia para detectar clics fuera del dropdown
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown si clickeo fuera
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsCountryDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- LÓGICA DE SELECCIÓN MÚLTIPLE ---
  const toggleCountry = (country: string) => {
    if (selectedCountries.includes(country)) {
      // Si ya está, lo sacamos
      setSelectedCountries(selectedCountries.filter(c => c !== country));
    } else {
      // Si no está, lo agregamos
      setSelectedCountries([...selectedCountries, country]);
    }
  };

  // --- LÓGICA DE FECHAS (Igual que antes) ---
  // --- LÓGICA DE FECHAS (TIMEZONE FIX 🌎) ---
  const getDateRangeParams = (range: string) => {
    const now = new Date();
    let start: Date;
    let end: Date = now; 

    // Helper para poner horas al inicio/fin del día local
    const setStartOfDay = (d: Date) => { d.setHours(0,0,0,0); return d; };
    const setEndOfDay = (d: Date) => { d.setHours(23,59,59,999); return d; };

    switch (range) {
      case 'today':
        start = setStartOfDay(new Date());
        break;
      case '7d':
        start = new Date();
        start.setDate(now.getDate() - 7);
        start = setStartOfDay(start);
        break;
      case '30d':
        start = new Date();
        start.setDate(now.getDate() - 30);
        start = setStartOfDay(start);
        break;
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1); 
        start = setStartOfDay(start);
        break;
      case 'custom':
        if (!customStart || !customEnd) return { start: '', end: '' }; // Retornamos vacíos si falta data
        // Creamos fechas locales explícitas "YYYY-MM-DD" + "T00:00:00"
        start = new Date(`${customStart}T00:00:00`);
        end = new Date(`${customEnd}T23:59:59`);
        break;
      default:
        start = new Date(0); // 1970
    }

    // Retornamos ISO Strings que es lo que pide Supabase
    return { 
      start: start.toISOString(), 
      end: end.toISOString() 
    };
  };

  // --- FETCH PRINCIPAL ---
  // --- FETCH PRINCIPAL (CON LÓGICA DE FECHAS ADENTRO) ---
  // --- FETCH PRINCIPAL (CON DOBLE CONSULTA: PRESENTE Y PASADO) ---
  useEffect(() => {
    if (!supabase) return;
    
    // 1. Validar Custom
    if (dateRange === 'custom' && (!customStart || !customEnd)) {
         setLoading(false);
         return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);

        // 2. OBTENER LAS FECHAS (Lógica 2.0)
        const getDates = () => {
            const now = new Date();
            let start: Date;
            let end: Date = now; 
            const setStartOfDay = (d: Date) => { d.setHours(0,0,0,0); return d; };

            // A. Periodo ACTUAL
            switch (dateRange) {
              case 'today':
                start = setStartOfDay(new Date());
                break;
              case '7d':
                start = new Date();
                start.setDate(now.getDate() - 7);
                start = setStartOfDay(start);
                break;
              case '30d':
                start = new Date();
                start.setDate(now.getDate() - 30);
                start = setStartOfDay(start);
                break;
              case 'this_month':
                start = new Date(now.getFullYear(), now.getMonth(), 1); 
                start = setStartOfDay(start);
                break;
              case 'custom':
                start = new Date(`${customStart}T00:00:00`);
                end = new Date(`${customEnd}T23:59:59`);
                break;
              default:
                start = new Date(0);
            }

            // B. Periodo ANTERIOR (Mes pasado)
            const prevStart = new Date(start);
            prevStart.setMonth(prevStart.getMonth() - 1);
            
            const prevEnd = new Date(end);
            prevEnd.setMonth(prevEnd.getMonth() - 1);

            return { 
              startIso: start.toISOString(), 
              endIso: end.toISOString(),
              prevStartIso: prevStart.toISOString(),
              prevEndIso: prevEnd.toISOString()
            };
        };

        const { startIso, endIso, prevStartIso, prevEndIso } = getDates();

        // 3. CONSTRUIR QUERIES
        const buildQuery = (startDate: string, endDate: string) => {
          let q = supabase.from('rev_orders').select('*')
            .gte('created_at', startDate)
            .lte('created_at', endDate);
            
          if (selectedCountries.length > 0) q = q.in('country', selectedCountries);
          if (selectedPlan !== 'all') q = q.ilike('product_name', `%${selectedPlan}%`);
          if (searchTerm) q = q.or(`external_id.ilike.%${searchTerm}%,user_bubble_id.ilike.%${searchTerm}%`);
          
          return q;
        };

        // 4. EJECUTAR (PARALELO)
        const [currentRes, prevRes] = await Promise.all([
          buildQuery(startIso, endIso).order('created_at', { ascending: false }),
          buildQuery(prevStartIso, prevEndIso)
        ]);

        if (currentRes.error) throw currentRes.error;

        const currentData = currentRes.data || [];
        const prevData = prevRes.data || [];

        // 5. CALCULAR MÉTRICAS
        const calcTotal = (dataset: any[]) => dataset.reduce((sum, item) => sum + (item.amount_usd || 0), 0);
        
        const currentTotal = calcTotal(currentData);
        const prevTotal = calcTotal(prevData);
        
        // Calcular Delta %
        let growthParams = { percent: 0, isPositive: true };
        if (prevTotal > 0) {
            const growth = ((currentTotal - prevTotal) / prevTotal) * 100;
            growthParams = { percent: Math.abs(growth), isPositive: growth >= 0 };
        } else if (currentTotal > 0) {
            growthParams = { percent: 100, isPositive: true };
        }

        // 6. GUARDAR ESTADO
        setMetrics({ 
          totalRevenue: currentTotal, 
          totalTransactions: currentData.length, 
          averageTicket: currentData.length > 0 ? currentTotal / currentData.length : 0,
          growth: growthParams, 
          prevRevenue: prevTotal 
        });

        setOrders(currentData);
        setCurrentPage(1);

      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, refreshTrigger, selectedPlan, searchTerm, selectedCountries]); 
  // Nota: Quitamos 'supabase' de dependencias pq a veces useAuth lo recrea y causa loop.

  // --- COMPONENTES VISUALES ---
  // --- COMPONENTES VISUALES ---
  const KpiCard = ({ title, value, subtext, icon: Icon, colorClass, growth }: any) => (
    <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-gray-900 tracking-tight">{value}</h3>
        
        {/* Lógica de Crecimiento (Delta) */}
        {growth && (
          <div className={`flex items-center mt-2 text-xs font-medium ${growth.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {growth.isPositive ? (
              <ArrowTrendingUpIcon className="w-3 h-3 mr-1" />
            ) : (
              <ArrowTrendingUpIcon className="w-3 h-3 mr-1 transform rotate-180" />
            )}
            <span>{growth.percent.toFixed(1)}%</span>
            <span className="text-gray-400 ml-1 font-normal">vs periodo anterior</span>
          </div>
        )}
        
        {!growth && <p className="text-xs text-gray-400 mt-2">{subtext}</p>}
      </div>
      
      <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
      </div>
    </div>
  );

  // 1. PREPARAR DATOS DEL GRÁFICO (Agrupar por fecha)
  // --- PREPARAR DATOS GRÁFICO (OPTIMIZADO CON USEMEMO) ---
  const chartData = useMemo(() => {
    return orders.reduce((acc: any[], order) => {
      // Protección contra fechas inválidas
      if (!order.created_at) return acc;
      
      try {
        // Usamos fecha local YYYY-MM-DD
        const date = new Date(order.created_at).toLocaleDateString('en-CA'); 
        
        const existing = acc.find(item => item.date === date);
        if (existing) {
          existing.total += order.amount_usd || 0;
        } else {
          acc.push({ date, total: order.amount_usd || 0 });
        }
      } catch (e) {
        // Si falla la fecha, ignoramos esa fila para no romper el gráfico
      }
      return acc;
    }, []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [orders]); // <--- Solo se recalcula si 'orders' cambia // Ordenar cronológicamente

  // --- PREPARAR DATOS DISTRIBUCIÓN (PAÍS Y PLAN) ---
  // --- PREPARAR DATOS DISTRIBUCIÓN (TOP 5 + OTROS) ---
  const distributionData = useMemo(() => {
    
    // 1. Agrupar por País
    const byCountry = orders.reduce((acc: any, order) => {
      const country = order.country || 'Unknown';
      acc[country] = (acc[country] || 0) + (order.amount_usd || 0);
      return acc;
    }, {});

    // 2. Agrupar por Plan
    const byPlan = orders.reduce((acc: any, order) => {
      const plan = order.product_name || 'Unknown'; 
      acc[plan] = (acc[plan] || 0) + (order.amount_usd || 0);
      return acc;
    }, {});

    // Helper: Objeto -> Array ordenado
    const toArray = (obj: any) => Object.keys(obj)
      .map(key => ({ name: key, value: obj[key] }))
      .sort((a, b) => b.value - a.value);

    // LÓGICA DE AGRUPACIÓN (TOP 5)
    let countryArray = toArray(byCountry);
    
    // Si tenemos más de 5 países, cortamos y sumamos el resto
    if (countryArray.length > 5) {
      const top5 = countryArray.slice(0, 5);
      const rest = countryArray.slice(5);
      const otherTotal = rest.reduce((sum, item) => sum + item.value, 0);
      
      // Solo agregamos "Otros" si el monto es mayor a 0
      if (otherTotal > 0) {
        countryArray = [...top5, { name: 'Otros', value: otherTotal }];
      }
    }

    return {
      countryChart: countryArray,
      planChart: toArray(byPlan) // Los planes suelen ser pocos, los dejamos todos
    };
  }, [orders]);


  // 2. LÓGICA DE PAGINACIÓN (Recortar la tabla)
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentOrders = orders.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(orders.length / itemsPerPage);

  // Función para cambiar de página
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      
      {/* 1. HEADER & BARRA DE FECHAS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Revenue Explorer 🚀
          </h1>
          <p className="text-gray-500 text-sm">Analiza tus ingresos en detalle</p>
        </div>

        <div className="bg-white p-1 rounded-lg border border-gray-200 flex flex-wrap gap-1 shadow-sm">
          {DATE_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => setDateRange(range.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dateRange === range.value
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
        {/* --- NUEVO: INPUTS PARA FILTRO CUSTOM --- */}
        {dateRange === 'custom' && (
          <div className="mt-4 bg-blue-50 p-3 rounded-lg border border-blue-100 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
              <input 
                type="date" 
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="block w-36 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
              <input 
                type="date" 
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="block w-36 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              />
            </div>
            <button
              onClick={() => setRefreshTrigger(prev => prev + 1)} // Esto dispara el useEffect
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm h-[38px]"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {/* 2. BARRA DE FILTROS AVANZADOS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center z-20 relative">
        <div className="flex items-center gap-2 text-gray-400">
           <FunnelIcon className="w-5 h-5" />
           <span className="text-xs font-semibold uppercase tracking-wide">Filtros:</span>
        </div>

        {/* --- NUEVO FILTRO DE PAÍSES MULTI-SELECT --- */}
        <div className="relative w-full md:w-auto" ref={dropdownRef}>
          <button
            onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
            className="w-full md:w-48 bg-gray-50 border border-gray-300 text-gray-700 text-sm rounded-md px-3 py-2 text-left flex justify-between items-center hover:bg-gray-100 transition-colors"
          >
            <span className="truncate">
              {selectedCountries.length === 0 
                ? "🌍 Todos los Países" 
                : `${selectedCountries.length} Países seleccionados`}
            </span>
            <ChevronDownIcon className="w-4 h-4 text-gray-500" />
          </button>

          {/* Menú Dropdown */}
          {isCountryDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2 max-h-60 overflow-y-auto">
              <div className="space-y-1">
                {COUNTRIES_LIST.map((country) => (
                  <label key={country} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                      checked={selectedCountries.includes(country)}
                      onChange={() => toggleCountry(country)}
                    />
                    <span className="text-sm text-gray-700">{country}</span>
                  </label>
                ))}
              </div>
              
              {/* Botón limpiar */}
              {selectedCountries.length > 0 && (
                 <button 
                   onClick={() => setSelectedCountries([])}
                   className="w-full mt-2 text-xs text-center text-red-500 hover:text-red-700 py-1 border-t border-gray-100"
                 >
                   Limpiar selección
                 </button>
              )}
            </div>
          )}
        </div>

        {/* Filtro Plan */}
        <select 
          className="block w-full md:w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border bg-gray-50"
          value={selectedPlan}
          onChange={(e) => setSelectedPlan(e.target.value)}
        >
          <option value="all">📦 Todos los Planes</option>
          {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Buscador */}
        <div className="relative flex-grow w-full md:w-auto">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 border"
            placeholder="Buscar por ID, usuario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* 3. KPIS REACTIVOS */}
      {/* 3. KPIS REACTIVOS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Tarjeta de Ingresos (Con Comparativa) */}
        <KpiCard 
          title="Ingresos Totales" 
          value={loading ? "..." : formatCurrency(metrics.totalRevenue)}
          growth={metrics.growth} // <--- AQUÍ PASAMOS LA MAGIA 🪄
          icon={BanknotesIcon}
          colorClass="bg-green-500 text-green-600"
        />

        {/* Tarjeta de Transacciones */}
        <KpiCard 
          title="Transacciones" 
          value={loading ? "..." : metrics.totalTransactions}
          subtext="Total procesado en el periodo"
          icon={CreditCardIcon}
          colorClass="bg-blue-500 text-blue-600"
        />

        {/* Tarjeta de Ticket Promedio */}
        <KpiCard 
          title="Ticket Promedio" 
          value={loading ? "..." : formatCurrency(metrics.averageTicket)}
          subtext="Ingreso por cada venta"
          icon={ChartBarIcon}
          colorClass="bg-purple-500 text-purple-600"
        />
      </div>

      {/* --- NUEVA SECCIÓN: GRÁFICO DE TENDENCIA --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-700 mb-6">Tendencia de Ingresos</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, {day:'2-digit', month:'2-digit'})}
                stroke="#9CA3AF"
                fontSize={12}
              />
              <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(val) => `$${val}`}/>
              <Tooltip 
  cursor={{ fill: '#F3F4F6' }}
  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Venta Total']}
  labelFormatter={(label) => new Date(label).toLocaleDateString()}
/>
              <Bar dataKey="total" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5. SECCIÓN DISTRIBUCIÓN (DOS COLUMNAS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* GRÁFICO POR PAÍS */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-700 mb-4">Ingresos por País 🌍</h3>
          <div className="h-64 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData.countryChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={60} // Hace que sea una DONA (hueco al medio)
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.countryChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => value !== undefined ? `$${value.toFixed(2)}` : ''} />
                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '11px'}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICO POR PLAN */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-700 mb-4">Ingresos por Plan 📦</h3>
          <div className="h-64 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData.planChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.planChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => value !== undefined ? `$${value.toFixed(2)}` : ''} />
                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '11px'}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* 4. TABLA DE RESULTADOS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden z-0">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <CalendarDaysIcon className="w-4 h-4 text-gray-400"/>
            Detalle de Operaciones
          </h3>
          <span className="text-xs text-gray-400">
            Mostrando {orders.length} resultados recientes
          </span>
        </div>
        
        {loading ? (
          <div className="p-12 text-center">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
             <p className="text-gray-500">Filtrando datos...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3">ID / Usuario</th>
                  <th className="px-6 py-3">País</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3 text-right">Monto (USD)</th>
                  <th className="px-6 py-3 text-right">Original</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.length > 0 ? (
                  currentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString()}
                        <span className="block text-xs text-gray-400">{new Date(order.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </td>
                      <td className="px-6 py-3 font-medium text-gray-900 truncate max-w-[150px]" title={order.external_id}>
                        {order.user_bubble_id || 'Anon'}
                        <span className="block text-xs text-gray-400 font-normal truncate">{order.external_id}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {order.country}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        <div className="font-medium text-gray-900">{order.product_name}</div>
                        <div className="text-xs text-gray-400">{order.provider}</div>
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-gray-900">
                        ${order.amount_usd?.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                        {new Intl.NumberFormat('es-CL').format(order.amount_nominal)} {order.currency_nominal}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      No se encontraron ventas con estos filtros. 🕵️‍♂️
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {/* --- FOOTER DE PAGINACIÓN --- */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Selector de Items por página */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Mostrar:</span>
            <select 
              value={itemsPerPage} 
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1); // Volver al inicio si cambiamos esto
              }}
              className="border-gray-300 rounded text-sm py-1 px-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>de {orders.length} resultados</span>
          </div>

          {/* Botones de Navegación */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              className={`p-2 rounded-md border ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            
            <span className="text-sm text-gray-600 font-medium">
              Página {currentPage} de {totalPages || 1}
            </span>

            <button
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages || totalPages === 0}
              className={`p-2 rounded-md border ${currentPage === totalPages || totalPages === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
          </div>
        )}
      </div>
    </div>
  );
}