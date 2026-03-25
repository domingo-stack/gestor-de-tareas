-- ============================================================
-- MIGRACIÓN: Módulo de Marketing (MVP)
-- Fecha: 2026-03-18
-- Descripción: Tablas mkt_, índices, RLS, campos UTM, permiso mod_marketing
-- ============================================================

-- ============================================================
-- FASE 1: Agregar permiso mod_marketing a user_permissions
-- ============================================================

ALTER TABLE user_permissions
  ADD COLUMN IF NOT EXISTS mod_marketing BOOLEAN DEFAULT false;

-- Actualizar RPC get_user_role_and_permissions para incluir mod_marketing
-- NOTA: Esta RPC ya fue extendida fuera de migraciones con mod_producto,
-- mod_customer_success, mod_comunicaciones. Se recrea completa aquí.
CREATE OR REPLACE FUNCTION get_user_role_and_permissions()
RETURNS TABLE (
  role TEXT,
  mod_tareas BOOLEAN,
  mod_calendario BOOLEAN,
  mod_revenue BOOLEAN,
  mod_finanzas BOOLEAN,
  mod_producto BOOLEAN,
  mod_customer_success BOOLEAN,
  mod_comunicaciones BOOLEAN,
  mod_marketing BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT p.role INTO v_role FROM profiles p WHERE p.id = auth.uid();

  IF v_role = 'superadmin' THEN
    RETURN QUERY SELECT
      v_role,
      true::boolean, true::boolean, true::boolean, true::boolean,
      true::boolean, true::boolean, true::boolean, true::boolean;
  ELSE
    RETURN QUERY SELECT
      v_role,
      COALESCE(up.mod_tareas, false),
      COALESCE(up.mod_calendario, false),
      COALESCE(up.mod_revenue, false),
      COALESCE(up.mod_finanzas, false),
      COALESCE(up.mod_producto, false),
      COALESCE(up.mod_customer_success, false),
      COALESCE(up.mod_comunicaciones, false),
      COALESCE(up.mod_marketing, false)
    FROM user_permissions up
    WHERE up.user_id = auth.uid();
  END IF;
END;
$$;

-- ============================================================
-- FASE 2: Tablas del módulo de marketing
-- ============================================================

-- 2.1 mkt_ad_accounts
CREATE TABLE mkt_ad_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  account_id    TEXT NOT NULL,
  account_name  TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, account_id)
);

-- 2.2 mkt_campaigns
CREATE TABLE mkt_campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id         UUID REFERENCES mkt_ad_accounts(id) ON DELETE CASCADE,
  platform_campaign_id  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  status                TEXT CHECK (status IN ('active', 'paused', 'archived', 'deleted')),
  objective             TEXT,
  daily_budget          NUMERIC(12,2),
  lifetime_budget       NUMERIC(12,2),
  platform              TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  last_synced_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, platform_campaign_id)
);

CREATE INDEX idx_mkt_campaigns_account ON mkt_campaigns(ad_account_id);
CREATE INDEX idx_mkt_campaigns_status  ON mkt_campaigns(status);

-- 2.3 mkt_ad_metrics
CREATE TABLE mkt_ad_metrics (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        UUID REFERENCES mkt_campaigns(id) ON DELETE CASCADE,
  platform           TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  date               DATE NOT NULL,
  spend              NUMERIC(12,4) DEFAULT 0,
  impressions        BIGINT DEFAULT 0,
  clicks             BIGINT DEFAULT 0,
  reach              BIGINT DEFAULT 0,
  conversions        NUMERIC(10,2) DEFAULT 0,
  conversion_value   NUMERIC(12,4) DEFAULT 0,
  ctr                NUMERIC(8,4),
  cpc                NUMERIC(8,4),
  cpm                NUMERIC(8,4),
  cpa                NUMERIC(8,4),
  roas               NUMERIC(8,4),
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, date)
);

CREATE INDEX idx_mkt_ad_metrics_campaign_date ON mkt_ad_metrics(campaign_id, date DESC);
CREATE INDEX idx_mkt_ad_metrics_platform_date ON mkt_ad_metrics(platform, date DESC);

COMMENT ON COLUMN mkt_ad_metrics.ctr IS 'Calculado: clicks/impressions. Se almacena para evitar recalcular.';
COMMENT ON COLUMN mkt_ad_metrics.roas IS 'Calculado: conversion_value/spend. 0 si spend=0.';

-- 2.4 mkt_organic_accounts
CREATE TABLE mkt_organic_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform       TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'youtube', 'tiktok')),
  account_id     TEXT NOT NULL,
  account_name   TEXT,
  followers      BIGINT DEFAULT 0,
  is_active      BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, account_id)
);

-- 2.5 mkt_organic_metrics
CREATE TABLE mkt_organic_metrics (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organic_account_id UUID REFERENCES mkt_organic_accounts(id) ON DELETE CASCADE,
  platform           TEXT NOT NULL,
  date               DATE NOT NULL,
  followers          BIGINT DEFAULT 0,
  followers_delta    INTEGER DEFAULT 0,
  impressions        BIGINT DEFAULT 0,
  reach              BIGINT DEFAULT 0,
  engagement         BIGINT DEFAULT 0,
  views              BIGINT DEFAULT 0,
  likes              BIGINT DEFAULT 0,
  comments           BIGINT DEFAULT 0,
  shares             BIGINT DEFAULT 0,
  posts_published    INTEGER DEFAULT 0,
  raw_data           JSONB,
  created_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organic_account_id, date)
);

CREATE INDEX idx_mkt_organic_metrics_account_date ON mkt_organic_metrics(organic_account_id, date DESC);

COMMENT ON COLUMN mkt_organic_metrics.raw_data IS 'JSON completo de la API para no perder datos. Permite agregar métricas nuevas sin migraciones.';

-- 2.6 mkt_web_metrics (Google Analytics 4)
CREATE TABLE mkt_web_metrics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                DATE NOT NULL UNIQUE,
  sessions            INTEGER DEFAULT 0,
  active_users        INTEGER DEFAULT 0,
  new_users           INTEGER DEFAULT 0,
  page_views          INTEGER DEFAULT 0,
  bounce_rate         NUMERIC(6,4),
  avg_session_seconds NUMERIC(10,2),
  conversions_ga4     INTEGER DEFAULT 0,
  sources_breakdown   JSONB,
  top_pages           JSONB,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mkt_web_metrics_date ON mkt_web_metrics(date DESC);

COMMENT ON COLUMN mkt_web_metrics.sources_breakdown IS
  'Array JSON: [{source, medium, channel, sessions, new_users, conversions}]';
COMMENT ON COLUMN mkt_web_metrics.top_pages IS
  'Array JSON: [{path, title, page_views, sessions, avg_duration_seconds}]';
COMMENT ON COLUMN mkt_web_metrics.conversions_ga4 IS
  'Conversiones registradas en GA4. Pueden ser parciales si los eventos tienen errores.';

-- 2.7 mkt_sync_logs
CREATE TABLE mkt_sync_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT NOT NULL CHECK (source IN (
                      'meta_ads', 'google_ads', 'tiktok_ads',
                      'meta_organic', 'instagram_organic',
                      'youtube_organic', 'tiktok_organic',
                      'ga4'
                    )),
  status            TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  records_processed INTEGER DEFAULT 0,
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL,
  finished_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mkt_sync_logs_source_created ON mkt_sync_logs(source, created_at DESC);

-- ============================================================
-- FASE 3: Campos UTM en tablas existentes
-- ============================================================
-- Las tablas reales son growth_users (usuarios de Bubble) y rev_orders (pagos).
-- El PRD dice "users" y "purchases" pero en este proyecto son growth_users y rev_orders.

ALTER TABLE growth_users
  ADD COLUMN IF NOT EXISTS utm_source    TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium    TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign  TEXT,
  ADD COLUMN IF NOT EXISTS utm_content   TEXT;

ALTER TABLE rev_orders
  ADD COLUMN IF NOT EXISTS utm_source    TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium    TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign  TEXT;

CREATE INDEX IF NOT EXISTS idx_growth_users_utm_source ON growth_users(utm_source);
CREATE INDEX IF NOT EXISTS idx_rev_orders_utm_source   ON rev_orders(utm_source);

-- ============================================================
-- FASE 4: Row Level Security
-- ============================================================

ALTER TABLE mkt_ad_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_ad_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_organic_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_organic_metrics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_web_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_sync_logs        ENABLE ROW LEVEL SECURITY;

-- Función helper para verificar si el usuario es superadmin
-- (reutiliza el patrón existente del proyecto)
CREATE OR REPLACE FUNCTION mkt_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

-- Función helper para verificar acceso al módulo marketing
CREATE OR REPLACE FUNCTION mkt_has_access()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT mkt_is_superadmin() OR EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = auth.uid() AND mod_marketing = true
  );
$$;

-- === Ads: solo superadmin ===

CREATE POLICY "mkt_ad_accounts_superadmin_select" ON mkt_ad_accounts
  FOR SELECT USING (mkt_is_superadmin());

CREATE POLICY "mkt_campaigns_superadmin_select" ON mkt_campaigns
  FOR SELECT USING (mkt_is_superadmin());

CREATE POLICY "mkt_ad_metrics_superadmin_select" ON mkt_ad_metrics
  FOR SELECT USING (mkt_is_superadmin());

CREATE POLICY "mkt_web_metrics_superadmin_select" ON mkt_web_metrics
  FOR SELECT USING (mkt_is_superadmin());

-- === Orgánico: superadmin + usuarios con mod_marketing ===

CREATE POLICY "mkt_organic_accounts_authorized_select" ON mkt_organic_accounts
  FOR SELECT USING (mkt_has_access());

CREATE POLICY "mkt_organic_metrics_authorized_select" ON mkt_organic_metrics
  FOR SELECT USING (mkt_has_access());

-- === Sync logs: superadmin ===

CREATE POLICY "mkt_sync_logs_superadmin_select" ON mkt_sync_logs
  FOR SELECT USING (mkt_is_superadmin());

-- === Service role (n8n) puede insertar/actualizar en todas las tablas ===
-- n8n usa SUPABASE_SERVICE_ROLE_KEY que bypasea RLS automáticamente,
-- por lo que no necesita policies de INSERT/UPDATE explícitas.

-- ============================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================
