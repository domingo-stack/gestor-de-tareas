'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import {
  BanknotesIcon,
  CreditCardIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
} from '@heroicons/react/24/outline';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { toast } from 'sonner';
import KpiCard from './KpiCard';
import GrowthFilters from './GrowthFilters';
import WeekSelector, { getCurrentWeekStart } from './WeekSelector';
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
type DateMode = 'week' | 'this_month' | 'custom';

type Granularity = 'daily' | 'weekly' | 'monthly';
const GRANULARITY_OPTIONS: { label: string; value: Granularity }[] = [
  { label: 'Diario', value: 'daily' },
  { label: 'Semanal', value: 'weekly' },
  { label: 'Mensual', value: 'monthly' },
];

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

const PROVIDER_OPTIONS = ['Stripe', 'Dlocal', 'MercadoPago', 'Paypal', 'Manual'];
const CLIENT_TYPE_OPTIONS = ['Nuevo', 'Renovacion'];

type SortColumn = 'created_at' | 'country' | 'amount_usd';
type SortDirection = 'asc' | 'desc';

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
  const { supabase, user } = useAuth();
  const { role } = usePermissions();

  // Date mode
  const [dateMode, setDateMode] = useState<DateMode>('week');
  const [weekStart, setWeekStart] = useState<Date>(getCurrentWeekStart);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [granularity, setGranularity] = useState<Granularity>('daily');

  // Filters
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

  // Dynamic options
  const [planOptions, setPlanOptions] = useState<string[]>([]);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<RevenueOrder>>({});
  const [saving, setSaving] = useState(false);

  const canEdit = role === 'superadmin' || user?.email === 'domingo@califica.ai';

  // Fetch dynamic plan + country options
  useEffect(() => {
    if (!supabase) return;

    // Plans: from growth_users.plan_id + rev_orders.product_name
    Promise.all([
      supabase.from('growth_users').select('plan_id').not('plan_id', 'is', null).eq('plan_paid', true),
      supabase.from('rev_orders').select('product_name').not('product_name', 'is', null),
    ]).then(([guRes, roRes]) => {
      const plans = new Set<string>();
      (guRes.data || []).forEach((r: any) => { if (r.plan_id) plans.add(r.plan_id); });
      (roRes.data || []).forEach((r: any) => { if (r.product_name) plans.add(r.product_name); });
      setPlanOptions([...plans].sort());
    });

    // Countries: from rev_orders
    supabase.from('rev_orders').select('country').not('country', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map((r: any) => r.country).filter(Boolean))].sort();
          setCountryOptions(unique);
        }
      });
  }, [supabase]);

  // Sync status
  useEffect(() => {
    if (!supabase) return;
    supabase.from('sync_logs').select('*').eq('source', 'n8n').order('created_at', { ascending: false }).limit(1).single()
      .then(({ data }) => {
        if (data) setSyncStatus({ date: data.created_at, count: data.records_processed });
      });
  }, []);

  // Compute date range from mode
  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    if (dateMode === 'week') {
      start = new Date(weekStart);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (dateMode === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
    } else {
      // custom
      if (!customStart || !customEnd) return null;
      start = new Date(`${customStart}T00:00:00`);
      end = new Date(`${customEnd}T23:59:59`);
    }

    const duration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - duration);
    const prevEnd = new Date(end.getTime() - duration);
    const lastYearStart = new Date(start); lastYearStart.setFullYear(start.getFullYear() - 1);
    const lastYearEnd = new Date(end); lastYearEnd.setFullYear(end.getFullYear() - 1);

    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      prevStartIso: prevStart.toISOString(),
      prevEndIso: prevEnd.toISOString(),
      lastYearStartIso: lastYearStart.toISOString(),
      lastYearEndIso: lastYearEnd.toISOString(),
    };
  };

  // Main fetch
  useEffect(() => {
    if (!supabase) return;
    const dates = getDateRange();
    if (!dates) { setLoading(false); return; }

    const fetchData = async () => {
      try {
        setLoading(true);
        const { startIso, endIso, prevStartIso, prevEndIso, lastYearStartIso, lastYearEndIso } = dates;

        const buildQuery = (s: string, e: string) => {
          let q = supabase.from('rev_orders').select('*', { count: 'exact' }).gte('created_at', s).lte('created_at', e);
          if (selectedCountries.length > 0) q = q.in('country', selectedCountries);
          if (selectedPlan !== 'all') q = q.or(`product_name.ilike.%${selectedPlan}%,plan_duration.ilike.%${selectedPlan}%`);
          if (selectedProviders.length > 0) q = q.in('provider', selectedProviders);
          if (selectedTypes.length > 0) q = q.in('client_type', selectedTypes);
          if (searchTerm) q = q.or(`external_id.ilike.%${searchTerm}%,user_bubble_id.ilike.%${searchTerm}%`);
          return q;
        };

        const from = (currentPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        const [allDataRes, prevDataRes, lastYearRes, tableDataRes] = await Promise.all([
          buildQuery(startIso, endIso).order('created_at', { ascending: true }),
          buildQuery(prevStartIso, prevEndIso),
          buildQuery(lastYearStartIso, lastYearEndIso),
          buildQuery(startIso, endIso).order(sortColumn, { ascending: sortDirection === 'asc' }).range(from, to),
        ]);

        if (allDataRes.error) throw allDataRes.error;
        if (tableDataRes.error) throw tableDataRes.error;

        const data = allDataRes.data || [];
        const prevData = prevDataRes.data || [];

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
  }, [dateMode, weekStart, refreshTrigger, selectedPlan, searchTerm, selectedCountries, selectedProviders, selectedTypes, currentPage, itemsPerPage, sortColumn, sortDirection]);

  // Chart data with granularity
  const chartData = useMemo(() => {
    if (!allData.length) return [];

    const bucketMap = new Map<string, { date: string; total: number; nuevo: number; renovacion: number; lastYear: number }>();

    const lastYearBuckets = new Map<string, number>();
    lastYearData.forEach((order) => {
      const d = new Date(order.created_at);
      d.setFullYear(d.getFullYear() + 1);
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
        bucketMap.set(key, { date: key, total: 0, nuevo: 0, renovacion: 0, lastYear: 0 });
      }
      const entry = bucketMap.get(key)!;
      const amt = order.amount_usd || 0;
      entry.total += amt;

      const tipo = (order.client_type || order.plan_type || '').toLowerCase().trim();
      if (tipo.includes('nuevo')) entry.nuevo += amt;
      else if (tipo.includes('renova')) entry.renovacion += amt;
    });

    bucketMap.forEach((entry, key) => {
      entry.lastYear = lastYearBuckets.get(key) || 0;
    });

    return Array.from(bucketMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [allData, lastYearData, granularity]);

  // Distribution data (no category)
  const distributionData = useMemo(() => {
    const byCountry: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    const byProvider: Record<string, number> = {};

    allData.forEach((item) => {
      const amt = item.amount_usd || 0;
      byCountry[item.country || 'Unknown'] = (byCountry[item.country || 'Unknown'] || 0) + amt;
      byPlan[item.plan_duration || item.product_name || 'Unknown'] = (byPlan[item.plan_duration || item.product_name || 'Unknown'] || 0) + amt;
      byProvider[item.provider || 'Unknown'] = (byProvider[item.provider || 'Unknown'] || 0) + amt;
    });

    const toArray = (obj: Record<string, number>) => Object.entries(obj).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    let countryArr = toArray(byCountry);
    if (countryArr.length > 5) {
      const top5 = countryArr.slice(0, 5);
      const rest = countryArr.slice(5).reduce((s, i) => s + i.value, 0);
      if (rest > 0) countryArr = [...top5, { name: 'Otros', value: rest }];
    }

    return { countryChart: countryArr, planChart: toArray(byPlan), providerChart: toArray(byProvider) };
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
          {data.lastYear > 0 && (
            <div className="flex justify-between items-center border-t border-gray-100 pt-1.5 mt-1">
              <div className="flex items-center"><span className="w-3 h-0.5 bg-gray-400 mr-2" style={{ borderTop: '2px dashed #9CA3AF', background: 'none' }}></span><span className="text-gray-500">Ano anterior</span></div>
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

  // Sort handler
  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection(col === 'created_at' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ChevronUpDownIcon className="w-3.5 h-3.5 text-gray-300 ml-1 inline" />;
    return sortDirection === 'asc'
      ? <ChevronUpIcon className="w-3.5 h-3.5 text-blue-600 ml-1 inline" />
      : <ChevronDownIcon className="w-3.5 h-3.5 text-blue-600 ml-1 inline" />;
  };

  // Inline edit handlers
  const startEditing = (order: RevenueOrder) => {
    setEditingId(order.id);
    setEditForm({
      country: order.country,
      plan_duration: order.plan_duration,
      product_name: order.product_name,
      client_type: order.client_type,
      amount_usd: order.amount_usd,
      amount_nominal: order.amount_nominal,
      currency_nominal: order.currency_nominal,
      provider: order.provider,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (orderId: string) => {
    if (!supabase) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('rev_orders').update({
        country: editForm.country,
        plan_duration: editForm.plan_duration,
        product_name: editForm.product_name,
        client_type: editForm.client_type,
        amount_usd: editForm.amount_usd,
        amount_nominal: editForm.amount_nominal,
        currency_nominal: editForm.currency_nominal,
        provider: editForm.provider,
      }).eq('id', orderId);

      if (error) throw error;

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...editForm } as RevenueOrder : o));
      toast.success('Orden actualizada correctamente');
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      console.error('Error updating order:', err);
      toast.error('Error al actualizar la orden');
    } finally {
      setSaving(false);
    }
  };

  // Distribution block component (table + pie side by side)
  const DistributionBlock = ({ title, data, colorOffset }: { title: string; data: { name: string; value: number }[]; colorOffset: number }) => {
    const total = data.reduce((s, i) => s + i.value, 0);
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-700 mb-4">{title}</h3>
        {data.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="overflow-y-auto max-h-56">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b">
                    <th className="text-left py-1.5 font-medium">Nombre</th>
                    <th className="text-right py-1.5 font-medium">Monto</th>
                    <th className="text-right py-1.5 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, i) => (
                    <tr key={item.name} className="border-b border-gray-50">
                      <td className="py-1.5 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[(i + colorOffset) % COLORS.length] }} />
                        <span className="text-gray-700 truncate">{item.name}</span>
                      </td>
                      <td className="text-right py-1.5 text-gray-900 font-medium">{fmtUSD(item.value)}</td>
                      <td className="text-right py-1.5 text-gray-500">{total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-56 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={75} paddingAngle={4} dataKey="value" label={renderCustomizedLabel} labelLine={false}>
                    {data.map((_e: any, i: number) => (
                      <Cell key={`cell-${i}`} fill={COLORS[(i + colorOffset) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number | string) => fmtUSD(typeof value === 'number' ? value : Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-400">Sin datos</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
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
          {/* Date mode toggle */}
          <div className="bg-white p-1 rounded-lg border border-gray-200 flex gap-1 shadow-sm">
            <button onClick={() => { setDateMode('week'); setCurrentPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateMode === 'week' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
              Semana
            </button>
            <button onClick={() => { setDateMode('this_month'); setCurrentPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateMode === 'this_month' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
              Este Mes
            </button>
            <button onClick={() => { setDateMode('custom'); setCurrentPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateMode === 'custom' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
              Personalizado
            </button>
          </div>
        </div>
      </div>

      {/* WeekSelector (only in week mode) */}
      {dateMode === 'week' && (
        <div className="flex justify-center">
          <WeekSelector weekStart={weekStart} onWeekChange={(d) => { setWeekStart(d); setCurrentPage(1); }} />
        </div>
      )}

      {/* Custom date range */}
      {dateMode === 'custom' && (
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
        planOptions={planOptions}
        countryOptions={countryOptions}
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
                <Line dataKey="lastYear" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Ano anterior" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Sin datos</div>
          )}
        </div>
      </div>

      {/* Distributions — Table + Pie side by side (3 blocks, no category) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistributionBlock title="Pais" data={distributionData.countryChart} colorOffset={0} />
        <DistributionBlock title="Plan" data={distributionData.planChart} colorOffset={0} />
        <DistributionBlock title="Medio de Pago" data={distributionData.providerChart} colorOffset={2} />
      </div>

      {/* Detail table (no category column) */}
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
                  <th className="px-6 py-3 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('created_at')}>
                    Fecha <SortIcon col="created_at" />
                  </th>
                  <th className="px-6 py-3">ID / Usuario</th>
                  <th className="px-6 py-3 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('country')}>
                    Pais <SortIcon col="country" />
                  </th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Tipo</th>
                  <th className="px-6 py-3 text-right cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('amount_usd')}>
                    Monto <SortIcon col="amount_usd" />
                  </th>
                  <th className="px-6 py-3 text-right">Original</th>
                  {canEdit && <th className="px-4 py-3 w-20"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.length > 0 ? orders.map((o) => {
                  const isEditing = editingId === o.id;

                  if (isEditing) {
                    return (
                      <tr key={o.id} className="bg-blue-50/50">
                        <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(o.created_at).toLocaleDateString()}
                          <span className="block text-xs text-gray-400">{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-900 truncate max-w-[150px]" title={o.external_id}>
                          {o.user_bubble_id || 'Anon'}
                          <span className="block text-xs text-gray-400 font-normal truncate">{o.external_id}</span>
                        </td>
                        <td className="px-6 py-2">
                          <input type="text" value={editForm.country || ''} onChange={(e) => setEditForm(prev => ({ ...prev, country: e.target.value }))} className="w-24 border border-gray-300 rounded px-2 py-1 text-xs" />
                        </td>
                        <td className="px-6 py-2">
                          <input type="text" value={editForm.plan_duration || ''} onChange={(e) => setEditForm(prev => ({ ...prev, plan_duration: e.target.value }))} className="w-20 border border-gray-300 rounded px-2 py-1 text-xs" placeholder="Duracion" />
                          <select value={editForm.provider || ''} onChange={(e) => setEditForm(prev => ({ ...prev, provider: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs mt-1">
                            <option value="">Proveedor</option>
                            {PROVIDER_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-6 py-2">
                          <select value={editForm.client_type || ''} onChange={(e) => setEditForm(prev => ({ ...prev, client_type: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs">
                            <option value="">-</option>
                            {CLIENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-6 py-2 text-right">
                          <input type="number" step="0.01" value={editForm.amount_usd ?? ''} onChange={(e) => setEditForm(prev => ({ ...prev, amount_usd: parseFloat(e.target.value) || 0 }))} className="w-20 border border-gray-300 rounded px-2 py-1 text-xs text-right" />
                        </td>
                        <td className="px-6 py-2 text-right">
                          <input type="number" step="0.01" value={editForm.amount_nominal ?? ''} onChange={(e) => setEditForm(prev => ({ ...prev, amount_nominal: parseFloat(e.target.value) || 0 }))} className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-right" />
                          <input type="text" value={editForm.currency_nominal || ''} onChange={(e) => setEditForm(prev => ({ ...prev, currency_nominal: e.target.value }))} className="w-12 border border-gray-300 rounded px-2 py-1 text-xs mt-1" placeholder="USD" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => saveEdit(o.id)} disabled={saving} className="p-1 rounded hover:bg-green-100 text-green-600 disabled:opacity-50" title="Guardar">
                              <CheckIcon className="w-4 h-4" />
                            </button>
                            <button onClick={cancelEditing} className="p-1 rounded hover:bg-red-100 text-red-500" title="Cancelar">
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={o.id} className="hover:bg-gray-50 transition-colors group">
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
                      <td className="px-6 py-3 text-right font-bold text-gray-900">{fmtUSD(o.amount_usd)}</td>
                      <td className="px-6 py-3 text-right text-gray-400 text-xs whitespace-nowrap">{fmtNum(o.amount_nominal)} {o.currency_nominal}</td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <button onClick={() => startEditing(o)} className="p-1 rounded hover:bg-gray-200 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Editar">
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={canEdit ? 8 : 7} className="px-6 py-12 text-center text-gray-400">No se encontraron ventas.</td></tr>
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
