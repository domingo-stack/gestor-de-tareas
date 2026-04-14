'use client';

import { DateRange } from '../shared/useDateRange';
import { useConversionsData } from '../shared/useMarketingData';
import { fmtNum, fmtUSD, fmtPct } from '@/components/growth/formatters';
import KpiCard from '@/components/growth/KpiCard';
import {
  UserPlusIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

interface ConversionsSectionProps {
  range: DateRange;
}

export default function ConversionsSection({ range }: ConversionsSectionProps) {
  const { data, loading } = useConversionsData(range);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Registros" value={fmtNum(data.totalRegistrations)} icon={UserPlusIcon} colorClass="bg-blue-500" tooltip="Usuarios que se registraron en el período seleccionado." />
        <KpiCard title="Compras" value={fmtNum(data.totalPurchases)} icon={ShoppingCartIcon} colorClass="bg-green-500" tooltip="Transacciones de pago completadas en el período." />
        <KpiCard title="Revenue" value={fmtUSD(data.totalRevenue)} icon={CurrencyDollarIcon} colorClass="bg-purple-500" tooltip="Ingresos totales en USD de las compras realizadas." />
        <KpiCard
          title="Tasa registro→compra"
          value={fmtPct(data.conversionRate)}
          icon={ArrowTrendingUpIcon}
          colorClass="bg-amber-500"
          tooltip="% de registros que terminaron comprando. Compras ÷ Registros × 100."
          subtext="Indicativa, no exacta"
        />
      </div>

      {/* UTM breakdown or note */}
      {data.hasUtmData ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-700">Breakdown por fuente (UTM)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Fuente</th>
                  <th className="px-4 py-3 text-right">Registros</th>
                  <th className="px-4 py-3 text-right">Compras</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.utmBreakdown.map((row) => (
                  <tr key={row.source} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.source}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtNum(row.registrations)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtNum(row.purchases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
          <InformationCircleIcon className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Atribución por fuente no disponible</p>
            <p className="text-xs text-amber-600 mt-1">
              Los totales de registros y compras se muestran sin breakdown por fuente.
              La atribución estará disponible una vez que se implementen los UTMs en Bubble y se traigan a Supabase vía n8n.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
