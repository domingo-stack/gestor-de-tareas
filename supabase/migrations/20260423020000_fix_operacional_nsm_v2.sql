-- Fix v2: usar anchor exacto del output de pg_get_functiondef
DO $$
DECLARE
  v_src text;
  v_anchor text;
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
  IF v_src LIKE '%nsm_rate%values%v_nsm_rate_vals%' THEN
    RAISE NOTICE 'NSM ya inyectado en output, skip'; RETURN;
  END IF;

  -- Buscar la posición de la última entrada de v_product_metrics
  -- Anchor: 'paywall_views' en el jsonb_build_object
  v_pos := position('paywall_views' IN v_src);
  IF v_pos = 0 THEN RAISE WARNING 'paywall_views no encontrado'; RETURN; END IF;

  -- Encontrar el cierre ');' después de paywall_views (fin de v_product_metrics := jsonb_build_array(...);)
  -- Buscar la primera ocurrencia de ');' después de v_pos
  v_pos := position(');' IN substring(v_src FROM v_pos));
  IF v_pos = 0 THEN RAISE WARNING 'cierre ); no encontrado'; RETURN; END IF;

  -- Recalcular posición absoluta
  v_pos := position('paywall_views' IN v_src) + v_pos - 1;

  -- Insertar las 2 métricas ANTES del ');'
  v_before := substring(v_src FROM 1 FOR v_pos - 1);
  v_after := substring(v_src FROM v_pos);

  v_inject := ',
    jsonb_build_object(''key'', ''nsm_activated'', ''label'', ''Activados 7+ (NSM) / semana'', ''format'', ''number'', ''values'', v_nsm_activated_vals, ''status'', ''ok'', ''source'', ''growth_users: eventos_valor >= 7, filtrable por pais''),
    jsonb_build_object(''key'', ''nsm_rate'', ''label'', ''Tasa de activacion 7+ (%)'', ''format'', ''pct'', ''values'', v_nsm_rate_vals, ''status'', ''ok'', ''source'', ''activados 7+ / registros semana, filtrable por pais'')';

  v_src := v_before || v_inject || v_after;

  EXECUTE v_src;
  RAISE NOTICE 'OK: 2 metricas NSM inyectadas en v_product_metrics';
END $$;
