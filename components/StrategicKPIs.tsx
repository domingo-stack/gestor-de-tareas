'use client'

import React, { useMemo } from 'react'

interface Transaction {
  transaction_date: string;
  amount_usd: number;
  is_fixed_expense?: boolean;
  is_cac_related?: boolean;
  type?: string; // income / expense
  fin_categories?: { type: string } | null; // Dependiendo de tu estructura exacta
}

interface Account {
  balance: number;
  currency: string;
}

interface MonthlyMetric {
  month_date: string;
  new_customers_count: number;
}

interface Props {
  transactions: Transaction[];
  accounts: Account[];
  metrics: MonthlyMetric[];
}

// Recibimos 'allTransactions' además de las props normales
// CAMBIO CLAVE: Agregamos " = []" para poner un valor por defecto si viene vacío
export default function StrategicKPIs({ transactions, allTransactions = [], accounts, metrics }: any) {

  // ---------------------------------------------------------
  // 1. CÁLCULO DE RUNWAY (Usa allTransactions - SIEMPRE FIJO)
  // ---------------------------------------------------------
  const { runway, monthlyBurn, totalCash } = useMemo(() => {
    // A. Calculamos la Caja Total (Sumando USD y PEN/3.75)
    const cash = accounts.reduce((acc: number, curr: any) => {
        // Ajusta tu tasa de cambio si es distinta a 3.75
        const val = curr.currency === 'USD' ? Number(curr.balance) : Number(curr.balance) / 3.75;
        return acc + (val || 0);
    }, 0);

    // B. Definimos el rango de "Últimos 3 Meses" respecto a HOY
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);

    // C. Filtramos gastos fijos de los últimos 3 meses REALES
    const recentFixedExpenses = (allTransactions || []).filter((t: any) => {
      const tDate = new Date(t.transaction_date);
        
        // Criterios:
        // 1. Que sea gasto (type expense)
        // 2. Que sea "Fixed Expense" (usamos tu columna is_fixed_expense)
        //    (Si no usas esa columna aún, quita esa parte del if y usa solo 'expense')
        // 3. Que haya ocurrido en los últimos 90 días
        return (
            t.fin_categories?.type === 'expense' &&
            t.is_fixed_expense === true && // <--- IMPORTANTE: Solo gastos fijos estructurales
            tDate >= threeMonthsAgo &&
            tDate <= now
        );
    });

    // D. Sumamos todo y dividimos por 3 para el promedio mensual
    const totalBurn3Months = recentFixedExpenses.reduce((sum: number, t: any) => sum + Number(t.amount_usd), 0);
    const burn = totalBurn3Months / 3; // Promedio mensual

    // E. Resultado
    return {
        totalCash: cash,
        monthlyBurn: burn,
        runway: burn > 0 ? cash / burn : 999 // 999 si no hay gastos (infinito)
    };
  }, [allTransactions, accounts]); // Depende de TODA la historia, no del filtro


  // ---------------------------------------------------------
  // 2. CÁLCULO DE CAC (Usa transactions - OBEDECE AL FILTRO)
  // ---------------------------------------------------------
  const { cac, marketingSpend, newCustomers } = useMemo(() => {
    // A. Inversión MKT (Del periodo filtrado)
    const spend = transactions
      .filter((t: any) => t.is_cac_related === true)
      .reduce((sum: number, t: any) => sum + (Number(t.amount_usd) || 0), 0);

    // B. Clientes Nuevos (Del periodo filtrado)
    if (transactions.length === 0) return { cac: 0, marketingSpend: 0, newCustomers: 0 };

    const dates = transactions.map((t: any) => new Date(t.transaction_date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    const customers = metrics
      .filter((m: any) => {
        const mDate = new Date(m.month_date);
        return mDate >= minDate && mDate <= maxDate;
      })
      .reduce((sum: number, m: any) => sum + (Number(m.new_customers_count) || 0), 0);

    return {
        marketingSpend: spend,
        newCustomers: customers,
        cac: customers > 0 ? spend / customers : 0
    };
  }, [transactions, metrics]); // Depende del FILTRO actual


  // ---------------------------------------------------------
  // 3. RENDERIZADO
  // ---------------------------------------------------------
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      
      {/* CARD RUNWAY */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
            <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Runway (Vida Estructural)</h3>
                <div className="flex items-baseline gap-2">
                    <span className={`text-4xl font-extrabold ${runway < 3 ? 'text-red-500' : 'text-gray-900'}`}>
                        {runway >= 99 ? '∞' : runway.toFixed(1)}
                    </span>
                    <span className="text-sm text-gray-500 font-medium">meses</span>
                </div>
            </div>
            <div className={`p-3 rounded-full ${runway > 6 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
        </div>
        <div className="mt-4 flex justify-between text-xs text-gray-500 border-t pt-3">
             <span>Caja Total: <strong>${new Intl.NumberFormat('en-US').format(totalCash)}</strong></span>
             <span className="text-red-500">Burn Fijo (3m): <strong>${new Intl.NumberFormat('en-US').format(monthlyBurn)}/mes</strong></span>
        </div>
      </div>

      {/* CARD CAC */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
            <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">CAC (Costo Adquisición)</h3>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold text-gray-900">
                        ${cac.toFixed(2)}
                    </span>
                    <span className="text-sm text-gray-500 font-medium">/ cliente</span>
                </div>
            </div>
            <div className="p-3 rounded-full bg-indigo-50 text-indigo-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
        </div>
        <div className="mt-4 flex justify-between text-xs text-gray-500 border-t pt-3">
             <span className="text-blue-600">Inv. Marketing: <strong>${new Intl.NumberFormat('en-US').format(marketingSpend)}</strong></span>
             <span>Nuevos Clientes: <strong>{newCustomers}</strong></span>
        </div>
      </div>
    </div>
  );
}