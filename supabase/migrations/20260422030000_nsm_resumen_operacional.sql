-- ============================================================
-- NSM Bloque 2: Agregar campos NSM a get_executive_summary
-- (Operacional se maneja client-side con query adicional)
-- ============================================================

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'get_executive_summary'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE WARNING 'get_executive_summary no encontrada';
    RETURN;
  END IF;

  IF v_src LIKE '%v_nsm_activated_week%' THEN
    RAISE NOTICE 'NSM ya inyectado, skip';
    RETURN;
  END IF;

  -- Inyectar declaraciones de variables NSM
  v_src := replace(v_src,
    'v_has_growth_users boolean := false;',
    'v_has_growth_users boolean := false;
  v_nsm_activated_week bigint := 0;
  v_nsm_total bigint := 0;
  v_nsm_prev_total bigint := 0;');

  -- Inyectar queries NSM después del cálculo de activation_pct
  v_src := replace(v_src,
    'IF v_new_users > 0 THEN
      v_conversion_pct := (v_week_paid_users',
    '-- NSM: registrados esta semana con 7+ eventos
    SELECT COUNT(*) INTO v_nsm_activated_week
    FROM growth_users
    WHERE created_date::date >= p_week_start
      AND created_date::date <= (p_week_start + 6)
      AND COALESCE(eventos_valor, 0) >= 7;

    v_nsm_total := v_activated_users;

    SELECT COUNT(*) INTO v_nsm_prev_total
    FROM growth_users
    WHERE created_date::date < p_week_start
      AND COALESCE(eventos_valor, 0) >= 7;

    IF v_new_users > 0 THEN
      v_conversion_pct := (v_week_paid_users');

  -- Inyectar en resultado jsonb
  v_src := replace(v_src,
    '''has_growth_users'', v_has_growth_users,',
    '''has_growth_users'', v_has_growth_users,
    ''nsm_activated_week'', v_nsm_activated_week,
    ''nsm_total'', v_nsm_total,
    ''nsm_prev_total'', v_nsm_prev_total,');

  EXECUTE v_src;
  RAISE NOTICE 'get_executive_summary: campos NSM agregados';
END $$;
