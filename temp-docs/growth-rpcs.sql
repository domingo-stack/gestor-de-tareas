-- ============================================================
-- Growth Dashboard: Helpers + Indices + 5 RPCs
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

-- ─── Helper: get_monday ───────────────────────────────────────
CREATE OR REPLACE FUNCTION get_monday(d date)
RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT d - ((extract(isodow from d)::int - 1) || ' days')::interval
$$;

-- ─── Indices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_growth_users_created_date ON growth_users (created_date);
CREATE INDEX IF NOT EXISTS idx_growth_users_subscription_end ON growth_users (subscription_end);
CREATE INDEX IF NOT EXISTS idx_growth_users_plan_paid ON growth_users (plan_paid);
CREATE INDEX IF NOT EXISTS idx_rev_orders_created_at ON rev_orders (created_at);
CREATE INDEX IF NOT EXISTS idx_rev_orders_country ON rev_orders (country);

-- ─── RPC 1: get_executive_summary ─────────────────────────────
CREATE OR REPLACE FUNCTION get_executive_summary(p_week_start date)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
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
  v_paid_users bigint := 0;
  v_activated_users bigint := 0;
  v_activation_pct numeric := 0;
  v_conversion_pct numeric := 0;
  v_has_growth_users boolean := false;
BEGIN
  v_week_end := (p_week_start + 6)::timestamp + interval '23 hours 59 minutes 59 seconds';
  v_prev_start := (p_week_start - 7)::timestamp;
  v_prev_end := p_week_start::timestamp - interval '1 second';

  -- Revenue current week
  SELECT COALESCE(SUM(amount_usd), 0), COUNT(*)
  INTO v_total_rev, v_transactions
  FROM rev_orders
  WHERE created_at >= p_week_start::timestamp
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
  WHERE created_at >= p_week_start::timestamp
    AND created_at <= v_week_end
    AND (LOWER(COALESCE(client_type, plan_type, '')) LIKE '%nuevo%');

  SELECT COALESCE(SUM(amount_usd), 0)
  INTO v_recurring_rev
  FROM rev_orders
  WHERE created_at >= p_week_start::timestamp
    AND created_at <= v_week_end
    AND (LOWER(COALESCE(client_type, plan_type, '')) LIKE '%renova%');

  -- Check if growth_users has data
  SELECT EXISTS(SELECT 1 FROM growth_users LIMIT 1) INTO v_has_growth_users;

  IF v_has_growth_users THEN
    SELECT COUNT(*) INTO v_total_users FROM growth_users;
    SELECT COUNT(*) INTO v_paid_users FROM growth_users WHERE plan_paid = true;
    SELECT COUNT(*) INTO v_activated_users FROM growth_users WHERE COALESCE(eventos_valor, 0) >= 1;

    SELECT COUNT(*) INTO v_new_users
    FROM growth_users
    WHERE created_date::date >= p_week_start
      AND created_date::date <= (p_week_start + 6);

    IF v_total_users > 0 THEN
      v_activation_pct := (v_activated_users::numeric / v_total_users) * 100;
      v_conversion_pct := (v_paid_users::numeric / v_total_users) * 100;
    END IF;

    IF v_paid_users > 0 THEN
      v_arpu := v_total_rev / v_paid_users;
    ELSIF v_transactions > 0 THEN
      v_arpu := v_total_rev / v_transactions;
    END IF;
  ELSE
    IF v_transactions > 0 THEN
      v_arpu := v_total_rev / v_transactions;
    END IF;
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
    'has_growth_users', v_has_growth_users
  );

  RETURN result;
END;
$$;

-- ─── RPC 2: get_churn_renewal ─────────────────────────────────
-- Modelo HÍBRIDO:
--   - Pagos (newPaid, renewed): de rev_orders via client_type ('Nuevo'/'Renovación')
--     → fuente de verdad para transacciones, captura pagos anticipados
--   - Estado usuarios (starting, churned): de growth_users
--     → fuente de verdad para estado actual del usuario
--   - Tabla renovación: renewed de rev_orders + churned de growth_users
--   - Upcoming renewals: de growth_users (subscription_end próxima)
--
-- Filtro por plan: filtra rev_orders por product_name y growth_users por plan_id
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

  -- Plan options: merge both sources for a complete dropdown
  -- growth_users.plan_id has plan names like "12 Meses", "1 Mes"
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
    w_end_ts := w_end::timestamp + interval '23 hours 59 minutes 59 seconds';

    -- Week label: "d/m - d/m"
    w_label := EXTRACT(DAY FROM w_start::timestamp)::text || '/' || EXTRACT(MONTH FROM w_start::timestamp)::text
      || ' - ' || EXTRACT(DAY FROM w_end::timestamp)::text || '/' || EXTRACT(MONTH FROM w_end::timestamp)::text;

    -- ═══════════════════════════════════════════════════
    -- CHURN TABLE
    -- ═══════════════════════════════════════════════════

    -- Starting users (growth_users): paid, subscription active at start of week
    SELECT COUNT(*) INTO v_starting
    FROM growth_users
    WHERE plan_paid = true
      AND subscription_start::date <= w_start
      AND subscription_end::date >= w_start
      AND cancelled = false
      AND (p_plan_filter = 'all' OR plan_id = p_plan_filter);

    -- New paid (rev_orders): transactions with client_type containing 'nuevo'
    -- This is the SOURCE OF TRUTH for new customer payments
    SELECT COUNT(*) INTO v_new_paid
    FROM rev_orders
    WHERE created_at >= w_start::timestamp
      AND created_at <= w_end_ts
      AND LOWER(COALESCE(client_type, plan_type, '')) LIKE '%nuevo%'
      AND (p_plan_filter = 'all' OR LOWER(COALESCE(product_name, '')) LIKE '%' || LOWER(p_plan_filter) || '%');

    -- Renewed (rev_orders): transactions with client_type containing 'renova'
    -- Captures ALL renewals including early renewals (before sub_end)
    SELECT COUNT(*) INTO v_renewed
    FROM rev_orders
    WHERE created_at >= w_start::timestamp
      AND created_at <= w_end_ts
      AND LOWER(COALESCE(client_type, plan_type, '')) LIKE '%renova%'
      AND (p_plan_filter = 'all' OR LOWER(COALESCE(product_name, '')) LIKE '%' || LOWER(p_plan_filter) || '%');

    -- Churned (growth_users): users whose subscription ended this week
    -- AND are cancelled or no longer paid
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

    -- ═══════════════════════════════════════════════════
    -- RENEWAL TABLE
    -- ═══════════════════════════════════════════════════
    -- Due to renew = renewal payments (rev_orders) + churned (growth_users)
    -- Renewed = renewal payments from rev_orders

    v_due := v_renewed + v_churned;

    renewal_arr := renewal_arr || jsonb_build_object(
      'weekLabel', w_label,
      'dueToRenew', v_due,
      'renewed', v_renewed,
      'renewalRate', CASE WHEN v_due > 0 THEN ROUND((v_renewed::numeric / v_due) * 100, 2) ELSE 0 END
    );
  END LOOP;

  -- Upcoming renewals (growth_users): paid users whose sub ends in next N days
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
CREATE OR REPLACE FUNCTION get_conversion_funnel(p_week_start date, p_weeks int DEFAULT 8)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  v_has_data boolean;
  v_total bigint;
  v_activated bigint;
  v_paid bigint;
  funnel_arr jsonb;
  weekly_arr jsonb := '[]'::jsonb;
  i int;
  w_start date;
  w_end date;
  w_label text;
  v_reg bigint;
  v_act bigint;
  v_p bigint;
  v_free bigint;
BEGIN
  SELECT EXISTS(SELECT 1 FROM growth_users LIMIT 1) INTO v_has_data;
  IF NOT v_has_data THEN
    RETURN jsonb_build_object('has_data', false);
  END IF;

  -- Overall funnel
  SELECT COUNT(*) INTO v_total FROM growth_users;
  SELECT COUNT(*) INTO v_activated FROM growth_users WHERE COALESCE(eventos_valor, 0) >= 1;
  SELECT COUNT(*) INTO v_paid FROM growth_users WHERE plan_paid = true;

  funnel_arr := jsonb_build_array(
    jsonb_build_object(
      'label', 'Registrados',
      'count', v_total,
      'pctOfTotal', 100,
      'pctOfPrev', 100
    ),
    jsonb_build_object(
      'label', 'Activados (1+ evento)',
      'count', v_activated,
      'pctOfTotal', CASE WHEN v_total > 0 THEN ROUND((v_activated::numeric / v_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_total > 0 THEN ROUND((v_activated::numeric / v_total) * 100, 2) ELSE 0 END
    ),
    jsonb_build_object(
      'label', 'Pagaron',
      'count', v_paid,
      'pctOfTotal', CASE WHEN v_total > 0 THEN ROUND((v_paid::numeric / v_total) * 100, 2) ELSE 0 END,
      'pctOfPrev', CASE WHEN v_activated > 0 THEN ROUND((v_paid::numeric / v_activated) * 100, 2) ELSE 0 END
    )
  );

  -- Weekly conversion by registration cohort
  FOR i IN REVERSE (p_weeks - 1)..0 LOOP
    w_start := p_week_start - (i * 7);
    w_end := w_start + 6;
    w_label := EXTRACT(DAY FROM w_start::timestamp)::text || '/' || EXTRACT(MONTH FROM w_start::timestamp)::text
      || ' - ' || EXTRACT(DAY FROM w_end::timestamp)::text || '/' || EXTRACT(MONTH FROM w_end::timestamp)::text;

    SELECT COUNT(*) INTO v_reg
    FROM growth_users WHERE created_date::date >= w_start AND created_date::date <= w_end;

    SELECT COUNT(*) INTO v_act
    FROM growth_users WHERE created_date::date >= w_start AND created_date::date <= w_end AND COALESCE(eventos_valor, 0) >= 1;

    SELECT COUNT(*) INTO v_p
    FROM growth_users WHERE created_date::date >= w_start AND created_date::date <= w_end AND plan_paid = true;

    v_free := v_reg - v_p;

    weekly_arr := weekly_arr || jsonb_build_object(
      'weekLabel', w_label,
      'registered', v_reg,
      'activated', v_act,
      'paid', v_p,
      'free', v_free,
      'activationPct', CASE WHEN v_reg > 0 THEN ROUND((v_act::numeric / v_reg) * 100, 2) ELSE 0 END,
      'conversionPct', CASE WHEN v_reg > 0 THEN ROUND((v_p::numeric / v_reg) * 100, 2) ELSE 0 END
    );
  END LOOP;

  result := jsonb_build_object(
    'has_data', true,
    'funnel', funnel_arr,
    'weekly', weekly_arr
  );

  RETURN result;
END;
$$;

-- ─── RPC 4: get_acquisition_stats ─────────────────────────────
CREATE OR REPLACE FUNCTION get_acquisition_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  v_has_data boolean;
  v_total bigint;
  v_paid bigint;
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
  SELECT EXISTS(SELECT 1 FROM growth_users LIMIT 1) INTO v_has_data;
  IF NOT v_has_data THEN
    RETURN jsonb_build_object('has_data', false);
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE plan_paid = true)
  INTO v_total, v_paid
  FROM growth_users;

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
      'conversionPct', CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE plan_paid = true))::numeric / COUNT(*) * 100, 2) ELSE 0 END
    ) AS row_data
    FROM growth_users
    GROUP BY COALESCE(country, 'Sin pais')
  ) sub;

  -- Channel x Status
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'total')::int DESC), '[]'::jsonb)
  INTO channel_arr
  FROM (
    SELECT jsonb_build_object(
      'key', COALESCE(origin, 'Sin canal'),
      'pago', COUNT(*) FILTER (WHERE plan_paid = true),
      'gratisActivado', COUNT(*) FILTER (WHERE plan_paid = false AND COALESCE(eventos_valor, 0) >= 1),
      'noActivado', COUNT(*) FILTER (WHERE plan_paid = false AND COALESCE(eventos_valor, 0) < 1),
      'total', COUNT(*),
      'conversionPct', CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE plan_paid = true))::numeric / COUNT(*) * 100, 2) ELSE 0 END
    ) AS row_data
    FROM growth_users
    GROUP BY COALESCE(origin, 'Sin canal')
  ) sub;

  -- Channel x Plan (paid users only)
  SELECT COALESCE(jsonb_agg(DISTINCT COALESCE(plan_id, 'Sin plan') ORDER BY COALESCE(plan_id, 'Sin plan')), '[]'::jsonb)
  INTO plan_names_arr
  FROM growth_users
  WHERE plan_paid = true;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'total')::int DESC), '[]'::jsonb)
  INTO channel_plan_arr
  FROM (
    SELECT jsonb_build_object(
      'channel', COALESCE(origin, 'Sin canal'),
      'plans', jsonb_object_agg(COALESCE(plan_id, 'Sin plan'), cnt),
      'total', SUM(cnt)
    ) AS row_data
    FROM (
      SELECT origin, plan_id, COUNT(*) AS cnt
      FROM growth_users
      WHERE plan_paid = true
      GROUP BY origin, plan_id
    ) inner_q
    GROUP BY origin
  ) sub;

  -- Top country, top channel, best conversion channel
  SELECT COALESCE(country, 'Sin pais') INTO v_top_country
  FROM growth_users
  GROUP BY COALESCE(country, 'Sin pais')
  ORDER BY COUNT(*) DESC LIMIT 1;

  SELECT COALESCE(origin, 'Sin canal') INTO v_top_channel
  FROM growth_users
  GROUP BY COALESCE(origin, 'Sin canal')
  ORDER BY COUNT(*) DESC LIMIT 1;

  SELECT sub.origin_key, sub.conv_pct INTO v_best_conv_channel, v_best_conv_pct
  FROM (
    SELECT COALESCE(origin, 'Sin canal') AS origin_key,
           CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE plan_paid = true))::numeric / COUNT(*) * 100, 2) ELSE 0 END AS conv_pct
    FROM growth_users
    GROUP BY COALESCE(origin, 'Sin canal')
    HAVING COUNT(*) >= 10
    ORDER BY conv_pct DESC
    LIMIT 1
  ) sub;

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

  -- Build period keys and rows based on granularity
  WITH orders_with_period AS (
    SELECT
      COALESCE(country, 'Desconocido') AS country,
      amount_usd,
      CASE
        WHEN p_granularity = 'monthly' THEN TO_CHAR(created_at, 'YYYY-MM')
        WHEN p_granularity = 'weekly' THEN TO_CHAR(DATE_TRUNC('week', created_at::timestamp)::date, 'YYYY-MM-DD')
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

  -- Totals per period
  WITH orders_with_period AS (
    SELECT
      amount_usd,
      CASE
        WHEN p_granularity = 'monthly' THEN TO_CHAR(created_at, 'YYYY-MM')
        WHEN p_granularity = 'weekly' THEN TO_CHAR(DATE_TRUNC('week', created_at::timestamp)::date, 'YYYY-MM-DD')
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

  -- Previous year data for YoY
  IF p_prev_year_yoy THEN
    WITH prev_orders AS (
      SELECT
        COALESCE(country, 'Desconocido') AS country,
        amount_usd,
        CASE
          WHEN p_granularity = 'monthly' THEN TO_CHAR(created_at, 'YYYY-MM')
          WHEN p_granularity = 'weekly' THEN TO_CHAR(DATE_TRUNC('week', created_at::timestamp)::date, 'YYYY-MM-DD')
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
