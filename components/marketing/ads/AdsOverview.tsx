'use client';

import { DateRange } from '../shared/useDateRange';
import { useAdsData, useAdsTrend } from '../shared/useMarketingData';
import { AdsSpendChart, AdsCpaChart, CampaignCpaBar } from './AdsCharts';
import { fmtNum, fmtUSD, fmtPct } from '@/components/growth/formatters';
import KpiCard from '@/components/growth/KpiCard';
import PlatformCard from './PlatformCard';
import CampaignTable from './CampaignTable';
import SyncStatus from '../shared/SyncStatus';
import EmptyState from '../shared/EmptyState';
import {
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  UserGroupIcon,
  CursorArrowRaysIcon,
  ShoppingCartIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

interface AdsOverviewProps {
  range: DateRange;
}

export default function AdsOverview({ range }: AdsOverviewProps) {
  const { platformKpis, campaigns, loading, hasData } = useAdsData(range);
  const { data: trendData } = useAdsTrend(range);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <EmptyState platform="Ads pagados" message="Ninguna plataforma de ads está conectada. Configura Meta Ads, Google Ads o TikTok Ads para ver datos." />
      </div>
    );
  }

  // Consolidated KPIs
  const totalSpend = platformKpis.reduce((s, p) => s + p.spend, 0);
  const totalConversions = platformKpis.reduce((s, p) => s + p.conversions, 0);
  const totalConversionValue = platformKpis.reduce((s, p) => s + p.conversionValue, 0);
  const totalImpressions = platformKpis.reduce((s, p) => s + p.impressions, 0);
  const totalClicks = platformKpis.reduce((s, p) => s + p.clicks, 0);
  const totalReach = platformKpis.reduce((s, p) => s + p.reach, 0);
  const avgRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Sync status */}
      <SyncStatus sources={['meta_ads', 'google_ads', 'tiktok_ads']} />

      {/* Consolidated KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard title="Gasto total" value={fmtUSD(totalSpend)} icon={CurrencyDollarIcon} colorClass="bg-red-500" />
        <KpiCard title="CPA" value={fmtUSD(avgCpa)} icon={ShoppingCartIcon} colorClass="bg-purple-500" subtext="Costo por registro" />
        <KpiCard title="Registros (conv.)" value={fmtNum(totalConversions)} icon={UserGroupIcon} colorClass="bg-blue-500" />
        <KpiCard title="CTR" value={fmtPct(avgCtr)} icon={CursorArrowRaysIcon} colorClass="bg-amber-500" />
        <KpiCard title="Alcance" value={fmtNum(totalReach)} icon={EyeIcon} colorClass="bg-indigo-500" />
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdsSpendChart data={trendData} />
        <AdsCpaChart data={trendData} />
      </div>

      {/* CPA by Campaign */}
      <CampaignCpaBar campaigns={campaigns} />

      {/* Platform comparison */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Comparación por plataforma</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['meta', 'google', 'tiktok'].map((p) => {
            const data = platformKpis.find((k) => k.platform === p);
            if (!data) return (
              <div key={p} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <EmptyState platform={p === 'meta' ? 'Meta Ads' : p === 'google' ? 'Google Ads' : 'TikTok Ads'} />
              </div>
            );
            return <PlatformCard key={p} data={data} />;
          })}
        </div>
      </div>

      {/* Campaign table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-700">Campañas activas</h3>
        </div>
        <CampaignTable campaigns={campaigns} />
      </div>
    </div>
  );
}
