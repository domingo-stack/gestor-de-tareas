'use client'

import React from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';

interface FinancialChartsProps {
  data: any;
}

export default function FinancialCharts({ data }: FinancialChartsProps) {
  
  if (!data || !data.sortedMonths || data.sortedMonths.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
        No hay datos suficientes para graficar.
      </div>
    );
  }

  // 1. Transformación de datos
  const chartData = data.sortedMonths.map((month: string) => {
    const getSectionTotal = (key: string) => {
      const section = data.matrix[key];
      if (!section) return 0;
      return Object.values(section).reduce((sum: number, item: any) => {
        const val = Number(item[month]); 
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
    };

    const income = getSectionTotal('REVENUE');
    const cogs = getSectionTotal('COGS');
    const opex = getSectionTotal('OPEX');
    const tax = getSectionTotal('TAX');
    
    const totalExpense = cogs + opex + tax;
    const netIncome = income - totalExpense;
    const netMargin = income > 0 ? (netIncome / income) * 100 : 0;

    return {
      month,
      income,
      totalExpense,
      cogs,
      opex,
      tax,
      netIncome,
      netMargin: parseFloat(netMargin.toFixed(1))
    };
  });

  // Formatters
  const formatYAxis = (value: number) => {
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`; // Ej: $1k
    return `$${value}`;
  };

  const tooltipFormatter = (value: any) => {
    if (typeof value === 'number') {
      return [`$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, ''];
    }
    return [value, ''];
  };

  const marginTooltipFormatter = (value: any) => {
    if (typeof value === 'number') return [`${value}%`, 'Margen Neto'];
    return [value, ''];
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      
      {/* GRÁFICO 1: LINEAS (Ingresos vs Gastos) */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-80">
        <h3 className="text-sm font-bold text-gray-700 mb-4">📈 Evolución: Ingresos vs. Egresos</h3>
        <ResponsiveContainer width="100%" height="100%">
          {/* Ajusté los márgenes (left: 10, right: 30) para que quepan los textos */}
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 11, fill: '#6b7280' }} 
              tickLine={false} 
              axisLine={false} 
              tickFormatter={(val) => val.substring(5)} 
              dy={10} // Baja un poco el texto del eje X
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#6b7280' }} 
              tickLine={false} 
              axisLine={false} 
              tickFormatter={formatYAxis} 
              width={40} // Ancho fijo para que no se corte
            />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={tooltipFormatter}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
            <Line type="monotone" dataKey="income" name="Ingresos" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="totalExpense" name="Gastos" stroke="#ef4444" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* GRÁFICO 2: ÁREA (Estructura de Costos) */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-80">
        <h3 className="text-sm font-bold text-gray-700 mb-4">🏗️ Estructura de Costos</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 11, fill: '#6b7280' }} 
              tickLine={false} axisLine={false} 
              tickFormatter={(val) => val.substring(5)}
              dy={10}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#6b7280' }} 
              tickLine={false} axisLine={false} 
              tickFormatter={formatYAxis}
              width={40}
            />
            <Tooltip formatter={tooltipFormatter} />
            <Legend iconType="rect" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
            <Area type="monotone" dataKey="cogs" name="COGS" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
            <Area type="monotone" dataKey="opex" name="OpEx" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
            <Area type="monotone" dataKey="tax" name="Tax" stackId="1" stroke="#6b7280" fill="#6b7280" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* GRÁFICO 3: MARGEN NETO (Recuperado y Ajustado) */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-72 lg:col-span-2">
        <h3 className="text-sm font-bold text-gray-700 mb-4">⚡ Eficiencia: Margen Neto (%)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <ReferenceLine y={0} stroke="#000" strokeDasharray="3 3" opacity={0.3} />
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 11, fill: '#6b7280' }} 
              tickLine={false} axisLine={false} 
              dy={10}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#6b7280' }} 
              tickLine={false} axisLine={false} 
              unit="%" 
              width={40}
            />
            <Tooltip formatter={marginTooltipFormatter} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
            <Line 
              type="monotone" 
              dataKey="netMargin" 
              name="Margen Neto %" 
              stroke="#6366f1" // Indigo
              strokeWidth={3} 
              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
              activeDot={{ r: 6 }} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}