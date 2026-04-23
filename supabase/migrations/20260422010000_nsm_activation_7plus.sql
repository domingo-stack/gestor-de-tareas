-- ============================================================
-- NSM: North Star Metric — cambiar umbral de activación 5+ → 7+
-- Afecta: get_executive_summary, get_conversion_funnel,
--         get_conversion_trend_12w
-- Método: extraer definición actual, replace threshold, recrear
-- ============================================================

-- 1. get_executive_summary: 5+ → 7+
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'get_executive_summary'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NOT NULL THEN
    v_src := replace(v_src, '>= 5', '>= 7');
    v_src := replace(v_src, '''5+''', '''7+''');
    v_src := replace(v_src, 'Activados (5+)', 'Activados (7+)');
    EXECUTE v_src;
    RAISE NOTICE 'get_executive_summary actualizada: 5+ → 7+';
  ELSE
    RAISE WARNING 'get_executive_summary no encontrada, skip';
  END IF;
END $$;

-- 2. get_conversion_funnel: 5+ → 7+
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'get_conversion_funnel'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NOT NULL THEN
    v_src := replace(v_src, '>= 5', '>= 7');
    v_src := replace(v_src, '''5+''', '''7+''');
    v_src := replace(v_src, 'Activados (5+)', 'Activados (7+)');
    EXECUTE v_src;
    RAISE NOTICE 'get_conversion_funnel actualizada: 5+ → 7+';
  ELSE
    RAISE WARNING 'get_conversion_funnel no encontrada, skip';
  END IF;
END $$;

-- 3. get_conversion_trend_12w: 5+ → 7+
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'get_conversion_trend_12w'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NOT NULL THEN
    v_src := replace(v_src, '>= 5', '>= 7');
    v_src := replace(v_src, '''5+''', '''7+''');
    v_src := replace(v_src, 'Activados (5+)', 'Activados (7+)');
    EXECUTE v_src;
    RAISE NOTICE 'get_conversion_trend_12w actualizada: 5+ → 7+';
  ELSE
    RAISE WARNING 'get_conversion_trend_12w no encontrada, skip';
  END IF;
END $$;

-- 4. Nueva RPC: get_nsm_analysis (análisis completo de North Star Metric)
CREATE OR REPLACE FUNCTION get_nsm_analysis(
  p_country_filter text DEFAULT NULL,
  p_registration_period text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_has_filter boolean;
  v_period_start date;
  v_distribution jsonb;
  v_time_to_activation jsonb;
  v_weekly_trend jsonb := '[]'::jsonb;
  v_cohort_activation jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_total bigint;
  v_total_7plus bigint;
  v_nsm_this_week bigint;
  v_nsm_prev_week bigint;
  i int;
  w_start date;
  w_end date;
  w_label text;
  w_registered bigint;
  w_activated bigint;
  w_total_acc bigint;
BEGIN
  v_has_filter := p_country_filter IS NOT NULL AND p_country_filter <> 'all' AND p_country_filter <> '';

  -- Período de registro
  IF p_registration_period = '30d' THEN
    v_period_start := CURRENT_DATE - 30;
  ELSIF p_registration_period = '90d' THEN
    v_period_start := CURRENT_DATE - 90;
  ELSIF p_registration_period = '180d' THEN
    v_period_start := CURRENT_DATE - 180;
  ELSE
    v_period_start := NULL;
  END IF;

  -- ═══════════════════════════════════════════════════
  -- DISTRIBUCIÓN POR BUCKET
  -- ═══════════════════════════════════════════════════
  SELECT jsonb_agg(row_data ORDER BY bucket_order)
  INTO v_distribution
  FROM (
    SELECT
      jsonb_build_object(
        'bucket', bucket_label,
        'count', cnt,
        'pct', ROUND((cnt::numeric / NULLIF(SUM(cnt) OVER (), 0)) * 100, 1)
      ) AS row_data,
      bucket_order
    FROM (
      SELECT
        CASE
          WHEN COALESCE(eventos_valor, 0) = 0 THEN '0 eventos'
          WHEN eventos_valor BETWEEN 1 AND 2 THEN '1-2'
          WHEN eventos_valor BETWEEN 3 AND 4 THEN '3-4'
          WHEN eventos_valor BETWEEN 5 AND 6 THEN '5-6'
          WHEN eventos_valor BETWEEN 7 AND 9 THEN '7-9 (NSM+)'
          WHEN eventos_valor BETWEEN 10 AND 14 THEN '10-14'
          ELSE '15+'
        END AS bucket_label,
        CASE
          WHEN COALESCE(eventos_valor, 0) = 0 THEN 0
          WHEN eventos_valor BETWEEN 1 AND 2 THEN 1
          WHEN eventos_valor BETWEEN 3 AND 4 THEN 2
          WHEN eventos_valor BETWEEN 5 AND 6 THEN 3
          WHEN eventos_valor BETWEEN 7 AND 9 THEN 4
          WHEN eventos_valor BETWEEN 10 AND 14 THEN 5
          ELSE 6
        END AS bucket_order,
        COUNT(*) AS cnt
      FROM growth_users
      WHERE (NOT v_has_filter OR country = p_country_filter)
        AND (v_period_start IS NULL OR created_date >= v_period_start::timestamp)
      GROUP BY 1, 2
    ) buckets
  ) final;

  -- ═══════════════════════════════════════════════════
  -- TIEMPO A ACTIVACIÓN (proxy: last_login - created_date para usuarios 7+)
  -- ═══════════════════════════════════════════════════
  SELECT jsonb_build_object(
    'median_days', COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY days_diff), 0),
    'avg_days', COALESCE(ROUND(AVG(days_diff), 1), 0),
    'total_activated', COUNT(*),
    'distribution', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'range', range_label,
        'count', cnt,
        'pct', ROUND((cnt::numeric / NULLIF(total_act, 0)) * 100, 1)
      ) ORDER BY range_order), '[]'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN days_to_act BETWEEN 0 AND 3 THEN '0-3 días'
            WHEN days_to_act BETWEEN 4 AND 7 THEN '4-7 días'
            WHEN days_to_act BETWEEN 8 AND 14 THEN '8-14 días'
            WHEN days_to_act BETWEEN 15 AND 30 THEN '15-30 días'
            ELSE '30+ días'
          END AS range_label,
          CASE
            WHEN days_to_act BETWEEN 0 AND 3 THEN 0
            WHEN days_to_act BETWEEN 4 AND 7 THEN 1
            WHEN days_to_act BETWEEN 8 AND 14 THEN 2
            WHEN days_to_act BETWEEN 15 AND 30 THEN 3
            ELSE 4
          END AS range_order,
          COUNT(*) AS cnt,
          (SELECT COUNT(*) FROM growth_users
           WHERE COALESCE(eventos_valor, 0) >= 7
             AND last_login IS NOT NULL AND created_date IS NOT NULL
             AND (NOT v_has_filter OR country = p_country_filter)
             AND (v_period_start IS NULL OR created_date >= v_period_start::timestamp)
          ) AS total_act
        FROM (
          SELECT EXTRACT(DAY FROM (last_login - created_date))::int AS days_to_act
          FROM growth_users
          WHERE COALESCE(eventos_valor, 0) >= 7
            AND last_login IS NOT NULL AND created_date IS NOT NULL
            AND (NOT v_has_filter OR country = p_country_filter)
            AND (v_period_start IS NULL OR created_date >= v_period_start::timestamp)
        ) diffs
        GROUP BY 1, 2
      ) dist
    )
  )
  INTO v_time_to_activation
  FROM (
    SELECT EXTRACT(DAY FROM (last_login - created_date))::numeric AS days_diff
    FROM growth_users
    WHERE COALESCE(eventos_valor, 0) >= 7
      AND last_login IS NOT NULL AND created_date IS NOT NULL
      AND (NOT v_has_filter OR country = p_country_filter)
      AND (v_period_start IS NULL OR created_date >= v_period_start::timestamp)
  ) base;

  -- ═══════════════════════════════════════════════════
  -- TENDENCIA SEMANAL NSM (últimas 12 semanas)
  -- ═══════════════════════════════════════════════════
  FOR i IN REVERSE 11..0 LOOP
    w_start := date_trunc('week', CURRENT_DATE)::date - (i * 7) - 1;
    -- Ajustar a domingo (dow=0)
    w_start := w_start - EXTRACT(DOW FROM w_start)::int;
    w_end := w_start + 6;
    w_label := to_char(w_start, 'DD/MM');

    SELECT COUNT(*) INTO w_registered
    FROM growth_users
    WHERE created_date >= w_start::timestamp AND created_date <= w_end::timestamp
      AND (NOT v_has_filter OR country = p_country_filter);

    SELECT COUNT(*) INTO w_activated
    FROM growth_users
    WHERE created_date >= w_start::timestamp AND created_date <= w_end::timestamp
      AND COALESCE(eventos_valor, 0) >= 7
      AND (NOT v_has_filter OR country = p_country_filter);

    SELECT COUNT(*) INTO w_total_acc
    FROM growth_users
    WHERE created_date <= w_end::timestamp
      AND COALESCE(eventos_valor, 0) >= 7
      AND (NOT v_has_filter OR country = p_country_filter);

    v_weekly_trend := v_weekly_trend || jsonb_build_object(
      'week', w_label,
      'week_start', w_start,
      'registered', w_registered,
      'new_activated', w_activated,
      'total_accumulated', w_total_acc,
      'activation_rate', CASE WHEN w_registered > 0
        THEN ROUND((w_activated::numeric / w_registered) * 100, 1) ELSE 0 END
    );
  END LOOP;

  -- ═══════════════════════════════════════════════════
  -- COHORTE DE ACTIVACIÓN (últimas 8 semanas de registro)
  -- ═══════════════════════════════════════════════════
  FOR i IN REVERSE 7..0 LOOP
    w_start := date_trunc('week', CURRENT_DATE)::date - (i * 7) - 1;
    w_start := w_start - EXTRACT(DOW FROM w_start)::int;
    w_end := w_start + 6;
    w_label := to_char(w_start, 'DD/MM');

    DECLARE
      v_cohort_total bigint;
      v_w1 numeric; v_w2 numeric; v_w3 numeric; v_w4 numeric;
    BEGIN
      SELECT COUNT(*) INTO v_cohort_total
      FROM growth_users
      WHERE created_date >= w_start::timestamp AND created_date <= w_end::timestamp
        AND (NOT v_has_filter OR country = p_country_filter);

      IF v_cohort_total > 0 THEN
        -- Semana 1: usuarios de esta cohorte que tienen 7+ y last_login dentro de 7 días
        SELECT ROUND((COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 7
          AND last_login <= (w_end + 7)::timestamp)::numeric / v_cohort_total) * 100, 1)
        INTO v_w1
        FROM growth_users
        WHERE created_date >= w_start::timestamp AND created_date <= w_end::timestamp
          AND (NOT v_has_filter OR country = p_country_filter);

        SELECT ROUND((COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 7
          AND last_login <= (w_end + 14)::timestamp)::numeric / v_cohort_total) * 100, 1)
        INTO v_w2
        FROM growth_users
        WHERE created_date >= w_start::timestamp AND created_date <= w_end::timestamp
          AND (NOT v_has_filter OR country = p_country_filter);

        SELECT ROUND((COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 7
          AND last_login <= (w_end + 21)::timestamp)::numeric / v_cohort_total) * 100, 1)
        INTO v_w3
        FROM growth_users
        WHERE created_date >= w_start::timestamp AND created_date <= w_end::timestamp
          AND (NOT v_has_filter OR country = p_country_filter);

        SELECT ROUND((COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 7
          AND last_login <= (w_end + 28)::timestamp)::numeric / v_cohort_total) * 100, 1)
        INTO v_w4
        FROM growth_users
        WHERE created_date >= w_start::timestamp AND created_date <= w_end::timestamp
          AND (NOT v_has_filter OR country = p_country_filter);
      ELSE
        v_w1 := 0; v_w2 := 0; v_w3 := 0; v_w4 := 0;
      END IF;

      v_cohort_activation := v_cohort_activation || jsonb_build_object(
        'cohort_week', w_label,
        'registered', v_cohort_total,
        'w1_pct', v_w1,
        'w2_pct', v_w2,
        'w3_pct', v_w3,
        'w4_pct', v_w4
      );
    END;
  END LOOP;

  -- ═══════════════════════════════════════════════════
  -- SUMMARY
  -- ═══════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_total FROM growth_users
  WHERE (NOT v_has_filter OR country = p_country_filter)
    AND (v_period_start IS NULL OR created_date >= v_period_start::timestamp);

  SELECT COUNT(*) INTO v_total_7plus FROM growth_users
  WHERE COALESCE(eventos_valor, 0) >= 7
    AND (NOT v_has_filter OR country = p_country_filter)
    AND (v_period_start IS NULL OR created_date >= v_period_start::timestamp);

  -- NSM esta semana (registrados esta semana que ya tienen 7+)
  SELECT COUNT(*) INTO v_nsm_this_week FROM growth_users
  WHERE created_date >= (CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int)::timestamp
    AND COALESCE(eventos_valor, 0) >= 7
    AND (NOT v_has_filter OR country = p_country_filter);

  -- NSM semana pasada
  SELECT COUNT(*) INTO v_nsm_prev_week FROM growth_users
  WHERE created_date >= (CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int - 7)::timestamp
    AND created_date < (CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int)::timestamp
    AND COALESCE(eventos_valor, 0) >= 7
    AND (NOT v_has_filter OR country = p_country_filter);

  v_summary := jsonb_build_object(
    'total_users', v_total,
    'total_7plus', v_total_7plus,
    'pct_7plus', CASE WHEN v_total > 0 THEN ROUND((v_total_7plus::numeric / v_total) * 100, 1) ELSE 0 END,
    'nsm_this_week', v_nsm_this_week,
    'nsm_prev_week', v_nsm_prev_week,
    'nsm_growth_pct', CASE WHEN v_nsm_prev_week > 0
      THEN ROUND(((v_nsm_this_week - v_nsm_prev_week)::numeric / v_nsm_prev_week) * 100, 1)
      ELSE 0 END
  );

  RETURN jsonb_build_object(
    'distribution', COALESCE(v_distribution, '[]'::jsonb),
    'time_to_activation', COALESCE(v_time_to_activation, '{}'::jsonb),
    'weekly_trend', v_weekly_trend,
    'cohort_activation', v_cohort_activation,
    'summary', v_summary
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_nsm_analysis(text, text) TO authenticated;
