'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  BanknotesIcon,
  CreditCardIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import KpiCard from './KpiCard';
import GrowthFilters from './GrowthFilters';
import { fmtUSD, fmtNum } from './formatters';

// --- TYPES ---
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
  client_type: string;
  plan_category: string;
  plan_duration: string;
  created_at: string;
  user_bubble_id: string;
}

interface Metrics {
  totalRevenue: number;
  totalTransactions: number;
  averageTicket: number;
  growth?: { percent: number; isPositive: boolean };
}

// --- CONFIG ---
const DATE_RANGES = [
  { label: 'Hoy', value: 'today' },
  { label: '7 Dias', value: '7d' },
  { label: '30 Dias', value: '30d' },
  { label: 'Este Mes', value: 'this_month' },
  { label: 'Personalizado', value: 'custom' },
];

type Granularity = 'daily' | 'weekly' | 'monthly';
const GRANULARITY_OPTIONS: { label: string; value: Granularity }[] = [
  { label: 'Diario', value: 'daily' },
  { label: 'Semanal', value: 'weekly' },
  { label: 'Mensual', value: 'monthly' },
];

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

function getWeekKey(d: Date): string {
  const start = new Date(d);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  return start.toISOString().split('T')[0];
}

function getMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function RevenueTab() {
  const { supabase } = useAuth();

  // Filters
  const [dateRange, setDateRange] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Data
  const [allData, setAllData] = useState<RevenueOrder[]>([]);
  const [lastYearData, setLastYearData] = useState<RevenueOrder[]>([]);
  const [orders, setOrders] = useState<RevenueOrder[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ totalRevenue: 0, totalTransactions: 0, averageTicket: 0 });
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<{ date: string; count: number } | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sync status
  useEffect(() => {
    if (!supabase) return;
    supabase.from('sync_logs').select('*').eq('source', 'n8n').order('created_at', { ascending: false }).limit(1).single()
      .then(({ data }) => {
        if (data) setSyncStatus({ date: data.created_at, count: data.records_processed });
      });
  }, []);

  // Main fetch
  useEffect(() => {
    if (!supabase) return;
    if (dateRange === 'custom' && (!customStart || !customEnd)) { setLoading(false); return; }

    const fetchData = async () => {
      try {
        setLoading(true);

        const getDates = () => {
          const now = new Date();
          let start: Date; let end: Date = now;
          const sod = (d: Date) => { d.setHours(0, 0, 0, 0); return d; };
          switch (dateRange) {
            case 'today': start = sod(new Date()); break;
            case '7d': start = new Date(); start.setDate(now.getDate() - 7); start = sod(start); break;
            case '30d': start = new Date(); start.setDate(now.getDate() - 30); start = sod(start); break;
            case 'this_month': start = new Date(now.getFullYear(), now.getMonth(), 1); start = sod(start); break;
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

        const buildQuery = (s: string, e: string) => {
          let q = supabase.from('rev_orders').select('*', { count: 'exact' }).gte('created_at', s).lte('created_at', e);
          if (selectedCountries.length > 0) q = q.in('country', selectedCountries);
          if (selectedPlan !== 'all') q = q.ilike('product_name', `%${selectedPlan}%`);
          if (selectedProviders.length > 0) q = q.in('provider', selectedProviders);
          if (selectedTypes.length > 0) q = q.in('plan_type', selectedTypes);
          if (searchTerm) q = q.or(`external_id.ilike.%${searchTerm}%,user_bubble_id.ilike.%${searchTerm}%`);
          return q;
        };

        const from = (currentPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        const [allDataRes, prevDataRes, lastYearRes, tableDataRes] = await Promise.all([
          buildQuery(startIso, endIso).order('created_at', { ascending: true }),
          buildQuery(prevStartIso, prevEndIso),
          buildQuery(lastYearStartIso, lastYearEndIso),
          buildQuery(startIso, endIso).order('created_at', { ascending: false }).range(from, to),
        ]);

        if (allDataRes.error) throw allDataRes.error;
        if (tableDataRes.error) throw tableDataRes.error;

        const data = allDataRes.data || [];
        const prevData = prevDataRes.data || [];

        // Metrics
        const totalRev = data.reduce((sum: number, item: any) => sum + (item.amount_usd || 0), 0);
        const prevTotal = prevData.reduce((sum: number, item: any) => sum + (item.amount_usd || 0), 0);
        let growthParams = { percent: 0, isPositive: true };
        if (prevTotal > 0) {
          const g = ((totalRev - prevTotal) / prevTotal) * 100;
          growthParams = { percent: Math.abs(g), isPositive: g >= 0 };
        } else if (totalRev > 0) growthParams = { percent: 100, isPositive: true };

        setMetrics({ totalRevenue: totalRev, totalTransactions: data.length, averageTicket: data.length > 0 ? totalRev / data.length : 0, growth: growthParams });
        setAllData(data as RevenueOrder[]);
        setLastYearData((lastYearRes.data || []) as RevenueOrder[]);
        setOrders((tableDataRes.data || []) as RevenueOrder[]);
        setTotalRecords(allDataRes.count || 0);
      } catch (err) {
        console.error('Error fetching revenue data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dateRange, refreshTrigger, selectedPlan, searchTerm, selectedCountries, selectedProviders, selectedTypes, currentPage, itemsPerPage]);

  // Chart data with granularity
  const chartData = useMemo(() => {
    if (!allData.length) return [];

    const bucketMap = new Map<string, { date: string; total: number; nuevo: number; renovacion: number; suscripcion: number; prepago: number; lastYear: number }>();

    // Build last year lookup: shift dates +1 year to align with current period
    const lastYearBuckets = new Map<string, number>();
    lastYearData.forEach((order) => {
      const d = new Date(order.created_at);
      d.setFullYear(d.getFullYear() + 1); // shift to current year for alignment
      let key: string;
      if (granularity === 'weekly') key = getWeekKey(d);
      else if (granularity === 'monthly') key = getMonthKey(d);
      else key = d.toISOString().split('T')[0];
      lastYearBuckets.set(key, (lastYearBuckets.get(key) || 0) + (order.amount_usd || 0));
    });

    allData.forEach((order) => {
      const d = new Date(order.created_at);
      let key: string;
      if (granularity === 'weekly') key = getWeekKey(d);
      else if (granularity === 'monthly') key = getMonthKey(d);
      else key = d.toISOString().split('T')[0];

      if (!bucketMap.has(key)) {
        bucketMap.set(key, { date: key, total: 0, nuevo: 0, renovacion: 0, suscripcion: 0, prepago: 0, lastYear: 0 });
      }
      const entry = bucketMap.get(key)!;
      const amt = order.amount_usd || 0;
      entry.total += amt;

      // Client type (Nuevo / Renovacion)
      const tipo = (order.client_type || order.plan_type || '').toLowerCase().trim();
      if (tipo.includes('nuevo')) entry.nuevo += amt;
      else if (tipo.includes('renova')) entry.renovacion += amt;

      // Plan category (Suscripcion / Prepago)
      const cat = (order.plan_category || '').toLowerCase().trim();
      if (cat.includes('suscri')) entry.suscripcion += amt;
      else if (cat.includes('prepago')) entry.prepago += amt;
    });

    // Merge last year data into buckets
    bucketMap.forEach((entry, key) => {
      entry.lastYear = lastYearBuckets.get(key) || 0;
    });

    return Array.from(bucketMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [allData, lastYearData, granularity]);

  // Distribution data
  const distributionData = useMemo(() => {
    const byCountry: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    allData.forEach((item) => {
      const amt = item.amount_usd || 0;
      byCountry[item.country || 'Unknown'] = (byCountry[item.country || 'Unknown'] || 0) + amt;
      byPlan[item.plan_duration || item.product_name || 'Unknown'] = (byPlan[item.plan_duration || item.product_name || 'Unknown'] || 0) + amt;
      byProvider[item.provider || 'Unknown'] = (byProvider[item.provider || 'Unknown'] || 0) + amt;
      const cat = item.plan_category || 'Sin clasificar';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    });

    const toArray = (obj: Record<string, number>) => Object.entries(obj).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    let countryArr = toArray(byCountry);
    if (countryArr.length > 5) {
      const top5 = countryArr.slice(0, 5);
      const rest = countryArr.slice(5).reduce((s, i) => s + i.value, 0);
      if (rest > 0) countryArr = [...top5, { name: 'Otros', value: rest }];
    }

    return { countryChart: countryArr, planChart: toArray(byPlan), providerChart: toArray(byProvider), categoryChart: toArray(byCategory) };
  }, [allData]);

  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="bold">{`${(percent * 100).toFixed(0)}%`}</text>;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-gray-100 shadow-xl rounded-lg text-xs min-w-[200px] z-50">
        <p className="font-bold text-gray-800 mb-2 border-b border-gray-100 pb-2">{label}</p>
        <div className="space-y-1.5 mb-2">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold text-gray-700">Total:</span>
            <span className="font-bold text-gray-900 text-sm">{fmtUSD(data.total)}</span>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center"><span className="w-3 h-3 rounded-sm bg-[#3B82F6] mr-2"></span><span className="text-gray-500">Nuevo</span></div>
            <span className="font-medium text-gray-700">{fmtUSD(data.nuevo)}</span>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center"><span className="w-3 h-3 rounded-sm bg-[#10B981] mr-2"></span><span className="text-gray-500">Renovacion</span></div>
            <span className="font-medium text-gray-700">{fmtUSD(data.renovacion)}</span>
          </div>
          {data.suscripcion > 0 && (
            <div className="flex justify-between items-center border-t border-gray-50 pt-1">
              <div className="flex items-center"><span className="w-3 h-3 rounded-sm bg-[#8B5CF6] mr-2"></span><span className="text-gray-500">Suscripcion</span></div>
              <span className="font-medium text-gray-700">{fmtUSD(data.suscripcion)}</span>
            </div>
          )}
          {data.prepago > 0 && (
            <div className="flex justify-between items-center">
              <div className="flex items-center"><span className="w-3 h-3 rounded-sm bg-[#F59E0B] mr-2"></span><span className="text-gray-500">Prepago</span></div>
              <span className="font-medium text-gray-700">{fmtUSD(data.prepago)}</span>
            </div>
          )}
          {data.lastYear > 0 && (
            <div className="flex justify-between items-center border-t border-gray-100 pt-1.5 mt-1">
              <div className="flex items-center"><span className="w-3 h-0.5 bg-gray-400 mr-2" style={{ borderTop: '2px dashed #9CA3AF', background: 'none' }}></span><span className="text-gray-500">Año anterior</span></div>
              <div className="text-right">
                <span className="font-medium text-gray-500">{fmtUSD(data.lastYear)}</span>
                {data.total > 0 && (
                  <span className={`block text-[10px] font-bold ${data.total >= data.lastYear ? 'text-green-600' : 'text-red-500'}`}>
                    {data.total >= data.lastYear ? '+' : ''}{((data.total - data.lastYear) / data.lastYear * 100).toFixed(0)}% YoY
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const formatXAxisLabel = (str: string) => {
    if (granularity === 'monthly') {
      const [y, m] = str.split('-');
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return `${months[parseInt(m) - 1]} ${y.slice(2)}`;
    }
    return new Date(str).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          {syncStatus && (
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-xs text-blue-700">
              <ArrowPathIcon className="w-3 h-3 text-blue-500" />
              <span className="font-medium">Ultima carga: {new Date(syncStatus.date).toLocaleDateString()} {new Date(syncStatus.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="w-1 h-1 rounded-full bg-blue-300"></span>
              <span>+{fmtNum(syncStatus.count)} procesados</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Granularity toggle */}
          <div className="bg-white p-1 rounded-lg border border-gray-200 flex gap-1 shadow-sm">
            {GRANULARITY_OPTIONS.map((g) => (
              <button key={g.value} onClick={() => setGranularity(g.value)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${granularity === g.value ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                {g.label}
              </button>
            ))}
          </div>
          {/* Date range */}
          <div className="bg-white p-1 rounded-lg border border-gray-200 flex flex-wrap gap-1 shadow-sm">
            {DATE_RANGES.map((r) => (
              <button key={r.value} onClick={() => { setDateRange(r.value); setCurrentPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateRange === r.value ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {dateRange === 'custom' && (
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex flex-wrap items-end gap-3">
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Desde</label><input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="block w-36 rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label><input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="block w-36 rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" /></div>
          <button onClick={() => { setRefreshTrigger(p => p + 1); setCurrentPage(1); }} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm h-[38px]">Aplicar</button>
        </div>
      )}

      {/* Filters */}
      <GrowthFilters
        selectedCountries={selectedCountries} setSelectedCountries={setSelectedCountries}
        selectedProviders={selectedProviders} setSelectedProviders={setSelectedProviders}
        selectedTypes={selectedTypes} setSelectedTypes={setSelectedTypes}
        selectedPlan={selectedPlan} setSelectedPlan={setSelectedPlan}
        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
        onFilterChange={() => setCurrentPage(1)}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard title="Ingresos Totales" value={fmtUSD(metrics.totalRevenue)} growth={metrics.growth} icon={BanknotesIcon} colorClass="bg-green-500" loading={loading} />
        <KpiCard title="Transacciones" value={fmtNum(metrics.totalTransactions)} subtext="Total procesado" icon={CreditCardIcon} colorClass="bg-blue-500" loading={loading} />
        <KpiCard title="Ticket Promedio" value={fmtUSD(metrics.averageTicket)} subtext="Ingreso por venta" icon={ChartBarIcon} colorClass="bg-purple-500" loading={loading} />
      </div>

      {/* Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-700 mb-6">Tendencia de Ingresos</h3>
        <div className="h-64 w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400">Cargando...</div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" tickFormatter={formatXAxisLabel} stroke="#9CA3AF" fontSize={12} />
                <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(val) => `$${fmtNum(val)}`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F3F4F6' }} />
                <Bar dataKey="nuevo" stackId="a" fill="#3B82F6" barSize={30} name="Nuevo" />
                <Bar dataKey="renovacion" stackId="a" fill="#10B981" radius={[4, 4, 0, 0]} barSize={30} name="Renovacion" />
                <Line dataKey="lastYear" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Año anterior" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Sin datos</div>
          )}
        </div>
      </div>

      {/* Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: 'Pais', data: distributionData.countryChart, offset: 0 },
          { title: 'Plan', data: distributionData.planChart, offset: 0 },
          { title: 'Medio de Pago', data: distributionData.providerChart, offset: 2 },
          { title: 'Categoria', data: distributionData.categoryChart, offset: 4 },
        ].map((chart, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-700 mb-4">{chart.title}</h3>
            <div className="h-52 w-full text-xs">
              {chart.data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chart.data} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={5} dataKey="value" label={renderCustomizedLabel} labelLine={false}>
                      {chart.data.map((_e: any, i: number) => (
                        <Cell key={`cell-${i}`} fill={COLORS[(i + chart.offset) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number | string) => fmtUSD(typeof value === 'number' ? value : Number(value))} />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">Sin datos</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <CalendarDaysIcon className="w-4 h-4 text-gray-400" /> Detalle de Operaciones
          </h3>
          <span className="text-xs text-gray-400">Total: {fmtNum(totalRecords)}</span>
        </div>

        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div><p className="text-gray-500">Cargando...</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3">ID / Usuario</th>
                  <th className="px-6 py-3">Pais</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Tipo</th>
                  <th className="px-6 py-3">Categoria</th>
                  <th className="px-6 py-3 text-right">Monto</th>
                  <th className="px-6 py-3 text-right">Original</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.length > 0 ? orders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString()}
                      <span className="block text-xs text-gray-400">{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-900 truncate max-w-[150px]" title={o.external_id}>
                      {o.user_bubble_id || 'Anon'}
                      <span className="block text-xs text-gray-400 font-normal truncate">{o.external_id}</span>
                    </td>
                    <td className="px-6 py-3"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{o.country}</span></td>
                    <td className="px-6 py-3 text-gray-600">
                      <div className="font-medium text-gray-900">{o.plan_duration || o.product_name}</div>
                      <div className="text-xs text-gray-400">{o.provider}</div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${(o.client_type || o.plan_type || '').toLowerCase().includes('nuevo') ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                        {o.client_type || o.plan_type || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${(o.plan_category || '').toLowerCase().includes('suscri') ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700'}`}>
                        {o.plan_category || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-gray-900">{fmtUSD(o.amount_usd)}</td>
                    <td className="px-6 py-3 text-right text-gray-400 text-xs whitespace-nowrap">{fmtNum(o.amount_nominal)} {o.currency_nominal}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No se encontraron ventas.</td></tr>
                )}
              </tbody>
            </table>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Mostrar:</span>
                <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="border-gray-300 rounded text-sm py-1 px-2">
                  <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                </select>
                <span>de {fmtNum(totalRecords)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} className={`p-2 rounded-md border ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-100'}`}><ChevronLeftIcon className="w-4 h-4" /></button>
                <span className="text-sm text-gray-600 font-medium">Pagina {currentPage} de {totalPages || 1}</span>
                <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages || totalPages === 0} className={`p-2 rounded-md border ${currentPage === totalPages || totalPages === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-100'}`}><ChevronRightIcon className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
