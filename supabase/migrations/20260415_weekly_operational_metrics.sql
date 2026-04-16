-- ============================================================
-- RPC: get_weekly_operational_metrics
-- Tab "Operacional" en /revenue: grilla semanal de métricas
-- operacionales agrupadas en 3 secciones (Funnel, Producto, Ventas).
-- Semanas Dom-Sáb en hora Lima (UTC-5).
-- ============================================================

CREATE OR REPLACE FUNCTION get_weekly_operational_metrics(
  p_week_start date,
  p_weeks int DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_weeks jsonb := '[]'::jsonb;
  v_sections jsonb := '[]'::jsonb;
  v_funnel_metrics jsonb := '[]'::jsonb;
  v_product_metrics jsonb := '[]'::jsonb;
  v_sales_metrics jsonb := '[]'::jsonb;

  v_sessions_vals jsonb := '[]'::jsonb;
  v_registro_views_vals jsonb := '[]'::jsonb;
  v_ctr_cta_vals jsonb := '[]'::jsonb;
  v_registros_vals jsonb := '[]'::jsonb;
  v_reg_rate_vals jsonb := '[]'::jsonb;
  v_dau_vals jsonb := '[]'::jsonb;
  v_revenue_vals jsonb := '[]'::jsonb;
  v_failed_vals jsonb := '[]'::jsonb;
  v_ticket_vals jsonb := '[]'::jsonb;

  v_dau_max_date date;
  v_dau_stale boolean := false;

  i int;
  w_start date;
  w_end date;
  w_start_ts timestamp;
  w_end_ts timestamp;
  w_label text;

  t_sessions bigint;
  t_registro_views bigint;
  t_registros bigint;
  t_dau numeric;
  t_revenue numeric;
  t_failed bigint;
  t_ticket numeric;
  t_tx bigint;
  t_ctr numeric;
  t_reg_rate numeric;
BEGIN
  -- Chequear frescura de growth_metrics_daily (DAU stale si último registro < ayer - 1)
  SELECT MAX(metric_date) INTO v_dau_max_date FROM growth_metrics_daily;
  IF v_dau_max_date IS NULL OR v_dau_max_date < (CURRENT_DATE - interval '2 days')::date THEN
    v_dau_stale := true;
  END IF;

  -- Loop desde la semana más antigua a la más reciente (p_weeks columnas)
  FOR i IN REVERSE (p_weeks - 1)..0 LOOP
    w_start := p_week_start - (i * 7);
    w_end := w_start + 6;
    w_label := to_char(w_start, 'DD/MM');

    -- Timestamps UTC equivalentes a 00:00 UTC-5 - 23:59:59 UTC-5
    w_start_ts := w_start::timestamp + interval '5 hours';
    w_end_ts := w_end::timestamp + interval '5 hours' + interval '23 hours 59 minutes 59 seconds';

    v_weeks := v_weeks || jsonb_build_object('week_start', w_start, 'label', w_label);

    -- Funnel Digital — Sesiones web califica.ai (landing)
    SELECT COALESCE(SUM(sessions), 0) INTO t_sessions
    FROM mkt_web_metrics
    WHERE hostname = 'califica.ai'
      AND date BETWEEN w_start AND w_end;

    v_sessions_vals := v_sessions_vals || to_jsonb(t_sessions);

    -- Funnel Digital — Views de /registro en app.califica.ai (proxy de clics CTA)
    SELECT COALESCE(SUM(page_views), 0) INTO t_registro_views
    FROM mkt_web_page_metrics
    WHERE hostname = 'app.califica.ai'
      AND path ILIKE '%/registro%'
      AND date BETWEEN w_start AND w_end;

    v_registro_views_vals := v_registro_views_vals || to_jsonb(t_registro_views);

    -- Funnel Digital — CTR CTA = views(/registro) / sessions(califica.ai) * 100
    IF t_sessions > 0 THEN
      t_ctr := ROUND((t_registro_views::numeric / t_sessions) * 100, 1);
    ELSE
      t_ctr := 0;
    END IF;
    v_ctr_cta_vals := v_ctr_cta_vals || to_jsonb(t_ctr);

    -- Funnel Digital — Registros nuevos (growth_users)
    -- created_date es naive Lima → comparar directo con fecha
    SELECT COUNT(*) INTO t_registros
    FROM growth_users
    WHERE created_date >= w_start::timestamp
      AND created_date < (w_end + 1)::timestamp;

    v_registros_vals := v_registros_vals || to_jsonb(t_registros);

    -- Funnel Digital — Tasa de registro (Visitor→Sign-up) = registros / sessions * 100
    IF t_sessions > 0 THEN
      t_reg_rate := ROUND((t_registros::numeric / t_sessions) * 100, 1);
    ELSE
      t_reg_rate := 0;
    END IF;
    v_reg_rate_vals := v_reg_rate_vals || to_jsonb(t_reg_rate);

    -- Producto — DAU promedio de la semana
    SELECT COALESCE(AVG(dau), 0) INTO t_dau
    FROM growth_metrics_daily
    WHERE metric_date BETWEEN w_start AND w_end;

    v_dau_vals := v_dau_vals || to_jsonb(ROUND(t_dau));

    -- Ventas — Revenue diario promedio (total semana / 7)
    SELECT COALESCE(SUM(amount_usd), 0), COUNT(*)
    INTO t_revenue, t_tx
    FROM rev_orders
    WHERE created_at >= w_start_ts
      AND created_at <= w_end_ts;

    v_revenue_vals := v_revenue_vals || to_jsonb(ROUND(t_revenue / 7, 2));

    -- Ventas — Pagos fallidos / rechazados (payment_failed)
    SELECT COUNT(*) INTO t_failed
    FROM payment_failed
    WHERE fecha_pago_fallido::date BETWEEN w_start AND w_end;

    v_failed_vals := v_failed_vals || to_jsonb(t_failed);

    -- Ventas — Ticket promedio efectivo
    IF t_tx > 0 THEN
      t_ticket := ROUND(t_revenue / t_tx, 2);
    ELSE
      t_ticket := 0;
    END IF;
    v_ticket_vals := v_ticket_vals || to_jsonb(t_ticket);
  END LOOP;

  -- Armar secciones
  v_funnel_metrics := jsonb_build_array(
    jsonb_build_object(
      'key', 'sessions_califica',
      'label', 'Sesiones web (califica.ai)',
      'format', 'number',
      'values', v_sessions_vals,
      'status', 'ok',
      'source', 'mkt_web_metrics (GA4, hostname=califica.ai)'
    ),
    jsonb_build_object(
      'key', 'ctr_cta_registrate',
      'label', 'CTR en CTA "Regístrate Gratis"',
      'format', 'pct',
      'values', v_ctr_cta_vals,
      'status', 'ok',
      'source', 'page_views(/registro en app) ÷ sessions(califica.ai) × 100'
    ),
    jsonb_build_object(
      'key', 'registros_nuevos',
      'label', 'Registros nuevos (sign-ups)',
      'format', 'number',
      'values', v_registros_vals,
      'status', 'ok',
      'source', 'growth_users.created_date'
    ),
    jsonb_build_object(
      'key', 'tasa_registro',
      'label', 'Tasa de registro (Visitor→Sign-up)',
      'format', 'pct',
      'values', v_reg_rate_vals,
      'status', 'ok',
      'source', 'registros ÷ sessions(califica.ai) × 100'
    )
  );

  v_product_metrics := jsonb_build_array(
    jsonb_build_object(
      'key', 'dau',
      'label', 'Usuarios activos diarios (DAU)',
      'format', 'number',
      'values', v_dau_vals,
      'status', CASE WHEN v_dau_stale THEN 'stale' ELSE 'ok' END,
      'source', 'growth_metrics_daily (Mixpanel, promedio semanal)',
      'stale_since', v_dau_max_date
    ),
    jsonb_build_object(
      'key', 'docs_creados_dia',
      'label', 'Documentos creados / día',
      'format', 'number',
      'values', '[]'::jsonb,
      'status', 'pending',
      'source', 'Pendiente: growth_events (evento "IA > Generar Material")'
    ),
    jsonb_build_object(
      'key', 'docs_por_usuario',
      'label', 'Documentos creados / usuario activo',
      'format', 'number',
      'values', '[]'::jsonb,
      'status', 'pending',
      'source', 'Pendiente: derivado de docs/día ÷ DAU'
    ),
    jsonb_build_object(
      'key', 'descargas_dia',
      'label', 'Descargas de documentos / día',
      'format', 'number',
      'values', '[]'::jsonb,
      'status', 'pending',
      'source', 'Pendiente: growth_events (evento "Doc > Descargar")'
    ),
    jsonb_build_object(
      'key', 'kalichat_dia',
      'label', 'Mensajes KaliChat / día',
      'format', 'number',
      'values', '[]'::jsonb,
      'status', 'pending',
      'source', 'Pendiente: growth_events (evento KaliChat por confirmar)'
    ),
    jsonb_build_object(
      'key', 'paywall_views',
      'label', 'Vistas del Paywall',
      'format', 'number',
      'values', '[]'::jsonb,
      'status', 'pending',
      'source', 'Pendiente: growth_events (evento "Pago > Paywall visto")'
    )
  );

  v_sales_metrics := jsonb_build_array(
    jsonb_build_object(
      'key', 'checkout_views',
      'label', 'Visitas a página de pago (checkout)',
      'format', 'number',
      'values', '[]'::jsonb,
      'status', 'pending',
      'source', 'Pendiente: growth_events (evento "Pago > Intento")'
    ),
    jsonb_build_object(
      'key', 'revenue_diario',
      'label', 'Revenue diario (USD, promedio semanal)',
      'format', 'usd',
      'values', v_revenue_vals,
      'status', 'ok',
      'source', 'rev_orders.amount_usd ÷ 7'
    ),
    jsonb_build_object(
      'key', 'abandono_checkout',
      'label', 'Tasa de abandono de checkout',
      'format', 'pct',
      'values', '[]'::jsonb,
      'status', 'pending',
      'source', 'Pendiente: growth_events (intento vs éxito)'
    ),
    jsonb_build_object(
      'key', 'pagos_fallidos',
      'label', 'Pagos fallidos / rechazados',
      'format', 'number',
      'values', v_failed_vals,
      'status', 'ok',
      'source', 'payment_failed.fecha_pago_fallido'
    ),
    jsonb_build_object(
      'key', 'ticket_promedio',
      'label', 'Ticket promedio efectivo',
      'format', 'usd',
      'values', v_ticket_vals,
      'status', 'ok',
      'source', 'rev_orders: SUM(amount_usd) ÷ COUNT(*)'
    )
  );

  v_sections := jsonb_build_array(
    jsonb_build_object('name', 'Funnel Digital – Comercial', 'color', 'blue', 'metrics', v_funnel_metrics),
    jsonb_build_object('name', 'Experiencia del Producto', 'color', 'amber', 'metrics', v_product_metrics),
    jsonb_build_object('name', 'Ventas (Conversión & Revenue)', 'color', 'green', 'metrics', v_sales_metrics)
  );

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'weeks', v_weeks,
      'p_week_start', p_week_start,
      'p_weeks', p_weeks,
      'dau_stale', v_dau_stale,
      'dau_last_date', v_dau_max_date
    ),
    'sections', v_sections
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_weekly_operational_metrics(date, int) TO authenticated;
