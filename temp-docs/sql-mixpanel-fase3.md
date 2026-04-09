# SQL Mixpanel Fase 3: Ajustes de tablas + RPCs

Ejecutar en Supabase SQL Editor en orden.

---

## Bloque 1: Verificar schemas actuales

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('growth_metrics_daily', 'growth_retention', 'growth_funnels', 'growth_events')
ORDER BY table_name, ordinal_position;
```

---

## Bloque 2: Ajustar tablas

```sql
-- growth_metrics_daily: agregar columnas de segmentacion
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS dau_paid int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS dau_free int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS wau_paid int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS wau_free int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS mau_paid int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS mau_free int DEFAULT 0;

-- growth_retention: agregar period_type y cohort_size
ALTER TABLE growth_retention ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'week';
ALTER TABLE growth_retention ADD COLUMN IF NOT EXISTS cohort_size int DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'growth_retention_unique') THEN
    ALTER TABLE growth_retention ADD CONSTRAINT growth_retention_unique
      UNIQUE (cohort_date, period_number, period_type);
  END IF;
END $$;

-- growth_funnels: agregar conversion_pct y constraint
ALTER TABLE growth_funnels ADD COLUMN IF NOT EXISTS conversion_pct numeric DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'growth_funnels_unique') THEN
    ALTER TABLE growth_funnels ADD CONSTRAINT growth_funnels_unique
      UNIQUE (funnel_name, step_number, period_start);
  END IF;
END $$;
```

---

## Bloque 3: RPC `get_behavior_metrics`

```sql
CREATE OR REPLACE FUNCTION get_behavior_metrics(
  p_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  v_has_metrics boolean;
  v_has_retention boolean;
  daily_arr jsonb := '[]'::jsonb;
  retention_weekly_arr jsonb := '[]'::jsonb;
  retention_daily_arr jsonb := '[]'::jsonb;
  summary_obj jsonb;
  v_avg_dau numeric;
  v_avg_wau numeric;
  v_avg_mau numeric;
  v_d1_avg numeric;
  v_d7_avg numeric;
  v_d30_avg numeric;
BEGIN
  -- Check if tables have data
  SELECT EXISTS(SELECT 1 FROM growth_metrics_daily LIMIT 1) INTO v_has_metrics;
  SELECT EXISTS(SELECT 1 FROM growth_retention LIMIT 1) INTO v_has_retention;

  IF NOT v_has_metrics AND NOT v_has_retention THEN
    RETURN jsonb_build_object('has_data', false);
  END IF;

  -- Daily metrics (last N days)
  IF v_has_metrics THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'date', metric_date,
        'dau', COALESCE(dau, 0),
        'wau', COALESCE(wau, 0),
        'mau', COALESCE(mau, 0),
        'dau_paid', COALESCE(dau_paid, 0),
        'dau_free', COALESCE(dau_free, 0)
      ) ORDER BY metric_date
    ), '[]'::jsonb)
    INTO daily_arr
    FROM growth_metrics_daily
    WHERE metric_date >= CURRENT_DATE - p_days;

    -- Averages
    SELECT
      COALESCE(ROUND(AVG(dau), 0), 0),
      COALESCE(ROUND(AVG(wau), 0), 0),
      COALESCE(ROUND(AVG(mau), 0), 0)
    INTO v_avg_dau, v_avg_wau, v_avg_mau
    FROM growth_metrics_daily
    WHERE metric_date >= CURRENT_DATE - p_days;
  ELSE
    v_avg_dau := 0; v_avg_wau := 0; v_avg_mau := 0;
  END IF;

  -- Weekly retention cohorts (last 12 weeks)
  IF v_has_retention THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'cohort_date', cohort_week,
        'cohort_size', cohort_size,
        'period_number', day_n,
        'users_count', retained_users,
        'retention_pct', retention_pct
      ) ORDER BY cohort_week, day_n
    ), '[]'::jsonb)
    INTO retention_weekly_arr
    FROM growth_retention
    WHERE period_type = 'week'
      AND cohort_week >= CURRENT_DATE - 84; -- 12 weeks

    -- Daily retention (key days: 1, 3, 7, 14, 30)
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'cohort_date', cohort_week,
        'cohort_size', cohort_size,
        'period_number', day_n,
        'users_count', retained_users,
        'retention_pct', retention_pct
      ) ORDER BY cohort_week, day_n
    ), '[]'::jsonb)
    INTO retention_daily_arr
    FROM growth_retention
    WHERE period_type = 'day'
      AND day_n IN (1, 3, 7, 14, 30)
      AND cohort_week >= CURRENT_DATE - 90;

    -- Retention averages
    SELECT
      COALESCE(ROUND(AVG(retention_pct), 1), 0)
    INTO v_d1_avg
    FROM growth_retention
    WHERE period_type = 'day' AND day_n = 1
      AND cohort_week >= CURRENT_DATE - 90;

    SELECT
      COALESCE(ROUND(AVG(retention_pct), 1), 0)
    INTO v_d7_avg
    FROM growth_retention
    WHERE period_type = 'day' AND day_n = 7
      AND cohort_week >= CURRENT_DATE - 90;

    SELECT
      COALESCE(ROUND(AVG(retention_pct), 1), 0)
    INTO v_d30_avg
    FROM growth_retention
    WHERE period_type = 'day' AND day_n = 30
      AND cohort_week >= CURRENT_DATE - 90;
  ELSE
    v_d1_avg := 0; v_d7_avg := 0; v_d30_avg := 0;
  END IF;

  summary_obj := jsonb_build_object(
    'avg_dau', v_avg_dau,
    'avg_wau', v_avg_wau,
    'avg_mau', v_avg_mau,
    'd1_retention_avg', v_d1_avg,
    'd7_retention_avg', v_d7_avg,
    'd30_retention_avg', v_d30_avg
  );

  result := jsonb_build_object(
    'has_data', true,
    'has_metrics', v_has_metrics,
    'has_retention', v_has_retention,
    'daily_metrics', daily_arr,
    'retention_weekly', retention_weekly_arr,
    'retention_daily', retention_daily_arr,
    'summary', summary_obj
  );

  RETURN result;
END;
$$;
```

---

## Bloque 4: RPC `get_onboarding_funnel`

```sql
CREATE OR REPLACE FUNCTION get_onboarding_funnel(
  p_weeks int DEFAULT 4
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  v_has_data boolean;
  onboarding_arr jsonb := '[]'::jsonb;
  paywall_arr jsonb := '[]'::jsonb;
  weekly_arr jsonb := '[]'::jsonb;
  v_latest_period date;
BEGIN
  SELECT EXISTS(SELECT 1 FROM growth_funnels LIMIT 1) INTO v_has_data;
  IF NOT v_has_data THEN
    RETURN jsonb_build_object('has_data', false);
  END IF;

  -- Latest period for each funnel
  SELECT MAX(period_start) INTO v_latest_period FROM growth_funnels;

  -- Onboarding funnel (latest period)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'step', step_number,
      'name', step_name,
      'count', users_count,
      'pct', conversion_pct
    ) ORDER BY step_number
  ), '[]'::jsonb)
  INTO onboarding_arr
  FROM growth_funnels
  WHERE funnel_name = 'onboarding'
    AND period_start = v_latest_period;

  -- Paywall funnel (latest period)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'step', step_number,
      'name', step_name,
      'count', users_count,
      'pct', conversion_pct
    ) ORDER BY step_number
  ), '[]'::jsonb)
  INTO paywall_arr
  FROM growth_funnels
  WHERE funnel_name = 'paywall'
    AND period_start = v_latest_period;

  -- Weekly trend (last N weeks, onboarding funnel completion rate)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'period', period_start,
      'steps', steps_data
    ) ORDER BY period_start
  ), '[]'::jsonb)
  INTO weekly_arr
  FROM (
    SELECT
      period_start,
      jsonb_agg(
        jsonb_build_object(
          'step', step_number,
          'name', step_name,
          'count', users_count,
          'pct', conversion_pct
        ) ORDER BY step_number
      ) AS steps_data
    FROM growth_funnels
    WHERE funnel_name = 'onboarding'
      AND period_start >= CURRENT_DATE - (p_weeks * 7)
    GROUP BY period_start
  ) sub;

  result := jsonb_build_object(
    'has_data', true,
    'onboarding', onboarding_arr,
    'paywall', paywall_arr,
    'weekly_trend', weekly_arr
  );

  RETURN result;
END;
$$;
```
