-- =============================================
-- SISTEMA DE APROBACIÓN DE CONTENIDO
-- =============================================

-- 1. Tabla: Rondas de revisión
CREATE TABLE content_reviews (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES company_events(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  attachment_url TEXT NOT NULL,
  attachment_type TEXT NOT NULL CHECK (attachment_type IN ('image', 'video', 'drive_url')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  timer_hours NUMERIC NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  round_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- 2. Tabla: Respuestas de cada revisor
CREATE TABLE review_responses (
  id SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES content_reviews(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  decision TEXT CHECK (decision IN ('approved', 'rejected')),
  comment TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Columna review_status en company_events
ALTER TABLE company_events ADD COLUMN review_status TEXT DEFAULT 'none'
  CHECK (review_status IN ('none', 'pending', 'approved', 'rejected'));

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE content_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_responses ENABLE ROW LEVEL SECURITY;

-- content_reviews: lectura para autenticados
CREATE POLICY "content_reviews_select" ON content_reviews
  FOR SELECT TO authenticated USING (true);

-- content_reviews: inserción solo por el solicitante
CREATE POLICY "content_reviews_insert" ON content_reviews
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());

-- content_reviews: update abierto (para cron y RPCs SECURITY DEFINER)
CREATE POLICY "content_reviews_update" ON content_reviews
  FOR UPDATE TO authenticated USING (true);

-- review_responses: lectura para autenticados
CREATE POLICY "review_responses_select" ON review_responses
  FOR SELECT TO authenticated USING (true);

-- review_responses: inserción abierta (creados por RPC SECURITY DEFINER)
CREATE POLICY "review_responses_insert" ON review_responses
  FOR INSERT TO authenticated WITH CHECK (true);

-- review_responses: update solo por el revisor
CREATE POLICY "review_responses_update" ON review_responses
  FOR UPDATE TO authenticated USING (reviewer_id = auth.uid());

-- =============================================
-- RPC: create_content_review
-- =============================================
CREATE OR REPLACE FUNCTION create_content_review(
  p_event_id INTEGER,
  p_attachment_url TEXT,
  p_attachment_type TEXT,
  p_timer_hours NUMERIC,
  p_reviewer_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_round INTEGER;
  v_review_id INTEGER;
  v_reviewer UUID;
BEGIN
  -- Calcular round_number
  SELECT COALESCE(MAX(round_number), 0) + 1
    INTO v_round
    FROM content_reviews
    WHERE event_id = p_event_id;

  -- Insertar la ronda de revisión
  INSERT INTO content_reviews (
    event_id, requested_by, attachment_url, attachment_type,
    timer_hours, expires_at, round_number
  ) VALUES (
    p_event_id, auth.uid(), p_attachment_url, p_attachment_type,
    p_timer_hours, now() + (p_timer_hours || ' hours')::INTERVAL, v_round
  )
  RETURNING id INTO v_review_id;

  -- Crear una fila por cada reviewer (sin decisión aún)
  FOREACH v_reviewer IN ARRAY p_reviewer_ids LOOP
    INSERT INTO review_responses (review_id, reviewer_id)
    VALUES (v_review_id, v_reviewer);
  END LOOP;

  -- Actualizar estado del evento
  UPDATE company_events
    SET review_status = 'pending'
    WHERE id = p_event_id;

  RETURN v_review_id;
END;
$$;

-- =============================================
-- RPC: submit_review_response
-- =============================================
CREATE OR REPLACE FUNCTION submit_review_response(
  p_review_id INTEGER,
  p_decision TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id INTEGER;
  v_all_responded BOOLEAN;
  v_any_rejected BOOLEAN;
BEGIN
  -- Validar: comentario obligatorio si rechaza
  IF p_decision = 'rejected' AND (p_comment IS NULL OR p_comment = '') THEN
    RAISE EXCEPTION 'Se requiere un comentario al rechazar';
  END IF;

  -- Actualizar la respuesta del reviewer actual
  UPDATE review_responses
    SET decision = p_decision,
        comment = p_comment,
        responded_at = now()
    WHERE review_id = p_review_id
      AND reviewer_id = auth.uid()
      AND decision IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró respuesta pendiente para este reviewer';
  END IF;

  -- Obtener event_id
  SELECT event_id INTO v_event_id
    FROM content_reviews WHERE id = p_review_id;

  -- Si rechazó → marcar review y evento como rejected inmediatamente
  IF p_decision = 'rejected' THEN
    UPDATE content_reviews
      SET status = 'rejected', resolved_at = now()
      WHERE id = p_review_id;

    UPDATE company_events
      SET review_status = 'rejected'
      WHERE id = v_event_id;

    RETURN 'rejected';
  END IF;

  -- Si aprobó → verificar si todos respondieron sin rechazos
  SELECT
    NOT EXISTS (SELECT 1 FROM review_responses WHERE review_id = p_review_id AND decision IS NULL),
    EXISTS (SELECT 1 FROM review_responses WHERE review_id = p_review_id AND decision = 'rejected')
  INTO v_all_responded, v_any_rejected;

  IF v_all_responded AND NOT v_any_rejected THEN
    UPDATE content_reviews
      SET status = 'approved', resolved_at = now()
      WHERE id = p_review_id;

    UPDATE company_events
      SET review_status = 'approved'
      WHERE id = v_event_id;

    RETURN 'all_approved';
  END IF;

  RETURN 'pending';
END;
$$;

-- =============================================
-- RPC: get_review_history
-- =============================================
CREATE OR REPLACE FUNCTION get_review_history(p_event_id INTEGER)
RETURNS TABLE (
  review_id INTEGER,
  round_number INTEGER,
  status TEXT,
  attachment_url TEXT,
  attachment_type TEXT,
  timer_hours NUMERIC,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  requested_by_email TEXT,
  responses JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id AS review_id,
    cr.round_number,
    cr.status,
    cr.attachment_url,
    cr.attachment_type,
    cr.timer_hours,
    cr.expires_at,
    cr.created_at,
    cr.resolved_at,
    (SELECT u.email::TEXT FROM auth.users u WHERE u.id = cr.requested_by) AS requested_by_email,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'reviewer_id', rr.reviewer_id,
          'reviewer_email', (SELECT u2.email::TEXT FROM auth.users u2 WHERE u2.id = rr.reviewer_id),
          'decision', rr.decision,
          'comment', rr.comment,
          'responded_at', rr.responded_at
        )
      ) FROM review_responses rr WHERE rr.review_id = cr.id),
      '[]'::jsonb
    ) AS responses
  FROM content_reviews cr
  WHERE cr.event_id = p_event_id
  ORDER BY cr.round_number DESC;
END;
$$;
