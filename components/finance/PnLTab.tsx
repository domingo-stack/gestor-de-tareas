'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { Transaction, PnLData } from '@/lib/finance-types';
import FinancialCharts from '@/components/FinancialCharts';
import PnLSection from './PnLSection';

const PREPAGO_NAMES = ['1 mes', '3 meses', '6 meses', '12 meses'];

function classifyPlan(productName: string | null | undefined): 'Ingresos Suscripción' | 'Ingresos Prepago' {
  if (!productName) return 'Ingresos Suscripción';
  return PREPAGO_NAMES.includes(productName.toLowerCase())
    ? 'Ingresos Prepago'
    : 'Ingresos Suscripción';
}

interface PnLTabProps {
  filteredTransactions: Transaction[];
  dateRangeISO: { start: string; end: string };
}

interface RevOrder {
  amount_usd: number;
  product_name: string;
  created_at: string;
}

export default function PnLTab({ filteredTransactions, dateRangeISO }: PnLTabProps) {
  const { supabase } = useAuth();
  const [revOrders, setRevOrders] = useState<RevOrder[]>([]);

  useEffect(() => {
    async function fetchRevOrders() {
      const { data } = await supabase
        .from('rev_orders')
        .select('amount_usd, product_name, created_at')
        .gte('created_at', `${dateRangeISO.start}T00:00:00`)
        .lte('created_at', `${dateRangeISO.end}T23:59:59`);
      setRevOrders(data || []);
    }
    fetchRevOrders();
  }, [supabase, dateRangeISO.start, dateRangeISO.end]);

  const pnlData: PnLData = useMemo(() => {
    const monthsSet = new Set<string>();
    filteredTransactions.forEach((tx) => monthsSet.add(tx.transaction_date.substring(0, 7)));

    // Also add months from rev_orders
    revOrders.forEach((o) => monthsSet.add(o.created_at.substring(0, 7)));

    const sortedMonths = Array.from(monthsSet).sort();

    const matrix: Record<string, Record<string, Record<string, number>>> = {};
    const detailMatrix: Record<string, Record<string, Record<string, Record<string, number>>>> = {};

    // Process fin_transactions
    filteredTransactions.forEach((tx) => {
      const desc = tx.description.trim();
      const parent = tx.fin_categories?.parent_category || 'OTROS';
      const catName = tx.fin_categories?.name || 'Sin Clasificar';
      const month = tx.transaction_date.substring(0, 7);
      const amount = Number(tx.amount_usd);

      if (!matrix[parent]) matrix[parent] = {};
      if (!matrix[parent][catName]) matrix[parent][catName] = {};
      matrix[parent][catName][month] = (matrix[parent][catName][month] || 0) + amount;

      if (!detailMatrix[parent]) detailMatrix[parent] = {};
      if (!detailMatrix[parent][catName]) detailMatrix[parent][catName] = {};
      if (!detailMatrix[parent][catName][desc]) detailMatrix[parent][catName][desc] = {};
      detailMatrix[parent][catName][desc][month] = (detailMatrix[parent][catName][desc][month] || 0) + amount;
    });

    // Inject rev_orders into REVENUE
    if (!matrix['REVENUE']) matrix['REVENUE'] = {};
    if (!detailMatrix['REVENUE']) detailMatrix['REVENUE'] = {};

    revOrders.forEach((order) => {
      const catName = classifyPlan(order.product_name);
      const productName = order.product_name || 'Sin Plan';
      const month = order.created_at.substring(0, 7);
      const amount = Number(order.amount_usd);

      if (!matrix['REVENUE'][catName]) matrix['REVENUE'][catName] = {};
      matrix['REVENUE'][catName][month] = (matrix['REVENUE'][catName][month] || 0) + amount;

      if (!detailMatrix['REVENUE'][catName]) detailMatrix['REVENUE'][catName] = {};
      if (!detailMatrix['REVENUE'][catName][productName]) detailMatrix['REVENUE'][catName][productName] = {};
      detailMatrix['REVENUE'][catName][productName][month] = (detailMatrix['REVENUE'][catName][productName][month] || 0) + amount;
    });

    return { sortedMonths, matrix, detailMatrix };
  }, [filteredTransactions, revOrders]);

  const getParentTotal = (parent: string, month: string) => {
    const section = pnlData.matrix[parent];
    if (!section) return 0;
    return Object.values(section).reduce((sum, item) => sum + (item[month] || 0), 0);
  };

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

  return (
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
                  {pnlData.sortedMonths.map((m) => (
                    <th key={m} className="px-6 py-3 border-b border-gray-200 text-right min-w-[120px]">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pnlData.matrix['REVENUE'] && (
                  <PnLSection title="Ingresos" data={pnlData.matrix['REVENUE']} details={pnlData.detailMatrix} parentKey="REVENUE" months={pnlData.sortedMonths} totalColor="bg-green-50/50" />
                )}

                {pnlData.matrix['COGS'] && (
                  <PnLSection title="Costo de Venta (COGS)" data={pnlData.matrix['COGS']} details={pnlData.detailMatrix} parentKey="COGS" months={pnlData.sortedMonths} />
                )}

                {/* Gross margin */}
                <tr className="bg-blue-50 border-t-2 border-blue-100">
                  <td className="px-6 py-3 font-bold text-gray-900 sticky left-0 bg-blue-50 border-r border-blue-200 z-10">MARGEN BRUTO ($)</td>
                  {pnlData.sortedMonths.map((m) => {
                    const gross = getParentTotal('REVENUE', m) - getParentTotal('COGS', m);
                    return <td key={m} className="px-6 py-3 text-right font-bold text-gray-800">{fmt(gross)}</td>;
                  })}
                </tr>
                <tr className="bg-blue-50/50 border-b-2 border-blue-100">
                  <td className="px-6 py-2 text-xs font-semibold text-blue-800 sticky left-0 bg-blue-50/50 border-r border-blue-200 z-10 pl-10">↳ Margen Bruto %</td>
                  {pnlData.sortedMonths.map((m) => {
                    const rev = getParentTotal('REVENUE', m);
                    const gross = rev - getParentTotal('COGS', m);
                    const pct = rev !== 0 ? gross / rev : 0;
                    return <td key={m} className="px-6 py-2 text-right text-xs font-bold text-blue-600">{(pct * 100).toFixed(1)}%</td>;
                  })}
                </tr>

                {pnlData.matrix['OPEX'] && (
                  <PnLSection title="Gastos Operativos (OpEx)" data={pnlData.matrix['OPEX']} details={pnlData.detailMatrix} parentKey="OPEX" months={pnlData.sortedMonths} />
                )}

                {pnlData.matrix['TAX'] && (
                  <PnLSection title="Impuestos" data={pnlData.matrix['TAX']} details={pnlData.detailMatrix} parentKey="TAX" months={pnlData.sortedMonths} />
                )}

                {/* Net income */}
                <tr className="bg-gray-900 text-white font-bold text-base border-t border-gray-700">
                  <td className="px-6 py-4 sticky left-0 bg-gray-900 border-r border-gray-700 z-10">UTILIDAD NETA ($)</td>
                  {pnlData.sortedMonths.map((m) => {
                    const net = getParentTotal('REVENUE', m) - getParentTotal('COGS', m) - getParentTotal('OPEX', m) - getParentTotal('TAX', m);
                    return <td key={m} className={`px-6 py-4 text-right ${net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{fmt(net)}</td>;
                  })}
                </tr>
                <tr className="bg-gray-800 text-gray-300 text-sm font-medium">
                  <td className="px-6 py-2 sticky left-0 bg-gray-800 border-r border-gray-700 z-10 pl-10">↳ Margen Neto %</td>
                  {pnlData.sortedMonths.map((m) => {
                    const rev = getParentTotal('REVENUE', m);
                    const net = rev - getParentTotal('COGS', m) - getParentTotal('OPEX', m) - getParentTotal('TAX', m);
                    const pct = rev !== 0 ? net / rev : 0;
                    let colorClass = 'text-gray-300';
                    if (pct > 0.2) colorClass = 'text-emerald-400 font-bold';
                    else if (pct < 0) colorClass = 'text-red-400';
                    return <td key={m} className={`px-6 py-2 text-right ${colorClass}`}>{(pct * 100).toFixed(1)}%</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
