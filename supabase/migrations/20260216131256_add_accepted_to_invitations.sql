-- Agregar columna accepted a invitations para rastrear invitaciones usadas
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted BOOLEAN NOT NULL DEFAULT false;
