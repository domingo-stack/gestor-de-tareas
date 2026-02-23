-- ============================================================
-- Sistema de Preferencias de Notificaciones
-- ============================================================

-- Tabla de preferencias por usuario
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  event_created    TEXT NOT NULL DEFAULT 'default',  -- 'all' | 'inapp' | 'email' | 'off' | 'default'
  task_assigned    TEXT NOT NULL DEFAULT 'default',
  task_completed   TEXT NOT NULL DEFAULT 'default',
  mention          TEXT NOT NULL DEFAULT 'default',
  review_request   TEXT NOT NULL DEFAULT 'default',
  review_result    TEXT NOT NULL DEFAULT 'default',
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Validación de valores permitidos
ALTER TABLE notification_preferences
  ADD CONSTRAINT chk_event_created CHECK (event_created IN ('all','inapp','email','off','default')),
  ADD CONSTRAINT chk_task_assigned CHECK (task_assigned IN ('all','inapp','email','off','default')),
  ADD CONSTRAINT chk_task_completed CHECK (task_completed IN ('all','inapp','email','off','default')),
  ADD CONSTRAINT chk_mention CHECK (mention IN ('all','inapp','email','off','default')),
  ADD CONSTRAINT chk_review_request CHECK (review_request IN ('all','inapp','email','off','default')),
  ADD CONSTRAINT chk_review_result CHECK (review_result IN ('all','inapp','email','off','default'));

-- RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Superadmin puede ver todas (via RLS)
CREATE POLICY "Superadmin can view all preferences"
  ON notification_preferences FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin')
  );

CREATE POLICY "Superadmin can update all preferences"
  ON notification_preferences FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin')
  );

-- ============================================================
-- RPC: get_notification_preferences
-- Retorna preferencias + rol + permisos de un usuario
-- ============================================================
CREATE OR REPLACE FUNCTION get_notification_preferences(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'user_id', p_user_id,
    'role', COALESCE(pr.role, 'invitado'),
    'mod_calendario', COALESCE(up.mod_calendario, false),
    'mod_tareas', COALESCE(up.mod_tareas, false),
    'event_created', COALESCE(np.event_created, 'default'),
    'task_assigned', COALESCE(np.task_assigned, 'default'),
    'task_completed', COALESCE(np.task_completed, 'default'),
    'mention', COALESCE(np.mention, 'default'),
    'review_request', COALESCE(np.review_request, 'default'),
    'review_result', COALESCE(np.review_result, 'default')
  ) INTO result
  FROM auth.users u
  LEFT JOIN profiles pr ON pr.id = u.id
  LEFT JOIN user_permissions up ON up.user_id = u.id
  LEFT JOIN notification_preferences np ON np.user_id = u.id
  WHERE u.id = p_user_id;

  RETURN result;
END;
$$;

-- ============================================================
-- RPC: upsert_notification_preferences
-- Solo el propio usuario o superadmin puede llamar
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_notification_preferences(p_user_id UUID, p_prefs JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  -- Solo el propio usuario o un superadmin
  IF auth.uid() != p_user_id AND caller_role != 'superadmin' THEN
    RAISE EXCEPTION 'No tienes permiso para modificar estas preferencias';
  END IF;

  INSERT INTO notification_preferences (user_id, event_created, task_assigned, task_completed, mention, review_request, review_result, updated_at)
  VALUES (
    p_user_id,
    COALESCE(p_prefs->>'event_created', 'default'),
    COALESCE(p_prefs->>'task_assigned', 'default'),
    COALESCE(p_prefs->>'task_completed', 'default'),
    COALESCE(p_prefs->>'mention', 'default'),
    COALESCE(p_prefs->>'review_request', 'default'),
    COALESCE(p_prefs->>'review_result', 'default'),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    event_created = COALESCE(p_prefs->>'event_created', notification_preferences.event_created),
    task_assigned = COALESCE(p_prefs->>'task_assigned', notification_preferences.task_assigned),
    task_completed = COALESCE(p_prefs->>'task_completed', notification_preferences.task_completed),
    mention = COALESCE(p_prefs->>'mention', notification_preferences.mention),
    review_request = COALESCE(p_prefs->>'review_request', notification_preferences.review_request),
    review_result = COALESCE(p_prefs->>'review_result', notification_preferences.review_result),
    updated_at = now();
END;
$$;

-- ============================================================
-- RPC: get_all_notification_preferences (solo superadmin)
-- ============================================================
CREATE OR REPLACE FUNCTION get_all_notification_preferences()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  event_created TEXT,
  task_assigned TEXT,
  task_completed TEXT,
  mention TEXT,
  review_request TEXT,
  review_result TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT profiles.role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role != 'superadmin' THEN
    RAISE EXCEPTION 'Solo superadmin puede ver todas las preferencias';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT AS email,
    COALESCE(pr.role, 'invitado')::TEXT AS role,
    COALESCE(np.event_created, 'default')::TEXT AS event_created,
    COALESCE(np.task_assigned, 'default')::TEXT AS task_assigned,
    COALESCE(np.task_completed, 'default')::TEXT AS task_completed,
    COALESCE(np.mention, 'default')::TEXT AS mention,
    COALESCE(np.review_request, 'default')::TEXT AS review_request,
    COALESCE(np.review_result, 'default')::TEXT AS review_result
  FROM auth.users u
  LEFT JOIN profiles pr ON pr.id = u.id
  LEFT JOIN notification_preferences np ON np.user_id = u.id
  ORDER BY u.email;
END;
$$;

-- ============================================================
-- Función helper para Edge Functions: get_notification_recipients
-- Centraliza la lógica de filtrado por preferencias + permisos
-- ============================================================
CREATE OR REPLACE FUNCTION get_notification_recipients(p_notification_type TEXT)
RETURNS TABLE (user_id UUID, email TEXT, send_email BOOLEAN, send_inapp BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_data AS (
    SELECT
      u.id AS uid,
      u.email::TEXT AS uemail,
      COALESCE(pr.role, 'invitado') AS urole,
      COALESCE(up.mod_calendario, false) AS has_calendario,
      -- Obtener la preferencia del usuario para este tipo
      CASE p_notification_type
        WHEN 'event_created' THEN COALESCE(np.event_created, 'default')
        WHEN 'task_assigned' THEN COALESCE(np.task_assigned, 'default')
        WHEN 'task_completed' THEN COALESCE(np.task_completed, 'default')
        WHEN 'mention' THEN COALESCE(np.mention, 'default')
        WHEN 'review_request' THEN COALESCE(np.review_request, 'default')
        WHEN 'review_result' THEN COALESCE(np.review_result, 'default')
        ELSE 'default'
      END AS user_pref
    FROM auth.users u
    LEFT JOIN profiles pr ON pr.id = u.id
    LEFT JOIN user_permissions up ON up.user_id = u.id
    LEFT JOIN notification_preferences np ON np.user_id = u.id
  ),
  resolved AS (
    SELECT
      ud.uid,
      ud.uemail,
      ud.urole,
      ud.has_calendario,
      -- Resolver 'default' usando defaults por rol
      CASE
        WHEN ud.user_pref != 'default' THEN ud.user_pref
        -- Defaults por rol
        WHEN p_notification_type = 'event_created' THEN
          CASE ud.urole
            WHEN 'superadmin' THEN 'all'
            WHEN 'member' THEN 'inapp'
            ELSE 'off'  -- invitado
          END
        WHEN p_notification_type = 'task_assigned' THEN 'all'
        WHEN p_notification_type = 'task_completed' THEN
          CASE ud.urole
            WHEN 'invitado' THEN 'inapp'
            ELSE 'all'
          END
        WHEN p_notification_type = 'mention' THEN 'all'
        WHEN p_notification_type = 'review_request' THEN 'all'
        WHEN p_notification_type = 'review_result' THEN 'all'
        ELSE 'off'
      END AS resolved_pref
    FROM user_data ud
  )
  SELECT
    r.uid AS user_id,
    r.uemail AS email,
    (r.resolved_pref IN ('all', 'email')) AS send_email,
    (r.resolved_pref IN ('all', 'inapp')) AS send_inapp
  FROM resolved r
  WHERE r.resolved_pref != 'off'
    -- Filtro por permisos de módulo para broadcasts
    AND (
      p_notification_type != 'event_created'
      OR r.urole = 'superadmin'
      OR r.has_calendario = true
    );
END;
$$;
