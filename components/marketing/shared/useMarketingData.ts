'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { DateRange } from './useDateRange';

// ==================== Ads ====================
// Schema real: mkt_ad_metrics tiene platform + platform_campaign_id (campaign_id es NULL).
// Join con mkt_campaigns via platform + platform_campaign_id.

interface AdMetricRow {
  platform: string;
  platform_campaign_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  conversion_value: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number;
  video_3s_views: number | null;
  video_thruplay: number | null;
  landing_page_views: number | null;
  hook_rate: number | null;
  retention_rate: number | null;
  click_quality_rate: number | null;
}

export interface PlatformAdsKpis {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  cpa: number;
  roas: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  platform: string;
  status: string;
  platformCampaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  cpa: number;
  ctr: number;
  video3sViews: number;
  videoThruplay: number;
  landingPageViews: number;
  hookRate: number | null;
  retentionRate: number | null;
  clickQualityRate: number | null;
  hasVideo: boolean;
}

export function useAdsData(range: DateRange) {
  const { supabase } = useAuth();
  const [platformKpis, setPlatformKpis] = useState<PlatformAdsKpis[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    // Fetch ad metrics — uses platform + platform_campaign_id (not campaign_id)
    const { data: metrics } = await supabase
      .from('mkt_ad_metrics')
      .select('platform, platform_campaign_id, date, spend, impressions, clicks, reach, conversions, conversion_value, ctr, cpc, cpm, cpa, roas, video_3s_views, video_thruplay, landing_page_views, hook_rate, retention_rate, click_quality_rate')
      .gte('date', range.from)
      .lte('date', range.to);

    if (metrics && metrics.length > 0) {
      setHasData(true);
      const rows = metrics as AdMetricRow[];

      // Platform KPIs
      const byPlatform = new Map<string, AdMetricRow[]>();
      for (const row of rows) {
        const arr = byPlatform.get(row.platform) || [];
        arr.push(row);
        byPlatform.set(row.platform, arr);
      }

      const kpis: PlatformAdsKpis[] = [];
      for (const [platform, pRows] of byPlatform) {
        const spend = pRows.reduce((s, r) => s + Number(r.spend), 0);
        const impressions = pRows.reduce((s, r) => s + Number(r.impressions), 0);
        const clicks = pRows.reduce((s, r) => s + Number(r.clicks), 0);
        const reach = pRows.reduce((s, r) => s + Number(r.reach), 0);
        const conversions = pRows.reduce((s, r) => s + Number(r.conversions), 0);
        const conversionValue = pRows.reduce((s, r) => s + Number(r.conversion_value), 0);

        kpis.push({
          platform, spend, impressions, clicks, reach, conversions, conversionValue,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpa: conversions > 0 ? spend / conversions : 0,
          roas: spend > 0 ? conversionValue / spend : 0,
        });
      }
      setPlatformKpis(kpis);

      // Campaign summaries — aggregate metrics by platform_campaign_id, then enrich with name from mkt_campaigns
      const byCampaign = new Map<string, { platform: string; pcid: string; rows: AdMetricRow[] }>();
      for (const row of rows) {
        const key = `${row.platform}::${row.platform_campaign_id}`;
        const existing = byCampaign.get(key) || { platform: row.platform, pcid: row.platform_campaign_id, rows: [] };
        existing.rows.push(row);
        byCampaign.set(key, existing);
      }

      // Fetch campaign names
      const { data: campaignNames } = await supabase
        .from('mkt_campaigns')
        .select('platform_campaign_id, name, platform, status');

      const nameMap = new Map<string, { name: string; status: string }>();
      if (campaignNames) {
        for (const c of campaignNames) {
          nameMap.set(`${c.platform}::${c.platform_campaign_id}`, { name: c.name, status: c.status });
        }
      }

      const summaries: CampaignSummary[] = [];
      for (const [key, { platform, pcid, rows: cRows }] of byCampaign) {
        const info = nameMap.get(key);
        const spend = cRows.reduce((s, r) => s + Number(r.spend), 0);
        const impressions = cRows.reduce((s, r) => s + Number(r.impressions), 0);
        const clicks = cRows.reduce((s, r) => s + Number(r.clicks), 0);
        const conversions = cRows.reduce((s, r) => s + Number(r.conversions), 0);
        const conversionValue = cRows.reduce((s, r) => s + Number(r.conversion_value), 0);
        const video3sViews = cRows.reduce((s, r) => s + Number(r.video_3s_views || 0), 0);
        const videoThruplay = cRows.reduce((s, r) => s + Number(r.video_thruplay || 0), 0);
        const landingPageViews = cRows.reduce((s, r) => s + Number(r.landing_page_views || 0), 0);
        const reach = cRows.reduce((s, r) => s + Number(r.reach), 0);
        const hasVideo = video3sViews > 0;

        summaries.push({
          id: key,
          name: info?.name || pcid,
          platform,
          status: info?.status || 'active',
          platformCampaignId: pcid,
          spend, impressions, clicks, conversions,
          roas: spend > 0 ? conversionValue / spend : 0,
          cpa: conversions > 0 ? spend / conversions : 0,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          video3sViews,
          videoThruplay,
          landingPageViews,
          hookRate: hasVideo && reach > 0 ? (video3sViews / reach) * 100 : null,
          retentionRate: hasVideo && video3sViews > 0 ? (videoThruplay / video3sViews) * 100 : null,
          clickQualityRate: clicks > 0 ? (landingPageViews / clicks) * 100 : null,
          hasVideo,
        });
      }
      setCampaigns(summaries.sort((a, b) => b.spend - a.spend));
    } else {
      setHasData(false);
      setPlatformKpis([]);
      setCampaigns([]);
    }

    setLoading(false);
  }, [supabase, range.from, range.to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { platformKpis, campaigns, loading, hasData };
}

// ==================== Organic ====================
// Schema real: mkt_organic_metrics usa platform_name (no platform) y platform_account_id.
// organic_account_id es NULL.

interface OrganicMetricRow {
  platform_name: string;
  date: string;
  followers: number;
  followers_delta: number;
  impressions: number;
  reach: number;
  engagement: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  posts_published: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  posts_count_period: number;
}

export interface OrganicPlatformData {
  platform: string;
  currentFollowers: number;
  followersDelta: number;
  impressions: number;
  reach: number;
  engagement: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  postsPublished: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  postsCountPeriod: number;
}

export function useOrganicData(range: DateRange) {
  const { supabase } = useAuth();
  const [platforms, setPlatforms] = useState<OrganicPlatformData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const fetchData = async () => {
      setLoading(true);

      const { data } = await supabase
        .from('mkt_organic_metrics_enriched')
        .select('platform_name, date, followers, followers_delta, impressions, reach, engagement, views, likes, comments, shares, posts_published, total_likes, total_comments, total_shares, posts_count_period')
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: false });

      if (data && data.length > 0) {
        setHasData(true);

        const byPlatform = new Map<string, OrganicMetricRow[]>();
        for (const row of data as OrganicMetricRow[]) {
          const key = row.platform_name;
          const arr = byPlatform.get(key) || [];
          arr.push(row);
          byPlatform.set(key, arr);
        }

        const results: OrganicPlatformData[] = [];
        for (const [platform, rows] of byPlatform) {
          const latestRow = rows[0]; // most recent (sorted desc)
          const oldestRow = rows[rows.length - 1]; // oldest in range
          // Delta from followers_delta sum, fallback to difference between newest and oldest followers
          const deltaSum = rows.reduce((s, r) => s + Number(r.followers_delta || 0), 0);
          const deltaCalc = (Number(latestRow.followers) || 0) - (Number(oldestRow.followers) || 0);
          results.push({
            platform,
            currentFollowers: Number(latestRow.followers) || 0,
            followersDelta: deltaSum !== 0 ? deltaSum : deltaCalc,
            impressions: rows.reduce((s, r) => s + Number(r.impressions), 0),
            reach: rows.reduce((s, r) => s + Number(r.reach), 0),
            engagement: rows.reduce((s, r) => s + Number(r.engagement), 0),
            views: rows.reduce((s, r) => s + Number(r.views), 0),
            likes: rows.reduce((s, r) => s + Number(r.likes), 0),
            comments: rows.reduce((s, r) => s + Number(r.comments), 0),
            shares: rows.reduce((s, r) => s + Number(r.shares), 0),
            postsPublished: rows.reduce((s, r) => s + Number(r.posts_published), 0),
            totalLikes: rows.reduce((s, r) => s + Number(r.total_likes || 0), 0),
            totalComments: rows.reduce((s, r) => s + Number(r.total_comments || 0), 0),
            totalShares: rows.reduce((s, r) => s + Number(r.total_shares || 0), 0),
            postsCountPeriod: rows.reduce((s, r) => s + Number(r.posts_count_period || 0), 0),
          });
        }
        setPlatforms(results);
      } else {
        setHasData(false);
        setPlatforms([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [supabase, range.from, range.to]);

  return { platforms, loading, hasData };
}

// ==================== YouTube Videos ====================
// Tabla nueva: mkt_organic_video_metrics

export interface YouTubeVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  thumbnail: string;
}

export function useYouTubeVideos(range: DateRange) {
  const { supabase } = useAuth();
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    const fetchData = async () => {
      setLoading(true);

      // Get latest metrics for each video in range
      const { data } = await supabase
        .from('mkt_organic_video_metrics')
        .select('video_id, title, published_at, views, likes, comments, shares, thumbnail, date')
        .eq('platform', 'youtube')
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: false });

      if (data && data.length > 0) {
        // Keep only the latest row per video_id
        const latestByVideo = new Map<string, YouTubeVideo>();
        for (const row of data) {
          if (!latestByVideo.has(row.video_id)) {
            latestByVideo.set(row.video_id, {
              videoId: row.video_id,
              title: row.title || '',
              publishedAt: row.published_at || '',
              views: Number(row.views) || 0,
              likes: Number(row.likes) || 0,
              comments: Number(row.comments) || 0,
              shares: Number(row.shares) || 0,
              thumbnail: row.thumbnail || '',
            });
          }
        }
        setVideos(Array.from(latestByVideo.values()).sort((a, b) => b.views - a.views));
      } else {
        setVideos([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [supabase, range.from, range.to]);

  return { videos, loading };
}

// ==================== Web (GA4) ====================
// Schema real: mkt_web_metrics tiene hostname. UNIQUE(date, hostname).
// Hay 2 filas por fecha: app.califica.ai y califica.ai.
// Top pages vienen de mkt_web_page_metrics + mkt_web_pages (no del JSONB).

interface WebMetricRow {
  date: string;
  hostname: string;
  sessions: number;
  active_users: number;
  new_users: number;
  page_views: number;
  bounce_rate: number;
  avg_session_seconds: number;
  conversions_ga4: number;
  sources_breakdown: { source: string; medium: string; channel: string; sessions: number; new_users: number; conversions: number }[] | null;
}

export interface WebKpis {
  sessions: number;
  activeUsers: number;
  newUsers: number;
  pageViews: number;
  avgSessionMinutes: number;
  conversionsGa4: number;
}

export interface WebHostnameKpis extends WebKpis {
  hostname: string;
}

export interface WebSourceRow {
  channel: string;
  sessions: number;
  newUsers: number;
  conversions: number;
}

export interface WebPageRow {
  path: string;
  hostname: string;
  title: string;
  pageType: string;
  pageViews: number;
  sessions: number;
  avgDurationSeconds: number;
}

export function useWebData(range: DateRange) {
  const { supabase } = useAuth();
  const [kpis, setKpis] = useState<WebKpis | null>(null);
  const [hostnameKpis, setHostnameKpis] = useState<WebHostnameKpis[]>([]);
  const [sources, setSources] = useState<WebSourceRow[]>([]);
  const [topPages, setTopPages] = useState<WebPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const fetchData = async () => {
      setLoading(true);

      // Fetch web metrics (includes hostname)
      const { data } = await supabase
        .from('mkt_web_metrics')
        .select('date, hostname, sessions, active_users, new_users, page_views, bounce_rate, avg_session_seconds, conversions_ga4, sources_breakdown')
        .gte('date', range.from)
        .lte('date', range.to);

      if (data && data.length > 0) {
        setHasData(true);
        const rows = data as WebMetricRow[];

        // Total KPIs (both hostnames combined)
        const sessions = rows.reduce((s, r) => s + Number(r.sessions), 0);
        const activeUsers = rows.reduce((s, r) => s + Number(r.active_users), 0);
        const newUsers = rows.reduce((s, r) => s + Number(r.new_users), 0);
        const pageViews = rows.reduce((s, r) => s + Number(r.page_views), 0);
        const totalSeconds = rows.reduce((s, r) => s + Number(r.avg_session_seconds), 0);
        const conversionsGa4 = rows.reduce((s, r) => s + Number(r.conversions_ga4), 0);

        setKpis({
          sessions, activeUsers, newUsers, pageViews,
          avgSessionMinutes: rows.length > 0 ? (totalSeconds / rows.length) / 60 : 0,
          conversionsGa4,
        });

        // KPIs by hostname
        const byHost = new Map<string, WebMetricRow[]>();
        for (const row of rows) {
          const arr = byHost.get(row.hostname) || [];
          arr.push(row);
          byHost.set(row.hostname, arr);
        }

        const hostKpis: WebHostnameKpis[] = [];
        for (const [hostname, hRows] of byHost) {
          const hSessions = hRows.reduce((s, r) => s + Number(r.sessions), 0);
          const hActiveUsers = hRows.reduce((s, r) => s + Number(r.active_users), 0);
          const hNewUsers = hRows.reduce((s, r) => s + Number(r.new_users), 0);
          const hPageViews = hRows.reduce((s, r) => s + Number(r.page_views), 0);
          const hTotalSec = hRows.reduce((s, r) => s + Number(r.avg_session_seconds), 0);
          const hConversions = hRows.reduce((s, r) => s + Number(r.conversions_ga4), 0);

          hostKpis.push({
            hostname,
            sessions: hSessions,
            activeUsers: hActiveUsers,
            newUsers: hNewUsers,
            pageViews: hPageViews,
            avgSessionMinutes: hRows.length > 0 ? (hTotalSec / hRows.length) / 60 : 0,
            conversionsGa4: hConversions,
          });
        }
        setHostnameKpis(hostKpis.sort((a, b) => b.sessions - a.sessions));

        // Aggregate sources from JSONB
        const sourceMap = new Map<string, WebSourceRow>();
        for (const row of rows) {
          if (row.sources_breakdown) {
            for (const src of row.sources_breakdown) {
              const key = src.channel || 'Direct';
              const existing = sourceMap.get(key) || { channel: key, sessions: 0, newUsers: 0, conversions: 0 };
              existing.sessions += Number(src.sessions);
              existing.newUsers += Number(src.new_users);
              existing.conversions += Number(src.conversions);
              sourceMap.set(key, existing);
            }
          }
        }
        setSources(Array.from(sourceMap.values()).sort((a, b) => b.sessions - a.sessions));
      } else {
        setHasData(false);
        setKpis(null);
        setHostnameKpis([]);
        setSources([]);
      }

      // Fetch top pages from mkt_web_page_metrics + mkt_web_pages
      const { data: pageData } = await supabase
        .from('mkt_web_page_metrics')
        .select('path, hostname, date, page_views, sessions, avg_duration_seconds')
        .gte('date', range.from)
        .lte('date', range.to);

      if (pageData && pageData.length > 0) {
        // Aggregate by path+hostname
        const pageMap = new Map<string, { path: string; hostname: string; pageViews: number; sessions: number; totalDuration: number; count: number }>();
        for (const row of pageData) {
          const key = `${row.hostname}::${row.path}`;
          const existing = pageMap.get(key) || { path: row.path, hostname: row.hostname, pageViews: 0, sessions: 0, totalDuration: 0, count: 0 };
          existing.pageViews += Number(row.page_views) || 0;
          existing.sessions += Number(row.sessions) || 0;
          existing.totalDuration += Number(row.avg_duration_seconds) || 0;
          existing.count++;
          pageMap.set(key, existing);
        }

        // Fetch page titles and types from catalog
        const { data: catalog } = await supabase
          .from('mkt_web_pages')
          .select('path, hostname, title, page_type');

        const titleMap = new Map<string, { title: string; pageType: string }>();
        if (catalog) {
          for (const c of catalog) {
            titleMap.set(`${c.hostname}::${c.path}`, { title: c.title || c.path, pageType: c.page_type || '' });
          }
        }

        const pages: WebPageRow[] = Array.from(pageMap.values())
          .map((p) => {
            const info = titleMap.get(`${p.hostname}::${p.path}`);
            return {
              path: p.path,
              hostname: p.hostname,
              title: info?.title || p.path,
              pageType: info?.pageType || '',
              pageViews: p.pageViews,
              sessions: p.sessions,
              avgDurationSeconds: p.count > 0 ? p.totalDuration / p.count : 0,
            };
          })
          .sort((a, b) => b.pageViews - a.pageViews)
          .slice(0, 20);
        setTopPages(pages);
      } else {
        setTopPages([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [supabase, range.from, range.to]);

  return { kpis, hostnameKpis, sources, topPages, loading, hasData };
}

// ==================== Pages Catalog ====================

export interface PageCatalogRow {
  path: string;
  hostname: string;
  pageType: string;
  title: string;
  firstSeen: string;
  lastSeen: string;
  totalViews: number;
  totalSessions: number;
}

export function usePagesCatalog(range: DateRange, filterType: string, searchQuery: string) {
  const { supabase } = useAuth();
  const [pages, setPages] = useState<PageCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    const fetchData = async () => {
      setLoading(true);

      // Fetch all pages from catalog
      let q = supabase.from('mkt_web_pages').select('path, hostname, title, page_type, first_seen, last_seen');
      if (filterType && filterType !== 'all') {
        q = q.eq('page_type', filterType);
      }
      if (searchQuery) {
        q = q.ilike('path', `%${searchQuery}%`);
      }

      const { data: catalog } = await q.order('last_seen', { ascending: false });

      if (catalog && catalog.length > 0) {
        // Fetch aggregated metrics for these pages
        const { data: metricsData } = await supabase
          .from('mkt_web_page_metrics')
          .select('path, hostname, page_views, sessions')
          .gte('date', range.from)
          .lte('date', range.to);

        const metricsMap = new Map<string, { views: number; sessions: number }>();
        if (metricsData) {
          for (const m of metricsData) {
            const key = `${m.hostname}::${m.path}`;
            const existing = metricsMap.get(key) || { views: 0, sessions: 0 };
            existing.views += Number(m.page_views) || 0;
            existing.sessions += Number(m.sessions) || 0;
            metricsMap.set(key, existing);
          }
        }

        const result: PageCatalogRow[] = catalog.map((c) => {
          const key = `${c.hostname}::${c.path}`;
          const metrics = metricsMap.get(key) || { views: 0, sessions: 0 };
          return {
            path: c.path,
            hostname: c.hostname,
            pageType: c.page_type || '',
            title: c.title || c.path,
            firstSeen: c.first_seen || '',
            lastSeen: c.last_seen || '',
            totalViews: metrics.views,
            totalSessions: metrics.sessions,
          };
        });

        setPages(result.sort((a, b) => b.totalViews - a.totalViews));
      } else {
        setPages([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [supabase, range.from, range.to, filterType, searchQuery]);

  return { pages, loading };
}

// ==================== Organic Posts (FB + IG) ====================

export interface OrganicPost {
  platform: string;
  postId: string;
  date: string;
  publishedAt: string;
  message: string;
  postType: string;
  permalink: string;
  thumbnail: string;
  likes: number;
  comments: number;
  shares: number;
  engagementScore: number;
}

export function useOrganicPosts(range: DateRange) {
  const { supabase } = useAuth();
  const [posts, setPosts] = useState<OrganicPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    const fetchData = async () => {
      setLoading(true);

      const { data } = await supabase
        .from('mkt_organic_post_metrics')
        .select('platform, post_id, date, published_at, message, post_type, permalink, thumbnail, likes, comments, shares')
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: false });

      if (data && data.length > 0) {
        // Keep latest row per post_id (in case of multiple dates)
        const latestByPost = new Map<string, OrganicPost>();
        for (const row of data) {
          const key = `${row.platform}::${row.post_id}`;
          if (!latestByPost.has(key)) {
            const likes = Number(row.likes) || 0;
            const comments = Number(row.comments) || 0;
            const shares = Number(row.shares) || 0;
            latestByPost.set(key, {
              platform: row.platform,
              postId: row.post_id,
              date: row.date,
              publishedAt: row.published_at || row.date,
              message: row.message || '',
              postType: row.post_type || '',
              permalink: row.permalink || '',
              thumbnail: row.thumbnail || '',
              likes,
              comments,
              shares,
              engagementScore: likes + comments * 3 + shares * 5,
            });
          }
        }
        setPosts(Array.from(latestByPost.values()).sort((a, b) => b.engagementScore - a.engagementScore));
      } else {
        setPosts([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [supabase, range.from, range.to]);

  return { posts, loading };
}

// ==================== Conversions ====================

export interface ConversionsData {
  totalRegistrations: number;
  totalPurchases: number;
  totalRevenue: number;
  conversionRate: number;
  utmBreakdown: { source: string; registrations: number; purchases: number }[];
  hasUtmData: boolean;
}

export function useConversionsData(range: DateRange) {
  const { supabase } = useAuth();
  const [data, setData] = useState<ConversionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    const fetchData = async () => {
      setLoading(true);

      const { count: regCount } = await supabase
        .from('growth_users')
        .select('*', { count: 'exact', head: true })
        .gte('created_date', range.from)
        .lte('created_date', range.to);

      const { data: orders } = await supabase
        .from('rev_orders')
        .select('amount_usd, utm_source')
        .gte('created_at', `${range.from}T00:00:00`)
        .lte('created_at', `${range.to}T23:59:59`);

      const totalRegistrations = regCount || 0;
      const totalPurchases = orders?.length || 0;
      const totalRevenue = orders?.reduce((s, o) => s + (Number(o.amount_usd) || 0), 0) || 0;

      const { data: regUtm } = await supabase
        .from('growth_users')
        .select('utm_source')
        .gte('created_date', range.from)
        .lte('created_date', range.to)
        .not('utm_source', 'is', null);

      const utmMap = new Map<string, { registrations: number; purchases: number }>();
      let hasUtmData = false;

      if (regUtm && regUtm.length > 0) {
        hasUtmData = true;
        for (const r of regUtm) {
          const src = r.utm_source || 'desconocido';
          const existing = utmMap.get(src) || { registrations: 0, purchases: 0 };
          existing.registrations++;
          utmMap.set(src, existing);
        }
      }

      if (orders) {
        for (const o of orders) {
          if (o.utm_source) {
            hasUtmData = true;
            const existing = utmMap.get(o.utm_source) || { registrations: 0, purchases: 0 };
            existing.purchases++;
            utmMap.set(o.utm_source, existing);
          }
        }
      }

      setData({
        totalRegistrations,
        totalPurchases,
        totalRevenue,
        conversionRate: totalRegistrations > 0 ? (totalPurchases / totalRegistrations) * 100 : 0,
        utmBreakdown: Array.from(utmMap.entries()).map(([source, v]) => ({ source, ...v })).sort((a, b) => b.registrations - a.registrations),
        hasUtmData,
      });

      setLoading(false);
    };

    fetchData();
  }, [supabase, range.from, range.to]);

  return { data, loading };
}

// ==================== Trend Hooks (daily data for charts) ====================

export interface AdsTrendPoint {
  date: string;
  spend: number;
  conversions: number;
  impressions: number;
  clicks: number;
  cpa: number;
  ctr: number;
}

export function useAdsTrend(range: DateRange) {
  const { supabase } = useAuth();
  const [data, setData] = useState<AdsTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from('mkt_ad_metrics')
        .select('date, spend, conversions, impressions, clicks')
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: true });

      if (rows && rows.length > 0) {
        // Aggregate by date (all platforms combined)
        const byDate = new Map<string, { spend: number; conversions: number; impressions: number; clicks: number }>();
        for (const r of rows) {
          const existing = byDate.get(r.date) || { spend: 0, conversions: 0, impressions: 0, clicks: 0 };
          existing.spend += Number(r.spend) || 0;
          existing.conversions += Number(r.conversions) || 0;
          existing.impressions += Number(r.impressions) || 0;
          existing.clicks += Number(r.clicks) || 0;
          byDate.set(r.date, existing);
        }
        setData(Array.from(byDate.entries()).map(([date, v]) => ({
          date,
          ...v,
          cpa: v.conversions > 0 ? v.spend / v.conversions : 0,
          ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
        })));
      } else {
        setData([]);
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase, range.from, range.to]);

  return { data, loading };
}

export interface OrganicTrendPoint {
  date: string;
  facebook_followers: number;
  instagram_followers: number;
  youtube_followers: number;
  facebook_engagement: number;
  instagram_engagement: number;
  youtube_engagement: number;
  total_followers_delta: number;
}

export function useOrganicTrend(range: DateRange) {
  const { supabase } = useAuth();
  const [data, setData] = useState<OrganicTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from('mkt_organic_metrics_enriched')
        .select('platform_name, date, followers, followers_delta, engagement, total_likes, total_comments, total_shares')
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: true });

      if (rows && rows.length > 0) {
        const byDate = new Map<string, OrganicTrendPoint>();
        for (const r of rows) {
          const existing = byDate.get(r.date) || {
            date: r.date,
            facebook_followers: 0, instagram_followers: 0, youtube_followers: 0,
            facebook_engagement: 0, instagram_engagement: 0, youtube_engagement: 0,
            total_followers_delta: 0,
          };
          const platform = (r.platform_name || '').toLowerCase();
          const followers = Number(r.followers) || 0;
          const engagement = Number(r.engagement) || (Number(r.total_likes) || 0) + (Number(r.total_comments) || 0) + (Number(r.total_shares) || 0);
          const delta = Number(r.followers_delta) || 0;

          if (platform === 'facebook') { existing.facebook_followers = followers; existing.facebook_engagement += engagement; }
          else if (platform === 'instagram') { existing.instagram_followers = followers; existing.instagram_engagement += engagement; }
          else if (platform === 'youtube') { existing.youtube_followers = followers; existing.youtube_engagement += engagement; }

          existing.total_followers_delta += delta;
          byDate.set(r.date, existing);
        }

        // Forward-fill: if a platform has 0 followers on a day, carry forward from previous day
        const sorted = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
        let prevFb = 0, prevIg = 0, prevYt = 0;
        for (const [, point] of sorted) {
          if (point.facebook_followers > 0) prevFb = point.facebook_followers; else point.facebook_followers = prevFb;
          if (point.instagram_followers > 0) prevIg = point.instagram_followers; else point.instagram_followers = prevIg;
          if (point.youtube_followers > 0) prevYt = point.youtube_followers; else point.youtube_followers = prevYt;
        }
        setData(sorted.map(([, v]) => v));
      } else {
        setData([]);
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase, range.from, range.to]);

  return { data, loading };
}

export interface WebTrendPoint {
  date: string;
  app_sessions: number;
  web_sessions: number;
  app_new_users: number;
  web_new_users: number;
}

export function useWebTrend(range: DateRange) {
  const { supabase } = useAuth();
  const [data, setData] = useState<WebTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from('mkt_web_metrics')
        .select('date, hostname, sessions, new_users')
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: true });

      if (rows && rows.length > 0) {
        const byDate = new Map<string, WebTrendPoint>();
        for (const r of rows) {
          const existing = byDate.get(r.date) || { date: r.date, app_sessions: 0, web_sessions: 0, app_new_users: 0, web_new_users: 0 };
          if (r.hostname === 'app.califica.ai') {
            existing.app_sessions += Number(r.sessions) || 0;
            existing.app_new_users += Number(r.new_users) || 0;
          } else {
            existing.web_sessions += Number(r.sessions) || 0;
            existing.web_new_users += Number(r.new_users) || 0;
          }
          byDate.set(r.date, existing);
        }
        setData(Array.from(byDate.values()));
      } else {
        setData([]);
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase, range.from, range.to]);

  return { data, loading };
}
