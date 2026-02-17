-- RPC para desactivar usuario (superadmin only)
CREATE OR REPLACE FUNCTION deactivate_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (SELECT role FROM profiles WHERE id = auth.uid()) != 'superadmin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF (SELECT role FROM profiles WHERE id = target_user_id) = 'superadmin' THEN
    RAISE EXCEPTION 'No se puede desactivar a un superadmin';
  END IF;
  UPDATE profiles SET role = NULL WHERE id = target_user_id;
  DELETE FROM user_permissions WHERE user_id = target_user_id;
END;
$$;

-- RPC para crear tarea (recreada - no existía en migraciones)
DROP FUNCTION IF EXISTS create_task_v2(TEXT, TEXT, BIGINT, DATE, UUID);
DROP FUNCTION IF EXISTS create_task_v2(TEXT, TEXT, BIGINT, DATE, BIGINT);

CREATE OR REPLACE FUNCTION create_task_v2(
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_project_id BIGINT DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO tasks (title, description, project_id, due_date, assignee_user_id, owner_id, status, completed)
  VALUES (p_title, p_description, p_project_id, p_due_date, p_assignee_id, auth.uid(), 'Por Hacer', false);
END;
$$;
