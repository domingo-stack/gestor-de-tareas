'use client';

import { CampaignSummary } from '../shared/useMarketingData';
import { fmtNum, fmtPct } from '@/components/growth/formatters';

const PLATFORM_BADGE: Record<string, string> = {
  meta: 'bg-blue-50 text-blue-700',
  google: 'bg-emerald-50 text-emerald-700',
  tiktok: 'bg-pink-50 text-pink-700',
};

function QualityBadge({ value, threshold, noData }: { value: number | null; threshold: number; noData: boolean }) {
  if (noData || value === null) return <span className="text-gray-300">—</span>;
  const isGood = value >= threshold;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
      isGood ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
    }`}>
      {fmtPct(value)}
    </span>
  );
}

interface CampaignTableProps {
  campaigns: CampaignSummary[];
  fmtMoney: (v: number) => string;
}

export default function CampaignTable({ campaigns, fmtMoney }: CampaignTableProps) {
  if (campaigns.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        No hay campañas activas en el período seleccionado.
      </p>
    );
  }

  const hasAnyVideo = campaigns.some(c => c.hasVideo);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[1100px]">
        <thead className="bg-gray-50 text-gray-500 font-medium border-b">
          <tr>
            <th className="px-4 py-3 text-left">Campaña</th>
            <th className="px-3 py-3 text-left">Plat.</th>
            <th className="px-3 py-3 text-right">Gasto</th>
            <th className="px-3 py-3 text-right">Clicks</th>
            <th className="px-3 py-3 text-right">CTR</th>
            <th className="px-3 py-3 text-right">Conv.</th>
            <th className="px-3 py-3 text-right">CPA</th>
            <th className="px-3 py-3 text-right">ROAS</th>
            {hasAnyVideo && (
              <>
                <th className="px-3 py-3 text-center border-l border-gray-200 whitespace-nowrap" title="video_3s_views / reach — Verde ≥ 30%">Hook</th>
                <th className="px-3 py-3 text-center whitespace-nowrap" title="video_thruplay / video_3s_views — Verde ≥ 15%">Retención</th>
              </>
            )}
            <th className={`px-3 py-3 text-center whitespace-nowrap ${hasAnyVideo ? '' : 'border-l border-gray-200'}`} title="landing_page_views / clicks — Verde ≥ 80%">Calidad Clic</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {campaigns.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900 max-w-[220px] truncate">{c.name}</td>
              <td className="px-3 py-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${PLATFORM_BADGE[c.platform] || 'bg-gray-50 text-gray-700'}`}>
                  {c.platform}
                </span>
              </td>
              <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(c.spend)}</td>
              <td className="px-3 py-3 text-right text-gray-700">{fmtNum(c.clicks)}</td>
              <td className="px-3 py-3 text-right text-gray-700">{fmtPct(c.ctr)}</td>
              <td className="px-3 py-3 text-right text-gray-700">{fmtNum(c.conversions)}</td>
              <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(c.cpa)}</td>
              <td className="px-3 py-3 text-right font-medium text-gray-900">{c.roas.toFixed(2)}x</td>
              {hasAnyVideo && (
                <>
                  <td className="px-3 py-3 text-center border-l border-gray-200">
                    <QualityBadge value={c.hookRate} threshold={30} noData={!c.hasVideo} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <QualityBadge value={c.retentionRate} threshold={15} noData={!c.hasVideo} />
                  </td>
                </>
              )}
              <td className={`px-3 py-3 text-center ${hasAnyVideo ? '' : 'border-l border-gray-200'}`}>
                <QualityBadge value={c.clickQualityRate} threshold={80} noData={c.clicks === 0} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
