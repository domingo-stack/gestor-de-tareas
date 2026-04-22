-- ============================================================
-- Comunicaciones: Auto-reply por campaña, Drip Campaigns, Opt-out
-- ============================================================

-- 1. Auto-reply por campaña
ALTER TABLE comm_broadcasts
  ADD COLUMN IF NOT EXISTS auto_reply_message TEXT;

-- 2. Revenue attribution columns on broadcasts
ALTER TABLE comm_broadcasts
  ADD COLUMN IF NOT EXISTS pagos_atribuidos INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_atribuido NUMERIC(12,2) DEFAULT 0;

-- 3. Sequence columns on broadcasts
ALTER TABLE comm_broadcasts
  ADD COLUMN IF NOT EXISTS is_sequence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS drip_campaign_id UUID;

-- 4. Drip Campaigns
CREATE TABLE IF NOT EXISTS comm_drip_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  segmento_filtros JSONB,
  estado TEXT NOT NULL DEFAULT 'borrador', -- borrador | activa | pausada | completada
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comm_drip_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drip_campaign_id UUID NOT NULL REFERENCES comm_drip_campaigns(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  template_id UUID REFERENCES comm_templates(id),
  delay_days INTEGER NOT NULL DEFAULT 0,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  send_at_hour INTEGER NOT NULL DEFAULT 9, -- hora UTC-5 para enviar
  broadcast_id INTEGER, -- se llena al ejecutar
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | enviado | cancelado
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comm_drip_optouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drip_campaign_id UUID NOT NULL REFERENCES comm_drip_campaigns(id) ON DELETE CASCADE,
  contact_id UUID,
  phone TEXT NOT NULL,
  opted_out_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT, -- button_click | keyword_stop | manual
  UNIQUE(drip_campaign_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_drip_optouts_phone ON comm_drip_optouts(phone);
CREATE INDEX IF NOT EXISTS idx_drip_steps_campaign ON comm_drip_steps(drip_campaign_id, step_order);

-- 3. Insert default opt-out keywords if not exists
INSERT INTO comm_variables (key, value, descripcion)
VALUES ('optout_keywords', 'STOP,NO,PARAR,NO ME INTERESA,DETENER,CANCELAR,SALIR,PARA,BASTA,NO QUIERO,DESUSCRIBIR', 'Keywords de opt-out para drip campaigns (separadas por coma)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO comm_variables (key, value, descripcion)
VALUES ('attribution_window_days', '3', 'Ventana de atribución de pagos en días (default 3)')
ON CONFLICT (key) DO NOTHING;

-- 4. RLS for drip tables (same pattern as other comm_ tables)
ALTER TABLE comm_drip_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_drip_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_drip_optouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drip_campaigns_auth_select" ON comm_drip_campaigns FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "drip_campaigns_auth_insert" ON comm_drip_campaigns FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "drip_campaigns_auth_update" ON comm_drip_campaigns FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "drip_campaigns_auth_delete" ON comm_drip_campaigns FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "drip_steps_auth_select" ON comm_drip_steps FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "drip_steps_auth_insert" ON comm_drip_steps FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "drip_steps_auth_update" ON comm_drip_steps FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "drip_steps_auth_delete" ON comm_drip_steps FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "drip_optouts_auth_select" ON comm_drip_optouts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "drip_optouts_auth_insert" ON comm_drip_optouts FOR INSERT WITH CHECK (true); -- webhooks insert via service role
CREATE POLICY "drip_optouts_auth_update" ON comm_drip_optouts FOR UPDATE USING (auth.role() = 'authenticated');
