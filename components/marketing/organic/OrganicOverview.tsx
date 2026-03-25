'use client';

import { DateRange } from '../shared/useDateRange';
import { useOrganicData } from '../shared/useMarketingData';
import PlatformMetrics from './PlatformMetrics';
import SyncStatus from '../shared/SyncStatus';
import EmptyState from '../shared/EmptyState';

interface OrganicOverviewProps {
  range: DateRange;
}

const PLATFORM_ORDER = ['facebook', 'instagram', 'youtube', 'tiktok'];

export default function OrganicOverview({ range }: OrganicOverviewProps) {
  const { platforms, loading, hasData } = useOrganicData(range);

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
        <EmptyState platform="Contenido orgánico" message="Ninguna red social está conectada. Configura Facebook, Instagram, YouTube o TikTok para ver métricas." />
      </div>
    );
  }

  // Sort platforms by defined order, put found ones first
  const sorted = PLATFORM_ORDER
    .map(p => platforms.find(d => d.platform === p))
    .filter(Boolean) as typeof platforms;

  return (
    <div className="space-y-4">
      <SyncStatus sources={['meta_organic', 'instagram_organic', 'youtube_organic']} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map(data => (
          <PlatformMetrics key={data.platform} data={data} />
        ))}
      </div>
    </div>
  );
}
