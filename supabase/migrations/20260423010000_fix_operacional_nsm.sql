-- Fix: inyectar las 2 métricas NSM en el output de v_product_metrics
DO $$
DECLARE
  v_src text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'get_weekly_operational_metrics'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NULL THEN RAISE WARNING 'RPC no encontrada'; RETURN; END IF;

  -- Verificar que no esté ya inyectado en el output
  IF v_src LIKE '%nsm_activated%values%v_nsm_activated_vals%' THEN
    RAISE NOTICE 'NSM ya en output, skip';
    RETURN;
  END IF;

  -- Anchor exacto: fin de la línea paywall en v_product_metrics
  v_old := E'filtrable por pa\u00EDs'')\n  );';
  v_new := E'filtrable por pa\u00EDs''),\n    jsonb_build_object(''key'', ''nsm_activated'', ''label'', ''Activados 7+ (NSM) / semana'', ''format'', ''number'', ''values'', v_nsm_activated_vals, ''status'', ''ok'', ''source'', ''growth_users: eventos_valor >= 7 — filtrable por pa\u00EDs''),\n    jsonb_build_object(''key'', ''nsm_rate'', ''label'', ''Tasa de activaci\u00F3n 7+ (%)'', ''format'', ''pct'', ''values'', v_nsm_rate_vals, ''status'', ''ok'', ''source'', ''activados 7+ / registros semana — filtrable por pa\u00EDs'')\n  );';

  IF v_src NOT LIKE '%' || v_old || '%' THEN
    RAISE WARNING 'Anchor no encontrado, intentando alternativa...';
    -- Intentar sin el salto de línea exacto
    v_old := 'filtrable por país'')' || chr(10) || '  );';
    IF v_src NOT LIKE '%' || v_old || '%' THEN
      RAISE WARNING 'Anchor alternativo tampoco encontrado. Abortando.';
      RETURN;
    END IF;
  END IF;

  v_src := replace(v_src, v_old, v_new);
  EXECUTE v_src;
  RAISE NOTICE 'OK: métricas NSM agregadas al output de v_product_metrics';
END $$;
