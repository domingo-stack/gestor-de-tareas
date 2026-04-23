-- ============================================================
-- Fix: el label del paso 5+ en el funnel quedó como "Activados (7+)"
-- cuando debería ser simplemente "5+". El badge visual "activ."
-- se aplica en el frontend en el paso 7+ (index 7).
-- ============================================================

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
    -- Revertir label: "Activados (7+)" → "5+" en el paso del funnel
    v_src := replace(v_src, 'Activados (7+)', '5+');
    EXECUTE v_src;
    RAISE NOTICE 'get_conversion_funnel: label corregido a 5+';
  END IF;
END $$;
