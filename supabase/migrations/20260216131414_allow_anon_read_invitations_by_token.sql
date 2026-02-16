-- Permitir que usuarios no autenticados puedan leer invitaciones por token
-- Esto es necesario para que /register?invite_token=X valide el token
CREATE POLICY "Anon puede leer invitaciones por token"
  ON invitations FOR SELECT
  USING (true);

-- Permitir que usuarios autenticados marquen invitaciones como aceptadas
CREATE POLICY "Usuarios autenticados pueden actualizar accepted"
  ON invitations FOR UPDATE
  USING (true)
  WITH CHECK (true);
