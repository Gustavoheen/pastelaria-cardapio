-- ─────────────────────────────────────────────────────────
--  PASTELARIA DA FEIRA — Schema Supabase
--  Execute no SQL Editor do projeto Supabase (mesmo banco do Scooby)
-- ─────────────────────────────────────────────────────────

-- Tabela de pedidos
CREATE TABLE IF NOT EXISTS pastelaria_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero       text NOT NULL UNIQUE,
  nome         text NOT NULL,
  telefone     text NOT NULL,
  tipo_entrega text NOT NULL CHECK (tipo_entrega IN ('entrega', 'retirada')),
  endereco     text,
  pagamento    text NOT NULL CHECK (pagamento IN ('dinheiro', 'pix', 'cartao')),
  troco        numeric(10,2),
  itens        jsonb NOT NULL DEFAULT '[]',
  subtotal     numeric(10,2) NOT NULL DEFAULT 0,
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 0,
  total        numeric(10,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'recebido'
                 CHECK (status IN ('recebido','preparando','saindo','pronto','entregue')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Tabela de configuração da loja (apenas 1 linha — id=1)
CREATE TABLE IF NOT EXISTS pastelaria_store_state (
  id                  integer PRIMARY KEY DEFAULT 1,
  status              text NOT NULL DEFAULT 'auto'
                        CHECK (status IN ('auto', 'aberta', 'fechada')),
  horario_abertura    text NOT NULL DEFAULT '10:00',
  horario_fechamento  text NOT NULL DEFAULT '22:00',
  taxa_entrega        numeric(10,2) NOT NULL DEFAULT 5.00,
  whatsapp            text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Inserir configuração padrão
INSERT INTO pastelaria_store_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Índices úteis
CREATE INDEX IF NOT EXISTS pastelaria_orders_status_idx    ON pastelaria_orders (status);
CREATE INDEX IF NOT EXISTS pastelaria_orders_telefone_idx  ON pastelaria_orders (telefone);
CREATE INDEX IF NOT EXISTS pastelaria_orders_created_idx   ON pastelaria_orders (created_at DESC);

-- ─────────────────────────────────────────────────────────
--  Row Level Security
-- ─────────────────────────────────────────────────────────
ALTER TABLE pastelaria_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastelaria_store_state ENABLE ROW LEVEL SECURITY;

-- As APIs usam a SERVICE KEY (bypass RLS), então as policies
-- abaixo são para proteger contra acesso direto via anon key.

-- Nenhum acesso anônimo às tabelas — tudo via service key pela API
CREATE POLICY "no_anon_orders" ON pastelaria_orders
  FOR ALL TO anon USING (false);

CREATE POLICY "no_anon_store_state" ON pastelaria_store_state
  FOR ALL TO anon USING (false);
