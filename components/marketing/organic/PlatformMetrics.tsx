'use client';

import { OrganicPlatformData } from '../shared/useMarketingData';
import { fmtNum } from '@/components/growth/formatters';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';

const PLATFORM_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  facebook: { label: 'Facebook', color: 'text-blue-700', bg: 'bg-blue-50' },
  instagram: { label: 'Instagram', color: 'text-pink-700', bg: 'bg-pink-50' },
  youtube: { label: 'YouTube', color: 'text-red-700', bg: 'bg-red-50' },
  tiktok: { label: 'TikTok', color: 'text-gray-800', bg: 'bg-gray-100' },
};

// Métricas por plataforma — usa datos enriched de posts cuando están disponibles
const PLATFORM_METRICS: Record<string, { key: keyof OrganicPlatformData; label: string }[]> = {
  facebook: [
    { key: 'views', label: 'Visualizaciones' },
    { key: 'totalLikes', label: 'Likes' },
    { key: 'totalComments', label: 'Comentarios' },
    { key: 'totalShares', label: 'Compartidos' },
  ],
  instagram: [
    { key: 'reach', label: 'Alcance' },
    { key: 'engagement', label: 'Engagement' },
    { key: 'totalLikes', label: 'Likes' },
    { key: 'totalComments', label: 'Comentarios' },
  ],
  youtube: [
    { key: 'views', label: 'Vistas' },
    { key: 'totalLikes', label: 'Likes' },
    { key: 'totalComments', label: 'Comentarios' },
    { key: 'postsPublished', label: 'Videos publicados' },
  ],
  tiktok: [
    { key: 'views', label: 'Vistas de perfil' },
    { key: 'likes', label: 'Likes' },
    { key: 'comments', label: 'Comentarios' },
    { key: 'shares', label: 'Compartidos' },
  ],
};

interface PlatformMetricsProps {
  data: OrganicPlatformData;
}

export default function PlatformMetrics({ data }: PlatformMetricsProps) {
  const config = PLATFORM_CONFIG[data.platform] || { label: data.platform, color: 'text-gray-700', bg: 'bg-gray-50' };
  const metrics = PLATFORM_METRICS[data.platform] || [];
  const isPositive = data.followersDelta >= 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
          {config.label}
        </span>
      </div>

      {/* Followers */}
      <div className="mb-4">
        <p className="text-xs text-gray-500">Seguidores</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-gray-900">{fmtNum(data.currentFollowers)}</p>
          {data.followersDelta !== 0 && (
            <div className={`flex items-center text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? (
                <ArrowTrendingUpIcon className="w-3 h-3 mr-0.5" />
              ) : (
                <ArrowTrendingDownIcon className="w-3 h-3 mr-0.5" />
              )}
              <span>{isPositive ? '+' : ''}{fmtNum(data.followersDelta)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Platform-specific metrics */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.key}>
            <p className="text-xs text-gray-500">{m.label}</p>
            <p className="text-lg font-bold text-gray-900">{fmtNum(data[m.key] as number)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
