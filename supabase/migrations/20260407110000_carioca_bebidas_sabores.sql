-- Sabores dinâmicos por bebida
CREATE TABLE IF NOT EXISTS pastel.bebidas_sabores (
  bebida_id text PRIMARY KEY,
  sabores   jsonb NOT NULL DEFAULT '[]'
);

ALTER TABLE pastel.bebidas_sabores ENABLE ROW LEVEL SECURITY;
-- Sem acesso anônimo — leitura/escrita só via service key
