'use client';

import { useMemo } from 'react';
import { DateRange } from './shared/useDateRange';
import { useAdsData, useOrganicData, useWebData, useConversionsData, useAdsTrend, useOrganicTrend } from './shared/useMarketingData';
import { fmtNum, fmtUSD, fmtPct } from '@/components/growth/formatters';
import KpiCard from '@/components/growth/KpiCard';
import { AdsSpendChart } from './ads/AdsCharts';
import { FollowersGrowthChart } from './organic/OrganicCharts';
import {
  CurrencyDollarIcon,
  ShoppingCartIcon,
  UserPlusIcon,
  ArrowTrendingUpIcon,
  GlobeAltIcon,
  UserGroupIcon,
  EyeIcon,
  HeartIcon,
} from '@heroicons/react/24/outline';

interface ResumenTabProps {
  range: DateRange;
}

// Compute previous period range (same duration, shifted back)
function getPreviousRange(range: DateRange): DateRange {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

function growthCalc(current: number, previous: number): { percent: number; isPositive: boolean } | undefined {
  if (previous === 0 && current === 0) return undefined;
  if (previous === 0) return { percent: 100, isPositive: true };
  const pct = ((current - previous) / previous) * 100;
  return { percent: Math.abs(pct), isPositive: pct >= 0 };
}

export default function ResumenTab({ range }: ResumenTabProps) {
  const prevRange = useMemo(() => getPreviousRange(range), [range.from, range.to]);

  // Current period
  const { platformKpis, loading: adsLoading, hasData: hasAds } = useAdsData(range);
  const { kpis: webKpis, loading: webLoading, hasData: hasWeb } = useWebData(range);
  const { platforms: organicPlatforms, loading: orgLoading, hasData: hasOrganic } = useOrganicData(range);
  const { data: convData, loading: convLoading } = useConversionsData(range);
  const { data: adsTrend } = useAdsTrend(range);
  const { data: organicTrend } = useOrganicTrend(range);

  // Previous period (for comparisons)
  const { platformKpis: prevAdsKpis } = useAdsData(prevRange);
  const { kpis: prevWebKpis } = useWebData(prevRange);
  const { platforms: prevOrganicPlatforms } = useOrganicData(prevRange);
  const { data: prevConvData } = useConversionsData(prevRange);

  const loading = adsLoading || webLoading || orgLoading || convLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Ads KPIs
  const totalSpend = platformKpis.reduce((s, p) => s + p.spend, 0);
  const totalAdsConversions = platformKpis.reduce((s, p) => s + p.conversions, 0);
  const avgCpa = totalAdsConversions > 0 ? totalSpend / totalAdsConversions : 0;

  const prevSpend = prevAdsKpis.reduce((s, p) => s + p.spend, 0);
  const prevAdsConversions = prevAdsKpis.reduce((s, p) => s + p.conversions, 0);
  const prevCpa = prevAdsConversions > 0 ? prevSpend / prevAdsConversions : 0;

  // Organic KPIs
  const totalFollowers = organicPlatforms.reduce((s, p) => s + p.currentFollowers, 0);
  const totalFollowersDelta = organicPlatforms.reduce((s, p) => s + p.followersDelta, 0);
  const totalEngagement = organicPlatforms.reduce((s, p) => s + p.engagement, 0);

  const prevFollowersDelta = prevOrganicPlatforms.reduce((s, p) => s + p.followersDelta, 0);
  const prevEngagement = prevOrganicPlatforms.reduce((s, p) => s + p.engagement, 0);

  return (
    <div className="space-y-8">
      {/* Ads */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Performance — Ads Pagados</h3>
        {hasAds ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <KpiCard title="Gasto total" value={fmtUSD(totalSpend)} icon={CurrencyDollarIcon} colorClass="bg-red-500" growth={growthCalc(totalSpend, prevSpend)} />
              <KpiCard title="Registros" value={fmtNum(totalAdsConversions)} icon={ShoppingCartIcon} colorClass="bg-blue-500" growth={growthCalc(totalAdsConversions, prevAdsConversions)} />
              <KpiCard title="CPA" value={fmtUSD(avgCpa)} icon={ArrowTrendingUpIcon} colorClass="bg-purple-500" growth={prevCpa > 0 ? { percent: Math.abs(((avgCpa - prevCpa) / prevCpa) * 100), isPositive: avgCpa <= prevCpa } : undefined} />
            </div>
            <AdsSpendChart data={adsTrend} />
          </>
        ) : (
          <p className="text-sm text-gray-400">Sin datos de ads en este período</p>
        )}
      </section>

      {/* Orgánico */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Orgánico — Comunidad</h3>
        {hasOrganic ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <KpiCard title="Seguidores" value={fmtNum(totalFollowers)} icon={UserGroupIcon} colorClass="bg-pink-500" />
              <KpiCard title="Nuevos seguidores" value={(totalFollowersDelta >= 0 ? '+' : '') + fmtNum(totalFollowersDelta)} icon={HeartIcon} colorClass="bg-rose-500" growth={growthCalc(totalFollowersDelta, prevFollowersDelta)} />
              <KpiCard title="Engagement" value={fmtNum(totalEngagement)} icon={EyeIcon} colorClass="bg-amber-500" growth={growthCalc(totalEngagement, prevEngagement)} />
            </div>
            <FollowersGrowthChart data={organicTrend} />
          </>
        ) : (
          <p className="text-sm text-gray-400">Sin datos orgánicos en este período</p>
        )}
      </section>

      {/* Web */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Web y Blog</h3>
        {hasWeb && webKpis ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard title="Sesiones" value={fmtNum(webKpis.sessions)} icon={GlobeAltIcon} colorClass="bg-green-500" growth={growthCalc(webKpis.sessions, prevWebKpis?.sessions || 0)} />
            <KpiCard title="Usuarios nuevos" value={fmtNum(webKpis.newUsers)} icon={UserPlusIcon} colorClass="bg-teal-500" growth={growthCalc(webKpis.newUsers, prevWebKpis?.newUsers || 0)} />
            <KpiCard title="Conversiones GA4" value={fmtNum(webKpis.conversionsGa4)} icon={ShoppingCartIcon} colorClass="bg-indigo-500" growth={growthCalc(webKpis.conversionsGa4, prevWebKpis?.conversionsGa4 || 0)} />
          </div>
        ) : (
          <p className="text-sm text-gray-400">Sin datos web en este período</p>
        )}
      </section>

      {/* Conversiones */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Conversiones</h3>
        {convData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Registros" value={fmtNum(convData.totalRegistrations)} icon={UserPlusIcon} colorClass="bg-blue-500" growth={growthCalc(convData.totalRegistrations, prevConvData?.totalRegistrations || 0)} />
            <KpiCard title="Compras" value={fmtNum(convData.totalPurchases)} icon={ShoppingCartIcon} colorClass="bg-green-500" growth={growthCalc(convData.totalPurchases, prevConvData?.totalPurchases || 0)} />
            <KpiCard title="Revenue" value={fmtUSD(convData.totalRevenue)} icon={CurrencyDollarIcon} colorClass="bg-emerald-500" growth={growthCalc(convData.totalRevenue, prevConvData?.totalRevenue || 0)} />
            <KpiCard title="Tasa conversión" value={fmtPct(convData.conversionRate)} icon={ArrowTrendingUpIcon} colorClass="bg-violet-500" />
          </div>
        ) : (
          <p className="text-sm text-gray-400">Sin datos de conversiones en este período</p>
        )}
      </section>
    </div>
  );
}
