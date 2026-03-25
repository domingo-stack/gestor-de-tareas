'use client';

import { DateRange } from './shared/useDateRange';
import { useOrganicTrend } from './shared/useMarketingData';
import OrganicOverview from './organic/OrganicOverview';
import { FollowersGrowthChart, EngagementTrendChart } from './organic/OrganicCharts';
import PostsFeed from './organic/PostsFeed';
import YouTubeMetrics from './organic/YouTubeMetrics';

interface OrganicTabProps {
  range: DateRange;
}

export default function OrganicTab({ range }: OrganicTabProps) {
  const { data: trendData } = useOrganicTrend(range);

  return (
    <div className="space-y-6">
      <OrganicOverview range={range} />

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FollowersGrowthChart data={trendData} />
        <EngagementTrendChart data={trendData} />
      </div>

      <PostsFeed range={range} />

      <section>
        <h4 className="text-sm font-semibold text-gray-600 mb-3">YouTube — Detalle</h4>
        <YouTubeMetrics range={range} />
      </section>
    </div>
  );
}
