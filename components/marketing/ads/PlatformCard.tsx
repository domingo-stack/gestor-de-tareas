'use client';

import { PlatformAdsKpis } from '../shared/useMarketingData';
import { fmtNum, fmtUSD, fmtPct } from '@/components/growth/formatters';

const PLATFORM_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  meta: { label: 'Meta Ads', color: 'text-blue-700', bg: 'bg-blue-50' },
  google: { label: 'Google Ads', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  tiktok: { label: 'TikTok Ads', color: 'text-pink-700', bg: 'bg-pink-50' },
};

interface PlatformCardProps {
  data: PlatformAdsKpis;
}

export default function PlatformCard({ data }: PlatformCardProps) {
  const config = PLATFORM_CONFIG[data.platform] || { label: data.platform, color: 'text-gray-700', bg: 'bg-gray-50' };

  const metrics = [
    { label: 'Gasto', value: fmtUSD(data.spend) },
    { label: 'ROAS', value: data.roas.toFixed(2) + 'x' },
    { label: 'CPA', value: fmtUSD(data.cpa) },
    { label: 'Conversiones', value: fmtNum(data.conversions) },
    { label: 'CTR', value: fmtPct(data.ctr) },
    { label: 'Alcance', value: fmtNum(data.reach) },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
          {config.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="text-xs text-gray-500">{m.label}</p>
            <p className="text-lg font-bold text-gray-900">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
