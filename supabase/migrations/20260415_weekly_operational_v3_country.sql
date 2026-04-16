-- ============================================================
-- RPC v3: get_weekly_operational_metrics
-- - Match exacto con Adquisición: comparación created_date con date, Dom-Sáb
-- - Agrega p_country_filter (NULL = todos)
-- - Retorna country_options en meta para el dropdown del frontend
-- ============================================================

DROP FUNCTION IF EXISTS get_weekly_operational_metrics(date, int);

CREATE OR REPLACE FUNCTION get_weekly_operational_metrics(
  p_week_start date,
  p_weeks int DEFAULT 8,
  p_country_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_weeks jsonb := '[]'::jsonb;
  v_sections jsonb;
  v_funnel_metrics jsonb;
  v_product_metrics jsonb;
  v_sales_metrics jsonb;
  v_country_options jsonb;

  v_sessions_vals jsonb := '[]'::jsonb;
  v_registro_views_vals jsonb := '[]'::jsonb;
  v_ctr_cta_vals jsonb := '[]'::jsonb;
  v_registros_vals jsonb := '[]'::jsonb;
  v_reg_rate_vals jsonb := '[]'::jsonb;

  v_dau_vals jsonb := '[]'::jsonb;
  v_docs_creados_vals jsonb := '[]'::jsonb;
  v_docs_por_usuario_vals jsonb := '[]'::jsonb;
  v_descargas_vals jsonb := '[]'::jsonb;
  v_kalichat_vals jsonb := '[]'::jsonb;
  v_paywall_vals jsonb := '[]'::jsonb;

  v_checkout_vals jsonb := '[]'::jsonb;
  v_revenue_vals jsonb := '[]'::jsonb;
  v_abandono_vals jsonb := '[]'::jsonb;
  v_failed_vals jsonb := '[]'::jsonb;
  v_ticket_vals jsonb := '[]'::jsonb;

  v_dau_max_date date;
  v_events_max_date date;
  v_dau_stale boolean := false;
  v_events_stale boolean := false;

  i int;
  w_start date;
  w_end date;
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

  t_docs_creados bigint;
  t_descargas bigint;
  t_kalichat bigint;
  t_paywall bigint;
  t_checkout bigint;
  t_pago_exito bigint;
  t_docs_por_usuario numeric;
  t_abandono numeric;

  v_has_country_filter boolean;
  v_country_suffix text;
BEGIN
  v_has_country_filter := p_country_filter IS NOT NULL AND p_country_filter <> 'all' AND p_country_filter <> '';
  v_country_suffix := CASE WHEN v_has_country_filter THEN ' (global)' ELSE '' END;

  SELECT MAX(metric_date) INTO v_dau_max_date FROM growth_metrics_daily;
  IF v_dau_max_date IS NULL OR v_dau_max_date < (CURRENT_DATE - interval '2 days')::date THEN
    v_dau_stale := true;
  END IF;

  SELECT MAX(event_date) INTO v_events_max_date FROM growth_events;
  IF v_events_max_date IS NULL OR v_events_max_date < (CURRENT_DATE - interval '2 days')::date THEN
    v_events_stale := true;
  END IF;

  -- Country options (para el dropdown del frontend)
  SELECT COALESCE(jsonb_agg(country ORDER BY total DESC), '[]'::jsonb)
  INTO v_country_options
  FROM (
    SELECT COALESCE(country, 'Sin país') AS country, COUNT(*) AS total
    FROM growth_users
    WHERE country IS NOT NULL
    GROUP BY country
    ORDER BY total DESC
    LIMIT 30
  ) c;

  FOR i IN REVERSE (p_weeks - 1)..0 LOOP
    w_start := p_week_start - (i * 7);
    w_end := w_start + 6;
    w_label := to_char(w_start, 'DD/MM');

    v_weeks := v_weeks || jsonb_build_object('week_start', w_start, 'label', w_label);

    ---------- FUNNEL DIGITAL ----------
    -- Sesiones web (GA4, hostname califica.ai) — NO soporta filtro por país
    SELECT COALESCE(SUM(sessions), 0) INTO t_sessions
    FROM mkt_web_metrics
    WHERE hostname = 'califica.ai'
      AND date BETWEEN w_start AND w_end;
    v_sessions_vals := v_sessions_vals || to_jsonb(t_sessions);

    -- Page views /registro — NO soporta filtro por país
    SELECT COALESCE(SUM(page_views), 0) INTO t_registro_views
    FROM mkt_web_page_metrics
    WHERE hostname = 'app.califica.ai'
      AND path ILIKE '%/registro%'
      AND date BETWEEN w_start AND w_end;
    v_registro_views_vals := v_registro_views_vals || to_jsonb(t_registro_views);

    IF t_sessions > 0 THEN
      t_ctr := ROUND((t_registro_views::numeric / t_sessions) * 100, 1);
    ELSE
      t_ctr := 0;
    END IF;
    v_ctr_cta_vals := v_ctr_cta_vals || to_jsonb(t_ctr);

    -- Registros — mismo patrón exacto que get_acquisition_stats
    SELECT COUNT(*) INTO t_registros
    FROM growth_users
    WHERE created_date >= w_start AND created_date <= w_end
      AND (NOT v_has_country_filter OR country = p_country_filter);
    v_registros_vals := v_registros_vals || to_jsonb(t_registros);

    -- Tasa registro — denominador sessions (no filtrable), numerador filtrado
    IF t_sessions > 0 THEN
      t_reg_rate := ROUND((t_registros::numeric / t_sessions) * 100, 1);
    ELSE
      t_reg_rate := 0;
    END IF;
    v_reg_rate_vals := v_reg_rate_vals || to_jsonb(t_reg_rate);

    ---------- PRODUCTO ----------
    -- DAU, docs creados, descargas, kalichat, paywall — NO soportan filtro país
    SELECT COALESCE(AVG(dau), 0) INTO t_dau
    FROM growth_metrics_daily
    WHERE metric_date BETWEEN w_start AND w_end;
    v_dau_vals := v_dau_vals || to_jsonb(ROUND(t_dau));

    SELECT COALESCE(SUM(total_count), 0) INTO t_docs_creados
    FROM growth_events
    WHERE event_name = 'IA > Generar Material'
      AND event_date BETWEEN w_start AND w_end;
    v_docs_creados_vals := v_docs_creados_vals || to_jsonb(ROUND(t_docs_creados::numeric / 7));

    IF t_dau > 0 THEN
      t_docs_por_usuario := ROUND((t_docs_creados::numeric / 7) / t_dau, 2);
    ELSE
      t_docs_por_usuario := 0;
    END IF;
    v_docs_por_usuario_vals := v_docs_por_usuario_vals || to_jsonb(t_docs_por_usuario);

    SELECT COALESCE(SUM(total_count), 0) INTO t_descargas
    FROM growth_events
    WHERE event_name = 'Doc > Descargar'
      AND event_date BETWEEN w_start AND w_end;
    v_descargas_vals := v_descargas_vals || to_jsonb(ROUND(t_descargas::numeric / 7));

    SELECT COALESCE(SUM(total_count), 0) INTO t_kalichat
    FROM growth_events
    WHERE event_name = 'IA > Generar Material :: Kalichat'
      AND event_date BETWEEN w_start AND w_end;
    v_kalichat_vals := v_kalichat_vals || to_jsonb(ROUND(t_kalichat::numeric / 7));

    SELECT COALESCE(SUM(total_count), 0) INTO t_paywall
    FROM growth_events
    WHERE event_name = 'Pago > Paywall visto'
      AND event_date BETWEEN w_start AND w_end;
    v_paywall_vals := v_paywall_vals || to_jsonb(t_paywall);

    ---------- VENTAS ----------
    -- Checkout visits — NO soporta filtro país (growth_events)
    SELECT COALESCE(SUM(total_count), 0) INTO t_checkout
    FROM growth_events
    WHERE event_name = 'Pago > Intento'
      AND event_date BETWEEN w_start AND w_end;
    v_checkout_vals := v_checkout_vals || to_jsonb(t_checkout);

    SELECT COALESCE(SUM(total_count), 0) INTO t_pago_exito
    FROM growth_events
    WHERE event_name = 'Pago > Exito'
      AND event_date BETWEEN w_start AND w_end;

    IF t_checkout > 0 THEN
      t_abandono := ROUND((1 - (t_pago_exito::numeric / t_checkout)) * 100, 1);
    ELSE
      t_abandono := 0;
    END IF;
    v_abandono_vals := v_abandono_vals || to_jsonb(t_abandono);

    -- Revenue — SÍ soporta filtro país (rev_orders.country)
    SELECT COALESCE(SUM(amount_usd), 0), COUNT(*)
    INTO t_revenue, t_tx
    FROM rev_orders
    WHERE created_at >= (w_start::timestamp + interval '5 hours')
      AND created_at <= (w_end::timestamp + interval '5 hours' + interval '23 hours 59 minutes 59 seconds')
      AND (NOT v_has_country_filter OR country = p_country_filter);
    v_revenue_vals := v_revenue_vals || to_jsonb(ROUND(t_revenue / 7, 2));

    -- Pagos fallidos — SÍ soporta filtro país (payment_failed.pais)
    SELECT COUNT(*) INTO t_failed
    FROM payment_failed
    WHERE fecha_pago_fallido::date BETWEEN w_start AND w_end
      AND (NOT v_has_country_filter OR pais = p_country_filter);
    v_failed_vals := v_failed_vals || to_jsonb(t_failed);

    -- Ticket promedio — mismo rev_orders ya filtrado
    IF t_tx > 0 THEN
      t_ticket := ROUND(t_revenue / t_tx, 2);
    ELSE
      t_ticket := 0;
    END IF;
    v_ticket_vals := v_ticket_vals || to_jsonb(t_ticket);
  END LOOP;

  ---------- ENSAMBLAR SECCIONES ----------
  v_funnel_metrics := jsonb_build_array(
    jsonb_build_object('key', 'sessions_califica', 'label', 'Sesiones web (califica.ai)' || v_country_suffix, 'format', 'number', 'values', v_sessions_vals, 'status', 'ok', 'source', 'mkt_web_metrics (GA4, hostname=califica.ai, no filtra por país)'),
    jsonb_build_object('key', 'ctr_cta_registrate', 'label', 'CTR en CTA "Regístrate Gratis"' || v_country_suffix, 'format', 'pct', 'values', v_ctr_cta_vals, 'status', 'ok', 'source', 'page_views(/registro) ÷ sessions(califica.ai) × 100 (no filtra por país)'),
    jsonb_build_object('key', 'registros_nuevos', 'label', 'Registros nuevos (sign-ups)', 'format', 'number', 'values', v_registros_vals, 'status', 'ok', 'source', 'growth_users.created_date — mismo corte Dom-Sáb que Adquisición'),
    jsonb_build_object('key', 'tasa_registro', 'label', 'Tasa de registro (Visitor→Sign-up)', 'format', 'pct', 'values', v_reg_rate_vals, 'status', 'ok', 'source', 'registros ÷ sessions(califica.ai) × 100')
  );

  v_product_metrics := jsonb_build_array(
    jsonb_build_object('key', 'dau', 'label', 'Usuarios activos diarios (DAU)' || v_country_suffix, 'format', 'number', 'values', v_dau_vals, 'status', CASE WHEN v_dau_stale THEN 'stale' ELSE 'ok' END, 'source', 'growth_metrics_daily (no filtra por país)', 'stale_since', v_dau_max_date),
    jsonb_build_object('key', 'docs_creados_dia', 'label', 'Documentos creados / día' || v_country_suffix, 'format', 'number', 'values', v_docs_creados_vals, 'status', CASE WHEN v_events_stale THEN 'stale' ELSE 'ok' END, 'source', 'growth_events: IA > Generar Material (÷7, no filtra por país)'),
    jsonb_build_object('key', 'docs_por_usuario', 'label', 'Documentos creados / usuario activo' || v_country_suffix, 'format', 'number', 'values', v_docs_por_usuario_vals, 'status', CASE WHEN v_dau_stale OR v_events_stale THEN 'stale' ELSE 'ok' END, 'source', 'docs_creados_día ÷ DAU'),
    jsonb_build_object('key', 'descargas_dia', 'label', 'Descargas de documentos / día' || v_country_suffix, 'format', 'number', 'values', v_descargas_vals, 'status', CASE WHEN v_events_stale THEN 'stale' ELSE 'ok' END, 'source', 'growth_events: Doc > Descargar (÷7, no filtra por país)'),
    jsonb_build_object('key', 'kalichat_dia', 'label', 'Mensajes Kalichat / día' || v_country_suffix, 'format', 'number', 'values', v_kalichat_vals, 'status', CASE WHEN v_events_stale THEN 'stale' ELSE 'ok' END, 'source', 'growth_events: IA > Generar Material :: Kalichat (÷7, no filtra por país)'),
    jsonb_build_object('key', 'paywall_views', 'label', 'Vistas del Paywall' || v_country_suffix, 'format', 'number', 'values', v_paywall_vals, 'status', CASE WHEN v_events_stale THEN 'stale' ELSE 'ok' END, 'source', 'growth_events: Pago > Paywall visto (no filtra por país)')
  );

  v_sales_metrics := jsonb_build_array(
    jsonb_build_object('key', 'checkout_views', 'label', 'Visitas a página de pago (checkout)' || v_country_suffix, 'format', 'number', 'values', v_checkout_vals, 'status', CASE WHEN v_events_stale THEN 'stale' ELSE 'ok' END, 'source', 'growth_events: Pago > Intento (no filtra por país)'),
    jsonb_build_object('key', 'revenue_diario', 'label', 'Revenue diario (USD, promedio semanal)', 'format', 'usd', 'values', v_revenue_vals, 'status', 'ok', 'source', 'rev_orders.amount_usd ÷ 7 — filtra por país'),
    jsonb_build_object('key', 'abandono_checkout', 'label', 'Tasa de abandono de checkout' || v_country_suffix, 'format', 'pct', 'values', v_abandono_vals, 'status', CASE WHEN v_events_stale THEN 'stale' ELSE 'ok' END, 'source', '(1 - Pago Exito ÷ Pago Intento) × 100 (no filtra por país)'),
    jsonb_build_object('key', 'pagos_fallidos', 'label', 'Pagos fallidos / rechazados', 'format', 'number', 'values', v_failed_vals, 'status', 'ok', 'source', 'payment_failed.fecha_pago_fallido — filtra por país'),
    jsonb_build_object('key', 'ticket_promedio', 'label', 'Ticket promedio efectivo', 'format', 'usd', 'values', v_ticket_vals, 'status', 'ok', 'source', 'rev_orders: SUM(amount_usd) ÷ COUNT(*) — filtra por país')
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
      'country_filter', p_country_filter,
      'country_options', v_country_options,
      'dau_stale', v_dau_stale,
      'dau_last_date', v_dau_max_date,
      'events_stale', v_events_stale,
      'events_last_date', v_events_max_date
    ),
    'sections', v_sections
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_weekly_operational_metrics(date, int, text) TO authenticated;
