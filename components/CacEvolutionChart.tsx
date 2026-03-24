'use client'

import React, { useMemo } from 'react'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

interface Transaction {
  transaction_date: string;
  amount_usd: number;
  is_cac_related?: boolean;
  fin_categories?: { type: string } | null;
}

interface MonthlyMetric {
  month_date: string;
  new_customers_count: number;
}

interface AutoCustomerEntry {
  month: string;
  count: number;
}

interface Props {
  transactions: Transaction[];
  metrics: MonthlyMetric[];
  autoCustomers?: AutoCustomerEntry[];
}

export default function CacEvolutionChart({ transactions, metrics, autoCustomers = [] }: Props) {

  const data = useMemo(() => {
    const monthMap: Record<string, { spend: number, customers: number }> = {};
    const getMonthKey = (dateStr: string) => dateStr.substring(0, 7);

    // Procesar GASTO (Numerador)
    transactions.forEach(t => {
      const isExpense = t.fin_categories?.type === 'expense';
      if (isExpense && t.is_cac_related) {
        const key = getMonthKey(t.transaction_date);
        if (!monthMap[key]) monthMap[key] = { spend: 0, customers: 0 };
        monthMap[key].spend += Number(t.amount_usd);
      }
    });

    // Procesar CLIENTES — manual override takes priority, then auto
    const manualMap = new Map<string, number>();
    metrics.forEach(m => {
      if (m.new_customers_count > 0) {
        manualMap.set(getMonthKey(m.month_date), m.new_customers_count);
      }
    });

    const autoMap = new Map<string, number>();
    autoCustomers.forEach(ac => {
      autoMap.set(ac.month, ac.count);
    });

    // Merge all months
    const allMonths = new Set([...Object.keys(monthMap), ...manualMap.keys(), ...autoMap.keys()]);
    for (const month of allMonths) {
      if (!monthMap[month]) monthMap[month] = { spend: 0, customers: 0 };
      // Manual override > auto > 0
      if (manualMap.has(month)) {
        monthMap[month].customers = manualMap.get(month)!;
      } else if (autoMap.has(month)) {
        monthMap[month].customers = autoMap.get(month)!;
      }
    }

    return Object.entries(monthMap)
      .map(([month, val]) => {
        // Evitar división por cero
        const cac = val.customers > 0 ? val.spend / val.customers : 0;
        return {
          month, // "2024-02"
          spend: val.spend,
          customers: val.customers,
          cac: parseFloat(cac.toFixed(2)),
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month)) // Ordenar cronológicamente
      .slice(-12);
  }, [transactions, metrics, autoCustomers]);

  if (data.length === 0) {
    return <div className="p-8 text-center text-gray-400 border rounded-xl bg-gray-50">No hay suficientes datos de Marketing o Clientes para graficar.</div>;
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-6">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Evolución de Eficiencia (CAC)</h3>
        <p className="text-xs text-gray-500">Relación entre Inversión en Marketing y Costo por Cliente.</p>
      </div>

      <div className="h-[300px] w-full text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid stroke="#f3f4f6" vertical={false} />
            <XAxis 
              dataKey="month" 
              tickFormatter={(val) => {
                // Formato "Feb 24"
                const [y, m] = val.split('-');
                const date = new Date(parseInt(y), parseInt(m)-1);
                return date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
              }}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af' }}
              dy={10}
            />
            
            {/* Eje Y Izquierdo: Dinero (Spend & CAC) */}
            <YAxis 
              yAxisId="left"
              tickFormatter={(val) => `$${val}`}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af' }}
            />
            
            {/* Eje Y Derecho: CAC */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(val) => `$${val}`}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#2563eb' }}
            />

<Tooltip 
  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
  // CORRECCIÓN AQUÍ: Usamos 'any' para evitar el conflicto de tipos de Recharts
  formatter={(value: any, name: any) => {
    // Nos aseguramos de que sea número antes de formatear
    const val = Number(value); 
    if (name === 'Inversión Mkt') return [`$${val.toLocaleString()}`, name];
    if (name === 'CAC') return [`$${val.toLocaleString()}`, name];
    return [val, name];
  }}
  labelFormatter={(label) => {
      const [y, m] = label.split('-');
      // Validación extra por seguridad
      if(!y || !m) return label; 
      return new Date(parseInt(y), parseInt(m)-1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }}
/>
            
            <Legend wrapperStyle={{ paddingTop: '20px' }} />

            {/* Barras: Inversión Total (Fondo) */}
            <Bar 
              yAxisId="left"
              dataKey="spend" 
              name="Inversión Mkt" 
              barSize={30} 
              fill="#dbeafe" // blue-100
              radius={[4, 4, 0, 0]} 
            />

            {/* Línea: CAC (Protagonista) — eje derecho con su propia escala */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cac"
              name="CAC" 
              stroke="#2563eb" // blue-600
              strokeWidth={3}
              dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6 }}
            />

          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}