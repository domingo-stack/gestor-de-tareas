-- ============================================================
-- Cleanup: Eliminar versiones viejas (huérfanas) de RPCs duplicadas
-- Postgres permite function overloading; cuando hay 2 firmas distintas
-- de la misma función, supabase.rpc() falla con error vacío {} porque
-- no puede resolver cuál llamar.
--
-- Estas firmas viejas quedaron por:
--  - Migrations que crearon una versión simple primero
--  - SQLs en temp-docs que se corrieron manualmente con firmas distintas
--  - Nuestra propia evolución de get_weekly_operational_metrics
-- ============================================================

DROP FUNCTION IF EXISTS get_acquisition_stats();
DROP FUNCTION IF EXISTS get_acquisition_stats(date);
DROP FUNCTION IF EXISTS get_churn_renewal(date, integer);
DROP FUNCTION IF EXISTS get_comm_metrics();
DROP FUNCTION IF EXISTS get_conversion_funnel(date, integer);
DROP FUNCTION IF EXISTS get_my_assigned_tasks_with_projects();
DROP FUNCTION IF EXISTS get_weekly_operational_metrics(date, integer);
