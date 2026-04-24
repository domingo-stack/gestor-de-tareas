-- Fix: agregar mod_contenido_social a get_user_role_and_permissions
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'get_user_role_and_permissions'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NULL THEN RAISE WARNING 'RPC no encontrada'; RETURN; END IF;
  IF v_src LIKE '%mod_contenido_social%' THEN RAISE NOTICE 'Ya existe, skip'; RETURN; END IF;

  -- Buscar la posición de mod_crm en el SELECT y agregar mod_contenido_social después
  v_src := replace(v_src, 'mod_crm', 'mod_crm, mod_contenido_social');

  EXECUTE v_src;
  RAISE NOTICE 'get_user_role_and_permissions: mod_contenido_social agregado';
END $$;
