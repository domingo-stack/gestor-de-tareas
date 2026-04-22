-- ============================================================
-- Setup: tablas + RPC para bot RAG (migración desde proyecto aparte)
-- - pgvector para embeddings
-- - articulos_kb: base vectorial del RAG
-- - bot_analytics_log: eventos del bot
-- - chat_sessions: buffer/estado de conversaciones
-- - match_articulos_kb: búsqueda por similitud vectorial
-- ============================================================

-- 1. Habilitar extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla articulos_kb (base vectorial del RAG)
CREATE TABLE IF NOT EXISTS public.articulos_kb (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text,
    slug text,
    pais text,
    content text,
    content_ai text,
    embedding vector(1536),
    source_id text UNIQUE,
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articulos_kb_embedding_idx
ON public.articulos_kb
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS articulos_kb_pais_idx ON public.articulos_kb(pais);

-- 3. Tabla bot_analytics_log (eventos del bot)
CREATE TABLE IF NOT EXISTS public.bot_analytics_log (
    id bigserial PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    event_name text NOT NULL,
    conversation_id text,
    country text,
    tokens_used integer,
    processing_time_ms integer,
    messages_in_buffer integer,
    buffer_applied boolean,
    execution_id text
);

CREATE INDEX IF NOT EXISTS bot_analytics_created_idx ON public.bot_analytics_log(created_at DESC);
CREATE INDEX IF NOT EXISTS bot_analytics_event_idx ON public.bot_analytics_log(event_name);
CREATE INDEX IF NOT EXISTS bot_analytics_conv_idx ON public.bot_analytics_log(conversation_id);

-- 4. Tabla chat_sessions (buffer/estado de conversaciones)
-- PK corregida: solo conversation_id (antes era compuesta, estaba mal diseñada)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    conversation_id bigint PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    current_state text,
    chat_history jsonb,
    is_thinking boolean DEFAULT false,
    last_message_id text,
    country text,
    message_buffer jsonb DEFAULT '[]'::jsonb,
    buffer_timer_started_at timestamptz,
    processing_lock boolean DEFAULT false,
    lock_expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS chat_sessions_updated_idx ON public.chat_sessions(updated_at DESC);

-- 5. Función RPC match_articulos_kb (búsqueda por similitud vectorial)
CREATE OR REPLACE FUNCTION public.match_articulos_kb (
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.75,
    match_count int DEFAULT 5,
    filter_pais text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    title text,
    slug text,
    pais text,
    content text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.title,
        a.slug,
        a.pais,
        a.content,
        1 - (a.embedding <=> query_embedding) AS similarity
    FROM public.articulos_kb a
    WHERE
        (filter_pais IS NULL OR a.pais ILIKE '%' || filter_pais || '%')
        AND 1 - (a.embedding <=> query_embedding) > match_threshold
    ORDER BY a.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;
