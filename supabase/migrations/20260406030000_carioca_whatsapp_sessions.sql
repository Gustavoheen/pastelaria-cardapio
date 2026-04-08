-- Sessões de conversa WhatsApp do bot
CREATE TABLE IF NOT EXISTS carioca_whatsapp_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telefone TEXT NOT NULL UNIQUE,
  nome_contato TEXT,
  estado TEXT NOT NULL DEFAULT 'novo',
  humano_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  bot_msg_ids TEXT[] DEFAULT '{}',
  ultimo_pedido_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carioca_wpp_telefone ON carioca_whatsapp_sessions(telefone);
CREATE INDEX IF NOT EXISTS idx_carioca_wpp_updated ON carioca_whatsapp_sessions(updated_at);

-- RLS
ALTER TABLE carioca_whatsapp_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "carioca_wpp_all" ON carioca_whatsapp_sessions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
