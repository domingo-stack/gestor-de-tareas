-- ============================================================
-- Agregar métricas NSM (Activados 7+ y Tasa activación 7%)
-- al tab Operacional (sección Experiencia del Producto)
-- ============================================================

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'get_weekly_operational_metrics'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE WARNING 'get_weekly_operational_metrics no encontrada';
    RETURN;
  END IF;

  IF v_src LIKE '%v_nsm_activated_vals%' THEN
    RAISE NOTICE 'NSM ya existe en operacional, skip';
    RETURN;
  END IF;

  -- 1. Agregar declaraciones de variables
  v_src := replace(v_src,
    'v_paywall_vals jsonb := ''[]''::jsonb;',
    'v_paywall_vals jsonb := ''[]''::jsonb;
  v_nsm_activated_vals jsonb := ''[]''::jsonb;
  v_nsm_rate_vals jsonb := ''[]''::jsonb;');

  v_src := replace(v_src,
    't_paywall bigint;',
    't_paywall bigint;
  t_nsm_activated bigint;
  t_nsm_rate numeric;');

  -- 2. Agregar queries dentro del loop (después de paywall, antes de VENTAS)
  v_src := replace(v_src,
    '    v_paywall_vals := v_paywall_vals || to_jsonb(t_paywall);

    ---------- VENTAS',
    '    v_paywall_vals := v_paywall_vals || to_jsonb(t_paywall);

    -- NSM: Activados 7+ registrados esta semana
    SELECT COUNT(*) INTO t_nsm_activated
    FROM growth_users
    WHERE created_date >= w_start AND created_date <= w_end
      AND COALESCE(eventos_valor, 0) >= 7
      AND (NOT v_has_country_filter OR country = p_country_filter);
    v_nsm_activated_vals := v_nsm_activated_vals || to_jsonb(t_nsm_activated);

    -- NSM: Tasa de activación 7+
    IF t_registros > 0 THEN
      t_nsm_rate := ROUND((t_nsm_activated::numeric / t_registros) * 100, 1);
    ELSE
      t_nsm_rate := 0;
    END IF;
    v_nsm_rate_vals := v_nsm_rate_vals || to_jsonb(t_nsm_rate);

    ---------- VENTAS');

  -- 3. Agregar métricas al array de producto (después de paywall_views)
  v_src := replace(v_src,
    '''source'', ''growth_events: Pago > Paywall visto — filtrable por país'')
  );',
    '''source'', ''growth_events: Pago > Paywall visto — filtrable por país''),
    jsonb_build_object(''key'', ''nsm_activated'', ''label'', ''Activados 7+ (NSM) / semana'', ''format'', ''number'', ''values'', v_nsm_activated_vals, ''status'', ''ok'', ''source'', ''growth_users: eventos_valor >= 7 AND created_date en semana — filtrable por país''),
    jsonb_build_object(''key'', ''nsm_rate'', ''label'', ''Tasa de activación 7+ (%)'', ''format'', ''pct'', ''values'', v_nsm_rate_vals, ''status'', ''ok'', ''source'', ''activados_7plus ÷ registros_semana × 100 — filtrable por país'')
  );');

  EXECUTE v_src;
  RAISE NOTICE 'get_weekly_operational_metrics: métricas NSM agregadas';
END $$;
