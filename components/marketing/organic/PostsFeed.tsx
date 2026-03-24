'use client';

import { useState } from 'react';
import { DateRange } from '../shared/useDateRange';
import { useOrganicPosts, OrganicPost } from '../shared/useMarketingData';
import { fmtNum } from '@/components/growth/formatters';

interface PostsFeedProps {
  range: DateRange;
}

const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  facebook: { label: 'Facebook', color: 'bg-blue-100 text-blue-700', icon: 'f' },
  instagram: { label: 'Instagram', color: 'bg-pink-100 text-pink-700', icon: 'IG' },
};

function PostCard({ post }: { post: OrganicPost }) {
  const config = PLATFORM_CONFIG[post.platform] || { label: post.platform, color: 'bg-gray-100 text-gray-700', icon: '?' };
  const postDate = new Date(post.publishedAt || post.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      {post.thumbnail && (
        <div className="relative h-48 bg-gray-100">
          <img
            src={post.thumbnail}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className={`absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${config.color}`}>
            {config.label}
          </span>
          {post.postType && (
            <span className="absolute top-2 right-2 text-[10px] font-medium bg-black/60 text-white px-2 py-0.5 rounded">
              {post.postType.replace('CAROUSEL_ALBUM', 'Carousel').replace('VIDEO', 'Video').replace('IMAGE', 'Imagen')}
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {!post.thumbnail && (
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${config.color} inline-block mb-2`}>
            {config.label}
          </span>
        )}

        <p className="text-xs text-gray-400 mb-1">{postDate}</p>

        {post.message && (
          <p className="text-sm text-gray-700 line-clamp-3 mb-3">{post.message}</p>
        )}

        {/* Engagement metrics */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span title="Likes">❤️ {fmtNum(post.likes)}</span>
          <span title="Comentarios">💬 {fmtNum(post.comments)}</span>
          <span title="Compartidos">🔄 {fmtNum(post.shares)}</span>
        </div>

        {/* Engagement score */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">Engagement score: {fmtNum(post.engagementScore)}</span>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
            >
              Ver post →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PostsFeed({ range }: PostsFeedProps) {
  const { posts, loading } = useOrganicPosts(range);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [showCount, setShowCount] = useState(12);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  const filtered = filterPlatform === 'all' ? posts : posts.filter(p => p.platform === filterPlatform);
  const visible = filtered.slice(0, showCount);

  const platformCounts = {
    all: posts.length,
    facebook: posts.filter(p => p.platform === 'facebook').length,
    instagram: posts.filter(p => p.platform === 'instagram').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-700">Posts — Facebook e Instagram</h4>
        <div className="flex gap-2">
          {(['all', 'facebook', 'instagram'] as const).map((p) => {
            const count = platformCounts[p];
            if (p !== 'all' && count === 0) return null;
            return (
              <button
                key={p}
                onClick={() => { setFilterPlatform(p); setShowCount(12); }}
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  filterPlatform === p
                    ? 'bg-[#3c527a] text-white border-[#3c527a]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {p === 'all' ? 'Todos' : p === 'facebook' ? 'Facebook' : 'Instagram'} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((post) => (
          <PostCard key={`${post.platform}::${post.postId}`} post={post} />
        ))}
      </div>

      {filtered.length > showCount && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowCount(prev => prev + 12)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Ver más ({filtered.length - showCount} restantes)
          </button>
        </div>
      )}
    </div>
  );
}
