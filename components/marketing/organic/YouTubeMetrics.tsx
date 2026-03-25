'use client';

import { DateRange } from '../shared/useDateRange';
import { useOrganicData, useYouTubeVideos, OrganicPlatformData } from '../shared/useMarketingData';
import { fmtNum } from '@/components/growth/formatters';
import SyncStatus from '../shared/SyncStatus';
import EmptyState from '../shared/EmptyState';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  EyeIcon,
  HandThumbUpIcon,
  ChatBubbleLeftIcon,
} from '@heroicons/react/24/outline';

interface YouTubeMetricsProps {
  range: DateRange;
}

export default function YouTubeMetrics({ range }: YouTubeMetricsProps) {
  const { platforms, loading: orgLoading, hasData } = useOrganicData(range);
  const { videos, loading: vidLoading } = useYouTubeVideos(range);

  const loading = orgLoading || vidLoading;
  const ytData: OrganicPlatformData | undefined = platforms.find((p) => p.platform === 'youtube');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    );
  }

  if (!hasData || !ytData) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <EmptyState platform="YouTube" />
      </div>
    );
  }

  const isPositive = ytData.followersDelta >= 0;

  return (
    <div className="space-y-6">
      <SyncStatus sources={['youtube_organic']} />

      {/* Channel overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">Suscriptores</p>
          <p className="text-2xl font-bold text-gray-900">{fmtNum(ytData.currentFollowers)}</p>
          {ytData.followersDelta !== 0 && (
            <div className={`flex items-center mt-1 text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? <ArrowTrendingUpIcon className="w-3 h-3 mr-0.5" /> : <ArrowTrendingDownIcon className="w-3 h-3 mr-0.5" />}
              <span>{isPositive ? '+' : ''}{fmtNum(ytData.followersDelta)} en el período</span>
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">Vistas totales</p>
          <p className="text-2xl font-bold text-gray-900">{fmtNum(ytData.views)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">Videos publicados</p>
          <p className="text-2xl font-bold text-gray-900">{fmtNum(ytData.postsPublished)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">Engagement</p>
          <p className="text-2xl font-bold text-gray-900">{fmtNum(ytData.likes + ytData.comments)}</p>
          <p className="text-xs text-gray-400 mt-1">Likes + comentarios</p>
        </div>
      </div>

      {/* Videos list */}
      {videos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-700">Videos recientes</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {videos.map((v) => (
              <div key={v.videoId} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                {/* Thumbnail */}
                {v.thumbnail ? (
                  <img
                    src={v.thumbnail}
                    alt={v.title}
                    className="w-28 h-16 object-cover rounded-lg shrink-0 bg-gray-100"
                  />
                ) : (
                  <div className="w-28 h-16 bg-gray-100 rounded-lg shrink-0" />
                )}
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{v.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </p>
                </div>
                {/* Metrics */}
                <div className="flex items-center gap-5 shrink-0 text-sm text-gray-600">
                  <div className="flex items-center gap-1" title="Vistas">
                    <EyeIcon className="w-4 h-4 text-gray-400" />
                    <span>{fmtNum(v.views)}</span>
                  </div>
                  <div className="flex items-center gap-1" title="Likes">
                    <HandThumbUpIcon className="w-4 h-4 text-gray-400" />
                    <span>{fmtNum(v.likes)}</span>
                  </div>
                  <div className="flex items-center gap-1" title="Comentarios">
                    <ChatBubbleLeftIcon className="w-4 h-4 text-gray-400" />
                    <span>{fmtNum(v.comments)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
