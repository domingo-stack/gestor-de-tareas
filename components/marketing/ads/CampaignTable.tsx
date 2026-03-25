'use client';

import { CampaignSummary } from '../shared/useMarketingData';
import { fmtNum, fmtUSD, fmtPct } from '@/components/growth/formatters';

const PLATFORM_BADGE: Record<string, string> = {
  meta: 'bg-blue-50 text-blue-700',
  google: 'bg-emerald-50 text-emerald-700',
  tiktok: 'bg-pink-50 text-pink-700',
};

interface CampaignTableProps {
  campaigns: CampaignSummary[];
}

export default function CampaignTable({ campaigns }: CampaignTableProps) {
  if (campaigns.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        No hay campañas activas en el período seleccionado.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 font-medium border-b">
          <tr>
            <th className="px-4 py-3 text-left">Campaña</th>
            <th className="px-4 py-3 text-left">Plataforma</th>
            <th className="px-4 py-3 text-right">Gasto</th>
            <th className="px-4 py-3 text-right">Impresiones</th>
            <th className="px-4 py-3 text-right">Clicks</th>
            <th className="px-4 py-3 text-right">CTR</th>
            <th className="px-4 py-3 text-right">Conversiones</th>
            <th className="px-4 py-3 text-right">CPA</th>
            <th className="px-4 py-3 text-right">ROAS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {campaigns.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900 max-w-[250px] truncate">{c.name}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${PLATFORM_BADGE[c.platform] || 'bg-gray-50 text-gray-700'}`}>
                  {c.platform}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-gray-700">{fmtUSD(c.spend)}</td>
              <td className="px-4 py-3 text-right text-gray-700">{fmtNum(c.impressions)}</td>
              <td className="px-4 py-3 text-right text-gray-700">{fmtNum(c.clicks)}</td>
              <td className="px-4 py-3 text-right text-gray-700">{fmtPct(c.ctr)}</td>
              <td className="px-4 py-3 text-right text-gray-700">{fmtNum(c.conversions)}</td>
              <td className="px-4 py-3 text-right text-gray-700">{fmtUSD(c.cpa)}</td>
              <td className="px-4 py-3 text-right font-medium text-gray-900">{c.roas.toFixed(2)}x</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
