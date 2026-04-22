-- ============================================================
-- Agregar nuevos sources para sync logs de la plataforma migrada
-- payments_platform: sync de rev_orders desde nueva plataforma
-- users_platform: sync de growth_users desde nueva plataforma
-- ============================================================

ALTER TABLE mkt_sync_logs DROP CONSTRAINT mkt_sync_logs_source_check;

ALTER TABLE mkt_sync_logs ADD CONSTRAINT mkt_sync_logs_source_check
CHECK (source = ANY (ARRAY[
  'meta_ads'::text,
  'google_ads'::text,
  'tiktok_ads'::text,
  'meta_organic'::text,
  'instagram_organic'::text,
  'youtube_organic'::text,
  'tiktok_organic'::text,
  'ga4'::text,
  'mixpanel_metrics'::text,
  'mixpanel_retention'::text,
  'mixpanel_funnels'::text,
  'mixpanel_events'::text,
  'payments_platform'::text,
  'users_platform'::text
]));
