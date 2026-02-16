-- ============================================================
-- LIMPIEZA: Eliminar RPCs viejas (ejecutar DESPUÉS de verificar estabilidad)
-- ============================================================

-- RPCs de multi-tenant que ya no se usan
DROP FUNCTION IF EXISTS get_user_role_and_team_info();
DROP FUNCTION IF EXISTS get_team_members();
DROP FUNCTION IF EXISTS get_team_members_by_active_team();
DROP FUNCTION IF EXISTS get_team_members_by_id(BIGINT);
DROP FUNCTION IF EXISTS add_member_to_active_team(TEXT);
DROP FUNCTION IF EXISTS remove_team_member(UUID);
DROP FUNCTION IF EXISTS create_new_team(TEXT);

-- NOTA: NO eliminamos las tablas teams/team_members
-- Se dejan como legacy inactivo por seguridad
