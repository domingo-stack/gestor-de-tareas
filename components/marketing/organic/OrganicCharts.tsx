'use client';

import {
  AreaChart, Area, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { OrganicTrendPoint } from '../shared/useMarketingData';
import { fmtNum } from '@/components/growth/formatters';

const COLORS = {
  facebook: '#3B82F6',
  instagram: '#EC4899',
  youtube: '#EF4444',
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{formatDate(label || '')}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-bold text-gray-800">{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── 1. Followers Growth (AreaChart) ───
export function FollowersGrowthChart({ data }: { data: OrganicTrendPoint[] }) {
  if (data.length === 0) return null;

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
  };

  // Check which platforms have data
  const hasFb = data.some(d => d.facebook_followers > 0);
  const hasIg = data.some(d => d.instagram_followers > 0);
  const hasYt = data.some(d => d.youtube_followers > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">Crecimiento de seguidores</h4>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {hasFb && (
              <Area type="monotone" dataKey="facebook_followers" stroke={COLORS.facebook} fill={COLORS.facebook} fillOpacity={0.15} name="Facebook" />
            )}
            {hasIg && (
              <Area type="monotone" dataKey="instagram_followers" stroke={COLORS.instagram} fill={COLORS.instagram} fillOpacity={0.15} name="Instagram" />
            )}
            {hasYt && (
              <Area type="monotone" dataKey="youtube_followers" stroke={COLORS.youtube} fill={COLORS.youtube} fillOpacity={0.15} name="YouTube" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── 2. Engagement Trend (ComposedChart) ───
export function EngagementTrendChart({ data }: { data: OrganicTrendPoint[] }) {
  if (data.length === 0) return null;

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
  };

  // Combine engagement across platforms per day
  const chartData = data.map(d => ({
    date: d.date,
    fb_engagement: d.facebook_engagement,
    ig_engagement: d.instagram_engagement,
    yt_engagement: d.youtube_engagement,
    followers_delta: d.total_followers_delta,
  }));

  const hasEngagement = chartData.some(d => d.fb_engagement > 0 || d.ig_engagement > 0 || d.yt_engagement > 0);
  if (!hasEngagement) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-1">Engagement diario vs Nuevos seguidores</h4>
      <p className="text-xs text-gray-400 mb-4">¿Los días con más engagement coinciden con más seguidores nuevos?</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="fb_engagement" stackId="engagement" fill={COLORS.facebook} name="FB Engagement" barSize={16} />
            <Bar yAxisId="left" dataKey="ig_engagement" stackId="engagement" fill={COLORS.instagram} name="IG Engagement" barSize={16} />
            <Bar yAxisId="left" dataKey="yt_engagement" stackId="engagement" fill={COLORS.youtube} name="YT Engagement" barSize={16} radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="followers_delta" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} name="Δ Seguidores" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
