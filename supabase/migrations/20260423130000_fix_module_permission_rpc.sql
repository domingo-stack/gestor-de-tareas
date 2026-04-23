-- Fix: agregar mod_contenido_social a la whitelist de update_user_module_permission
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'update_user_module_permission'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NULL THEN RAISE WARNING 'RPC no encontrada'; RETURN; END IF;

  IF v_src LIKE '%mod_contenido_social%' THEN
    RAISE NOTICE 'mod_contenido_social ya está en la whitelist, skip';
    RETURN;
  END IF;

  -- Agregar mod_contenido_social después de mod_crm en la whitelist
  v_src := replace(v_src, '''mod_crm'')', '''mod_crm'', ''mod_contenido_social'')');

  EXECUTE v_src;
  RAISE NOTICE 'update_user_module_permission: mod_contenido_social agregado';
END $$;
