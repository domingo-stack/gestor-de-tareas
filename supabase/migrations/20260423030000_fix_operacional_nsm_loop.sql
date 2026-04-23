-- Fix: inyectar queries NSM en el loop (después de paywall, antes de VENTAS)
DO $$
DECLARE
  v_src text;
  v_pos int;
  v_before text;
  v_after text;
  v_inject text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'get_weekly_operational_metrics'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NULL THEN RAISE WARNING 'RPC no encontrada'; RETURN; END IF;
  IF v_src LIKE '%v_nsm_activated_vals := v_nsm_activated_vals%' THEN
    RAISE NOTICE 'Loop code ya existe, skip'; RETURN;
  END IF;

  -- Anchor: '---------- VENTAS' en el loop
  v_pos := position('---------- VENTAS' IN v_src);
  IF v_pos = 0 THEN RAISE WARNING 'Anchor VENTAS no encontrado'; RETURN; END IF;

  v_before := substring(v_src FROM 1 FOR v_pos - 1);
  v_after := substring(v_src FROM v_pos);

  v_inject := '-- NSM: Activados 7+ registrados esta semana
    SELECT COUNT(*) INTO t_nsm_activated
    FROM growth_users
    WHERE created_date >= w_start AND created_date <= w_end
      AND COALESCE(eventos_valor, 0) >= 7
      AND (NOT v_has_country_filter OR country = p_country_filter);
    v_nsm_activated_vals := v_nsm_activated_vals || to_jsonb(t_nsm_activated);

    IF t_registros > 0 THEN
      t_nsm_rate := ROUND((t_nsm_activated::numeric / t_registros) * 100, 1);
    ELSE
      t_nsm_rate := 0;
    END IF;
    v_nsm_rate_vals := v_nsm_rate_vals || to_jsonb(t_nsm_rate);

    ';

  v_src := v_before || v_inject || v_after;
  EXECUTE v_src;
  RAISE NOTICE 'OK: queries NSM inyectadas en el loop';
END $$;
