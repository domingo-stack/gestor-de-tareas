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

  -- Agregar al RETURNS type (después de mod_crm boolean)
  v_src := replace(v_src, 'mod_crm boolean)', 'mod_crm boolean, mod_contenido_social boolean)');

  -- Agregar al SELECT dentro del body (después de p.mod_crm)
  v_src := replace(v_src, 'p.mod_crm', 'p.mod_crm, p.mod_contenido_social');

  EXECUTE v_src;
  RAISE NOTICE 'OK: mod_contenido_social agregado a get_user_role_and_permissions';
END $$;
