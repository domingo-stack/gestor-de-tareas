CREATE OR REPLACE FUNCTION deactivate_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Solo superadmin puede desactivar
  IF (SELECT role FROM profiles WHERE id = auth.uid()) != 'superadmin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  -- No desactivar superadmins
  IF (SELECT role FROM profiles WHERE id = target_user_id) = 'superadmin' THEN
    RAISE EXCEPTION 'No se puede desactivar a un superadmin';
  END IF;
  -- Nullificar rol
  UPDATE profiles SET role = NULL WHERE id = target_user_id;
  -- Borrar permisos
  DELETE FROM user_permissions WHERE user_id = target_user_id;
END;
$$;
