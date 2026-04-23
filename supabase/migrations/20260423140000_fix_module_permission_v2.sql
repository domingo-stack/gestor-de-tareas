-- Fix v2: agregar mod_crm y mod_contenido_social al IF/ELSIF chain
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

  -- Inyectar antes del ELSE (que lanza la excepción)
  IF v_src NOT LIKE '%mod_contenido_social%' THEN
    v_src := replace(v_src,
      E'  ELSE\n    RAISE EXCEPTION ''Módulo no válido: %'', module_name;',
      E'  ELSIF module_name = ''mod_contenido_social'' THEN\n    UPDATE user_permissions SET mod_contenido_social = enabled WHERE user_id = target_user_id;\n  ELSE\n    RAISE EXCEPTION ''Módulo no válido: %'', module_name;'
    );
  END IF;

  -- También agregar mod_crm si falta
  IF v_src NOT LIKE '%mod_crm%' THEN
    v_src := replace(v_src,
      E'  ELSIF module_name = ''mod_contenido_social''',
      E'  ELSIF module_name = ''mod_crm'' THEN\n    UPDATE user_permissions SET mod_crm = enabled WHERE user_id = target_user_id;\n  ELSIF module_name = ''mod_contenido_social'''
    );
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'update_user_module_permission: mod_crm + mod_contenido_social agregados';
END $$;
