-- ============================================================
-- MIGRACIÓN: RLS para tablas creadas durante implementación n8n
-- Fecha: 2026-03-20
-- Tablas: mkt_web_pages, mkt_web_page_metrics, mkt_organic_video_metrics
-- NOTA: Estas tablas ya existen en Supabase (creadas via n8n).
--       Este SQL solo agrega RLS policies.
-- ============================================================

-- Habilitar RLS
ALTER TABLE mkt_web_pages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_web_page_metrics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_organic_video_metrics ENABLE ROW LEVEL SECURITY;

-- mkt_web_pages y mkt_web_page_metrics: solo superadmin (misma regla que mkt_web_metrics)
CREATE POLICY "mkt_web_pages_superadmin_select" ON mkt_web_pages
  FOR SELECT USING (mkt_is_superadmin());

CREATE POLICY "mkt_web_page_metrics_superadmin_select" ON mkt_web_page_metrics
  FOR SELECT USING (mkt_is_superadmin());

-- mkt_organic_video_metrics: superadmin + usuarios con mod_marketing (orgánico)
CREATE POLICY "mkt_organic_video_metrics_authorized_select" ON mkt_organic_video_metrics
  FOR SELECT USING (mkt_has_access());
