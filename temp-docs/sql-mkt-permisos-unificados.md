# SQL: Unificar permisos de Marketing

Cambiar las policies de RLS para que todos los usuarios con mod_marketing=true
vean todo el contenido (ads, web, sync) — no solo orgánico.

Ejecutar en Supabase SQL Editor.

```sql
-- Eliminar policies restrictivas de ads (superadmin-only)
DROP POLICY IF EXISTS "mkt_ad_accounts_superadmin_select" ON mkt_ad_accounts;
DROP POLICY IF EXISTS "mkt_campaigns_superadmin_select" ON mkt_campaigns;
DROP POLICY IF EXISTS "mkt_ad_metrics_superadmin_select" ON mkt_ad_metrics;
DROP POLICY IF EXISTS "mkt_web_metrics_superadmin_select" ON mkt_web_metrics;
DROP POLICY IF EXISTS "mkt_sync_logs_superadmin_select" ON mkt_sync_logs;
DROP POLICY IF EXISTS "mkt_web_pages_superadmin_select" ON mkt_web_pages;
DROP POLICY IF EXISTS "mkt_web_page_metrics_superadmin_select" ON mkt_web_page_metrics;

-- Reemplazar con policies que usen mkt_has_access() (superadmin OR mod_marketing=true)
CREATE POLICY "mkt_ad_accounts_authorized_select" ON mkt_ad_accounts
  FOR SELECT USING (mkt_has_access());

CREATE POLICY "mkt_campaigns_authorized_select" ON mkt_campaigns
  FOR SELECT USING (mkt_has_access());

CREATE POLICY "mkt_ad_metrics_authorized_select" ON mkt_ad_metrics
  FOR SELECT USING (mkt_has_access());

CREATE POLICY "mkt_web_metrics_authorized_select" ON mkt_web_metrics
  FOR SELECT USING (mkt_has_access());

CREATE POLICY "mkt_sync_logs_authorized_select" ON mkt_sync_logs
  FOR SELECT USING (mkt_has_access());

CREATE POLICY "mkt_web_pages_authorized_select" ON mkt_web_pages
  FOR SELECT USING (mkt_has_access());

CREATE POLICY "mkt_web_page_metrics_authorized_select" ON mkt_web_page_metrics
  FOR SELECT USING (mkt_has_access());
```
