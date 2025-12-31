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

export default function StrategicKPIs({ transactions, accounts, metrics }: Props) {

  // --- 1. CÁLCULO DE RUNWAY (Supervivencia) ---
  const runwayData = useMemo(() => {
    // A. Total Cash Disponible (Suma simple de balances)
    // Nota: Idealmente deberías normalizar monedas si tienes mezcladas, 
    // pero para MVP sumamos nominalmente si son mayoritariamente USD/Moneda Base.
    const totalCash = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    // B. Burn Rate Estructural (Solo Gastos Fijos, últimos 3 meses)
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);

    const fixedExpensesLast3Months = transactions.filter(t => {
      const tDate = new Date(t.transaction_date);
      // Validar que sea Gasto, que sea Fijo y esté en fecha
      const isExpense = t.fin_categories?.type === 'expense' || t.amount_usd < 0; // Ajusta según tu lógica de gasto
      return isExpense && t.is_fixed_expense && tDate >= threeMonthsAgo && tDate <= now;
    });

    const totalFixedBurn3Months = fixedExpensesLast3Months.reduce((sum, t) => sum + Number(t.amount_usd), 0);
    const monthlyFixedBurn = totalFixedBurn3Months / 3;

    // C. El Cálculo Final
    const monthsLeft = monthlyFixedBurn > 0 ? totalCash / monthlyFixedBurn : 99; // 99 = Infinito/Indefinido

    return { totalCash, monthlyFixedBurn, monthsLeft };
  }, [transactions, accounts]);


  // --- 2. CÁLCULO DE CAC (Eficiencia) ---
  const cacData = useMemo(() => {
    // Usamos YTD (Year to Date) para suavizar estacionalidad
    const currentYear = new Date().getFullYear();

    // A. Total Inversión Marketing (YTD)
    const marketingSpendYTD = transactions
      .filter(t => {
        const tYear = new Date(t.transaction_date).getFullYear();
        const isExpense = t.fin_categories?.type === 'expense';
        return isExpense && t.is_cac_related && tYear === currentYear;
      })
      .reduce((sum, t) => sum + Number(t.amount_usd), 0);

    // B. Total Nuevos Clientes (YTD)
    const newCustomersYTD = metrics
      .filter(m => new Date(m.month_date).getFullYear() === currentYear)
      .reduce((sum, m) => sum + m.new_customers_count, 0);

    // C. El Cálculo Final
    const cac = newCustomersYTD > 0 ? marketingSpendYTD / newCustomersYTD : 0;

    return { marketingSpendYTD, newCustomersYTD, cac };
  }, [transactions, metrics]);


  // --- FORMATTERS ---
  const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      
      {/* WIDGET 1: RUNWAY */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:border-orange-300 transition-colors">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20">
          <span className="text-6xl">🛡️</span>
        </div>
        
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Runway (Vida Estructural)</h3>
        
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-bold ${runwayData.monthsLeft < 6 ? 'text-red-500' : 'text-gray-800'}`}>
            {runwayData.monthsLeft >= 99 ? '∞' : fmtNum(runwayData.monthsLeft)}
          </span>
          <span className="text-gray-500 font-medium">meses</span>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500">
          <div>
            <span className="block font-bold text-gray-700">{fmtUSD(runwayData.totalCash)}</span>
            Caja Total
          </div>
          <div className="text-right">
            <span className="block font-bold text-orange-600">{fmtUSD(runwayData.monthlyFixedBurn)}/mes</span>
            Burn Fijo (Prom. 3m)
          </div>
        </div>
      </div>

      {/* WIDGET 2: CAC */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-colors">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20">
          <span className="text-6xl">🎯</span>
        </div>

        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">CAC (Costo Adquisición YTD)</h3>
        
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-gray-800">
            {fmtUSD(cacData.cac)}
          </span>
          <span className="text-gray-400 text-sm">/ cliente</span>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500">
          <div>
            <span className="block font-bold text-blue-600">{fmtUSD(cacData.marketingSpendYTD)}</span>
            Inv. Marketing (YTD)
          </div>
          <div className="text-right">
            <span className="block font-bold text-gray-700">{cacData.newCustomersYTD}</span>
            Nuevos Clientes
          </div>
        </div>
      </div>

    </div>
  )
}