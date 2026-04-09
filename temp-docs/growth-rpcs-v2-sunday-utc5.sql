-- ============================================================
-- Growth Dashboard: Helpers + Indices + 5 RPCs
-- v2: Semanas Domingo-Sábado, UTC-5 (Perú)
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

-- ─── Helper: get_sunday (inicio de semana = Domingo) ────────
-- Reemplaza get_monday. dow: 0=Domingo, 1=Lunes, ...
DROP FUNCTION IF EXISTS get_monday(date);
CREATE OR REPLACE FUNCTION get_sunday(d date)
RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT d - (extract(dow from d)::int || ' days')::interval
$$;

-- ─── Indices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_growth_users_created_date ON growth_users (created_date);
CREATE INDEX IF NOT EXISTS idx_growth_users_subscription_end ON growth_users (subscription_end);
CREATE INDEX IF NOT EXISTS idx_growth_users_plan_paid ON growth_users (plan_paid);
CREATE INDEX IF NOT EXISTS idx_rev_orders_created_at ON rev_orders (created_at);
CREATE INDEX IF NOT EXISTS idx_rev_orders_country ON rev_orders (country);

-- ─── RPC 1: get_executive_summary ─────────────────────────────
-- Semanas Domingo-Sábado, timestamps en UTC-5
CREATE OR REPLACE FUNCTION get_executive_summary(p_week_start date)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  v_week_start timestamp;
  v_week_end timestamp;
  v_prev_start timestamp;
  v_prev_end timestamp;
  v_total_rev numeric := 0;
  v_prev_rev numeric := 0;
  v_rev_growth numeric := 0;
  v_new_rev numeric := 0;
  v_recurring_rev numeric := 0;
  v_transactions int := 0;
  v_arpu numeric := 0;
  v_total_users bigint := 0;
  v_new_users bigint := 0;
  v_week_paid_users bigint := 0;
  v_paid_users bigint := 0;
  v_activated_users bigint := 0;
  v_activation_pct numeric := 0;
  v_conversion_pct numeric := 0;
  v_has_growth_users boolean := false;
  -- Trend variables
  v_trend_arr jsonb := '[]'::jsonb;
  i int;
  t_start timestamp;
  t_end timestamp;
  t_start_date date;
  t_end_date date;
  t_label text;
  t_regs bigint;
  t_rev_new numeric;
  t_rev_renew numeric;
  t_tx_new bigint;
  t_tx_renew bigint;
  -- Country variables
  v_country_arr jsonb := '[]'::jsonb;
BEGIN
  -- Semana Domingo 00:00:00 UTC-5 → Sábado 23:59:59 UTC-5 convertido a UTC
  -- UTC-5 midnight = UTC 05:00:00
  v_week_start := p_week_start::timestamp + interval '5 hours';
  v_week_end := (p_week_start + 6)::timestamp + interval '5 hours' + interval '23 hours 59 minutes 59 seconds';
  v_prev_start := v_week_start - interval '7 days';
  v_prev_end := v_week_start - interval '1 second';

  -- Revenue current week
  SELECT COALESCE(SUM(amount_usd), 0), COUNT(*)
  INTO v_total_rev, v_transactions
  FROM rev_orders
  WHERE created_at >= v_week_start
    AND created_at <= v_week_end;

  -- Revenue previous week
  SELECT COALESCE(SUM(amount_usd), 0)
  INTO v_prev_rev
  FROM rev_orders
  WHERE created_at >= v_prev_start
    AND created_at <= v_prev_end;

  -- Revenue growth
  IF v_prev_rev > 0 THEN
    v_rev_growth := ((v_total_rev - v_prev_rev) / v_prev_rev) * 100;
  ELSIF v_total_rev > 0 THEN
    v_rev_growth := 100;
  END IF;

  -- New vs recurring revenue
  SELECT COALESCE(SUM(amount_usd), 0)
  INTO v_new_rev
  FROM rev_orders
  WHERE created_at >= v_week_start
    AND created_at <= v_week_end
    AND (LOWER(COALESCE(client_type, plan_type, '')) LIKE '%nuevo%');

  SELECT COALESCE(SUM(amount_usd), 0)
  INTO v_recurring_rev
  FROM rev_orders
  WHERE created_at >= v_week_start
    AND created_at <= v_week_end
    AND (LOWER(COALESCE(client_type, plan_type, '')) LIKE '%renova%');

  -- Check if growth_users has data
  SELECT EXISTS(SELECT 1 FROM growth_users LIMIT 1) INTO v_has_growth_users;

  IF v_has_growth_users THEN
    SELECT COUNT(*) INTO v_total_users FROM growth_users;
    SELECT COUNT(*) INTO v_paid_users FROM growth_users WHERE plan_paid = true;
    SELECT COUNT(*) INTO v_activated_users FROM growth_users WHERE COALESCE(eventos_valor, 0) >= 5;

    SELECT COUNT(*) INTO v_new_users
    FROM growth_users
    WHERE created_date::date >= p_week_start
      AND created_date::date <= (p_week_start + 6);

    SELECT COUNT(*) INTO v_week_paid_users
    FROM growth_users
    WHERE created_date::date >= p_week_start
      AND created_date::date <= (p_week_start + 6)
      AND plan_paid = true;

    IF v_total_users > 0 THEN
      v_activation_pct := (v_activated_users::numeric / v_total_users) * 100;
    END IF;

    IF v_new_users > 0 THEN
      v_conversion_pct := (v_week_paid_users::numeric / v_new_users) * 100;
    END IF;

    IF v_new_users > 0 THEN
      v_arpu := v_total_rev / v_new_users;
    ELSIF v_transactions > 0 THEN
      v_arpu := v_total_rev / v_transactions;
    END IF;
  ELSE
    IF v_transactions > 0 THEN
      v_arpu := v_total_rev / v_transactions;
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════
  -- WEEKLY TREND: últimas 8 semanas hacia atrás
  -- ═══════════════════════════════════════════════════
  FOR i IN REVERSE 7..0 LOOP
    t_start_date := p_week_start - (i * 7);
    t_end_date := t_start_date + 6;
    t_start := t_start_date::timestamp + interval '5 hours';
    t_end := t_end_date::timestamp + interval '5 hours' + interval '23 hours 59 minutes 59 seconds';
    t_label := EXTRACT(DAY FROM t_start_date::timestamp)::text || '/' || EXTRACT(MONTH FROM t_start_date::timestamp)::text
      || ' - ' || EXTRACT(DAY FROM t_end_date::timestamp)::text || '/' || EXTRACT(MONTH FROM t_end_date::timestamp)::text;

    IF v_has_growth_users THEN
      SELECT COUNT(*) INTO t_regs
      FROM growth_users
      WHERE created_date::date >= t_start_date AND created_date::date <= t_end_date;
    ELSE
      t_regs := 0;
    END IF;

    SELECT COALESCE(SUM(amount_usd), 0), COUNT(*)
    INTO t_rev_new, t_tx_new
    FROM rev_orders
    WHERE created_at >= t_start AND created_at <= t_end
      AND LOWER(COALESCE(client_type, plan_type, '')) LIKE '%nuevo%';

    SELECT COALESCE(SUM(amount_usd), 0), COUNT(*)
    INTO t_rev_renew, t_tx_renew
    FROM rev_orders
    WHERE created_at >= t_start AND created_at <= t_end
      AND LOWER(COALESCE(client_type, plan_type, '')) LIKE '%renova%';

    v_trend_arr := v_trend_arr || jsonb_build_object(
      'weekLabel', t_label,
      'registrations', t_regs,
      'revenue_new', ROUND(t_rev_new, 2),
      'revenue_renewal', ROUND(t_rev_renew, 2),
      'tx_new', t_tx_new,
      'tx_renewal', t_tx_renew
    );
  END LOOP;

  -- ═══════════════════════════════════════════════════
  -- COUNTRY REGISTRATIONS: top 15 de la semana seleccionada
  -- ═══════════════════════════════════════════════════
  IF v_has_growth_users THEN
    SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'registrations')::int DESC), '[]'::jsonb)
    INTO v_country_arr
    FROM (
      SELECT jsonb_build_object(
        'country', gu_country,
        'registrations', reg_count,
        'paid', COALESCE(paid_count, 0),
        'conversion_pct', CASE WHEN reg_count > 0
          THEN ROUND((COALESCE(paid_count, 0)::numeric / reg_count) * 100, 1)
          ELSE 0 END
      ) AS row_data
      FROM (
        SELECT
          COALESCE(g.country, 'Sin pais') AS gu_country,
          COUNT(*) AS reg_count
        FROM growth_users g
        WHERE g.created_date::date >= p_week_start
          AND g.created_date::date <= (p_week_start + 6)
        GROUP BY COALESCE(g.country, 'Sin pais')
      ) regs
      LEFT JOIN (
        SELECT
          COALESCE(r.country, 'Sin pais') AS ro_country,
          COUNT(*) AS paid_count
        FROM rev_orders r
        WHERE r.created_at >= v_week_start
          AND r.created_at <= v_week_end
          AND LOWER(COALESCE(r.client_type, r.plan_type, '')) LIKE '%nuevo%'
        GROUP BY COALESCE(r.country, 'Sin pais')
      ) pays ON regs.gu_country = pays.ro_country
      ORDER BY reg_count DESC
      LIMIT 15
    ) sub;
  END IF;

  result := jsonb_build_object(
    'revenue', v_total_rev,
    'prev_revenue', v_prev_rev,
    'rev_growth_pct', ROUND(v_rev_growth, 2),
    'rev_growth_positive', v_rev_growth >= 0,
    'revenue_new', v_new_rev,
    'revenue_recurring', v_recurring_rev,
    'transactions', v_transactions,
    'arpu', ROUND(v_arpu, 2),
    'total_users', v_total_users,
    'new_users', v_new_users,
    'paid_users', v_paid_users,
    'activated_users', v_activated_users,
    'activation_pct', ROUND(v_activation_pct, 2),
    'conversion_pct', ROUND(v_conversion_pct, 2),
    'has_growth_users', v_has_growth_users,
    'weekly_trend', v_trend_arr,
    'country_registrations', v_country_arr
  );

  RETURN result;
END;
$$;

-- ─── RPC 2: get_churn_renewal ─────────────────────────────────
CREATE OR REPLACE FUNCTION get_churn_renewal(
  p_week_start date,
  p_weeks int DEFAULT 8,
  p_plan_filter text DEFAULT 'all',
  p_upcoming_days int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  churn_arr jsonb := '[]'::jsonb;
  renewal_arr jsonb := '[]'::jsonb;
  upcoming_arr jsonb := '[]'::jsonb;
  plan_options_arr jsonb := '[]'::jsonb;
  v_has_data boolean;
  i int;
  w_start date;
  w_end date;
  w_start_ts timestamp;
  w_end_ts timestamp;
  v_starting bigint;
  v_new_paid bigint;
  v_renewed bigint;
  v_churned bigint;
  v_churn_rate numeric;
  v_net bigint;
  v_growth_rate numeric;
  v_due bigint;
  v_renewal_rate numeric;
  w_label text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM growth_users LIMIT 1) INTO v_has_data;
  IF NOT v_has_data THEN
    RETURN jsonb_build_object('has_data', false);
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT p ORDER BY p), '[]'::jsonb)
  INTO plan_options_arr
  FROM (
    SELECT DISTINCT plan_id AS p FROM growth_users
    WHERE plan_paid = true AND plan_id IS NOT NULL
    UNION
    SELECT DISTINCT product_name AS p FROM rev_orders
    WHERE product_name IS NOT NULL
  ) combined;

  FOR i IN REVERSE (p_weeks - 1)..0 LOOP
    w_start := p_week_start - (i * 7);
    w_end := w_start + 6;
    -- UTC-5 timestamps
    w_start_ts := w_start::timestamp + interval '5 hours';
    w_end_ts := w_end::timestamp + interval '5 hours' + interval '23 hours 59 minutes 59 seconds';

    w_label := EXTRACT(DAY FROM w_start::timestamp)::text || '/' || EXTRACT(MONTH FROM w_start::timestamp)::text
      || ' - ' || EXTRACT(DAY FROM w_end::timestamp)::text || '/' || EXTRACT(MONTH FROM w_end::timestamp)::text;

    SELECT COUNT(*) INTO v_starting
    FROM growth_users
    WHERE plan_paid = true
      AND subscription_start::date <= w_start
      AND subscription_end::date >= w_start
      AND cancelled = false
      AND (p_plan_filter = 'all' OR plan_id = p_plan_filter);

    SELECT COUNT(*) INTO v_new_paid
    FROM rev_orders
    WHERE created_at >= w_start_ts
      AND created_at <= w_end_ts
      AND LOWER(COALESCE(client_type, plan_type, '')) LIKE '%nuevo%'
      AND (p_plan_filter = 'all' OR LOWER(COALESCE(product_name, '')) LIKE '%' || LOWER(p_plan_filter) || '%');

    SELECT COUNT(*) INTO v_renewed
    FROM rev_orders
    WHERE created_at >= w_start_ts
      AND created_at <= w_end_ts
      AND LOWER(COALESCE(client_type, plan_type, '')) LIKE '%renova%'
      AND (p_plan_filter = 'all' OR LOWER(COALESCE(product_name, '')) LIKE '%' || LOWER(p_plan_filter) || '%');

    SELECT COUNT(*) INTO v_churned
    FROM growth_users
    WHERE subscription_end::date >= w_start
      AND subscription_end::date <= w_end
      AND (cancelled = true OR plan_paid = false)
      AND (p_plan_filter = 'all' OR plan_id = p_plan_filter);

    v_churn_rate := CASE WHEN v_starting > 0 THEN (v_churned::numeric / v_starting) * 100 ELSE 0 END;
    v_net := v_starting + v_new_paid + v_renewed - v_churned;
    v_growth_rate := CASE WHEN v_starting > 0 THEN ((v_net - v_starting)::numeric / v_starting) * 100 ELSE 0 END;

    churn_arr := churn_arr || jsonb_build_object(
      'weekLabel', w_label,
      'startingUsers', v_starting,
      'newPaid', v_new_paid,
      'renewed', v_renewed,
      'churnedUsers', v_churned,
      'churnRate', ROUND(v_churn_rate, 2),
      'netUsers', v_net,
      'growthRate', ROUND(v_growth_rate, 2)
    );

    v_due := v_renewed + v_churned;

    renewal_arr := renewal_arr || jsonb_build_object(
      'weekLabel', w_label,
      'dueToRenew', v_due,
      'renewed', v_renewed,
      'renewalRate', CASE WHEN v_due > 0 THEN ROUND((v_renewed::numeric / v_due) * 100, 2) ELSE 0 END
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'email', email,
      'plan_id', plan_id,
      'country', country,
      'subscription_end', subscription_end,
      'days_left', CEIL(EXTRACT(EPOCH FROM (subscription_end::timestamp - NOW())) / 86400)
    ) ORDER BY subscription_end
  ), '[]'::jsonb)
  INTO upcoming_arr
  FROM growth_users
  WHERE cancelled = false
    AND plan_paid = true
    AND subscription_end::date >= CURRENT_DATE
    AND subscription_end::date <= (CURRENT_DATE + p_upcoming_days)
    AND (p_plan_filter = 'all' OR plan_id = p_plan_filter)
  LIMIT 100;

  result := jsonb_build_object(
    'has_data', true,
    'plan_options', plan_options_arr,
    'churn_weeks', churn_arr,
    'renewal_weeks', renewal_arr,
    'upcoming_renewals', upcoming_arr
  );

  RETURN result;
END;
$$;

-- ─── RPC 3: get_conversion_funnel ─────────────────────────────
CREATE OR REPLACE FUNCTION get_conversion_funnel(
  p_week_start date,
  p_weeks int DEFAULT 8,
  p_eventos_filter text DEFAULT 'all',
  p_plan_status text DEFAULT 'all',
  p_plan_id text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  v_has_data boolean;
  v_total bigint;
  v_activated bigint;
  v_paid bigint;
  v_activation_pct numeric;
  v_conversion_pct numeric;
  funnel_week_arr jsonb;
  v_wk_total bigint;
  v_wk_activated bigint;
  v_wk_paid bigint;
  v_wk_1plus bigint;
  v_wk_2plus bigint;
  v_wk_3plus bigint;
  v_wk_4plus bigint;
  v_wk_6plus bigint;
  v_wk_7plus bigint;
  v_wk_8plus bigint;
  v_wk_9plus bigint;
  v_wk_10plus bigint;
  weekly_arr jsonb := '[]'::jsonb;
  i int;
  w_start date;
  w_end date;
  w_label text;
  v_reg bigint;
  v_act bigint;
  v_p bigint;
  v_free bigint;
  v_ev1 bigint;
  v_ev2 bigint;
  v_ev3 bigint;
  v_ev4 bigint;
  v_ev6 bigint;
  v_ev7 bigint;
  v_ev8 bigint;
  v_ev9 bigint;
  v_ev10plus bigint;
  plan_options_arr jsonb;
BEGIN
  SELECT EXISTS(SELECT 1 FROM growth_users LIMIT 1) INTO v_has_data;
  IF NOT v_has_data THEN
    RETURN jsonb_build_object('has_data', false);
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT plan_id ORDER BY plan_id), '[]'::jsonb)
  INTO plan_options_arr
  FROM growth_users
  WHERE plan_paid = true AND plan_id IS NOT NULL AND plan_id != '';

  -- FUNNEL GENERAL (acumulado)
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 5),
         COUNT(*) FILTER (WHERE plan_paid = true)
  INTO v_total, v_activated, v_paid
  FROM growth_users
  WHERE (p_eventos_filter = 'all' OR
         (p_eventos_filter = '0' AND COALESCE(eventos_valor, 0) = 0) OR
         (p_eventos_filter = '1' AND COALESCE(eventos_valor, 0) = 1) OR
         (p_eventos_filter = '2' AND COALESCE(eventos_valor, 0) = 2) OR
         (p_eventos_filter = '3' AND COALESCE(eventos_valor, 0) = 3) OR
         (p_eventos_filter = '4' AND COALESCE(eventos_valor, 0) = 4) OR
         (p_eventos_filter = '5+' AND COALESCE(eventos_valor, 0) >= 5) OR
         (p_eventos_filter = '6' AND COALESCE(eventos_valor, 0) = 6) OR
         (p_eventos_filter = '7' AND COALESCE(eventos_valor, 0) = 7) OR
         (p_eventos_filter = '8' AND COALESCE(eventos_valor, 0) = 8) OR
         (p_eventos_filter = '9' AND COALESCE(eventos_valor, 0) = 9) OR
         (p_eventos_filter = '10+' AND COALESCE(eventos_valor, 0) >= 10))
    AND (p_plan_status = 'all' OR
         (p_plan_status = 'free' AND plan_paid = false AND cancelled = false) OR
         (p_plan_status = 'paid' AND plan_paid = true) OR
         (p_plan_status = 'cancelled' AND cancelled = true))
    AND (p_plan_id = 'all' OR plan_id = p_plan_id);

  v_activation_pct := CASE WHEN v_total > 0 THEN ROUND((v_activated::numeric / v_total) * 100, 1) ELSE 0 END;
  v_conversion_pct := CASE WHEN v_total > 0 THEN ROUND((v_paid::numeric / v_total) * 100, 1) ELSE 0 END;

  -- FUNNEL SEMANAL (semana seleccionada) — todas las etapas acumulativas
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 1),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 2),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 3),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 4),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 5),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 6),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 7),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 8),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 9),
         COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 10),
         COUNT(*) FILTER (WHERE plan_paid = true)
  INTO v_wk_total, v_wk_1plus, v_wk_2plus, v_wk_3plus, v_wk_4plus, v_wk_activated,
       v_wk_6plus, v_wk_7plus, v_wk_8plus, v_wk_9plus, v_wk_10plus, v_wk_paid
  FROM growth_users
  WHERE created_date::date >= p_week_start
    AND created_date::date <= (p_week_start + 6)
    AND (p_eventos_filter = 'all' OR
         (p_eventos_filter = '0' AND COALESCE(eventos_valor, 0) = 0) OR
         (p_eventos_filter = '1' AND COALESCE(eventos_valor, 0) = 1) OR
         (p_eventos_filter = '2' AND COALESCE(eventos_valor, 0) = 2) OR
         (p_eventos_filter = '3' AND COALESCE(eventos_valor, 0) = 3) OR
         (p_eventos_filter = '4' AND COALESCE(eventos_valor, 0) = 4) OR
         (p_eventos_filter = '5+' AND COALESCE(eventos_valor, 0) >= 5) OR
         (p_eventos_filter = '6' AND COALESCE(eventos_valor, 0) = 6) OR
         (p_eventos_filter = '7' AND COALESCE(eventos_valor, 0) = 7) OR
         (p_eventos_filter = '8' AND COALESCE(eventos_valor, 0) = 8) OR
         (p_eventos_filter = '9' AND COALESCE(eventos_valor, 0) = 9) OR
         (p_eventos_filter = '10+' AND COALESCE(eventos_valor, 0) >= 10))
    AND (p_plan_status = 'all' OR
         (p_plan_status = 'free' AND plan_paid = false AND cancelled = false) OR
         (p_plan_status = 'paid' AND plan_paid = true) OR
         (p_plan_status = 'cancelled' AND cancelled = true))
    AND (p_plan_id = 'all' OR plan_id = p_plan_id);

  -- Funnel visual: Registrados → 1+ → 2+ → ... → 10+ → Pagaron (12 pasos)
  funnel_week_arr := jsonb_build_array(
    jsonb_build_object('label', 'Registrados', 'count', v_wk_total, 'pctOfTotal', 100, 'pctOfPrev', 100),
    jsonb_build_object('label', '1+ evento', 'count', v_wk_1plus,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_1plus::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_1plus::numeric / v_wk_total) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', '2+ eventos', 'count', v_wk_2plus,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_2plus::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_1plus > 0 THEN ROUND((v_wk_2plus::numeric / v_wk_1plus) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', '3+ eventos', 'count', v_wk_3plus,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_3plus::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_2plus > 0 THEN ROUND((v_wk_3plus::numeric / v_wk_2plus) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', '4+ eventos', 'count', v_wk_4plus,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_4plus::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_3plus > 0 THEN ROUND((v_wk_4plus::numeric / v_wk_3plus) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', 'Activados (5+)', 'count', v_wk_activated,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_activated::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_4plus > 0 THEN ROUND((v_wk_activated::numeric / v_wk_4plus) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', '6+ eventos', 'count', v_wk_6plus,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_6plus::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_activated > 0 THEN ROUND((v_wk_6plus::numeric / v_wk_activated) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', '7+ eventos', 'count', v_wk_7plus,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_7plus::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_6plus > 0 THEN ROUND((v_wk_7plus::numeric / v_wk_6plus) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', '8+ eventos', 'count', v_wk_8plus,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_8plus::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_7plus > 0 THEN ROUND((v_wk_8plus::numeric / v_wk_7plus) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', '9+ eventos', 'count', v_wk_9plus,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_9plus::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_8plus > 0 THEN ROUND((v_wk_9plus::numeric / v_wk_8plus) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', '10+ eventos', 'count', v_wk_10plus,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_10plus::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_9plus > 0 THEN ROUND((v_wk_10plus::numeric / v_wk_9plus) * 100, 2) ELSE 0 END),
    jsonb_build_object('label', 'Pagaron', 'count', v_wk_paid,
      'pctOfTotal', CASE WHEN v_wk_total > 0 THEN ROUND((v_wk_paid::numeric / v_wk_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_wk_10plus > 0 THEN ROUND((v_wk_paid::numeric / v_wk_10plus) * 100, 2) ELSE 0 END)
  );

  -- WEEKLY TABLE (8 semanas)
  FOR i IN REVERSE (p_weeks - 1)..0 LOOP
    w_start := p_week_start - (i * 7);
    w_end := w_start + 6;
    w_label := EXTRACT(DAY FROM w_start::timestamp)::text || '/' || EXTRACT(MONTH FROM w_start::timestamp)::text
      || ' - ' || EXTRACT(DAY FROM w_end::timestamp)::text || '/' || EXTRACT(MONTH FROM w_end::timestamp)::text;

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 5),
           COUNT(*) FILTER (WHERE plan_paid = true),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) = 1),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) = 2),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) = 3),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) = 4),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) = 6),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) = 7),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) = 8),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) = 9),
           COUNT(*) FILTER (WHERE COALESCE(eventos_valor, 0) >= 10)
    INTO v_reg, v_act, v_p, v_ev1, v_ev2, v_ev3, v_ev4, v_ev6, v_ev7, v_ev8, v_ev9, v_ev10plus
    FROM growth_users
    WHERE created_date::date >= w_start
      AND created_date::date <= w_end
      AND (p_eventos_filter = 'all' OR
           (p_eventos_filter = '0' AND COALESCE(eventos_valor, 0) = 0) OR
           (p_eventos_filter = '1' AND COALESCE(eventos_valor, 0) = 1) OR
           (p_eventos_filter = '2' AND COALESCE(eventos_valor, 0) = 2) OR
           (p_eventos_filter = '3' AND COALESCE(eventos_valor, 0) = 3) OR
           (p_eventos_filter = '4' AND COALESCE(eventos_valor, 0) = 4) OR
           (p_eventos_filter = '5+' AND COALESCE(eventos_valor, 0) >= 5) OR
           (p_eventos_filter = '6' AND COALESCE(eventos_valor, 0) = 6) OR
           (p_eventos_filter = '7' AND COALESCE(eventos_valor, 0) = 7) OR
           (p_eventos_filter = '8' AND COALESCE(eventos_valor, 0) = 8) OR
           (p_eventos_filter = '9' AND COALESCE(eventos_valor, 0) = 9) OR
           (p_eventos_filter = '10+' AND COALESCE(eventos_valor, 0) >= 10))
      AND (p_plan_status = 'all' OR
           (p_plan_status = 'free' AND plan_paid = false AND cancelled = false) OR
           (p_plan_status = 'paid' AND plan_paid = true) OR
           (p_plan_status = 'cancelled' AND cancelled = true))
      AND (p_plan_id = 'all' OR plan_id = p_plan_id);

    v_free := v_reg - v_p;

    weekly_arr := weekly_arr || jsonb_build_object(
      'weekLabel', w_label,
      'registered', v_reg,
      'ev1', v_ev1,
      'ev2', v_ev2,
      'ev3', v_ev3,
      'ev4', v_ev4,
      'activated', v_act,
      'ev6', v_ev6,
      'ev7', v_ev7,
      'ev8', v_ev8,
      'ev9', v_ev9,
      'ev10plus', v_ev10plus,
      'paid', v_p,
      'free', v_free,
      'activationPct', CASE WHEN v_reg > 0 THEN ROUND((v_act::numeric / v_reg) * 100, 2) ELSE 0 END,
      'conversionPct', CASE WHEN v_reg > 0 THEN ROUND((v_p::numeric / v_reg) * 100, 2) ELSE 0 END
    );
  END LOOP;

  result := jsonb_build_object(
    'has_data', true,
    'plan_options', plan_options_arr,
    'funnel_week', funnel_week_arr,
    'funnel_general', jsonb_build_object(
      'total', v_total, 'activated', v_activated, 'paid', v_paid,
      'activationPct', v_activation_pct, 'conversionPct', v_conversion_pct
    ),
    'weekly', weekly_arr
  );

  RETURN result;
END;
$$;

-- ─── RPC 4: get_acquisition_stats ─────────────────────────────
-- p_week_start = Domingo de la semana. NULL = acumulado all-time.
CREATE OR REPLACE FUNCTION get_acquisition_stats(
  p_week_start date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  v_has_data boolean;
  v_total bigint;
  v_paid bigint;
  v_week_end date;
  country_arr jsonb;
  channel_arr jsonb;
  channel_plan_arr jsonb;
  plan_names_arr jsonb;
  summary_obj jsonb;
  v_top_country text;
  v_top_channel text;
  v_best_conv_channel text;
  v_best_conv_pct numeric;
BEGIN
  IF p_week_start IS NOT NULL THEN
    v_week_end := p_week_start + 6;
  END IF;

  SELECT EXISTS(SELECT 1 FROM growth_users LIMIT 1) INTO v_has_data;
  IF NOT v_has_data THEN
    RETURN jsonb_build_object('has_data', false);
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE plan_paid = true)
  INTO v_total, v_paid
  FROM growth_users
  WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end));

  -- Country x Status
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'total')::int DESC), '[]'::jsonb)
  INTO country_arr
  FROM (
    SELECT jsonb_build_object(
      'key', COALESCE(country, 'Sin pais'),
      'pago', COUNT(*) FILTER (WHERE plan_paid = true),
      'gratisActivado', COUNT(*) FILTER (WHERE plan_paid = false AND COALESCE(eventos_valor, 0) >= 1),
      'noActivado', COUNT(*) FILTER (WHERE plan_paid = false AND COALESCE(eventos_valor, 0) < 1),
      'total', COUNT(*),
      'conversionPct', CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE plan_paid = true))::numeric / COUNT(*) * 100, 2) ELSE 0 END,
      'pctOfGrandTotal', CASE WHEN v_total > 0 THEN ROUND(COUNT(*)::numeric / v_total * 100, 1) ELSE 0 END
    ) AS row_data
    FROM growth_users
    WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
    GROUP BY COALESCE(country, 'Sin pais')
  ) sub;

  -- Channel x Status
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'total')::int DESC), '[]'::jsonb)
  INTO channel_arr
  FROM (
    SELECT jsonb_build_object(
      'key', grouped_channel,
      'pago', SUM(is_paid)::int,
      'gratisActivado', SUM(is_free_active)::int,
      'noActivado', SUM(is_not_active)::int,
      'total', COUNT(*),
      'conversionPct', CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(is_paid)::numeric / COUNT(*) * 100, 2) ELSE 0 END,
      'pctOfGrandTotal', CASE WHEN v_total > 0 THEN ROUND(COUNT(*)::numeric / v_total * 100, 1) ELSE 0 END
    ) AS row_data
    FROM (
      SELECT
        CASE
          WHEN origin ILIKE '%recomend%' OR origin ILIKE '%referr%' THEN 'Recomendación'
          WHEN origin ILIKE '%face%' OR origin ILIKE '%fb%' THEN 'Facebook'
          WHEN origin ILIKE '%tiktok%' OR origin ILIKE '%tik%' THEN 'TikTok'
          WHEN origin ILIKE '%google%' OR origin ILIKE '%goo%' THEN 'Google'
          WHEN origin ILIKE '%insta%' OR origin ILIKE '%ig %' OR origin ILIKE 'ig' THEN 'Instagram'
          WHEN origin ILIKE '%youtube%' OR origin ILIKE '%youtu%' OR origin ILIKE '%yt%' THEN 'Youtube'
          WHEN origin ILIKE '%whats%' OR origin ILIKE '%wpp%' OR origin ILIKE '%wa %' OR origin ILIKE 'wa' THEN 'Whatsapp'
          ELSE 'Otros'
        END AS grouped_channel,
        CASE WHEN plan_paid = true THEN 1 ELSE 0 END AS is_paid,
        CASE WHEN plan_paid = false AND COALESCE(eventos_valor, 0) >= 1 THEN 1 ELSE 0 END AS is_free_active,
        CASE WHEN plan_paid = false AND COALESCE(eventos_valor, 0) < 1 THEN 1 ELSE 0 END AS is_not_active
      FROM growth_users
      WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
    ) classified
    GROUP BY grouped_channel
  ) sub;

  -- Channel x Plan
  SELECT COALESCE(jsonb_agg(DISTINCT COALESCE(plan_id, 'Sin plan') ORDER BY COALESCE(plan_id, 'Sin plan')), '[]'::jsonb)
  INTO plan_names_arr
  FROM growth_users
  WHERE plan_paid = true
    AND (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end));

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'total')::int DESC), '[]'::jsonb)
  INTO channel_plan_arr
  FROM (
    SELECT jsonb_build_object(
      'channel', grouped_channel,
      'plans', jsonb_object_agg(COALESCE(plan_id, 'Sin plan'), cnt),
      'total', SUM(cnt)
    ) AS row_data
    FROM (
      SELECT grouped_channel, plan_id, COUNT(*) AS cnt
      FROM (
        SELECT
          CASE
            WHEN origin ILIKE '%recomend%' OR origin ILIKE '%referr%' THEN 'Recomendación'
            WHEN origin ILIKE '%face%' OR origin ILIKE '%fb%' THEN 'Facebook'
            WHEN origin ILIKE '%tiktok%' OR origin ILIKE '%tik%' THEN 'TikTok'
            WHEN origin ILIKE '%google%' OR origin ILIKE '%goo%' THEN 'Google'
            WHEN origin ILIKE '%insta%' OR origin ILIKE '%ig %' OR origin ILIKE 'ig' THEN 'Instagram'
            WHEN origin ILIKE '%youtube%' OR origin ILIKE '%youtu%' OR origin ILIKE '%yt%' THEN 'Youtube'
            WHEN origin ILIKE '%whats%' OR origin ILIKE '%wpp%' OR origin ILIKE '%wa %' OR origin ILIKE 'wa' THEN 'Whatsapp'
            ELSE 'Otros'
          END AS grouped_channel,
          plan_id
        FROM growth_users
        WHERE plan_paid = true
          AND (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
      ) inner_classified
      GROUP BY grouped_channel, plan_id
    ) inner_q
    GROUP BY grouped_channel
  ) sub;

  -- Summary stats
  SELECT COALESCE(country, 'Sin pais') INTO v_top_country
  FROM growth_users
  WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
  GROUP BY COALESCE(country, 'Sin pais')
  ORDER BY COUNT(*) DESC LIMIT 1;

  SELECT sub.grouped_ch INTO v_top_channel
  FROM (
    SELECT
      CASE
        WHEN origin ILIKE '%recomend%' OR origin ILIKE '%referr%' THEN 'Recomendación'
        WHEN origin ILIKE '%face%' OR origin ILIKE '%fb%' THEN 'Facebook'
        WHEN origin ILIKE '%tiktok%' OR origin ILIKE '%tik%' THEN 'TikTok'
        WHEN origin ILIKE '%google%' OR origin ILIKE '%goo%' THEN 'Google'
        WHEN origin ILIKE '%insta%' OR origin ILIKE '%ig %' OR origin ILIKE 'ig' THEN 'Instagram'
        WHEN origin ILIKE '%youtube%' OR origin ILIKE '%youtu%' OR origin ILIKE '%yt%' THEN 'Youtube'
        WHEN origin ILIKE '%whats%' OR origin ILIKE '%wpp%' OR origin ILIKE '%wa %' OR origin ILIKE 'wa' THEN 'Whatsapp'
        ELSE 'Otros'
      END AS grouped_ch
    FROM growth_users
    WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
  ) sub
  GROUP BY sub.grouped_ch
  ORDER BY COUNT(*) DESC LIMIT 1;

  SELECT sub2.grouped_ch, sub2.conv_pct INTO v_best_conv_channel, v_best_conv_pct
  FROM (
    SELECT grouped_ch,
           CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE is_paid = 1))::numeric / COUNT(*) * 100, 2) ELSE 0 END AS conv_pct
    FROM (
      SELECT
        CASE
          WHEN origin ILIKE '%recomend%' OR origin ILIKE '%referr%' THEN 'Recomendación'
          WHEN origin ILIKE '%face%' OR origin ILIKE '%fb%' THEN 'Facebook'
          WHEN origin ILIKE '%tiktok%' OR origin ILIKE '%tik%' THEN 'TikTok'
          WHEN origin ILIKE '%google%' OR origin ILIKE '%goo%' THEN 'Google'
          WHEN origin ILIKE '%insta%' OR origin ILIKE '%ig %' OR origin ILIKE 'ig' THEN 'Instagram'
          WHEN origin ILIKE '%youtube%' OR origin ILIKE '%youtu%' OR origin ILIKE '%yt%' THEN 'Youtube'
          WHEN origin ILIKE '%whats%' OR origin ILIKE '%wpp%' OR origin ILIKE '%wa %' OR origin ILIKE 'wa' THEN 'Whatsapp'
          ELSE 'Otros'
        END AS grouped_ch,
        CASE WHEN plan_paid = true THEN 1 ELSE 0 END AS is_paid
      FROM growth_users
      WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
    ) inner_sub
    GROUP BY grouped_ch
    HAVING COUNT(*) >= 5
    ORDER BY conv_pct DESC
    LIMIT 1
  ) sub2;

  summary_obj := jsonb_build_object(
    'total_users', v_total,
    'paid_users', v_paid,
    'top_country', v_top_country,
    'top_channel', v_top_channel,
    'best_conv_channel', COALESCE(v_best_conv_channel, '-'),
    'best_conv_pct', COALESCE(v_best_conv_pct, 0)
  );

  result := jsonb_build_object(
    'has_data', true,
    'summary', summary_obj,
    'country_table', country_arr,
    'channel_table', channel_arr,
    'channel_plan_table', channel_plan_arr,
    'plan_names', plan_names_arr
  );

  RETURN result;
END;
$$;

-- ─── RPC 5: get_revenue_by_country ────────────────────────────
-- Semanas Domingo-Sábado via get_sunday() en vez de DATE_TRUNC('week')
CREATE OR REPLACE FUNCTION get_revenue_by_country(p_year int, p_granularity text DEFAULT 'monthly', p_prev_year_yoy boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  rows_arr jsonb;
  period_keys_arr jsonb;
  totals_obj jsonb;
  prev_year_arr jsonb := '[]'::jsonb;
  v_start timestamp;
  v_end timestamp;
BEGIN
  v_start := (p_year || '-01-01')::timestamp;
  v_end := (p_year || '-12-31 23:59:59')::timestamp;

  WITH orders_with_period AS (
    SELECT
      COALESCE(country, 'Desconocido') AS country,
      amount_usd,
      CASE
        WHEN p_granularity = 'monthly' THEN TO_CHAR(created_at, 'YYYY-MM')
        WHEN p_granularity = 'weekly' THEN TO_CHAR(get_sunday(created_at::date), 'YYYY-MM-DD')
        ELSE TO_CHAR(created_at::date, 'YYYY-MM-DD')
      END AS period_key
    FROM rev_orders
    WHERE created_at >= v_start AND created_at <= v_end
  ),
  periods AS (
    SELECT DISTINCT period_key FROM orders_with_period ORDER BY period_key
  ),
  country_periods AS (
    SELECT
      country,
      jsonb_object_agg(period_key, period_sum) AS periods,
      SUM(period_sum) AS total
    FROM (
      SELECT country, period_key, SUM(amount_usd) AS period_sum
      FROM orders_with_period
      GROUP BY country, period_key
    ) sub
    GROUP BY country
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object('country', country, 'periods', periods, 'total', ROUND(total::numeric, 2))
      ORDER BY total DESC
    ), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(period_key ORDER BY period_key) FROM periods), '[]'::jsonb)
  INTO rows_arr, period_keys_arr
  FROM country_periods;

  WITH orders_with_period AS (
    SELECT
      amount_usd,
      CASE
        WHEN p_granularity = 'monthly' THEN TO_CHAR(created_at, 'YYYY-MM')
        WHEN p_granularity = 'weekly' THEN TO_CHAR(get_sunday(created_at::date), 'YYYY-MM-DD')
        ELSE TO_CHAR(created_at::date, 'YYYY-MM-DD')
      END AS period_key
    FROM rev_orders
    WHERE created_at >= v_start AND created_at <= v_end
  )
  SELECT COALESCE(jsonb_object_agg(period_key, ROUND(period_sum::numeric, 2)), '{}'::jsonb)
  INTO totals_obj
  FROM (
    SELECT period_key, SUM(amount_usd) AS period_sum
    FROM orders_with_period
    GROUP BY period_key
  ) sub;

  IF p_prev_year_yoy THEN
    WITH prev_orders AS (
      SELECT
        COALESCE(country, 'Desconocido') AS country,
        amount_usd,
        CASE
          WHEN p_granularity = 'monthly' THEN TO_CHAR(created_at, 'YYYY-MM')
          WHEN p_granularity = 'weekly' THEN TO_CHAR(get_sunday(created_at::date), 'YYYY-MM-DD')
          ELSE TO_CHAR(created_at::date, 'YYYY-MM-DD')
        END AS period_key
      FROM rev_orders
      WHERE created_at >= ((p_year - 1) || '-01-01')::timestamp
        AND created_at <= ((p_year - 1) || '-12-31 23:59:59')::timestamp
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('country', country, 'periods', periods)
      ORDER BY country
    ), '[]'::jsonb)
    INTO prev_year_arr
    FROM (
      SELECT country, jsonb_object_agg(period_key, ROUND(period_sum::numeric, 2)) AS periods
      FROM (
        SELECT country, period_key, SUM(amount_usd) AS period_sum
        FROM prev_orders
        GROUP BY country, period_key
      ) sub
      GROUP BY country
    ) sub2;
  END IF;

  result := jsonb_build_object(
    'rows', rows_arr,
    'period_keys', period_keys_arr,
    'totals', totals_obj,
    'prev_year_data', prev_year_arr
  );

  RETURN result;
END;
$$;
