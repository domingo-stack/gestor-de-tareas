-- Fix v3: inyectar mod_contenido_social con el formato exacto de la función
DO $$
DECLARE
  v_src text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc
  WHERE proname = 'update_user_module_permission'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NULL THEN RAISE WARNING 'RPC no encontrada'; RETURN; END IF;
  IF v_src LIKE '%mod_contenido_social%' THEN RAISE NOTICE 'Ya existe, skip'; RETURN; END IF;

  v_old := '    ELSE' || chr(10) || '      RAISE EXCEPTION ''Módulo no válido: %'', module_name;';
  v_new := '    ELSIF module_name = ''mod_contenido_social'' THEN' || chr(10) ||
           '      UPDATE user_permissions SET mod_contenido_social = enabled WHERE user_id = target_user_id;' || chr(10) ||
           '    ELSE' || chr(10) ||
           '      RAISE EXCEPTION ''Módulo no válido: %'', module_name;';

  IF v_src NOT LIKE '%' || v_old || '%' THEN
    RAISE WARNING 'Anchor no encontrado, probando alternativa...';
    -- Buscar con position
    DECLARE
      v_pos int;
    BEGIN
      v_pos := position('ELSE' IN substring(v_src FROM position('mod_crm' IN v_src)));
      IF v_pos > 0 THEN
        v_pos := position('mod_crm' IN v_src) + v_pos - 1;
        v_src := substring(v_src FROM 1 FOR v_pos - 1) ||
                 'ELSIF module_name = ''mod_contenido_social'' THEN' || chr(10) ||
                 '      UPDATE user_permissions SET mod_contenido_social = enabled WHERE user_id = target_user_id;' || chr(10) ||
                 '    ' || substring(v_src FROM v_pos);
        EXECUTE v_src;
        RAISE NOTICE 'OK via position insert';
        RETURN;
      END IF;
    END;
    RAISE WARNING 'No se pudo inyectar';
    RETURN;
  END IF;

  v_src := replace(v_src, v_old, v_new);
  EXECUTE v_src;
  RAISE NOTICE 'OK: mod_contenido_social inyectado via replace';
END $$;
